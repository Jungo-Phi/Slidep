import { useEffect, useState } from "react";

/** What counts as the user doing something, anywhere in the page. */
const ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * Whether the user has done nothing — no pointer, wheel, key or touch — for `ms`.
 * A simulation running on its own is not activity: the user is watching it.
 */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms);
    const onActivity = () => {
      clearTimeout(timer);
      // Setting the same value again costs no render: the pointer moves far more often than the page needs to know.
      setIdle(false);
      timer = setTimeout(() => setIdle(true), ms);
    };
    for (const type of ACTIVITY_EVENTS)
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS)
        window.removeEventListener(type, onActivity, { capture: true });
    };
  }, [ms]);
  return idle;
}
