import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { forwardRef, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Status, Task } from '../api';
import { dueInfo, NEXT_STATUS, PRIORITY_LABEL, STATUS_LABEL } from '../format';
import { Calendar, Check, Play, Trash, Undo } from './Icons';

const THRESHOLD = 80;
// A fast flick also counts, but only after a clear horizontal move (avoids accidental triggers)
const FLICK_VELOCITY = 900;
const FLICK_MIN = 56;
const SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const;

interface Props {
  task: Task;
  listName?: string;
  onAdvance: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const ADVANCE_LOOK: Record<Status, { label: string; tone: string; icon: ReactNode }> = {
  todo: { label: '未着手に戻す', tone: 'blue', icon: <Undo size={20} /> },
  doing: { label: '進行中にする', tone: 'orange', icon: <Play size={18} /> },
  done: { label: '完了にする', tone: 'green', icon: <Check size={20} /> },
};

export function StatusIcon({ status }: { status: Status }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className={`status-icon is-${status}`}>
      <circle cx="12" cy="12" r="10" className="status-ring" />
      {status === 'doing' && <path d="M12 5a7 7 0 010 14z" className="status-half" />}
      {status === 'done' && (
        <>
          <circle cx="12" cy="12" r="10" className="status-fill" />
          <motion.path
            d="M7.5 12.5l3 3 6-6.5"
            className="status-check"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          />
        </>
      )}
    </svg>
  );
}

/** One task. Swipe right → next status, swipe left → delete. Tap the title to open details. */
export const TaskRow = forwardRef<HTMLLIElement, Props>(function TaskRow({ task, listName, onAdvance, onDelete }, ref) {
  const x = useMotionValue(0);
  const [armed, setArmed] = useState<'advance' | 'delete' | null>(null);
  const armedRef = useRef<typeof armed>(null);
  // Tracked synchronously from raw pointer events: Motion reports drag start a frame late,
  // so a very fast swipe could otherwise end with a click that opens the task.
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useMotionValueEvent(x, 'change', (v) => {
    const a = v > THRESHOLD ? 'advance' : v < -THRESHOLD ? 'delete' : null;
    if (a !== armedRef.current) {
      armedRef.current = a;
      setArmed(a);
      if (a) navigator.vibrate?.(8);
    }
  });

  const leftOpacity = useTransform(x, [0, 20, THRESHOLD], [0, 0.55, 1]);
  const rightOpacity = useTransform(x, [-THRESHOLD, -20, 0], [1, 0.55, 0]);
  const leftIconScale = useTransform(x, [0, THRESHOLD, THRESHOLD * 2], [0.5, 1, 1.15]);
  const rightIconScale = useTransform(x, [-THRESHOLD * 2, -THRESHOLD, 0], [1.15, 1, 0.5]);

  const next = NEXT_STATUS[task.status];
  const look = ADVANCE_LOOK[next];
  const due = dueInfo(task.dueDate);
  const href = `/lists/${task.listId}/tasks/${task.id}`;

  const settle = (_: unknown, info: { velocity: { x: number } }) => {
    const v = x.get();
    const vx = info.velocity.x;
    const width = rowRef.current?.offsetWidth ?? 360;
    if (v > THRESHOLD || (vx > FLICK_VELOCITY && v > FLICK_MIN)) {
      animate(x, width, { duration: 0.2, ease: [0.4, 0, 1, 1] }).then(() => onAdvance(task));
    } else if (v < -THRESHOLD || (vx < -FLICK_VELOCITY && v < -FLICK_MIN)) {
      animate(x, -width, { duration: 0.2, ease: [0.4, 0, 1, 1] }).then(() => onDelete(task));
    } else {
      animate(x, 0, SPRING);
    }
  };

  return (
    <motion.li
      ref={ref}
      layout="position"
      className="task-item"
      data-testid="task-row"
      data-status={task.status}
      data-task-id={task.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
      transition={{ height: SPRING, opacity: { duration: 0.2 } }}
    >
      <div className="swipe-actions" aria-hidden="true">
        <motion.div className={`swipe-action swipe-left tone-${look.tone} ${armed === 'advance' ? 'is-armed' : ''}`} style={{ opacity: leftOpacity }}>
          <motion.span style={{ scale: leftIconScale }}>{look.icon}</motion.span>
          <span className="swipe-label">{STATUS_LABEL[next]}</span>
        </motion.div>
        <motion.div className={`swipe-action swipe-right tone-red ${armed === 'delete' ? 'is-armed' : ''}`} style={{ opacity: rightOpacity }}>
          <span className="swipe-label">削除</span>
          <motion.span style={{ scale: rightIconScale }}>
            <Trash size={20} />
          </motion.span>
        </motion.div>
      </div>
      <motion.div
        ref={rowRef}
        className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onDragEnd={settle}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
        }}
        onClickCapture={(e) => {
          if (press.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        data-testid="task-swipe"
      >
        <motion.button
          type="button"
          className="status-btn"
          aria-label={`${task.title}を${look.label}`}
          onClick={() => onAdvance(task)}
          whileTap={{ scale: 0.8 }}
        >
          <StatusIcon status={task.status} />
        </motion.button>
        <Link href={href} className="task-main" draggable={false}>
          <span className="task-title">{task.title}</span>
          {(listName || due || task.priority !== 'medium' || task.subtaskCount > 0) && (
            <span className="task-meta">
              {task.priority !== 'medium' && (
                <span className={`chip chip-priority is-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
              )}
              {due && (
                <span className={`chip chip-due is-${due.tone}`}>
                  <Calendar size={12} />
                  {due.label}
                </span>
              )}
              {task.subtaskCount > 0 && (
                <span className="chip chip-sub">
                  {task.subtaskDone}/{task.subtaskCount}
                </span>
              )}
              {listName && <span className="chip chip-list">{listName}</span>}
            </span>
          )}
        </Link>
      </motion.div>
    </motion.li>
  );
});
