import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import type {
  ID,
  MechanicalElement,
  NodeType,
  UnionElement,
} from "../../types/element";
import { get_connection_types, get_connections } from "./connect-actions";
import {
  belt_can_close,
  belt_placing_pulleys,
  MIN_PULLEYS_TO_CLOSE,
} from "../../utils/belt-rules";

const NODE_TYPES: readonly string[] = [
  "pivot",
  "slider",
  "slidep",
  "join",
  "mass",
  "gear",
];

function is_node_type(type: string): type is NodeType {
  return NODE_TYPES.includes(type);
}

/**
 * Which gestures the interface may offer, stated once.
 *
 * A verdict depends only on the interaction and the mechanism — never on the
 * cursor, the zoom or the drawing order. That is what separates it from picking,
 * which decides *who the user meant* among the things under the cursor and stays
 * in `get-hover`.
 *
 * Three consumers read these rules: hit-testing (to drop illegal targets), the
 * connect operations (to refuse whatever reaches them by another path), and the
 * fuzzer (as its precondition, so it only explores gestures the UI would allow).
 */

/**
 * A refusal is transparent or opaque.
 *
 * Transparent (`blocks: false`): the candidate is not a target, look behind it.
 * That is what keeps a useless target from masking a useful one.
 *
 * Opaque (`blocks: true`): something is here and it cannot be attached to, and
 * what lies under it is not a fallback. Without this, refusing a target silently
 * hands the gesture to whatever is beneath — which is how a ground refused on a
 * mass ends up landing on the edge under it.
 */
export type Legality =
  { allowed: true } | { allowed: false; reason: string; blocks: boolean };

const ALLOWED: Legality = { allowed: true };
const refuse = (reason: string): Legality => ({
  allowed: false,
  reason,
  blocks: false,
});
const block = (reason: string): Legality => ({
  allowed: false,
  reason,
  blocks: true,
});

/**
 * The node type a placement tool is about to drop. A drag names its own, so the
 * table only covers the tools; `incoming_node_type` reads both.
 */
const PLACED_NODE_TYPE: Partial<Record<CanvasState["type"], NodeType>> = {
  PlacingPivot: "pivot",
  PlacingMotor: "pivot",
  PlacingJoin: "join",
  PlacingMass: "mass",
  PlacingSlider: "slider",
};

/**
 * Whether a node of `incomingType` may take over `candidate`.
 *
 * The node taken over is deleted and its gears go with it, unless the survivor
 * can carry them — an axle, or the slider-onto-pivot fusion which becomes one.
 */
function takeover_refusal(
  incomingType: NodeType | undefined,
  candidate: UnionElement,
): Legality | undefined {
  if (!incomingType) return undefined;
  if (!("fixedGearsIDs" in candidate) || candidate.fixedGearsIDs.length === 0)
    return undefined;
  const canCarry =
    incomingType === "pivot" ||
    incomingType === "slidep" ||
    (incomingType === "slider" && candidate.type === "pivot");
  if (canCarry) return undefined;
  return block(
    `Cet axe porte des engrenages qu'un ${incomingType} ne peut pas reprendre`,
  );
}

/**
 * The node this gesture is about to put on the candidate, whether a tool is
 * dropping it or a drag is bringing it. Placing a node onto an existing one and
 * dragging one onto it end in the same takeover, so they answer to one rule.
 */
function incoming_node_type(
  state: CanvasState,
  draggedElement: MechanicalElement | undefined,
): NodeType | undefined {
  const placed = PLACED_NODE_TYPE[state.type];
  if (placed) return placed;
  if (state.type !== "MovingNode" || !draggedElement) return undefined;
  return is_node_type(draggedElement.type) ? draggedElement.type : undefined;
}

const SAME_ENDPOINTS = "Les deux extrémités seraient au même endroit";
const SAME_AXLE_GEARS = "Deux engrenages du même axe ne peuvent pas s'engrener";
const BODY_CANNOT_ATTACH = "Seul le corps d'une barre peut porter un élément";
const TWO_DIFFERENT = "Une contrainte relie deux éléments différents";

