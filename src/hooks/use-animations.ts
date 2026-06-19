import { useEffect, useRef, useState } from "react";

/**
 * Returns true once the component has mounted (after first paint). Useful for
 * triggering enter transitions such as bars growing from 0 to their value.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/**
 * Observes an element and reports when it first scrolls into view. Stays true
 * once seen so enter animations only play once.
 */
const DEFAULT_IN_VIEW_OPTIONS: IntersectionObserverInit = {
  rootMargin: "0px 0px -10% 0px",
  threshold: 0.15,
};

export function useInView<T extends Element = HTMLDivElement>(
  options: IntersectionObserverInit = DEFAULT_IN_VIEW_OPTIONS,
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      }
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
    // options is intentionally not in deps — it is a stable config object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}

/**
 * Animates a number toward `target` once `active` is true, tweening from the
 * previously displayed value on each change. Returns the current value.
 * Works for one-shot reveals (target stable) and live values that update.
 */
export function useCountUp(target: number, active: boolean, durationMs = 900): number {
  const [value, setValue] = useState(active ? target : 0);
  const fromRef = useRef(active ? target : 0);

  useEffect(() => {
    if (!active) return;
    const from = fromRef.current;

    if (!Number.isFinite(target) || from === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic for a lively-but-settling feel.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      fromRef.current = current;
      setValue(current);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);

  return value;
}
