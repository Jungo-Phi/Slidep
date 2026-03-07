/**
 * Fonctions de dessin pour les éléments mécaniques
 */

import { COLORS, STROKE_WIDTHS, DIM } from "../../constants/rendering-specs";
import { Point2 as Point2 } from "../../types/point2";
import { get_element_icon } from "../element-palette/elementIcon";
import { UnionElement } from "../../types";
import { valueToRatioParts } from "./ConstraintEditor";

const TAU = 2 * Math.PI;

// Cache pour les images d'icônes préchargées
const iconImageCache = new Map<string, HTMLImageElement>();

/**
 * Dessine une icône d'élément sur le canvas à la position actuelle (après translation)
 */
export function draw_element_icon(
  ctx: CanvasRenderingContext2D,
  element: UnionElement,
) {
  const iconUrl = get_element_icon(element.type);
  let img = iconImageCache.get(iconUrl);
  if (!img) {
    img = new Image();
    img.src = iconUrl;
    iconImageCache.set(iconUrl, img);
  }

  if (img.complete) {
    ctx.strokeStyle = "grey";
    ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
    ctx.beginPath();
    ctx.roundRect(
      -DIM.ICON_SIZE / 2,
      -DIM.ICON_SIZE / 2,
      DIM.ICON_SIZE,
      DIM.ICON_SIZE,
      4,
    );
    ctx.stroke();
    ctx.fill();
    ctx.drawImage(
      img,
      -DIM.ICON_SIZE / 2,
      -DIM.ICON_SIZE / 2,
      DIM.ICON_SIZE,
      DIM.ICON_SIZE,
    );
  }
}

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
/**
 * Dessine le symbole de masse (ground)
 */
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

/** Dessine un carré pour les Edges à l'état "PlacingStart" */
export function draw_start_edge_end(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.rect(-DIM.SQUARE / 2, -DIM.SQUARE / 2, DIM.SQUARE, DIM.SQUARE);
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.fill();
  ctx.stroke();
}

export function draw_belt_end(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.END_RADIUS, 0, TAU);
  ctx.fill();
}

export function draw_hover_edge_end(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.ENDPOINT_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_pivot(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_slider(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDER_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDER_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.CORNER_RADIUS,
  );
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  ctx.shadowBlur = 0;
  ctx.stroke();
}

export function draw_slidep(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.CORNER_RADIUS,
  );
  ctx.stroke();
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.CORNER_RADIUS,
  );
  ctx.stroke();
  // Pivot
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.stroke();
}

/**
 * Dessine une jonction (join)
 */
export function draw_join(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(0, 0, DIM.JOIN_RADIUS, 0, TAU);
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.beginPath();
}

/**
 * Dessine une masse (mass)
 */
export function draw_mass(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.roundRect(
    -DIM.MASS_SIZE / 2,
    -DIM.MASS_SIZE / 2,
    DIM.MASS_SIZE,
    DIM.MASS_SIZE,
    DIM.CORNER_RADIUS,
  );
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();

  // Dessine un M
  ctx.fillStyle = COLORS.STROKE;
  ctx.font = "12px Verdana";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("M", 0, 0);
}

/** Dessine une poutre (beam) */
export function draw_beam(ctx: CanvasRenderingContext2D, length: number) {
  const stokeColor = ctx.strokeStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;
}

/**
 * Dessine un ressort (spring)
 */
