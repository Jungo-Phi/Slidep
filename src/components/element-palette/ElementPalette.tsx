import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import { darken } from "@mui/material/styles";

import { icon } from "./iconDataUris";

import { AppMode, CanvasState } from "../../types";
import { COLORS } from "../../constants/rendering-specs";
import {
  shortcut_label,
  tool_state,
  ToolStateType,
} from "../../constants/shortcuts";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { armed_tool_state } from "../canvas/arm-tool";
import { Mechanism } from "../../types";
import { StringKey, t } from "../../i18n";

/** How clicking this palette button behaves when simulation is active.
 *  - "structural"   : exits to edition first (elements, forces)
 *  - "constraint"   : pauses simulation, stays in sim mode (dimensions, constraints)
 *  - "observational": no sim effect (probes)
 */
type SimBehavior = "structural" | "constraint" | "observational";

interface PaletteElement {
  /** Name only: the shortcut is appended at render time. */
  nameKey: StringKey;
  iconSrc: string;
  simIconSrc?: string;
  goToStateType: ToolStateType;
  hilightRule: (state: CanvasState, mechanism: Mechanism) => boolean;
  hilightColor: string;
  hilightHoverColor: string;
  simHilightColor?: string;
  simHilightHoverColor?: string;
  simBehavior: SimBehavior;
}

/**
 * Built on demand rather than as a module constant: the icons and highlight
 * colors it holds come from the active theme, and a constant would freeze them
 * on whichever theme was loaded first.
 */
