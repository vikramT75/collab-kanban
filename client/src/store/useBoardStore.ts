import { create } from 'zustand';
import { toast } from 'sonner';
import { Task, TaskWithVersion, BoardEvent, ColumnStatus, Priority } from '../types';
import { api } from '../api/client';
import { getClientId, randomId } from '../utils/clientId';

export type PendingMutation =
  | { kind: 'create'; tempId: string; task: Task; startedAt: number }
  | { kind: 'update'; taskId: string; patch: Partial<Task>; mutationId: string; startedAt: number }
  | { kind: 'delete'; taskId: string; mutationId: string; startedAt: number };

interface DragFreeze {
  id: string;
  status: ColumnStatus;
  position: number;
}

interface BoardState {
  confirmedTasks: Record<string, TaskWithVersion>;
  pendingMutations: Record<string, PendingMutation[]>;
  activeDragTaskId: string | null;
  dragFreeze: DragFreeze | null;
  selectedTaskId: string | null;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting';
  isLoading: boolean;
  hasLoadedOnce: boolean;
  error: string | null;
  searchQuery: string;
  priorityFilter: Priority | '';
  assigneeFilter: string;
}

interface BoardActions {
  loadBoard: (silent?: boolean) => Promise<void>;
  createTask: (input: Partial<Task>) => Promise<boolean>;
  updateTask: (taskId: string, patch: Partial<Task>) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  applySSEEvent: (event: BoardEvent) => void;
  setActiveDragTaskId: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'reconnecting') => void;
  setFilters: (filters: {
    searchQuery?: string;
    priorityFilter?: Priority | '';
    assigneeFilter?: string;
  }) => void;
  clearFilters: () => void;
}

export type BoardStore = BoardState & BoardActions;

function parsePriorityParam(val: string | null): Priority | '' {
  if (val === 'low' || val === 'medium' || val === 'high') return val;
  return '';
}

export function getInitialFiltersFromUrl(): {
  searchQuery: string;
  priorityFilter: Priority | '';
  assigneeFilter: string;
} {
  if (typeof window === 'undefined') {
    return { searchQuery: '', priorityFilter: '', assigneeFilter: '' };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    searchQuery: params.get('q') ?? '',
    priorityFilter: parsePriorityParam(params.get('priority')),
    assigneeFilter: params.get('assignee') ?? '',
  };
}

const initialFilters = getInitialFiltersFromUrl();

