import { useCallback, useEffect, useRef } from "react";
import type { SxProps, Theme } from "@mui/material";

/** Every MUI popup portals a layer of its own, so a pointer inside any of them is not outside this one. */
const POPUP_LAYER_SELECTOR = ".MuiModal-root, .MuiPopper-root";

const NON_MODAL_SX: SxProps<Theme> = {
  pointerEvents: "none",
  "& .MuiPaper-root": { pointerEvents: "auto" },
};

export interface NonModalPopupProps {
  hideBackdrop: boolean;
  disableScrollLock: boolean;
  disableEnforceFocus: boolean;
  disableRestoreFocus: boolean;
  sx: SxProps<Theme>;
  onClose: (event: object, reason: string) => void;
}

/**
 * Props that make a MUI `Menu`, `Popover` or `Select` menu non-modal: what lies underneath keeps its hover, its wheel and its clicks, and a pointer going down outside dismisses the popup without swallowing the event that did it.
 * Spread them on the popup — on `MenuProps` for a `Select` — and give it `open` and its anchor.
 *
 * The anchor is spared, so a click on it is its own handler's business: make that handler a toggle, or clicking it while open reopens what the dismissal just closed.
 * Reserved for popups whose choices apply as they are made: one holding a draft has something to lose to a stray click, and stays modal.
 */
export function useNonModalPopup(
  open: boolean,
  anchor: HTMLElement | null,
  dismiss: () => void,
): NonModalPopupProps {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (anchor?.contains(target)) return;
      if (target.closest(POPUP_LAYER_SELECTOR)) return;
      dismissRef.current();
    };
    // Capture, so the dismissal is decided before anything downstream reacts to the same pointer.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, anchor]);

  const onClose = useCallback(
    (_event: object, reason: string) => {
      // Escape hands the focus back to whatever opened the popup; a click leaves it wherever it landed.
      if (reason === "escapeKeyDown") anchor?.focus();
      dismissRef.current();
    },
    [anchor],
  );

  return {
    hideBackdrop: true,
    disableScrollLock: true,
    disableEnforceFocus: true,
    disableRestoreFocus: true,
    sx: NON_MODAL_SX,
    onClose,
  };
}
