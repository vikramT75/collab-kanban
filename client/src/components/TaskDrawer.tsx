import { useEffect, useRef, useState } from 'react';
import {
  X,
  Trash2,
  Save,
  AlertTriangle,
  Flag,
  Layers,
  User,
  Clock,
} from 'lucide-react';
import { useBoardStore, selectEffectiveTasks } from '../store/useBoardStore';
import { Task, Priority, ColumnStatus, COLUMN_ORDER } from '../types';

type EditableField = 'title' | 'description' | 'priority' | 'assignee' | 'status';
const EDITABLE_FIELDS: EditableField[] = [
  'title',
  'description',
  'priority',
  'assignee',
  'status',
];

export default function TaskDrawer() {
  const selectedTaskId = useBoardStore((s) => s.selectedTaskId);
  const confirmedTasks = useBoardStore((s) => s.confirmedTasks);
  const pendingMutations = useBoardStore((s) => s.pendingMutations);
  const hasLoadedOnce = useBoardStore((s) => s.hasLoadedOnce);
  const setSelectedTaskId = useBoardStore((s) => s.setSelectedTaskId);
  const updateTask = useBoardStore((s) => s.updateTask);
  const deleteTask = useBoardStore((s) => s.deleteTask);

  const serverTask = selectedTaskId ? confirmedTasks[selectedTaskId] : undefined;
  const effectiveTask = selectedTaskId
    ? selectEffectiveTasks({ confirmedTasks, pendingMutations, dragFreeze: null }).find(
        (t) => t.id === selectedTaskId
      )
    : undefined;

  const isPendingDelete = Boolean(
    selectedTaskId &&
      pendingMutations[selectedTaskId]?.some((m) => m.kind === 'delete')
  );
  const wasDeleted = Boolean(
    selectedTaskId && hasLoadedOnce && !serverTask && !isPendingDelete
  );

  const [form, setForm] = useState<Partial<Task>>({});
  const dirtyFields = useRef<Set<EditableField>>(new Set());
  const [hasDirty, setHasDirty] = useState(false);
  const [conflictFields, setConflictFields] = useState<EditableField[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const prevTaskIdRef = useRef<string | null>(null);
  const prevServerTaskRef = useRef<typeof serverTask>(undefined);

  useEffect(() => {
    if (!selectedTaskId) {
      prevTaskIdRef.current = null;
      prevServerTaskRef.current = undefined;
      dirtyFields.current = new Set();
      setHasDirty(false);
      setConflictFields([]);
      setConfirmDelete(false);
      return;
    }

    if (prevTaskIdRef.current !== selectedTaskId) {
      const seed = effectiveTask ?? serverTask;
      if (seed) {
        setForm({
          title: seed.title,
          description: seed.description,
          priority: seed.priority,
          assignee: seed.assignee,
          status: seed.status,
        });
      }
      dirtyFields.current = new Set();
      setHasDirty(false);
      setConflictFields([]);
      setConfirmDelete(false);
      prevTaskIdRef.current = selectedTaskId;
      prevServerTaskRef.current = serverTask;
    }
  }, [selectedTaskId, effectiveTask, serverTask]);

  useEffect(() => {
    if (!selectedTaskId || !serverTask) return;
    const prev = prevServerTaskRef.current;
    if (!prev || prev.id !== serverTask.id) {
      prevServerTaskRef.current = serverTask;
      return;
    }

    if (
      prev.version === serverTask.version &&
      prev.updatedAt === serverTask.updatedAt
    ) {
      return;
    }

    const newConflicts: EditableField[] = [];
    const autoUpdates: Partial<Task> = {};

    for (const field of EDITABLE_FIELDS) {
      const changedRemotely = serverTask[field] !== prev[field];
      if (!changedRemotely) continue;

      if (dirtyFields.current.has(field)) {
        if (form[field] !== serverTask[field]) {
          newConflicts.push(field);
        }
      } else {
        (autoUpdates as any)[field] = serverTask[field];
      }
    }

    if (Object.keys(autoUpdates).length > 0) {
      setForm((f) => ({ ...f, ...autoUpdates }));
    }
    if (newConflicts.length > 0) {
      setConflictFields((existing) =>
        Array.from(new Set([...existing, ...newConflicts]))
      );
    }
    prevServerTaskRef.current = serverTask;
  }, [selectedTaskId, serverTask, form]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTaskId, setSelectedTaskId]);

  if (!selectedTaskId) return null;

  const setField = <K extends EditableField>(field: K, value: Task[K]) => {
    dirtyFields.current.add(field);
    setHasDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = () => {
    if (!selectedTaskId || wasDeleted) return;
    const patch: Partial<Task> = {};
    for (const field of dirtyFields.current) {
      const val = form[field];
      if (field === 'title' && typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return;
        patch.title = trimmed;
      } else if (field === 'assignee' && typeof val === 'string') {
        patch.assignee = val.trim();
      } else {
        (patch as any)[field] = val;
      }
    }
    if (Object.keys(patch).length === 0) return;

    void updateTask(selectedTaskId, patch);
    setSelectedTaskId(null);
  };

  const handleConfirmDelete = () => {
    if (!selectedTaskId || wasDeleted) return;
    void deleteTask(selectedTaskId);
    setSelectedTaskId(null);
  };

  const handleAcceptLatest = () => {
    if (!serverTask) return;
    setForm({
      title: serverTask.title,
      description: serverTask.description,
      priority: serverTask.priority,
      assignee: serverTask.assignee,
      status: serverTask.status,
    });
    dirtyFields.current = new Set();
    setHasDirty(false);
    setConflictFields([]);
  };

  const handleKeepEditing = () => {
    setConflictFields([]);
  };

  const displayTask = effectiveTask ?? serverTask ?? prevServerTaskRef.current;
  const canSave = hasDirty && !wasDeleted && Boolean(form.title?.trim());

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-950/20 backdrop-blur-[1px] z-40"
        onClick={() => setSelectedTaskId(null)}
      />

      <aside
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col"
        aria-label="Task details"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Task Details</span>
            {displayTask && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                {form.status ?? displayTask.status}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedTaskId(null)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Banners */}
        {wasDeleted && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span>This task was deleted by another user.</span>
          </div>
        )}

        {!wasDeleted && conflictFields.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 text-xs text-amber-900">
            <p className="font-medium flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
              <span>Updated by another user ({conflictFields.join(', ')})</span>
            </p>
            <p className="text-amber-700 mt-0.5">
              Your unsaved edits were preserved. Clean fields auto-updated.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handleAcceptLatest}
                className="font-semibold text-amber-900 underline hover:text-amber-950"
              >
                Accept latest
              </button>
              <button
                type="button"
                onClick={handleKeepEditing}
                className="font-medium text-amber-700 underline hover:text-amber-900"
              >
                Keep my edits
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        {displayTask && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <div>
              <label className="sr-only">Title</label>
              <input
                disabled={wasDeleted}
                aria-label="Title"
                className="w-full text-base font-semibold tracking-[-0.015em] text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-300 focus:bg-slate-50/50 rounded-lg px-2.5 py-1.5 -mx-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60 transition-colors"
                value={form.title ?? ''}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Task title"
              />
            </div>

            {/* Notion-style property grid */}
            <div className="space-y-2.5 py-3 border-y border-slate-100">
              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Layers size={13} /> Status
                </span>
                <select
                  disabled={wasDeleted}
                  aria-label="Status"
                  className="w-full border border-slate-200/90 rounded-md px-2.5 py-1.5 text-[13px] text-slate-800 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
                  value={form.status ?? 'Backlog'}
                  onChange={(e) => setField('status', e.target.value as ColumnStatus)}
                >
                  {COLUMN_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Flag size={13} /> Priority
                </span>
                <select
                  disabled={wasDeleted}
                  aria-label="Priority"
                  className="w-full border border-slate-200/90 rounded-md px-2.5 py-1.5 text-[13px] text-slate-800 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
                  value={form.priority ?? 'medium'}
                  onChange={(e) => setField('priority', e.target.value as Priority)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <User size={13} /> Assignee
                </span>
                <input
                  disabled={wasDeleted}
                  aria-label="Assignee"
                  className="w-full border border-slate-200/90 rounded-md px-2.5 py-1.5 text-[13px] text-slate-800 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50"
                  value={form.assignee ?? ''}
                  onChange={(e) => setField('assignee', e.target.value)}
                  placeholder="Unassigned"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Description
              </label>
              <textarea
                disabled={wasDeleted}
                aria-label="Description"
                className="w-full border border-slate-200/90 rounded-lg px-3 py-2 text-[13px] text-slate-800 leading-relaxed bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 resize-none disabled:bg-slate-100"
                rows={6}
                value={form.description ?? ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Add acceptance criteria, notes, or links..."
              />
            </div>

            <div className="pt-2 text-xs text-slate-400 flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> Last updated
              </span>
              <span>{new Date(displayTask.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200/80 px-5 py-3.5 bg-slate-50/70 flex items-center gap-2.5">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-[13px] font-medium text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={wasDeleted}
                className="flex-1 px-3 py-1.5 text-[13px] font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                Confirm Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={wasDeleted}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-rose-600 border border-rose-200/90 bg-white rounded-lg hover:bg-rose-50 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={13} /> Delete
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <Save size={13} /> Save Changes
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
