/**
 * Rendering specifications for mechanical elements
 */

import { UnionElement } from "../types";

export const COLORS = {
  // Canvas colors
  BACKGROUND: "#FFEDC6", // Crème doux
  GRID: "#F1DFB9",
  GRID_MAJOR: "#E8D7B0",

  // Element colors
  STROKE: "#001D59", // Bleu foncé
  FILL_BODY: "#B7E2FF", // Bleu Ciel
  FILL_NODE: "#FFBE80", // Orange doux
  ORANGE: "#d7530b", // Orange foncé
  ORANGE_STROKE: "#9c4211", // Orange foncé

  // Interaction colors
  SELECTION_STROKE: "#4a65a1", // Bleu gris foncé
  SELECTION_HALO: "#6595d0", // Bleu
  SELECTION_BOX: "#7190e5", // Bleu gris clair
  DELETION_STROKE: "#a4315d", // Rouge
  DELETION_BOX: "#ed5e71", // Rouge

  // Transparency
  ICON_TRANSPARENCY: "D0", // 80% opacity
  HALF_TRANSPARENCY: "80", // 50% opacity
  HOVER: "#00000020", //§ 12.5% opacity
} as const;

export const STROKE_WIDTHS = {
  STANDARD: 2,
  THICK: 3.5, // Hovered, Selection, Deletion
  SPIRE: 4,
} as const;

export const LINE_STYLES = {
  LINE_CAP: "square" as const,
  LINE_JOIN: "round" as const,
} as const;

export const HIT_TOLERANCE = {
  EDGE: 10,
  NODE: 14,
  CONSTRAINT: 20,
} as const;

export const INTERACTION_SPECS = {
  HALO_SIZE: 10,
  DELETION_OPACITY: 0.3,
  GHOST_PREVIEW_OPACITY: 0.6,
  GEAR_ON_BELT_GROW: 15,
  BELT_GRAB_RADIUS: 4,
} as const;

export const CURSOR_STYLE = {
  HOVER: "grab",
  MOVE: "grabbing",
};

/** Element dimensions from UX specification */
export const DIM = {
  // General
  CORNER_RADIUS: 2,
  SQUARE: 8,
  ENDPOINT_RADIUS: 7,
  MIN_EDGE_LENGTH: 50,
  TAC: 20,
  ICON_SIZE: 24,

  // Beam
  BEAM_WIDTH: 8,

  // Spring
  SPRING_INNER_WIDTH: 6,
  SPRING_COIL_RADIUS: 7,
  SPRING_MIN_COILS: 3,

  // Damper
  DAMPER_INNER_WIDTH: 6,
  DAMPER_CYLINDER_DIAMETER: 20,
  DAMPER_PISTON_WIDTH: 6,

  // Mass
  MASS_SIZE: 24,

  // Pivot
  PIVOT_OUTER_RADIUS: 9,
  PIVOT_INNER_RADIUS: 4,
  // Join
  JOIN_RADIUS: 5,

  // Slider
  SLIDER_OUTER_WIDTH: 24,
  SLIDER_OUTER_HEIGHT: 14,
  SLIDER_INNER_WIDTH: 14,
  SLIDER_INNER_HEIGHT: 6,

  // Slidep
  SLIDEP_OUTER_WIDTH: 28,

  // Gear
  DEFAULT_GEAR_RADIUS: 40,
  MIN_GEAR_RADIUS: 20,
  GEAR_TEETH_SIZE: 6,

  // Belt
  BELT_WIDTH: 4,
  END_RADIUS: 4,

  // Ground
  GROUND_WIDTH: 22,
  GROUND_HEIGHT: 10,
  GROUND_BAR_HEIGHT: 6,
  GROUND_VERTICAL_OFFSET: 6,
} as const;

export const DIMENSION_SPECS = {
  ARROW_SIZE: 18,
  ARROW_WING_LENGTH: 7,
  ARROW_WING_ANGLE: 18,
  TEXT_FONT: "16px Arial",
  TEXT_ALIGN: "center",
  TEXT_BASELINE: "middle",
  TEXT_PADDING: 3,
  TEXT_HEIGHT: 18,
  OFFSET_LINE_WIDTH: 1,
  DIMENSION_OFFSET: 20, // Distance from beam for offset dimension
} as const;

/** Ordre de dessin des éléments sur le canvas */
export const DRAWING_ORDER: UnionElement["type"][] = [
  "beam",
  "damper",
  "spring",
  "gear",
  "belt",
  "join",
  "slidep",
  "slider",
  "pivot",
  "mass",
  "dimension-edge-to-node",
  "dimension-node-to-node",
  "dimension-edge",
  "dimension-angle",
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
  "equal",
  "gear-ratio",
];
