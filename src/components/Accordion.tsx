import { AnimatePresence, motion } from 'motion/react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { usePrefs } from '../prefs';
import { ChevronDown } from './Icons';

interface Props {
  /** Persisted open/closed state key */
  id: string;
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Accordion({ id, title, badge, defaultOpen = true, icon, children, className }: Props) {
  const prefs = usePrefs();
  const open = prefs.isOpen(id, defaultOpen);
  const uid = useId();
  const btnId = `${uid}-btn`;
  const panelId = `${uid}-panel`;

  return (
    <section className={`accordion ${open ? 'is-open' : ''} ${className ?? ''}`} data-accordion={id}>
      <h3 className="accordion-heading">
        <motion.button
          type="button"
          id={btnId}
          className="accordion-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => prefs.setOpen(id, !open)}
          whileTap={{ scale: 0.98 }}
        >
          {icon && <span className="accordion-icon">{icon}</span>}
          <span className="accordion-title">{title}</span>
          {badge !== undefined && <span className="accordion-badge">{badge}</span>}
          <motion.span
            className="accordion-chevron"
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <ChevronDown size={16} />
          </motion.span>
        </motion.button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            aria-labelledby={btnId}
            className="accordion-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 380, damping: 36 }, opacity: { duration: 0.2 } }}
          >
            <div className="accordion-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
