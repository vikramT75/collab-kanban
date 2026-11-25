import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Plus,
  CircleDashed,
  Circle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ColumnStatus, Task } from '../types';
import TaskCard from './TaskCard';

const STATUS_META: Record<
  ColumnStatus,
  { icon: typeof Circle; iconClass: string; badgeClass: string }
> = {
  Backlog: {
    icon: CircleDashed,
    iconClass: 'text-slate-400',
    badgeClass: 'bg-slate-200/70 text-slate-600',
  },
  Todo: {
    icon: Circle,
    iconClass: 'text-sky-500',
    badgeClass: 'bg-sky-100/80 text-sky-700',
  },
  'In Progress': {
    icon: Clock,
    iconClass: 'text-amber-500',
    badgeClass: 'bg-amber-100/80 text-amber-700',
  },
  Done: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-100/80 text-emerald-700',
  },
};

interface Props {
  status: ColumnStatus;
  tasks: Task[];
  totalCount: number;
  isFiltered: boolean;
  onQuickCreate: (status: ColumnStatus) => void;
}

export default function Column({
  status,
  tasks,
  totalCount,
  isFiltered,
  onQuickCreate,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;

  return (
    <section className="flex flex-col bg-slate-100/80 rounded-xl border border-slate-200/80 min-w-[285px] w-full max-w-[360px] flex-1">
      {/* Column header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/70">
        <div className="flex items-center gap-2">
          <StatusIcon size={15} className={meta.iconClass} />
          <h2 className="font-medium text-slate-800 text-[13px] tracking-[-0.01em]">
            {status}
          </h2>
          <span
            className={`text-[11px] rounded-full px-1.5 py-0.5 font-medium tabular-nums ${meta.badgeClass}`}
          >
            {isFiltered ? `${tasks.length}/${totalCount}` : tasks.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onQuickCreate(status)}
          title={`Add task to ${status}`}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-200/60 transition-colors"
          aria-label={`Add task to ${status}`}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Droppable task list */}
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-2 p-2.5 flex-1 min-h-[160px] rounded-b-xl transition-colors ${
            isOver ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-300' : ''
          }`}
        >
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center flex-1 min-h-[110px] text-slate-400 text-xs border border-dashed border-slate-300/80 rounded-lg px-3 text-center">
              {isFiltered ? 'No matching tasks' : 'Drop tasks here or click +'}
            </div>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </SortableContext>
    </section>
  );
}
