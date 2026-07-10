import { DIM } from "../../constants/rendering-specs";
import { Link, Point2 } from "../../types";
import {
  BeltPiece,
  BeltVia,
  belt_pieces,
  belt_point_tangent,
  nearest_point_on_piece,
} from "../../utils/belt-path";

/** Approche une position ou un rayon vers targetValue.
 * La valeur de 'stiffness' doit être en dessous de 1 pour une attraction moins forte que les autres contraintes. */
export function applyHandleGrabConstraint(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  key: string,
  targetValue: Point2 | number,
  stiffness: number = 0.5,
  maxAmplitude: number = 10,
): number {
  if (typeof targetValue === "number") {
    // Radius
    const r = radii.get(key);
    if (!r) return 0;
    const delta = targetValue - r;
    let target = delta * stiffness;
    if (target > maxAmplitude) target = maxAmplitude;
    if (target < -maxAmplitude) target = -maxAmplitude;
    radii.set(key, r + target);
    return Math.abs(delta);
  } else {
    // Position — respect mass (grounded elements cannot be moved)
    if ((posMasses.get(key) ?? 1) === 0) return 0;
    const p = positions.get(key);
    if (!p) return 0;
    const delta = targetValue.sub(p);
    let target = delta.mul(stiffness).limit_length_max(maxAmplitude);
    positions.set(key, p.add(target));
    return delta.length();
  }
}

/** Contraint la distance entre deux points à valoir targetDist.
 * L'erreur (écart à la distance cible) est corrigée le long de l'axe p1→p2 :
 * chaque point est déplacé proportionnellement à sa masse (w/totalW) et à stiffness. */
export function applyDistanceConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  key1: string,
  key2: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = posMasses.get(key1) ?? 1;
  const w2 = posMasses.get(key2) ?? 1;
  if (!p1 || !p2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const delta = p2.sub(p1);
  if (delta.length_squared() === 0) {
    return targetDist;
  }
  const error = delta.length() - targetDist;
  const diff = error / delta.length();

  positions.set(key1, p1.add(delta.mul(diff * (w1 / totalW) * stiffness)));
  positions.set(key2, p2.sub(delta.mul(diff * (w2 / totalW) * stiffness)));
  return Math.abs(error);
}

/** Contraint la distance perpendiculaire entre un point (keyNode) et une droite
 * définie par (keyStart, keyEnd). Chaque point est déplacé proportionnellement
 * à sa masse pour réduire l'erreur. */
export function applyDistanceToLineConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  // Vecteur perpendiculaire normalisé de la droite, pointant vers le nœud
  const proj = pNode.project_on_line(start, end);
  const vec = pNode.sub(proj); // vecteur perp du pied de perp vers le nœud
  const len = vec.length();

  let perpDir: Point2;
  if (len === 0) {
    // Nœud sur la ligne : on choisit une direction perpendiculaire arbitraire
    perpDir = end.sub(start).perp().normalize();
  } else {
    perpDir = vec.mul(1 / len);
  }

  const currentDist = len;
  const error = currentDist - targetDist; // signé : positif = trop loin

  // On pondère : wNode bouge le nœud, (wStart+wEnd)/2 bouge la ligne.
  const wLine = (wStart + wEnd) / 2;
  const totalW = wNode + wLine;
  if (totalW === 0) return 0;

  // Déplacement du nœud : le ramène vers la ligne de "error * wNode/totalW"
  const nodeCorrection = perpDir.mul(-error * (wNode / totalW) * stiffness);
  if (wNode !== 0) positions.set(keyNode, pNode.add(nodeCorrection));

  // Déplacement des extrémités : la ligne s'éloigne du nœud de "error * wLine/totalW"
  const lineCorrection = perpDir.mul(error * (wLine / totalW) * stiffness);
  if (wStart !== 0) positions.set(keyStart, start.add(lineCorrection));
  if (wEnd !== 0) positions.set(keyEnd, end.add(lineCorrection));

  return Math.abs(error);
}

/** Contraint un point (keyNode) à rester sur le segment (keyStart, keyEnd).
 * Le paramètre t est recalculé à chaque itération (projection libre sur le segment),
 * avec une marge pour éviter les extrémités. Chaque point est déplacé selon sa masse. */
export function applySlideOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  const totalW = (2 * wNode + wStart + wEnd) / 2; // TODO : vérifier risque d'oscillation avec "wEnd" bloqué
  if (totalW === 0) return 0;

  const edgeLength = start.distance_to(end);
  const t = Math.max(
    DIM.EDGE_END_MARGIN / edgeLength,
    Math.min(
      pNode.parameter_on_segment(start, end),
      1 - DIM.EDGE_END_MARGIN / edgeLength,
    ),
  );
  const delta = pNode.sub(start.lerp(end, t));
  const error = delta.length();

  positions.set(keyNode, pNode.sub(delta.mul((wNode / totalW) * stiffness)));
  positions.set(keyStart, start.add(delta.mul((wStart / totalW) * stiffness)));
  positions.set(keyEnd, end.add(delta.mul((wEnd / totalW) * stiffness)));
  return error;
}

/** Contraint un point (keyNode) à se trouver exactement au ratio t fixe sur le
 * segment (keyStart, keyEnd), i.e. à la position lerp(start, end, t).
 * Contrairement à OnSegment, t est constant (ratio mémorisé au moment du grab).
 * Chaque point est déplacé selon sa masse. */
export function applyFixedOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  t: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  const totalW = (2 * wNode + wStart + wEnd) / 2; // TODO : vérifier risque d'oscillation avec "wEnd" bloqué
  if (totalW === 0) return 0;

  const delta = pNode.sub(start.lerp(end, t));
  const error = delta.length();

  positions.set(keyNode, pNode.sub(delta.mul((wNode / totalW) * stiffness)));
  positions.set(keyStart, start.add(delta.mul((wStart / totalW) * stiffness)));
  positions.set(keyEnd, end.add(delta.mul((wEnd / totalW) * stiffness)));
  return error;
}

/** Contraint le segment (keyStart, keyEnd) à rester parallèle à une direction fixe.
 * Chaque extrémité est projetée sur la droite passant par le milieu du segment
 * avec cette direction, en proportion de sa masse. */
