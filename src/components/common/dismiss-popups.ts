import { useEffect, useRef } from "react";
import { Action } from "../../types";

const DISMISS_POPUPS_EVENT = "slidep:dismiss-popups";

/**
 * Closes every open popup listening through `useDismissOnShortcut`: call it when a keyboard shortcut changes the app under them.
 * `replayed` is the history entry an undo or redo shortcut is about to replay, so a popup can stay open through one that only edits what it shows.
 */
export function dismiss_popups(replayed?: Action[]): void {
  window.dispatchEvent(
    new CustomEvent<Action[] | undefined>(DISMISS_POPUPS_EVENT, {
      detail: replayed,
    }),
  );
}

/**
 * Closes the popup when a keyboard shortcut fires, as a click elsewhere does.
 * `useNonModalPopup` already calls it; a modal popup calls it itself, unless it holds a draft a shortcut must not throw away.
 * `staysOpenThrough` spares the undos and redos whose replayed entry it accepts.
 */
export function useDismissOnShortcut(
  open: boolean,
  dismiss: () => void,
  staysOpenThrough?: (replayed: Action[]) => boolean,
): void {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const staysOpenThroughRef = useRef(staysOpenThrough);
  staysOpenThroughRef.current = staysOpenThrough;

  useEffect(() => {
    if (!open) return;
    const onDismiss = (event: Event) => {
      const replayed = (event as CustomEvent<Action[] | undefined>).detail;
      if (replayed && staysOpenThroughRef.current?.(replayed)) return;
      dismissRef.current();
    };
    window.addEventListener(DISMISS_POPUPS_EVENT, onDismiss);
    return () => window.removeEventListener(DISMISS_POPUPS_EVENT, onDismiss);
  }, [open]);
}
