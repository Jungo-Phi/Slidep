import { DIM } from "../../constants/rendering-specs";
import { Point2 } from "../../types";

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
export function applyOnSegmentConstraint(
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
export function applyAtSegmentRatioConstraint(
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
  if (!p1 || !p2 || !r1 || !r2) return 0;

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
