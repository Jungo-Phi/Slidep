import { Link, Point2 } from "../../types";
import { ONE } from "../../types/point2";
import {
  BeltVia,
  belt_at,
  belt_locate,
  belt_pieces,
  belt_shared_scratch,
  belt_solve_arc,
  belt_solve_pairs,
  belt_total,
  nearest_point_on_piece,
} from "../../utils/belt-path";
import {
  EditNodes,
  Nodes,
  SimNodes,
  SolveNodes,
  point,
  setPoint,
} from "./nodes";
import { LinkSlots } from "./link-slots";

/**
 * How small a gear radius the solver may write.
 *
 * A numerical guard, not a size: the belt geometry, the meshing and the ratio all divide by a radius, and none of them survives a zero. How small a gear one may *draw* is a matter of pixels and belongs to the cursor bounds — a minimum in world units would make the same mechanism behave differently drawn at ten times the size.
 */
const MIN_SOLVED_RADIUS = 1e-3;

/** The single writer of a gear radius, so the guard above cannot be forgotten at one of the sites that move one. */
function write_radius(nodes: EditNodes, slot: number, value: number): void {
  nodes.radius[slot] = Math.max(MIN_SOLVED_RADIUS, value);
}

/* ════════════════════════════════════════════════════════════════════════
 *  OnSegment : point contraint sur le segment (start, end)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Contrainte vectorielle  C(p) = pNode − lerp(start, end, t) = 0.
 * Le point cible sur le segment est  L(t) = (1−t)·start + t·end, donc
 *
 *     ∂C/∂pNode = +I            ‖∇_node‖² = 1
 *     ∂C/∂start = −(1−t)·I      ‖∇_start‖² = (1−t)²
 *     ∂C/∂end   = −t·I          ‖∇_end‖²  = t²
 *
 * La projection PBD répartit la correction selon wᵢ‖∇ᵢ‖² :
 *
 *     denom = w_node·1 + w_start·(1−t)² + w_end·t²
 *     λ     = C / denom            (vectoriel : C est un Point2)
 *     Δp_node  = −λ · w_node·1
 *     Δp_start = +λ · w_start·(1−t)
 *     Δp_end   = +λ · w_end·t
 *
 * L'ancienne pondération  (2·w_node + w_start + w_end)/2  ignorait `t` : elle
 * traitait chaque extrémité comme si t = 0.5. Conséquences mesurées :
 *   • un nœud proche d'une extrémité sur-sollicitait l'AUTRE extrémité (bras de
 *     levier ignoré), injectant du mouvement parasite dans les liens voisins ;
 *   • convergence molle : ~6 itérations là où la projection exacte converge en
 *     une seule (le facteur de sous-relaxation implicite variait avec t).
 * Le TODO « oscillation avec wEnd bloqué » se lève : pas d'oscillation, mais une
 * répartition fausse et une convergence lente.
 * ──────────────────────────────────────────────────────────────────────── */

/** Facteur commun aux deux contraintes OnSegment : projette pNode sur
 * lerp(start, end, t) avec la pondération PBD correcte (bras de levier `t`).
 * `t` est fourni par l'appelant (fixe pour Fixed, reprojeté pour Slide).
 * `normalOffset` décale la cible perpendiculairement au segment, du côté où le
 * nœud se trouve déjà. Comme `DistanceToLine`, la direction perpendiculaire est
 * lue sur la géométrie courante et sa rotation n'entre pas dans le gradient : la
 * variété visée est exacte, seule la répartition de la correction est approchée. */
function projectOnSegment(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  t: number,
  stiffness: number,
  normalOffset: number = 0,
): number {
  const wNode = nodes.w[iNode];
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const a = 1 - t;
  const denom = wNode + wStart * a * a + wEnd * t * t;
  if (denom < 1e-12) return 0; // tout ancré → rien à corriger

  const sx = nodes.x[iStart];
  const sy = nodes.y[iStart];
  const ex = nodes.x[iEnd];
  const ey = nodes.y[iEnd];
  // foot = lerp(start, end, t), puis C = pNode − foot (contrainte vectorielle)
  let Cx = nodes.x[iNode] - (sx + (ex - sx) * t);
  let Cy = nodes.y[iNode] - (sy + (ey - sy) * t);
  if (normalOffset !== 0) {
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      // Un nœud pile sur le segment n'a pas de côté : la perpendiculaire gauche
      // tranche, ce qui rend le décalage reproductible plutôt qu'arbitraire.
      const side = Cx * nx + Cy * ny < 0 ? -1 : 1;
      Cx -= normalOffset * side * nx;
      Cy -= normalOffset * side * ny;
    }
  }
  const error = Math.sqrt(Cx * Cx + Cy * Cy);

  // λ = C / denom, puis Δpᵢ = ∓ λ wᵢ ‖∂ᵢ‖. Point ancré (wᵢ=0) → Δ nul.
  const lx = Cx * (stiffness / denom);
  const ly = Cy * (stiffness / denom);
  nodes.x[iNode] -= lx * wNode;
  nodes.y[iNode] -= ly * wNode;
  nodes.x[iStart] = sx + lx * (wStart * a);
  nodes.y[iStart] = sy + ly * (wStart * a);
  nodes.x[iEnd] = ex + lx * (wEnd * t);
  nodes.y[iEnd] = ey + ly * (wEnd * t);

  return error;
}

/** Contraint un point (keyNode) à rester sur le segment (keyStart, keyEnd).
 * `t` est reprojeté à chaque itération (glissement libre), borné par une marge
 * pour éviter les extrémités. La contrainte n'agit donc que perpendiculairement
 * au segment : le nœud glisse librement dans le sens tangent. */
export function applySlideOnSegmentConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  stiffness: number = 1.0,
  normalOffset: number = 0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  const sx = nodes.x[iStart];
  const sy = nodes.y[iStart];
  const dx = nodes.x[iEnd] - sx;
  const dy = nodes.y[iEnd] - sy;

  const edgeLength = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
  if (edgeLength === 0) return 0;

  // parameter_on_segment: (node − start)·d / ‖d‖²
  const onSegment =
    ((nodes.x[iNode] - sx) * dx + (nodes.y[iNode] - sy) * dy) /
    (dx * dx + dy * dy);
  // The whole segment, ends included: keeping the slider clear of them would be a rule of the drawing — the block is a fixed number of pixels wide — written into the model, where it would not survive a change of the mechanism's size.
  const t = Math.max(0, Math.min(onSegment, 1));
  return projectOnSegment(
    nodes,
    iStart,
    iEnd,
    iNode,
    t,
    stiffness,
    normalOffset,
  );
}

/** Contraint un point (keyNode) à se trouver exactement au ratio `t` FIXE sur
 * le segment (keyStart, keyEnd), i.e. à lerp(start, end, t). Contrairement à
 * Slide, `t` est constant (mémorisé au grab) : la contrainte agit dans les deux
 * directions (tangent + normal). */
export function applyFixedOnSegmentConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  t: number,
  stiffness: number = 1.0,
  normalOffset: number = 0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  return projectOnSegment(
    nodes,
    iStart,
    iEnd,
    iNode,
    t,
    stiffness,
    normalOffset,
  );
}