export function applyKeepOrientationConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  direction: Point2,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const midPoint = start.lerp(end, 0.5);
  const projStart = start.project_on_line(midPoint, midPoint.add(direction));
  const projEnd = end.project_on_line(midPoint, midPoint.add(direction));
  const error = start.distance_to(projStart);

  if (wStart !== 0)
    positions.set(
      keyStart,
      start.lerp(projStart, (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0)
    positions.set(keyEnd, end.lerp(projEnd, (wEnd / totalW) * stiffness));
  return error;
}

/** Contraint les deux points à avoir la même coordonnée Y (alignement horizontal).
 * Le Y cible est la moyenne pondérée des Y des deux points selon leurs masses. */
export function applyHorizontalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.y - end.y;

  if (wStart !== 0)
    positions.set(
      keyStart,
      new Point2(start.x, start.y - error * (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0) {
    positions.set(
      keyEnd,
      new Point2(end.x, end.y + error * (wEnd / totalW) * stiffness),
    );
  }
  return Math.abs(error);
}

/** Contraint les deux points à avoir la même coordonnée X (alignement vertical).
 * Le X cible est la moyenne pondérée des X des deux points selon leurs masses. */
export function applyVerticalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.x - end.x;

  if (wStart !== 0)
    positions.set(
      keyStart,
      new Point2(start.x - error * (wStart / totalW) * stiffness, start.y),
    );
  if (wEnd !== 0)
    positions.set(
      keyEnd,
      new Point2(end.x + error * (wEnd / totalW) * stiffness, end.y),
    );
  return Math.abs(error);
}

/** Contraint deux segments à être parallèles.
 * L'angle résiduel (diff) est distribué entre les deux segments au prorata
 * de leurs masses totales : le segment le plus léger tourne davantage.
 * Chaque segment pivote autour de son propre centre. */
export function applyParallelConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);

  // Différence d'angle à corriger (modulo π car les segments ne sont pas orientés)
  let diff = v2.angle() - v1.angle();
  // Ramener diff dans [-π/2, π/2] pour choisir la correction la plus courte
  while (diff > Math.PI / 2) diff -= Math.PI;
  while (diff < -Math.PI / 2) diff += Math.PI;

  const error = Math.abs(diff);

  // Masses totales de chaque segment
  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Segment 1 : tourne de +diff * (w1/totalW) * stiffness
  const rot1 = diff * (w1 / totalW) * stiffness;
  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = v1.mul(0.5).rotate(rot1);
  if (posMasses.get(s1) !== 0) positions.set(s1, center1.sub(half1));
  if (posMasses.get(e1) !== 0) positions.set(e1, center1.add(half1));

  // Segment 2 : tourne de -diff * (w2/totalW) * stiffness
  const rot2 = -diff * (w2 / totalW) * stiffness;
  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = v2.mul(0.5).rotate(rot2);
  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(half2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint deux segments à être perpendiculaires (angle = π/2 entre eux).
 * Identique à applyParallelConstraint mais la cible est un angle de 90°.
 * La correction angulaire est distribuée entre les deux segments selon leurs masses. */
export function applyNormalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);

  // Différence par rapport à la cible de 90° (π/2)
  let diff = v2.angle() - (v1.angle() + Math.PI / 2);
  // Ramener diff dans [-π/2, π/2]
  while (diff > Math.PI / 2) diff -= Math.PI;
  while (diff < -Math.PI / 2) diff += Math.PI;

  const error = Math.abs(diff);

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Segment 1 : tourne dans le sens positif
  const rot1 = diff * (w1 / totalW) * stiffness;
  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = v1.mul(0.5).rotate(rot1);
  if (posMasses.get(s1) !== 0) positions.set(s1, center1.sub(half1));
  if (posMasses.get(e1) !== 0) positions.set(e1, center1.add(half1));

  // Segment 2 : tourne dans le sens négatif
  const rot2 = -diff * (w2 / totalW) * stiffness;
  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = v2.mul(0.5).rotate(rot2);
  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(half2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint l'angle orienté entre deux segments à valoir targetAngle.
 *
 * Les paramètres flipStart/flipEnd et couterClockwise servent uniquement à interpréter la valeur cible (targetAngle) dans le bon quadrant.
 *
 * Chaque segment pivote autour de son propre centre.
 */
export function applyAngleConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  flipStart: boolean,
  flipEnd: boolean,
  couterClockwise: boolean,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);

  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const delta1 = pe1.sub(ps1);
  const delta2 = pe2.sub(ps2);

  if (delta1.length_squared() === 0 || delta2.length_squared() === 0) return 0;

  let virtV1 = flipStart ? delta1.mul(-1) : delta1;
  let virtV2 = flipEnd ? delta2.mul(-1) : delta2;
  const currentAngle = virtV1.angle_to(virtV2);

  let diff = currentAngle - targetAngle * (couterClockwise ? -1 : 1);

  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;

  const error = Math.abs(diff);
  if (error < 0.0001) return 0;

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;

  if (totalW === 0) return 0;

  const invW1 = 1 / w1;
  const invW2 = 1 / w2;
  const totalInvW = invW1 + invW2;

  const finalRot1 = diff * (invW1 / totalInvW) * stiffness;
  const finalRot2 = -diff * (invW2 / totalInvW) * stiffness; // Signe opposé pour fermer/ouvrir l'angle

  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = delta1.mul(0.5).rotate(finalRot1);
  if ((posMasses.get(s1) ?? 1) !== 0) positions.set(s1, center1.sub(half1));
  if ((posMasses.get(e1) ?? 1) !== 0) positions.set(e1, center1.add(half1));

  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = delta2.mul(0.5).rotate(finalRot2);
  if ((posMasses.get(s2) ?? 1) !== 0) positions.set(s2, center2.sub(half2));
  if ((posMasses.get(e2) ?? 1) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint deux segments à avoir la même longueur.
 * La longueur cible est la moyenne pondérée des deux longueurs selon les masses
 * totales de chaque segment : le segment le plus léger s'adapte davantage.
 * Délègue ensuite à applyDistanceConstraint pour chaque segment. */
export function applyEqualLengthConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const len1 = pe1.sub(ps1).length();
  const len2 = pe2.sub(ps2).length();

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  const targetLen =
    totalW > 0 ? (len1 * w1 + len2 * w2) / totalW : (len1 + len2) / 2;

  const error = Math.abs(len1 - len2);

  applyDistanceConstraint(positions, posMasses, s1, e1, targetLen, stiffness);
  applyDistanceConstraint(positions, posMasses, s2, e2, targetLen, stiffness);
  return error;
}

