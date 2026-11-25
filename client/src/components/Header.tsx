import { useMemo, useState } from 'react';
import {
  Kanban,
  Search,
  X,
  Plus,
  AlertTriangle,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { useBoardStore, selectEffectiveTasks } from '../store/useBoardStore';
import { Priority } from '../types';
import { getSimulateError, setSimulateError } from '../api/client';
import CreateTaskModal from './CreateTaskModal';

export default function Header() {
  const confirmedTasks = useBoardStore((s) => s.confirmedTasks);
  const pendingMutations = useBoardStore((s) => s.pendingMutations);
  const searchQuery = useBoardStore((s) => s.searchQuery);
  const priorityFilter = useBoardStore((s) => s.priorityFilter);
  const assigneeFilter = useBoardStore((s) => s.assigneeFilter);
  const connectionStatus = useBoardStore((s) => s.connectionStatus);
  const setFilters = useBoardStore((s) => s.setFilters);
  const clearFilters = useBoardStore((s) => s.clearFilters);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [chaosOn, setChaosOn] = useState(() => getSimulateError());

  const assignees = useMemo(() => {
    const tasks = selectEffectiveTasks({
      confirmedTasks,
      pendingMutations,
      dragFreeze: null,
    });
    const set = new Set(tasks.map((t) => t.assignee).filter(Boolean));
    if (assigneeFilter) set.add(assigneeFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [confirmedTasks, pendingMutations, assigneeFilter]);

  const hasActiveFilters = Boolean(searchQuery || priorityFilter || assigneeFilter);

  const toggleChaos = () => {
    const next = !chaosOn;
    setChaosOn(next);
    setSimulateError(next);
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-6 py-2.5 sticky top-0 z-30">
      <div className="max-w-[1480px] mx-auto flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <Kanban size={15} />
          </div>
          <h1 className="font-semibold text-slate-900 text-[15px] tracking-[-0.015em]">
            Kanban Board
          </h1>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 min-w-0 lg:max-w-xl">
          <div className="relative flex-1 min-w-[170px]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setFilters({ searchQuery: e.target.value })}
              placeholder="Search tasks..."
              aria-label="Search tasks by title"
              className="w-full pl-8 pr-7 py-1.5 text-[13px] border border-slate-200/90 rounded-lg bg-slate-100/70 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setFilters({ searchQuery: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={priorityFilter}
            onChange={(e) =>
              setFilters({ priorityFilter: e.target.value as Priority | '' })
            }
            aria-label="Filter by priority"
            className="px-2.5 py-1.5 text-[13px] border border-slate-200/90 rounded-lg bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setFilters({ assigneeFilter: e.target.value })}
            aria-label="Filter by assignee"
            className="px-2.5 py-1.5 text-[13px] border border-slate-200/90 rounded-lg bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
          >
            <option value="">All Assignees</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Status + Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          {/* Connection status pill */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              connectionStatus === 'connected'
                ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200/80'
                : connectionStatus === 'reconnecting'
                  ? 'bg-amber-50/80 text-amber-700 border-amber-200/80'
                  : 'bg-slate-100/80 text-slate-500 border-slate-200/80'
            }`}
            title={`Real-time stream: ${connectionStatus}`}
          >
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>Live</span>
              </>
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <Loader2 size={12} className="animate-spin text-amber-600" />
                <span>Reconnecting</span>
              </>
            ) : (
              <>
                <WifiOff size={12} />
                <span>Connecting</span>
              </>
            )}
          </div>

          {/* Fault-injection toggle for rollback testing */}
          <button
            type="button"
            role="switch"
            aria-checked={chaosOn}
            onClick={toggleChaos}
            title="Force 503 API errors on mutations to test optimistic rollback"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              chaosOn
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/80'
                : 'bg-slate-50 text-slate-600 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {chaosOn ? (
              <AlertTriangle size={12} className="text-rose-600" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-300" />
            )}
            <span>{chaosOn ? 'Testing API failure' : 'Test API fail'}</span>
          </button>

          {/* Create task button */}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-slate-900 text-white hover:bg-slate-800 shadow-sm transition-colors"
          >
            <Plus size={15} />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {isCreateOpen && (
        <CreateTaskModal onClose={() => setIsCreateOpen(false)} />
      )}
    </header>
  );
}
