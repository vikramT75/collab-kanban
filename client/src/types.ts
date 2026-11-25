export type Priority = "low" | "medium" | "high";
export type ColumnStatus = "Backlog" | "Todo" | "In Progress" | "Done";
export const COLUMN_ORDER: ColumnStatus[] = ["Backlog", "Todo", "In Progress", "Done"];

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  assignee: string;
  status: ColumnStatus;
  position: number;
  updatedAt: string;
};

export type TaskWithVersion = Task & { version: number };

export type BoardEvent =
  | { type: "task:created"; eventId: string; originClientId: string; task: TaskWithVersion }
  | { type: "task:updated"; eventId: string; originClientId: string; task: TaskWithVersion; changedFields: Array<keyof Task> }
  | { type: "task:deleted"; eventId: string; originClientId: string; taskId: string }
  | { type: "board:rebalanced"; eventId: string; originClientId: string; status: ColumnStatus; positions: Array<{ id: string; position: number; version: number }> };

export type BoardResponse = {
  columns: ColumnStatus[];
  tasks: Task[];
  serverTime: string;
};
