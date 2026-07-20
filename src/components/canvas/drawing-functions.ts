/**
 * Fonctions de dessin pour les éléments mécaniques
 */

import {
  COLORS,
  STROKE_WIDTHS,
  DIM,
  INTERACTION_SPECS,
  DIMENSION_SPECS,
  ICON_SELECTION_FILTER,
  FILL_DELETION_FILTER,
} from "../../constants/rendering-specs";
import { Point2 as Point2 } from "../../types/point2";
import { get_element_icon } from "../element-palette/elementIcon";
import { UnionElement, ViewportState } from "../../types";
import { value2ratio } from "../../utils";
import {
  force_value_label_position,
  moment_value_label_position,
} from "../../utils/load-geom";
import {
  BeltVia,
  BeltPiece,
  belt_pieces,
  belt_project,
} from "../../utils/belt-path";

const TAU = 2 * Math.PI;

// Cache pour les images d'icônes préchargées
const iconImageCache = new Map<string, HTMLImageElement>();

export function draw_grid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: ViewportState,
) {
  const zoom = viewport.zoom;
  const panX = viewport.pan.x;
  const panY = viewport.pan.y;

  ctx.strokeStyle = COLORS.GRID;
  ctx.lineWidth = 1;

  const worldLeft = -panX / zoom;
  const worldTop = -panY / zoom;
  const worldRight = (width - panX) / zoom;
  const worldBottom = (height - panY) / zoom;

  const startX = Math.ceil(worldLeft / DIM.GRID_SIZE) * DIM.GRID_SIZE;
  const startY = Math.ceil(worldTop / DIM.GRID_SIZE) * DIM.GRID_SIZE;

  // Dessin vertical
  for (let x = startX; x <= worldRight; x += DIM.GRID_SIZE) {
    const screenX = x * zoom + panX;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, height);
    ctx.stroke();
  }

  // Dessin horizontal
  for (let y = startY; y <= worldBottom; y += DIM.GRID_SIZE) {
    const screenY = y * zoom + panY;
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
    ctx.stroke();
  }

  // --- Lignes majeures ---
  ctx.strokeStyle = COLORS.GRID_MAJOR;

  const startMajorX = Math.ceil(worldLeft / DIM.GRID_MAJOR) * DIM.GRID_MAJOR;
  const startMajorY = Math.ceil(worldTop / DIM.GRID_MAJOR) * DIM.GRID_MAJOR;

  // Dessin vertical majeur
  for (let x = startMajorX; x <= worldRight; x += DIM.GRID_MAJOR) {
    const screenX = x * zoom + panX;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, height);
    ctx.stroke();
  }

  // Dessin horizontal majeur
  for (let y = startMajorY; y <= worldBottom; y += DIM.GRID_MAJOR) {
    const screenY = y * zoom + panY;
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
    ctx.stroke();
  }

  // --- Lignes plus larges ---
  ctx.strokeStyle = COLORS.GRID_LARGER;

  const startLargerX = Math.ceil(worldLeft / DIM.GRID_LARGER) * DIM.GRID_LARGER;
  const startLargerY = Math.ceil(worldTop / DIM.GRID_LARGER) * DIM.GRID_LARGER;

  // Dessin vertical majeur
  for (let x = startLargerX; x <= worldRight; x += DIM.GRID_LARGER) {
    const screenX = x * zoom + panX;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, height);
    ctx.stroke();
  }

  // Dessin horizontal majeur
  for (let y = startLargerY; y <= worldBottom; y += DIM.GRID_LARGER) {
    const screenY = y * zoom + panY;
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
    ctx.stroke();
  }
}

