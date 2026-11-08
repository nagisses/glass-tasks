import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { List, Status, Subtask, Task } from './api';

export const qk = {
  me: ['me'] as const,
  lists: ['lists'] as const,
  tasksAll: ['tasks'] as const,
  tasks: (listId?: string) => ['tasks', listId ?? 'all'] as const,
  task: (id: string) => ['task', id] as const,
};

type TaskDetail = { task: Task; subtasks: Subtask[] };

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await api.me()).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
  });
}

export function useLists() {
  return useQuery({ queryKey: qk.lists, queryFn: async () => (await api.lists()).lists });
}

export function useTasks(listId?: string) {
  return useQuery({ queryKey: qk.tasks(listId), queryFn: async () => (await api.tasks(listId)).tasks });
}

export function useTaskDetail(id: string | undefined) {
  return useQuery({ queryKey: qk.task(id ?? ''), queryFn: () => api.task(id!), enabled: !!id });
}

// ---------- optimistic cache helpers ----------
function snapshot(qc: QueryClient) {
  return {
    tasks: qc.getQueriesData<Task[]>({ queryKey: qk.tasksAll }),
    lists: qc.getQueryData<List[]>(qk.lists),
  };
}
type Snapshot = ReturnType<typeof snapshot>;

function rollback(qc: QueryClient, s: Snapshot | undefined) {
  if (!s) return;
  for (const [key, data] of s.tasks) qc.setQueryData(key, data);
  qc.setQueryData(qk.lists, s.lists);
}

/** Applies fn to every cached task list whose filter matches the task. */
function patchTaskCaches(qc: QueryClient, fn: (tasks: Task[], key: readonly unknown[]) => Task[]) {
  for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: qk.tasksAll })) {
    if (data) qc.setQueryData(key, fn(data, key));
  }
}

function adjustCounts(qc: QueryClient, listId: string, status: Status, delta: number) {
  qc.setQueryData<List[]>(qk.lists, (lists) =>
    lists?.map((l) =>
      l.id === listId ? { ...l, counts: { ...l.counts, [status]: Math.max(0, l.counts[status] + delta) } } : l,
    ),
  );
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: qk.tasksAll });
  qc.invalidateQueries({ queryKey: qk.lists });
}

// ---------- task mutations ----------
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; title: string; listId?: string }) => api.createTask(v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.tasksAll });
      const snap = snapshot(qc);
      const inbox = qc.getQueryData<List[]>(qk.lists)?.find((l) => l.isInbox);
      const listId = v.listId ?? inbox?.id ?? '';
      const now = Date.now();
      const task: Task = {
        id: v.id,
        listId,
        title: v.title,
        note: '',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        subtaskCount: 0,
        subtaskDone: 0,
      };
      patchTaskCaches(qc, (tasks, key) => (key[1] === 'all' || key[1] === listId ? [task, ...tasks] : tasks));
      if (listId) adjustCounts(qc, listId, 'todo', 1);
      return snap;
    },
    onError: (_e, _v, snap) => rollback(qc, snap),
    onSettled: () => invalidateAll(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateTask>[1] }) => api.updateTask(v.id, v.patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasksAll });
      await qc.cancelQueries({ queryKey: qk.task(id) });
      const snap = snapshot(qc);
      const detail = qc.getQueryData<TaskDetail>(qk.task(id));
      let before: Task | undefined = detail?.task;
      for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: qk.tasksAll })) {
        before ??= data?.find((t) => t.id === id);
      }
      if (before) {
        const after: Task = {
          ...before,
          ...patch,
          completedAt: patch.status ? (patch.status === 'done' ? Date.now() : null) : before.completedAt,
        };
        patchTaskCaches(qc, (tasks, key) => {
          const has = tasks.some((t) => t.id === id);
          if (key[1] !== 'all' && patch.listId && patch.listId !== before!.listId) {
            if (key[1] === before!.listId) return tasks.filter((t) => t.id !== id);
            if (key[1] === patch.listId && !has) return [after, ...tasks];
          }
          return has ? tasks.map((t) => (t.id === id ? after : t)) : tasks;
        });
        if (detail) qc.setQueryData<TaskDetail>(qk.task(id), { ...detail, task: after });
        if (patch.status || patch.listId) {
          adjustCounts(qc, before.listId, before.status, -1);
          adjustCounts(qc, after.listId, after.status, 1);
        }
      }
      return { ...snap, detail };
    },
    onError: (_e, v, snap) => {
      rollback(qc, snap);
      if (snap?.detail) qc.setQueryData(qk.task(v.id), snap.detail);
    },
    onSettled: (_d, _e, v) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: qk.task(v.id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => api.deleteTask(task.id),
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: qk.tasksAll });
      const snap = snapshot(qc);
      patchTaskCaches(qc, (tasks) => tasks.filter((t) => t.id !== task.id));
      adjustCounts(qc, task.listId, task.status, -1);
      return snap;
    },
    onError: (_e, _v, snap) => rollback(qc, snap),
    onSettled: (_d, _e, task) => {
      invalidateAll(qc);
      qc.removeQueries({ queryKey: qk.task(task.id) });
    },
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreTask(id),
    onSettled: () => invalidateAll(qc),
  });
}

