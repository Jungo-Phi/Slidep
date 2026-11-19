/**
 * What the app is doing: `"static"` is the mechanism at rest — where it is drawn and edited — and the two others run it.
 * There is no separate edition mode: a simulation is edited at t=0 like the mechanism at rest is, and a structure gesture brings it back to rest.
 */
export type AppMode = "static" | SimulationMode;
/** The modes that run a recording, and the ones a mechanism remembers having last been run in. */
export type SimulationMode = "kinematic" | "dynamic";

/**
 * Whether `mode` is one that actually runs a recording, as opposed to `"static"`, the mechanism at rest.
 *
 * Centralised because scattering `mode === "kinematic" || mode === "dynamic"` — or worse, `mode === "kinematic"` alone — through the components that read `AppMode` is exactly how a mode-specific check silently stops covering a mode added after it was written.
 */
export const is_simulating = (mode: AppMode): mode is SimulationMode =>
  mode === "kinematic" || mode === "dynamic";

export type PropertiesPanelTab =
  | "project"
  | "elements"
  | "constraints"
  | "library"
  | "analysis";
