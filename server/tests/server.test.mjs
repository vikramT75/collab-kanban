import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://kanban:test@localhost:5432/kanban';
process.env.PORT = '4000';
process.env.FAILURE_RATE = '0';

const { pool } = await import('../dist/server/src/db/pool.js');
const { createApp } = await import('../dist/server/src/app.js');

function startTestServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('Kanban Server API & Services', () => {
  let server;
  let baseUrl;
  let restores = [];

  beforeEach(async () => {
    const started = await startTestServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    for (const r of restores) r.mock.restore();
    restores = [];
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/board returns 4 ordered columns and tasks without internal version field', async () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    restores.push(
      mock.method(pool, 'query', async () => ({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Task One',
            description: 'Desc',
            priority: 'high',
            assignee: 'Rahul',
            status: 'Todo',
            position: 1000,
            version: 4,
            updated_at: now,
          },
        ],
      }))
    );

    const res = await fetch(`${baseUrl}/api/board`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.columns, ['Backlog', 'Todo', 'In Progress', 'Done']);
    assert.equal(body.tasks.length, 1);
    assert.equal(body.tasks[0].title, 'Task One');
    assert.equal(body.tasks[0].updatedAt, '2026-11-25T10:00:00.000Z');
    assert.equal('version' in body.tasks[0], false);
  });

  it('POST /api/tasks rejects whitespace-only title with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'tab-1' },
      body: JSON.stringify({ title: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation error');
  });

  it('POST /api/tasks returns 503 when X-Simulate-Error is true', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'tab-1',
        'X-Simulate-Error': 'true',
      },
      body: JSON.stringify({ title: 'Should fail' }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'simulated server error');
  });

  it('POST /api/tasks creates task, sets X-Task-Version header, strips version from JSON, and calls pg_notify', async () => {
    const notifications = [];
    const now = new Date('2026-11-25T10:01:00.000Z');

    const fakeClient = {
      query: async (sql, params) => {
        if (sql.startsWith('SELECT COALESCE(MAX(position)')) {
          return { rows: [{ max_pos: 2000 }] };
        }
        if (sql.startsWith('INSERT INTO tasks')) {
          return {
            rows: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                title: params[0],
                description: params[1],
                priority: params[2],
                assignee: params[3],
                status: params[4],
                position: params[5],
                version: 1,
                updated_at: now,
              },
            ],
          };
        }
        if (sql.startsWith('SELECT pg_notify')) {
          notifications.push(JSON.parse(params[1]));
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'tab-a' },
      body: JSON.stringify({ title: '  New Task  ', status: 'Todo', priority: 'high' }),
    });

    assert.equal(res.status, 201);
    assert.equal(res.headers.get('x-task-version'), '1');
    const body = await res.json();
    assert.equal(body.title, 'New Task');
    assert.equal(body.position, 3000);
    assert.equal('version' in body, false);

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'task:created');
    assert.equal(notifications[0].originClientId, 'tab-a');
    assert.equal(notifications[0].task.version, 1);
  });

  it('PATCH /api/tasks/:id validates UUID format with 400 and missing row with 404', async () => {
    const badRes = await fetch(`${baseUrl}/api/tasks/not-a-uuid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    assert.equal(badRes.status, 400);

    const fakeClient = {
      query: async (sql) => {
        if (sql.startsWith('SELECT * FROM tasks WHERE id')) return { rows: [] };
        return { rows: [] };
      },
      release: () => {},
    };
    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const missingRes = await fetch(`${baseUrl}/api/tasks/33333333-3333-4333-8333-333333333333`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    assert.equal(missingRes.status, 404);
  });

  it('PATCH /api/tasks/:id emits task:updated BEFORE board:rebalanced in ascending version order when gap < 0.001', async () => {
    const taskId = '44444444-4444-4444-8444-444444444444';
    const otherId = '55555555-5555-4555-8555-555555555555';
    const now = new Date('2026-11-25T10:02:00.000Z');
    const notifications = [];

    const initialRow = {
      id: taskId,
      title: 'Card A',
      description: '',
      priority: 'medium',
      assignee: 'Rahul',
      status: 'Backlog',
      position: 1000,
      version: 1,
      updated_at: now,
    };

    const updatedRow = {
      ...initialRow,
      status: 'Todo',
      position: 1000.0005,
      version: 2,
    };

    const rebalancedRow = {
      ...updatedRow,
      position: 2000,
      version: 3,
    };

    let rebalanced = false;
    const fakeClient = {
      query: async (sql, params) => {
        if (sql.includes('FOR UPDATE')) return { rows: [initialRow] };
        if (sql.startsWith('UPDATE tasks SET status')) return { rows: [updatedRow] };
        if (sql.startsWith('SELECT position FROM tasks')) {
          return { rows: [{ position: 1000 }] };
        }
        if (sql.startsWith('SELECT id FROM tasks WHERE status')) {
          return { rows: [{ id: otherId }, { id: taskId }] };
        }
        if (sql.startsWith('UPDATE tasks SET position = $1, version = version + 1')) {
          rebalanced = true;
          return { rows: [{ id: params[1], version: params[1] === taskId ? 3 : 2 }] };
        }
        if (sql.startsWith('SELECT * FROM tasks WHERE id = $1')) {
          return { rows: [rebalanced ? rebalancedRow : updatedRow] };
        }
        if (sql.startsWith('SELECT pg_notify')) {
          notifications.push(JSON.parse(params[1]));
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'tab-1' },
      body: JSON.stringify({ status: 'Todo', position: 1000.0005 }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-task-version'), '3');
    const body = await res.json();
    assert.equal(body.status, 'Todo');
    assert.equal(body.position, 2000);

    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].type, 'task:updated');
    assert.equal(notifications[0].task.version, 2);
    assert.equal(notifications[1].type, 'board:rebalanced');
    assert.equal(notifications[1].positions.find((p) => p.id === taskId).version, 3);
  });

  it('DELETE /api/tasks/:id emits task:deleted and returns id', async () => {
    const taskId = '66666666-6666-4666-8666-666666666666';
    const notifications = [];

    const fakeClient = {
      query: async (sql, params) => {
        if (sql.startsWith('DELETE FROM tasks')) return { rows: [{ id: taskId }] };
        if (sql.startsWith('SELECT pg_notify')) {
          notifications.push(JSON.parse(params[1]));
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };
    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'X-Client-Id': 'tab-del' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: taskId });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'task:deleted');
    assert.equal(notifications[0].originClientId, 'tab-del');
    assert.equal(notifications[0].taskId, taskId);
  });

  it('PATCH /api/tasks/:id triggers rebalance on exact duplicate position (gap === 0)', async () => {
    const taskId = '77777777-7777-4777-8777-777777777777';
    const otherId = '88888888-8888-4888-8888-888888888888';
    const now = new Date('2026-11-25T10:03:00.000Z');
    const notifications = [];

    const initialRow = {
      id: taskId,
      title: 'Card Dup',
      description: '',
      priority: 'low',
      assignee: '',
      status: 'Todo',
      position: 2000,
      version: 1,
      updated_at: now,
    };
    const updatedRow = { ...initialRow, position: 1000, version: 2 };
    const rebalancedRow = { ...updatedRow, position: 2000, version: 3 };
    let rebalanced = false;

    const fakeClient = {
      query: async (sql, params) => {
        if (sql.includes('FOR UPDATE')) return { rows: [initialRow] };
        if (sql.startsWith('UPDATE tasks SET position = $1, updated_at') || sql.startsWith('UPDATE tasks SET position = $1, version = version + 1, updated_at')) {
          return { rows: [updatedRow] };
        }
        if (sql.startsWith('SELECT position FROM tasks')) {
          return { rows: [{ position: 1000 }] };
        }
        if (sql.startsWith('SELECT id FROM tasks WHERE status')) {
          return { rows: [{ id: otherId }, { id: taskId }] };
        }
        if (sql.startsWith('UPDATE tasks SET position = $1, version = version + 1 WHERE id')) {
          rebalanced = true;
          return { rows: [{ id: params[1], version: params[1] === taskId ? 3 : 2 }] };
        }
        if (sql.startsWith('SELECT * FROM tasks WHERE id = $1')) {
          return { rows: [rebalanced ? rebalancedRow : updatedRow] };
        }
        if (sql.startsWith('SELECT pg_notify')) {
          notifications.push(JSON.parse(params[1]));
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    };

    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'tab-dup' },
      body: JSON.stringify({ position: 1000 }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.position, 2000);
    assert.equal(notifications.some((n) => n.type === 'board:rebalanced'), true);
  });

  it('PATCH /api/tasks/:id moving status without position places task at bottom of target column', async () => {
    const taskId = '99999999-9999-4999-8999-999999999999';
    const now = new Date('2026-11-25T10:04:00.000Z');
    let insertedParams = null;

    const initialRow = {
      id: taskId,
      title: 'Move via dropdown',
      description: '',
      priority: 'medium',
      assignee: 'Priya',
      status: 'Backlog',
      position: 1000,
      version: 1,
      updated_at: now,
    };

    const fakeClient = {
      query: async (sql, params) => {
        if (sql.includes('FOR UPDATE')) return { rows: [initialRow] };
        if (sql.startsWith('SELECT COALESCE(MAX(position)')) return { rows: [{ max_pos: 3000 }] };
        if (sql.startsWith('UPDATE tasks SET status')) {
          insertedParams = params;
          return { rows: [{ ...initialRow, status: 'Done', position: 4000, version: 2 }] };
        }
        if (sql.startsWith('SELECT position FROM tasks')) return { rows: [{ position: 3000 }] };
        return { rows: [] };
      },
      release: () => {},
    };

    restores.push(mock.method(pool, 'connect', async () => fakeClient));

    const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'tab-drop' },
      body: JSON.stringify({ status: 'Done' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'Done');
    assert.equal(body.position, 4000);
    assert.deepEqual(insertedParams.slice(0, 2), ['Done', 4000]);
  });

  it('GET /api/events opens SSE stream with unbuffered headers and sends initial comment', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(res.headers.get('x-accel-buffering'), 'no');

    const reader = res.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    assert.match(text, /: connected/);
    controller.abort();
  });
});
