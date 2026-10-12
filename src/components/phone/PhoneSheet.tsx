import React, { useRef } from "react";
import { Box, Paper, Slide } from "@mui/material";
import { PHONE_LAYOUT } from "../../constants/layout-specs";

export type SheetHeight = "half" | "full";

interface PhoneSheetProps {
  open: boolean;
  height: SheetHeight;
  setHeight: (height: SheetHeight) => void;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The one surface the phone raises over the canvas, from the bottom bar: half the screen to work with the canvas alive above it, all of it when the content asks for room.
 * Its handle moves it: a tap toggles the two heights, a drag up or down goes one height further that way, down from half closing it.
 * Laid over the canvas rather than shrinking it, so opening it never resizes the drawing.
 */
export const PhoneSheet: React.FC<PhoneSheetProps> = ({
  open,
  height,
  setHeight,
  onClose,
  children,
}) => {
  const dragStartRef = useRef<number | null>(null);

  const onHandleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = event.clientY;
  };
  const onHandleUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (start === null) return;
    const dy = event.clientY - start;
    if (Math.abs(dy) < PHONE_LAYOUT.SHEET_DRAG_STEP) {
      setHeight(height === "half" ? "full" : "half");
      return;
    }
    if (dy < 0) setHeight("full");
    else if (height === "full") setHeight("half");
    else onClose();
  };

  return (
    <Slide direction="up" in={open} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: height === "half" ? `${PHONE_LAYOUT.SHEET_HALF * 100}%` : "100%",
          transition: "height 200ms ease",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          zIndex: 2,
        }}
      >
        <Box
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
          onPointerCancel={() => (dragStartRef.current = null)}
          sx={{
            flexShrink: 0,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: "text.disabled",
            }}
          />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </Box>
      </Paper>
    </Slide>
  );
};