/** Contraint la distance entre deux centres d'engrenages à être exactement r1+r2
 * (condition d'engrènement). La correction est distribuée entre les positions et
 * les rayons selon leurs masses : si les centres sont bloqués, ce sont les rayons
 * qui s'adaptent, et inversement. */
export function applyGearMeshingConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  rg1: string,
  rg2: string,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(g1);
  const p2 = positions.get(g2);
  const r1 = radii.get(rg1);
  const r2 = radii.get(rg2);
  const wPos1 = posMasses.get(g1) ?? 1;
  const wPos2 = posMasses.get(g2) ?? 1;
  const wRad1 = radMasses.get(rg1) ?? 1;
  const wRad2 = radMasses.get(rg2) ?? 1;
  // r1/r2 peuvent valoir 0 (pont de rayon nul utilisé par le grab de rayon) :
  // on teste `undefined`, pas la fausseté, sinon la contrainte s'annule.
  if (!p1 || !p2 || r1 === undefined || r2 === undefined) return 0;

  const dist = p1.distance_to(p2);
  const targetDist = r1 + r2;
  const error = dist - targetDist; // signé : positif = trop éloignés

  // Poids total : positions (comptent pour 1 chacune) + rayons (comptent pour 1 chacun)
  // Un rayon corrige l'erreur de distance de 1 pour 1, comme un point.
  const totalW = wPos1 + wPos2 + wRad1 + wRad2;
  if (totalW === 0) return 0;

  // Correction des positions : rapproche/éloigne les centres le long de leur axe
  if (wPos1 !== 0 || wPos2 !== 0) {
    const posW = wPos1 + wPos2;
    applyDistanceConstraint(
      positions,
      posMasses,
      g1,
      g2,
      targetDist,
      (posW / totalW) * stiffness,
    );
  }

  // Correction des rayons : augmente/diminue r1 et r2 pour résorber le reste de l'erreur.
  // Les deux rayons bougent dans le même sens (tous deux grandissent si dist > r1+r2).
  const radCorrection = error * stiffness;
  if (wRad1 !== 0)
    radii.set(
      rg1,
      Math.max(DIM.MIN_GEAR_RADIUS, r1 + radCorrection * (wRad1 / totalW)),
    );
  if (wRad2 !== 0)
    radii.set(
      rg2,
      Math.max(DIM.MIN_GEAR_RADIUS, r2 + radCorrection * (wRad2 / totalW)),
    );
  return Math.abs(error);
}

/** Contraint le rapport des rayons de deux engrenages à valoir `ratio` (r1/r2 = ratio).
 * La correction est distribuée entre les deux rayons selon leurs masses :
 * le rayon libre bougera davantage que le rayon ancré. */
export function applyGearRatioConstraint(
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  ratio: number,
  stiffness: number = 1.0,
): number {
  const r1 = radii.get(g1);
  const r2 = radii.get(g2);
  const w1 = radMasses.get(g1) ?? 1;
  const w2 = radMasses.get(g2) ?? 1;
  if (!r1 || !r2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Rayon cible pour chaque engrenage en supposant r1/r2 = ratio :
  // r1_target = sqrt(r1 * r2 * ratio), r2_target = r1_target / ratio
  // Approche simplifiée : on cherche le scale s tel que (r1*s) / (r2/s) = ratio
  // => s² = ratio * r2 / r1, s = sqrt(ratio * r2 / r1)
  // Mais on distribue juste la correction proportionnellement aux masses :
  const currentRatio = r1 / r2;
  const ratioError = currentRatio - ratio; // signé
  const error = Math.abs(ratioError);

  // Correction : on ajuste r1 à la baisse et r2 à la hausse (ou inversement)
  // de façon à réduire l'erreur de ratio, pondéré par les masses.
  // dr1 = -ratioError * r2 * (w1/totalW) * stiffness  (dérivée de r1/r2 par r1 = 1/r2)
  // dr2 = +ratioError * r1/r2² * r2 * (w2/totalW) * stiffness = ratioError * r1/r2 * ...
  // Simplifié : on tire les deux rayons vers la cible commune weighted-average.
  const targetR1 = ratio * r2; // r1 si r2 est fixe
  const targetR2 = r1 / ratio; // r2 si r1 est fixe
  if (w1 !== 0)
    radii.set(
      g1,
      Math.max(
        DIM.MIN_GEAR_RADIUS,
        r1 + (targetR1 - r1) * (w1 / totalW) * stiffness,
      ),
    );
  if (w2 !== 0)
    radii.set(
      g2,
      Math.max(
        DIM.MIN_GEAR_RADIUS,
        r2 + (targetR2 - r2) * (w2 / totalW) * stiffness,
      ),
    );

  return error;
}

/** Wrap an angle difference to (−π, π]. */
function wrap_angle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Moteur sur beam : fait tourner `drivenKey` autour de `pivotKey` vers l'angle
 * absolu `targetAngle` (angle monde de pivot→driven). Contrainte à priorité
 * normale : si le mécanisme est bloqué, le résidu subsiste sans état invalide. */
export function applyMotorBeamConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if ((posMasses.get(drivenKey) ?? 1) === 0) return 0;
  const pivot = positions.get(pivotKey);
  const driven = positions.get(drivenKey);
  if (!pivot || !driven) return 0;

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const diff = wrap_angle(targetAngle - v.angle());
  positions.set(drivenKey, pivot.add(v.rotate(diff * stiffness)));
  return Math.abs(diff);
}

/** Moteur sur engrenage : pousse le nœud d'angle `angleKey` vers `targetAngle`. */
export function applyMotorAngleConstraint(
  angles: Map<string, number>,
  angleKey: string,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  const a = angles.get(angleKey);
  if (a === undefined) return 0;
  const diff = targetAngle - a; // cumulatif : pas de wrap
  angles.set(angleKey, a + diff * stiffness);
  return Math.abs(diff);
}

/** Engrènement épicycloïdal en espace d'angles (couche passive : n'écrit que les
 * nœuds d'angle). `alpha` est l'angle continu de la ligne des centres.
 * C = r1·((θ1−θ1₀) − Δα) + r2·((θ2−θ2₀) − Δα), Δα = alpha − alpha0. */
