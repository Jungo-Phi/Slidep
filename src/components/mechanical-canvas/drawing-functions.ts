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
  FILL_SELECTION_FILTER,
} from "../../constants/rendering-specs";
import { Point2 as Point2 } from "../../types/point2";
import { get_element_icon } from "../element-palette/elementIcon";
import { UnionElement } from "../../types";
import { value_to_ratio_parts } from "../../utils/string-math";

const TAU = 2 * Math.PI;

// Cache pour les images d'icônes préchargées
const iconImageCache = new Map<string, HTMLImageElement>();

export function draw_grid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  if (!true) return;

  //const viewport = currentMechanism?.viewport;
  const zoom = 1; //viewport?.zoom || 1;
  const panX = 0; //viewport?.panX || 0;
  const panY = 0; //viewport?.panY || 0;
  const gridSize = 25; //preferences.gridSize;

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Dessine les lignes de grille mineures
  ctx.strokeStyle = COLORS.GRID;
  ctx.lineWidth = 1 / zoom;

  for (let x = 0; x <= width / zoom; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height / zoom);
    ctx.stroke();
  }

  for (let y = 0; y <= height / zoom; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width / zoom, y);
    ctx.stroke();
  }

  // Dessine les lignes de grille majeures (toutes les 5 cellules)
  ctx.strokeStyle = COLORS.GRID_MAJOR;
  ctx.lineWidth = 1 / zoom;

  for (let x = 0; x <= width / zoom; x += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height / zoom);
    ctx.stroke();
  }

  for (let y = 0; y <= height / zoom; y += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width / zoom, y);
    ctx.stroke();
  }

  ctx.restore();
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
export function draw_slidep_rep(
  ctx: CanvasRenderingContext2D,
  start: boolean,
  end: boolean,
) {
  const startN = start ? 1 : 0;
  const endN = end ? 1 : 0;
  const sideL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const C = DIM.SLIDEP_OUTER_WIDTH / 2 + DIM.SLIDER_INNER_HEIGHT / 2;
  const D = C + 0.5;
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-C * endN, -sideL / 2, C * (startN + endN), sideL);
  ctx.fillStyle = oldFillStyle;
  ctx.fillRect(-D * endN, -sideS / 2, D * (startN + endN), sideS);
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
  ctx.lineWidth = STROKE_WIDTHS.THICK + widthChange;
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
      gearAngle.radius + 1.5,
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

