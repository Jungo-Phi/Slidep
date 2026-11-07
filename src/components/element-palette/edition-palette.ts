/**
 * The tools of the edition palette, grouped as they are laid out.
 *
 * Shared by the desktop palette, the phone palette and quick bar, and the coverage test, so it lives apart from any one component.
 */

import { darken } from "@mui/material/styles";
import { icon } from "./iconDataUris";
import { CanvasState, Mechanism } from "../../types";
import { COLORS } from "../../theme/canvas-theme";
import { ToolStateType } from "../../constants/shortcuts";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { StringKey } from "../../i18n";

export interface PaletteElement {
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
}

/**
 * Built on demand rather than as a module constant: the icons and highlight colors it holds come from the active theme, and a constant would freeze them on whichever theme was loaded first.
 * `ElementPalette.test.ts` checks it covers every tool state — see the note there on why a `CanvasStateType` can't silently highlight nothing.
 */
export const edition_palette = (): {
  titleKey: StringKey;
  elements: PaletteElement[];
}[] => [
  {
    titleKey: "interface",
    elements: [
      {
        nameKey: "tool_select",
        iconSrc: icon("select"),
        simIconSrc: icon("select-sim"),
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
            "MovingBeltBody",
            "ChangingGearRadius",
            "MovingForce",
            "MovingDistributedForce",
            "MovingMoment",
            "MovingConstraint",
            "SimulationDragging",
            "DraggingFloorHeight",
            "DraggingFloorAngle",
            "EditingFloorValue",
            // The ruler has no palette button of its own — it is armed and read from its own corner of the canvas.
            // It lights this one, which is the tool it falls back to.
            "Measuring",
            "MeasuringFrom",
            "Measured",
            // Same reasoning: armed from the analysis panel's own picker, not the palette, and it falls back here too.
            "PickingMomentBalanceNode",
          ].includes(state.type) ||
          // A value edit opened from a tool that stays armed keeps that tool lit: it is what a reader finds on exit, not the selection.
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
        hilightRule: (state) =>
          state.type === "Erasing" || state.type === "ErasingMultiple",
        hilightColor: COLORS.DELETION_BOX,
        hilightHoverColor: COLORS.DELETION_STROKE,
      },
    ],
  },
  {
    titleKey: "geometry",
    elements: [
      {
        nameKey: "beam",
        iconSrc: icon("beam"),
        goToStateType: "PlacingBeamStart",
        hilightRule: (state) =>
          state.type === "PlacingBeamStart" || state.type === "PlacingBeamEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "join",
        iconSrc: icon("join"),
        goToStateType: "PlacingJoin",
        hilightRule: (state) => state.type === "PlacingJoin",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "connections",
    elements: [
      {
        nameKey: "slider",
        iconSrc: icon("slider"),
        goToStateType: "PlacingSlider",
        hilightRule: (state) => state.type === "PlacingSlider",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "pivot",
        iconSrc: icon("pivot"),
        goToStateType: "PlacingPivot",
        hilightRule: (state) => state.type === "PlacingPivot",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "belt",
        iconSrc: icon("belt"),
        goToStateType: "PlacingBeltStart",
        hilightRule: (state) =>
          state.type === "PlacingBeltStart" || state.type === "PlacingBeltEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "tool_gear",
        iconSrc: icon("gear"),
        goToStateType: "PlacingGearStart",
        hilightRule: (state) =>
          state.type === "PlacingGearStart" ||
          state.type === "PlacingGearRadius",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "supports",
    elements: [
      {
        nameKey: "ground",
        iconSrc: icon("ground"),
        goToStateType: "PlacingGround",
        hilightRule: (state) => state.type === "PlacingGround",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "masses_springs",
    elements: [
      {
        nameKey: "damper",
        iconSrc: icon("damper"),
        goToStateType: "PlacingDamperStart",
        hilightRule: (state) =>
          state.type === "PlacingDamperStart" ||
          state.type === "PlacingDamperEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "spring",
        iconSrc: icon("spring"),
        goToStateType: "PlacingSpringStart",
        hilightRule: (state) =>
          state.type === "PlacingSpringStart" ||
          state.type === "PlacingSpringEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "mass",
        iconSrc: icon("mass"),
        goToStateType: "PlacingMass",
        hilightRule: (state) => state.type === "PlacingMass",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "loads",
    elements: [
      {
        nameKey: "force",
        iconSrc: icon("force"),
        goToStateType: "PlacingForceStart",
        hilightRule: (state) =>
          state.type === "PlacingForceStart" ||
          state.type === "PlacingForceEnd" ||
          state.type === "PlacingDistributedForce",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "moment",
        iconSrc: icon("moment"),
        goToStateType: "PlacingMomentStart",
        hilightRule: (state) =>
          state.type === "PlacingMomentStart" ||
          state.type === "PlacingMomentEnd",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
      {
        nameKey: "motor",
        iconSrc: icon("motor"),
        goToStateType: "PlacingMotor",
        hilightRule: (state) => state.type === "PlacingMotor",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "constraints",
    elements: [
      {
        nameKey: "dimension",
        iconSrc: icon("dimension"),
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
        hilightRule: (state) =>
          state.type === "ParallelConstraintStart" ||
          state.type === "ParallelConstraintEdge",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
  {
    titleKey: "measurements",
    elements: [
      {
        nameKey: "tool_probe",
        iconSrc: icon("probe"),
        goToStateType: "PlacingProbe",
        hilightRule: (state) =>
          state.type === "PlacingProbe" || state.type === "PlacingProbeMetrics",
        hilightColor: COLORS.ACCENT,
        hilightHoverColor: COLORS.ACCENT_DARK,
      },
    ],
  },
];
