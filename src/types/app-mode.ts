export type AppMode = "edition" | SimulationMode;
export type SimulationMode = "static" | "kinematic" | "dynamic";

/**
 * Whether `mode` is one that actually runs a recording — the two the solver drives, as
 * opposed to `"edition"` (no recording) and `"static"` (not implemented yet: its
 * `ToggleButton` stays `disabled` in `PlaybackControls`, so this case is unreached today
 * rather than handled).
 *
 * Centralised because scattering `mode === "kinematic" || mode === "dynamic"` — or worse,
 * `mode === "kinematic"` alone — through the components that read `AppMode` is exactly how
 * a mode-specific check silently stops covering a mode added after it was written.
 */
export const is_simulating = (mode: AppMode): mode is "kinematic" | "dynamic" =>
  mode === "kinematic" || mode === "dynamic";

export type PropertiesPanelTab =
  | "project"
  | "elements"
  | "constraints"
  | "library"
  | "analysis";
