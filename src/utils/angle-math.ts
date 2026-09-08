import { Point2 } from "../types";

/**
 * Détermine les paramètres d'orientation pour une contrainte d'angle entre deux segments, en fonction du point de placement de la cote.
 *
 * Cette fonction résout l'ambiguïté des 4 quadrants formés par l'intersection de deux droites.
 * Elle définit quels vecteurs directeurs utiliser (via les flags 'flip') et le sens de rotation (horaire ou anti-horaire) pour mesurer l'angle intérieur du quadrant sélectionné (en degrés).
 */
export function resolve_angle_constraint_quadrant(
  start1: Point2,
  end1: Point2,
  start2: Point2,
  end2: Point2,
  position: Point2,
): {
  flipStart: boolean;
  flipEnd: boolean;
  couterClockwise: boolean;
  angle: number;
} | null {
  const delta1 = end1.sub(start1);
  const delta2 = end2.sub(start2);

  const intersection = Point2.lines_intersection(start1, end1, start2, end2);
  if (!intersection) return null;
  const posDir = position.sub(intersection);

  // The product of two cross products: a quartic (m⁴) quantity, so the margin below scales by the fourth power of the old millimetre-flavoured threshold (-10e-4).
  const flipStart = delta2.cross(posDir) * delta2.cross(delta1) < -1e-15;
  const flipEnd = delta1.cross(posDir) * delta1.cross(delta2) < -1e-15;

  const v1 = flipStart ? delta1.mul(-1) : delta1;
  const v2 = flipEnd ? delta2.mul(-1) : delta2;

  let angle = v1.angle2deg(v2);
  let couterClockwise = false;
  if (angle < 0) {
    angle = Math.abs(angle);
    couterClockwise = true;
  }

  return { flipStart, flipEnd, couterClockwise, angle };
}
