import React from "react";
import { PANEL_SLIDE_MS } from "../../constants/interaction-specs";

/**
 * Slides a side panel open and shut by widening the room it takes, its content keeping its own width and sliding in with the room's edge.
 *
 * `mounted` says whether the content is built at all: it stays while the panel closes, so it slides away rather than vanishing.
 * `sx` goes on the element that clips the content, `width` being the panel's own.
 */
export function usePanelSlide(open: boolean, width: number) {
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), PANEL_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return {
    mounted: open || mounted,
    sx: {
      width: open ? width : 0,
      height: "100%",
      overflow: "hidden",
      transition: `width ${PANEL_SLIDE_MS}ms ease-out`,
    },
  };
}