export function draw_ground(ctx: CanvasRenderingContext2D) {
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.save();
  ctx.translate(0, DIM.GROUND_VERTICAL_OFFSET);

  // Vertical line
  ctx.lineCap = "square";
  ctx.lineWidth = STROKE_WIDTHS.THICK + widthChange;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 0 + DIM.GROUND_BAR_HEIGHT);
  ctx.stroke();

  // Hatching
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.beginPath();
  ctx.moveTo(-DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 1.5);
  ctx.lineTo(DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 1.5);
  ctx.moveTo(-DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(-DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(-DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(0, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(0, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.stroke();

  ctx.restore();
}

/** Dessine un carré pour les Edges à l'état "PlacingStartX" */
export function draw_start_edge_end(ctx: CanvasRenderingContext2D) {
  const sideL = DIM.BEAM_WIDTH + STROKE_WIDTHS.STANDARD;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD;
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-sideL / 2, -sideL / 2, sideL, sideL);
  ctx.fillStyle = oldFillStyle;
  ctx.fillRect(-sideS / 2, -sideS / 2, sideS, sideS);
}

export function draw_belt_end(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(0, 0, DIM.END_RADIUS, 0, TAU);
  ctx.fill();
}

export function draw_hover_edge_end(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.EDGE_ENDPOINT_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_pivot(ctx: CanvasRenderingContext2D, filled: boolean) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");

  if (filled) {
    ctx.beginPath();
    ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
    ctx.fillStyle = COLORS.FILL_BODY;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_slider(ctx: CanvasRenderingContext2D, filled: boolean) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDER_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDER_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  if (filled) {
    ctx.fillStyle = oldFillStyle;
    ctx.fillRect(
      -DIM.SLIDER_INNER_WIDTH / 2,
      -DIM.SLIDER_INNER_HEIGHT / 2,
      DIM.SLIDER_INNER_WIDTH,
      DIM.SLIDER_INNER_HEIGHT,
    );
  }
  ctx.stroke();
}

export function draw_slidep_bottom(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.stroke();
}

export function draw_join_bottom(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.JOIN_RADIUS + ctx.lineWidth / 2, 0, TAU);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

export function draw_join_top(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.JOIN_RADIUS - ctx.lineWidth / 2 - 0.5, 0, TAU);

  ctx.fill();
}

export function draw_join(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.JOIN_RADIUS, 0, TAU);

  ctx.fill();
  ctx.stroke();
}

export function draw_mass(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.MASS_SIZE / 2,
    -DIM.MASS_SIZE / 2,
    DIM.MASS_SIZE,
    DIM.MASS_SIZE,
    DIM.SLIDER_RADIUS,
  );
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = "14px Verdana";
  draw_text(ctx, "M");
}

export function draw_beam(
  ctx: CanvasRenderingContext2D,
  length: number,
  isStartJoin: boolean = false,
  isEndJoin: boolean = false,
) {
  const sL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const startJ = isStartJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const endJ = isEndJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-sL / 2 + startJ, -sL / 2, length + sL - endJ - startJ, sL);
  ctx.fillStyle = oldFillStyle;
  ctx.fillRect(-sideS / 2, -sideS / 2, length + sideS, sideS);
}

export function draw_spring(
  ctx: CanvasRenderingContext2D,
  length: number,
  restLength: number | undefined = undefined,
) {
  let coilNb;
  if (!restLength) {
    coilNb = Math.max(Math.floor(length / 16), DIM.SPRING_MIN_COILS);
  } else {
    coilNb = Math.max(Math.floor(restLength / 16), DIM.SPRING_MIN_COILS);
  }
  const fc = (t: number) => {
    return (Math.sin((t - 0.5) * Math.PI) + 1) / 2;
  };
  const deca = (i: number, offset: number) => {
    return (
      DIM.TAC -
      DIM.BEAM_WIDTH / 2 +
      (length - 2 * DIM.TAC + DIM.BEAM_WIDTH) * fc((i + offset) / (coilNb + 1))
    );
  };

  const oldStrokeStyle = ctx.strokeStyle;
  const oldFillStyle = ctx.fillStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  // Spires en arrière-plan
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  ctx.filter = `saturate(0.5) brightness(3)`;
  for (let i = 1; i <= coilNb - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.75), -DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }
  ctx.filter = "none";

  // Barre de fond
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(DIM.TAC, 0);
  ctx.lineTo(length - DIM.TAC, 0);
  ctx.lineWidth = DIM.SPRING_INNER_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth =
    DIM.SPRING_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // End
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Spires en premier-plan
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  for (let i = 1; i <= coilNb; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, -0.25), -DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }
}

export function draw_damper(
  ctx: CanvasRenderingContext2D,
  length: number,
  restLength: number | undefined = undefined,
) {
  let start_x;
  let piston_x;
  if (!restLength) {
    start_x = length / 4;
    piston_x = (length - 2 * DIM.TAC) / 2;
  } else {
    start_x = length / 4;
    piston_x =
      ((length - 2 * DIM.TAC) / 4) *
      (1 + 3 * Math.exp(-Math.pow(length / restLength / 2, 2)));
  }
  const oldStrokeStyle = ctx.strokeStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  // End
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2 - 1, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Cylinder body
  ctx.beginPath();
  ctx.rect(
    start_x,
    -DIM.DAMPER_CYLINDER_DIAMETER / 2,
    length - DIM.TAC - start_x,
    DIM.DAMPER_CYLINDER_DIAMETER,
  );
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.stroke();

  // Barre centrale
  ctx.beginPath();
  ctx.moveTo(DIM.TAC, 0);
  ctx.lineTo(piston_x + DIM.TAC / 2, 0);
  ctx.lineWidth = DIM.DAMPER_INNER_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth =
    DIM.DAMPER_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2 + 1, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Valve
  ctx.beginPath();
  ctx.rect(
    piston_x + DIM.TAC / 2 - DIM.DAMPER_PISTON_WIDTH / 2,
    -DIM.DAMPER_CYLINDER_DIAMETER / 2 + 3,
    DIM.DAMPER_PISTON_WIDTH,
    DIM.DAMPER_CYLINDER_DIAMETER - 6,
  );
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.fill();
  ctx.stroke();
}

