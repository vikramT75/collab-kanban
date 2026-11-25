import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useBoardStore } from '../store/useBoardStore';
import { ColumnStatus, Priority, COLUMN_ORDER } from '../types';

interface Props {
  defaultStatus?: ColumnStatus;
  onClose: () => void;
}

export default function CreateTaskModal({ defaultStatus = 'Backlog', onClose }: Props) {
  const createTask = useBoardStore((s) => s.createTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState<ColumnStatus>(defaultStatus);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    void createTask({
      title: trimmedTitle,
      description,
      priority,
      assignee: assignee.trim(),
      status,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/25 backdrop-blur-[1px] z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80">
          <h2 className="font-semibold text-slate-900 text-sm">New Task</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              className="w-full border border-slate-200/90 rounded-lg px-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix checkout validation bug"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Description
            </label>
            <textarea
              className="w-full border border-slate-200/90 rounded-lg px-3 py-2 text-[13px] text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 resize-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add acceptance criteria or context..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Priority
              </label>
              <select
                className="w-full border border-slate-200/90 rounded-lg px-2.5 py-2 text-[13px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Status
              </label>
              <select
                className="w-full border border-slate-200/90 rounded-lg px-2.5 py-2 text-[13px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={status}
                onChange={(e) => setStatus(e.target.value as ColumnStatus)}
              >
                {COLUMN_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Assignee
            </label>
            <input
              className="w-full border border-slate-200/90 rounded-lg px-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="e.g. Rahul"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-[13px] font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-2 text-[13px] font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
