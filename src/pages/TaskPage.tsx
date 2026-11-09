import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import type { Priority, Status, Subtask, Task } from '../api';
import { ApiError } from '../api';
import { Accordion } from '../components/Accordion';
import { AiBreakdownModal } from '../components/AiBreakdownModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Dropdown } from '../components/Dropdown';
import { Check, Close, Plus, Sparkles, Trash } from '../components/Icons';
import { RadioGroup } from '../components/RadioGroup';
import { TaskSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { COVER_TINT, PRIORITY_LABEL, STATUS_LABEL } from '../format';
import {
  useAddSubtasks,
  useDeleteSubtask,
  useFeatures,
  useLists,
  useTaskDetail,
  useUpdateSubtask,
  useUpdateTask,
} from '../hooks';
import { useTaskActions } from '../useTaskActions';
import { ErrorState, NotFound } from './common';

const imeGuard = (e: KeyboardEvent) => e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229);

export function TaskPage({ listId, taskId }: { listId: string; taskId: string }) {
  const detail = useTaskDetail(taskId);
  const [, navigate] = useLocation();

  // Keep the URL in sync if the task lives in another list (e.g. after moving it)
  const realList = detail.data?.task.listId;
  useEffect(() => {
    if (realList && realList !== listId) navigate(`/lists/${realList}/tasks/${taskId}`, { replace: true });
  }, [realList, listId, taskId, navigate]);

  if (detail.isPending) return <TaskSkeleton />;
  if (detail.isError) {
    return detail.error instanceof ApiError && detail.error.status === 404 ? (
      <NotFound />
    ) : (
      <ErrorState onRetry={() => detail.refetch()} />
    );
  }
  return <TaskDetail task={detail.data.task} subtasks={detail.data.subtasks} />;
}

