/**
 * What a load occupies on screen, once its magnitudes have been run through the
 * display ruler. Built by the `*_screen_geometry` functions of
 * `utils/load-geom.ts`, and read by drawing, hit-testing and the on-canvas value
 * editor alike — so a load is picked exactly where it is drawn.
 */

import type { ScreenPoint, WorldPoint } from "./mechanism";

export type ForceScreenGeometry = {
  /** Where the arrow starts: the node or edge end it is anchored on. */
  base: ScreenPoint;
  /** Base→tip, its length the compressed magnitude. */
  vector: ScreenPoint;
  tip: ScreenPoint;
  /** Centre of the value label, past the arrowhead. */
  label: ScreenPoint;
};

export type DistributedScreenGeometry = {
  /** The two ends of the beam the load rides. */
  start: ScreenPoint;
  end: ScreenPoint;
  /** The two endpoint arrows, sharing one gain so the profile stays linear. */
  vectorStart: ScreenPoint;
  vectorEnd: ScreenPoint;
  tipStart: ScreenPoint;
  tipEnd: ScreenPoint;
  labelStart: ScreenPoint;
  labelEnd: ScreenPoint;
};

export type MomentScreenGeometry = {
  center: ScreenPoint;
  /** World centre too: it is what a drag measures its radius from. */
  worldCenter: WorldPoint;
  radius: number;
  label: ScreenPoint;
};
