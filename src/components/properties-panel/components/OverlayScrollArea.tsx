import React from "react";
import { Box, SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  DRAG_AUTO_SCROLL,
  OVERLAY_SCROLLBAR,
} from "../../../constants/interaction-specs";
import {
  ThumbSpec,
  scroll_top_for_thumb,
  thumb_geometry,
} from "../scrollbar-geometry";

const SPEC: ThumbSpec = {
  minHeight: OVERLAY_SCROLLBAR.MIN_THUMB_HEIGHT,
  minSqueezed: OVERLAY_SCROLLBAR.MIN_SQUEEZED_HEIGHT,
  margin: OVERLAY_SCROLLBAR.MARGIN,
};

/** Fallback height of a "line" for the browsers that report wheel deltas in lines rather than pixels. */
const WHEEL_LINE = 16;

const wheel_pixels = (event: WheelEvent, page: number): number => {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE;
  if (event.deltaMode === 2) return event.deltaY * page;
  return event.deltaY;
};

interface OverlayScrollAreaProps {
  children: React.ReactNode;
  /** Styles the area itself; give it the height rule that makes it the one that scrolls. */
  sx?: SxProps<Theme>;
}

/**
 * Vertical scroll area whose scrollbar floats over the content instead of taking a column of its
 * own: the width the children get never changes, so nothing shifts sideways when the content starts
 * overflowing and full-bleed rules still reach the edge. The thumb shows while the pointer is on
 * the area or while it scrolls, and is the only part that answers to the pointer — a track would
 * catch clicks meant for the content under it.
 */
