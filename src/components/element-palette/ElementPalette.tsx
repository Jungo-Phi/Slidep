/**
 * ElementPalette component
 * Displays available mechanical elements for state selection
 */
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

import { CanvasState, CanvasStateType } from "../../types/canvas-state";
import { COLORS } from "../../constants/rendering-specs";

/**
 * Element definition for palette
 */
interface PaletteElement {
  label: string;
  tooltip: string;
  iconSrc: string;
  goToStateType: CanvasStateType;
  hilightStateTypes: CanvasStateType[];
}

/**
 * Palette elements grouped by function
 */
const PALETTE_GROUPS: { title: string; elements: PaletteElement[] }[] = [
  {
    title: "Interface",
    elements: [
      {
        label: "Selection",
        tooltip: "Select (Esc)",
        iconSrc: selectIconUrl,
        goToStateType: "Selecting",
        hilightStateTypes: [
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
          "EditingConstraint",
        ],
      },
      {
        label: "Gomme",
        tooltip: "Eraser (A)",
        iconSrc: eraserIconUrl,
        goToStateType: "Erasing",
        hilightStateTypes: ["Erasing", "ErasingMultiple"],
      },
    ],
  },
  {
    title: "Liaisons",
    elements: [
      {
        label: "Pivot",
        tooltip: "Pivot (P)",
        iconSrc: pivotIconUrl,
        goToStateType: "PlacingPivot",
        hilightStateTypes: ["PlacingPivot"],
      },
      {
        label: "Glissière",
        tooltip: "Slider (S)",
        iconSrc: sliderIconUrl,
        goToStateType: "PlacingSlider",
        hilightStateTypes: ["PlacingSlider"],
      },
      {
        label: "Masse",
        tooltip: "Mass (M)",
        iconSrc: massIconUrl,
        goToStateType: "PlacingMass",
        hilightStateTypes: ["PlacingMass"],
      },
      {
        label: "Jointure",
        tooltip: "Join (J)",
        iconSrc: joinIconUrl,
        goToStateType: "PlacingJoin",
        hilightStateTypes: ["PlacingJoin"],
      },
      {
        label: "Courroie",
        tooltip: "Belt (T)",
        iconSrc: beltIconUrl,
        goToStateType: "PlacingBeltStart",
        hilightStateTypes: ["PlacingBeltStart", "PlacingBeltEnd"],
      },
      {
        label: "Engrenage",
        tooltip: "Gear (Q)",
        iconSrc: gearIconUrl,
        goToStateType: "PlacingGearStart",
        hilightStateTypes: ["PlacingGearStart", "PlacingGearRadius"],
      },
    ],
  },
  {
    title: "Structure",
    elements: [
      {
        label: "Poutre",
        tooltip: "Beam (B)",
        iconSrc: beamIconUrl,
        goToStateType: "PlacingBeamStart",
        hilightStateTypes: ["PlacingBeamStart", "PlacingBeamEnd"],
      },
      {
        label: "Sol",
        tooltip: "Ground (G)",
        iconSrc: groundIconUrl,
        goToStateType: "PlacingGround",
        hilightStateTypes: ["PlacingGround"],
      },
      {
        label: "Amortisseur",
        tooltip: "Damper (C)",
        iconSrc: damperIconUrl,
        goToStateType: "PlacingDamperStart",
        hilightStateTypes: ["PlacingDamperStart", "PlacingDamperEnd"],
      },
      {
        label: "Ressort",
        tooltip: "Spring (K)",
        iconSrc: springIconUrl,
        goToStateType: "PlacingSpringStart",
        hilightStateTypes: ["PlacingSpringStart", "PlacingSpringEnd"],
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
        hilightStateTypes: [
          "DimensionStart",
          "DimensionNode",
          "DimensionEdge",
          "DimensionEdgeToNode",
          "DimensionNodeToNode",
          "DimensionAngle",
          "DimensionRadius",
        ],
      },
      {
        label: "Alignement horizontal / vertical",
        tooltip: "Horizontal/Vertical alignement  (H)",
        iconSrc: horizontalVerticalAlignIconUrl,
        goToStateType: "HorizontalVerticalConstraintStart",
        hilightStateTypes: [
          "HorizontalVerticalConstraintStart",
          "HorizontalVerticalConstraintNode",
        ],
      },
      {
        label: "Perpendiculaire",
        tooltip: "Normal (N)",
        iconSrc: normalIconUrl,
        goToStateType: "NormalConstraintStart",
        hilightStateTypes: ["NormalConstraintStart", "NormalConstraintEdge"],
      },
      {
        label: "Parallèle",
        tooltip: "Parallel (L)",
        iconSrc: parallelIconUrl,
        goToStateType: "ParallelConstraintStart",
        hilightStateTypes: [
          "ParallelConstraintStart",
          "ParallelConstraintEdge",
        ],
      },
      {
        label: "Longueurs égales",
        tooltip: "Equal lengths (E)",
        iconSrc: equalIconUrl,
        goToStateType: "EqualConstraintStart",
        hilightStateTypes: [
          "EqualConstraintStart",
          "EqualConstraintEdge",
          "EqualConstraintGear",
        ],
      },
      {
        label: "Rapport d'engrenages",
        tooltip: "Gear ratio (R)",
        iconSrc: ratioIconUrl,
        goToStateType: "GearRatioConstraintStart",
        hilightStateTypes: [
          "GearRatioConstraintStart",
          "GearRatioConstraintGear",
        ],
      },
    ],
  },
];

interface ElementPaletteProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
}

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

export const ElementPalette: React.FC<ElementPaletteProps> = ({
  setCanvasState,
  canvasState,
}) => {
  const SIZE = 32;
  const PADDING = 4;

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
        ...PALETTE_GROUPS.map((g) => g.elements.length),
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
      {PALETTE_GROUPS.map((group) => (
        <section key={group.title}>
          {group !== PALETTE_GROUPS[0] && (
            <>
              <Divider variant="fullWidth" flexItem sx={{ mb: 0.8, mt: 0.4 }} />
              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color: "text.disabled",
                  textTransform: "uppercase",
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
              width: "100%",
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
                    backgroundColor:
                      canvasState.type &&
                      element.hilightStateTypes.includes(canvasState.type)
                        ? PALETTE_GROUPS[0].elements[0].hilightStateTypes.includes(
                            canvasState.type,
                          )
                          ? COLORS.SELECTION_BOX
                          : PALETTE_GROUPS[0].elements[1].hilightStateTypes.includes(
                                canvasState.type,
                              )
                            ? COLORS.DELETION_BOX
                            : COLORS.ORANGE
                        : "transparent",
                    "&:hover": {
                      background:
                        canvasState.type &&
                        element.hilightStateTypes.includes(canvasState.type)
                          ? PALETTE_GROUPS[0].elements[0].hilightStateTypes.includes(
                              canvasState.type,
                            )
                            ? COLORS.SELECTION_STROKE
                            : PALETTE_GROUPS[0].elements[1].hilightStateTypes.includes(
                                  canvasState.type,
                                )
                              ? COLORS.DELETION_STROKE
                              : COLORS.ORANGE_STROKE
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
                        element.hilightStateTypes.includes(canvasState.type)
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
