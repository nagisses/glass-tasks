import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
}

type Show = (t: Omit<ToastItem, 'id'>) => void;
const Ctx = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback<Show>(
    (t) => {
      const id = ++seq.current;
      // Keep only the latest two so they never pile up over the composer
      setItems((xs) => [...xs.slice(-1), { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), t.action ? 5000 : 3000),
      );
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          <AnimatePresence>
            {items.map((t) => (
              <motion.div
                key={t.id}
                layout
                className={`toast glass ${t.tone === 'error' ? 'is-error' : ''}`}
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              >
                <span className="toast-message">{t.message}</span>
                {t.action && (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
