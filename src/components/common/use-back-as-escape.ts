import { useEffect, useRef } from "react";

const SENTINEL_KEY = "slidepBackSentinel";

/** An open MUI dialog, menu or popover: each closes on Escape. */
const OPEN_MODAL_SELECTOR = ".MuiModal-root:not(.MuiModal-hidden)";

/** A field being typed in: Escape gives the edit up, where leaving it any other way would commit it. */
const TEXT_FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]), textarea, [contenteditable="true"]';

const is_sentinel = (state: unknown): boolean =>
  typeof state === "object" && state !== null && SENTINEL_KEY in state;

/** Whether an Escape would first go to a popup or a field rather than to the canvas. */
export const escape_goes_to_popup_or_field = (): boolean =>
  document.querySelector(OPEN_MODAL_SELECTOR) !== null ||
  (document.activeElement?.matches(TEXT_FIELD_SELECTOR) ?? false);

/** Presses Escape as the keyboard would, so that every handler already listening for it answers in its usual order. */
export const press_escape = (): void => {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
};

/**
 * Hands the system back button (Android's, or the browser's) to `onBack`, which returns whether it found something to undo.
 * While it does, the app stays; once it returns `false`, the back goes through, which closes an installed app.
 *
 * Works by keeping one entry of the browser history above the app's own, which each back consumes and the hook puts back.
 */
export function useBackAsEscape(enabled: boolean, onBack: () => boolean): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;
    // A reload keeps the entry already standing.
    if (!is_sentinel(window.history.state))
      window.history.pushState({ [SENTINEL_KEY]: true }, "");
    const onPopState = (event: PopStateEvent) => {
      // A forward onto the entry, not a back.
      if (is_sentinel(event.state)) return;
      if (onBackRef.current())
        window.history.pushState({ [SENTINEL_KEY]: true }, "");
      else window.history.back();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled]);
}
