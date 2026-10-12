import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { AppMode, CanvasState, Mechanism } from "../../types";
import { t } from "../../i18n";
import {
  edition_palette,
  PaletteElement,
} from "../element-palette/ElementPalette";
import { palette_click_state } from "../element-palette/palette-click";
import { SIMULATION_TOOLS } from "../../constants/canvas-state-sim-effect";
import {
  PHONE_LAYOUT,
  PHONE_QUICK_TOOLS,
} from "../../constants/layout-specs";

interface PhoneToolButtonProps {
  element: PaletteElement;
  /** Side of the tool's glyph (px); the button adds its margin around it. */
  iconSize: number;
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;
  mechanism: Mechanism;
  appMode: AppMode;
  /** Called once the tool is armed or put away. */
  onPicked?: () => void;
}

/** One palette tool at a finger's size, lit in its own colour while armed: a tap arms it, a tap on the armed one puts it away. */
export const PhoneToolButton: React.FC<PhoneToolButtonProps> = ({
  element,
  iconSize,
  canvasState,
  setCanvasState,
  mechanism,
  appMode,
  onPicked,
}) => {
  const simulating = appMode !== "edition";
  const highlighted = element.hilightRule(canvasState, mechanism);
  const color =
    simulating && element.simHilightColor
      ? element.simHilightColor
      : element.hilightColor;
  const src =
    simulating && element.simIconSrc ? element.simIconSrc : element.iconSrc;
  return (
    <ButtonBase
      aria-label={t(element.nameKey)}
      aria-pressed={highlighted}
      onClick={() => {
        setCanvasState(
          palette_click_state(element, highlighted, canvasState, mechanism),
        );
        onPicked?.();
      }}
      sx={{
        width: iconSize + 8,
        height: iconSize + 8,
        flexShrink: 0,
        borderRadius: 1.5,
        backgroundColor: highlighted ? color : "transparent",
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        draggable={false}
        sx={{
          width: iconSize,
          height: iconSize,
          filter: highlighted ? "brightness(0) invert(1)" : "none",
        }}
      />
    </ButtonBase>
  );
};

interface PhonePaletteProps {
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;
  mechanism: Mechanism;
  appMode: AppMode;
  /** Called once a tool is armed or put away: the sheet steps aside for the canvas. */
  onPicked: () => void;
}

/**
 * The palette as the phone's sheet shows it: the same groups as on desktop, named, at a finger's size.
 * In simulation it holds only the tools a run allows — on a screen this small, a tool that cannot be used is one too many.
 */
export const PhonePalette: React.FC<PhonePaletteProps> = ({
  canvasState,
  setCanvasState,
  mechanism,
  appMode,
  onPicked,
}) => {
  const simulating = appMode !== "edition";
  return (
    // The groups flow side by side rather than one per row: most hold a handful of tools, and a row each would leave the sheet mostly empty.
    <Box
      sx={{
        overflowY: "auto",
        px: 1.5,
        pt: 0.5,
        pb: 2,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      {edition_palette().map((group) => {
        // In edition the quick-access bar always holds the selection tool and the eraser; in simulation it gives way to the transport, and the selection tool comes back here.
        const elements = group.elements.filter((element) =>
          simulating
            ? SIMULATION_TOOLS.has(element.goToStateType)
            : !PHONE_QUICK_TOOLS.FIXED.includes(element.goToStateType),
        );
        if (elements.length === 0) return null;
        return (
          <Box
            component="section"
            key={group.titleKey}
            sx={{ display: "flex", flexDirection: "column", maxWidth: "100%" }}
          >
            {/* The group's icons set its width, never its title; the title-less first group keeps the line, so every row of icons starts at the same height. */}
            <Typography
              noWrap
              sx={{
                width: 0,
                minWidth: "100%",
                textAlign: "center",
                fontSize: "0.7rem",
                fontWeight: 800,
                color: "text.disabled",
                mb: 0.25,
              }}
            >
              {group.titleKey === "interface" ? " " : t(group.titleKey)}
            </Typography>
            {/* The ground frames the tools alone: the title names the group from above it. */}
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.5,
                p: 0.5,
                borderRadius: 2,
                backgroundColor: "background.sunken",
              }}
            >
              {elements.map((element) => (
                <PhoneToolButton
                  key={element.goToStateType}
                  element={element}
                  iconSize={PHONE_LAYOUT.PALETTE_ICON}
                  canvasState={canvasState}
                  setCanvasState={setCanvasState}
                  mechanism={mechanism}
                  appMode={appMode}
                  onPicked={onPicked}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