/* ════════════════════════════════════════════════════════════════════════
 *  EqualLength : deux segments de même longueur
 * ════════════════════════════════════════════════════════════════════════
 *
 * Cible = longueur commune vers laquelle tirer les deux segments. En PBD, le
 * segment le plus MOBILE doit s'adapter le plus, donc peser le MOINS dans la
 * cible → pondération par mobilité CROISÉE :
 *
 *     targetLen = (l1·w2 + l2·w1) / (w1 + w2)
 *
 * L'ancienne version utilisait (l1·w1 + l2·w2)/(w1+w2) : mobilité NON croisée.
 * Défaut mesuré : segment 1 entièrement ancré (w1 = 0), segment 2 libre. La
 * seule solution est seg2 → l1. L'ancienne calculait targetLen = l2 (elle
 * visait la longueur du segment LIBRE, pas de l'ancré), demandait au segment
 * ancré de s'y conformer — bloqué par sa masse nulle — et ne corrigeait donc
 * RIEN, tout en déclarant l'erreur en boucle. Même motif que le défaut de
 * pondération inversée sur applyAngleConstraint.
 *
 * Note d'ordre : on délègue deux fois à applyDistanceConstraint dans la même
 * passe. Ce n'est pas idempotent au sens strict d'un balayage Gauss-Seidel (le
 * second appel voit déjà l'effet du premier via les positions partagées), mais
 * la cible est calculée AVANT toute écriture, donc les deux segments visent la
 * même valeur. Le solveur re-balaie de toute façon : le résidu inter-segment
 * est absorbé aux passes suivantes.
 * ──────────────────────────────────────────────────────────────────────── */

/** Contraint deux segments à avoir la même longueur. */
export function applyEqualLengthConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const len1 = pe1.sub(ps1).length();
  const len2 = pe2.sub(ps2).length();

  const w1 = nodes.w[s1] + nodes.w[e1];
  const w2 = nodes.w[s2] + nodes.w[e2];
  const totalW = w1 + w2;

  // Mobilité CROISÉE : le segment le moins mobile tire la cible vers sa longueur.
  const targetLen =
    totalW > 0 ? (len1 * w2 + len2 * w1) / totalW : (len1 + len2) / 2;

  const error = Math.abs(len1 - len2);

  applyDistanceConstraint(nodes, s1, e1, targetLen, stiffness);
  applyDistanceConstraint(nodes, s2, e2, targetLen, stiffness);
  return error;
}

/* ════════════════════════════════════════════════════════════════════════
 *  Projection PBD de contraintes angulaire à 4 points
 * ════════════════════════════════════════════════════════════════════════
 *
 * Toutes les contraintes ci-dessous imposent une fonction scalaire de la forme
 *
 *     C(p) = θ(v₂) − θ(v₁) − θ_cible          (v₁ = e₁−s₁,  v₂ = e₂−s₂)
 *
 * La projection PBD standard pour une contrainte scalaire est
 *
 *     λ    = −C / Σᵢ wᵢ ‖∇ᵢC‖²
 *     Δpᵢ  = λ · wᵢ · ∇ᵢC
 *
 * avec, pour l'angle (perp(x,y) = (−y, x)) :
 *
 *     ∇_{s₁}C = +perp(v₁)/‖v₁‖²     ∇_{e₁}C = −perp(v₁)/‖v₁‖²
 *     ∇_{s₂}C = −perp(v₂)/‖v₂‖²     ∇_{e₂}C = +perp(v₂)/‖v₂‖²
 *
 * Propriétés obtenues « gratuitement », sans aucun garde-fou :
 *   • un point ancré (wᵢ = 0) ne bouge pas — Δpᵢ s'annule dans la formule ;
 *   • le segment pivote alors autour de ce point (seul mouvement laissé au
 *     point libre par le gradient) ;
 *   • chaque Δpᵢ est ⟂ au segment → la longueur n'est touchée qu'au 2ᵈ ordre ;
 *   • la correction demandée est celle obtenue → raideur/convergence prévisibles.
 *
 * Comme ‖perp(vᵢ)‖² = ‖vᵢ‖², on a ‖∇ᵢC‖² = 1/‖vᵢ‖² : le dénominateur se
 * simplifie et n'a jamais besoin de la longueur au carré des gradients écrite
 * explicitement.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Cœur partagé : projette la contrainte scalaire `C` (déjà déballée dans
 * (−π, π]) sur les quatre extrémités des deux segments, en respectant la
 * mobilité point par point. Utilisé par Angle, Parallel et Normal — seule
 * change la façon de calculer `C`.
 *
 * Ne fait rien et renvoie |C| si aucune correction n'est possible (segment
 * dégénéré ou tous les points ancrés).
 */
function projectAngleC(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  v1: Point2,
  v2: Point2,
  C: number,
  stiffness: number,
): number {
  const l1sq = v1.length_squared();
  const l2sq = v2.length_squared();
  if (l1sq === 0 || l2sq === 0) return Math.abs(C);

  // Gradients par point. Chaque grad a pour norme² 1/lᵢ².
  const g_s1 = v1.perp().mul(1 / l1sq); //  +perp(v₁)/‖v₁‖²
  const g_e1 = g_s1.mul(-1); //  −perp(v₁)/‖v₁‖²
  const g_s2 = v2.perp().mul(-1 / l2sq); //  −perp(v₂)/‖v₂‖²
  const g_e2 = g_s2.mul(-1); //  +perp(v₂)/‖v₂‖²

  const w_s1 = nodes.w[s1];
  const w_e1 = nodes.w[e1];
  const w_s2 = nodes.w[s2];
  const w_e2 = nodes.w[e2];

  // Σ wᵢ‖∇ᵢC‖² = (w_s1+w_e1)/l1² + (w_s2+w_e2)/l2²
  const denom = (w_s1 + w_e1) / l1sq + (w_s2 + w_e2) / l2sq;
  if (denom < 1e-12) return Math.abs(C); // tout ancré → rien à faire

  const lambda = (-C / denom) * stiffness;

  // Δpᵢ = λ · wᵢ · ∇ᵢC. Un point ancré (wᵢ=0) reçoit un Δ nul : pas de `if`.
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);
  setPoint(nodes, s1, ps1.add(g_s1.mul(lambda * w_s1)));
  setPoint(nodes, e1, pe1.add(g_e1.mul(lambda * w_e1)));
  setPoint(nodes, s2, ps2.add(g_s2.mul(lambda * w_s2)));
  setPoint(nodes, e2, pe2.add(g_e2.mul(lambda * w_e2)));

  return Math.abs(C);
}

/** Ramène un écart angulaire dans (−π, π]. */
function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/* ════════════════════════════════════════════════════════════════════════
 *  applyAngleConstraint (projection PBD)
 * ════════════════════════════════════════════════════════════════════════ */

/** Contraint l'angle orienté entre deux segments à valoir targetAngle.
 *
 * flipStart/flipEnd et couterClockwise ne servent qu'à interpréter la cible
 * dans le bon quadrant ; ils ne changent pas la géométrie de la correction.
 *
 * Projection PBD : voir l'en-tête du fichier. Un point ancré reste fixe et le
 * segment pivote autour de lui, sans cas particulier ni raccourcissement.
 */