export function draw_motor(ctx: CanvasRenderingContext2D, isGrounded: boolean) {
  const bottom = DIM.MOTOR_RADIUS - 2;

  ctx.beginPath();
  if (isGrounded) {
    ctx.moveTo(-DIM.MOTOR_RADIUS, bottom);
    ctx.arc(0, 0, DIM.MOTOR_RADIUS, TAU / 2, 0);
    ctx.lineTo(DIM.MOTOR_RADIUS, bottom);
  } else {
    ctx.arc(0, 0, DIM.MOTOR_RADIUS, 0, TAU);
  }
  ctx.closePath();
  if (isGrounded) {
    ctx.moveTo(-DIM.MOTOR_RADIUS + 7, bottom);
    ctx.arc(-DIM.MOTOR_RADIUS + 5, bottom - 5, 2, 0, TAU);
    ctx.moveTo(DIM.MOTOR_RADIUS - 3, bottom - 5);
    ctx.arc(DIM.MOTOR_RADIUS - 5, bottom - 5, 2, 0, TAU);
  }
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fill("evenodd");

  ctx.beginPath();
  if (isGrounded) {
    ctx.arc(
      -DIM.MOTOR_RADIUS + DIM.MOTOR_CORNER_RADIUS,
      bottom - DIM.MOTOR_CORNER_RADIUS,
      DIM.MOTOR_CORNER_RADIUS,
      TAU / 4,
      TAU / 2,
    );
    ctx.arc(0, 0, DIM.MOTOR_RADIUS, TAU / 2, 0);
    ctx.arc(
      DIM.MOTOR_RADIUS - DIM.MOTOR_CORNER_RADIUS,
      bottom - DIM.MOTOR_CORNER_RADIUS,
      DIM.MOTOR_CORNER_RADIUS,
      0,
      TAU / 4,
    );
  } else {
    ctx.arc(0, 0, DIM.MOTOR_RADIUS, 0, TAU);
  }
  ctx.closePath();
  ctx.stroke();
  if (isGrounded) {
    ctx.lineWidth -= 0.5;
    ctx.beginPath();
    ctx.arc(-DIM.MOTOR_RADIUS + 5, bottom - 5, 2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(DIM.MOTOR_RADIUS - 5, bottom - 5, 2, 0, TAU);
    ctx.stroke();
    ctx.lineWidth += 0.5;
  }

  const inner = DIM.PIVOT_OUTER_RADIUS + 3.5;
  const outer = DIM.MOTOR_RADIUS - 1;

  ctx.beginPath();
  ctx.moveTo(inner, 0);
  ctx.lineTo(outer, 0);
  if (!isGrounded) {
    ctx.moveTo(0, inner);
    ctx.lineTo(0, outer);
  }
  ctx.moveTo(-inner, 0);
  ctx.lineTo(-outer, 0);
  ctx.moveTo(0, -inner);
  ctx.lineTo(0, -outer);
  ctx.lineWidth += 0.5;
  ctx.stroke();
  ctx.lineWidth -= 0.5;
}

export function draw_gear(ctx: CanvasRenderingContext2D, radius: number) {
  if (radius < DIM.MIN_GEAR_RADIUS) radius = DIM.MIN_GEAR_RADIUS;

  //const teethCount = Math.floor(radius * 0.5);
  const r1 = (radius + DIM.PIVOT_OUTER_RADIUS) / 2;
  const r2 = (radius - DIM.PIVOT_OUTER_RADIUS) / 3;
  const holesNb = 3;

  // Corps principal de l'engrenage
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  for (let i = 0; i < holesNb; i++) {
    const angle = (i / holesNb) * TAU;
    ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
    ctx.arc(Math.cos(angle) * r1, Math.sin(angle) * r1, r2, 0, TAU);
  }
  ctx.fillStyle += COLORS.HALF_TRANSPARENCY;

  const oldShadowBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  ctx.fill("evenodd");
  ctx.shadowBlur = oldShadowBlur;

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  for (let i = 0; i < holesNb; i++) {
    ctx.beginPath();
    const angle = (i / holesNb) * TAU;
    ctx.arc(Math.cos(angle) * r1, Math.sin(angle) * r1, r2, 0, TAU);
    ctx.stroke();
  }

  // Dessine les dents
  /*
  for (let i = 0; i < teethCount; i++) {
    const angle = (i / teethCount) * TAU;
    const x1 = Math.cos(angle) * radius;
    const y1 = Math.sin(angle) * radius;
    const x2 = Math.cos(angle) * (radius + DIM.GEAR_TEETH_SIZE);
    const y2 = Math.sin(angle) * (radius + DIM.GEAR_TEETH_SIZE);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  */
}

export function draw_belt(
  ctx: CanvasRenderingContext2D,
  positionStart: Point2,
  positionEnd: Point2,
  gearAngles: {
    center: Point2;
    radius: number;
    startAngle: number;
    endAngle: number;
    direction: boolean;
  }[],
) {
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";

  ctx.beginPath();
  ctx.moveTo(positionStart.x, positionStart.y);
  gearAngles.forEach((gearAngle) => {
    ctx.arc(
      gearAngle.center.x,
      gearAngle.center.y,
      gearAngle.radius,
      gearAngle.startAngle,
      gearAngle.endAngle,
      gearAngle.direction,
    );
  });
  ctx.lineTo(positionEnd.x, positionEnd.y);
  ctx.lineWidth = DIM.BELT_WIDTH + widthChange;
  ctx.stroke();

  ctx.save();
  ctx.translate(positionStart.x, positionStart.y);
  draw_belt_end(ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(positionEnd.x, positionEnd.y);
  draw_belt_end(ctx);
  ctx.restore();
}

/**
 * Winding of one belt arc: the belt climbs `growth` px total across the wrap
 * (one BELT_WIDTH per turn) so surplus turns read as a coil, not a retraced
 * circle. Applied at the arrival end (`atStart`) or the departure end; the other
 * end stays on the rim. `growth` > 0 grows outward (the free run leaves from the
 * top layer), < 0 inward (winch: keep the free run on the rim so it doesn't lean).
 */
export type BeltWinding = { growth: number; atStart: boolean };

/**
 * Radii at the arrival / departure ends of an arc given its optional winding.
 * The grown end is kept ≥ 1px so an inward (winch) coil deep enough to reach the
 * centre never flips across it.
 */
function belt_arc_radii(arc: BeltPiece, w?: BeltWinding): [number, number] {
  if (arc.kind !== "arc") return [0, 0];
  const r = arc.radius;
  if (!w) return [r, r];
  const grown = Math.max(1, r + w.growth);
  return w.atStart ? [grown, r] : [r, grown];
}

/**
 * Append a belt arc to the current path as a polyline from `rStart` (at its
 * arrival angle) to `rEnd` (at its departure angle), the radius interpolated
 * across the swept wrap. rStart === rEnd → a plain circular arc; differing radii
 * → a coil (spiral) that reaches both tangent runs — a belt wound past a full
 * turn. The straight run into the arc is the implicit line from the current
 * point to the first sampled point.
 */
function append_belt_arc(
  ctx: CanvasRenderingContext2D,
  arc: BeltPiece,
  rStart: number,
  rEnd: number,
) {
  if (arc.kind !== "arc") return [0, 0];
  const sign = arc.direction ? -1 : 1;
  const steps = Math.max(8, Math.ceil((arc.wrap / TAU) * 48));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = arc.startAngle + sign * arc.wrap * t;
    const p = arc.center.add(
      Point2.from_polar(rStart + (rEnd - rStart) * t, angle),
    );
    ctx.lineTo(p.x, p.y);
  }
}

/**
 * Draw a loose (open) belt from its ordered geometric pieces: the tangent runs
 * from the start terminal, the gear arcs, and the run to the end terminal, plus
 * the two end dots. `wraps` (continuous per-via wrap, simulation) sizes each arc
 * so a pulley losing contact (wrap → 0) is drawn straight-past; `windings`
 * (per via) turns a wound pulley's arc into a coil (see `draw_belt_loop`).
 */
export function draw_belt_open(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia[],
  wraps?: number[],
  windings?: (BeltWinding | undefined)[],
) {
  if (vias.length < 2) return;
  const pieces = belt_pieces(vias, false, wraps);
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";

  const start = vias[0].pos;
  const end = vias[vias.length - 1].pos;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const piece of pieces) {
    if (piece.kind === "segment") {
      ctx.lineTo(piece.to.x, piece.to.y);
    } else {
      const [rStart, rEnd] = belt_arc_radii(piece, windings?.[piece.gearIndex]);
      append_belt_arc(ctx, piece, rStart, rEnd);
    }
  }
  ctx.lineTo(end.x, end.y);
  ctx.lineWidth = DIM.BELT_WIDTH + widthChange;
  ctx.stroke();

  ctx.save();
  ctx.translate(start.x, start.y);
  draw_belt_end(ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(end.x, end.y);
  draw_belt_end(ctx);
  ctx.restore();
}

/**
 * Draw a tight belt as a continuous closed loop around its pulleys (the gN→g0
 * closure included), with no free ends. Unlike `draw_belt`, this is independent
 * of the junction position, so the loop stays continuous wherever the join sits.
 *
 * `wraps` (continuous per-via wrap, simulation) sizes each arc so a pulley
 * losing contact (wrap → 0) is drawn straight-past. `windings` (per via) draws a
 * pulley wound past a full turn as a coil whose ends reach both tangent runs,
 * instead of the surplus retracing the same circle.
 */
export function draw_belt_loop(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia[],
  wraps?: number[],
  windings?: (BeltWinding | undefined)[],
) {
  const arcs = belt_pieces(vias, true, wraps).filter((p) => p.kind === "arc");
  if (arcs.length === 0) return;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";

  // Straight tangent runs are the implicit lines between consecutive arcs (each
  // arc's first sampled point); closePath() adds the final closure run.
  ctx.beginPath();
  arcs.forEach((arc, i) => {
    const [rStart, rEnd] = belt_arc_radii(arc, windings?.[arc.gearIndex]);
    if (i === 0) {
      const p0 = arc.center.add(Point2.from_polar(rStart, arc.startAngle));
      ctx.moveTo(p0.x, p0.y);
    }
    append_belt_arc(ctx, arc, rStart, rEnd);
  });
  ctx.closePath();
  ctx.lineWidth = DIM.BELT_WIDTH + widthChange;
  ctx.stroke();
}

export function draw_arrow_head(
  ctx: CanvasRenderingContext2D,
  position: Point2,
  angle: number,
  scale: number = 1,
) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(
    DIM.ARROW_HEAD_LENGTH * scale,
    (-DIM.ARROW_HEAD_WIDTH / 2) * scale,
  );
  ctx.lineTo(DIM.ARROW_HEAD_LENGTH * scale, (DIM.ARROW_HEAD_WIDTH / 2) * scale);
  ctx.fill();

  ctx.restore();
}