export function applyGearMeshAngleConstraint(
  angles: Map<string, number>,
  angleKey1: string,
  angleKey2: string,
  r1: number,
  r2: number,
  theta1_0: number,
  theta2_0: number,
  alpha0: number,
  alpha: number,
  stiffness: number = 1.0,
): number {
  const a1 = angles.get(angleKey1);
  const a2 = angles.get(angleKey2);
  if (a1 === undefined || a2 === undefined) return 0;

  const dAlpha = alpha - alpha0;
  const C = r1 * (a1 - theta1_0 - dAlpha) + r2 * (a2 - theta2_0 - dAlpha);
  const denom = r1 * r1 + r2 * r2;
  if (denom === 0) return 0;

  angles.set(angleKey1, a1 - (r1 * C * stiffness) / denom);
  angles.set(angleKey2, a2 - (r2 * C * stiffness) / denom);
  return Math.abs(C);
}

/** Nœud fixé au périmètre d'un engrenage : couple sa position à l'angle θ.
 * On veut angle(N − centre) = θ + offset et |N − centre| = radius.
 * Bidirectionnel : répartit la correction angulaire entre la rotation de N et
 * l'angle θ, puis contraint le rayon en déplaçant N ET le centre selon leurs
 * masses (si N est ancré, c'est le centre de l'engrenage qui bouge). */
export function applyGearPerimeterPinConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  nodeKey: string,
  centerKey: string,
  angleKey: string,
  radius: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  const center = positions.get(centerKey);
  const node = positions.get(nodeKey);
  const theta = angles.get(angleKey);
  if (!center || !node || theta === undefined) return 0;

  const v = node.sub(center);
  if (v.length_squared() < 1e-12) return 0;
  const ang = v.angle();

  const wN = posMasses.get(nodeKey) ?? 1;
  // L'angle n'est jamais ancré (poids 1).
  const denom = wN + 1;

  let C = ang - theta - offset;
  // wrap to (−π, π] for the shortest correction (angle node stays cumulative)
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  const dAng = -C * (wN / denom) * stiffness;
  const dTheta = (C / denom) * stiffness;
  // Correction angulaire : on tourne N autour du centre (le centre reste fixe
  // pour cette partie) et on ajuste θ.
  if (wN !== 0) positions.set(nodeKey, center.add(v.rotate(dAng)));
  angles.set(angleKey, theta + dTheta);

  // Correction du rayon : contraint |N − centre| = radius en déplaçant les deux
  // points selon leurs masses. Le centre de l'engrenage bouge donc aussi pour
  // résoudre la contrainte (indispensable quand N est ancré ailleurs).
  const radiusError = applyDistanceConstraint(
    positions,
    posMasses,
    nodeKey,
    centerKey,
    radius,
    stiffness,
  );

  return Math.abs(C) + radiusError;
}

/** Beam attaché à un join fixé sur un engrenage : son orientation suit θ.
 * Fait tourner `drivenKey` autour de `pivotKey` pour que
 * angle(driven − pivot) = θ + offset (bidirectionnel avec θ). */
export function applyBeamFollowsAngleConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  angleKey: string,
  offset: number,
  stiffness: number = 1.0,
): number {
  const pivot = positions.get(pivotKey);
  const driven = positions.get(drivenKey);
  const theta = angles.get(angleKey);
  if (!pivot || !driven || theta === undefined) return 0;

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const ang = v.angle();

  const wD = posMasses.get(drivenKey) ?? 1;
  // L'angle n'est jamais ancré (poids 1).
  const denom = wD + 1;

  let C = ang - theta - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  const dAng = -C * (wD / denom) * stiffness;
  const dTheta = (C / denom) * stiffness;
  if (wD !== 0) positions.set(drivenKey, pivot.add(v.rotate(dAng)));
  angles.set(angleKey, theta + dTheta);
  return Math.abs(C);
}

/**
 * Courroie inextensible (simulation) : maintient la longueur géométrique totale
 * (segments tangents + arcs d'enroulement) à `targetLength`. Contrainte scalaire
 * globale unique par courroie — bouger une poulie redistribue toute la boucle
 * pour conserver la longueur (c'est la transmission de la courroie). Rayons
 * figés en simulation, donc bakés dans `radii`.
 *
 * Projection PBD de C = L − L₀ : chaque centre bouge de −C·w·∇/Σ(w·|∇|²), avec
 * (théorème de l'enveloppe, les points de tangence glissent librement)
 * ∂L/∂centre = −(somme des tangentes unitaires adjacentes). Les positions
 * fusionnées (ex. jonction start==end d'une courroie tendue) sont accumulées par
 * clé, donc une extrémité partagée reçoit la somme de ses deux contributions.
 */
