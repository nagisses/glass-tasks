import { Hono } from 'hono';
import type { Context } from 'hono';
import { AiError, breakdownTask } from './ai';
import { requireUser } from './auth';
import type { AppEnv, Priority, Status } from './types';

const STATUSES: Status[] = ['todo', 'doing', 'done'];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const COVER_COUNT = 8;

class BadRequest extends Error {}

interface TaskRow {
  id: string;
  list_id: string;
  title: string;
  note: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  subtask_count: number;
  subtask_done: number;
}

interface ListRow {
  id: string;
  name: string;
  cover: number;
  is_inbox: number;
  position: number;
  todo: number;
  doing: number;
  done: number;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  title: string;
  done: number;
  position: number;
}

const toTask = (r: TaskRow) => ({
  id: r.id,
  listId: r.list_id,
  title: r.title,
  note: r.note,
  status: r.status,
  priority: r.priority,
  dueDate: r.due_date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
  subtaskCount: r.subtask_count ?? 0,
  subtaskDone: r.subtask_done ?? 0,
});

const toList = (r: ListRow) => ({
  id: r.id,
  name: r.name,
  cover: r.cover,
  isInbox: r.is_inbox === 1,
  position: r.position,
  counts: { todo: r.todo ?? 0, doing: r.doing ?? 0, done: r.done ?? 0 },
});

const toSubtask = (r: SubtaskRow) => ({
  id: r.id,
  taskId: r.task_id,
  title: r.title,
  done: r.done === 1,
  position: r.position,
});

// ---------- validation ----------
function text(v: unknown, field: string, max: number, min = 1): string {
  if (typeof v !== 'string') throw new BadRequest(`${field} must be a string`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new BadRequest(`${field} length`);
  return s;
}
function oneOf<T extends string>(v: unknown, values: readonly T[], field: string): T {
  if (typeof v !== 'string' || !values.includes(v as T)) throw new BadRequest(`${field} invalid`);
  return v as T;
}
function dateOrNull(v: unknown): string | null {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new BadRequest('dueDate invalid');
  }
  return v;
}
function cover(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= COVER_COUNT) throw new BadRequest('cover invalid');
  return v;
}
async function body(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new BadRequest('content-type must be application/json');
  }
  try {
    const b = await c.req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new BadRequest('invalid json');
  }
}

// ---------- queries ----------
const TASK_SELECT = `
  SELECT t.id, t.list_id, t.title, t.note, t.status, t.priority, t.due_date,
         t.created_at, t.updated_at, t.completed_at,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
    FROM tasks t`;

async function getTask(db: D1Database, userId: string, id: string) {
  return db
    .prepare(`${TASK_SELECT} WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`)
    .bind(id, userId)
    .first<TaskRow>();
}

async function ownsList(db: D1Database, userId: string, listId: string) {
  return db.prepare('SELECT id, is_inbox FROM lists WHERE id = ? AND user_id = ?').bind(listId, userId).first<{
    id: string;
    is_inbox: number;
  }>();
}

async function inboxId(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare('SELECT id FROM lists WHERE user_id = ? AND is_inbox = 1')
    .bind(userId)
    .first<{ id: string }>();
  if (row) return row.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO lists (id, user_id, name, cover, is_inbox, position, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 0, ?, ?)',
    )
    .bind(id, userId, 'インボックス', now, now)
    .run();
  return id;
}

export const api = new Hono<AppEnv>();

api.get('/health', (c) => c.json({ ok: true }));

api.use('*', requireUser);

api.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof AiError) return c.json({ error: 'ai_unavailable' }, 502);
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

api.get('/me', (c) => c.json({ user: c.get('user') }));

