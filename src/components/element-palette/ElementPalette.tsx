import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";

import { icon } from "./iconDataUris";

import { AppMode, CanvasState } from "../../types";
import { COLORS } from "../../constants/rendering-specs";
import {
  shortcut_label,
  tool_state,
  ToolStateType,
} from "../../constants/shortcuts";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { Mechanism } from "../../types";

/** How clicking this palette button behaves when simulation is active.
 *  - "structural"   : exits to edition first (elements, forces)
 *  - "constraint"   : pauses simulation, stays in sim mode (dimensions, constraints)
 *  - "observational": no sim effect (probes)
 */
type SimBehavior = "structural" | "constraint" | "observational";

interface PaletteElement {
  label: string;
  /** Name only: the shortcut is appended at render time. */
  tooltip: string;
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
const edition_palette = (): { title: string; elements: PaletteElement[] }[] => [
  {
    title: "Interface",
    elements: [
      {
        label: "Selection",
        tooltip: "Select",
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
          state.type === "EditingValue",
        hilightColor: COLORS.SELECTION_BOX,
        hilightHoverColor: COLORS.SELECTION_STROKE,
        simHilightColor: COLORS.ACCENT,
        simHilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Gomme",
        tooltip: "Eraser",
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
    title: "Liaisons",
    elements: [
      {
        label: "Glissière",
        tooltip: "Slider",
        iconSrc: icon("slider"),
        goToStateType: "PlacingSlider",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingSlider",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Pivot",
        tooltip: "Pivot",
        iconSrc: icon("pivot"),
        goToStateType: "PlacingPivot",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingPivot",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Courroie",
        tooltip: "Belt",
        iconSrc: icon("belt"),
        goToStateType: "PlacingBeltStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeltStart" || state.type === "PlacingBeltEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Engrenage",
        tooltip: "Gear",
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
    title: "Structure",
    elements: [
      {
        label: "Jointure",
        tooltip: "Join",
        iconSrc: icon("join"),
        goToStateType: "PlacingJoin",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingJoin",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Poutre",
        tooltip: "Beam",
        iconSrc: icon("beam"),
        goToStateType: "PlacingBeamStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeamStart" || state.type === "PlacingBeamEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Sol",
        tooltip: "Ground",
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
    title: "Dynamique",
    elements: [
      {
        label: "Amortisseur",
        tooltip: "Damper",
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
        label: "Ressort",
        tooltip: "Spring",
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
        label: "Masse",
        tooltip: "Mass",
        iconSrc: icon("mass"),
        goToStateType: "PlacingMass",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMass",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Moteur",
        tooltip: "Motor",
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
    title: "Contraintes",
    elements: [
      {
        label: "Dimension",
        tooltip: "Dimension",
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
          ].includes(state.type) ||
          (state.type === "PlacingValue" &&
            get_constraint_element_from_id(
              state.elementID,
              mechanism.constraintElements,
            )!.type !== "gear-ratio"),
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Rapport d'engrenages",
        tooltip: "Gear ratio",
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
        label: "Longueurs égales",
        tooltip: "Equal lengths",
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
        label: "Alignement horizontal / vertical",
        tooltip: "Horizontal/Vertical alignement",
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
        label: "Perpendiculaire",
        tooltip: "Normal",
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
        label: "Parallèle",
        tooltip: "Parallel",
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
    title: "Simulation",
    elements: [
      {
        label: "Force",
        tooltip: "Force",
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
        label: "Moment",
        tooltip: "Moment",
        iconSrc: icon("moment"),
        goToStateType: "PlacingMomentStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingMomentStart" ||
          state.type === "PlacingMomentEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        label: "Sonde",
        tooltip: "Probe",
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
  const SIZE = 28;
  const PADDING = 2;

  // Rebuilt on every render, which is how the icons and highlight colors follow
  // a theme change: both are read from the active canvas palette at call time.
  const palette = edition_palette();

  const handleElementClick = (element: PaletteElement) => {
    if (appMode !== "edition") {
      if (element.simBehavior === "structural") {
        onExitToEdition();
      } else if (element.simBehavior === "constraint") {
        onPauseSim();
      }
      // "observational" → no sim side-effect
    }
    setCanvasState(tool_state(element.goToStateType));
  };

  // Structural, not visual: the group sizes are the same under every theme.
  const maxIconsInGroup = Math.max(...palette.map((g) => g.elements.length), 1);

  const [columns, setColumns] = useState(2);
  useEffect(() => {
    const computeColumns = () => {
      const availableHeight = window.innerHeight - 200;
      const rowHeight = (SIZE + 2 * PADDING) * 3;
      const rowsThatFit = Math.max(1, Math.floor(availableHeight / rowHeight));
      setColumns(Math.max(2, Math.ceil(maxIconsInGroup / rowsThatFit)));
    };

    computeColumns();
    window.addEventListener("resize", computeColumns);
    return () => window.removeEventListener("resize", computeColumns);
  }, [maxIconsInGroup]);

  return (
    <Paper
      elevation={0}
      sx={{
        position: "absolute",
        left: 16,
        top: 16,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        p: 0.5,
        zIndex: 1000,
        maxHeight: "calc(100vh - 32px)",
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
        <section key={group.title}>
          {group.title !== "Interface" && (
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
                {group.title}
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
              return (
                <Tooltip
                  key={element.goToStateType}
                  title={key ? `${element.tooltip} (${key})` : element.tooltip}
                  placement="right"
                  arrow
                  disableInteractive
                  onOpen={() => {}}
                >
                  <IconButton
                    onClick={() => handleElementClick(element)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleElementClick(element);
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
                    aria-label={element.label}
                  >
                    <Box
                      component="img"
                      src={iconSrc}
                      alt={element.label}
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