export const OverlayScrollArea: React.FC<OverlayScrollAreaProps> = ({
  children,
  sx,
}) => {
  const areaRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLDivElement>(null);

  // Everything below drives the thumb through the DOM: on a panel this heavy, re-rendering the
  // children at every scroll event to move a 5 px bar is not worth it.
  React.useEffect(() => {
    const area = areaRef.current;
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    const thumb = thumbRef.current;
    if (!area || !scroller || !content || !thumb) return;

    let hovered = false;
    let dragging = false;
    let idle: number | undefined;

    const draw = () => {
      const geometry = thumb_geometry(scroller, SPEC);
      thumb.style.display = geometry ? "block" : "none";
      if (!geometry) return;
      thumb.style.height = `${geometry.height}px`;
      thumb.style.transform = `translateY(${geometry.top}px)`;
    };

    const hide = () => {
      window.clearTimeout(idle);
      thumb.style.opacity = "0";
      thumb.style.pointerEvents = "none";
    };

    // `sticky` keeps the thumb up until told otherwise; otherwise it fades once things go quiet.
    const show = (sticky: boolean) => {
      draw();
      thumb.style.opacity = "1";
      thumb.style.pointerEvents = "auto";
      window.clearTimeout(idle);
      if (!sticky) idle = window.setTimeout(hide, OVERLAY_SCROLLBAR.IDLE_MS);
    };

    const onScroll = () => show(hovered || dragging);
    // Watched on the area, not on the scroller: the thumb is the scroller's sibling, so a pointer
    // moving onto it would leave the scroller and fade away the very bar it is reaching for.
    const onEnter = () => {
      hovered = true;
      show(true);
    };
    const onLeave = () => {
      hovered = false;
      if (!dragging) show(false);
    };

    // Same reason the other way round: a wheel event landing on the thumb never reaches the scroller.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      scroller.scrollTop += wheel_pixels(event, scroller.clientHeight);
    };

    const onPointerDown = (event: PointerEvent) => {
      const grabbed = thumb_geometry(scroller, SPEC);
      if (!grabbed) return;
      event.preventDefault();
      dragging = true;
      const grabY = event.clientY;
      const grabTop = grabbed.top;
      thumb.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";

      const onMove = (move: PointerEvent) => {
        const current = thumb_geometry(scroller, SPEC);
        if (!current) return;
        scroller.scrollTop = scroll_top_for_thumb(
          grabTop + move.clientY - grabY,
          current,
          scroller,
          SPEC,
        );
      };
      const onRelease = (release: PointerEvent) => {
        dragging = false;
        thumb.releasePointerCapture(release.pointerId);
        thumb.removeEventListener("pointermove", onMove);
        thumb.removeEventListener("pointerup", onRelease);
        thumb.removeEventListener("pointercancel", onRelease);
        document.body.style.userSelect = "";
        show(hovered);
      };

      thumb.addEventListener("pointermove", onMove);
      thumb.addEventListener("pointerup", onRelease);
      thumb.addEventListener("pointercancel", onRelease);
    };

    // Native HTML5 drag and drop auto-scrolls the page itself near a viewport edge, but not an
    // arbitrary `overflow` container nested inside it — so a drag that needs to reach a group
    // above or below the fold (the library panel's own reassignment drag, chiefly) has to drive
    // this scroller by hand. Speed ramps with proximity rather than a flat rate once inside the
    // edge band, so it reads as a gentle pull rather than a jump the moment the cursor crosses in.
    let scrollSpeed = 0;
    let scrollRAF: number | null = null;
    const scrollStep = () => {
      if (scrollSpeed === 0) {
        scrollRAF = null;
        return;
      }
      scroller.scrollTop += scrollSpeed;
      scrollRAF = requestAnimationFrame(scrollStep);
    };
    const setAutoScrollSpeed = (speed: number) => {
      scrollSpeed = speed;
      if (scrollSpeed !== 0 && scrollRAF === null)
        scrollRAF = requestAnimationFrame(scrollStep);
    };
    const onDragOver = (event: DragEvent) => {
      const rect = scroller.getBoundingClientRect();
      const fromTop = event.clientY - rect.top;
      const fromBottom = rect.bottom - event.clientY;
      const { EDGE_PX, MAX_SPEED_PX_PER_FRAME } = DRAG_AUTO_SCROLL;
      if (fromTop < EDGE_PX)
        setAutoScrollSpeed(
          -MAX_SPEED_PX_PER_FRAME * (1 - Math.max(fromTop, 0) / EDGE_PX),
        );
      else if (fromBottom < EDGE_PX)
        setAutoScrollSpeed(
          MAX_SPEED_PX_PER_FRAME * (1 - Math.max(fromBottom, 0) / EDGE_PX),
        );
      else setAutoScrollSpeed(0);
    };
    const stopAutoScroll = () => setAutoScrollSpeed(0);

    // The scroller's own box says nothing about how tall its content grew, hence both.
    const observer = new ResizeObserver(draw);
    observer.observe(scroller);
    observer.observe(content);

    scroller.addEventListener("scroll", onScroll, { passive: true });
    area.addEventListener("pointerenter", onEnter);
    area.addEventListener("pointerleave", onLeave);
    thumb.addEventListener("wheel", onWheel, { passive: false });
    thumb.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("dragover", onDragOver);
    scroller.addEventListener("drop", stopAutoScroll);
    // Not `scroller`: a drag that ends past its bounds (dropped elsewhere, or cancelled) would
    // never fire `dragleave`/`drop` on it, and the scroll would run away.
    window.addEventListener("dragend", stopAutoScroll);
    draw();

    return () => {
      window.clearTimeout(idle);
      if (scrollRAF !== null) cancelAnimationFrame(scrollRAF);
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      area.removeEventListener("pointerenter", onEnter);
      area.removeEventListener("pointerleave", onLeave);
      thumb.removeEventListener("wheel", onWheel);
      thumb.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("dragover", onDragOver);
      scroller.removeEventListener("drop", stopAutoScroll);
      window.removeEventListener("dragend", stopAutoScroll);
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <Box
      ref={areaRef}
      sx={[
        { position: "relative", minHeight: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        ref={scrollerRef}
        sx={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <div ref={contentRef}>{children}</div>
      </Box>
      <Box
        ref={thumbRef}
        sx={(theme) => ({
          position: "absolute",
          zIndex: 2,
          top: 0,
          right: `${OVERLAY_SCROLLBAR.MARGIN}px`,
          width: `${OVERLAY_SCROLLBAR.WIDTH}px`,
          borderRadius: `${OVERLAY_SCROLLBAR.WIDTH / 2}px`,
          backgroundColor: alpha(theme.palette.text.primary, 0.25),
          opacity: 0,
          pointerEvents: "none",
          touchAction: "none",
          transition: `opacity ${OVERLAY_SCROLLBAR.FADE_MS}ms`,
          "&:hover": {
            backgroundColor: alpha(theme.palette.text.primary, 0.45),
          },
          "&::after": {
            content: '""',
            position: "absolute",
            inset: `0 -${OVERLAY_SCROLLBAR.MARGIN}px`,
          },
        })}
      />
    </Box>
  );
};
