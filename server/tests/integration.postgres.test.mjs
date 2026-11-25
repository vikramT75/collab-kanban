import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run PostgreSQL integration tests');
}

process.env.PORT = process.env.PORT || '4100';
process.env.FAILURE_RATE = '0';

const { pool } = await import('../dist/server/src/db/pool.js');
const { runMigration } = await import('../dist/server/src/db/migrate.js');
const { runSeed } = await import('../dist/server/src/db/seed.js');
const { startListening, closeAllClients } = await import('../dist/server/src/services/sseHub.js');
const { createApp } = await import('../dist/server/src/app.js');

describe('PostgreSQL + SSE End-to-End Integration', () => {
  let server;
  let baseUrl;
  let sseController;
  let sseReader;
  let sseBuffer = '';
  const decoder = new TextDecoder();
  const collectedEvents = [];

  async function waitForSseEvent(predicate, timeoutMs = 5000) {
    const existing = collectedEvents.find(predicate);
    if (existing) return existing;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now());
      const result = await Promise.race([
        sseReader.read(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for SSE event. Collected: ${JSON.stringify(collectedEvents)}`
                )
              ),
            remaining
          )
        ),
      ]);

      if (result.done) break;
      sseBuffer += decoder.decode(result.value, { stream: true });

      const frames = sseBuffer.split('\n\n');
      sseBuffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (line.startsWith('data: ')) {
            collectedEvents.push(JSON.parse(line.slice(6)));
          }
        }
      }

      const match = collectedEvents.find(predicate);
      if (match) return match;
    }

    throw new Error(
      `Expected SSE event not received within ${timeoutMs}ms. Collected: ${JSON.stringify(collectedEvents)}`
    );
  }

  before(async () => {
    await runMigration();
    await pool.query('TRUNCATE TABLE tasks');
    await runSeed();
    // Verify idempotent second seed run
    await runSeed();

    await startListening();
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Open persistent SSE stream
    sseController = new AbortController();
    const res = await fetch(`${baseUrl}/api/events`, { signal: sseController.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    sseReader = res.body.getReader();

    // Read initial ": connected" comment frame
    const first = await sseReader.read();
    const firstText = decoder.decode(first.value, { stream: true });
    assert.match(firstText, /: connected/);
    const firstBoundary = firstText.indexOf('\n\n');
    if (firstBoundary !== -1) {
      sseBuffer = firstText.slice(firstBoundary + 2);
    }
  });

  after(async () => {
    sseController?.abort();
    await closeAllClients();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  it('health endpoint confirms live PostgreSQL connectivity and seed inserted 10 tasks', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.db, 'connected');

    const boardRes = await fetch(`${baseUrl}/api/board`);
    assert.equal(boardRes.status, 200);
    const board = await boardRes.json();
    assert.deepEqual(board.columns, ['Backlog', 'Todo', 'In Progress', 'Done']);
    assert.equal(board.tasks.length, 10);
    for (const t of board.tasks) {
      assert.equal('version' in t, false);
    }
  });

  it('creates, updates, rebalances via real pg_notify -> SSE, handles chaos 503, and deletes', async () => {
    // 1. Create task and wait for task:created over real PG LISTEN/NOTIFY -> SSE
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'integ-tab-1' },
      body: JSON.stringify({
        title: 'Integration Real PG Task',
        description: 'Testing real Postgres + SSE',
        priority: 'high',
        assignee: 'Vikram',
        status: 'Backlog',
      }),
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.headers.get('x-task-version'), '1');
    const created = await createRes.json();
    assert.equal(created.position, 4000);

    const createdEvt = await waitForSseEvent(
      (e) => e.type === 'task:created' && e.task.id === created.id
    );
    assert.equal(createdEvt.originClientId, 'integ-tab-1');
    assert.equal(createdEvt.task.version, 1);

    // 2. Move status without explicit position -> placed at bottom of Done (seed has 1000, 2000 -> expects 3000)
    const moveRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'integ-tab-2' },
      body: JSON.stringify({ status: 'Done' }),
    });
    assert.equal(moveRes.status, 200);
    assert.equal(moveRes.headers.get('x-task-version'), '2');
    const moved = await moveRes.json();
    assert.equal(moved.status, 'Done');
    assert.equal(moved.position, 3000);

    await waitForSseEvent(
      (e) => e.type === 'task:updated' && e.task.id === created.id && e.task.version === 2
    );

    // 3. Chaos 503 does NOT mutate Postgres row
    const chaosRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'integ-tab-2',
        'X-Simulate-Error': 'true',
      },
      body: JSON.stringify({ title: 'Should Rollback' }),
    });
    assert.equal(chaosRes.status, 503);

    const boardAfterChaos = await (await fetch(`${baseUrl}/api/board`)).json();
    const stillUnchanged = boardAfterChaos.tasks.find((t) => t.id === created.id);
    assert.equal(stillUnchanged.title, 'Integration Real PG Task');

    // 4. Tight fractional gap (< 0.001) triggers real SQL rebalanceColumn and emits task:updated + board:rebalanced
    const tightRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'integ-tab-1' },
      body: JSON.stringify({ position: 1000.0005 }),
    });
    assert.equal(tightRes.status, 200);
    const rebalancedTask = await tightRes.json();
    // Done had [1000, 2000] + created at 1000.0005 -> rebalanced to 1000, 2000, 3000 so created is 2000!
    assert.equal(rebalancedTask.position, 2000);

    await waitForSseEvent(
      (e) =>
        e.type === 'board:rebalanced' &&
        e.status === 'Done' &&
        e.positions.some((p) => p.id === created.id && p.position === 2000)
    );

    // 5. Delete task and confirm task:deleted event + 404 thereafter
    const delRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'DELETE',
      headers: { 'X-Client-Id': 'integ-tab-1' },
    });
    assert.equal(delRes.status, 200);
    assert.deepEqual(await delRes.json(), { id: created.id });

    await waitForSseEvent(
      (e) => e.type === 'task:deleted' && e.taskId === created.id
    );

    const notFoundRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'DELETE',
    });
    assert.equal(notFoundRes.status, 404);
  });
});
