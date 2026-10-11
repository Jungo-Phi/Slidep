import { ProbeCurveKey } from "../solver/recording/probe-series";

/**
 * Categorical palette for the plotted curves.
 * Unlike the UI's semantic roles, these are chosen for mutual distinguishability, so they are their own palette rather than theme tokens — the scalar curve is the one that borrows the theme's accent, which is why this is a function of it and not a constant.
 */
export const probe_curve_colors = (
  accent: string,
): Record<ProbeCurveKey, string> => ({
  x: "#E5484D",
  y: "#2F81F7",
  norm: "#8250DF",
  value: accent,
});

/** Colors used to distinguish elements in the superposed (comparison) mode. */
export const PROBE_ELEMENT_COLORS = [
  "#E5484D",
  "#2F81F7",
  "#2DA44E",
  "#8250DF",
  "#D4A72C",
  "#FD7E14",
  "#12A594",
  "#D6409F",
];