// ---------- lists ----------
api.get('/lists', async (c) => {
  const user = c.get('user');
  await inboxId(c.env.DB, user.id);
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.name, l.cover, l.is_inbox, l.position,
            SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) AS todo,
            SUM(CASE WHEN t.status = 'doing' THEN 1 ELSE 0 END) AS doing,
            SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done
       FROM lists l
       LEFT JOIN tasks t ON t.list_id = l.id AND t.deleted_at IS NULL
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY l.is_inbox DESC, l.position ASC, l.created_at ASC`,
  )
    .bind(user.id)
    .all<ListRow>();
  return c.json({ lists: results.map(toList) });
});

api.post('/lists', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  const name = text(b.name, 'name', 60);
  const cv = b.cover === undefined ? 0 : cover(b.cover);
  const id = crypto.randomUUID();
  const now = Date.now();
  const pos = await c.env.DB.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lists WHERE user_id = ?')
    .bind(user.id)
    .first<{ p: number }>();
  await c.env.DB.prepare(
    'INSERT INTO lists (id, user_id, name, cover, is_inbox, position, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
  )
    .bind(id, user.id, name, cv, pos?.p ?? 1, now, now)
    .run();
  return c.json(
    { list: toList({ id, name, cover: cv, is_inbox: 0, position: pos?.p ?? 1, todo: 0, doing: 0, done: 0 }) },
    201,
  );
});

api.patch('/lists/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await ownsList(c.env.DB, user.id, id))) return c.json({ error: 'not_found' }, 404);
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) {
    sets.push('name = ?');
    vals.push(text(b.name, 'name', 60));
  }
  if (b.cover !== undefined) {
    sets.push('cover = ?');
    vals.push(cover(b.cover));
  }
  if (sets.length === 0) throw new BadRequest('nothing to update');
  sets.push('updated_at = ?');
  vals.push(Date.now());
  await c.env.DB.prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals, id, user.id)
    .run();
  return c.json({ ok: true });
});

api.delete('/lists/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const list = await ownsList(c.env.DB, user.id, id);
  if (!list) return c.json({ error: 'not_found' }, 404);
  if (list.is_inbox) return c.json({ error: 'inbox_cannot_be_deleted' }, 400);
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE list_id = ? AND user_id = ?)').bind(id, user.id),
    db.prepare('DELETE FROM tasks WHERE list_id = ? AND user_id = ?').bind(id, user.id),
    db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').bind(id, user.id),
  ]);
  return c.json({ ok: true });
});

// ---------- tasks ----------
api.get('/tasks', async (c) => {
  const user = c.get('user');
  const listId = c.req.query('listId');
  const stmt = listId
    ? c.env.DB.prepare(
        `${TASK_SELECT} WHERE t.user_id = ? AND t.list_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 1000`,
      ).bind(user.id, listId)
    : c.env.DB.prepare(
        `${TASK_SELECT} WHERE t.user_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 1000`,
      ).bind(user.id);
  const { results } = await stmt.all<TaskRow>();
  return c.json({ tasks: results.map(toTask) });
});

api.get('/tasks/:id', async (c) => {
  const user = c.get('user');
  const row = await getTask(c.env.DB, user.id, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  const { results } = await c.env.DB.prepare(
    'SELECT id, task_id, title, done, position FROM subtasks WHERE task_id = ? ORDER BY position ASC, created_at ASC',
  )
    .bind(row.id)
    .all<SubtaskRow>();
  return c.json({ task: toTask(row), subtasks: results.map(toSubtask) });
});

api.post('/tasks', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  const title = text(b.title, 'title', 200);
  const note = b.note === undefined ? '' : text(b.note, 'note', 5000, 0);
  const priority = b.priority === undefined ? 'medium' : oneOf(b.priority, PRIORITIES, 'priority');
  const dueDate = b.dueDate === undefined ? null : dateOrNull(b.dueDate);
  let listId: string;
  if (b.listId) {
    if (typeof b.listId !== 'string' || !(await ownsList(c.env.DB, user.id, b.listId))) {
      throw new BadRequest('listId invalid');
    }
    listId = b.listId;
  } else {
    listId = await inboxId(c.env.DB, user.id);
  }
  // Clients may send their own UUID so optimistic rows keep a stable id
  const id =
    typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id.toLowerCase() : crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, user_id, list_id, title, note, status, priority, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)`,
  )
    .bind(id, user.id, listId, title, note, priority, dueDate, now, now)
    .run();
  const row = await getTask(c.env.DB, user.id, id);
  return c.json({ task: toTask(row!) }, 201);
});