export function applyBeltLengthConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  link: Extract<Link, { type: "BeltLength" }>,
  stiffness: number = 1.0,
): number {
  const {
    startKey,
    endKey,
    gearPosKeys,
    gearAngleKeys,
    radii,
    directions,
    length: targetLength,
    closed,
    disconnected,
    wraps,
  } = link;

  // Vias: closed (tight) belt = the gear cycle; open (loose) belt = start terminal
  // (r=0) → gears → end terminal (r=0). `viaKey[v]` = its position key; `viaGear[v]`
  // = the original gear index (−1 for a terminal). Pulleys that lost contact
  // mid-simulation are skipped (belt runs straight past them).
  const vias: BeltVia[] = [];
  const viaKey: string[] = [];
  const viaGear: number[] = [];
  if (!closed) {
    const start = positions.get(startKey);
    if (!start) return 0;
    vias.push({ pos: start, radius: 0, direction: false });
    viaKey.push(startKey);
    viaGear.push(-1);
  }
  for (let i = 0; i < gearPosKeys.length; i++) {
    if (disconnected?.[i]) continue;
    const pos = positions.get(gearPosKeys[i]);
    if (!pos) return 0;
    vias.push({ pos, radius: radii[i], direction: directions[i] });
    viaKey.push(gearPosKeys[i]);
    viaGear.push(i);
  }
  if (!closed) {
    const end = positions.get(endKey);
    if (!end) return 0;
    vias.push({ pos: end, radius: 0, direction: false });
    viaKey.push(endKey);
    viaGear.push(-1);
  }
  if (vias.length < (closed ? 2 : 3)) return 0;
  const last = vias.length - 1;

  // Continuous per-via wrap (whole turns included) → a wound arc grows past 2π
  // smoothly (no 0/2π seam jump). Terminal slots carry 0 (never read as arcs).
  const viaWraps = wraps
    ? viaGear.map((g) => (g >= 0 ? (wraps[g] ?? 0) : 0))
    : undefined;

  // ∂L/∂centre = −(sum of adjacent tangent units): each straight span A→B adds −û
  // to A and +û to B (envelope theorem: arcs add nothing to first-order
  // translation). Accumulate per unique DOF (positions may be fused). For an open
  // belt, also grab the two terminal runs (length + tangent point).
  const pieces = belt_pieces(vias, closed, viaWraps);
  let length = 0;
  let fsStart = 0;
  let fsEnd = 0;
  let PtanS: Point2 | null = null; // start run's gear tangent point
  let PtanE: Point2 | null = null; // end run's gear tangent point
  const posGrad = new Map<string, Point2>();
  const add = (key: string, g: Point2) =>
    posGrad.set(key, (posGrad.get(key) ?? new Point2(0, 0)).add(g));
  for (const piece of pieces) {
    length += piece.length;
    if (piece.kind !== "segment") continue;
    const d = piece.to.sub(piece.from);
    if (d.length_squared() < 1e-12) continue;
    const u = d.normalize();
    // Terminals (viaGear −1) are excluded from the centre gradient — an open belt's
    // ends ride their own tangent (projected below).
    if (viaGear[piece.gearIndex] >= 0) add(viaKey[piece.gearIndex], u.mul(-1));
    if (viaGear[piece.gearIndexB] >= 0) add(viaKey[piece.gearIndexB], u);
    if (!closed && piece.gearIndex === 0) {
      fsStart = piece.length;
      PtanS = piece.to;
    }
    if (!closed && piece.gearIndexB === last) {
      fsEnd = piece.length;
      PtanE = piece.from;
    }
  }

  const C = length - targetLength;

  // The open-belt terminal + φ + winding machinery is SIMULATION-only: it needs the
  // shared travel φ, seeded in the angles map by belt_phase_gear_links. In edition
  // (a length dimension) φ is absent → fall back to the pulley-centre projection,
  // exactly as when closed (terminals stay free, unmoved by the length).
  const simFeed =
    !closed &&
    link.phaseKey !== undefined &&
    angles.get(link.phaseKey) !== undefined;

  // ── Tight belt, or edition: pulley-centre projection only ──
  if (!simFeed) {
    let denom = 0;
    posGrad.forEach((grad, key) => {
      denom += (posMasses.get(key) ?? 1) * grad.length_squared();
    });
    if (denom < 1e-12) return Math.abs(C);
    const k = -(C / denom) * stiffness;
    posGrad.forEach((grad, key) => {
      const w = posMasses.get(key) ?? 1;
      if (w !== 0) positions.set(key, positions.get(key)!.add(grad.mul(k * w)));
    });
    return Math.abs(C);
  }

  // ── Loose belt (simulation): free centres + terminals + φ + winding, one proj ──
  const phi = link.phaseKey !== undefined ? (angles.get(link.phaseKey) ?? 0) : 0;
  const startGear = viaGear[1]; // first ACTIVE gear (terminal's neighbour)
  const endGear = viaGear[last - 1];
  const c0 = vias[1].pos;
  const cN = vias[last - 1].pos;
  const thetaS = angles.get(gearAngleKeys[startGear]);
  const thetaE = angles.get(gearAngleKeys[endGear]);
  const distS = positions.get(startKey)!.distance_to(c0);
  const distE = positions.get(endKey)!.distance_to(cN);

  const diffTarget = (link.diff0 ?? 0) - 2 * phi;

  // Winding transitions — geometric, decoupled from belt_pieces' (tight, for smooth
  // drawing) onGear so a run that reels in actually catches:
  //  • wind ON once the terminal is within WIND_TOL of its rim, recording φ then;
  //  • unwind either when the belt has FED the run back out (φ moved back past that
  //    mark — start winds as φ climbs, end as φ drops) OR when the terminal is pulled
  //    clear of the rim past DETACH_TOL (a grab yanking it off — a tangential grab
  //    keeps it on the rim and just turns the gear, so only an OUTWARD pull detaches).
  // A winch (external) end is driven by its own GearPerimeterPin, never here.
  const WIND_TOL = 2; // reel-in seats onto the rim this close
  const DETACH_TOL = DIM.GEAR_TEETH_SIZE + 2; // beyond a tooth ⇒ a deliberate pull-off
  const UNWIND = 2; // px of belt fed back before a wound run lets go (hysteresis)
  // A GRABBED terminal never winds ON — the user grabs a terminal to move or peel it
  // off, not to attach it (and detached belts must not reattach). Suppressing wind-on
  // for the grabbed end also prevents a spin/flip-flop: grabbing a wound end spins θ
  // via its rim pin → φ drifts → the φ-based unwind fires → without this guard it
  // would immediately re-wind at a new angle and ratchet θ away.
  if (!link.startExternal) {
    if (
      link.startWind === undefined &&
      link.grabbedTerminal !== "start" &&
      distS <= radii[startGear] + WIND_TOL &&
      thetaS !== undefined
    ) {
      link.startWind = positions.get(startKey)!.sub(c0).angle() - thetaS;
      link.startWindPhi = phi;
    } else if (
      link.startWind !== undefined &&
      (phi < (link.startWindPhi ?? 0) - UNWIND || distS > radii[startGear] + DETACH_TOL)
    ) {
      link.startWind = undefined;
    }
  }
  if (!link.endExternal) {
    if (
      link.endWind === undefined &&
      link.grabbedTerminal !== "end" &&
      distE <= radii[endGear] + WIND_TOL &&
      thetaE !== undefined
    ) {
      link.endWind = positions.get(endKey)!.sub(cN).angle() - thetaE;
      link.endWindPhi = phi;
    } else if (
      link.endWind !== undefined &&
      (phi > (link.endWindPhi ?? 0) + UNWIND || distE > radii[endGear] + DETACH_TOL)
    ) {
      link.endWind = undefined;
    }
  }

  // A terminal wound onto its pulley (no join) is pinned on the rim EXACTLY like a
  // GearPerimeterPin — bidirectional: the motor turning θ carries it around, and
  // GRABBING it turns θ (→ φ → the whole belt travels). The old code set its
  // position authoritatively, which froze it against a grab. Winch (external) ends
  // are pinned by their own GearPerimeterPin. Wound/winch ends leave the length
  // projection (weight 0) — the free end conserves length for them.
  let wS = link.startExternal ? 0 : (posMasses.get(startKey) ?? 1);
  let wE = link.endExternal ? 0 : (posMasses.get(endKey) ?? 1);
  const pinWound = (
    key: string,
    centerKey: string,
    rad: number,
    angleKey: string,
    windRef: number,
  ) => {
    const c = positions.get(centerKey)!;
    const node = positions.get(key)!;
    const theta = angles.get(angleKey);
    if (theta === undefined) return;
    const v = node.sub(c);
    if (v.length_squared() >= 1e-12) {
      const wN = posMasses.get(key) ?? 1;
      const denom = wN + 1; // θ node weight = 1, never anchored
      let Ca = v.angle() - theta - windRef;
      while (Ca > Math.PI) Ca -= 2 * Math.PI;
      while (Ca <= -Math.PI) Ca += 2 * Math.PI;
      if (wN !== 0) positions.set(key, c.add(v.rotate((-Ca * wN) / denom)));
      angles.set(angleKey, theta + Ca / denom);
    }
    applyDistanceConstraint(positions, posMasses, key, centerKey, rad);
  };
  const startWound =
    !link.startExternal && link.startWind !== undefined && thetaS !== undefined;
  const endWound =
    !link.endExternal && link.endWind !== undefined && thetaE !== undefined;
  if (startWound) {
    pinWound(startKey, viaKey[1], radii[startGear], gearAngleKeys[startGear], link.startWind!);
    wS = 0;
  }
  if (endWound) {
    pinWound(endKey, viaKey[last - 1], radii[endGear], gearAngleKeys[endGear], link.endWind!);
    wE = 0;
  }

  // Stable outward tangent unit at a terminal, from the gear radius (not the noisy
  // terminal−Ptan, which degenerates as the run vanishes near the rim).
  const tangentDir = (term: Point2, Ptan: Point2, c: Point2): Point2 => {
    const radial = Ptan.sub(c).normalize();
    let u = new Point2(-radial.y, radial.x);
    if (term.sub(Ptan).dot(u) < 0) u = u.mul(-1);
    return u;
  };
  const s = positions.get(startKey)!;
  const e = positions.get(endKey)!;
  const uS = PtanS ? tangentDir(s, PtanS, c0) : null;
  const uE = PtanE ? tangentDir(e, PtanE, cN) : null;
  const wSf = uS ? wS : 0;
  const wEf = uE ? wE : 0;

  // When EXACTLY one end is wound, the length constraint must also be able to drive
  // φ: pulling the free end feeds belt by UNWINDING the wound end (its wound arc
  // shrinks as it orbits), instead of blocking. Orbiting the wound terminal by dθ
  // changes its arc (dθ = dφ/(r·ε) via BeltPhaseGear), so ∂length/∂φ ≠ 0 — measured
  // by finite difference below (its magnitude is ≈ 1). We add φ as a DOF of the C_sum
  // projection with this gradient. The baked-wrap `length`/`C` above freezes the
  // wound arc within the frame, so drive the projection with a LIVE geometric length
  // so it actually responds to φ and converges.
  // Engage the φ-drive only when the user pulls the FREE terminal while the OTHER is
  // wound — then the pull peels the wound end off by unwinding it. Grabbing the wound
  // end itself (or no grab / a motor) must not take this path: the wound end is
  // pinned, so driving φ against it would blow up; it detaches via DETACH_TOL.
  const oneWound = startWound !== endWound;
  const pullingFreeEnd =
    (startWound && link.grabbedTerminal === "end") ||
    (endWound && link.grabbedTerminal === "start");
  let gPhi = 0;
  let Cproj = C;
  if (oneWound && pullingFreeEnd) {
    const geomLen = (vs: BeltVia[]) =>
      belt_pieces(vs, false).reduce((a, p) => a + p.length, 0);
    const liveLen = geomLen(vias);
    Cproj = liveLen - targetLength;
    const wgVia = startWound ? 1 : last - 1;
    const wgIdx = startWound ? startGear : endGear;
    const termVia = startWound ? 0 : last;
    const cW = vias[wgVia].pos;
    const rW = radii[wgIdx];
    const epsW = directions[wgIdx] ? -1 : 1;
    if (Math.abs(rW) > 1e-9) {
      const dphi = 0.1;
      const dth = dphi / (rW * epsW);
      const curAng = vias[termVia].pos.sub(cW).angle();
      const perturbed = vias.map((v) => ({ ...v }));
      perturbed[termVia] = {
        ...vias[termVia],
        pos: cW.add(Point2.from_polar(rW, curAng + dth)),
      };
      gPhi = (geomLen(perturbed) - liveLen) / dphi;
      // ∂length/∂φ has magnitude ≈ 1 (orbiting the wound terminal by dθ lengthens
      // its arc by r·dθ). The finite difference stays reliable while the wound end
      // orbits smoothly, but SPIKES when the perturbation straddles a belt_pieces
      // routing discontinuity. On such a sample, disengage φ for this iteration and
      // let the free end carry the length (as it does when no end is wound) — an
      // unreliable gradient must not be trusted to drive φ.
      if (Math.abs(gPhi) > 1.5) gPhi = 0;
    }
  }

  // C_sum = total − L0 over free centres AND free terminals (one denom → correct
  // mass-weighted distribution; moving a terminal δ along its tangent changes total
  // by δ, the gear tangent point stays put). Plus φ when one end is wound (above).
  const corr = new Map<string, Point2>();
  const addCorr = (key: string, v: Point2) =>
    corr.set(key, (corr.get(key) ?? new Point2(0, 0)).add(v));
  let dPhiSum = 0;
  let denom = wSf + wEf + gPhi * gPhi;
  posGrad.forEach((grad, key) => {
    denom += (posMasses.get(key) ?? 1) * grad.length_squared();
  });
  if (denom > 1e-12) {
    const k = -Cproj / denom;
    posGrad.forEach((grad, key) => {
      const w = posMasses.get(key) ?? 1;
      if (w !== 0) addCorr(key, grad.mul(k * w));
    });
    if (uS && wSf > 0) addCorr(startKey, uS.mul(k * wSf));
    if (uE && wEf > 0) addCorr(endKey, uE.mul(k * wEf));
    dPhiSum = k * gPhi;
  }

  // C_diff = (fsStart − fsEnd) − (diff0 − 2φ): φ-coupled differential, only while BOTH
  // ends are free. Once an end is wound/winch it is a length slave (C_sum) and its
  // pull on φ is carried by its own pin/BeltPhaseGear — keeping C_diff on with the
  // wound arc unaccounted (belt_pieces reports fs = 0) would over-demand the free end
  // and fight a motor-driven φ.
  let dPhi = 0;
  if (uS && uE && wSf > 0 && wEf > 0) {
    const Cdiff = fsStart - fsEnd - diffTarget;
    const denomD = wSf + wEf + 4;
    addCorr(startKey, uS.mul((-Cdiff * wSf) / denomD));
    addCorr(endKey, uE.mul((Cdiff * wEf) / denomD));
    dPhi = (-Cdiff * 2) / denomD;
  }

  corr.forEach((v, key) =>
    positions.set(key, positions.get(key)!.add(v.mul(stiffness))),
  );
  if (link.phaseKey !== undefined)
    angles.set(link.phaseKey, phi + (dPhi + dPhiSum) * stiffness);
  // The wound end unwinding to a single contact point (its pulley's wrap → 0) is
  // detected and committed as a disconnect by update_belt_disconnects (which
  // tracks the CONTINUOUS wrap once per frame — the right granularity, and it
  // never confuses a >2π winding for a near-zero raw wrap).
  return Math.abs(oneWound ? Cproj : C);
}

