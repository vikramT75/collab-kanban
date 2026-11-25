import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2 } from 'lucide-react';
import { useBoardStore, selectHasPendingMutation } from '../store/useBoardStore';
import { Task } from '../types';

const PRIORITY_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  high: {
    badge: 'bg-rose-50/80 text-rose-700 border-rose-200/80',
    dot: 'bg-rose-500',
    label: 'High',
  },
  medium: {
    badge: 'bg-amber-50/80 text-amber-700 border-amber-200/80',
    dot: 'bg-amber-500',
    label: 'Medium',
  },
  low: {
    badge: 'bg-sky-50/80 text-sky-700 border-sky-200/80',
    dot: 'bg-sky-500',
    label: 'Low',
  },
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
        opacity: isDragging ? 0.3 : 1,
      };

  const handleCardClick = () => {
    if (isOverlay || isTemp || isDragging) return;
    setSelectedTaskId(task.id);
  };

  const priorityMeta = PRIORITY_STYLE[task.priority] ?? {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    label: task.priority,
  };

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || isTemp ? {} : attributes)}
      {...(isOverlay || isTemp ? {} : listeners)}
      onClick={handleCardClick}
      className={`bg-white rounded-lg border border-slate-200/90 p-3 transition-all group touch-none ${
        isOverlay
          ? 'shadow-xl border-slate-300 ring-2 ring-slate-900/10 rotate-[0.8deg] cursor-grabbing'
          : isTemp
            ? 'opacity-75 cursor-wait shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
            : 'shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-medium text-slate-800 line-clamp-2 leading-snug flex-1">
          {task.title}
        </p>

        <div className="flex items-center gap-1 flex-shrink-0">
          {hasPending && (
            <Loader2
              size={13}
              className="text-slate-500 animate-spin"
              aria-label="Syncing changes"
            />
          )}
          {!isOverlay && !isTemp && (
            <span
              aria-hidden="true"
              className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <GripVertical size={14} />
            </span>
          )}
        </div>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100/90 gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium ${priorityMeta.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dot}`} />
          {priorityMeta.label}
        </span>

        {task.assignee ? (
          <div className="flex items-center gap-1.5 min-w-0" title={task.assignee}>
            <span className="text-xs text-slate-500 truncate max-w-[96px]">
              {task.assignee}
            </span>
            <div
              className={`w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center flex-shrink-0 ${getAvatarColor(
                task.assignee
              )}`}
            >
              {getInitials(task.assignee)}
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Unassigned</span>
        )}
      </div>
    </div>
  );
}