api.patch('/tasks/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const current = await getTask(c.env.DB, user.id, id);
  if (!current) return c.json({ error: 'not_found' }, 404);
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const now = Date.now();
  if (b.title !== undefined) {
    sets.push('title = ?');
    vals.push(text(b.title, 'title', 200));
  }
  if (b.note !== undefined) {
    sets.push('note = ?');
    vals.push(text(b.note, 'note', 5000, 0));
  }
  if (b.status !== undefined) {
    const status = oneOf(b.status, STATUSES, 'status');
    sets.push('status = ?', 'completed_at = ?');
    vals.push(status, status === 'done' ? (current.completed_at ?? now) : null);
  }
  if (b.priority !== undefined) {
    sets.push('priority = ?');
    vals.push(oneOf(b.priority, PRIORITIES, 'priority'));
  }
  if (b.dueDate !== undefined) {
    sets.push('due_date = ?');
    vals.push(dateOrNull(b.dueDate));
  }
  if (b.listId !== undefined) {
    if (typeof b.listId !== 'string' || !(await ownsList(c.env.DB, user.id, b.listId))) {
      throw new BadRequest('listId invalid');
    }
    sets.push('list_id = ?');
    vals.push(b.listId);
  }
  if (sets.length === 0) throw new BadRequest('nothing to update');
  sets.push('updated_at = ?');
  vals.push(now);
  await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals, id, user.id)
    .run();
  const row = await getTask(c.env.DB, user.id, id);
  return c.json({ task: toTask(row!) });
});

api.delete('/tasks/:id', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare(
    'UPDATE tasks SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  )
    .bind(Date.now(), c.req.param('id'), user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

api.post('/tasks/:id/restore', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(
    'UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL',
  )
    .bind(Date.now(), id, user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  const row = await getTask(c.env.DB, user.id, id);
  return c.json({ task: toTask(row!) });
});

// ---------- subtasks ----------
api.post('/tasks/:id/subtasks', async (c) => {
  const user = c.get('user');
  const task = await getTask(c.env.DB, user.id, c.req.param('id'));
  if (!task) return c.json({ error: 'not_found' }, 404);
  const b = await body(c);
  if (!Array.isArray(b.titles) || b.titles.length === 0 || b.titles.length > 20) throw new BadRequest('titles');
  const titles = b.titles.map((t) => text(t, 'title', 200));
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM subtasks WHERE task_id = ?')
    .bind(task.id)
    .first<{ p: number }>();
  let pos = (max?.p ?? -1) + 1;
  const now = Date.now();
  const rows: SubtaskRow[] = titles.map((title) => ({
    id: crypto.randomUUID(),
    task_id: task.id,
    title,
    done: 0,
    position: pos++,
  }));
  await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare(
        'INSERT INTO subtasks (id, task_id, user_id, title, done, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      ).bind(r.id, r.task_id, user.id, r.title, r.position, now),
    ),
  );
  return c.json({ subtasks: rows.map(toSubtask) }, 201);
});

api.patch('/subtasks/:id', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.title !== undefined) {
    sets.push('title = ?');
    vals.push(text(b.title, 'title', 200));
  }
  if (b.done !== undefined) {
    if (typeof b.done !== 'boolean') throw new BadRequest('done');
    sets.push('done = ?');
    vals.push(b.done ? 1 : 0);
  }
  if (sets.length === 0) throw new BadRequest('nothing to update');
  const res = await c.env.DB.prepare(`UPDATE subtasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals, c.req.param('id'), user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

api.delete('/subtasks/:id', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare('DELETE FROM subtasks WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---------- AI ----------
api.post('/ai/breakdown', async (c) => {
  const user = c.get('user');
  const b = await body(c);
  if (typeof b.taskId !== 'string') throw new BadRequest('taskId');
  const task = await getTask(c.env.DB, user.id, b.taskId);
  if (!task) return c.json({ error: 'not_found' }, 404);
  const suggestions = await breakdownTask(c.env, task.title, task.note.slice(0, 1000));
  return c.json({ suggestions });
});
