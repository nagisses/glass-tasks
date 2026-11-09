import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ArrowDown } from './Icons';

/** Distance (after resistance) the page has to be pulled before letting go refreshes */
export const PULL_THRESHOLD = 70;
const MAX_PULL = 130;
const HOLD = 56;
const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const;

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/**
 * Pull to refresh: drag the page down from the very top and let go to reload.
 * Returns the offset the page content should follow and the indicator element.
 * Uses touch events (the gesture only exists on touch screens) and ignores touches
 * that start in the composer, a dialog, or while the page is scrolled.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled = true): [MotionValue<number>, ReactElement] {
  const y = useMotionValue(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  const set = (p: Phase) => {
    if (phaseRef.current === p) return;
    if (p === 'armed') navigator.vibrate?.(8);
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let pulling = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as Element | null;
      start = null;
      pulling = false;
      if (!t || e.touches.length > 1 || phaseRef.current === 'refreshing') return;
      if (window.scrollY > 0 || document.documentElement.classList.contains('scroll-locked')) return;
      if (target?.closest?.('.composer, [role="dialog"], [role="listbox"], input, textarea')) return;
      start = { x: t.clientX, y: t.clientY };
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Only a mostly-vertical downward pull counts; anything else is left to the browser
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          start = null;
          return;
        }
        pulling = true;
        set('pulling');
      }
      if (e.cancelable) e.preventDefault();
      // Rubber-band resistance: the further you pull, the less it moves
      const d = Math.max(0, dy);
      const resisted = MAX_PULL * (1 - Math.exp(-d / (MAX_PULL * 1.6)));
      y.set(resisted);
      set(resisted >= PULL_THRESHOLD ? 'armed' : 'pulling');
    };

    const onEnd = () => {
      if (!pulling) {
        start = null;
        return;
      }
      pulling = false;
      start = null;
      if (phaseRef.current === 'armed') {
        set('refreshing');
        animate(y, HOLD, SPRING);
        const minWait = new Promise((r) => setTimeout(r, 600));
        Promise.allSettled([refresh.current(), minWait]).then(() => {
          set('idle');
          animate(y, 0, SPRING);
        });
      } else {
        set('idle');
        animate(y, 0, SPRING);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    // Non-passive so the pull can stop the browser's own overscroll / reload
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const indicator = <PullIndicator y={y} phase={phase} />;
  return [y, indicator];
}

function PullIndicator({ y, phase }: { y: MotionValue<number>; phase: Phase }) {
  const opacity = useTransform(y, [0, 24, PULL_THRESHOLD], [0, 0.6, 1]);
  const scale = useTransform(y, [0, PULL_THRESHOLD], [0.6, 1]);
  const top = useTransform(y, (v) => v / 2 - 22);
  const rotate = useTransform(y, [0, PULL_THRESHOLD], [0, 180]);
  return (
    <motion.div
      className={`ptr is-${phase}`}
      style={{ opacity, scale, y: top }}
      data-testid="ptr"
      data-phase={phase}
      aria-hidden="true"
    >
      <span className="ptr-bubble glass">
        {phase === 'refreshing' ? (
          <span className="ptr-spinner" />
        ) : (
          <motion.span style={{ rotate }} className="ptr-arrow">
            <ArrowDown size={18} />
          </motion.span>
        )}
      </span>
    </motion.div>
  );
}
