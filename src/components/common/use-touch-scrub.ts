import { useCallback, useEffect, useRef } from "react";
import type React from "react";

export interface TouchScrubHandlers<T extends Element> {
  onPointerDown: (event: React.PointerEvent<T>) => void;
  onPointerMove: (event: React.PointerEvent<T>) => void;
}

/**
 * Lets a finger drag along a plot the way a mouse moves over it: `onScrub` follows the finger's x.
 * A mouse is left to the plot's own mouse handlers, and a tap already reaches them through the mouse events the browser emulates for it — this is for the drag, which gets none.
 *
 * Spread the handlers on the plot and give it `touch-action: pan-y`, so a horizontal drag scrubs while a vertical one still scrolls the panel.
 * With `onRelease`, the mark left behind holds once the finger lifts, as a tap's does, until a touch lands anywhere else.
 */
export function useTouchScrub<T extends Element>(
  onScrub: (clientX: number) => void,
  onRelease?: () => void,
): TouchScrubHandlers<T> {
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  const releaseListenerRef = useRef<((event: PointerEvent) => void) | null>(
    null,
  );

  useEffect(
    () => () => {
      if (releaseListenerRef.current)
        document.removeEventListener(
          "pointerdown",
          releaseListenerRef.current,
          true,
        );
    },
    [],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrubRef.current(event.clientX);
    if (!onReleaseRef.current || releaseListenerRef.current) return;
    const plot = event.currentTarget;
    const listener = (down: PointerEvent) => {
      if (down.pointerType !== "touch" || plot.contains(down.target as Node))
        return;
      document.removeEventListener("pointerdown", listener, true);
      releaseListenerRef.current = null;
      onReleaseRef.current?.();
    };
    releaseListenerRef.current = listener;
    document.addEventListener("pointerdown", listener, true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    if (
      event.pointerType !== "touch" ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    onScrubRef.current(event.clientX);
  }, []);

  return { onPointerDown, onPointerMove };
}