export function draw_dimension(
  ctx: CanvasRenderingContext2D,
  start: Point2,
  end: Point2,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const delta = end.sub(start);
  const length = delta.length();
  const t = position.parameter_on_segment(start, end);
  const np = delta.perp().normalize();
  const offset = position.sub(start).dot(np);

  // draw side lines

  if (Math.abs(offset) > 10) {
    const widthStart = ctx.lineWidth;
    ctx.lineWidth = 1;
    const side = position.is_on_left_side_of_line(start, end) ? -1 : 1;
    const startPos = start.add(np.mul(7 * side));
    const offsetStart = start.add(np.mul(offset).extend_length(5));
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(offsetStart.x, offsetStart.y);
    ctx.stroke();

    const endPos = end.add(np.mul(7 * side));
    const offsetEnd = end.add(np.mul(offset).extend_length(5));
    ctx.beginPath();
    ctx.moveTo(endPos.x, endPos.y);
    ctx.lineTo(offsetEnd.x, offsetEnd.y);
    ctx.stroke();
    ctx.lineWidth = widthStart;
  }

  // Draw dimension
  const d = start.add(np.mul(offset));
  const s = d.add(
    delta.scale2length(t < 0 ? length * t + 16 : DIM.ARROW_HEAD_LENGTH),
  );
  const e = d.add(
    delta.scale2length(
      t > 1 ? length * t - 16 : length - DIM.ARROW_HEAD_LENGTH,
    ),
  );
  draw_arrow_head(ctx, d, delta.angle());
  draw_arrow_head(ctx, d.add(delta), delta.angle() + TAU / 2);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value);
}

