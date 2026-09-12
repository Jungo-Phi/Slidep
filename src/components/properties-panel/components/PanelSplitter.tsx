import React from "react";
import { Box } from "@mui/material";
import { getStorageItem, setStorageItem } from "../../../utils/storage";

/** How much of the panel each side is never allowed to drop below, as a share of its height. */
const MIN_SHARE = 0.15;
const MAX_SHARE = 0.8;

/** Height of the band the pointer can grab, in px: the line itself is too thin to aim at. */
const GRAB_HEIGHT = 9;

/** The grip, in px: enough to be seen as a handle, small enough to stay out of the way. */
const GRIP_WIDTH = 26;
const GRIP_HEIGHT = 3;

/**
 * Where a panel is split between its two scroll regions, as a share of its height, remembered across sessions.
 * Returns the share and the splitter that moves it.
 */
export function useSplitShare(
  storageKey: string,
  fallback: number,
): [number, (share: number) => void] {
  const [share, setShare] = React.useState(() =>
    getStorageItem<number>(storageKey, fallback),
  );
  React.useEffect(() => {
    setStorageItem(storageKey, share);
  }, [storageKey, share]);
  return [share, setShare];
}

/**
 * The line between two stacked scroll regions, dragged to give one of them more room.
 * `containerRef` must hold the regions and nothing else: the share is measured against it, so anything else inside it (a tab bar, a header) would offset every reading by its own height.
 */
export const PanelSplitter: React.FC<{
  containerRef: React.RefObject<HTMLElement | null>;
  onChange: (share: number) => void;
}> = ({ containerRef, onChange }) => {
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const share = (event.clientY - bounds.top) / bounds.height;
      onChange(Math.min(MAX_SHARE, Math.max(MIN_SHARE, share)));
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    // The whole window answers the drag, so the cursor keeps its meaning even where it runs off the thin band it started on, and a text selection never starts under it.
    const previous = {
      cursor: document.body.style.cursor,
      select: document.body.style.userSelect,
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = previous.cursor;
      document.body.style.userSelect = previous.select;
    };
  }, [dragging, containerRef, onChange]);

  return (
    <Box
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      sx={(theme) => ({
        position: "relative",
        flexShrink: 0,
        height: GRAB_HEIGHT,
        cursor: "row-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // The line runs the full width; the grip sits on it, which is what says the line can be taken hold of.
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          right: 0,
          height: "1px",
          backgroundColor: theme.palette.divider,
        },
        "& > div": {
          backgroundColor: dragging
            ? theme.palette.primary.main
            : theme.palette.divider,
        },
        "&:hover > div": { backgroundColor: theme.palette.primary.main },
      })}
    >
      <Box
        sx={{
          position: "relative",
          width: GRIP_WIDTH,
          height: GRIP_HEIGHT,
          borderRadius: GRIP_HEIGHT,
        }}
      />
    </Box>
  );
};

export default PanelSplitter;
