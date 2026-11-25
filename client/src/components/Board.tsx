import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCorners,
  CollisionDetection,
  DragOverlay as DndDragOverlay,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  useBoardStore,
  selectEffectiveTasks,
} from '../store/useBoardStore';
import { COLUMN_ORDER, ColumnStatus, Task } from '../types';
import { computeNewPosition } from '../utils/positioning';
import Column from './Column';
import TaskCard from './TaskCard';
import TaskDrawer from './TaskDrawer';
import CreateTaskModal from './CreateTaskModal';

interface DragPreview {
  taskId: string;
  status: ColumnStatus;
  index: number;
}

export default function Board() {
  const confirmedTasks = useBoardStore((s) => s.confirmedTasks);
  const pendingMutations = useBoardStore((s) => s.pendingMutations);
  const dragFreeze = useBoardStore((s) => s.dragFreeze);
  const activeDragTaskId = useBoardStore((s) => s.activeDragTaskId);
  const searchQuery = useBoardStore((s) => s.searchQuery);
  const priorityFilter = useBoardStore((s) => s.priorityFilter);
  const assigneeFilter = useBoardStore((s) => s.assigneeFilter);
  const setActiveDragTaskId = useBoardStore((s) => s.setActiveDragTaskId);
  const updateTask = useBoardStore((s) => s.updateTask);

  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [createModalColumn, setCreateModalColumn] = useState<ColumnStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Pointer-first collision detection works cleanly over empty columns and dense lists
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCorners(args);
  }, []);

  const isFiltered = Boolean(searchQuery.trim() || priorityFilter || assigneeFilter);

  // Base columns derived from store (before transient drag preview)
  const { baseColumns, totalCountsByColumn, taskMap } = useMemo(() => {
    const allEffective = selectEffectiveTasks({
      confirmedTasks,
      pendingMutations,
      dragFreeze,
    });

    const map: Record<string, Task> = {};
    const totals: Record<ColumnStatus, number> = {
      Backlog: 0,
      Todo: 0,
      'In Progress': 0,
      Done: 0,
    };
    const grouped: Record<ColumnStatus, Task[]> = {
      Backlog: [],
      Todo: [],
      'In Progress': [],
      Done: [],
    };

    const q = searchQuery.trim().toLowerCase();

    for (const t of allEffective) {
      map[t.id] = t;
      if (totals[t.status] !== undefined) {
        totals[t.status] += 1;
      }
      const matchSearch = !q || t.title.toLowerCase().includes(q);
      const matchPriority = !priorityFilter || t.priority === priorityFilter;
      const matchAssignee = !assigneeFilter || t.assignee === assigneeFilter;
      if (matchSearch && matchPriority && matchAssignee && grouped[t.status]) {
        grouped[t.status].push(t);
      }
    }

    for (const status of COLUMN_ORDER) {
      grouped[status].sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id)
      );
    }

    return { baseColumns: grouped, totalCountsByColumn: totals, taskMap: map };
  }, [
    confirmedTasks,
    pendingMutations,
    dragFreeze,
    searchQuery,
    priorityFilter,
    assigneeFilter,
  ]);

  // Apply transient dragPreview on top of baseColumns for smooth real-time DnD sorting
  const displayColumns = useMemo(() => {
    if (!dragPreview) return baseColumns;

    const draggedTask = taskMap[dragPreview.taskId];
    if (!draggedTask) return baseColumns;

    const next: Record<ColumnStatus, Task[]> = {
      Backlog: baseColumns.Backlog.filter((t) => t.id !== dragPreview.taskId),
      Todo: baseColumns.Todo.filter((t) => t.id !== dragPreview.taskId),
      'In Progress': baseColumns['In Progress'].filter((t) => t.id !== dragPreview.taskId),
      Done: baseColumns.Done.filter((t) => t.id !== dragPreview.taskId),
    };

    const targetList = next[dragPreview.status];
    const clampedIdx = Math.max(0, Math.min(dragPreview.index, targetList.length));
    targetList.splice(clampedIdx, 0, draggedTask);
    return next;
  }, [baseColumns, dragPreview, taskMap]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const task = taskMap[activeId];
    if (!task) return;

    setActiveDragTaskId(activeId);
    const idx = baseColumns[task.status].findIndex((t) => t.id === activeId);
    setDragPreview({
      taskId: activeId,
      status: task.status,
      index: idx >= 0 ? idx : 0,
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    let targetStatus: ColumnStatus | null = null;
    if ((COLUMN_ORDER as string[]).includes(overId)) {
      targetStatus = overId as ColumnStatus;
    } else {
      const overTask = taskMap[overId];
      if (overTask) {
        // Check displayColumns in case overTask was in a previewed column
        for (const col of COLUMN_ORDER) {
          if (displayColumns[col].some((t) => t.id === overId)) {
            targetStatus = col;
            break;
          }
        }
        if (!targetStatus) targetStatus = overTask.status;
      }
    }

    if (!targetStatus) return;

    const colWithoutDragged = baseColumns[targetStatus].filter((t) => t.id !== activeId);
    let targetIndex: number;

    if ((COLUMN_ORDER as string[]).includes(overId)) {
      targetIndex = colWithoutDragged.length;
    } else {
      const overIndexInCol = colWithoutDragged.findIndex((t) => t.id === overId);
      if (overIndexInCol === -1) {
        targetIndex = colWithoutDragged.length;
      } else {
        const activeTop =
          active.rect.current.translated?.top ?? active.rect.current.initial?.top ?? 0;
        const activeHeight =
          active.rect.current.translated?.height ?? active.rect.current.initial?.height ?? 0;
        const activeCenterY = activeTop + activeHeight / 2;
        const overMiddleY = over.rect.top + over.rect.height / 2;
        const isBelowOver = activeCenterY > overMiddleY;
        targetIndex = isBelowOver ? overIndexInCol + 1 : overIndexInCol;
      }
    }

    setDragPreview((prev) => {
      if (prev && prev.taskId === activeId && prev.status === targetStatus && prev.index === targetIndex) {
        return prev;
      }
      return { taskId: activeId, status: targetStatus, index: targetIndex };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const currentPreview = dragPreview;

    setDragPreview(null);
    setActiveDragTaskId(null);

    if (!over || !currentPreview) return;

    const originalTask = taskMap[activeId];
    if (!originalTask) return;

    const targetStatus = currentPreview.status;
    const colWithoutDragged = baseColumns[targetStatus].filter((t) => t.id !== activeId);
    const clampedIndex = Math.max(0, Math.min(currentPreview.index, colWithoutDragged.length));

    const originalIndex = baseColumns[originalTask.status].findIndex(
      (t) => t.id === activeId
    );
    if (originalTask.status === targetStatus && originalIndex === clampedIndex) {
      return;
    }

    const above = colWithoutDragged[clampedIndex - 1] ?? null;
    const below = colWithoutDragged[clampedIndex] ?? null;
    const newPosition = computeNewPosition(above, below);

    if (
      originalTask.status === targetStatus &&
      Math.abs(originalTask.position - newPosition) < 0.0001
    ) {
      return;
    }

    void updateTask(activeId, { status: targetStatus, position: newPosition });
  };

  const handleDragCancel = () => {
    setDragPreview(null);
    setActiveDragTaskId(null);
  };

  const activeDragTask = activeDragTaskId ? taskMap[activeDragTaskId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <main className="flex-1 p-4 lg:p-6 overflow-x-auto">
        <div className="max-w-[1600px] mx-auto flex gap-4 items-stretch min-h-[calc(100vh-115px)]">
          {COLUMN_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={displayColumns[status]}
              totalCount={totalCountsByColumn[status]}
              isFiltered={isFiltered}
              onQuickCreate={(col) => setCreateModalColumn(col)}
            />
          ))}
        </div>
      </main>

      <DndDragOverlay>
        {activeDragTask ? <TaskCard task={activeDragTask} isOverlay /> : null}
      </DndDragOverlay>

      <TaskDrawer />

      {createModalColumn && (
        <CreateTaskModal
          defaultStatus={createModalColumn}
          onClose={() => setCreateModalColumn(null)}
        />
      )}
    </DndContext>
  );
}
