/**
 * Rendering specifications for mechanical elements
 */

import { UnionElement } from "../types";

export const COLORS = {
  // Canvas colors
  BACKGROUND: "#fdecc9", // Crème doux
  GRID: "#f6e5c3",
  GRID_MAJOR: "#ecdbb8",
  GRID_LARGER: "#decead",
  GRID_AXIS: "#d3c5a6",

  // Element colors
  STROKE: "#001D59", // Bleu foncé
  FILL_BODY: "#b7e2ff", // Bleu Ciel
  FILL_NODE: "#ffbe80", // Orange doux
  ORANGE: "#d7530b", // Orange foncé
  ORANGE_STROKE: "#9c4211", // Orange foncé

  // Interaction colors
  SELECTION_STROKE: "#6595d0",
  SELECTION_FILL: "#b7e2ff", // FILL_BODY
  SELECTION_BOX: "#7190e5",
  DELETION_STROKE: "#a4315d",
  DELETION_BOX: "#ed5e71",
  SELECTION_ORANGE: "#ff621e",

  // Transparency
  ICON_TRANSPARENCY: "C8", // 75% opacity
  HALF_TRANSPARENCY: "80", // 50% opacity
  HOVER: "#00000020", //§ 12.5% opacity
} as const;

export const ICON_SELECTION_FILTER = "brightness(5)"; // "saturate(6) hue-rotate(177deg) brightness(2)";
export const FILL_SELECTION_FILTER = "brightness(1.2)";

export const PHYSICS = {
  DEFAULT_MOTOR_SPEED: 10, // tr/min
  GRAVITY: 10, // m/s^2
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
  SNAP_TO_GRID: 8,
} as const;

export const INTERACTION_SPECS = {
  SELECTION_HALO_SIZE: 10,
  ICON_HALO_SIZE: 5,
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
  TAC: 20,
  ICON_SIZE: 24,

  // GRID
  GRID_LARGER: 500,
  GRID_MAJOR: 100,
  GRID_SIZE: 25,

  // Edges
  EDGE_ENDPOINT_RADIUS: 7,
  MIN_EDGE_LENGTH: 30,
  EDGE_END_MARGIN: 15,

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
  // Motor
  MOTOR_RADIUS: 20,
  // Join
  JOIN_RADIUS: 6,

  // Slider
  SLIDER_OUTER_WIDTH: 24,
  SLIDER_OUTER_HEIGHT: 14,
  SLIDER_INNER_WIDTH: 14,
  SLIDER_INNER_HEIGHT: 6,
  SLIDER_RADIUS: 2,

  // Slidep
  SLIDEP_OUTER_WIDTH: 28,

  // Gear
  DEFAULT_GEAR_RADIUS: 40,
  MIN_GEAR_RADIUS: 30,
  GEAR_TEETH_SIZE: 6,

  // Belt
  BELT_WIDTH: 3,
  END_RADIUS: 4,

  // Ground
  GROUND_WIDTH: 22,
  GROUND_HEIGHT: 10,
  GROUND_BAR_HEIGHT: 6,
  GROUND_VERTICAL_OFFSET: 6,

  // Probe
  PROBE_OFFSET: 28,
} as const;

export const DIMENSION_SPECS = {
  ARROW_SIZE: 18,
  ARROW_WING_LENGTH: 7,
  ARROW_WING_WIDTH: 18,
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
  // TODO : "motor",
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
  "dimension-radius",
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
  "equal",
  "gear-ratio",
  "force",
  "moment",
  "distributed-force",
];
