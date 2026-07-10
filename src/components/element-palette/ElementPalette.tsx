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

import { AppMode, CanvasState, CanvasStateType } from "../../types";
import { COLORS } from "../../constants/rendering-specs";
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
  tooltip: string;
  iconSrc: string;
  simIconSrc?: string;
  goToStateType: CanvasStateType;
  hilightRule: (state: CanvasState, mechanism: Mechanism) => boolean;
  hilightColor: string;
  hilightHoverColor: string;
  simHilightColor?: string;
  simHilightHoverColor?: string;
  simBehavior: SimBehavior;
}

const EDITION_PALETTE: { title: string; elements: PaletteElement[] }[] = [
  {
    title: "Interface",
    elements: [
      {
        label: "Selection",
        tooltip: "Select (Esc)",
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
          (state.type === "EditingConstraint" && !state.isPlacing),
        hilightColor: COLORS.SELECTION_BOX,
        hilightHoverColor: COLORS.SELECTION_STROKE,
        simHilightColor: COLORS.ORANGE,
        simHilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Gomme",
        tooltip: "Eraser (A)",
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
        tooltip: "Slider (S)",
        iconSrc: icon("slider"),
        goToStateType: "PlacingSlider",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingSlider",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Pivot",
        tooltip: "Pivot (P)",
        iconSrc: icon("pivot"),
        goToStateType: "PlacingPivot",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingPivot",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Courroie",
        tooltip: "Belt (T)",
        iconSrc: icon("belt"),
        goToStateType: "PlacingBeltStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeltStart" || state.type === "PlacingBeltEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Engrenage",
        tooltip: "Gear (G)",
        iconSrc: icon("gear"),
        goToStateType: "PlacingGearStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingGearStart" ||
          state.type === "PlacingGearRadius",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
    ],
  },
  {
    title: "Structure",
    elements: [
      {
        label: "Jointure",
        tooltip: "Join (J)",
        iconSrc: icon("join"),
        goToStateType: "PlacingJoin",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingJoin",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Poutre",
        tooltip: "Beam (B)",
        iconSrc: icon("beam"),
        goToStateType: "PlacingBeamStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingBeamStart" || state.type === "PlacingBeamEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Sol",
        tooltip: "Ground (R)",
        iconSrc: icon("ground"),
        goToStateType: "PlacingGround",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingGround",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
    ],
  },
  {
    title: "Dynamique",
    elements: [
      {
        label: "Amortisseur",
        tooltip: "Damper (C)",
        iconSrc: icon("damper"),
        goToStateType: "PlacingDamperStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingDamperStart" ||
          state.type === "PlacingDamperEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Ressort",
        tooltip: "Spring (K)",
        iconSrc: icon("spring"),
        goToStateType: "PlacingSpringStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingSpringStart" ||
          state.type === "PlacingSpringEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Masse",
        tooltip: "Mass (W)",
        iconSrc: icon("mass"),
        goToStateType: "PlacingMass",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMass",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Moteur",
        tooltip: "Motor (M)",
        iconSrc: icon("motor"),
        goToStateType: "PlacingMotor",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMotor",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
    ],
  },
  {
    title: "Contraintes",
    elements: [
      {
        label: "Dimension",
        tooltip: "Dimension (D)",
        iconSrc: icon("dimention"),
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
          (state.type === "EditingConstraint" &&
            state.isPlacing &&
            get_constraint_element_from_id(
              state.elementID,
              mechanism.constraintElements,
            )!.type !== "gear-ratio"),
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Rapport d'engrenages",
        tooltip: "Gear ratio (Q)",
        iconSrc: icon("ratio"),
        goToStateType: "GearRatioConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state, mechanism) =>
          state.type === "GearRatioConstraintStart" ||
          state.type === "GearRatioConstraintGear" ||
          (state.type === "EditingConstraint" &&
            state.isPlacing &&
            get_constraint_element_from_id(
              state.elementID,
              mechanism.constraintElements,
            )!.type === "gear-ratio"),
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Longueurs égales",
        tooltip: "Equal lengths (E)",
        iconSrc: icon("equal"),
        goToStateType: "EqualConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "EqualConstraintStart" ||
          state.type === "EqualConstraintEdge" ||
          state.type === "EqualConstraintGear",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Alignement horizontal / vertical",
        tooltip: "Horizontal/Vertical alignement  (H/V)",
        iconSrc: icon("horizontal-vertical"),
        goToStateType: "HorizontalVerticalConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "HorizontalVerticalConstraintStart" ||
          state.type === "HorizontalVerticalConstraintNode",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Perpendiculaire",
        tooltip: "Normal (N)",
        iconSrc: icon("normal"),
        goToStateType: "NormalConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "NormalConstraintStart" ||
          state.type === "NormalConstraintEdge",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Parallèle",
        tooltip: "Parallel (L)",
        iconSrc: icon("parallel"),
        goToStateType: "ParallelConstraintStart",
        simBehavior: "constraint",
        hilightRule: (state) =>
          state.type === "ParallelConstraintStart" ||
          state.type === "ParallelConstraintEdge",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
    ],
  },
  {
    title: "Simulation",
    elements: [
      {
        label: "Force",
        tooltip: "Force (F)",
        iconSrc: icon("force"),
        goToStateType: "PlacingForceStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingForceStart" ||
          state.type === "PlacingForceEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Force répartie",
        tooltip: "Distributed Force (U)",
        iconSrc: icon("distributed-force"),
        goToStateType: "PlacingDistributedForceStart",
        simBehavior: "structural",
        hilightRule: (state) =>
          state.type === "PlacingDistributedForceStart" ||
          state.type === "PlacingDistributedForceEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Moment",
        tooltip: "Moment (O)",
        iconSrc: icon("moment"),
        goToStateType: "PlacingMoment",
        simBehavior: "structural",
        hilightRule: (state) => state.type === "PlacingMoment",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Sonde",
        tooltip: "Probe (I)",
        iconSrc: icon("probe"),
        goToStateType: "PlacingProbe",
        simBehavior: "observational",
        hilightRule: (state) =>
          state.type === "PlacingProbe" ||
          state.type === "PlacingProbeMetrics",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
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

  const handleElementClick = (element: PaletteElement) => {
    if (appMode !== "edition") {
      if (element.simBehavior === "structural") {
        onExitToEdition();
      } else if (element.simBehavior === "constraint") {
        onPauseSim();
      }
      // "observational" → no sim side-effect
    }
    setCanvasState({ type: element.goToStateType } as CanvasState);
  };

  const [columns, setColumns] = useState(2);
  useEffect(() => {
    const computeColumns = () => {
      const availableHeight = window.innerHeight - 200;
      const rowHeight = (SIZE + 2 * PADDING) * 3;
      const rowsThatFit = Math.max(1, Math.floor(availableHeight / rowHeight));
      const maxIconsInGroup = Math.max(
        ...EDITION_PALETTE.map((g) => g.elements.length),
        1,
      );
      setColumns(Math.max(2, Math.ceil(maxIconsInGroup / rowsThatFit)));
    };

    computeColumns();
    window.addEventListener("resize", computeColumns);
    return () => window.removeEventListener("resize", computeColumns);
  }, []);

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
      {EDITION_PALETTE.map((group) => (
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
              const hilightColor = isSimMode && element.simHilightColor
                ? element.simHilightColor
                : element.hilightColor;
              const hilightHoverColor = isSimMode && element.simHilightHoverColor
                ? element.simHilightHoverColor
                : element.hilightHoverColor;
              const iconSrc = isSimMode && element.simIconSrc
                ? element.simIconSrc
                : element.iconSrc;
              return (
              <Tooltip
                key={element.goToStateType}
                title={element.tooltip}
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
                        : COLORS.HOVER,
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