export function draw_dimension_to_segment(
  ctx: CanvasRenderingContext2D,
  point: Point2,
  start: Point2,
  end: Point2,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;
  const widthStart = ctx.lineWidth;
  ctx.lineWidth = 1;

  const ts = position.parameter_on_segment(start, end);
  const oppositePoint = point.project_on_line(start, end);
  const delta = point.sub(oppositePoint);
  const length = delta.length();
  const t = position.parameter_on_segment(oppositePoint, point);
  const np = end.sub(start).normalize();
  const offset = position.sub(oppositePoint).dot(np);
  const side =
    (position.is_on_left_side_of_line(oppositePoint, point) ? -1 : 1) *
    (position.is_on_left_side_of_line(start, end) ? -1 : 1);

  if (ts < 0 || ts > 1) {
    const startPos = ts < 0.5 ? start.sub(np.mul(7)) : end.add(np.mul(7));
    const offsetStart = oppositePoint.add(
      np.mul(offset).extend_length((ts < 0.5 ? 5 : -5) * side),
    );
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(offsetStart.x, offsetStart.y);
    ctx.stroke();
  }

  const endPos = point.sub(np.mul(7 * side));
  const offsetEnd = point.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(endPos.x, endPos.y);
  ctx.lineTo(offsetEnd.x, offsetEnd.y);
  ctx.stroke();

  ctx.lineWidth = widthStart;

  // Draw dimension
  const d = oppositePoint.add(np.mul(offset));
  const s = d.add(
    delta.scale2length(t < 0 ? length * t + 16 : DIM.ARROW_HEAD_LENGTH),
  );
  const e = d.add(
    delta.scale2length(
      t > 1 ? length * t - 16 : length - DIM.ARROW_HEAD_LENGTH,
    ),
  );
  const sOffset = ts > 0 && ts < 1 ? DIM.BEAM_WIDTH / 2 - 1 : 0;
  draw_arrow_head(ctx, d.add(delta.scale2length(sOffset)), delta.angle());
  draw_arrow_head(ctx, d.add(delta), delta.angle() + TAU / 2);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value);
}

