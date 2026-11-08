import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { load, save } from './storage';

export type SortKey = 'new' | 'due' | 'priority';

interface Prefs {
  sort: SortKey;
  showDone: boolean;
  open: Record<string, boolean>;
}

interface PrefsCtx extends Prefs {
  setSort: (s: SortKey) => void;
  setShowDone: (v: boolean) => void;
  isOpen: (key: string, fallback: boolean) => boolean;
  setOpen: (key: string, v: boolean) => void;
}

const KEY = 'gt.prefs.v1';
const Ctx = createContext<PrefsCtx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ sort: 'new', showDone: true, open: {}, ...load<Partial<Prefs>>(KEY, {}) }));

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      save(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<PrefsCtx>(
    () => ({
      ...prefs,
      setSort: (sort) => update({ sort }),
      setShowDone: (showDone) => update({ showDone }),
      isOpen: (key, fallback) => prefs.open[key] ?? fallback,
      setOpen: (key, v) => update({ open: { ...prefs.open, [key]: v } }),
    }),
    [prefs, update],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('PrefsProvider missing');
  return c;
}