/**
 * Jonction d'une courroie tendue : contraint le nœud `nodeKey` (= start==end
 * fusionnés) à se poser sur la pièce la plus proche du contour de la courroie —
 * n'importe quel segment tangent ou arc du **cycle fermé** de poulies — pour
 * garder la boucle continue où que la jonction se trouve. Symétrique : J et le
 * ou les centres de poulie bordant cette pièce bougent (rayons bakés). La
 * tangence sur un arc est structurelle (pas de poulie « dupliquée »). Retire 1 DDL.
 */
export function applyBeltJunctionConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  nodeKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  stiffness: number = 1.0,
): number {
  const J = positions.get(nodeKey);
  if (!J || gearPosKeys.length === 0) return 0;

  const vias: BeltVia[] = [];
  for (let i = 0; i < gearPosKeys.length; i++) {
    const pos = positions.get(gearPosKeys[i]);
    if (!pos) return 0;
    vias.push({ pos, radius: radii[i], direction: directions[i] });
  }

  // Nearest piece (segment or arc) of the closed gear cycle. Distance is to the
  // piece's clamped extent — for an arc, only its WRAPPED sector counts, so the
  // junction can't rest on the free side of a pulley.
  const pieces = belt_pieces(vias, true);
  if (pieces.length === 0) return 0;
  let best = pieces[0];
  let bestDist = Infinity;
  for (const piece of pieces) {
    const d = J.distance_to(nearest_point_on_piece(J, piece));
    if (d < bestDist) {
      bestDist = d;
      best = piece;
    }
  }

  const wJ = posMasses.get(nodeKey) ?? 1;

  if (best.kind === "segment") {
    // Move J and the segment's two bounding gears along the tangent normal
    // (translating both centres translates the tangent line exactly).
    const keyA = gearPosKeys[best.gearIndex];
    const keyB = gearPosKeys[best.gearIndexB];
    const cA = positions.get(keyA)!;
    const cB = positions.get(keyB)!;
    const wA = posMasses.get(keyA) ?? 1;
    const wB = posMasses.get(keyB) ?? 1;
    const n = best.to.sub(best.from).perp().normalize();
    const e = J.sub(best.from).dot(n); // signed perpendicular offset
    const wLine = (wA + wB) / 2;
    const totalW = wJ + wLine;
    if (totalW === 0) return Math.abs(e);
    if (wJ !== 0)
      positions.set(nodeKey, J.add(n.mul(-e * (wJ / totalW) * stiffness)));
    const lineShift = n.mul(e * (wLine / totalW) * stiffness);
    if (wA !== 0) positions.set(keyA, cA.add(lineShift));
    if (keyB !== keyA && wB !== 0) positions.set(keyB, cB.add(lineShift));
    return Math.abs(e);
  }

  // On an arc: |J − centre| = radius, shared between J and that centre.
  return applyDistanceConstraint(
    positions,
    posMasses,
    nodeKey,
    gearPosKeys[best.gearIndex],
    best.radius,
    stiffness,
  );
}