export function draw_dimension_angle(
  ctx: CanvasRenderingContext2D,
  start1: Point2,
  end1: Point2,
  start2: Point2,
  end2: Point2,
  flipStart: boolean,
  flipEnd: boolean,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const origin = Point2.lines_intersection(start1, end1, start2, end2);
  if (!origin) return;

  let alpha = end1
    .sub(start1)
    .mul(flipStart ? -1 : 1)
    .angle();
  let beta = end2
    .sub(start2)
    .mul(flipEnd ? -1 : 1)
    .angle();
  if ((alpha - beta + TAU) % TAU < TAU / 2) {
    [alpha, beta] = [beta, alpha];
  }
  const radius = origin.distance_to(position);
  const start = origin.add(Point2.from_polar(radius, alpha + 3 / radius));
  const end = origin.add(Point2.from_polar(radius, beta - 3 / radius));

  draw_arrow_head(ctx, start, alpha + TAU / 4);
  draw_arrow_head(ctx, end, beta - TAU / 4);

  ctx.beginPath();
  ctx.arc(
    origin.x,
    origin.y,
    Math.sqrt(radius ** 2 + 20 ** 2),
    alpha + DIM.ARROW_HEAD_LENGTH / radius,
    beta - DIM.ARROW_HEAD_LENGTH / radius,
  );
  ctx.stroke();

  // TODO : add arc to position
  // TODO : add straight lines

  if (!hideText) draw_dimension_text(ctx, position, value, " °");
}

export function draw_dimension_radius(
  ctx: CanvasRenderingContext2D,
  center: Point2,
  radius: number,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const delta = position.sub(center);
  const length = delta.length();

  const d = center.add(delta.scale2length(radius));
  const s = center.add(delta.scale2length(length > radius ? radius : 0 + 5));
  const e = center.add(delta.scale2length(Math.max(radius - 5, length)));
  draw_arrow_head(ctx, d, delta.angle() + (length > radius ? 0 : TAU / 2));
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value);
}

export function draw_dimension_belt(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia[],
  tight: boolean,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  const closest = belt_project(vias, position, tight).point;
  ctx.beginPath();
  ctx.moveTo(position.x, position.y);
  ctx.lineTo(closest.x, closest.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value);
}

/** The fill of an on-canvas badge — a dimension pill, a ratio pill, an icon box. */
function badge_fill(isSelected: boolean): string {
  return (
    (isSelected ? COLORS.BADGE_FILL_SELECTED : COLORS.BACKGROUND) +
    COLORS.ICON_TRANSPARENCY
  );
}

