import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2 } from 'lucide-react';
import { useBoardStore, selectHasPendingMutation } from '../store/useBoardStore';
import { Task } from '../types';

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-sky-50 text-sky-700 border-sky-200',
};

const PRIORITY_BORDER: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-400',
  low: 'border-l-sky-400',
};

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
];

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Props {
  task: Task;
  isOverlay?: boolean;
}

export default function TaskCard({ task, isOverlay = false }: Props) {
  const setSelectedTaskId = useBoardStore((s) => s.setSelectedTaskId);
  const hasPending = useBoardStore((s) => selectHasPendingMutation(s, task.id));
  const isTemp = task.id.startsWith('temp_');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isOverlay || isTemp,
  });

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      };

  const handleCardClick = () => {
    if (isOverlay || isTemp || isDragging) return;
    setSelectedTaskId(task.id);
  };

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || isTemp ? {} : attributes)}
      {...(isOverlay || isTemp ? {} : listeners)}
      onClick={handleCardClick}
      className={`bg-white rounded-lg border border-slate-200 border-l-4 ${
        PRIORITY_BORDER[task.priority] ?? 'border-l-slate-300'
      } p-3 shadow-sm transition-all group touch-none ${
        isOverlay
          ? 'shadow-xl ring-2 ring-indigo-500/40 rotate-1 cursor-grabbing'
          : isTemp
            ? 'opacity-80 cursor-wait'
            : 'hover:shadow-md hover:border-slate-300 cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start gap-2">
        {!isOverlay && !isTemp && (
          <span
            aria-hidden="true"
            className="mt-0.5 text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0"
          >
            <GripVertical size={15} />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug flex-1">
              {task.title}
            </p>
            {hasPending && (
              <Loader2
                size={13}
                className="text-indigo-500 animate-spin flex-shrink-0 mt-0.5"
                aria-label="Syncing changes"
              />
            )}
          </div>

          {task.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex items-center justify-between mt-2.5 gap-2">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                PRIORITY_BADGE[task.priority] ?? 'bg-slate-100 text-slate-600'
              }`}
            >
              {task.priority}
            </span>

            {task.assignee ? (
              <div
                className="flex items-center gap-1.5 min-w-0"
                title={task.assignee}
              >
                <span className="text-xs text-slate-500 truncate max-w-[90px]">
                  {task.assignee}
                </span>
                <div
                  className={`w-6 h-6 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0 ${getAvatarColor(
                    task.assignee
                  )}`}
                >
                  {getInitials(task.assignee)}
                </div>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 italic">Unassigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