export function draw_spring(
  ctx: CanvasRenderingContext2D,
  length: number,
  restLength: number | undefined = undefined,
) {
  let coilNb;
  if (restLength === undefined) {
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

  const stokeColor = ctx.strokeStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  // Spires en arrière-plan
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  ctx.strokeStyle = COLORS.SELECTION_STROKE;
  for (let i = 1; i <= coilNb - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.75), -DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }

  // Barre de fond
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(DIM.TAC, 0);
  ctx.lineTo(length - DIM.TAC, 0);
  ctx.lineWidth = DIM.SPRING_INNER_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth =
    DIM.SPRING_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;
  // End
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;

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

/**
 * Dessine un amortisseur (damper)
 */
export function draw_damper(
  ctx: CanvasRenderingContext2D,
  length: number,
  restLength: number | undefined = undefined,
) {
  let start_x;
  let piston_x;
  if (restLength === undefined) {
    start_x = length / 4;
    piston_x = (length - 2 * DIM.TAC) / 2;
  } else {
    start_x = length / 4;
    piston_x =
      ((length - 2 * DIM.TAC) / 4) *
      (1 + 3 * Math.exp(-Math.pow(length / restLength / 2, 2)));
  }
  const stokeColor = ctx.strokeStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  // End
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2 - 1, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;

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
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth =
    DIM.DAMPER_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2 + 1, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = stokeColor;
  ctx.stroke();
  ctx.strokeStyle = COLORS.FILL_BODY;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = stokeColor;

  // Valve
  ctx.beginPath();
  ctx.rect(
    piston_x + DIM.TAC / 2 - DIM.DAMPER_PISTON_WIDTH / 2,
    -DIM.DAMPER_CYLINDER_DIAMETER / 2 + 3,
    DIM.DAMPER_PISTON_WIDTH,
    DIM.DAMPER_CYLINDER_DIAMETER - 6,
  );
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.fill();
  ctx.stroke();
}

export function draw_gear(ctx: CanvasRenderingContext2D, radius: number) {
  if (radius < DIM.MIN_GEAR_RADIUS) {
    // Raise error ?
    radius = DIM.MIN_GEAR_RADIUS;
  }
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
  ctx.fillStyle = COLORS.FILL_BODY + COLORS.GEAR_TRANSPARENCY;
  ctx.fill("evenodd");

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
) {
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.STROKE;
  ctx.lineWidth = 2;

  const delta = end.sub(start);
  const length = delta.length();
  ctx.save();
  ctx.translate(start.x, start.y);
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
  ctx.moveTo(5, 0);
  ctx.lineTo(length - 5, 0);
  ctx.stroke();

  ctx.restore();
}

export function draw_dimention_text(
  ctx: CanvasRenderingContext2D,
  position: Point2,
  text: string,
) {
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(
    position.x - metrics.width / 2 - 3,
    position.y - 10,
    metrics.width + 6,
    18,
  );
  ctx.fillStyle = COLORS.STROKE;
  ctx.fillText(text, position.x, position.y);
}

export function draw_dimention_parallel(
  ctx: CanvasRenderingContext2D,
  start: Point2,
  end: Point2,
  position: Point2,
  value: number,
) {
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.lineWidth = 1;

  const delta = end.sub(start);
  const np = delta.perp().normalize();
  const offset = position.sub(start).dot(np);

  const offset_start = start.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(offset_start.x, offset_start.y);
  ctx.stroke();

  const offset_end = end.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(offset_end.x, offset_end.y);
  ctx.stroke();

  const offset_center = start.lerp(end, 0.5).add(np.mul(offset));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(offset_center.x, offset_center.y);
  ctx.lineTo(position.x, position.y);
  ctx.stroke();

  draw_dimention(ctx, start.add(np.mul(offset)), end.add(np.mul(offset)));
  draw_dimention_text(ctx, position, value.toString());
}

export function draw_dimention_to_segment(
  ctx: CanvasRenderingContext2D,
  point: Point2,
  start: Point2,
  end: Point2,
  position: Point2,
  value: number,
) {
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.lineWidth = 1;

  const delta = end.sub(start);
  const np = delta.normalize();
  const oppositePoint = point.project_on_line(start, end);
  const offset = position
    .sub(point)
    .dot(point.sub(oppositePoint).perp().normalize());

  const offset_start = point.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(offset_start.x, offset_start.y);
  ctx.stroke();

  const offset_end = oppositePoint.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(oppositePoint.x, oppositePoint.y);
  ctx.lineTo(offset_end.x, offset_end.y); // TODO : hide line if it's on the segment
  ctx.stroke();

  const offset_center = point.lerp(oppositePoint, 0.5).add(np.mul(offset));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(offset_center.x, offset_center.y);
  ctx.lineTo(position.x, position.y);
  ctx.stroke();

  draw_dimention(
    ctx,
    point.add(np.mul(offset)),
    oppositePoint.add(np.mul(offset)),
  );
  draw_dimention_text(ctx, position, value.toString());
}

export function draw_dimention_angle(
  ctx: CanvasRenderingContext2D,
  start1: Point2,
  end1: Point2,
  start2: Point2,
  end2: Point2,
  position: Point2,
  value: number,
) {
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.STROKE;
  ctx.lineWidth = 2;

  const origin = Point2.lines_intersection(start1, end1, start2, end2);
  const radius = origin.distance_to(position);
  let alpha = start1.angle_to(end1);
  let beta = start2.angle_to(end2);
  if ((alpha - beta + TAU) % TAU < TAU / 2) {
    [alpha, beta] = [beta, alpha];
  }
  //const angle = (beta - alpha + TAU) % TAU;
  //const center = origin.add(Point2.from_polar(radius, (((alpha + TAU) % TAU) + ((beta + TAU) % TAU)) / 2));
  //const e = d * Math.sin(angle / 2);
  //origin = origin.add(center.sub(origin).normalize().mul(d));
  const start = origin.add(new Point2(radius, 0).rotate(alpha + 3 / radius));
  const end = origin.add(new Point2(radius, 0).rotate(beta - 3 / radius));
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

  draw_dimention_text(ctx, position, value.toString() + " °");
}

export function draw_dimention_radius(
  ctx: CanvasRenderingContext2D,
  center: Point2,
  radius: number,
  position: Point2,
  value: number,
) {
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.STROKE;
  ctx.lineWidth = 2;

  const delta = position.sub(center);
  const length = delta.length();
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(delta.angle());

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(radius - 18, -6);
  ctx.lineTo(radius - 18, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(Math.max(radius - 5, length), 0);
  ctx.stroke();

  ctx.restore();

  draw_dimention_text(ctx, position, value.toString());
}

export function draw_gear_ratio(ctx: CanvasRenderingContext2D, value: number) {
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let text = valueToRatioParts(value).join(":");
  const metrics = ctx.measureText(text);
  ctx.strokeStyle = "grey";
  ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
  ctx.beginPath();
  ctx.roundRect(-metrics.width / 2 - 4, -20 / 2, metrics.width + 8, 20, 10);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = COLORS.STROKE;
  ctx.fillText(text, 0, 0);
}
