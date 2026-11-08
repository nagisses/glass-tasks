import { motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';

export interface Slide {
  key: string;
  image: string;
  title?: ReactNode;
  meta?: ReactNode;
  /** Accessible name of the slide's button */
  label: string;
}

interface Props {
  label: string;
  slides: Slide[];
  /** Called when the centered slide is pressed */
  onSelect?: (index: number) => void;
  /** Called whenever the centered slide changes */
  onIndexChange?: (index: number) => void;
  initialIndex?: number;
  variant?: 'hero' | 'picker';
}

/**
 * Horizontal image carousel: native scroll-snap for momentum swiping on touch,
 * arrow buttons and dots for pointer/keyboard. Off-center slides shrink and fade.
 */
export function Carousel({ label, slides, onSelect, onIndexChange, initialIndex = 0, variant = 'hero' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const frame = useRef(0);
  // Where a button-initiated scroll is heading, so rapid "next" presses keep advancing
  const targetRef = useRef<number | null>(null);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const mid = el.offsetLeft + el.offsetWidth / 2;
      const d = (mid - center) / el.offsetWidth;
      el.style.setProperty('--d', String(Math.max(-1, Math.min(1, d))));
      el.style.setProperty('--ad', String(Math.min(1, Math.abs(d))));
      if (Math.abs(d) < bestDist) {
        bestDist = Math.abs(d);
        best = i;
      }
    });
    if (targetRef.current === best) targetRef.current = null;
    if (best !== indexRef.current) {
      indexRef.current = best;
      setIndex(best);
      onIndexChangeRef.current?.(best);
    }
  }, []);

  const goTo = useCallback((i: number, smooth = true) => {
    const track = trackRef.current;
    const el = track?.children[i] as HTMLElement | undefined;
    if (!track || !el) return;
    targetRef.current = i === indexRef.current ? null : i;
    track.scrollTo({
      left: el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2,
      behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto',
    });
  }, []);

  useLayoutEffect(() => {
    goTo(initialIndex, false);
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure, slides.length]);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  };

  const count = slides.length;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  const base = () => targetRef.current ?? indexRef.current;

  return (
    <section
      className={`carousel carousel-${variant}`}
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goTo(clamp(base() + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goTo(clamp(base() - 1));
        }
      }}
    >
      <div
        className="carousel-track"
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (targetRef.current = null)}
        onWheel={() => (targetRef.current = null)}
        data-testid="carousel-track"
      >
        {slides.map((s, i) => (
          <div
            key={s.key}
            className={`carousel-slide ${i === index ? 'is-active' : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}`}
            aria-current={i === index ? 'true' : undefined}
          >
            <button
              type="button"
              className="carousel-card"
              aria-label={s.label}
              tabIndex={i === index ? 0 : -1}
              onClick={() => {
                if (i !== indexRef.current) goTo(i);
                else onSelect?.(i);
              }}
            >
              <img className="carousel-image" src={s.image} alt="" draggable={false} loading={i < 3 ? 'eager' : 'lazy'} />
              {(s.title || s.meta) && (
                <span className="carousel-caption glass">
                  {s.title && <span className="carousel-title">{s.title}</span>}
                  {s.meta && <span className="carousel-meta">{s.meta}</span>}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
      <div className="carousel-controls">
        <motion.button
          type="button"
          className="icon-btn carousel-arrow"
          aria-label="前へ"
          onClick={() => goTo(clamp(base() - 1))}
          disabled={index === 0}
          whileTap={{ scale: 0.86 }}
        >
          <ChevronLeft size={18} />
        </motion.button>
        <div className="carousel-dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`carousel-dot ${i === index ? 'is-active' : ''}`}
              aria-label={`${i + 1}枚目を表示`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <motion.button
          type="button"
          className="icon-btn carousel-arrow"
          aria-label="次へ"
          onClick={() => goTo(clamp(base() + 1))}
          disabled={index === count - 1}
          whileTap={{ scale: 0.86 }}
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>
    </section>
  );
}
