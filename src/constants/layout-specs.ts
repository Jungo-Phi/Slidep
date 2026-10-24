import { ToolStateType } from "./shortcuts";

/** How the app lays itself out for the screen it runs on (see docs/plan-mobile.md). */
export const PHONE_LAYOUT = {
  /** Below this smallest side (CSS px), the phone layout: a phone held either way round, never a tablet. */
  MAX_SIDE: 600,
  /** Below this width (CSS px), the phone layout too: palette and side panel would leave too narrow a canvas between them — a tablet held upright, 768 to 834 px wide, or a narrow window. */
  MAX_WIDTH: 900,
  /** Height of the phone's top and bottom bars (px): a finger's target. */
  BAR_HEIGHT: 48,
  /** Height of the transport row (play, timeline, speed) shown in simulation (px). */
  TRANSPORT_HEIGHT: 44,
  /** Side of a palette icon in the phone's sheet (px). */
  PALETTE_ICON: 36,
  /** How far the sheet's handle must be dragged (px) to move the sheet to its next height. */
  SHEET_DRAG_STEP: 40,
  /** Share of the canvas the sheet covers at half height — the view keeps its centre in the part left in sight. */
  SHEET_HALF: 0.5,
  /** Height of the quick-access bar over the bottom bar (px). */
  QUICK_BAR_HEIGHT: 44,
  /** Side of a tool's icon in the quick-access bar (px). */
  QUICK_TOOL_ICON: 28,
} as const;

/**
 * Where the buttons in the canvas's bottom corners sit (play, the ruler): clear of its bottom edge, and of whatever covers it.
 * A layout laying a sheet over the canvas says how much it covers in `--canvas-bottom-inset`; undefined, it covers nothing.
 */
export const CANVAS_CORNER_BOTTOM =
  "calc(12px + var(--canvas-bottom-inset, 0px))";

/** The tools the phone's quick-access bar offers in edition. */
export const PHONE_QUICK_TOOLS: {
  /** Always there, first — and therefore left out of the sheet's palette. */
  FIXED: ToolStateType[];
  /**
   * One tool per palette group: the one the bar offers for its group until another of the group is used more.
   * In the order the groups get a place while the bar has room — five fit the narrowest phone.
   */
  BASE: ToolStateType[];
} = {
  FIXED: ["Selecting", "Erasing"],
  BASE: [
    "PlacingBeamStart",
    "PlacingPivot",
    "PlacingGround",
    "PlacingForceStart",
    "DimensionStart",
    "PlacingSpringStart",
    "PlacingProbe",
  ],
};
