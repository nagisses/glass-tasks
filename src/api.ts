export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'high' | 'medium' | 'low';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface List {
  id: string;
  name: string;
  cover: number;
  isInbox: boolean;
  position: number;
  counts: { todo: number; doing: number; done: number };
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  note: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  subtaskCount: number;
  subtaskDone: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) unauthorizedHandler?.();
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),

  lists: () => request<{ lists: List[] }>('GET', '/api/lists'),
  createList: (b: { name: string; cover: number }) => request<{ list: List }>('POST', '/api/lists', b),
  updateList: (id: string, b: { name?: string; cover?: number }) => request('PATCH', `/api/lists/${id}`, b),
  deleteList: (id: string) => request('DELETE', `/api/lists/${id}`),

  tasks: (listId?: string) =>
    request<{ tasks: Task[] }>('GET', listId ? `/api/tasks?listId=${encodeURIComponent(listId)}` : '/api/tasks'),
  task: (id: string) => request<{ task: Task; subtasks: Subtask[] }>('GET', `/api/tasks/${id}`),
  createTask: (b: { id: string; title: string; listId?: string }) => request<{ task: Task }>('POST', '/api/tasks', b),
  updateTask: (id: string, b: Partial<Pick<Task, 'title' | 'note' | 'status' | 'priority' | 'dueDate' | 'listId'>>) =>
    request<{ task: Task }>('PATCH', `/api/tasks/${id}`, b),
  deleteTask: (id: string) => request('DELETE', `/api/tasks/${id}`),
  restoreTask: (id: string) => request<{ task: Task }>('POST', `/api/tasks/${id}/restore`),

  addSubtasks: (taskId: string, titles: string[]) =>
    request<{ subtasks: Subtask[] }>('POST', `/api/tasks/${taskId}/subtasks`, { titles }),
  updateSubtask: (id: string, b: { title?: string; done?: boolean }) => request('PATCH', `/api/subtasks/${id}`, b),
  deleteSubtask: (id: string) => request('DELETE', `/api/subtasks/${id}`),

  aiQuickAdd: (b: { text: string; listId?: string; today: string }) =>
    request<{ task: Task }>('POST', '/api/ai/quick-add', b),
  breakdown: (taskId: string) => request<{ suggestions: string[] }>('POST', '/api/ai/breakdown', { taskId }),
};
