/** Height of every command in the top bar, in pixels: what MUI already gives an `IconButton size="small"` wrapped around a 20px icon.
 * Those icon buttons therefore need no styling at all; this constant is for the controls that are not icon buttons and have to line up on them explicitly. */
export const TOP_BAR_CONTROL_HEIGHT = 30;

/** The rule between two groups of the top bar: wider than the gap inside a group, and kept short of the controls' own height so it reads as a separator and not as a column. */
export const TOP_BAR_DIVIDER_SX = { mx: 0.75, my: 0.5 } as const;

/** The gap between two neighbouring controls of one group. Steppers are the exception: their parts touch, which is what makes them read as a single control. */
export const TOP_BAR_GROUP_GAP = 0.5;

/** Sets the mode selector apart from the transport buttons: it chooses what the app is doing, where they only drive a run. */
export const TOP_BAR_SECTION_GAP = 1;

/** A stepper arrow or a jump-to-end button: full height, but narrow, an arrow needing no room around it.
 * The square corner comes with it, `IconButton`'s round one drawing an ellipse on anything that is not a square. */
export const TOP_BAR_SLIM_BUTTON_SX = { px: 0.2, borderRadius: 1 } as const;
