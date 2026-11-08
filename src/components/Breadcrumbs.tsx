import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'wouter';
import { ChevronRight } from './Icons';

export interface Crumb {
  label: string | null; // null = still loading
  href: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="パンくずリスト" className="breadcrumbs">
      <ol>
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <motion.li
                key={c.href}
                layout="position"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className={last ? 'is-current' : ''}
              >
                {i > 0 && <ChevronRight size={13} className="crumb-sep" />}
                {c.label === null ? (
                  <span className="sk sk-pill crumb-skeleton" aria-label="読み込み中" />
                ) : last ? (
                  <span className="crumb" aria-current="page">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="crumb crumb-link">
                    {c.label}
                  </Link>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </nav>
  );
}