function TaskDetail({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const update = useUpdateTask();
  const lists = useLists();
  const toast = useToast();
  const { remove } = useTaskActions();
  const [, navigate] = useLocation();
  const [aiOpen, setAiOpen] = useState(false);
  const features = useFeatures();
  const [confirm, setConfirm] = useState(false);

  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ id: task.id, patch }, { onError: () => toast({ message: '保存できませんでした', tone: 'error' }) });

  // ----- title -----
  const [title, setTitle] = useState(task.title);
  const titleFocused = useRef(false);
  useEffect(() => {
    if (!titleFocused.current) setTitle(task.title);
  }, [task.title]);
  const commitTitle = () => {
    titleFocused.current = false;
    const t = title.trim();
    if (!t) setTitle(task.title);
    else if (t !== task.title) save({ title: t });
  };

  // ----- note (autosave) -----
  const [note, setNote] = useState(task.note);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestNote = useRef({ note: task.note, saved: task.note });
  useEffect(() => {
    latestNote.current.note = note;
  }, [note]);
  const flushNote = () => {
    clearTimeout(noteTimer.current);
    const { note: n, saved } = latestNote.current;
    if (n !== saved) {
      latestNote.current.saved = n;
      save({ note: n });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushNote(), []);

  const done = subtasks.filter((s) => s.done).length;

  // ----- due date -----
  const [due, setDue] = useState(task.dueDate ?? '');
  useEffect(() => {
    setDue(task.dueDate ?? '');
  }, [task.dueDate]);
  const changeDue = (v: string) => {
    setDue(v);
    save({ dueDate: v || null });
  };

  return (
    <article className="task-detail">
      <motion.div
        className="card glass"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <textarea
          className="title-input"
          aria-label="タスク名"
          value={title}
          rows={1}
          maxLength={200}
          onFocus={() => (titleFocused.current = true)}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !imeGuard(e)) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />

        <RadioGroup<Status>
          legend="ステータス"
          name="status"
          value={task.status}
          onChange={(status) => save({ status })}
          options={(['todo', 'doing', 'done'] as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s], tone: s }))}
        />
        <RadioGroup<Priority>
          legend="優先度"
          name="priority"
          value={task.priority}
          onChange={(priority) => save({ priority })}
          options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({
            value: p,
            label: PRIORITY_LABEL[p],
            tone: p,
          }))}
        />

        <div className="field-row">
          <span className="field-label" id="list-field">
            リスト
          </span>
          {lists.data ? (
            <Dropdown
              label="リスト"
              value={task.listId}
              align="end"
              options={lists.data.map((l) => ({
                value: l.id,
                label: l.name,
                icon: <span className="list-dot" style={{ background: COVER_TINT[l.cover] }} />,
              }))}
              onChange={(listId) => {
                if (listId === task.listId) return;
                save({ listId });
                navigate(`/lists/${listId}/tasks/${task.id}`, { replace: true });
                toast({ message: `${lists.data!.find((l) => l.id === listId)?.name ?? ''}に移動しました` });
              }}
            />
          ) : (
            <span className="sk sk-pill" style={{ width: 120 }} />
          )}
        </div>

        <div className="field-row">
          <label className="field-label" htmlFor="due-date">
            期限
          </label>
          <div className="date-field">
            <input
              id="due-date"
              type="date"
              className="date-input"
              value={due}
              onChange={(e) => changeDue(e.target.value)}
            />
            <AnimatePresence>
              {due && (
                <motion.button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label="期限をクリア"
                  onClick={() => changeDue('')}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Close size={14} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <Accordion id="task:subtasks" title="サブタスク" badge={subtasks.length ? `${done}/${subtasks.length}` : undefined}>
        <Subtasks taskId={task.id} subtasks={subtasks} />
        {features.ai && (
          <motion.button type="button" className="btn btn-ai" onClick={() => setAiOpen(true)} whileTap={{ scale: 0.96 }}>
            <Sparkles size={17} />
            AIで分解
          </motion.button>
        )}
      </Accordion>

      <Accordion id="task:note" title="メモ">
        <textarea
          className="note-input glass"
          aria-label="メモ"
          value={note}
          maxLength={5000}
          rows={4}
          onChange={(e) => {
            setNote(e.target.value);
            clearTimeout(noteTimer.current);
            noteTimer.current = setTimeout(flushNote, 700);
          }}
          onBlur={flushNote}
        />
      </Accordion>

      <motion.button type="button" className="btn btn-danger-ghost" onClick={() => setConfirm(true)} whileTap={{ scale: 0.97 }}>
        <Trash size={17} />
        タスクを削除
      </motion.button>

      {features.ai && <AiBreakdownModal task={task} open={aiOpen} onClose={() => setAiOpen(false)} />}
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="このタスクを削除しますか？"
        confirmLabel="削除"
        onConfirm={() => {
          remove(task);
          navigate(`/lists/${task.listId}`);
        }}
      />
    </article>
  );
}

function Subtasks({ taskId, subtasks }: { taskId: string; subtasks: Subtask[] }) {
  const add = useAddSubtasks(taskId);
  const update = useUpdateSubtask(taskId);
  const del = useDeleteSubtask(taskId);
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    add.mutate([t]);
    setText('');
  };

  return (
    <div className="subtasks">
      {subtasks.length > 0 && (
        <ul className="subtask-list glass">
          <AnimatePresence initial={false}>
            {subtasks.map((s) => (
              <SubtaskItem
                key={s.id}
                subtask={s}
                onToggle={(done) => update.mutate({ id: s.id, done })}
                onDelete={() => del.mutate(s.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <form className="subtask-add" onSubmit={submit}>
        <Plus size={16} />
        <input
          className="subtask-input"
          placeholder="サブタスクを追加"
          aria-label="サブタスクを追加"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => imeGuard(e) && e.preventDefault()}
          enterKeyHint="done"
        />
      </form>
    </div>
  );
}

function SubtaskItem({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}) {
  const [done, setDone] = useState(subtask.done);
  useEffect(() => {
    setDone(subtask.done);
  }, [subtask.done]);
  return (
    <motion.li
      layout="position"
      className={`subtask ${done ? 'is-done' : ''}`}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <label className="check-row">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            setDone(e.target.checked);
            onToggle(e.target.checked);
          }}
        />
        <span className="checkbox" aria-hidden="true">
          <Check size={13} />
        </span>
        <span className="subtask-title">{subtask.title}</span>
      </label>
      <button type="button" className="icon-btn icon-btn-sm subtask-delete" aria-label={`${subtask.title}を削除`} onClick={onDelete}>
        <Close size={14} />
      </button>
    </motion.li>
  );
}