export function draw_dimention(
  ctx: CanvasRenderingContext2D,
  start: Point2,
  end: Point2,
  position: Point2,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;
  const widthStart = ctx.lineWidth;
  ctx.lineWidth = 1;

  const delta = end.sub(start);
  const length = delta.length();
  const t = position.parameter_on_segment(start, end);
  const np = delta.perp().normalize();
  const offset = position.sub(start).dot(np);
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

  // Draw dimention

  ctx.save();
  ctx.translate(start.x + np.x * offset, start.y + np.y * offset);
  ctx.rotate(delta.angle());

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(18, -6);
  ctx.lineTo(18, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(length - 18, -6);
  ctx.lineTo(length - 18, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(t < 0 ? length * t + 16 : 17.5, 0);
  ctx.lineTo(t > 1 ? length * t - 16 : length - 17.5, 0);
  ctx.stroke();

  ctx.restore();

  if (hideText) return;
  ctx.save();
  ctx.translate(position.x, position.y);
  draw_dimention_text(ctx, value);
  ctx.restore();
}

export function draw_dimention_to_segment(
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

  // Draw dimention

  ctx.save();
  ctx.translate(
    oppositePoint.add(np.mul(offset)).x,
    oppositePoint.add(np.mul(offset)).y,
  );
  ctx.rotate(delta.angle());

  const startOffset = ts > 0 && ts < 1 ? DIM.BEAM_WIDTH / 2 - 1 : 0;
  ctx.beginPath();
  ctx.moveTo(startOffset, 0);
  ctx.lineTo(startOffset + 18, -6);
  ctx.lineTo(startOffset + 18, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(length - 18, -6);
  ctx.lineTo(length - 18, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(t < 0 ? length * t + 16 : 17.5, 0);
  ctx.lineTo(t > 1 ? length * t - 16 : length - 17.5, 0);
  ctx.stroke();

  ctx.restore();

  if (hideText) return;
  ctx.save();
  ctx.translate(position.x, position.y);
  draw_dimention_text(ctx, value);
  ctx.restore();
}

export function draw_dimention_angle(
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

  let p1 = new Point2(-7, 18).rotate(alpha);
  let p2 = new Point2(7, 18).rotate(alpha);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x + p1.x, start.y + p1.y);
  ctx.lineTo(start.x + p2.x, start.y + p2.y);
  ctx.fill();

  p1 = new Point2(-7, 18).rotate(beta);
  p2 = new Point2(7, 18).rotate(beta);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - p1.x, end.y - p1.y);
  ctx.lineTo(end.x - p2.x, end.y - p2.y);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(
    origin.x,
    origin.y,
    Math.sqrt(radius ** 2 + 20 ** 2),
    alpha + 18 / radius,
    beta - 18 / radius,
  );
  ctx.stroke();

  // TODO : add arc to position
  // TODO : add straight lines

  if (hideText) return;
  ctx.save();
  ctx.translate(position.x, position.y);
  draw_dimention_text(ctx, value, " °");
  ctx.restore();
}

export function draw_dimention_radius(
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
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(delta.angle());

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  if (length > radius) {
    ctx.lineTo(radius + 18, 6);
    ctx.lineTo(radius + 18, -6);
  } else {
    ctx.lineTo(radius - 18, -6);
    ctx.lineTo(radius - 18, 6);
  }
  ctx.fill();

  ctx.beginPath();
  if (length > radius) {
    ctx.moveTo(radius + 5, 0);
  } else {
    ctx.moveTo(5, 0);
  }
  ctx.lineTo(Math.max(radius - 5, length), 0);
  ctx.stroke();

  ctx.restore();

  if (hideText) return;
  ctx.save();
  ctx.translate(position.x, position.y);
  draw_dimention_text(ctx, value);
  ctx.restore();
}

export function draw_dimention_text(
  ctx: CanvasRenderingContext2D,
  value: number,
  extension: string = "",
) {
  ctx.font = DIMENSION_SPECS.TEXT_FONT;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  const text = (Math.round(value * 10) / 10).toString() + extension;
  const metrics = ctx.measureText(text);

  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
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
}

export function draw_gear_ratio(ctx: CanvasRenderingContext2D, value: number) {
  ctx.font = DIMENSION_SPECS.TEXT_FONT;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  const text = value_to_ratio_parts(value).join(" : ");
  const metrics = ctx.measureText(text);
  const isSelected = ctx.shadowBlur !== 0;

  const lastStrokeStyle = ctx.strokeStyle;
  if (ctx.lineWidth === 2 && ctx.shadowBlur === 0) ctx.strokeStyle = "grey";
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
  ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
  if (isSelected) ctx.filter = ICON_SELECTION_FILTER;
  ctx.fill();
  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  ctx.strokeStyle = lastStrokeStyle;
  draw_text(ctx, text);
}

export function draw_element_icon(
  ctx: CanvasRenderingContext2D,
  element: UnionElement,
) {
  const side = DIM.ICON_SIZE;
  const isSelected = ctx.shadowBlur !== 0;
  if (ctx.lineWidth === 2 && ctx.shadowBlur === 0) ctx.strokeStyle = "grey";
  ctx.beginPath();
  ctx.roundRect(-side / 2 - 1, -side / 2 - 1, side + 2, side + 2, 4);
  ctx.stroke();
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
  if (isSelected) ctx.filter = FILL_SELECTION_FILTER;
  ctx.fill();
  const iconUrl = get_element_icon(element.type);
  let img = iconImageCache.get(iconUrl);
  if (!img) {
    img = new Image();
    img.src = iconUrl;
    iconImageCache.set(iconUrl, img);
  }
  if (!img.complete) return;
  if (isSelected) ctx.filter = ICON_SELECTION_FILTER;
  ctx.drawImage(img, -side / 2, -side / 2, side, side);
}

export function draw_text(ctx: CanvasRenderingContext2D, text: string) {
  ctx.fillStyle = COLORS.STROKE; // ctx.strokeStyle;
  ctx.filter = "none";
  ctx.fillText(text, 0, 0);

  if (ctx.lineWidth > 2) {
    ctx.shadowBlur = 2;
    ctx.shadowColor = ctx.strokeStyle as string;
    ctx.fillText(text, 0, 0);
  }
}