export function applyAngleConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  flipStart: boolean,
  flipEnd: boolean,
  couterClockwise: boolean,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const delta1 = pe1.sub(ps1);
  const delta2 = pe2.sub(ps2);
  if (delta1.length_squared() === 0 || delta2.length_squared() === 0) return 0;

  // flip : on interprète la cible sur les vecteurs « virtuels ». Le gradient,
  // lui, se calcule sur les vrais vecteurs (le flip est une négation globale
  // qui laisse perp(v)/‖v‖² inchangé au signe près, absorbé par C).
  const virtV1 = flipStart ? delta1.mul(-1) : delta1;
  const virtV2 = flipEnd ? delta2.mul(-1) : delta2;
  const currentAngle = virtV1.angle_to(virtV2);

  const C = wrapPi(currentAngle - targetAngle * (couterClockwise ? -1 : 1));
  if (Math.abs(C) < 0.0001) return 0;

  // On projette avec les vrais delta1/delta2 : θ(virtV) et θ(delta) diffèrent
  // d'une constante (0 ou π) par segment, donc ∂C/∂p est identique.
  return projectAngleC(nodes, s1, e1, s2, e2, delta1, delta2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 *  applyParallelConstraint (projection PBD)
 * ════════════════════════════════════════════════════════════════════════ */

/** Contraint deux segments à être parallèles.
 *
 * Cible : angle relatif 0, modulo π (les segments ne sont pas orientés). La
 * correction la plus courte est choisie en ramenant C dans (−π/2, π/2].
 * Projection PBD identique à Angle.
 */
export function applyParallelConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  if (v1.length_squared() === 0 || v2.length_squared() === 0) return 0;

  // Modulo π : la correction la plus courte vit dans (−π/2, π/2].
  let C = v1.angle_to(v2);
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;

  return projectAngleC(nodes, s1, e1, s2, e2, v1, v2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 *  applyNormalConstraint (projection PBD)
 * ════════════════════════════════════════════════════════════════════════ */

/** Contraint deux segments à être perpendiculaires (angle = π/2).
 *
 * Identique à Parallel, cible décalée de π/2. Projection PBD identique.
 */
export function applyNormalConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  if (v1.length_squared() === 0 || v2.length_squared() === 0) return 0;

  // Écart à π/2, ramené modulo π dans (−π/2, π/2].
  let C = v1.angle_to(v2) - Math.PI / 2;
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;

  return projectAngleC(nodes, s1, e1, s2, e2, v1, v2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 *  applyKeepOrientationConstraint (projection PBD)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Un seul segment, aligné sur une direction fixe. On peut le voir comme un cas
 * particulier de la contrainte d'angle où le « second segment » est la
 * direction cible, immobile (poids infini → gradient nul côté cible). Il reste
 * donc une contrainte scalaire sur (s, e) :
 *
 *     C(p) = θ(e−s) − θ_dir      (ramené dans (−π, π])
 *     ∇_e C = +perp(v)/‖v‖²      ∇_s C = −perp(v)/‖v‖²
 *     λ = −C / [(w_s + w_e)/‖v‖²]
 *
 * (v = e−s : bouger `e` de +perp(v) augmente θ(v), d'où le + sur ∇_e.)
 *
 * Comme pour l'angle : une extrémité ancrée reste fixe et le segment pivote
 * autour d'elle, sans passer par le milieu, sans raccourcir.
 * ──────────────────────────────────────────────────────────────────────── */

/** Contraint le segment (keyStart, keyEnd) à rester parallèle à `direction`. */
export function applyKeepOrientationConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  direction: Point2,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  if (direction.length_squared() === 0) return 0;

  const v = end.sub(start);
  const lsq = v.length_squared();
  if (lsq === 0) return 0;

  // Écart d'orientation, modulo π (un segment n'est pas orienté).
  let C = direction.angle_to(v);
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;
  if (Math.abs(C) < 1e-9) return 0;

  const wS = nodes.w[iStart];
  const wE = nodes.w[iEnd];

  const denom = (wS + wE) / lsq;
  if (denom < 1e-12) return Math.abs(C);

  const lambda = (-C / denom) * stiffness;
  const g_e = v.perp().mul(1 / lsq); // +perp(v)/‖v‖²
  const g_s = g_e.mul(-1); // −perp(v)/‖v‖²

  setPoint(nodes, iStart, start.add(g_s.mul(lambda * wS)));
  setPoint(nodes, iEnd, end.add(g_e.mul(lambda * wE)));

  return Math.abs(C);
}

/** Approche une position ou un rayon vers targetValue.
 * La valeur de 'stiffness' doit être en dessous de 1 pour une attraction moins forte que les autres contraintes. */
export function applyHandleGrabConstraint(
  nodes: Nodes,
  /** The radius DOF array — edition only, where a grab can target a radius. */
  radii: Float64Array | undefined,
  iPos: number,
  iRad: number,
  targetValue: Point2 | number,
  stiffness: number = 0.5,
  maxAmplitude: number = 10,
): number {
  if (typeof targetValue === "number") {
    // Radius
    if (radii === undefined || iRad < 0) return 0;
    const r = radii[iRad];
    if (!r) return 0;
    const delta = targetValue - r;
    let target = delta * stiffness;
    if (target > maxAmplitude) target = maxAmplitude;
    if (target < -maxAmplitude) target = -maxAmplitude;
    radii[iRad] = r + target;
    return Math.abs(delta);
  } else {
    // Position — respect mass (grounded elements cannot be moved)
    if (iPos < 0) return 0;
    if (nodes.w[iPos] === 0) return 0;
    const p = point(nodes, iPos);
    const delta = targetValue.sub(p);
    const target = delta.mul(stiffness).limit_length_max(maxAmplitude);
    setPoint(nodes, iPos, p.add(target));
    return delta.length();
  }
}

/** Contraint la distance entre deux points à valoir targetDist.
 * L'erreur (écart à la distance cible) est corrigée le long de l'axe p1→p2 :
 * chaque point est déplacé proportionnellement à sa masse (w/totalW) et à stiffness.
 *
 * Coincident points carry no axis, so the separation borrows `preferredAxis`
 * when the caller knows which way the points should part (a belt terminal leaves
 * along the loop tangent); without one it falls back to a fixed diagonal, which
 * keeps the outcome deterministic instead of frame-dependent. */
export function applyDistanceConstraint(
  nodes: Nodes,
  i1: number,
  i2: number,
  targetDist: number,
  stiffness: number = 1.0,
  preferredAxis?: Point2,
): number {
  if (i1 < 0 || i2 < 0) return 0;
  const w1 = nodes.w[i1];
  const w2 = nodes.w[i2];

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const x1 = nodes.x[i1];
  const y1 = nodes.y[i1];
  const dx = nodes.x[i2] - x1;
  const dy = nodes.y[i2] - y1;
  if (dx * dx + dy * dy === 0) {
    // Already satisfied, and the null length would divide into NaN below.
    if (targetDist === 0) return 0;
    const axis =
      preferredAxis && preferredAxis.length_squared() > 0 ? preferredAxis : ONE;
    const step = axis.normalize().mul(targetDist * stiffness);
    if (w1 !== 0) setPoint(nodes, i1, point(nodes, i1).sub(step.mul(w1 / totalW)));
    if (w2 !== 0) setPoint(nodes, i2, point(nodes, i2).add(step.mul(w2 / totalW)));
    return targetDist;
  }
  const length = Math.sqrt(dx * dx + dy * dy);
  const error = length - targetDist;
  const diff = error / length;

  const k1 = diff * (w1 / totalW) * stiffness;
  const k2 = diff * (w2 / totalW) * stiffness;
  nodes.x[i1] = x1 + dx * k1;
  nodes.y[i1] = y1 + dy * k1;
  nodes.x[i2] = nodes.x[i2] - dx * k2;
  nodes.y[i2] = nodes.y[i2] - dy * k2;
  return Math.abs(error);
}

/** Contraint la distance perpendiculaire entre un point (keyNode) et une droite
 * définie par (keyStart, keyEnd). Chaque point est déplacé proportionnellement
 * à sa masse pour réduire l'erreur. */
export function applyDistanceToLineConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  const pNode = point(nodes, iNode);
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wNode = nodes.w[iNode];
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

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
  if (wNode !== 0) setPoint(nodes, iNode, pNode.add(nodeCorrection));

  // Déplacement des extrémités : la ligne s'éloigne du nœud de "error * wLine/totalW"
  const lineCorrection = perpDir.mul(error * (wLine / totalW) * stiffness);
  if (wStart !== 0) setPoint(nodes, iStart, start.add(lineCorrection));
  if (wEnd !== 0) setPoint(nodes, iEnd, end.add(lineCorrection));

  return Math.abs(error);
}

/** Contraint les deux points à avoir la même coordonnée Y (alignement horizontal).
 * Le Y cible est la moyenne pondérée des Y des deux points selon leurs masses. */
export function applyHorizontalConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.y - end.y;

  if (wStart !== 0)
    setPoint(
      nodes,
      iStart,
      new Point2(start.x, start.y - error * (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0) {
    setPoint(
      nodes,
      iEnd,
      new Point2(end.x, end.y + error * (wEnd / totalW) * stiffness),
    );
  }
  return Math.abs(error);
}

/** Contraint les deux points à avoir la même coordonnée X (alignement vertical).
 * Le X cible est la moyenne pondérée des X des deux points selon leurs masses. */
export function applyVerticalConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.x - end.x;

  if (wStart !== 0)
    setPoint(
      nodes,
      iStart,
      new Point2(start.x - error * (wStart / totalW) * stiffness, start.y),
    );
  if (wEnd !== 0)
    setPoint(
      nodes,
      iEnd,
      new Point2(end.x + error * (wEnd / totalW) * stiffness, end.y),
    );
  return Math.abs(error);
}

/** Contraint la distance entre deux centres d'engrenages à être exactement r1+r2
 * (condition d'engrènement). La correction est distribuée entre les positions et
 * les rayons selon leurs masses : si les centres sont bloqués, ce sont les rayons
 * qui s'adaptent, et inversement. */
export function applyGearMeshingConstraint(
  nodes: EditNodes,
  g1: number,
  g2: number,
  rg1: number,
  rg2: number,
  stiffness: number = 1.0,
): number {
  // r1/r2 peuvent valoir 0 (pont de rayon nul utilisé par le grab de rayon) :
  // on teste la présence du nœud, pas la fausseté, sinon la contrainte s'annule.
  if (g1 < 0 || g2 < 0 || rg1 < 0 || rg2 < 0) return 0;
  const p1 = point(nodes, g1);
  const p2 = point(nodes, g2);
  const r1 = nodes.radius[rg1];
  const r2 = nodes.radius[rg2];
  const wPos1 = nodes.w[g1];
  const wPos2 = nodes.w[g2];
  const wRad1 = nodes.wRadius[rg1];
  const wRad2 = nodes.wRadius[rg2];

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
      nodes,
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
    write_radius(nodes, rg1, r1 + radCorrection * (wRad1 / totalW));
  if (wRad2 !== 0)
    write_radius(nodes, rg2, r2 + radCorrection * (wRad2 / totalW));
  return Math.abs(error);
}

/** Contraint le rapport des rayons de deux engrenages à valoir `ratio` (r1/r2 = ratio).
 * La correction est distribuée entre les deux rayons selon leurs masses :
 * le rayon libre bougera davantage que le rayon ancré. */
export function applyGearRatioConstraint(
  nodes: EditNodes,
  g1: number,
  g2: number,
  ratio: number,
  stiffness: number = 1.0,
): number {
  if (g1 < 0 || g2 < 0) return 0;
  const r1 = nodes.radius[g1];
  const r2 = nodes.radius[g2];
  const w1 = nodes.wRadius[g1];
  const w2 = nodes.wRadius[g2];
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
    write_radius(nodes, g1, r1 + (targetR1 - r1) * (w1 / totalW) * stiffness);
  if (w2 !== 0)
    write_radius(nodes, g2, r2 + (targetR2 - r2) * (w2 / totalW) * stiffness);

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
  nodes: Nodes,
  iPivot: number,
  iDriven: number,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (iPivot < 0 || iDriven < 0) return 0;
  if (nodes.w[iDriven] === 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const diff = wrap_angle(targetAngle - v.angle());
  setPoint(nodes, iDriven, pivot.add(v.rotate(diff * stiffness)));
  return Math.abs(diff);
}

/** Moteur sur engrenage : pousse le nœud d'angle `iAngle` vers `targetAngle`. */
export function applyMotorAngleConstraint(
  nodes: SimNodes,
  iAngle: number,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (iAngle < 0) return 0;
  const a = nodes.angle[iAngle];
  const diff = targetAngle - a; // cumulatif : pas de wrap
  nodes.angle[iAngle] = a + diff * stiffness;
  return Math.abs(diff);
}

/** Engrènement épicycloïdal en espace d'angles (couche passive : n'écrit que les
 * nœuds d'angle). `alpha` est l'angle continu de la ligne des centres.
 * C = r1·((θ1−θ1₀) − Δα) + r2·((θ2−θ2₀) − Δα), Δα = alpha − alpha0. */
export function applyGearMeshAngleConstraint(
  nodes: SimNodes,
  iAngle1: number,
  iAngle2: number,
  r1: number,
  r2: number,
  theta1_0: number,
  theta2_0: number,
  alpha0: number,
  alpha: number,
  stiffness: number = 1.0,
): number {
  if (iAngle1 < 0 || iAngle2 < 0) return 0;
  const a1 = nodes.angle[iAngle1];
  const a2 = nodes.angle[iAngle2];

  const dAlpha = alpha - alpha0;
  const C = r1 * (a1 - theta1_0 - dAlpha) + r2 * (a2 - theta2_0 - dAlpha);
  const denom = r1 * r1 + r2 * r2;
  if (denom === 0) return 0;

  nodes.angle[iAngle1] = a1 - (r1 * C * stiffness) / denom;
  nodes.angle[iAngle2] = a2 - (r2 * C * stiffness) / denom;
  return Math.abs(C);
}

/** Nœud fixé au périmètre d'un engrenage : couple sa position à l'angle θ.
 * On veut angle(N − centre) = θ + offset et |N − centre| = radius.
 * Bidirectionnel : répartit la correction angulaire entre la rotation de N et
 * l'angle θ, puis contraint le rayon en déplaçant N ET le centre selon leurs
 * masses (si N est ancré, c'est le centre de l'engrenage qui bouge). */
export function applyGearPerimeterPinConstraint(
  nodes: SimNodes,
  iNode: number,
  iCenter: number,
  iAngle: number,
  radius: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iNode < 0 || iCenter < 0 || iAngle < 0) return 0;
  const cx = nodes.x[iCenter];
  const cy = nodes.y[iCenter];
  const theta = nodes.angle[iAngle];

  const vx = nodes.x[iNode] - cx;
  const vy = nodes.y[iNode] - cy;
  if (vx * vx + vy * vy < 1e-12) return 0;
  const ang = Math.atan2(vy, vx);

  const wN = nodes.w[iNode];
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
  if (wN !== 0) {
    const cos = Math.cos(dAng);
    const sin = Math.sin(dAng);
    nodes.x[iNode] = cx + (vx * cos - vy * sin);
    nodes.y[iNode] = cy + (vx * sin + vy * cos);
  }
  nodes.angle[iAngle] = theta + dTheta;

  // Correction du rayon : contraint |N − centre| = radius en déplaçant les deux
  // points selon leurs masses. Le centre de l'engrenage bouge donc aussi pour
  // résoudre la contrainte (indispensable quand N est ancré ailleurs).
  const radiusError = applyDistanceConstraint(
    nodes,
    iNode,
    iCenter,
    radius,
    stiffness,
  );

  return Math.abs(C) + radiusError;
}

/** Beam attaché à un join fixé sur un engrenage : son orientation suit θ.
 * Fait tourner `drivenKey` autour de `pivotKey` pour que
 * angle(driven − pivot) = θ + offset (bidirectionnel avec θ). */
export function applyBeamFollowsAngleConstraint(
  nodes: SimNodes,
  iPivot: number,
  iDriven: number,
  iAngle: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iPivot < 0 || iDriven < 0 || iAngle < 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);
  const theta = nodes.angle[iAngle];

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const ang = v.angle();

  let C = ang - theta - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  // Symmetric projection: rotate the beam AND advance θ, split by mobility. The beam
  // turns about its mobility-weighted fixed point c = (w_driven·pivot + w_pivot·
  // driven)/(w_pivot+w_driven): an anchored pivot (w_pivot = 0) gives c = pivot
  // (driven swings about it), a free pivot (a grabbed far end) moves too and
  // GearPerimeterPin turns the gear.
  const wP = nodes.w[iPivot];
  const wD = nodes.w[iDriven];
  const wBeam = wP + wD; // beam-rotation mobility (0 = both ends anchored)
  const denom = wBeam + 1; // angle node weight = 1, gradient 1
  if (denom < 1e-12) return Math.abs(C);

  const dPhi = -C * (wBeam / denom) * stiffness; // beam rotation
  const dTheta = (C / denom) * stiffness; // gear angle
  if (wBeam > 0 && dPhi !== 0) {
    const c = pivot.mul(wD / wBeam).add(driven.mul(wP / wBeam));
    if (wP !== 0) setPoint(nodes, iPivot, c.add(pivot.sub(c).rotate(dPhi)));
    if (wD !== 0) setPoint(nodes, iDriven, c.add(driven.sub(c).rotate(dPhi)));
  }
  nodes.angle[iAngle] = theta + dTheta;
  return Math.abs(C);
}

// Scratch for the belt length, grown once: the active vias (node slot + original gear
// index, disconnected pulleys skipped) and the slot-keyed gradient accumulation. Keyed by
// SLOT, not by via, because coincidence fusion can put two vias on one node.
let lenSlot = new Int32Array(16);
let lenGear = new Int32Array(16);
let lenArc = new Uint8Array(16);
let gradSlot = new Int32Array(16);
let gradX = new Float64Array(16);
let gradY = new Float64Array(16);

/**
 * Courroie inextensible (simulation) : maintient la longueur géométrique totale à `targetLength`.
 * Bouger une poulie redistribue toute la boucle pour conserver la longueur (c'est la transmission de la courroie).
 *
 * Projection PBD de C = L − L₀ : chaque centre bouge de −C·w·∇/Σ(w·|∇|²), avec (théorème de l'enveloppe, les points de tangence glissent librement)
 * ∂L/∂centre = −(somme des tangentes unitaires adjacentes).
 */
export function applyBeltLengthConstraint(
  /** The one constraint emitted in BOTH modes: the belt geometry is positional in
   *  simulation, and in edition the pulley radii become DOFs too. Which of the two it
   *  uses is decided by the link own fields (radKeys), never by the node set. */
  nodes: SolveNodes,
  s: LinkSlots,
  link: Extract<Link, { type: "BeltLength" }>,
  stiffness: number = 1.0,
): number {
  const {
    gearPosKeys,
    radii,
    directions,
    length: targetLength,
    closed,
    disconnected,
    wraps,
  } = link;

  // pos slots: [start, end, ...one per pulley] (see link-slots.ts)
  const iStart = s.pos[0];
  const iEnd = s.pos[1];

  const capacity = gearPosKeys.length + 2;
  if (lenSlot.length < capacity) {
    lenSlot = new Int32Array(capacity);
    lenGear = new Int32Array(capacity);
    lenArc = new Uint8Array(capacity);
    gradSlot = new Int32Array(capacity);
    gradX = new Float64Array(capacity);
    gradY = new Float64Array(capacity);
  }

  let n = 0;
  if (!closed) {
    if (iStart < 0) return 0;
    lenSlot[n] = iStart;
    lenGear[n] = -1;
    n++;
  }
  for (let i = 0; i < gearPosKeys.length; i++) {
    if (disconnected?.[i]) continue;
    if (s.pos[2 + i] < 0) return 0;
    lenSlot[n] = s.pos[2 + i];
    lenGear[n] = i;
    n++;
  }
  if (!closed) {
    if (iEnd < 0) return 0;
    lenSlot[n] = iEnd;
    lenGear[n] = -1;
    n++;
  }
  // A loose belt with NO active gears is an inert straight segment
  if (!closed && n === 2)
    return applyDistanceConstraint(
      nodes,
      iStart,
      iEnd,
      targetLength,
      stiffness,
    );
  if (n < (closed ? 2 : 3)) return 0;
  const last = n - 1;

  // ── Non-penetration FIRST, before any geometry is read ────────────────────
  // A terminal can never sit inside its adjacent pulley: `circles_link` switches from a
  // TANGENT to a RADIAL spoke at d = r, so sampling a terminal that has drifted inside
  // hands the projection a gradient rotated by 90° and the solver never settles.
  const radialContact = (iTerm: number, iCenter: number, rad: number) => {
    if (iTerm < 0 || iCenter < 0) return;
    const tx = nodes.x[iTerm];
    const ty = nodes.y[iTerm];
    const ccx = nodes.x[iCenter];
    const ccy = nodes.y[iCenter];
    const vx = tx - ccx;
    const vy = ty - ccy;
    const dd = Math.sqrt(vx * vx + vy * vy);
    if (dd >= rad || dd < 1e-9) return;
    const Cc = rad - dd;
    const ux = vx * (1 / dd);
    const uy = vy * (1 / dd);
    const wT = nodes.w[iTerm];
    const wC = nodes.w[iCenter];
    const tot = wT + wC;
    if (tot === 0) return;
    if (wT !== 0) {
      const f = Cc * (wT / tot) * stiffness;
      nodes.x[iTerm] = tx + ux * f;
      nodes.y[iTerm] = ty + uy * f;
    }
    if (wC !== 0) {
      const f = Cc * (wC / tot) * stiffness;
      nodes.x[iCenter] = ccx - ux * f;
      nodes.y[iCenter] = ccy - uy * f;
    }
  };
  if (!closed) {
    radialContact(iStart, lenSlot[1], radii[lenGear[1]]);
    radialContact(iEnd, lenSlot[last - 1], radii[lenGear[last - 1]]);
  }

  // Vias, from the now-valid positions. In edition (radKeys present) the radii are live
  // DOFs, so the geometry is measured from the RADII MAP — not the link's baked array —
  // otherwise the length cannot see them change.
  const sc = belt_shared_scratch(n);
  for (let v = 0; v < n; v++) {
    const g = lenGear[v];
    sc.cx[v] = nodes.x[lenSlot[v]];
    sc.cy[v] = nodes.y[lenSlot[v]];
    sc.r[v] = g >= 0 ? (s.rad[g] >= 0 ? nodes.radius[s.rad[g]] : radii[g]) : 0;
    sc.ccw[v] = g >= 0 && directions[g] ? 1 : 0;
  }
  const pairs = belt_solve_pairs(sc, n, closed);

  // ∂L/∂centre = −(sum of adjacent tangent units): each straight span A→B adds −û to A
  // and +û to B (envelope theorem: arcs add nothing to first-order translation). For an
  // open belt, also grab the two terminal runs (length + tangent point).
  let length = 0;
  let gradCount = 0;
  const add = (slot: number, gx: number, gy: number) => {
    for (let i = 0; i < gradCount; i++)
      if (gradSlot[i] === slot) {
        gradX[i] += gx;
        gradY[i] += gy;
        return;
      }
    gradSlot[gradCount] = slot;
    gradX[gradCount] = gx;
    gradY[gradCount] = gy;
    gradCount++;
  };

  let ptSX = 0;
  let ptSY = 0;
  let hasPtS = false;
  let ptEX = 0;
  let ptEY = 0;
  let hasPtE = false;

  /** Contact arc of via `v`: its length, or −1 when it has none. */
  const arcOfVia = (v: number): number => {
    const wrap =
      wraps !== undefined ? (lenGear[v] >= 0 ? (wraps[lenGear[v]] ?? 0) : 0) : undefined;
    if (!belt_solve_arc(sc, v, n, closed, wrap)) {
      lenArc[v] = 0;
      return -1;
    }
    lenArc[v] = 1;
    return sc.r[v] * sc.arcWrap[v];
  };

  const strand = (p: number) => {
    length += sc.ell[p];
    const a = p;
    const b = (p + 1) % n;
    // Terminal runs are captured FIRST: they must survive a ZERO-LENGTH run (an end
    // resting on its pulley's rim). Dropping them there would null the tangent points,
    // and the terminals would stop being moved by the length at all.
    if (!closed && a === 0) {
      ptSX = sc.arrX[p];
      ptSY = sc.arrY[p];
      hasPtS = true;
    }
    if (!closed && b === last) {
      ptEX = sc.depX[p];
      ptEY = sc.depY[p];
      hasPtE = true;
    }
    // A terminal run's tangent is read off the rim below, never off the run vector —
    // which vanishes at contact. Its centre gradient is added there too.
    if (!closed && (a === 0 || b === last)) return;
    const dx = sc.arrX[p] - sc.depX[p];
    const dy = sc.arrY[p] - sc.depY[p];
    if (dx * dx + dy * dy < 1e-12) return; // no direction to read off a null run
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // Terminals are excluded from the centre gradient — an open belt's ends ride their
    // own tangent (projected below).
    if (lenGear[a] >= 0) add(lenSlot[a], -ux, -uy);
    if (lenGear[b] >= 0) add(lenSlot[b], ux, uy);
  };

  // Same traversal as `belt_pieces`: a closed belt starts on an arc, an open one on a run.
  if (closed) {
    for (let v = 0; v < n; v++) {
      const arc = arcOfVia(v);
      if (arc >= 0) length += arc;
      strand(v);
    }
  } else {
    for (let p = 0; p < pairs; p++) {
      strand(p);
      const arc = arcOfVia(p + 1);
      if (arc >= 0) length += arc;
    }
  }

  // Outward unit tangent at each free terminal, taken from the pulley's RIM rather than
  // from the run vector `terminal − Ptan`: that vector vanishes as the end reaches the
  // rim, so neither its direction nor — above all — its SIGN can be read off it there.
  // Belt travel at a rim point is perp(radial)·sign; the start run travels INTO its gear
  // and the end run OUT of it, hence the flip on the start.
  let uSX = 0;
  let uSY = 0;
  let uEX = 0;
  let uEY = 0;
  const hasUS = !closed && hasPtS;
  const hasUE = !closed && hasPtE;
  if (hasUS) {
    const vx = ptSX - sc.cx[1];
    const vy = ptSY - sc.cy[1];
    const l = Math.sqrt(vx * vx + vy * vy);
    const sign = sc.ccw[1] === 1 ? -1 : 1;
    uSX = -(vy / l) * sign * -1;
    uSY = (vx / l) * sign * -1;
  }
  if (hasUE) {
    const vx = ptEX - sc.cx[last - 1];
    const vy = ptEY - sc.cy[last - 1];
    const l = Math.sqrt(vx * vx + vy * vy);
    const sign = sc.ccw[last - 1] === 1 ? -1 : 1;
    uEX = -(vy / l) * sign;
    uEY = (vx / l) * sign;
  }

  // Both terminal runs push their neighbouring gear centre along −(their own travel unit).
  if (hasUS) add(lenSlot[1], -uSX, -uSY);
  if (hasUE) add(lenSlot[last - 1], -uEX, -uEY);

  const C = length - targetLength;

  // ── One projection of C = L − L₀, the same in every branch ─────────────────
  // The DOFs are the pulley centres, the two free terminals (each along its own belt
  // tangent), and in edition the radii. A terminal JOINED to its adjacent pulley (a
  // winch) is not free: its `GearPerimeterPin` carries it, and the belt it pays out is
  // already counted in that pulley's growing arc.
  const startWound = !!link.startWound && lenGear[1] === 0;
  const endWound = !!link.endWound && lenGear[last - 1] === radii.length - 1;
  const wSf = hasUS && !startWound ? nodes.w[iStart] : 0;
  const wEf = hasUE && !endWound ? nodes.w[iEnd] : 0;

  let sPos = wSf + wEf;
  for (let i = 0; i < gradCount; i++)
    sPos += nodes.w[gradSlot[i]] * (gradX[i] * gradX[i] + gradY[i] * gradY[i]);

  // Edition-only: the radii are DOFs too. Growing a pulley lengthens the belt by its
  // wrap angle (∂L/∂r = wrap — the tangent-length and tangent-point terms cancel by the
  // envelope theorem). A dimension-radius freezes its pulley automatically (radMass 0).
  const radGrad = new Map<number, number>();
  if (s.rad.length > 0) {
    for (let v = 0; v < n; v++) {
      if (!lenArc[v]) continue;
      const gi = lenGear[v];
      if (gi < 0) continue;
      const rk = s.rad[gi];
      if (rk === undefined || rk < 0) continue;
      radGrad.set(rk, (radGrad.get(rk) ?? 0) + sc.arcWrap[v]);
    }
  }
  let sRad = 0;
  radGrad.forEach((g, slot) => {
    sRad += nodes.wRadius[slot] * g * g;
  });

  // Feel: when the centres are free to move, they should absorb the change TWICE as much
  // as the radii (the principled split is 1:1 — set the factor to 1).
  const RADII_ABSORB = 0.5;
  let radScale = 1;
  if (sPos > 1e-12 && sRad > 1e-12)
    radScale = Math.min(1, (sPos * RADII_ABSORB) / sRad);

  const denom = sPos + radScale * sRad;
  if (denom < 1e-12) return Math.abs(C);
  const k = -(C / denom) * stiffness;
  for (let i = 0; i < gradCount; i++) {
    const slot = gradSlot[i];
    const w = nodes.w[slot];
    if (w === 0) continue;
    const kw = k * w;
    nodes.x[slot] += gradX[i] * kw;
    nodes.y[slot] += gradY[i] * kw;
  }
  if (hasUS && wSf > 0) {
    const kw = k * wSf;
    nodes.x[iStart] += uSX * kw;
    nodes.y[iStart] += uSY * kw;
  }
  if (hasUE && wEf > 0) {
    const kw = k * wEf;
    nodes.x[iEnd] += uEX * kw;
    nodes.y[iEnd] += uEY * kw;
  }
  radGrad.forEach((g, slot) => {
    const w = nodes.wRadius[slot] * radScale;
    if (w !== 0) write_radius(nodes, slot, nodes.radius[slot] + k * w * g);
  });
  return Math.abs(C);
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
  nodes: EditNodes,
  s: LinkSlots,
  radii: number[],
  directions: boolean[],
  stiffness: number = 1.0,
): number {
  // pos slots: [junction node, ...one per pulley] (see link-slots.ts)
  const iNode = s.pos[0];
  const gearCount = s.pos.length - 1;
  if (iNode < 0 || gearCount === 0) return 0;
  const J = point(nodes, iNode);

  // Edition: the pulleys may be resized in the same solve (a length dimension), so read
  // the LIVE radius from the radius DOF — the link's baked `radii` array is a frame
  // behind and would drag the junction off the outline.
  const gearRadius = (i: number) =>
    s.rad[i] >= 0 ? nodes.radius[s.rad[i]] : radii[i];
  const vias: BeltVia[] = [];
  for (let i = 0; i < gearCount; i++) {
    if (s.pos[1 + i] < 0) return 0;
    vias.push({
      pos: point(nodes, s.pos[1 + i]),
      radius: gearRadius(i),
      direction: directions[i],
    });
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

  const wJ = nodes.w[iNode];

  if (best.kind === "segment") {
    // Move J and the segment's two bounding gears along the tangent normal
    // (translating both centres translates the tangent line exactly).
    const iA = s.pos[1 + best.gearIndexA];
    const iB = s.pos[1 + best.gearIndexB];
    const cA = point(nodes, iA);
    const cB = point(nodes, iB);
    const wA = nodes.w[iA];
    const wB = nodes.w[iB];
    const n = best.to.sub(best.from).perp().normalize();
    const e = J.sub(best.from).dot(n); // signed perpendicular offset
    const wLine = (wA + wB) / 2;
    const totalW = wJ + wLine;
    if (totalW === 0) return Math.abs(e);
    if (wJ !== 0)
      setPoint(nodes, iNode, J.add(n.mul(-e * (wJ / totalW) * stiffness)));
    const lineShift = n.mul(e * (wLine / totalW) * stiffness);
    if (wA !== 0) setPoint(nodes, iA, cA.add(lineShift));
    if (iB !== iA && wB !== 0) setPoint(nodes, iB, cB.add(lineShift));
    return Math.abs(e);
  }

  // On an arc: |J − centre| = radius, shared between J and that centre.
  return applyDistanceConstraint(
    nodes,
    iNode,
    s.pos[1 + best.gearIndex],
    best.radius,
    stiffness,
  );
}

/**
 * Belt pin (simulation): the attached node `nodeKey` rides the belt at arc-length
 * s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0), so it travels as the belt turns.
 * Bidirectional/symmetric: the TANGENTIAL error advances θ_ref (→ every pulley
 * turns via the strand no-slips) or slides the node, split by mass; the NORMAL error
 * pulls the node back onto the belt, shared with the pulley(s) bounding that
 * piece. A closed belt is a closed pulley loop; a loose belt is the open path
 * start-terminal → pulleys → end-terminal (`closed=false`, terminals from
 * `startKey`/`endKey`). Disconnected pulleys are skipped. Radii + refs baked.
 *
 * `passive` makes it one-way — the node is moved onto its belt target and nothing
 * else: a node nobody but the belt has a say in reads the belt travel, it does not
 * hold it, and driving θ_ref from it would excite the free travel mode of a closed
 * belt at the mercy of the sweep order.
 */

/** Scratch for the pin: the gear slot behind each via (−1 for a terminal), the wrap it
 *  rides, and where the arc-length lands. Grown once, reused every application. */
let pinSlot = new Int32Array(16);
let pinWrap = new Float64Array(16);
const pinAt = belt_at();

export function applyBeltPinConstraint(
  nodes: SimNodes,
  s_: LinkSlots,
  radii: number[],
  directions: boolean[],
  refIndex: number,
  s0: number,
  thetaRef0: number,
  wraps?: number[],
  disconnected?: boolean[],
  closed: boolean = true,
  stiffness: number = 1.0,
  passive: boolean = false,
): number {
  // pos slots: [node, start, end, ...one per pulley] (see link-slots.ts)
  const iNode = s_.pos[0];
  const iStart = s_.pos[1];
  const iEnd = s_.pos[2];
  const gearCount = s_.pos.length - 3;
  if (iNode < 0 || gearCount === 0) return 0;
  const jx = nodes.x[iNode];
  const jy = nodes.y[iNode];

  // Ordered vias, straight into the scalar scratch: for an open belt the two r = 0
  // terminals bracket the still-connected pulleys. `pinSlot[v]` is the via's gear slot,
  // or −1 for a terminal, which owns no pulley to share the normal correction with.
  const capacity = gearCount + 2;
  if (pinSlot.length < capacity) {
    pinSlot = new Int32Array(capacity);
    pinWrap = new Float64Array(capacity);
  }
  const sc = belt_shared_scratch(capacity);
  let n = 0;
  const pushVia = (slot: number, radius: number, ccw: boolean, wrap: number) => {
    sc.cx[n] = nodes.x[slot];
    sc.cy[n] = nodes.y[slot];
    sc.r[n] = radius;
    sc.ccw[n] = ccw ? 1 : 0;
    pinSlot[n] = radius > 0 ? slot : -1;
    pinWrap[n] = wrap;
    n++;
  };
  if (!closed) {
    if (iStart < 0) return 0;
    pushVia(iStart, 0, false, 0);
  }
  for (let i = 0; i < gearCount; i++) {
    if (disconnected?.[i]) continue;
    const slot = s_.pos[3 + i];
    if (slot < 0) return 0;
    pushVia(slot, radii[i], directions[i], wraps?.[i] ?? 0);
  }
  if (!closed) {
    if (iEnd < 0) return 0;
    pushVia(iEnd, 0, false, 0);
  }
  // A closed loop needs ≥2 pulleys; an open path needs ≥1 pulley between its
  // terminals (start + pulley + end). Otherwise there is nothing to ride.
  if (n < (closed ? 2 : 3)) return 0;

  const iRefAngle = s_.ang[0];
  if (iRefAngle < 0) return 0;
  const thetaRef = nodes.angle[iRefAngle];

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  if (Math.abs(rEps) < 1e-9) return 0;

  belt_solve_pairs(sc, n, closed);
  const viaWraps = wraps ? pinWrap : undefined;
  let s = s0 + rEps * (thetaRef - thetaRef0);
  // On an open belt the arc-length is bounded by the belt itself (no wrap-around).
  if (!closed)
    s = Math.max(0, Math.min(belt_total(sc, n, closed, viaWraps).total, s));
  belt_locate(sc, n, closed, s, viaWraps, pinAt);

  // Node relative to its belt target.
  const ex = jx - pinAt.px;
  const ey = jy - pinAt.py;
  const errLen = Math.sqrt(ex * ex + ey * ey);
  const wJ = nodes.w[iNode];

  if (passive) {
    if (wJ !== 0) {
      nodes.x[iNode] = jx - ex * stiffness;
      nodes.y[iNode] = jy - ey * stiffness;
    }
    return errLen;
  }

  const errT = ex * pinAt.tx + ey * pinAt.ty; // tangential (belt-travel) mismatch
  const nx = ex - pinAt.tx * errT; // normal (off-belt) offset
  const ny = ey - pinAt.ty * errT;

  const wTheta = 1; // angle node never anchored
  const totalT = wJ + wTheta;

  // Tangential: share between sliding the node back and advancing the belt.
  let px = jx;
  let py = jy;
  if (wJ !== 0) {
    const shift = errT * (wJ / totalT) * stiffness;
    px -= pinAt.tx * shift;
    py -= pinAt.ty * shift;
  }
  nodes.angle[iRefAngle] =
    thetaRef + (errT * (wTheta / totalT) * stiffness) / rEps;

  // Normal: pull the node back onto the belt, sharing with the pulley(s) bounding the
  // piece at s (terminals own no pulley), so dragging the node off the belt drags those
  // pulleys with it. `viaA === viaB` on an arc, and coincidence fusion can put both on one
  // slot — either way the pulley is counted once.
  const slotA = pinAt.viaA >= 0 ? pinSlot[pinAt.viaA] : -1;
  const slotBraw = pinAt.viaB >= 0 ? pinSlot[pinAt.viaB] : -1;
  const slotB = slotBraw === slotA ? -1 : slotBraw;
  const gearCountN = (slotA >= 0 ? 1 : 0) + (slotB >= 0 ? 1 : 0);
  const wGear =
    gearCountN > 0
      ? ((slotA >= 0 ? nodes.w[slotA] : 0) + (slotB >= 0 ? nodes.w[slotB] : 0)) /
        gearCountN
      : 0;
  const totalN = wJ + wGear;
  if (totalN > 0) {
    if (wJ !== 0) {
      const share = (wJ / totalN) * stiffness;
      px -= nx * share;
      py -= ny * share;
    }
    const gearShare = (wGear / totalN) * stiffness;
    if (slotA >= 0 && nodes.w[slotA] !== 0) {
      nodes.x[slotA] += nx * gearShare;
      nodes.y[slotA] += ny * gearShare;
    }
    if (slotB >= 0 && nodes.w[slotB] !== 0) {
      nodes.x[slotB] += nx * gearShare;
      nodes.y[slotB] += ny * gearShare;
    }
  }
  if (wJ !== 0) {
    nodes.x[iNode] = px;
    nodes.y[iNode] = py;
  }

  return errLen;
}

/**
 * Orientation d'un beam soudé à la jonction d'une courroie (simulation) : son
 * angle suit la tangente de la courroie, angle(driven − pivot) = tangentAngle(s)
 * + offset. Bidirectionnel, pondéré par la courbure locale : sur un arc, tourner
 * le beam avance la courroie (dTangentAngle/dθ_ref = courbure·r_ref·ε_ref) ; sur
 * un segment la tangente est fixe → le beam s'y aligne sans faire voyager.
 */

/** Where the welded beam reads its tangent. Grown once, reused every application. */
const tangentAt = belt_at();

export function applyBeltFollowsTangentConstraint(
  nodes: SimNodes,
  s_: LinkSlots,
  radii: number[],
  directions: boolean[],
  refIndex: number,
  s0: number,
  thetaRef0: number,
  offset: number,
  disconnected?: boolean[],
  stiffness: number = 1.0,
): number {
  // pos slots: [pivot, driven, ...one per pulley] (see link-slots.ts)
  const iPivot = s_.pos[0];
  const iDriven = s_.pos[1];
  const gearCount = s_.pos.length - 2;
  if (iPivot < 0 || iDriven < 0 || gearCount === 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);
  // Reduced loop: skip disconnected pulleys (the tangent is read from the same
  // loop the belt is drawn on). s0/thetaRef0/refIndex are re-baked at disconnect.
  const sc = belt_shared_scratch(gearCount);
  let n = 0;
  for (let i = 0; i < gearCount; i++) {
    if (disconnected?.[i]) continue;
    const slot = s_.pos[2 + i];
    if (slot < 0) return 0;
    sc.cx[n] = nodes.x[slot];
    sc.cy[n] = nodes.y[slot];
    sc.r[n] = radii[i];
    sc.ccw[n] = directions[i] ? 1 : 0;
    n++;
  }
  if (n < 2) return 0; // a 0/1-gear loop is degenerate
  const iAngle = s_.ang[0];
  if (iAngle < 0) return 0;
  const thetaRef = nodes.angle[iAngle];

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  const s = s0 + rEps * (thetaRef - thetaRef0);
  belt_solve_pairs(sc, n, true);
  belt_locate(sc, n, true, s, undefined, tangentAt);
  const curvature = tangentAt.curvature;

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  let C = v.angle() - Math.atan2(tangentAt.ty, tangentAt.tx) - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  const dTdTheta = curvature * rEps; // how the tangent angle moves per θ_ref
  // Symmetric projection over the three concerned DOFs: rotate the beam AND advance
  // θ_ref, split by mobility. The beam turns about its mobility-weighted fixed point
  // c = (w_driven·pivot + w_pivot·driven)/(w_pivot+w_driven), so the less mobile end
  // stays put: an anchored pivot (w_pivot = 0) gives c = pivot (driven swings about
  // it), while a free pivot (a grabbed far end) moves too and BeltPin turns that
  // motion into belt travel.
  const wP = nodes.w[iPivot];
  const wD = nodes.w[iDriven];
  const wBeam = wP + wD; // beam-rotation mobility (0 = both ends anchored)
  const denom = wBeam + dTdTheta * dTdTheta; // θ_ref node weight = 1
  if (denom < 1e-12) return Math.abs(C);

  const dPhi = -C * (wBeam / denom) * stiffness; // beam rotation
  const dTheta = C * (dTdTheta / denom) * stiffness; // belt travel
  if (wBeam > 0 && dPhi !== 0) {
    const c = pivot.mul(wD / wBeam).add(driven.mul(wP / wBeam));
    if (wP !== 0) setPoint(nodes, iPivot, c.add(pivot.sub(c).rotate(dPhi)));
    if (wD !== 0) setPoint(nodes, iDriven, c.add(driven.sub(c).rotate(dPhi)));
  }
  nodes.angle[iAngle] = thetaRef + dTheta;
  return Math.abs(C);
}


/** Engrenages coaxiaux : θ1 − θ2 = offset (même rotation, offset constant). */
export function applyCoaxialAngleConstraint(
  nodes: SimNodes,
  iAngle1: number,
  iAngle2: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iAngle1 < 0 || iAngle2 < 0) return 0;
  const a1 = nodes.angle[iAngle1];
  const a2 = nodes.angle[iAngle2];

  // Les angles ne sont jamais ancrés : correction répartie à parts égales.
  const C = a1 - a2 - offset; // cumulatif : pas de wrap
  nodes.angle[iAngle1] = a1 - 0.5 * C * stiffness;
  nodes.angle[iAngle2] = a2 + 0.5 * C * stiffness;
  return Math.abs(C);
}
