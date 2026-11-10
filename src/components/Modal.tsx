import { animate, AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Close } from './Icons';

/**
 * Layers stack: while any modal/drawer is open, the app root and every lower layer are `inert`,
 * so nothing behind the top layer can be clicked, focused or read by assistive tech.
 */
const stack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex]';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
  );
}

function syncInert() {
  const root = document.getElementById('root');
  if (root) root.inert = stack.length > 0;
  stack.forEach((el, i) => (el.inert = i !== stack.length - 1));
  document.documentElement.classList.toggle('scroll-locked', stack.length > 0);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer' | 'sheet';
  /** Element id to focus on open; defaults to the first focusable element */
  initialFocus?: string;
  className?: string;
}

export function Modal(props: ModalProps) {
  return createPortal(<AnimatePresence>{props.open && <ModalLayer {...props} />}</AnimatePresence>, document.body);
}

function ModalLayer({ onClose, title, children, footer, variant = 'dialog', initialFocus, className }: ModalProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const layer = layerRef.current!;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(layer);
    syncInert();

    const target =
      (initialFocus && document.getElementById(initialFocus)) ||
      panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), textarea, select, button:not([data-close]), [href], [tabindex]:not([tabindex="-1"])',
      ) ||
      panelRef.current;
    target?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== layer || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab' && panelRef.current) {
        // Keep keyboard focus cycling inside the top layer
        const items = focusables(panelRef.current);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active && panelRef.current.contains(active);
        if (e.shiftKey && (!inside || active === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      syncInert();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawer = variant === 'drawer';
  const sheet = variant === 'sheet';
  const dragHandlers = useSheetDrag(panelRef, () => onCloseRef.current());

  const motionProps = drawer
    ? { initial: { x: '-105%' }, animate: { x: 0 }, exit: { x: '-105%' } }
    : sheet
      ? { initial: { y: '105%' }, animate: { y: 0 }, exit: { y: '105%' } }
      : { initial: { opacity: 0, y: 48, scale: 0.94 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 32, scale: 0.96 } };

  return (
    <div className={`layer layer-${variant}`} ref={layerRef} data-testid={drawer ? 'drawer-layer' : sheet ? 'sheet-layer' : 'modal-layer'}>
      <motion.div
        className="backdrop"
        data-testid="modal-backdrop"
        onClick={() => onCloseRef.current()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`panel glass ${variant} ${className ?? ''}`}
        {...motionProps}
        transition={{ type: 'spring', stiffness: 420, damping: drawer || sheet ? 40 : 32, mass: 0.9 }}
      >
        {sheet && (
          <div
            className="sheet-grabber"
            data-testid="sheet-grabber"
            aria-hidden="true"
            {...dragHandlers}
          >
            <span />
          </div>
        )}
        <div className="panel-head" {...(sheet ? dragHandlers : {})}>
          <h2 id={titleId} className="panel-title">
            {title}
          </h2>
          <motion.button
            type="button"
            className="icon-btn"
            aria-label="閉じる"
            data-close
            onClick={() => onCloseRef.current()}
            whileTap={{ scale: 0.88 }}
          >
            <Close size={18} />
          </motion.button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </motion.div>
    </div>
  );
}

/**
 * Drag a bottom sheet down by its grabber/header. Pulled far (or flung) → closes; otherwise springs back.
 * Uses pointer capture and the CSS `translate` property, which adds to (and never fights) the
 * open/close animation's transform. Works the same with touch, mouse and pen in every engine.
 */
function useSheetDrag(panelRef: React.RefObject<HTMLDivElement | null>, close: () => void) {
  const setOffset = (dy: number) => {
    if (panelRef.current) panelRef.current.style.translate = dy ? `0 ${dy}px` : '';
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const id = e.pointerId;
      const y0 = e.clientY;
      let dy = 0;
      const trail = [{ y: e.clientY, t: e.timeStamp }];
      // Window listeners (not element capture): the gesture is followed even if the finger leaves the
      // grabber or the element re-renders, and the release is never missed
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (ev.cancelable) ev.preventDefault();
        const raw = ev.clientY - y0;
        // Free movement downward, a stiff rubber band upward
        dy = raw > 0 ? raw : raw * 0.08;
        trail.push({ y: ev.clientY, t: ev.timeStamp });
        if (trail.length > 12) trail.shift();
        setOffset(dy);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        const recent = trail.filter((p) => ev.timeStamp - p.t < 100);
        const first = recent[0];
        const v = first ? ((ev.clientY - first.y) / Math.max(ev.timeStamp - first.t, 8)) * 1000 : 0;
        if (ev.type === 'pointerup' && (dy > 110 || (v > 700 && dy > 20))) close();
        else animate(dy, 0, { type: 'spring', stiffness: 500, damping: 38, onUpdate: setOffset });
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    },
  };
}