/**
 * Épingle de courroie (simulation) : le nœud attaché `nodeKey` suit la courroie
 * tendue à l'abscisse s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0), donc il **voyage**
 * quand la courroie tourne. Bidirectionnel/symétrique : la composante **tangentielle**
 * de l'écart avance θ_ref (→ toutes les poulies tournent via BeltPhaseGear) OU déplace le nœud, réparti par masse.
 * la composante **normale** ramène le nœud sur la courroie. Rayons + références bakés.
 */
export function applyBeltPinConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  nodeKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  refIndex: number,
  refAngleKey: string,
  s0: number,
  thetaRef0: number,
  wraps?: number[],
  stiffness: number = 1.0,
): number {
  const J = positions.get(nodeKey);
  if (!J || gearPosKeys.length === 0) return 0;
  const vias: BeltVia[] = [];
  for (let i = 0; i < gearPosKeys.length; i++) {
    const pos = positions.get(gearPosKeys[i]);
    if (!pos) return 0;
    vias.push({ pos, radius: radii[i], direction: directions[i] });
  }
  const angleKey = refAngleKey;
  const thetaRef = angles.get(angleKey);
  if (thetaRef === undefined) return 0;

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  if (Math.abs(rEps) < 1e-9) return 0;
  const s = s0 + rEps * (thetaRef - thetaRef0);
  const pieces = belt_pieces(vias, true, wraps);
  const { point: target, tangent: T } = belt_point_tangent(
    vias,
    s,
    true,
    wraps,
  );

  const err = J.sub(target); // node relative to its belt target
  const errT = err.dot(T); // tangential (belt-travel) mismatch
  const errN = err.sub(T.mul(errT)); // normal (off-belt) offset

  const wJ = posMasses.get(nodeKey) ?? 1;
  const wTheta = 1; // angle node never anchored
  const totalT = wJ + wTheta;

  // Tangential: share between sliding the node back and advancing the belt.
  let node = J;
  if (wJ !== 0) node = node.sub(T.mul(errT * (wJ / totalT) * stiffness));
  angles.set(
    angleKey,
    thetaRef + (errT * (wTheta / totalT) * stiffness) / rEps,
  );

  // Normal: pull the node back onto the belt, SYMMETRICALLY sharing with the
  // pulley(s) bounding the piece at s — so dragging the junction off the belt
  // drags those pulleys too (translating the loop toward it).
  const piece = piece_at_arclength(pieces, s);
  const gearKeys =
    piece && piece.kind === "segment"
      ? [
          ...new Set([
            gearPosKeys[piece.gearIndex],
            gearPosKeys[piece.gearIndexB],
          ]),
        ]
      : piece
        ? [gearPosKeys[piece.gearIndex]]
        : [];
  const wGear =
    gearKeys.length > 0
      ? gearKeys.reduce((a, k) => a + (posMasses.get(k) ?? 1), 0) /
        gearKeys.length
      : 0;
  const totalN = wJ + wGear;
  if (totalN > 0) {
    if (wJ !== 0) node = node.sub(errN.mul((wJ / totalN) * stiffness));
    const gearShift = errN.mul((wGear / totalN) * stiffness);
    gearKeys.forEach((k) => {
      if ((posMasses.get(k) ?? 1) !== 0)
        positions.set(k, positions.get(k)!.add(gearShift));
    });
  }
  if (wJ !== 0) positions.set(nodeKey, node);

  return err.length();
}

