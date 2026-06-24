import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";

import selectIconUrl from "../../assets/icons/palette/select.svg";
import beamIconUrl from "../../assets/icons/palette/beam.svg";
import groundIconUrl from "../../assets/icons/palette/ground.svg";
import pivotIconUrl from "../../assets/icons/palette/pivot.svg";
import sliderIconUrl from "../../assets/icons/palette/slider.svg";
import joinIconUrl from "../../assets/icons/palette/join.svg";
import eraserIconUrl from "../../assets/icons/palette/eraser.svg";
import springIconUrl from "../../assets/icons/palette/spring.svg";
import damperIconUrl from "../../assets/icons/palette/damper.svg";
import gearIconUrl from "../../assets/icons/palette/gear.svg";
import beltIconUrl from "../../assets/icons/palette/belt.svg";
import massIconUrl from "../../assets/icons/palette/mass.svg";
import dimensionIconUrl from "../../assets/icons/palette/dimention.svg";
import equalIconUrl from "../../assets/icons/palette/equal.svg";
import horizontalVerticalAlignIconUrl from "../../assets/icons/palette/horizontal-vertical.svg";
import normalIconUrl from "../../assets/icons/palette/normal.svg";
import parallelIconUrl from "../../assets/icons/palette/parallel.svg";
import ratioIconUrl from "../../assets/icons/palette/ratio.svg";
import forceIconUrl from "../../assets/icons/palette/force.svg";
import distributedForceIconUrl from "../../assets/icons/palette/distributed-force.svg";
import momentIconUrl from "../../assets/icons/palette/moment.svg";
import motorIconUrl from "../../assets/icons/palette/motor.svg";
import probeIconUrl from "../../assets/icons/palette/probe.svg";

import { CanvasState, CanvasStateType } from "../../types";
import { COLORS } from "../../constants/rendering-specs";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { Mechanism } from "../../types";

interface PaletteElement {
  label: string;
  tooltip: string;
  iconSrc: string;
  goToStateType: CanvasStateType;
  hilightRule: (state: CanvasState, mechanism: Mechanism) => boolean;
  hilightColor: string;
  hilightHoverColor: string;
}

const EDITION_PALETTE: { title: string; elements: PaletteElement[] }[] = [
  {
    title: "Interface",
    elements: [
      {
        label: "Selection",
        tooltip: "Select (Esc)",
        iconSrc: selectIconUrl,
        goToStateType: "Selecting",
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
          ].includes(state.type) ||
          (state.type === "EditingConstraint" && !state.isPlacing),
        hilightColor: COLORS.SELECTION_BOX,
        hilightHoverColor: COLORS.SELECTION_STROKE,
      },
      {
        label: "Gomme",
        tooltip: "Eraser (A)",
        iconSrc: eraserIconUrl,
        goToStateType: "Erasing",
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
        iconSrc: sliderIconUrl,
        goToStateType: "PlacingSlider",
        hilightRule: (state) => state.type === "PlacingSlider",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Pivot",
        tooltip: "Pivot (P)",
        iconSrc: pivotIconUrl,
        goToStateType: "PlacingPivot",
        hilightRule: (state) => state.type === "PlacingPivot",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Courroie",
        tooltip: "Belt (T)",
        iconSrc: beltIconUrl,
        goToStateType: "PlacingBeltStart",
        hilightRule: (state) =>
          state.type === "PlacingBeltStart" || state.type === "PlacingBeltEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Engrenage",
        tooltip: "Gear (G)",
        iconSrc: gearIconUrl,
        goToStateType: "PlacingGearStart",
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
        iconSrc: joinIconUrl,
        goToStateType: "PlacingJoin",
        hilightRule: (state) => state.type === "PlacingJoin",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Poutre",
        tooltip: "Beam (B)",
        iconSrc: beamIconUrl,
        goToStateType: "PlacingBeamStart",
        hilightRule: (state) =>
          state.type === "PlacingBeamStart" || state.type === "PlacingBeamEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Sol",
        tooltip: "Ground (R)",
        iconSrc: groundIconUrl,
        goToStateType: "PlacingGround",
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
        iconSrc: damperIconUrl,
        goToStateType: "PlacingDamperStart",
        hilightRule: (state) =>
          state.type === "PlacingDamperStart" ||
          state.type === "PlacingDamperEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Ressort",
        tooltip: "Spring (K)",
        iconSrc: springIconUrl,
        goToStateType: "PlacingSpringStart",
        hilightRule: (state) =>
          state.type === "PlacingSpringStart" ||
          state.type === "PlacingSpringEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Masse",
        tooltip: "Mass (M)",
        iconSrc: massIconUrl,
        goToStateType: "PlacingMass",
        hilightRule: (state) => state.type === "PlacingMass",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Moteur",
        tooltip: "Motor (W)",
        iconSrc: motorIconUrl,
        goToStateType: "PlacingMotor",
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
        iconSrc: dimensionIconUrl,
        goToStateType: "DimensionStart",
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
        iconSrc: ratioIconUrl,
        goToStateType: "GearRatioConstraintStart",
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
        iconSrc: equalIconUrl,
        goToStateType: "EqualConstraintStart",
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
        iconSrc: horizontalVerticalAlignIconUrl,
        goToStateType: "HorizontalVerticalConstraintStart",
        hilightRule: (state) =>
          state.type === "HorizontalVerticalConstraintStart" ||
          state.type === "HorizontalVerticalConstraintNode",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Perpendiculaire",
        tooltip: "Normal (N)",
        iconSrc: normalIconUrl,
        goToStateType: "NormalConstraintStart",
        hilightRule: (state) =>
          state.type === "NormalConstraintStart" ||
          state.type === "NormalConstraintEdge",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Parallèle",
        tooltip: "Parallel (L)",
        iconSrc: parallelIconUrl,
        goToStateType: "ParallelConstraintStart",
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
        iconSrc: forceIconUrl,
        goToStateType: "PlacingForceStart",
        hilightRule: (state) =>
          state.type === "PlacingForceStart" ||
          state.type === "PlacingForceEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Force répartie",
        tooltip: "Distributed Force (U)",
        iconSrc: distributedForceIconUrl,
        goToStateType: "PlacingDistributedForceStart",
        hilightRule: (state) =>
          state.type === "PlacingDistributedForceStart" ||
          state.type === "PlacingDistributedForceEnd",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Moment",
        tooltip: "Moment (O)",
        iconSrc: momentIconUrl,
        goToStateType: "PlacingMoment",
        hilightRule: (state) => state.type === "PlacingMoment",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
      {
        label: "Sonde",
        tooltip: "Probe (I)",
        iconSrc: probeIconUrl,
        goToStateType: "PlacingProbe",
        hilightRule: (state) => state.type === "PlacingProbe",
        hilightColor: COLORS.ORANGE,
        hilightHoverColor: COLORS.ORANGE_STROKE,
      },
    ],
  },
];

