import React, { useLayoutEffect, useRef, useState } from "react";
import { useAmbient } from "../common/use-ambient";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import { AppMode, CanvasState } from "../../types";
import { COLORS } from "../../theme/canvas-theme";
import { shortcut_label } from "../../constants/shortcuts";
import { edition_palette, PaletteElement } from "./edition-palette";
import { palette_click_state } from "./palette-click";
import { SIMULATION_TOOLS } from "../../constants/canvas-state-sim-effect";
import { Mechanism } from "../../types";
import { t } from "../../i18n";

const SIZE = 28;
const PADDING = 2;
const ROW_HEIGHT = SIZE + 2 * PADDING;
const GRID_GAP = 2;

/** Height of a group's icon grid, laid out over `columns` columns. */
const grid_height = (icons: number, columns: number): number => {
  const rows = Math.ceil(icons / columns);
  return rows * ROW_HEIGHT + (rows - 1) * GRID_GAP;
};

interface ElementPaletteProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  mechanism: Mechanism;
  appMode: AppMode;
}

const ElementPaletteView: React.FC<ElementPaletteProps> = ({
  setCanvasState,
  canvasState,
  mechanism,
  appMode,
}) => {
  useAmbient();
  // Rebuilt on every render, which is how the icons and highlight colors follow a theme change: both are read from the active canvas palette at call time.
  const palette = edition_palette();

  const handleElementClick = (
    element: PaletteElement,
    isHighlighted: boolean,
  ) =>
    setCanvasState(
      palette_click_state(element, isHighlighted, canvasState, mechanism),
    );

  // Structural, not visual: the group sizes are the same under every theme.
  const maxIconsInGroup = Math.max(...palette.map((g) => g.elements.length), 1);
  const groupSizesRef = useRef<number[]>([]);
  groupSizesRef.current = palette.map((g) => g.elements.length);

  const paperRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // The narrowest layout that still fits the canvas area, measured rather than estimated: the section titles and dividers vary with the theme's metrics, so the current height is the only reliable starting point.
  // Everything but the icon grids keeps the same height when the column count changes, hence the reasoning on deltas.
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const area = paper?.parentElement;
    if (!paper || !area) return;

    const fit = () => {
      if (area.clientHeight === 0) return;
      const available = area.clientHeight;
      // `scrollHeight` leaves the borders out, and they still take room on screen.
      const borders = paper.offsetHeight - paper.clientHeight;
      const current = paper.scrollHeight + borders;
      const sizes = groupSizesRef.current;
      const from = columnsRef.current;
      for (let candidate = 2; candidate <= maxIconsInGroup; candidate++) {
        const delta = sizes.reduce(
          (sum, icons) =>
            sum + grid_height(icons, candidate) - grid_height(icons, from),
          0,
        );
        if (current + delta <= available || candidate === maxIconsInGroup) {
          setColumns(candidate);
          return;
        }
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [maxIconsInGroup]);

  return (
    <Paper
      elevation={0}
      ref={paperRef}
      sx={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        flexShrink: 0,
        p: 0.5,
        border: "none",
        borderRadius: 0,
        borderRight: `2px solid ${COLORS.ACCENT}`,
        boxShadow: "none",
        userSelect: "none",
        height: "100%",
        overflowY: "auto",
        // Hide scrollbar for Chrome, Safari and Opera
        "&::-webkit-scrollbar": {
          display: "none",
        },
        // Hide scrollbar for IE, Edge and Firefox
        msOverflowStyle: "none",
        scrollbarWidth: "none",
      }}
    >
      {palette.map((group) => (
        <section key={group.titleKey}>
          {group.titleKey !== "interface" && (
            <>
              <Divider
                variant="fullWidth"
                flexItem
                sx={{ mx: -0.5, my: 0.5 }}
              />
              <Typography
                sx={{
                  // A title wraps instead of widening the palette: the icon grid alone sets the width.
                  width: 0,
                  minWidth: "100%",
                  textAlign: "center",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  lineHeight: 1.15,
                  color: "text.disabled",
                }}
              >
                {t(group.titleKey)}
              </Typography>
            </>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, ${SIZE + 2 * PADDING}px)`,
              gap: 2,
              justifyItems: "center",
            }}
          >
            {group.elements.map((element) => {
              const isSimMode = appMode !== "edition";
              const isHighlighted = element.hilightRule(canvasState, mechanism);
              const hilightColor =
                isSimMode && element.simHilightColor
                  ? element.simHilightColor
                  : element.hilightColor;
              const hilightHoverColor =
                isSimMode && element.simHilightHoverColor
                  ? element.simHilightHoverColor
                  : element.hilightHoverColor;
              const iconSrc =
                isSimMode && element.simIconSrc
                  ? element.simIconSrc
                  : element.iconSrc;
              const key = shortcut_label(element.goToStateType);
              const name = t(element.nameKey);
              const label = key ? `${name} (${key})` : name;
              // Same look as the panel's `StructureOnly`: one greyed-out language for "not while the simulation runs".
              const unavailable =
                isSimMode && !SIMULATION_TOOLS.has(element.goToStateType);
              return (
                <Tooltip
                  key={element.goToStateType}
                  title={label}
                  placement="right"
                  arrow
                  onOpen={() => {}}
                >
                  {/* A disabled button fires no pointer events, so the tooltip listens on this wrapper instead. */}
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      opacity: unavailable ? 0.3 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <IconButton
                      disabled={unavailable}
                      onClick={() => handleElementClick(element, isHighlighted)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleElementClick(element, isHighlighted);
                        }
                      }}
                      sx={{
                        width: SIZE + 2 * PADDING,
                        height: SIZE + 2 * PADDING,
                        borderRadius: 0.75,
                        backgroundColor: isHighlighted
                          ? hilightColor
                          : "transparent",
                        "&:hover": {
                          background: isHighlighted
                            ? hilightHoverColor
                            : "action.hover",
                        },
                      }}
                      aria-label={name}
                    >
                      <Box
                        component="img"
                        src={iconSrc}
                        alt={name}
                        draggable={false}
                        sx={{
                          width: SIZE,
                          height: SIZE,
                          display: "block",
                          filter:
                            canvasState.type && isHighlighted
                              ? "brightness(0) invert(1)"
                              : "none",
                        }}
                      />
                    </IconButton>
                  </Box>
                </Tooltip>
              );
            })}
          </div>
        </section>
      ))}
    </Paper>
  );
};

export const ElementPalette = React.memo(ElementPaletteView);

export default ElementPalette;