/** The belt piece containing arc-length `s` on a closed loop (wraps `s`). */
function piece_at_arclength(pieces: BeltPiece[], s: number) {
  const total = pieces.reduce((a, p) => a + p.length, 0);
  if (pieces.length === 0 || total <= 0) return undefined;
  let local = ((s % total) + total) % total;
  for (const p of pieces) {
    if (local <= p.length) return p;
    local -= p.length;
  }
  return pieces[pieces.length - 1];
}

/**
 * Orientation d'un beam soudé à la jonction d'une courroie (simulation) : son
 * angle suit la tangente de la courroie, angle(driven − pivot) = tangentAngle(s)
 * + offset. Bidirectionnel, pondéré par la courbure locale : sur un arc, tourner
 * le beam avance la courroie (dTangentAngle/dθ_ref = courbure·r_ref·ε_ref) ; sur
 * un segment la tangente est fixe → le beam s'y aligne sans faire voyager.
 */
export function applyBeltFollowsTangentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  refIndex: number,
  refAngleKey: string,
  s0: number,
  thetaRef0: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  const pivot = positions.get(pivotKey);
  const driven = positions.get(drivenKey);
  if (!pivot || !driven || gearPosKeys.length === 0) return 0;
  const vias: BeltVia[] = [];
  for (let i = 0; i < gearPosKeys.length; i++) {
    const pos = positions.get(gearPosKeys[i]);
    if (!pos) return 0;
    vias.push({ pos, radius: radii[i], direction: directions[i] });
  }
  const angleKey = refAngleKey;
  const thetaRef = angles.get(angleKey);
  if (thetaRef === undefined) return 0;

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  const s = s0 + rEps * (thetaRef - thetaRef0);
  const { tangent, curvature } = belt_point_tangent(vias, s, true);

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  let C = v.angle() - tangent.angle() - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  const dTdTheta = curvature * rEps; // how the tangent angle moves per θ_ref
  const wD = posMasses.get(drivenKey) ?? 1;
  const denom = wD + dTdTheta * dTdTheta; // θ node weight = 1
  if (denom < 1e-12) return Math.abs(C);

  const dBeam = -C * (wD / denom) * stiffness;
  const dTheta = C * (dTdTheta / denom) * stiffness;
  if (wD !== 0) positions.set(drivenKey, pivot.add(v.rotate(dBeam)));
  angles.set(angleKey, thetaRef + dTheta);
  return Math.abs(C);
}

/**
 * Belt no-slip (simulation) : la rotation d'une poulie est liée au voyage partagé
 * `φ` de la courroie — r·ε·(θ − θ0) = φ, ε = dir?−1:1. Toutes les poulies (et les
 * extrémités / la jonction) se couplent au MÊME `φ`, donc la transmission passe
 * par lui. N'écrit que des scalaires d'angle (θ et φ, jamais ancrés).
 */
export function applyBeltPhaseGearConstraint(
  angles: Map<string, number>,
  angleKey: string,
  phaseKey: string,
  r: number,
  eps: number,
  theta0: number,
  stiffness: number = 1.0,
): number {
  const theta = angles.get(angleKey);
  const phi = angles.get(phaseKey);
  if (theta === undefined || phi === undefined) return 0;

  if (r < 1e-9) return 0;
  const C = r * eps * (theta - theta0) - phi; // = 0 at no-slip (px units)
  // Project in belt-px space: θ contributes r·ε·θ px and φ contributes φ px, both
  // magnitude 1 → denom = 2. Convert the θ correction back to radians by /(r·ε).
  angles.set(angleKey, theta - (C / (2 * r * eps)) * stiffness);
  angles.set(phaseKey, phi + (C / 2) * stiffness);
  return Math.abs(C);
}

/** Engrenages coaxiaux : θ1 − θ2 = offset (même rotation, offset constant). */
export function applyCoaxialAngleConstraint(
  angles: Map<string, number>,
  angleKey1: string,
  angleKey2: string,
  offset: number,
  stiffness: number = 1.0,
): number {
  const a1 = angles.get(angleKey1);
  const a2 = angles.get(angleKey2);
  if (a1 === undefined || a2 === undefined) return 0;

  // Les angles ne sont jamais ancrés : correction répartie à parts égales.
  const C = a1 - a2 - offset; // cumulatif : pas de wrap
  angles.set(angleKey1, a1 - 0.5 * C * stiffness);
  angles.set(angleKey2, a2 + 0.5 * C * stiffness);
  return Math.abs(C);
}
