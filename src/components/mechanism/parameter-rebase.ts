import { Action, LoadElement, Mechanism, MechanicalElement } from "../../types";
import type { ParameterSnapshot } from "../../types/runtime-state";

/**
 * What a parameter action sets, as a key two actions share exactly when they set the same value.
 * Creations and deletions have none: they are never overridden by an edit of the entity they bring back.
 */
function parameter_key(action: Action): string | undefined {
  switch (action.type) {
    case "ChangeMass":
    case "ChangeSurfaceMass":
    case "ChangeStiffness":
    case "ChangeDamping":
    case "ChangeSlidingFriction":
    case "ChangeRotationalFriction":
    case "UpdateElementRestLength":
    case "SetMotorConfig":
    case "AssignMaterial":
    case "AssignProfile":
    case "ChangeMaterialE":
    case "ChangeMaterialRho":
    case "ChangeProfileShape":
    case "SetLoadFrame":
      return `${action.type}:${action.id}`;
    case "ChangeForce":
    case "ChangeDistributedForce":
    case "ChangeMoment":
      return `LoadValue:${action.id}`;
    case "SetGravity":
    case "SetCollisions":
    case "SetFloorEnabled":
    case "ChangeFloorHeight":
    case "ChangeFloorAngle":
      return action.type;
    default:
      return undefined;
  }
}

/** Plain-data equality, for values an edit replaces whole (a motor config, a vector, a profile shape). */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function element_rebase(el: MechanicalElement, shown: MechanicalElement): Action[] {
  const actions: Action[] = [];
  const delta = (
    type:
      | "ChangeMass"
      | "ChangeSurfaceMass"
      | "ChangeStiffness"
      | "ChangeDamping"
      | "ChangeSlidingFriction"
      | "ChangeRotationalFriction",
    current: number,
    target: number,
  ) => {
    if (current !== target) actions.push({ type, id: el.id, delta: target - current });
  };
  if ((el.type === "slider" || el.type === "slidep") && shown.type === el.type)
    delta("ChangeSlidingFriction", el.slidingFriction, shown.slidingFriction);
  if ((el.type === "pivot" || el.type === "slidep") && shown.type === el.type)
    delta("ChangeRotationalFriction", el.rotationalFriction, shown.rotationalFriction);
  if (el.type === "pivot" && shown.type === "pivot" && !same(el.motor, shown.motor))
    actions.push({
      type: "SetMotorConfig",
      id: el.id,
      newConfig: shown.motor,
      oldConfig: el.motor,
    });
  if (el.type === "mass" && shown.type === "mass") delta("ChangeMass", el.mass, shown.mass);
  if (el.type === "gear" && shown.type === "gear")
    delta("ChangeSurfaceMass", el.surfaceMass, shown.surfaceMass);
  if (el.type === "beam" && shown.type === "beam") {
    if (el.materialID !== shown.materialID)
      actions.push({
        type: "AssignMaterial",
        id: el.id,
        newMaterialID: shown.materialID,
        oldMaterialID: el.materialID,
      });
    if (el.profileID !== shown.profileID)
      actions.push({
        type: "AssignProfile",
        id: el.id,
        newProfileID: shown.profileID,
        oldProfileID: el.profileID,
      });
  }
  if (el.type === "spring" && shown.type === "spring") {
    delta("ChangeStiffness", el.stiffness, shown.stiffness);
    if (el.restLength !== shown.restLength)
      actions.push({
        type: "UpdateElementRestLength",
        id: el.id,
        newValue: shown.restLength,
        oldValue: el.restLength,
      });
  }
  if (el.type === "damper" && shown.type === "damper")
    delta("ChangeDamping", el.damping, shown.damping);
  return actions;
}

function load_rebase(load: LoadElement, shown: LoadElement): Action[] {
  const actions: Action[] = [];
  if (load.type === "force" && shown.type === "force") {
    if (!same(load.vector, shown.vector))
      actions.push({
        type: "ChangeForce",
        id: load.id,
        newVector: shown.vector,
        oldVector: load.vector,
      });
    if (load.frame !== shown.frame)
      actions.push({
        type: "SetLoadFrame",
        id: load.id,
        newFrame: shown.frame,
        oldFrame: load.frame,
      });
  }
  if (load.type === "distributed-force" && shown.type === "distributed-force") {
    if (
      !same(load.direction, shown.direction) ||
      load.magnitudeStart !== shown.magnitudeStart ||
      load.magnitudeEnd !== shown.magnitudeEnd
    )
      actions.push({
        type: "ChangeDistributedForce",
        id: load.id,
        newDirection: shown.direction,
        oldDirection: load.direction,
        newMagnitudeStart: shown.magnitudeStart,
        oldMagnitudeStart: load.magnitudeStart,
        newMagnitudeEnd: shown.magnitudeEnd,
        oldMagnitudeEnd: load.magnitudeEnd,
      });
    if (load.frame !== shown.frame)
      actions.push({
        type: "SetLoadFrame",
        id: load.id,
        newFrame: shown.frame,
        oldFrame: load.frame,
      });
  }
  if (load.type === "moment" && shown.type === "moment" && load.value !== shown.value)
    actions.push({
      type: "ChangeMoment",
      id: load.id,
      newValue: shown.value,
      oldValue: load.value,
    });
  return actions;
}

