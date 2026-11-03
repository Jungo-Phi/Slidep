/**
 * Which joins are drawn as a continuous weld, and the pieces each weld binds together.
 *
 * A join holding only bars reads best as one bent piece: no disc, the bars running into one another.
 * That only works if every piece it binds is drawn in two passes — all contours first, then all bodies over them — so that no contour shows through a neighbour's body.
 * Pieces merely crossing one another stay in separate groups, so they still read as overlapping.
 */

import type {
  BeamElement,
  DamperElement,
  ID,
  JoinElement,
  MechanicalElement,
  SpringElement,
} from "../../../types/element";

/** What a weld binds: the bars, and the springs and dampers through the stubs they end with. */
export type WeldPiece = BeamElement | SpringElement | DamperElement;

const is_weld_piece = (el: MechanicalElement | undefined): el is WeldPiece =>
  el?.type === "beam" || el?.type === "spring" || el?.type === "damper";

/** A seamless join and the pieces it holds. */
export interface WeldJoint {
  join: JoinElement;
  held: readonly WeldPiece[];
}

/** Pieces drawn together, and the seamless joins binding them. */
export interface WeldGroup {
  /** In drawing order. */
  pieces: readonly WeldPiece[];
  joints: readonly WeldJoint[];
}

export interface WeldGroups {
  /** Joins drawn without their disc. */
  seamless: ReadonlySet<ID>;
  /** The group of every piece a seamless join holds, shared by all its pieces. */
  groups: ReadonlyMap<ID, WeldGroup>;
}

/**
 * `singledOut` names the joins something points at — hover, selection, eraser, analysis — which keep their disc so the joint can be seen and aimed at.
 * `parallelOffsets` excludes the spring/damper pairs drawn off their axis, whose legs are not part of the bar.
 */
export function weld_groups(
  mechanicalElements: readonly MechanicalElement[],
  parallelOffsets: ReadonlyMap<ID, number>,
  singledOut: (id: ID) => boolean,
): WeldGroups {
  const byID = new Map(mechanicalElements.map((el) => [el.id, el]));
  const order = new Map(mechanicalElements.map((el, i) => [el.id, i]));

  // Everything holding each join, read from both sides of the link so a one-sided reference still disqualifies it.
  const holders = new Map<ID, Set<ID>>();
  const hold = (nodeID: ID | undefined, holderID: ID) => {
    if (nodeID === undefined) return;
    let set = holders.get(nodeID);
    if (!set) holders.set(nodeID, (set = new Set()));
    set.add(holderID);
  };
  for (const el of mechanicalElements) {
    if (el.type === "join") for (const id of el.fixedEdgesIDs) hold(el.id, id);
    if ("fixedNodeStartID" in el) {
      hold(el.fixedNodeStartID, el.id);
      hold(el.fixedNodeEndID, el.id);
    }
    if ("fixedNodesBodyIDs" in el)
      for (const id of el.fixedNodesBodyIDs) hold(id, el.id);
  }

  const joints: WeldJoint[] = [];
  for (const el of mechanicalElements) {
    if (el.type !== "join" || singledOut(el.id)) continue;
    const held = [...(holders.get(el.id) ?? [])].map((id) => byID.get(id));
    if (
      held.length >= 2 &&
      held.every(
        (piece): piece is WeldPiece =>
          is_weld_piece(piece) && !parallelOffsets.get(piece.id),
      ) &&
      held.some((piece) => piece.type === "beam")
    )
      joints.push({ join: el, held });
  }
  const seamless = new Set(joints.map((joint) => joint.join.id));

  const parent = new Map<ID, ID>();
  const find = (id: ID): ID => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (const { held } of joints) {
    for (const piece of held)
      if (!parent.has(piece.id)) parent.set(piece.id, piece.id);
    for (const piece of held.slice(1))
      parent.set(find(piece.id), find(held[0].id));
  }

  const byRoot = new Map<ID, { pieces: WeldPiece[]; joints: WeldJoint[] }>();
  const group_of = (id: ID) => {
    const root = find(id);
    let group = byRoot.get(root);
    if (!group) byRoot.set(root, (group = { pieces: [], joints: [] }));
    return group;
  };
  for (const id of parent.keys())
    group_of(id).pieces.push(byID.get(id) as WeldPiece);
  for (const joint of joints) group_of(joint.held[0].id).joints.push(joint);
  const groups = new Map<ID, WeldGroup>();
  for (const group of byRoot.values()) {
    group.pieces.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    for (const piece of group.pieces) groups.set(piece.id, group);
  }
  return { seamless, groups };
}

/** The distance between segments `a0a1` and `b0b1`: zero where they cross. */
export function segments_distance(
  a0: { x: number; y: number },
  a1: { x: number; y: number },
  b0: { x: number; y: number },
  b1: { x: number; y: number },
): number {
  const side = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    r: { x: number; y: number },
  ) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (
    side(a0, a1, b0) * side(a0, a1, b1) < 0 &&
    side(b0, b1, a0) * side(b0, b1, a1) < 0
  )
    return 0;
  const to_segment = (
    p: { x: number; y: number },
    s0: { x: number; y: number },
    s1: { x: number; y: number },
  ) => {
    const dx = s1.x - s0.x;
    const dy = s1.y - s0.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.min(
            Math.max(((p.x - s0.x) * dx + (p.y - s0.y) * dy) / len2, 0),
            1,
          );
    return Math.hypot(p.x - (s0.x + t * dx), p.y - (s0.y + t * dy));
  };
  return Math.min(
    to_segment(a0, b0, b1),
    to_segment(a1, b0, b1),
    to_segment(b0, a0, a1),
    to_segment(b1, a0, a1),
  );
}
