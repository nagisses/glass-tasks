import { animate } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

type Edges = { t: number; r: number; b: number; l: number };
type Edge = keyof Edges;

type Tween = { duration: number; ease: [number, number, number, number] };
const LEAD: Tween = { duration: 0.36, ease: [0.215, 0.61, 0.355, 1] }; // power3.out
const TRAIL: Tween = { duration: 0.55, ease: [0.645, 0.045, 0.355, 1] }; // power3.inOut

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Elastic sliding pill. The pill layer covers the whole container and is cut out with
 * `clip-path: inset()`. When the target changes, the leading edge shoots ahead and the
 * trailing edge catches up later, so the pill stretches and then snaps to the new item.
 *
 * @param container element the pill layer is positioned in (position: relative)
 * @param pill the full-size layer that gets clipped
 * @param findTarget returns the element to highlight (null hides the pill)
 * @param axis direction items are laid out in
 * @param key changes whenever the target may have moved (e.g. the selected value)
 */
export function useElasticPill(
  container: RefObject<HTMLElement | null>,
  pill: RefObject<HTMLElement | null>,
  findTarget: () => HTMLElement | null,
  axis: 'x' | 'y',
  key: unknown,
  radius = 10,
) {
  const st = useRef<Edges | null>(null);
  const runs = useRef<{ stop: () => void }[]>([]);
  const lastBox = useRef<HTMLElement | null>(null);
  const find = useRef(findTarget);
  find.current = findTarget;

  useLayoutEffect(() => {
    const box = container.current;
    const layer = pill.current;
    if (!box || !layer) return;

    const paint = () => {
      const s = st.current;
      if (!s) return;
      layer.style.clipPath = `inset(${s.t}px ${s.r}px ${s.b}px ${s.l}px round ${radius}px)`;
    };
    const stop = () => {
      runs.current.forEach((r) => r.stop());
      runs.current = [];
    };
    const measure = (): Edges | null => {
      const target = find.current();
      if (!target || !box.contains(target) || target.offsetWidth === 0 || target.offsetHeight === 0) return null;
      // Layout offsets (not screen rects), so running transforms such as page transitions don't skew it
      let l = 0;
      let t = 0;
      let el = target;
      // Walk up the offsetParent chain until the (positioned) container
      for (;;) {
        l += el.offsetLeft;
        t += el.offsetTop;
        const parent = el.offsetParent as HTMLElement | null;
        if (parent === box) break;
        if (!parent || !box.contains(parent)) return null;
        l += parent.clientLeft - parent.scrollLeft;
        t += parent.clientTop - parent.scrollTop;
        el = parent;
      }
      return { l, t, r: box.clientWidth - l - target.offsetWidth, b: box.clientHeight - t - target.offsetHeight };
    };
    const place = (to: Edges | null) => {
      stop();
      layer.style.opacity = to ? '1' : '0';
      if (!to) {
        st.current = null;
        return;
      }
      st.current = { ...to };
      paint();
    };

    const to = measure();
    // A freshly mounted container (e.g. a menu that was just opened) starts in place
    const from = lastBox.current === box ? st.current : null;
    lastBox.current = box;
    if (!to || !from || reducedMotion()) {
      place(to);
    } else {
      stop();
      layer.style.opacity = '1';
      const s = from;
      const fwd = axis === 'y' ? to.t > s.t : to.l > s.l;
      const [lead, trail]: Edge[] = axis === 'y' ? (fwd ? ['b', 't'] : ['t', 'b']) : fwd ? ['r', 'l'] : ['l', 'r'];
      // The cross axis jumps straight to the new size
      for (const e of (axis === 'y' ? ['l', 'r'] : ['t', 'b']) as Edge[]) s[e] = to[e];
      const tween = (edge: Edge, opts: Tween) =>
        animate(s[edge], to[edge], {
          ...opts,
          onUpdate: (v) => {
            s[edge] = v;
            paint();
          },
        });
      runs.current = [tween(lead, LEAD), tween(trail, TRAIL)];
      paint();
    }

    // Layout changes (resize, accordion opening, fonts) re-snap without animation.
    // Only a real size change counts: some engines (WebKit) report the box again right after a tap,
    // which must not cut the slide short.
    let size = `${box.clientWidth}x${box.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${box.clientWidth}x${box.clientHeight}`;
      if (now === size) return;
      size = now;
      place(measure());
    });
    ro.observe(box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, axis, radius]);

  useLayoutEffect(
    () => () => {
      runs.current.forEach((r) => r.stop());
    },
    [],
  );
}
