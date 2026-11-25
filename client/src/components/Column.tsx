import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { ColumnStatus, Task } from '../types';
import TaskCard from './TaskCard';

const COLUMN_ACCENT: Record<ColumnStatus, string> = {
  Backlog: 'border-t-slate-400',
  Todo: 'border-t-sky-500',
  'In Progress': 'border-t-amber-500',
  Done: 'border-t-emerald-500',
};

const DOT_COLOR: Record<ColumnStatus, string> = {
  Backlog: 'bg-slate-400',
  Todo: 'bg-sky-500',
  'In Progress': 'bg-amber-500',
  Done: 'bg-emerald-500',
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

  return (
    <section
      className={`flex flex-col bg-slate-200/60 rounded-xl border border-slate-200/90 border-t-4 ${COLUMN_ACCENT[status]} min-w-[290px] w-full max-w-[360px] flex-1 shadow-sm`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200/80 bg-white/60 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${DOT_COLOR[status]}`} />
          <h2 className="font-semibold text-slate-800 text-sm">{status}</h2>
          <span className="text-xs bg-slate-200/80 text-slate-700 rounded-full px-2 py-0.5 font-medium">
            {isFiltered ? `${tasks.length}/${totalCount}` : tasks.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onQuickCreate(status)}
          title={`Add task to ${status}`}
          className="text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-200/60 transition-colors"
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
          className={`flex flex-col gap-2.5 p-2.5 flex-1 min-h-[160px] rounded-b-xl transition-colors ${
            isOver ? 'bg-indigo-50/80 ring-2 ring-inset ring-indigo-300' : ''
          }`}
        >
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center flex-1 min-h-[110px] text-slate-400 text-xs border-2 border-dashed border-slate-300/80 rounded-lg px-3 text-center">
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