/**
 * Preload all icons to improve performance by loading them in memory before they are needed
 */
const preloadIcons = (iconUrls: string[]): void => {
  if (typeof window === "undefined") return;

  iconUrls.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
};

/** All icon URLs for preloading */
const ALL_PALETTE_ICON_URLS = [
  selectIconUrl,
  beamIconUrl,
  groundIconUrl,
  pivotIconUrl,
  sliderIconUrl,
  joinIconUrl,
  eraserIconUrl,
  springIconUrl,
  damperIconUrl,
  gearIconUrl,
  beltIconUrl,
  massIconUrl,
  dimensionIconUrl,
  equalIconUrl,
  horizontalVerticalAlignIconUrl,
  normalIconUrl,
  parallelIconUrl,
  ratioIconUrl,
];

interface ElementPaletteProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  mechanism: Mechanism;
}

export const ElementPalette: React.FC<ElementPaletteProps> = ({
  setCanvasState,
  canvasState,
  mechanism,
}) => {
  const SIZE = 28;
  const PADDING = 2;

  /** Handle state selection by clicking on an button */
  const handleElementClick = (stateType: CanvasStateType) => {
    setCanvasState({ type: stateType } as CanvasState);
  };

  // Preload icons on mount to improve performance
  useEffect(() => {
    preloadIcons(ALL_PALETTE_ICON_URLS);
  }, []);

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
            {group.elements.map((element) => (
              <Tooltip
                key={element.goToStateType}
                title={element.tooltip}
                placement="right"
                arrow
                disableInteractive
                onOpen={() => {}}
              >
                <IconButton
                  onClick={() => handleElementClick(element.goToStateType)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleElementClick(element.goToStateType);
                    }
                  }}
                  sx={{
                    width: SIZE + 2 * PADDING,
                    height: SIZE + 2 * PADDING,
                    borderRadius: 0.75,
                    backgroundColor: element.hilightRule(canvasState, mechanism)
                      ? element.hilightColor
                      : "transparent",
                    "&:hover": {
                      background: element.hilightRule(canvasState, mechanism)
                        ? element.hilightHoverColor
                        : COLORS.HOVER,
                    },
                  }}
                  aria-label={element.label}
                >
                  <Box
                    component="img"
                    src={element.iconSrc}
                    alt={element.label}
                    sx={{
                      width: SIZE,
                      height: SIZE,
                      display: "block",
                      filter:
                        canvasState.type &&
                        element.hilightRule(canvasState, mechanism)
                          ? "brightness(0) invert(1)"
                          : "none",
                    }}
                  />
                </IconButton>
              </Tooltip>
            ))}
          </div>
        </section>
      ))}
    </Paper>
  );
};

export default ElementPalette;