// ---------- subtasks ----------
function patchDetail(qc: QueryClient, taskId: string, fn: (d: TaskDetail) => TaskDetail) {
  const d = qc.getQueryData<TaskDetail>(qk.task(taskId));
  if (d) qc.setQueryData(qk.task(taskId), fn(d));
  return d;
}

export function useAddSubtasks(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (titles: string[]) => api.addSubtasks(taskId, titles),
    onSuccess: ({ subtasks }) => {
      patchDetail(qc, taskId, (d) => ({ ...d, subtasks: [...d.subtasks, ...subtasks] }));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.task(taskId) });
      qc.invalidateQueries({ queryKey: qk.tasksAll });
    },
  });
}

export function useUpdateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done?: boolean; title?: string }) =>
      api.updateSubtask(v.id, { done: v.done, title: v.title }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.task(taskId) });
      return patchDetail(qc, taskId, (d) => ({
        ...d,
        subtasks: d.subtasks.map((s) =>
          s.id === v.id ? { ...s, ...(v.done !== undefined && { done: v.done }), ...(v.title && { title: v.title }) } : s,
        ),
      }));
    },
    onError: (_e, _v, prev) => prev && qc.setQueryData(qk.task(taskId), prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.task(taskId) });
      qc.invalidateQueries({ queryKey: qk.tasksAll });
    },
  });
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSubtask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.task(taskId) });
      return patchDetail(qc, taskId, (d) => ({ ...d, subtasks: d.subtasks.filter((s) => s.id !== id) }));
    },
    onError: (_e, _v, prev) => prev && qc.setQueryData(qk.task(taskId), prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.task(taskId) });
      qc.invalidateQueries({ queryKey: qk.tasksAll });
    },
  });
}

// ---------- lists ----------
export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; cover: number }) => api.createList(v),
    onSuccess: ({ list }) => qc.setQueryData<List[]>(qk.lists, (ls) => (ls ? [...ls, list] : [list])),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.lists }),
  });
}

export function useUpdateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name?: string; cover?: number }) => api.updateList(v.id, v),
    onMutate: (v) => {
      const prev = qc.getQueryData<List[]>(qk.lists);
      qc.setQueryData<List[]>(qk.lists, (ls) =>
        ls?.map((l) => (l.id === v.id ? { ...l, ...(v.name && { name: v.name }), ...(v.cover !== undefined && { cover: v.cover }) } : l)),
      );
      return prev;
    },
    onError: (_e, _v, prev) => qc.setQueryData(qk.lists, prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.lists }),
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteList(id),
    onSuccess: (_d, id) => {
      qc.setQueryData<List[]>(qk.lists, (ls) => ls?.filter((l) => l.id !== id));
      patchTaskCaches(qc, (tasks) => tasks.filter((t) => t.listId !== id));
      qc.removeQueries({ queryKey: qk.tasks(id) });
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useBreakdown() {
  return useMutation({ mutationFn: (taskId: string) => api.breakdown(taskId) });
}

/** Gemini quick add: the server parses free text into title / due date / priority and creates the task. */
export function useAiQuickAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { text: string; listId?: string }) => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return api.aiQuickAdd({ ...v, today });
    },
    onSuccess: ({ task }) => {
      patchTaskCaches(qc, (tasks, key) => (key[1] === 'all' || key[1] === task.listId ? [task, ...tasks] : tasks));
    },
    onSettled: () => invalidateAll(qc),
  });
}
