import { Action, LoadElementType } from "../../types";

/**
 * When a solve must run against the mechanism a bundle leaves: `"before"` reads
 * the trigger as a pull against the mechanism as it stood before the bundle
 * (the sketch is not yet part of the constraint graph — a drag has to move
 * something the graph does not know how to place on its own); `"after"` reads
 * the mechanism once the bundle has already been applied, because what the
 * bundle stated (a value, a connection) is now part of the graph the solve
 * reads. `"none"` skips the solve entirely.
 */
export type SolveTiming = "none" | "before" | "after";

type ActionGeometry = {
  solve: SolveTiming;
  /** Whether this action can serve as the trigger the solver pulls against. */
  pulls: boolean;
  /** Whether a continuous gesture repeating this action folds into the previous history entry. */
  coalesces: boolean;
};

const NONE: ActionGeometry = { solve: "none", pulls: false, coalesces: false };
const NONE_COALESCING: ActionGeometry = {
  solve: "none",
  pulls: false,
  coalesces: true,
};
const BEFORE_PULL: ActionGeometry = {
  solve: "before",
  pulls: true,
  coalesces: true,
};
const AFTER: ActionGeometry = { solve: "after", pulls: false, coalesces: false };
const AFTER_PULL: ActionGeometry = {
  solve: "after",
  pulls: true,
  coalesces: false,
};
const AFTER_PULL_COALESCING: ActionGeometry = {
  solve: "after",
  pulls: true,
  coalesces: true,
};

/**
 * What each action type asks of the geometry, keyed by `Action["type"]`.
 *
 * `CreateElement` and `DeleteElement` are the two types whose answer depends on
 * the element they carry rather than on the type alone, so they are not listed
 * here — see `action_geometry` below.
 */
const ACTION_GEOMETRY: Record<
  Exclude<Action["type"], "CreateElement" | "DeleteElement">,
  ActionGeometry
> = {
  UpdateElementName: NONE,
  MoveNode: BEFORE_PULL,
  MoveEdgeStart: BEFORE_PULL,
  MoveEdgeEnd: BEFORE_PULL,
  MoveEdgeBody: BEFORE_PULL,
  MoveElements: BEFORE_PULL,
  MoveConstraint: NONE_COALESCING,
  GroundNode: NONE,
  CloseBelt: AFTER,
  SwitchAttachedGearDirection: NONE,
  ChangeGearRadius: BEFORE_PULL,
  ChangeEdgeLength: BEFORE_PULL,
  ChangeEdgeAngle: BEFORE_PULL,
  ChangeBeltLength: BEFORE_PULL,
  ChangeMass: NONE_COALESCING,
  ChangeStiffness: NONE_COALESCING,
  ChangeDamping: NONE_COALESCING,
  ChangeDimensionEdgeValue: AFTER_PULL_COALESCING,
  ChangeDimensionNodeToNodeValue: AFTER_PULL_COALESCING,
  ChangeDimensionEdgeToNodeValue: AFTER_PULL_COALESCING,
  ChangeDimensionAngleValue: AFTER_PULL_COALESCING,
  ChangeDimensionRadiusValue: AFTER_PULL_COALESCING,
  ChangeDimensionBeltValue: AFTER_PULL_COALESCING,
  // Unlike the other dimension edits, a ratio's first commit never folds into a
  // later one of its own kind — see the creation-fold handled in apply_actions.
  ChangeGearRatioValue: AFTER_PULL,
  ConnectsFixedEdges: AFTER,
  ConnectsRotatingEdges: AFTER,
  ConnectsParentBeam: AFTER,
  ConnectsFixedNodeStart: AFTER,
  ConnectsFixedNodeEnd: AFTER,
  ConnectsFixedNodesBody: AFTER,
  ConnectsParentAxle: AFTER,
  ConnectsMeshedGears: AFTER,
  ConnectsAttachedGears: AFTER,
  ConnectsFixedGears: AFTER,
  ConnectsAttachedBelt: AFTER,
  // Synthesized by apply_actions itself; never part of a bundle handed in.
  UpdatePositionsToValidState: NONE,
  Blank: NONE,
  ChangeForce: NONE_COALESCING,
  ChangeDistributedForce: NONE_COALESCING,
  ChangeMoment: NONE_COALESCING,
  SetLoadFrame: NONE,
  SetProbes: NONE,
  SetShowOverlay: NONE,
  SetMotorConfig: NONE,
};

const LOAD_TYPES: ReadonlySet<LoadElementType> = new Set([
  "force",
  "distributed-force",
  "moment",
]);

/**
 * What a single action asks of the geometry.
 *
 * A load carries no geometric meaning of its own — it rides on the element it
 * targets rather than constraining it — so creating or deleting one asks
 * nothing of the solve, unlike any other element or constraint.
 */
function action_geometry(action: Action): ActionGeometry {
  if (action.type === "CreateElement" || action.type === "DeleteElement")
    return LOAD_TYPES.has(action.element.type as LoadElementType)
      ? NONE
      : AFTER;
  return ACTION_GEOMETRY[action.type];
}

export type BundleGeometry = {
  solve: SolveTiming;
  /** The action the solve answers to, absent when nothing is being pulled. */
  trigger?: Action;
};

/**
 * What a bundle asks of the geometry, read from the actions themselves rather
 * than from a name declared at the call site.
 *
 * At most one action in a bundle ever pulls — a gesture has a single master
 * edit, and the corrections joined to it (fusions, belt closures, anchoring)
 * never do. So when a trigger exists, its own timing settles the bundle's:
 * there is nothing to arbitrate between a pull and the corrections that answer
 * to the state it leaves.
 */
export function bundle_geometry(actions: Action[]): BundleGeometry {
  const trigger = actions.find((a) => action_geometry(a).pulls);
  if (trigger) return { solve: action_geometry(trigger).solve, trigger };
  const solve = actions.some((a) => action_geometry(a).solve === "after")
    ? "after"
    : "none";
  return { solve };
}

/**
 * Whether a bundle continues the previous one rather than starting a new
 * history entry — a drag being one gesture, and so one undo, however many
 * frames it took.
 *
 * A committed value is excluded: typing a number is a decision of its own, and
 * folding it into the drag that preceded it would undo both at once.
 */
export function continues_previous_gesture(actions: Action[]): boolean {
  const first = actions[0];
  if (!first) return false;
  if ("committed" in first && first.committed) return false;
  return action_geometry(first).coalesces;
}
