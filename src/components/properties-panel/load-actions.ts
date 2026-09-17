import {
  Action,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  LoadFrame,
  MechanicalElement,
  Point2,
} from "../../types";
import {
  frame2world_transform,
  world2frame_transform,
} from "../../utils/load-frame";

/**
 * What editing one load writes, shared by the two panels that offer those edits: the elements tab's own list (`LoadsSection`) and the analysis panel's single-load card (`LoadInspector`).
 * Here rather than in either of them because the two show the same load differently, and only what they write has to stay the same.
 */

/** Build a SetDistributedForce action from partial new values (rest kept). */
export const change_distributed_force = (
  load: DistributedForceElement,
  next: Partial<{
    newDirection: Point2;
    newMagnitudeStart: number;
    newMagnitudeEnd: number;
  }>,
): Action => ({
  type: "ChangeDistributedForce",
  id: load.id,
  newDirection: next.newDirection ?? load.direction,
  oldDirection: load.direction,
  newMagnitudeStart: next.newMagnitudeStart ?? load.magnitudeStart,
  oldMagnitudeStart: load.magnitudeStart,
  newMagnitudeEnd: next.newMagnitudeEnd ?? load.magnitudeEnd,
  oldMagnitudeEnd: load.magnitudeEnd,
});

/**
 * Change a load's frame while preserving its visual direction: re-express the stored vector/direction through the reference edge's current orientation so the arrow doesn't jump — only its behaviour under motion changes.
 */
export const frame_change_actions = (
  load: ForceElement | DistributedForceElement,
  newFrame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Action[] => {
  const actions: Action[] = [
    { type: "SetLoadFrame", id: load.id, newFrame, oldFrame: load.frame },
  ];
  if (load.type === "force") {
    const world = frame2world_transform(
      load.vector,
      load.frame,
      mechanicalElements,
    );
    actions.push({
      type: "ChangeForce",
      id: load.id,
      newVector: world2frame_transform(world, newFrame, mechanicalElements),
      oldVector: load.vector,
    });
  } else {
    const world = frame2world_transform(
      load.direction,
      load.frame,
      mechanicalElements,
    );
    actions.push(
      change_distributed_force(load, {
        newDirection: world2frame_transform(
          world,
          newFrame,
          mechanicalElements,
        ),
      }),
    );
  }
  return actions;
};

/** Finds the edge a load's frame currently refers to, among the candidates
 * offered by the ElementPicker or (if it fell out of them) all elements. */
export const frame_current_edge = (
  frame: LoadFrame,
  candidateEdges: EdgeElement[],
  mechanicalElements: MechanicalElement[],
): EdgeElement | undefined => {
  if (frame === "world") return undefined;
  const edgeID = frame.edgeID;
  return (
    candidateEdges.find((e) => e.id === edgeID) ??
    (mechanicalElements.find((e) => e.id === edgeID && "positionStart" in e) as
      | EdgeElement
      | undefined)
  );
};
