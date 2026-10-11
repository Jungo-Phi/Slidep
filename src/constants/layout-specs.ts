/** How the app lays itself out for the screen it runs on (see docs/plan-mobile.md). */
export const PHONE_LAYOUT = {
  /** Below this smallest side (CSS px), the phone layout: a phone held either way round, never a tablet. */
  MAX_SIDE: 600,
  /** Height of the phone's top and bottom bars (px): a finger's target. */
  BAR_HEIGHT: 48,
  /** Height of the transport row (play, timeline, speed) shown in simulation (px). */
  TRANSPORT_HEIGHT: 44,
  /** Side of a palette icon in the phone's sheet (px). */
  PALETTE_ICON: 40,
  /** How far the sheet's handle must be dragged (px) to move the sheet to its next height. */
  SHEET_DRAG_STEP: 40,
} as const;