export const BELT_CANNOT_CLOSE = `Une courroie doit passer par ${MIN_PULLEYS_TO_CLOSE} poulies pour se refermer`;

export const BELT_GEARS_SAME_AXLE =
  "Un engrenage de cet axe porte déjà cette courroie";

export const BELTS_CANNOT_JOIN =
  "Une courroie ne peut pas en rejoindre une autre";

/** The belts holding a terminal on `id`. */
function belts_pinned_to(
  id: ID,
  mechanicalElements: MechanicalElement[],
): ID[] {
  return mechanicalElements
    .filter(
      (element) =>
        element.type === "belt" &&
        (element.fixedNodeStartID === id || element.fixedNodeEndID === id),
    )
    .map((element) => element.id);
}

/**
 * The belt terminal the gesture is carrying: a dragged belt end, the belts a
 * dragged node holds, or none at all — a belt being routed carries a terminal
 * that belongs to no belt yet, hence the empty list. `undefined` means the
 * gesture brings no terminal, and the rule does not concern it.
 */
function carried_belts(
  state: CanvasState,
  draggedElement: MechanicalElement | undefined,
  mechanicalElements: MechanicalElement[],
): ID[] | undefined {
  switch (state.type) {
    case "PlacingBeltStart":
    case "PlacingBeltEnd":
      return [];
    case "MovingEdgeStartPoint":
    case "MovingEdgeEndPoint":
      return draggedElement?.type === "belt" ? [draggedElement.id] : undefined;
    case "MovingNode": {
      if (!draggedElement) return undefined;
      const held = belts_pinned_to(draggedElement.id, mechanicalElements);
      return held.length > 0 ? held : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The belts whose terminal sits where the gesture is aiming: a belt aimed at by
 * one of its own ends, or every belt the targeted node holds. A belt aimed at by
 * its body carries none — the rule is about ends meeting, and a belt one crosses
 * on the way must stay crossable.
 */
function belts_targeted(
  candidate: UnionElement,
  part: HoveredPart | undefined,
  mechanicalElements: MechanicalElement[],
): ID[] {
  if (candidate.type === "belt")
    return part?.type === "Edge" && part.part !== "body" ? [candidate.id] : [];
  return belts_pinned_to(candidate.id, mechanicalElements);
}

/**
 * The closure threshold is read by `get-hover` rather than by
 * `legality_for_state`, because the target of a closing gesture is the belt's
 * own terminal — a ghost during placement, the opposite end of the belt during a
 * drag — and never an element the rules can be asked about. The cursor bounds
 * keep a short belt away from its own start (`hover-bounds`), so this is the net
 * rather than the mechanism.
 */
export { belt_can_close, belt_placing_pulleys };

/**
 * Whether the gesture started on `candidate`, so both ends of the edge being
 * placed would land on it. A gear rim is not concerned: two ends pinned to the
 * same wheel sit at two different points of it.
 */
function gesture_started_on(
  startHover: HoveredPart,
  candidate: UnionElement,
): boolean {
  return (
    (startHover.type === "Node" || startHover.type === "Edge") &&
    startHover.id === candidate.id
  );
}

/** The canvas states that drag an existing element around. */
function dragged_element_id(state: CanvasState): ID | undefined {
  switch (state.type) {
    case "MovingNode":
    case "MovingEdgeStartPoint":
    case "MovingEdgeEndPoint":
    case "MovingEdgeBody":
    case "ChangingGearRadius":
      return state.elementID;
    default:
      return undefined;
  }
}

/** Every element `element` is currently linked to, whatever the container. */
function connected_ids(element: MechanicalElement): Set<ID> {
  const ids = new Set<ID>();
  for (const connectionType of get_connection_types(element)) {
    for (const id of get_connections(element, connectionType)) ids.add(id);
  }
  return ids;
}

/**
 * The legality check for one interaction.
 *
 * Returned as a closure because the set of elements already linked to the
 * dragged one is computed once: the check itself runs per candidate on every
 * mouse move, so it must stay a lookup.
 *
 * `part` says which part of the candidate is aimed at, for the rules that answer
 * differently for an end and for a body. Callers checking a pair outside a hover
 * pass omit it, and get the verdict that holds whatever the part.
 */
export function legality_for_state(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): (candidate: UnionElement, part?: HoveredPart) => Legality {
  const byID = new Map<ID, MechanicalElement>(
    mechanicalElements.map((e) => [e.id, e]),
  );
  const dragged = dragged_element_id(state);
  const draggedElement = dragged ? byID.get(dragged) : undefined;
  const alreadyLinked = draggedElement
    ? connected_ids(draggedElement)
    : new Set<ID>();

  const dragging_belt = draggedElement?.type === "belt";

  /**
   * Whether one of `beltGearIDs` already sits on `candidate`'s axle. Two gears of
   * one axle turn as one, so a belt over both would run twice on the same body —
   * a self-contradiction whether the belt is open or closed.
   */
  const shares_axle_with_belt = (
    candidate: UnionElement,
    beltGearIDs: readonly ID[],
  ): boolean => {
    if (candidate.type !== "gear") return false;
    return beltGearIDs.some((id) => {
      const gear = byID.get(id);
      return (
        gear?.type === "gear" && gear.parentAxleID === candidate.parentAxleID
      );
    });
  };

  const carried = carried_belts(state, draggedElement, mechanicalElements);

  return (candidate: UnionElement, part?: HoveredPart): Legality => {
    // Re-linking a pair changes nothing, and offering it would let a useless
    // target sit in front of a useful one.
    if (alreadyLinked.has(candidate.id))
      return refuse("Ces éléments sont déjà connectés");

    const takeover = takeover_refusal(
      incoming_node_type(state, draggedElement),
      candidate,
    );
    if (takeover) return takeover;

    // Two belts stay strangers, whatever the route: end on end, or both ends on
    // one node. Opaque, because what lies under the end that refuses is not a
    // fallback — landing there would build the very junction being refused.
    if (
      carried &&
      belts_targeted(candidate, part, mechanicalElements).some(
        (id) => !carried.includes(id),
      )
    )
      return block(BELTS_CANNOT_JOIN);

    switch (state.type) {
      case "PlacingGround":
        if (candidate.type === "mass")
          return block("Une masse ne peut pas être ancrée au sol");
        break;

      case "PlacingGearRadius":
        // An axle cannot carry a gear and mesh with it at the same time.
        if (
          candidate.type === "gear" &&
          state.startHover.type === "Node" &&
          state.startHover.id === candidate.parentAxleID
        )
          return refuse(
            "Un engrenage ne peut pas engrener avec son propre axe",
          );
        break;

      // The pendant of the `PlacingGearRadius` rule, for a gear already on its
      // axle: two gears of one axle turn as one and cannot mesh.
      case "ChangingGearRadius":
        if (
          draggedElement?.type === "gear" &&
          candidate.type === "gear" &&
          candidate.parentAxleID === draggedElement.parentAxleID
        )
          return refuse(SAME_AXLE_GEARS);
        break;

      // Only a beam has a `fixedNodesBodyIDs`, so only a beam body can land on
      // something: any other edge dragged by its body just moves.
      case "MovingEdgeBody":
        if (draggedElement && draggedElement.type !== "beam")
          return refuse(BODY_CANNOT_ATTACH);
        break;

      case "MovingNode": {
        if (!draggedElement) break;

        // A node pinned to the rim of a gear this axle carries would end up on
        // its own axle.
        if ("fixedGearsIDs" in draggedElement) {
          const pinned = draggedElement.fixedGearsIDs.some((gearID) => {
            const gear = byID.get(gearID);
            return (
              gear?.type === "gear" &&
              gear.fixedNodesBodyIDs.includes(candidate.id)
            );
          });
          if (pinned)
            return block(
              "Ce nœud est fixé au périmètre d'un engrenage de cet axe",
            );
        }

        // Moving an axle onto another would mesh two gears sharing an axle.
        if (!("fixedGearsIDs" in draggedElement)) break;
        if (!("fixedGearsIDs" in candidate)) break;
        const meshes = candidate.fixedGearsIDs.some((candidateGearID) => {
          const gear = byID.get(candidateGearID);
          if (gear?.type !== "gear") return false;
          return draggedElement.fixedGearsIDs.some((draggedGearID) =>
            gear.meshedGearsIDs.includes(draggedGearID),
          );
        });
        if (meshes)
          return refuse(
            "Ces axes portent des engrenages déjà engrenés entre eux",
          );
        break;
      }

      // The belt is read from the state rather than through `dragged_element_id`:
      // this drag reshapes a belt's routing, it does not move an element onto
      // another, so it owes nothing to the takeover and already-linked rules.
      case "MovingBeltBody": {
        const belt = byID.get(state.elementID);
        // The pulley the drag is pulling off still reads as attached, so it is
        // excluded from both rules: dropping back onto it undoes the gesture,
        // and its axle siblings are free the moment it leaves.
        const staying =
          belt?.type === "belt"
            ? belt.attachedGearsIDs.filter(
                (_, i) => i !== state.removingGearIndex,
              )
            : [];
        if (staying.some(({ id }) => id === candidate.id))
          return refuse("Cet engrenage est déjà sur cette courroie");
        if (
          shares_axle_with_belt(
            candidate,
            staying.map(({ id }) => id),
          )
        )
          return refuse(BELT_GEARS_SAME_AXLE);
        break;
      }

      case "PlacingBeltEnd":
        if (state.attachedGearsIDs.some(({ id }) => id === candidate.id))
          return refuse("Cet engrenage est déjà sur cette courroie");
        if (
          shares_axle_with_belt(
            candidate,
            state.attachedGearsIDs.map(({ id }) => id),
          )
        )
          return refuse(BELT_GEARS_SAME_AXLE);
        break;

      case "PlacingBeamEnd":
      case "PlacingSpringEnd":
      case "PlacingDamperEnd":
        if (gesture_started_on(state.startHover, candidate))
          return refuse(SAME_ENDPOINTS);
        break;

      // A constraint relates two *different* elements. `DimensionRadius` and
      // `DimensionBelt` are absent on purpose: they hold a single operand, and
      // their second click only drops the label.
      case "DimensionNode":
        if (candidate.id === state.nodeID) return refuse(TWO_DIFFERENT);
        break;

      case "DimensionEdge":
        if (candidate.id === state.edgeID) return refuse(TWO_DIFFERENT);
        break;

      case "HorizontalVerticalConstraintNode":
        if (candidate.id === state.startNodeID) return refuse(TWO_DIFFERENT);
        break;

      case "NormalConstraintEdge":
      case "ParallelConstraintEdge":
      case "EqualConstraintEdge":
        if (candidate.id === state.startEdgeID) return refuse(TWO_DIFFERENT);
        break;

      case "GearRatioConstraintGear":
      case "EqualConstraintGear":
        if (candidate.id === state.startGearID) return refuse(TWO_DIFFERENT);
        break;
    }

    // Belt tools ignore other belts: a belt end is never a target for another.
    if (
      candidate.type === "belt" &&
      (state.type === "PlacingBeltStart" ||
        state.type === "PlacingBeltEnd" ||
        state.type === "MovingBeltBody" ||
        ((state.type === "MovingEdgeStartPoint" ||
          state.type === "MovingEdgeEndPoint") &&
          dragging_belt))
    )
      return refuse("Une courroie ne se connecte pas à une autre courroie");

    return ALLOWED;
  };
}

/** Convenience for callers that check a single pair outside a hover pass. */
export function is_legal_target(
  state: CanvasState,
  candidate: UnionElement,
  mechanicalElements: MechanicalElement[],
): Legality {
  return legality_for_state(state, mechanicalElements)(candidate);
}
