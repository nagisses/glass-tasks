import type { List, Task } from './api';

/** Loose form for matching: full/half width, case, and katakana vs hiragana are ignored. */
export function normalize(s: string) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .trim();
}

export type Suggestion =
  | { kind: 'title'; key: string; label: string }
  | { kind: 'list'; key: string; label: string; list: List };

const MAX = 5;

/** "#…" at the end of the input picks a list */
export const LIST_TOKEN = /(?:^|\s)[#＃]([^\s#＃]*)$/;

export function suggest(text: string, tasks: Task[] | undefined, lists: List[] | undefined): Suggestion[] {
  const token = text.match(LIST_TOKEN);
  if (token) {
    const q = normalize(token[1]);
    return (lists ?? [])
      .filter((l) => normalize(l.name).includes(q))
      .slice(0, MAX)
      .map((l) => ({ kind: 'list', key: `list:${l.id}`, label: l.name, list: l }));
  }

  const q = normalize(text);
  if (!q || !tasks) return [];
  // Past task titles, most used first, then most recent
  const seen = new Map<string, { label: string; count: number; last: number; starts: boolean }>();
  for (const t of tasks) {
    const n = normalize(t.title);
    if (!n.includes(q) || n === q) continue;
    const e = seen.get(n);
    if (e) {
      e.count++;
      e.last = Math.max(e.last, t.createdAt);
    } else {
      seen.set(n, { label: t.title, count: 1, last: t.createdAt, starts: n.startsWith(q) });
    }
  }
  return [...seen.entries()]
    .sort(([, a], [, b]) => Number(b.starts) - Number(a.starts) || b.count - a.count || b.last - a.last)
    .slice(0, MAX)
    .map(([n, e]) => ({ kind: 'title', key: `title:${n}`, label: e.label }));
}
