import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser environment shims before importing store
const storageMap = new Map();
globalThis.sessionStorage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

globalThis.window = {
  location: {
    search: '?q=auth&priority=high&assignee=Rahul',
    pathname: '/',
  },
  history: {
    replaceState: () => {},
  },
};

const { computeNewPosition } = await import('../.test-dist/utils/positioning.js');
const {
  useBoardStore,
  selectEffectiveTasks,
  selectFilteredTasksByColumn,
  getInitialFiltersFromUrl,
} = await import('../.test-dist/store/useBoardStore.js');

const baseTask = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Implement auth',
  description: 'OAuth flow',
  priority: 'high',
  assignee: 'Rahul',
  status: 'Todo',
  position: 1000,
  updatedAt: '2026-11-25T10:00:00.000Z',
  version: 1,
  ...overrides,
});

describe('Client Positioning, Filters, Optimistic Rollback & Conflict Guardrails', () => {
  beforeEach(() => {
    storageMap.clear();
    storageMap.set('kanban_client_id', 'tab-local');
    useBoardStore.setState({
      confirmedTasks: {},
      pendingMutations: {},
      activeDragTaskId: null,
      dragFreeze: null,
      selectedTaskId: null,
      connectionStatus: 'connected',
      isLoading: false,
      hasLoadedOnce: true,
      error: null,
      searchQuery: '',
      priorityFilter: '',
      assigneeFilter: '',
    });
  });

  it('computeNewPosition calculates empty, top, non-positive top, bottom, and midpoint positions', () => {
    assert.equal(computeNewPosition(null, null), 1000);
    assert.equal(computeNewPosition(null, baseTask({ position: 1000 })), 500);
    assert.equal(computeNewPosition(null, baseTask({ position: 0 })), -1000);
    assert.equal(computeNewPosition(null, baseTask({ position: -500 })), -1500);
    assert.equal(computeNewPosition(baseTask({ position: 2000 }), null), 3000);
    assert.equal(
      computeNewPosition(baseTask({ position: 1000 }), baseTask({ position: 2000 })),
      1500
    );
  });

  it('getInitialFiltersFromUrl restores valid query params and ignores invalid priority', () => {
    globalThis.window.location.search = '?q=auth&priority=high&assignee=Rahul';
    assert.deepEqual(getInitialFiltersFromUrl(), {
      searchQuery: 'auth',
      priorityFilter: 'high',
      assigneeFilter: 'Rahul',
    });

    globalThis.window.location.search = '?q=bug&priority=bogus';
    assert.deepEqual(getInitialFiltersFromUrl(), {
      searchQuery: 'bug',
      priorityFilter: '',
      assigneeFilter: '',
    });
  });

  it('selectFilteredTasksByColumn combines search, priority, and assignee filters and sorts deterministically', () => {
    const t1 = baseTask({ id: 'b', title: 'Auth bug', priority: 'high', assignee: 'Rahul', status: 'Todo', position: 2000 });
    const t2 = baseTask({ id: 'a', title: 'Auth service', priority: 'high', assignee: 'Rahul', status: 'Todo', position: 1000 });
    const t3 = baseTask({ id: 'c', title: 'Auth UI', priority: 'low', assignee: 'Rahul', status: 'Todo', position: 500 });
    const t4 = baseTask({ id: 'd', title: 'Auth docs', priority: 'high', assignee: 'Priya', status: 'Todo', position: 300 });

    useBoardStore.setState({
      confirmedTasks: { [t1.id]: t1, [t2.id]: t2, [t3.id]: t3, [t4.id]: t4 },
      searchQuery: 'auth',
      priorityFilter: 'high',
      assigneeFilter: 'Rahul',
    });

    const visible = selectFilteredTasksByColumn(useBoardStore.getState(), 'Todo');
    assert.deepEqual(
      visible.map((t) => t.id),
      ['a', 'b']
    );
  });

  it('optimistic rollback drops only failed local patch while preserving concurrent SSE title edit', async () => {
    const task = baseTask({ id: 'task-1', title: 'Original Title', status: 'Backlog', position: 1000, version: 1 });
    useBoardStore.setState({ confirmedTasks: { 'task-1': task } });

    let resolveFetch;
    globalThis.fetch = () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      });

    // User A starts an optimistic drag to Done
    const dragPromise = useBoardStore.getState().updateTask('task-1', {
      status: 'Done',
      position: 2000,
    });

    // Immediately reflects optimistic status in derived state
    let eff = selectEffectiveTasks(useBoardStore.getState());
    assert.equal(eff[0].status, 'Done');
    assert.equal(eff[0].position, 2000);
    assert.equal(eff[0].title, 'Original Title');

    // While drag is in flight, User B edits title via SSE
    useBoardStore.getState().applySSEEvent({
      type: 'task:updated',
      eventId: 'ev-1',
      originClientId: 'tab-remote',
      task: { ...task, title: 'Updated by User B', version: 2 },
      changedFields: ['title'],
    });

    // During in-flight drag: BOTH User A's status/position AND User B's title appear together!
    eff = selectEffectiveTasks(useBoardStore.getState());
    assert.equal(eff[0].status, 'Done');
    assert.equal(eff[0].title, 'Updated by User B');

    // Now API fails with 503
    resolveFetch({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({ error: 'Simulated transient server error' }),
    });

    const ok = await dragPromise;
    assert.equal(ok, false);

    // Rolled back ONLY User A's drag -> back in Backlog, WITH User B's updated title intact!
    eff = selectEffectiveTasks(useBoardStore.getState());
    assert.equal(eff[0].status, 'Backlog');
    assert.equal(eff[0].position, 1000);
    assert.equal(eff[0].title, 'Updated by User B');
  });

  it('applySSEEvent enforces echo suppression and version monotonicity', () => {
    const task = baseTask({ id: 'task-1', title: 'V2 Title', version: 2 });
    useBoardStore.setState({ confirmedTasks: { 'task-1': task } });

    // 1. Echo suppression (same clientId -> ignored even if higher version)
    useBoardStore.getState().applySSEEvent({
      type: 'task:updated',
      eventId: 'ev-echo',
      originClientId: 'tab-local',
      task: { ...task, title: 'Echo Should Be Ignored', version: 3 },
      changedFields: ['title'],
    });
    assert.equal(useBoardStore.getState().confirmedTasks['task-1'].title, 'V2 Title');

    // 2. Stale event (older version -> ignored)
    useBoardStore.getState().applySSEEvent({
      type: 'task:updated',
      eventId: 'ev-stale',
      originClientId: 'tab-remote',
      task: { ...task, title: 'Stale V1', version: 1 },
      changedFields: ['title'],
    });
    assert.equal(useBoardStore.getState().confirmedTasks['task-1'].title, 'V2 Title');

    // 3. Newer remote event -> applied
    useBoardStore.getState().applySSEEvent({
      type: 'task:updated',
      eventId: 'ev-new',
      originClientId: 'tab-remote',
      task: { ...task, title: 'Fresh V3', version: 3 },
      changedFields: ['title'],
    });
    assert.equal(useBoardStore.getState().confirmedTasks['task-1'].title, 'Fresh V3');
  });

  it('dragFreeze pins dragged card slot mid-drag while accepting remote title updates', () => {
    const task = baseTask({ id: 'task-1', title: 'Initial', status: 'Todo', position: 1000, version: 1 });
    useBoardStore.setState({ confirmedTasks: { 'task-1': task } });

    useBoardStore.getState().setActiveDragTaskId('task-1');

    // Remote user moves task-1 to Done and renames it mid-drag
    useBoardStore.getState().applySSEEvent({
      type: 'task:updated',
      eventId: 'ev-drag-conflict',
      originClientId: 'tab-remote',
      task: { ...task, title: 'Renamed Remotely', status: 'Done', position: 5000, version: 2 },
      changedFields: ['title', 'status', 'position'],
    });

    // While dragging, visual slot stays pinned in Todo@1000, while title reflects remote update
    let eff = selectEffectiveTasks(useBoardStore.getState());
    assert.equal(eff[0].status, 'Todo');
    assert.equal(eff[0].position, 1000);
    assert.equal(eff[0].title, 'Renamed Remotely');

    // Releasing drag unfreezes
    useBoardStore.getState().setActiveDragTaskId(null);
    eff = selectEffectiveTasks(useBoardStore.getState());
    assert.equal(eff[0].status, 'Done');
    assert.equal(eff[0].position, 5000);
  });
});