export function draw_dimension_text(
  ctx: CanvasRenderingContext2D,
  position: Point2,
  value: number,
  extension: string = "",
) {
  ctx.save();
  ctx.translate(position.x, position.y);

  ctx.font = DIMENSION_SPECS.TEXT_FONT;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  const text = (Math.round(value * 10) / 10).toString() + extension;
  const metrics = ctx.measureText(text);

  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  // A dimension pill keeps the plain ground even when selected — its outline and text already carry the selection.
  ctx.fillStyle = badge_fill(false);
  ctx.beginPath();
  ctx.roundRect(
    -metrics.width / 2 - 8 / 2,
    -22 / 2 - 1,
    metrics.width + 8,
    22,
    5,
  );
  ctx.fill();

  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  ctx.fillStyle = ctx.strokeStyle;
  draw_text(ctx, text);

  ctx.restore();
}

export function draw_gear_ratio(
  ctx: CanvasRenderingContext2D,
  position: Point2,
  value: number,
) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.font = DIMENSION_SPECS.TEXT_FONT;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  const text = value2ratio(value).join(" : ");
  const metrics = ctx.measureText(text);
  const isSelected = ctx.shadowBlur !== 0;

  const lastStrokeStyle = ctx.strokeStyle;
  if (ctx.lineWidth === 2 && ctx.shadowBlur === 0)
    ctx.strokeStyle = COLORS.BADGE_STROKE;
  ctx.beginPath();
  ctx.roundRect(
    -metrics.width / 2 - 14 / 2,
    -28 / 2,
    metrics.width + 14,
    28,
    28 / 2,
  );
  ctx.stroke();
  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = badge_fill(isSelected);
  ctx.fill();
  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  ctx.strokeStyle = lastStrokeStyle;
  ctx.fillStyle = ctx.strokeStyle;
  draw_text(ctx, text);
  ctx.restore();
}

export function draw_element_icon(
  ctx: CanvasRenderingContext2D,
  element: UnionElement,
  deletionTint = false,
) {
  const side = DIM.ICON_SIZE;
  const isSelected = ctx.shadowBlur !== 0;
  if (deletionTint) ctx.strokeStyle = COLORS.DELETION_BOX;
  else if (ctx.lineWidth === 2 && ctx.shadowBlur === 0)
    ctx.strokeStyle = COLORS.BADGE_STROKE;
  if (deletionTint) ctx.globalAlpha *= 0.5;
  ctx.beginPath();
  ctx.roundRect(-side / 2 - 1, -side / 2 - 1, side + 2, side + 2, 4);
  ctx.stroke();
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = badge_fill(isSelected);
  if (deletionTint) ctx.filter = FILL_DELETION_FILTER;

  ctx.fill();
  const iconUrl = get_element_icon(element);
  let img = iconImageCache.get(iconUrl);
  if (!img) {
    img = new Image();
    img.src = iconUrl;
    iconImageCache.set(iconUrl, img);
  }
  if (!img.complete) return;
  if (isSelected) ctx.filter = ICON_SELECTION_FILTER;
  ctx.drawImage(img, -side / 2, -side / 2, side, side);
  if (deletionTint) ctx.globalAlpha *= 2;
}

export function draw_text(ctx: CanvasRenderingContext2D, text: string) {
  ctx.filter = "none";
  ctx.fillText(text, 0, 0);

  if (ctx.lineWidth > 2) {
    ctx.shadowBlur = 2;
    ctx.shadowColor = ctx.strokeStyle as string;
    ctx.fillText(text, 0, 0);
  }
}

// ─── Load element drawing ─────────────────────────────────────────────────────

/** Draws a single force arrow from `base` in direction+magnitude of `vector` (world units).
 *  `textLineWidth` lets the value label be emphasized (or not) independently of
 *  the arrow, since hovering one part of a load must not light up the other.
 *  `labelVector` places the value elsewhere than along the arrow — a tapered
 *  distributed load has ends with no arrow left to hang their "0" on. */
