import { getClientId } from '../utils/clientId';
import { BoardResponse, Task } from '../types';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

let simulateError = false;
export const setSimulateError = (value: boolean) => {
  simulateError = value;
};
export const getSimulateError = () => simulateError;

export interface TaskMutationResponse {
  task: Task;
  version?: number;
}

async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Id': getClientId(),
    ...(simulateError ? { 'X-Simulate-Error': 'true' } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (HTTP ${res.status})`);
  }

  return res;
}

function parseVersionHeader(res: Response): number | undefined {
  const raw = res.headers.get('X-Task-Version');
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const api = {
  getBoard: async (): Promise<BoardResponse> => {
    const res = await requestRaw('/api/board');
    return res.json();
  },

  createTask: async (data: Partial<Task>): Promise<TaskMutationResponse> => {
    const res = await requestRaw('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const version = parseVersionHeader(res);
    const task = (await res.json()) as Task;
    return { task, version };
  },

  updateTask: async (id: string, data: Partial<Task>): Promise<TaskMutationResponse> => {
    const res = await requestRaw(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    const version = parseVersionHeader(res);
    const task = (await res.json()) as Task;
    return { task, version };
  },

  deleteTask: async (id: string): Promise<{ id: string }> => {
    const res = await requestRaw(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },
};
