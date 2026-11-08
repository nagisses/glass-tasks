import type { Priority, Status, Task } from './api';
import type { SortKey } from './prefs';

export const STATUS_LABEL: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' };
export const PRIORITY_LABEL: Record<Priority, string> = { high: '高', medium: '中', low: '低' };
export const NEXT_STATUS: Record<Status, Status> = { todo: 'doing', doing: 'done', done: 'todo' };

export const COVER_COUNT = 8;
export const coverUrl = (i: number) => `/covers/cover-${((i % COVER_COUNT) + COVER_COUNT) % COVER_COUNT}.svg`;
export const COVER_TINT = ['#6aa8ff', '#c99cff', '#4cc98a', '#ff9f6e', '#9b8cff', '#3fb8d8', '#ff8a97', '#8f9bb3'];

function localDate(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dueInfo(due: string | null): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null {
  if (!due) return null;
  const today = localDate();
  const tomorrow = localDate(new Date(Date.now() + 86_400_000));
  if (due < today) {
    const [, m, d] = due.split('-');
    return { label: `${Number(m)}/${Number(d)}`, tone: 'overdue' };
  }
  if (due === today) return { label: '今日', tone: 'today' };
  if (due === tomorrow) return { label: '明日', tone: 'soon' };
  const [, m, d] = due.split('-');
  return { label: `${Number(m)}/${Number(d)}`, tone: 'later' };
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const list = [...tasks];
  if (sort === 'due') {
    list.sort((a, b) => (a.dueDate ?? '9999') .localeCompare(b.dueDate ?? '9999') || b.createdAt - a.createdAt);
  } else if (sort === 'priority') {
    list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'new', label: '新しい順' },
  { value: 'due', label: '期限順' },
  { value: 'priority', label: '優先度順' },
];