export const useBoardStore = create<BoardStore>()((set, get) => ({
  confirmedTasks: {},
  pendingMutations: {},
  activeDragTaskId: null,
  dragFreeze: null,
  selectedTaskId: null,
  connectionStatus: 'connecting',
  isLoading: false,
  hasLoadedOnce: false,
  error: null,
  searchQuery: initialFilters.searchQuery,
  priorityFilter: initialFilters.priorityFilter,
  assigneeFilter: initialFilters.assigneeFilter,

  loadBoard: async (silent = false) => {
    const shouldShowLoader = !silent && !get().hasLoadedOnce;
    if (shouldShowLoader) {
      set({ isLoading: true, error: null });
    }
    try {
      const data = await api.getBoard();
      set((state) => {
        const confirmed: Record<string, TaskWithVersion> = {};
        for (const t of data.tasks) {
          const existing = state.confirmedTasks[t.id];
          const preservedVersion =
            existing && existing.updatedAt === t.updatedAt ? existing.version : 0;
          confirmed[t.id] = { ...t, version: preservedVersion };
        }
        return {
          confirmedTasks: confirmed,
          isLoading: false,
          hasLoadedOnce: true,
          error: null,
        };
      });
    } catch (err: any) {
      if (!silent) {
        set({ isLoading: false, error: err?.message ?? 'Failed to load board' });
      }
    }
  },

  createTask: async (input) => {
    const tempId = `temp_${randomId()}`;
    const targetStatus: ColumnStatus = input.status ?? 'Backlog';
    const existingInColumn = selectEffectiveTasks(get()).filter(
      (t) => t.status === targetStatus
    );
    const maxPos = existingInColumn.reduce(
      (max, t) => Math.max(max, t.position),
      0
    );

    const optimistic: Task = {
      id: tempId,
      title: input.title?.trim() || 'Untitled Task',
      description: input.description ?? '',
      priority: input.priority ?? 'medium',
      assignee: input.assignee?.trim() ?? '',
      status: targetStatus,
      position: input.position ?? maxPos + 1000,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      pendingMutations: {
        ...state.pendingMutations,
        [tempId]: [{ kind: 'create', tempId, task: optimistic, startedAt: Date.now() }],
      },
    }));

    try {
      const { task: created, version } = await api.createTask(input);
      set((state) => {
        const { [tempId]: _removed, ...rest } = state.pendingMutations;
        return {
          confirmedTasks: {
            ...state.confirmedTasks,
            [created.id]: { ...created, version: version ?? 1 },
          },
          pendingMutations: rest,
        };
      });
      return true;
    } catch (err: any) {
      set((state) => {
        const { [tempId]: _removed, ...rest } = state.pendingMutations;
        return { pendingMutations: rest };
      });
      toast.error(`Failed to create "${optimistic.title}": ${err?.message ?? 'Server error'}`);
      return false;
    }
  },

  updateTask: async (taskId, patch) => {
    const mutationId = `mut_${randomId()}`;
    const currentTask = selectEffectiveTasks(get()).find((t) => t.id === taskId);
    const label = currentTask?.title ?? 'task';

    set((state) => ({
      pendingMutations: {
        ...state.pendingMutations,
        [taskId]: [
          ...(state.pendingMutations[taskId] ?? []),
          { kind: 'update', taskId, patch, mutationId, startedAt: Date.now() },
        ],
      },
    }));

    try {
      const { task: updated, version } = await api.updateTask(taskId, patch);
      set((state) => {
        const prev = state.confirmedTasks[taskId];
        const nextVersion = version ?? (prev ? prev.version + 1 : 1);
        const remaining = (state.pendingMutations[taskId] ?? []).filter((m) =>
          m.kind === 'update' ? m.mutationId !== mutationId : true
        );
        const nextPending = { ...state.pendingMutations };
        if (remaining.length === 0) {
          delete nextPending[taskId];
        } else {
          nextPending[taskId] = remaining;
        }
        return {
          confirmedTasks: {
            ...state.confirmedTasks,
            [taskId]: { ...updated, version: nextVersion },
          },
          pendingMutations: nextPending,
        };
      });
      return true;
    } catch (err: any) {
      set((state) => {
        const remaining = (state.pendingMutations[taskId] ?? []).filter((m) =>
          m.kind === 'update' ? m.mutationId !== mutationId : true
        );
        const nextPending = { ...state.pendingMutations };
        if (remaining.length === 0) {
          delete nextPending[taskId];
        } else {
          nextPending[taskId] = remaining;
        }
        return { pendingMutations: nextPending };
      });
      toast.error(`Failed to update "${label}". Changes reverted. (${err?.message ?? 'Server error'})`);
      return false;
    }
  },

  deleteTask: async (taskId) => {
    const mutationId = `del_${randomId()}`;
    const currentTask = selectEffectiveTasks(get()).find((t) => t.id === taskId);
    const label = currentTask?.title ?? 'task';

    set((state) => ({
      pendingMutations: {
        ...state.pendingMutations,
        [taskId]: [
          ...(state.pendingMutations[taskId] ?? []),
          { kind: 'delete', taskId, mutationId, startedAt: Date.now() },
        ],
      },
    }));

    try {
      await api.deleteTask(taskId);
      set((state) => {
        const { [taskId]: _removedTask, ...restTasks } = state.confirmedTasks;
        const { [taskId]: _removedMut, ...restMuts } = state.pendingMutations;
        return {
          confirmedTasks: restTasks,
          pendingMutations: restMuts,
          selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
        };
      });
      return true;
    } catch (err: any) {
      set((state) => {
        const remaining = (state.pendingMutations[taskId] ?? []).filter((m) =>
          m.kind === 'delete' ? m.mutationId !== mutationId : true
        );
        const nextPending = { ...state.pendingMutations };
        if (remaining.length === 0) {
          delete nextPending[taskId];
        } else {
          nextPending[taskId] = remaining;
        }
        return { pendingMutations: nextPending };
      });
      toast.error(`Failed to delete "${label}". Restored. (${err?.message ?? 'Server error'})`);
      return false;
    }
  },

  applySSEEvent: (event) => {
    // Guardrail 1: Echo Suppression — ignore events emitted by this tab
    if (event.originClientId === getClientId()) return;

    if (event.type === 'task:created') {
      set((state) => {
        const existing = state.confirmedTasks[event.task.id];
        if (existing && existing.version >= event.task.version) return state;
        return {
          confirmedTasks: { ...state.confirmedTasks, [event.task.id]: event.task },
        };
      });
      return;
    }

    if (event.type === 'task:deleted') {
      set((state) => {
        if (!state.confirmedTasks[event.taskId]) return state;
        const { [event.taskId]: _removed, ...rest } = state.confirmedTasks;
        // Intentionally preserve selectedTaskId so open TaskDrawer shows deletion banner
        return { confirmedTasks: rest };
      });
      return;
    }

    if (event.type === 'task:updated') {
      set((state) => {
        const current = state.confirmedTasks[event.task.id];
        // Guardrail 2: Version monotonicity (+ updatedAt fallback right after initial GET /api/board)
        if (current) {
          if (current.version > 0 && event.task.version <= current.version) {
            return state;
          }
          if (
            current.version === 0 &&
            new Date(event.task.updatedAt).getTime() < new Date(current.updatedAt).getTime()
          ) {
            return state;
          }
        }
        return {
          confirmedTasks: { ...state.confirmedTasks, [event.task.id]: event.task },
        };
      });
      return;
    }

    if (event.type === 'board:rebalanced') {
      set((state) => {
        const updated = { ...state.confirmedTasks };
        let changed = false;
        for (const { id, position, version } of event.positions) {
          const cur = updated[id];
          if (cur && (cur.version === 0 || version > cur.version)) {
            updated[id] = { ...cur, position, version };
            changed = true;
          }
        }
        return changed ? { confirmedTasks: updated } : state;
      });
    }
  },

  setActiveDragTaskId: (id) => {
    if (!id) {
      set({ activeDragTaskId: null, dragFreeze: null });
      return;
    }
    const task = selectEffectiveTasks(get()).find((t) => t.id === id);
    set({
      activeDragTaskId: id,
      dragFreeze: task ? { id: task.id, status: task.status, position: task.position } : null,
    });
  },

  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setFilters: (filters) => set((state) => ({ ...state, ...filters })),

  clearFilters: () =>
    set({ searchQuery: '', priorityFilter: '', assigneeFilter: '' }),
}));

