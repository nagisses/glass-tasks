import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Status, Task } from '../api';
import { dueInfo, NEXT_STATUS, PRIORITY_LABEL, STATUS_LABEL } from '../format';
import { Calendar, Check, Play, Sliders, Trash, Undo } from './Icons';

/** Width of the revealed buttons: one on the left (status), two on the right (edit + delete) */
const OPEN_LEFT = 92;
const OPEN_RIGHT = 160;
// A fast flick to the right changes the status at once (deleting always needs a button or a long pull)
const FLICK_VELOCITY = 500;
const FLICK_MIN = 56;
const SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const;

/** Only one row is open at a time */
let closeOpenRow: (() => void) | null = null;

interface Props {
  task: Task;
  listName?: string;
  onAdvance: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
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

/**
 * One task. Swipe sideways to reveal action buttons (iOS Mail style):
 * right → next status, left → edit / delete. Pull all the way (or flick right) to run the action directly.
 * Tap the title to open details.
 */
export const TaskRow = forwardRef<HTMLLIElement, Props>(function TaskRow({ task, listName, onAdvance, onDelete, onEdit }, ref) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  const [full, setFull] = useState<'advance' | 'delete' | null>(null);
  const fullRef = useRef<typeof full>(null);
  // Tracked synchronously from raw pointer events: Motion reports drag start a frame late,
  // so a very fast swipe could otherwise end with a click that opens the task.
  const press = useRef<{ x: number; y: number; moved: boolean; settled: boolean; trail: { x: number; t: number }[]; upAt?: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLLIElement | null>(null);

  const fullAt = () => Math.max(OPEN_RIGHT + 70, (rowRef.current?.offsetWidth ?? 360) * 0.58);

  useMotionValueEvent(x, 'change', (v) => {
    const limit = fullAt();
    const f = v > limit ? 'advance' : v < -limit ? 'delete' : null;
    if (f !== fullRef.current) {
      fullRef.current = f;
      setFull(f);
      if (f) navigator.vibrate?.(8);
    }
  });

  const leftWidth = useTransform(x, (v) => Math.max(0, v));
  const rightWidth = useTransform(x, (v) => Math.max(0, -v));
  const leftIconScale = useTransform(x, [0, OPEN_LEFT * 0.6, OPEN_LEFT], [0.4, 0.8, 1]);
  const rightIconScale = useTransform(x, [-OPEN_RIGHT, -OPEN_RIGHT * 0.4, 0], [1, 0.8, 0.4]);

  const close = () => {
    animate(x, 0, SPRING);
    setOpen(null);
    if (closeOpenRow === close) closeOpenRow = null;
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  const openTo = (side: 'left' | 'right') => {
    if (closeOpenRow && closeOpenRow !== closeRef.current) closeOpenRow();
    closeOpenRow = closeRef.current;
    setOpen(side);
    animate(x, side === 'left' ? OPEN_LEFT : -OPEN_RIGHT, SPRING);
  };

  // An open row closes when anything else on the page is touched
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!itemRef.current?.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  useEffect(
    () => () => {
      if (closeOpenRow === closeRef.current) closeOpenRow = null;
    },
    [],
  );

  const next = NEXT_STATUS[task.status];
  const look = ADVANCE_LOOK[next];
  const due = dueInfo(task.dueDate);
  const href = `/lists/${task.listId}/tasks/${task.id}`;

  const runAdvance = () => {
    setOpen(null);
    animate(x, 0, SPRING);
    onAdvance(task);
  };
  const runDelete = () => {
    const width = rowRef.current?.offsetWidth ?? 360;
    setOpen(null);
    animate(x, -width, { duration: 0.2, ease: [0.4, 0, 1, 1] }).then(() => onDelete(task));
  };

  /** Finger speed over the last ~100ms, from raw pointer events (px/s); 0 if it stopped before letting go */
  const pointerVelocity = () => {
    const trail = press.current?.trail ?? [];
    // Measured against the moment the finger lifted, not when this runs (that can lag on a busy device)
    const now = press.current?.upAt ?? performance.now();
    const last = trail[trail.length - 1];
    if (!last || now - last.t > 120) return 0;
    const first = trail.find((p) => last.t - p.t <= 100) ?? last;
    const dt = Math.max(last.t - first.t, 8);
    return ((last.x - first.x) / dt) * 1000;
  };
  /**
   * Still moving fast when the finger lifted, judged by distance per move event (works even when a
   * busy device delivers events late and timing-based speed comes out too low).
   */
  const releasedMoving = () => {
    const trail = press.current?.trail ?? [];
    const upAt = press.current?.upAt;
    if (trail.length < 2 || upAt === undefined || upAt - trail[trail.length - 1].t > 250) return 0;
    // Busy browsers merge move events, so use however many recent ones there are (up to 4)
    const recent = trail.slice(-4);
    return (recent[recent.length - 1].x - recent[0].x) / (recent.length - 1);
  };

  const settle = (_: unknown, info: { velocity: { x: number } }) => {
    // Runs once per press: either from Motion's onDragEnd or from the pointer-up fallback below
    if (press.current) {
      if (press.current.settled) return;
      press.current.settled = true;
    }
    const v = x.get();
    const own = pointerVelocity();
    const vx = Math.abs(own) > Math.abs(info.velocity.x) ? own : info.velocity.x;
    const width = rowRef.current?.offsetWidth ?? 360;
    const limit = fullAt();
    const flick = vx > FLICK_VELOCITY || releasedMoving() >= 8;
    if (v > limit || (open === null && flick && v > FLICK_MIN)) {
      animate(x, width, { duration: 0.2, ease: [0.4, 0, 1, 1] }).then(() => {
        x.set(0);
        setOpen(null);
        onAdvance(task);
      });
    } else if (v < -limit) {
      runDelete();
    } else if (v > OPEN_LEFT / 2 && !(open === 'left' && vx < -400)) {
      openTo('left');
    } else if (v < -OPEN_RIGHT / 2.5 && !(open === 'right' && vx > 400)) {
      openTo('right');
    } else {
      close();
    }
  };

  const setRefs = (el: HTMLLIElement | null) => {
    itemRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <motion.li
      ref={setRefs}
      layout="position"
      className="task-item"
      data-testid="task-row"
      data-status={task.status}
      data-task-id={task.id}
      data-open={open ?? undefined}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
      transition={{ height: SPRING, opacity: { duration: 0.2 } }}
    >
      <motion.div className="swipe-tray swipe-tray-left" style={{ width: leftWidth }} aria-hidden={open !== 'left'}>
        <button
          type="button"
          className={`swipe-btn tone-${look.tone}`}
          tabIndex={open === 'left' ? 0 : -1}
          aria-label={`ステータスを${STATUS_LABEL[next]}に`}
          onClick={runAdvance}
        >
          <motion.span className="swipe-btn-inner" style={{ scale: leftIconScale }}>
            {look.icon}
            <span className="swipe-label">{STATUS_LABEL[next]}</span>
          </motion.span>
        </button>
      </motion.div>
      <motion.div
        className={`swipe-tray swipe-tray-right ${full === 'delete' ? 'is-full' : ''}`}
        style={{ width: rightWidth }}
        aria-hidden={open !== 'right'}
      >
        <button
          type="button"
          className="swipe-btn swipe-btn-edit tone-gray"
          tabIndex={open === 'right' ? 0 : -1}
          aria-label="編集"
          onClick={() => {
            close();
            onEdit(task);
          }}
        >
          <motion.span className="swipe-btn-inner" style={{ scale: rightIconScale }}>
            <Sliders size={19} />
            <span className="swipe-label">編集</span>
          </motion.span>
        </button>
        <button
          type="button"
          className="swipe-btn swipe-btn-delete tone-red"
          tabIndex={open === 'right' ? 0 : -1}
          aria-label="削除"
          onClick={runDelete}
        >
          <motion.span className="swipe-btn-inner" style={{ scale: rightIconScale }}>
            <Trash size={19} />
            <span className="swipe-label">削除</span>
          </motion.span>
        </button>
      </motion.div>
      <motion.div
        ref={rowRef}
        className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onDragEnd={settle}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, y: e.clientY, moved: false, settled: false, trail: [{ x: e.clientX, t: e.timeStamp }] };
          const current = press.current;
          // Fallback: if a gesture ends too fast for Motion to report drag end, still settle the row
          const onUp = (ev: PointerEvent) => {
            current.upAt = ev.timeStamp;
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
            setTimeout(() => {
              const rest = open === 'left' ? OPEN_LEFT : open === 'right' ? -OPEN_RIGHT : 0;
              if (press.current === current && !current.settled && x.get() !== rest && !x.isAnimating()) {
                settle(undefined, { velocity: { x: 0 } });
              }
            }, 160);
          };
          // Capture phase: runs before Motion's own drag-end handling
          window.addEventListener('pointerup', onUp, true);
          window.addEventListener('pointercancel', onUp, true);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
          p.trail.push({ x: e.clientX, t: e.timeStamp });
          if (p.trail.length > 12) p.trail.shift();
        }}
        onClickCapture={(e) => {
          if (press.current?.moved || open) {
            e.preventDefault();
            e.stopPropagation();
            // Tapping an open row just closes it
            if (open && !press.current?.moved) close();
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