/**
 * `actions`, wrapped so that every parameter first returns to its value in `shown` — an edit made at an instant cuts off the edits the recording made after it, as it cuts off the recording itself.
 * What `actions` sets itself is left to `actions`, which the controls build against `stored`.
 * Entries that existed at that instant are recreated ahead of `actions`, which may be editing one of them; those that did not are removed after it.
 * Everything lands in one bundle, so a single undo brings the later edits back.
 */
export function rebased_bundle(
  stored: Mechanism,
  shown: ParameterSnapshot,
  actions: Action[],
): Action[] {
  const creations: Action[] = [];
  const changes: Action[] = [];
  const deletions: Action[] = [];

  const shownElements = new Map(shown.mechanicalElements.map((el) => [el.id, el]));
  for (const el of stored.mechanicalElements) {
    const past = shownElements.get(el.id);
    if (past) changes.push(...element_rebase(el, past));
  }

  const shownLoads = new Map(shown.loads.map((load) => [load.id, load]));
  const storedLoads = new Map(stored.loads.map((load) => [load.id, load]));
  for (const load of shown.loads)
    if (!storedLoads.has(load.id)) creations.push({ type: "CreateElement", element: load });
  for (const load of stored.loads) {
    const past = shownLoads.get(load.id);
    if (past) changes.push(...load_rebase(load, past));
    else deletions.push({ type: "DeleteElement", element: load });
  }

  const shownMaterials = new Map(shown.materials.map((m) => [m.id, m]));
  const storedMaterials = new Map(stored.materials.map((m) => [m.id, m]));
  for (const material of shown.materials)
    if (!storedMaterials.has(material.id)) creations.push({ type: "CreateMaterial", material });
  for (const material of stored.materials) {
    const past = shownMaterials.get(material.id);
    if (!past) {
      deletions.push({ type: "DeleteMaterial", material });
      continue;
    }
    if (material.E !== past.E)
      changes.push({ type: "ChangeMaterialE", id: material.id, delta: past.E - material.E });
    if (material.rho !== past.rho)
      changes.push({ type: "ChangeMaterialRho", id: material.id, delta: past.rho - material.rho });
  }

  const shownProfiles = new Map(shown.profiles.map((p) => [p.id, p]));
  const storedProfiles = new Map(stored.profiles.map((p) => [p.id, p]));
  for (const profile of shown.profiles)
    if (!storedProfiles.has(profile.id)) creations.push({ type: "CreateProfile", profile });
  for (const profile of stored.profiles) {
    const past = shownProfiles.get(profile.id);
    if (!past) deletions.push({ type: "DeleteProfile", profile });
    else if (!same(profile.shape, past.shape))
      changes.push({
        type: "ChangeProfileShape",
        id: profile.id,
        newShape: past.shape,
        oldShape: profile.shape,
      });
  }

  const settings = stored.simulation;
  if (settings.gravity !== shown.gravity)
    changes.push({ type: "SetGravity", enabled: shown.gravity });
  if (settings.collisions !== shown.collisions)
    changes.push({ type: "SetCollisions", enabled: shown.collisions });
  if (settings.floor.enabled !== shown.floor.enabled)
    changes.push({ type: "SetFloorEnabled", enabled: shown.floor.enabled });
  if (settings.floor.height !== shown.floor.height)
    changes.push({
      type: "ChangeFloorHeight",
      newValue: shown.floor.height,
      oldValue: settings.floor.height,
    });
  if (settings.floor.angle !== shown.floor.angle)
    changes.push({
      type: "ChangeFloorAngle",
      newValue: shown.floor.angle,
      oldValue: settings.floor.angle,
    });

  const touched = new Set(actions.map(parameter_key));
  const kept = changes.filter((action) => !touched.has(parameter_key(action)));
  return [...creations, ...kept, ...actions, ...deletions];
}