// ─── Derived Selectors ───────────────────────────────────────────────────────

export function selectEffectiveTasks(
  state: Pick<BoardStore, 'confirmedTasks' | 'pendingMutations' | 'dragFreeze'>
): Task[] {
  const tasks: Record<string, Task> = {};
  for (const [id, t] of Object.entries(state.confirmedTasks)) {
    tasks[id] = t;
  }

  for (const mutations of Object.values(state.pendingMutations)) {
    for (const mutation of mutations) {
      if (mutation.kind === 'create') {
        tasks[mutation.tempId] = mutation.task;
      } else if (mutation.kind === 'update') {
        if (tasks[mutation.taskId]) {
          tasks[mutation.taskId] = { ...tasks[mutation.taskId], ...mutation.patch };
        }
      } else if (mutation.kind === 'delete') {
        delete tasks[mutation.taskId];
      }
    }
  }

  // Guardrail 3: Keep the actively dragged card pinned in its visual slot mid-drag
  // while still allowing remote edits (title, priority, assignee) to update cleanly
  if (state.dragFreeze && tasks[state.dragFreeze.id]) {
    tasks[state.dragFreeze.id] = {
      ...tasks[state.dragFreeze.id],
      status: state.dragFreeze.status,
      position: state.dragFreeze.position,
    };
  }

  return Object.values(tasks);
}

export function selectFilteredTasksByColumn(
  state: BoardStore,
  status: ColumnStatus
): Task[] {
  const q = state.searchQuery.trim().toLowerCase();
  return selectEffectiveTasks(state)
    .filter((t) => t.status === status)
    .filter((t) => {
      const matchSearch = !q || t.title.toLowerCase().includes(q);
      const matchPriority = !state.priorityFilter || t.priority === state.priorityFilter;
      const matchAssignee = !state.assigneeFilter || t.assignee === state.assigneeFilter;
      return matchSearch && matchPriority && matchAssignee;
    })
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function selectHasPendingMutation(state: BoardStore, taskId: string): boolean {
  return (state.pendingMutations[taskId]?.length ?? 0) > 0;
}

export function selectAllAssignees(state: BoardStore): string[] {
  const all = selectEffectiveTasks(state)
    .map((t) => t.assignee)
    .filter(Boolean);
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
}
