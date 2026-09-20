import { Action, ID, UnionElement } from "../../types";

/**
 * The three classes an edit can fall into during a simulation.
 *
 * - **observation** (probe configs, overlay visibility, names): affects neither the model nor the snapshots (no recompile, no truncation).
 * - **parameter** : loads, motor speed, the physical values of an element (mass, stiffness, damping, friction, material and profile), gravity/collisions/the floor, takes effect at the current time.
 * The past snapshots stay valid, the future ones are truncated and the motion is recomputed from there.
 * Does NOT leave simulation mode.
 * - **structure** (geometry, dimensions, node grounding, connections): exits to edition, which is why the controls emitting one are greyed out mid-run (see `StructureOnly`, which asks this module rather than deciding for itself).
 */
export const OBSERVATION_ACTIONS: Action["type"][] = [
  "SetProbes",
  "SetShowOverlay",
  "SetBeamStressLens",
  "SetSupportReactions",
  // A name is not a value: nothing the solver reads, and nothing already recorded, depends on one — so a rename mid-run costs neither a recompile nor the instants ahead.
  "UpdateElementName",
  "RenameMaterial",
  "RenameProfile",
  // A yield limit judges a run without taking part in it: stresses are measured against it when shown, never when solved or recorded.
  "ChangeMaterialRe",
];

/**
 * The display settings: which reading the canvas shows, rather than what the mechanism is.
 *
 * A subset of the observation actions, but answering a question of its own — the three classes above tell what a running simulation can absorb, this one tells whether the user edited the mechanism at all.
 * The two do not coincide: renaming an element is an observation action and a genuine edit, whereas picking a stress lens is something a reader carries along, saved so it is found again but never worth marking the mechanism as modified (see `markDirty`).
 * A probe is left out on purpose: placing one is a deliberate act that stays on the canvas, not a way of looking at what is already drawn.
 */
export const DISPLAY_ACTIONS: Action["type"][] = [
  "SetShowOverlay",
  "SetBeamStressLens",
  "SetSupportReactions",
];

export const PARAMETER_ACTIONS: Action["type"][] = [
  "SetMotorConfig",
  "ChangeForce",
  "ChangeDistributedForce",
  "ChangeMoment",
  "SetLoadFrame",
  "SetFloorEnabled",
  "ChangeFloorHeight",
  "ChangeFloorAngle",
  "SetGravity",
  "SetCollisions",
  "ChangeMass",
  "ChangeSurfaceMass",
  "ChangeStiffness",
  "UpdateElementRestLength",
  "ChangeDamping",
  "ChangeRotationalFriction",
  "ChangeSlidingFriction",
  // What a beam is made of and the section it is cut to, whether reached from the beam or from the catalog: the same kind of physical value as its mass.
  // Deleting a catalog entry reassigns the beams holding it in the same bundle, so no model is ever left pointing at a missing one.
  "AssignMaterial",
  "AssignProfile",
  "CreateMaterial",
  "CreateProfile",
  "DeleteMaterial",
  "DeleteProfile",
  "ChangeMaterialE",
  "ChangeMaterialRho",
  "ChangeProfileShape",
];

/** A load's value changing (magnitude, direction…) is the one parameter edit cheap enough to swap into the running model without a full recompile (see `Recorder.setLoads`).
 * A drag can fire this many times a second, unlike every other edit. */
export const LOAD_VALUE_ACTIONS: Action["type"][] = [
  "ChangeForce",
  "ChangeDistributedForce",
  "ChangeMoment",
];

export const is_observation_only_bundle = (actions: Action[]) =>
  actions.length > 0 &&
  actions.every((a) => OBSERVATION_ACTIONS.includes(a.type));

export const is_display_only_bundle = (actions: Action[]) =>
  actions.length > 0 && actions.every((a) => DISPLAY_ACTIONS.includes(a.type));

/** Whether a history entry only ticks `elementID`'s metrics on and off, sealed or not — an undo or redo the canvas metric box on that element stays open through. */
export const is_probes_only_bundle = (actions: Action[], elementID: ID) =>
  actions.some((a) => a.type === "SetProbes") &&
  actions.every(
    (a) =>
      a.type === "Blank" ||
      (a.type === "SetProbes" && a.elementID === elementID),
  );

export const is_load_value_only_bundle = (actions: Action[]) =>
  actions.length > 0 &&
  actions.every((a) => LOAD_VALUE_ACTIONS.includes(a.type));

/** A load creation/deletion is a parameter edit too (a load is an input, not structure); any other Create/Delete is structural. */
const is_load_element = (el: UnionElement) =>
  el.type === "force" ||
  el.type === "moment" ||
  el.type === "distributed-force";

/**
 * Whether one action is a structure edit (the kind a running simulation cannot absorb).
 *
 * `Blank` is an undo-boundary marker, not an edit.
 * Create/Delete is answered from the type alone, without the element it carries: a control names the actions it emits before it has one to hand (see `StructureOnly`), and the only non-structural Create/Delete is a load's.
 */
export const is_structure_action = (a: Action | Action["type"]) => {
  const type = typeof a === "string" ? a : a.type;
  if (type === "Blank") return false;
  if (OBSERVATION_ACTIONS.includes(type) || PARAMETER_ACTIONS.includes(type))
    return false;
  if (
    typeof a !== "string" &&
    (a.type === "CreateElement" || a.type === "DeleteElement")
  )
    return !is_load_element(a.element);
  return true;
};

export const is_structure_bundle = (actions: Action[]) =>
  actions.some(is_structure_action);
