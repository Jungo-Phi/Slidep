import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import type {
  ID,
  MechanicalElement,
  NodeType,
  UnionElement,
} from "../../types/element";
import { get_connection_types, get_connections } from "./connect-actions";

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
const TWO_DIFFERENT = "Une contrainte relie deux éléments différents";

export const BELT_CANNOT_CLOSE =
  "Une courroie sans poulie ne peut pas se refermer";

/**
 * Whether a belt may close into a loop: it must run over at least one pulley,
 * otherwise both ends are simply the same point.
 *
 * Read by `get-hover` rather than by `legality_for_state`, because the target of
 * a closing gesture is the belt's own terminal — a ghost during placement, the
 * opposite end of the belt during a drag — and never an element the rules can be
 * asked about. The cursor bounds keep a pulley-less belt away from its own start
 * (`hover-bounds`), so this is the net rather than the mechanism.
 */
export function belt_can_close(attachedGears: readonly unknown[]): boolean {
  return attachedGears.length > 0;
}

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
 */
export function legality_for_state(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): (candidate: UnionElement) => Legality {
  const byID = new Map<ID, MechanicalElement>(
    mechanicalElements.map((e) => [e.id, e]),
  );
  const dragged = dragged_element_id(state);
  const draggedElement = dragged ? byID.get(dragged) : undefined;
  const alreadyLinked = draggedElement
    ? connected_ids(draggedElement)
    : new Set<ID>();

  const dragging_belt = draggedElement?.type === "belt";

  return (candidate: UnionElement): Legality => {
    // Re-linking a pair changes nothing, and offering it would let a useless
    // target sit in front of a useful one.
    if (alreadyLinked.has(candidate.id))
      return refuse("Ces éléments sont déjà connectés");

    const takeover = takeover_refusal(
      incoming_node_type(state, draggedElement),
      candidate,
    );
    if (takeover) return takeover;

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

      case "MovingBeltBody":
        if (candidate.type === "gear" && candidate.attachedBeltID)
          return refuse("Cet engrenage porte déjà une courroie");
        break;

      case "PlacingBeltEnd":
        if (state.attachedGearsIDs.some(({ id }) => id === candidate.id))
          return refuse("Cet engrenage est déjà sur cette courroie");
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
