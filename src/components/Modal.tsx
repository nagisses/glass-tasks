import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
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
  variant?: 'dialog' | 'drawer';
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

  return (
    <div className={`layer layer-${variant}`} ref={layerRef} data-testid={drawer ? 'drawer-layer' : 'modal-layer'}>
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
        className={`panel glass ${drawer ? 'drawer' : 'dialog'} ${className ?? ''}`}
        initial={drawer ? { x: '-105%' } : { opacity: 0, y: 48, scale: 0.94 }}
        animate={drawer ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
        exit={drawer ? { x: '-105%' } : { opacity: 0, y: 32, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: drawer ? 40 : 32, mass: 0.9 }}
      >
        <div className="panel-head">
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