export function draw_force(
  ctx: CanvasRenderingContext2D,
  base: Point2,
  vector: Point2,
  value: number,
  hideText: boolean = false,
  textLineWidth?: number,
  labelVector?: Point2,
) {
  const length = vector.length();
  if (length >= 1) {
    draw_arrow_head(ctx, base.add(vector), vector.angle() + TAU / 2);
    if (length > DIM.ARROW_HEAD_LENGTH) {
      const e = base.add(vector.extend_length(-DIM.ARROW_HEAD_LENGTH));
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
  }

  if (hideText) return;
  const lastLineWidth = ctx.lineWidth;
  if (textLineWidth !== undefined) ctx.lineWidth = textLineWidth;
  draw_dimension_text(
    ctx,
    force_value_label_position(base, labelVector ?? vector),
    value,
  );
  ctx.lineWidth = lastLineWidth;
}

/** Draws a curved moment arrow (arc with arrowhead) centered at `center`.
 *  `value` is signed: positive is clockwise, negative counter-clockwise. */
export function draw_moment(
  ctx: CanvasRenderingContext2D,
  center: Point2,
  radius: number,
  value: number,
  hideText: boolean = false,
  textLineWidth?: number,
) {
  const clockwise = value >= 0;
  const startAngle = clockwise ? (5 / 8) * TAU : -TAU / 8;
  const endAngle = clockwise ? (3 / 8) * TAU : TAU / 8;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, endAngle, !clockwise);
  ctx.stroke();

  const headAngle = clockwise
    ? endAngle - (7 / 32) * TAU
    : endAngle + (7 / 32) * TAU;
  const tip = center
    .add(Point2.from_polar(radius, endAngle))
    .sub(Point2.from_polar(DIM.ARROW_HEAD_LENGTH, headAngle));
  draw_arrow_head(ctx, tip, headAngle);

  if (hideText) return;
  const lastLineWidth = ctx.lineWidth;
  if (textLineWidth !== undefined) ctx.lineWidth = textLineWidth;
  draw_dimension_text(
    ctx,
    moment_value_label_position(center, radius),
    Math.abs(value),
  );
  ctx.lineWidth = lastLineWidth;
}

/** Draws evenly-spaced force arrows along a beam segment, under the crest line
 *  joining the two endpoint arrows. The drawing is proportional to the values
 *  across the whole span (see `distributed_display_gain`), so that crest line
 *  *is* the intensity profile — it is how the load is read, and it doubles as
 *  the handle the body drag grabs. `crestLineWidth` emphasizes it on hover
 *  without lighting up the arrows. */
export function draw_distributed_force(
  ctx: CanvasRenderingContext2D,
  start: Point2,
  end: Point2,
  vectorStart: Point2,
  vectorEnd: Point2,
  crestLineWidth?: number,
) {
  const lastLineWidth = ctx.lineWidth;
  if (crestLineWidth !== undefined) ctx.lineWidth = crestLineWidth;
  ctx.beginPath();
  ctx.moveTo(start.x + vectorStart.x, start.y + vectorStart.y);
  ctx.lineTo(end.x + vectorEnd.x, end.y + vectorEnd.y);
  ctx.stroke();
  ctx.lineWidth = lastLineWidth;

  for (let i = 1; i < DIM.NB_DISTRIBUTED_FORCE_ARROWS; i++) {
    const t = i / DIM.NB_DISTRIBUTED_FORCE_ARROWS;
    const base = start.lerp(end, t);
    const vector = vectorStart.lerp(vectorEnd, t);
    // A tapered load runs its arrows down to nothing: below a pixel there is
    // no direction left to draw, and below a head length the shaft would
    // point backwards out of `extend_length`.
    const length = vector.length();
    if (length < 1) continue;
    draw_arrow_head(ctx, base.add(vector), vector.angle() + TAU / 2);
    if (length <= DIM.ARROW_HEAD_LENGTH) continue;
    const e = base.add(vector.extend_length(-DIM.ARROW_HEAD_LENGTH));
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
}

/** Draws a small probe indicator (circle with crosshair). */
export function draw_probe(ctx: CanvasRenderingContext2D) {
  const r = 6;
  ctx.save();
  ctx.strokeStyle = COLORS.ACCENT;
  ctx.fillStyle = COLORS.ACCENT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.restore();
}

/** A probed element's recorded path, ready to draw on the canvas. */
export interface TrajectoryDisplay {
  points: Point2[];
  /** Number of points at or before the current playback time. */
  headCount: number;
  color: string;
}

/** Draws the trajectory of a probed point: the portion already travelled as a
 *  solid line, the rest of the recording (ahead of the cursor) faded. */
export function draw_trajectory(
  ctx: CanvasRenderingContext2D,
  points: Point2[],
  headCount: number,
  color: string,
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const polyline = (from: number, to: number) => {
    ctx.beginPath();
    ctx.moveTo(points[from].x, points[from].y);
    for (let i = from + 1; i <= to; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  };

  if (headCount >= 2) {
    ctx.globalAlpha = 0.8;
    polyline(0, headCount - 1);
  }
  if (headCount < points.length) {
    ctx.globalAlpha = 0.25;
    polyline(Math.max(0, headCount - 1), points.length - 1);
  }
  ctx.restore();
}