const edition_palette = (): {
  titleKey: StringKey;
  elements: PaletteElement[];
}[] => [
  {
    titleKey: "palette_interface",
    elements: [
      {
        nameKey: "tool_select",
        iconSrc: icon("select"),
        simIconSrc: icon("select-sim"),
        goToStateType: "Selecting",
        simBehavior: "observational",
        hilightRule: (state) =>
          [
            "Selecting",
            "SelectingMultiple",
            "SelectedMultiple",
            "MovingSelectionMultiple",
            "SelectedElement",
            "MovingNode",
            "MovingEdgeStartPoint",
            "MovingEdgeEndPoint",
            "MovingEdgeBody",
            "MovingConstraint",
            "SimulationDragging",
          ].includes(state.type) ||
          // Une saisie ouverte depuis un outil resté armé laisse cet outil
          // allumé : c'est lui qu'on retrouve en sortie, pas la sélection.
          (state.type === "EditingValue" && !state.rearm),
        hilightColor: COLORS.SELECTION_BOX,
        hilightHoverColor: darken(COLORS.SELECTION_BOX, 0.2),
        simHilightColor: COLORS.ACCENT,
        simHilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_eraser",
        iconSrc: icon("eraser"),
        goToStateType: "Erasing",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "Erasing" || state.type === "ErasingMultiple",
        hilightColor: COLORS.DELETION_BOX,
        hilightHoverColor: COLORS.DELETION_STROKE,
      },
    ],
  },
  {
    titleKey: "palette_connections",
    elements: [
      {
        nameKey: "tool_slider",
        iconSrc: icon("slider"),
        goToStateType: "PlacingSlider",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingSlider",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_pivot",
        iconSrc: icon("pivot"),
        goToStateType: "PlacingPivot",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingPivot",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_belt",
        iconSrc: icon("belt"),
        goToStateType: "PlacingBeltStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeltStart" || state.type === "PlacingBeltEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_gear",
        iconSrc: icon("gear"),
        goToStateType: "PlacingGearStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingGearStart" ||
          state.type === "PlacingGearRadius",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "palette_structure",
    elements: [
      {
        nameKey: "tool_join",
        iconSrc: icon("join"),
        goToStateType: "PlacingJoin",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingJoin",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_beam",
        iconSrc: icon("beam"),
        goToStateType: "PlacingBeamStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeamStart" || state.type === "PlacingBeamEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_ground",
        iconSrc: icon("ground"),
        goToStateType: "PlacingGround",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingGround",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "palette_dynamics",
    elements: [
      {
        nameKey: "tool_damper",
        iconSrc: icon("damper"),
        goToStateType: "PlacingDamperStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingDamperStart" ||
          state.type === "PlacingDamperEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_spring",
        iconSrc: icon("spring"),
        goToStateType: "PlacingSpringStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingSpringStart" ||
          state.type === "PlacingSpringEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_mass",
        iconSrc: icon("mass"),
        goToStateType: "PlacingMass",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMass",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_motor",
        iconSrc: icon("motor"),
        goToStateType: "PlacingMotor",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMotor",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "palette_constraints",
    elements: [
      {
        nameKey: "tool_dimension",
        iconSrc: icon("dimension"),
        goToStateType: "DimensionStart",
        simBehavior: "constraint",
        hilightRule: (state, mechanism) =>
          [
            "DimensionStart",
            "DimensionNode",
            "DimensionEdge",
            "DimensionEdgeToNode",
            "DimensionNodeToNode",
            "DimensionAngle",
            "DimensionRadius",
            "DimensionBelt",
          ].includes(state.type) ||
          (state.type === "PlacingValue" &&
            get_constraint_element_from_id(
              state.elementID,
              mechanism.constraintElements,
            )!.type !== "gear-ratio") ||
          (state.type === "EditingValue" && state.rearm === "DimensionStart"),
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_gear_ratio",
        iconSrc: icon("ratio"),
        goToStateType: "GearRatioConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state, mechanism) =>
          state.type === "GearRatioConstraintStart" ||
          state.type === "GearRatioConstraintGear" ||
          (state.type === "PlacingValue" &&
            get_constraint_element_from_id(
              state.elementID,
              mechanism.constraintElements,
            )!.type === "gear-ratio"),
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_equal_lengths",
        iconSrc: icon("equal"),
        goToStateType: "EqualConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "EqualConstraintStart" ||
          state.type === "EqualConstraintEdge" ||
          state.type === "EqualConstraintGear",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_horizontal_vertical",
        iconSrc: icon("horizontal-vertical"),
        goToStateType: "HorizontalVerticalConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "HorizontalVerticalConstraintStart" ||
          state.type === "HorizontalVerticalConstraintNode",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_normal",
        iconSrc: icon("normal"),
        goToStateType: "NormalConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "NormalConstraintStart" ||
          state.type === "NormalConstraintEdge",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_parallel",
        iconSrc: icon("parallel"),
        goToStateType: "ParallelConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "ParallelConstraintStart" ||
          state.type === "ParallelConstraintEdge",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "palette_loads",
    elements: [
      {
        nameKey: "tool_force",
        iconSrc: icon("force"),
        goToStateType: "PlacingForceStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingForceStart" ||
          state.type === "PlacingForceEnd" ||
          state.type === "PlacingDistributedForce",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_moment",
        iconSrc: icon("moment"),
        goToStateType: "PlacingMomentStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingMomentStart" ||
          state.type === "PlacingMomentEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "palette_measurements",
    elements: [
      {
        nameKey: "tool_probe",
        iconSrc: icon("probe"),
        goToStateType: "PlacingProbe",
        simBehavior: "observational",
        hilightRule: (state) =>
          state.type === "PlacingProbe" || state.type === "PlacingProbeMetrics",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
];

const SIZE = 28;
const PADDING = 2;
const ROW_HEIGHT = SIZE + 2 * PADDING;
const GRID_GAP = 2;
/** Space kept between the palette and the edges of the canvas area. */
const MARGIN = 16;

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
  onExitToEdition: () => void;
  onPauseSim: () => void;
}

export const ElementPalette: React.FC<ElementPaletteProps> = ({
  setCanvasState,
  canvasState,
  mechanism,
  appMode,
  onExitToEdition,
  onPauseSim,
}) => {
  // Rebuilt on every render, which is how the icons and highlight colors follow
  // a theme change: both are read from the active canvas palette at call time.
  const palette = edition_palette();

  const handleElementClick = (
    element: PaletteElement,
    isHighlighted: boolean,
  ) => {
    // Clicking the armed tool disarms it, like Escape — minus Escape's effect on
    // a running simulation, which a palette click has no business triggering.
    if (isHighlighted && element.goToStateType !== "Selecting") {
      setCanvasState(tool_state("Selecting"));
      return;
    }
    if (appMode !== "edition") {
      if (element.simBehavior === "structural") {
        onExitToEdition();
      } else if (element.simBehavior === "constraint") {
        onPauseSim();
      }
      // "observational" → no sim side-effect
    }
    setCanvasState(
      armed_tool_state(
        element.goToStateType,
        canvasState,
        mechanism.mechanicalElements,
        mechanism.constraintElements,
        mechanism.loads,
        mechanism.viewport,
      ),
    );
  };

  // Structural, not visual: the group sizes are the same under every theme.
  const maxIconsInGroup = Math.max(...palette.map((g) => g.elements.length), 1);
  const groupSizesRef = useRef<number[]>([]);
  groupSizesRef.current = palette.map((g) => g.elements.length);

  const paperRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // The narrowest layout that still fits the canvas area, measured rather than
  // estimated: the section titles and dividers vary with the theme's metrics, so
  // the current height is the only reliable starting point. Everything but the
  // icon grids keeps the same height when the column count changes, hence the
  // reasoning on deltas.
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const area = paper?.parentElement;
    if (!paper || !area) return;

    const fit = () => {
      if (area.clientHeight === 0) return;
      const available = area.clientHeight - 2 * MARGIN;
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
        position: "absolute",
        left: MARGIN,
        top: MARGIN,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        p: 0.5,
        zIndex: 1000,
        userSelect: "none",
        maxHeight: `calc(100% - ${2 * MARGIN}px)`,
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
          {group.titleKey !== "palette_interface" && (
            <>
              <Divider
                variant="fullWidth"
                flexItem
                sx={{ mx: -0.5, my: 0.5 }}
              />
              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: "0.65rem",
                  fontWeight: 800,
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
              return (
                <Tooltip
                  key={element.goToStateType}
                  title={key ? `${name} (${key})` : name}
                  placement="right"
                  arrow
                  disableInteractive
                  onOpen={() => {}}
                >
                  <IconButton
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
                </Tooltip>
              );
            })}
          </div>
        </section>
      ))}
    </Paper>
  );
};

export default ElementPalette;
