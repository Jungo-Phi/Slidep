import type { CanvasState } from "../../types/canvas-state";
import type { Action, ActionBundleType } from "../../types/actions";
import type { HoveredPart } from "../../types/hovered-part";
import {
  BeltElement,
  ConstraintElement,
  GearElement,
  ID,
  JoinElement,
  LoadElement,
  MechanicalElement,
  NodeElement,
  PivotElement,
} from "../../types";
import {
  attach_gear_to_belt,
  connect_elements,
  get_mechanical_element_from_id,
  own_part,
  start_simulation,
} from "../mechanism/connect-actions";
import {
  distributed_force_from_drag,
  force_from_drag,
  moment_from_drag,
} from "./placing-loads";
import { PHYSICS } from "../../constants/rendering-specs";

export type MouseDownResult = {
  actions: Action[];
  actionBundleType?: ActionBundleType;
  newCanvasState?: CanvasState;
};

type PlacingCanvasState = Extract<
  CanvasState,
  {
    type:
      | "PlacingBeamStart"
      | "PlacingBeamEnd"
      | "PlacingSpringStart"
      | "PlacingSpringEnd"
      | "PlacingDamperStart"
      | "PlacingDamperEnd"
      | "PlacingBeltStart"
      | "PlacingBeltEnd"
      | "PlacingMotor"
      | "PlacingPivot"
      | "PlacingSlider"
      | "PlacingJoin"
      | "PlacingMass"
      | "PlacingGearStart"
      | "PlacingGearRadius"
      | "PlacingGround"
      | "PlacingForceStart"
      | "PlacingForceEnd"
      | "PlacingDistributedForce"
      | "PlacingMomentStart"
      | "PlacingMomentEnd"
      | "PlacingProbe";
  }
>;

export function handle_placing_element(
  state: PlacingCanvasState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
): MouseDownResult {
  switch (state.type) {
    case "PlacingBeamStart":
      return {
        actions: [],
        newCanvasState: { type: "PlacingBeamEnd", startHover: hoveredPart },
      };
    case "PlacingSpringStart":
      return {
        actions: [],
        newCanvasState: { type: "PlacingSpringEnd", startHover: hoveredPart },
      };
    case "PlacingDamperStart":
      return {
        actions: [],
        newCanvasState: { type: "PlacingDamperEnd", startHover: hoveredPart },
      };
    case "PlacingBeltStart":
      return {
        actions: [],
        newCanvasState: {
          type: "PlacingBeltEnd",
          startHover: hoveredPart,
          attachedGearsIDs: [],
        },
      };
    case "PlacingGearStart":
      return {
        actions: [],
        newCanvasState: { type: "PlacingGearRadius", startHover: hoveredPart },
      };
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
    case "PlacingBeltEnd":
    case "PlacingPivot":
    case "PlacingMotor":
    case "PlacingSlider":
    case "PlacingJoin":
    case "PlacingMass":
    case "PlacingGearRadius":
      return handle_place_element(
        state,
        hoveredPart,
        mechanicalElements,
        constraintElements,
        loads,
      );

    case "PlacingGround":
      return handle_place_ground(
        hoveredPart,
        mechanicalElements,
        constraintElements,
        loads,
      );

    case "PlacingForceStart":
      if (hoveredPart.type === "Void") return { actions: [] };
      // The body of a beam takes a distributed force; its endpoints (and any
      // node) take a point force — same tool, the hovered part decides. Mirrors
      // the two ghosts drawn for this state in `draw-canvas.ts`.
      if (hoveredPart.type === "Edge" && hoveredPart.part === "body")
        return {
          actions: [],
          newCanvasState: {
            type: "PlacingDistributedForce",
            startHover: hoveredPart,
          },
        };
      return {
        actions: [],
        newCanvasState: { type: "PlacingForceEnd", startHover: hoveredPart },
      };

    case "PlacingForceEnd": {
      const newForce = force_from_drag(
        crypto.randomUUID() as ID,
        state.startHover,
        hoveredPart.position,
        mechanicalElements,
      );
      if (!newForce)
        return { actions: [], newCanvasState: { type: "PlacingForceStart" } };
      const actions: Action[] = [];
      const existingForce = loads.find(
        (l) =>
          l.type === "force" &&
          l.targetID === newForce.targetID &&
          l.anchor === newForce.anchor,
      );
      if (existingForce)
        actions.push({ type: "DeleteElement", element: existingForce });
      actions.push({ type: "CreateElement", element: newForce });
      return {
        actions,
        actionBundleType: "Other",
        newCanvasState: { type: "PlacingForceStart" },
      };
    }

    case "PlacingDistributedForce": {
      const newDF = distributed_force_from_drag(
        crypto.randomUUID() as ID,
        state.startHover,
        hoveredPart.position,
        mechanicalElements,
      );
      if (!newDF) return { actions: [] };
      const actions: Action[] = [];
      const existingDF = loads.find(
        (l) => l.type === "distributed-force" && l.targetID === newDF.targetID,
      );
      if (existingDF)
        actions.push({ type: "DeleteElement", element: existingDF });
      actions.push({ type: "CreateElement", element: newDF });
      return {
        actions,
        actionBundleType: "Other",
        newCanvasState: { type: "PlacingForceStart" },
      };
    }

    case "PlacingMomentStart":
      if (hoveredPart.type !== "Edge" && hoveredPart.type !== "GearTooth")
        return { actions: [] };
      return {
        actions: [],
        newCanvasState: { type: "PlacingMomentEnd", startHover: hoveredPart },
      };

    case "PlacingMomentEnd": {
      const newMoment = moment_from_drag(
        crypto.randomUUID() as ID,
        state.startHover,
        hoveredPart.position,
        mechanicalElements,
      );
      if (!newMoment) return { actions: [] };
      const actions: Action[] = [];
      const existingMoment = loads.find(
        (l) => l.type === "moment" && l.targetID === newMoment.targetID,
      );
      if (existingMoment)
        actions.push({ type: "DeleteElement", element: existingMoment });
      actions.push({ type: "CreateElement", element: newMoment });
      return {
        actions,
        actionBundleType: "Other",
        newCanvasState: { type: "PlacingMomentStart" },
      };
    }

    case "PlacingProbe":
      if (hoveredPart.type === "Void" || hoveredPart.type === "Constraint")
        return { actions: [] };
      // Open the metric selector popover anchored on the clicked element.
      return {
        actions: [],
        newCanvasState: {
          type: "PlacingProbeMetrics",
          elementID: hoveredPart.id,
          position: hoveredPart.position,
        },
      };
  }
}

type PlacingElementGroupState = Extract<
  CanvasState,
  {
    type:
      | "PlacingBeamEnd"
      | "PlacingSpringEnd"
      | "PlacingDamperEnd"
      | "PlacingBeltEnd"
      | "PlacingPivot"
      | "PlacingMotor"
      | "PlacingSlider"
      | "PlacingJoin"
      | "PlacingMass"
      | "PlacingGearRadius";
  }
>;

function handle_place_element(
  state: PlacingElementGroupState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
): MouseDownResult {
  // Toggle motor on an existing pivot node
  if (state.type === "PlacingMotor" && hoveredPart.type === "Node") {
    const node = get_mechanical_element_from_id(
      hoveredPart.id,
      mechanicalElements,
    );
    if (node.type === "pivot") {
      const oldConfig = node.motor;
      const newConfig = oldConfig
        ? undefined
        : { speed: PHYSICS.DEFAULT_MOTOR_SPEED };
      const actions: Action[] = [
        { type: "SetMotorConfig", id: node.id, newConfig, oldConfig },
      ];
      if (!node.isGrounded)
        actions.push({ type: "GroundNode", id: node.id, grounded: true });
      return { actions, actionBundleType: "Other" };
    }
  }

  // Add a gear to the belt route being defined
  if (state.type === "PlacingBeltEnd" && hoveredPart.type === "GearTooth") {
    const newAttachedGearsIDs = [...state.attachedGearsIDs];
    if (
      state.startHover.type === "GearTooth" &&
      state.attachedGearsIDs.length === 0 &&
      hoveredPart.id !== state.startHover.id
    ) {
      const hoveredGear = get_mechanical_element_from_id(
        state.startHover.id,
        mechanicalElements,
      ) as GearElement;
      const direction =
        hoveredGear.position
          .sub(state.startHover.position)
          .perp()
          .dot(hoveredPart.position.sub(hoveredGear.position)) > 0;
      newAttachedGearsIDs.push({ id: hoveredGear.id, direction });
    }
    const hoveredGear = get_mechanical_element_from_id(
      hoveredPart.id,
      mechanicalElements,
    ) as GearElement;
    const direction =
      hoveredGear.position
        .sub(
          state.attachedGearsIDs.length > 0
            ? (
                get_mechanical_element_from_id(
                  state.attachedGearsIDs.slice(-1)[0].id,
                  mechanicalElements,
                ) as GearElement
              ).position
            : state.startHover.position,
        )
        .perp()
        .dot(hoveredPart.position.sub(hoveredGear.position)) > 0;

    newAttachedGearsIDs.push({ id: hoveredGear.id, direction });
    return {
      actions: [],
      newCanvasState: {
        type: "PlacingBeltEnd",
        startHover: state.startHover,
        attachedGearsIDs: newAttachedGearsIDs,
      },
    };
  }

  // Create a pivot + gear pair atomically
  if (state.type === "PlacingGearRadius") {
    const pivotId = crypto.randomUUID() as ID;
    const gearId = crypto.randomUUID() as ID;
    const newPivot: PivotElement = {
      type: "pivot",
      id: pivotId,
      probes: [],
      overlays: {},
      position: state.startHover.position,
      isGrounded: false,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [gearId],
    };
    const newGear: GearElement = {
      type: "gear",
      id: gearId,
      probes: [],
      overlays: {},
      position: state.startHover.position,
      angle: 0,
      radius: state.startHover.position.distance_to(hoveredPart.position),
      parentAxleID: pivotId,
      fixedNodesBodyIDs: [],
      meshedGearsIDs: [],
      attachedBeltID: undefined,
    };
    const sim = start_simulation(mechanicalElements, constraintElements, loads);
    sim.step([
      { type: "CreateElement", element: newPivot },
      { type: "CreateElement", element: newGear },
    ]);
    sim.step(
      connect_elements(
        state.startHover,
        newPivot,
        own_part(pivotId, "node", state.startHover),
        sim.mechanicalElements,
        sim.constraintElements,
        sim.loads,
      ),
    );
    // The axle may have taken over the node it landed on, which is then gone:
    // the rim can only be pinned to what the first step left standing.
    if (sim.holds(hoveredPart))
      sim.step(
        connect_elements(
          hoveredPart,
          newGear,
          own_part(gearId, "gear", hoveredPart),
          sim.mechanicalElements,
          sim.constraintElements,
          sim.loads,
        ),
      );
    if (hoveredPart.type === "BeltBody" && sim.holds(hoveredPart)) {
      const belt = get_mechanical_element_from_id(
        hoveredPart.id,
        sim.mechanicalElements,
      ) as BeltElement;
      sim.step(
        attach_gear_to_belt(
          gearId,
          state.startHover.position,
          belt,
          hoveredPart.section,
          sim.mechanicalElements,
          "gear-onto-belt",
        ),
      );
    }
    const actions = sim.actions;
    return {
      actions,
      actionBundleType: "Other",
      newCanvasState: { type: "PlacingGearStart" },
    };
  }

  // General element creation
  const newElementId = crypto.randomUUID() as ID;
  let newElement: MechanicalElement;
  switch (state.type) {
    case "PlacingBeamEnd":
      newElement = {
        type: "beam",
        id: newElementId,
        probes: [],
        overlays: {},
        positionStart: state.startHover.position,
        positionEnd: hoveredPart.position,
        fixedNodeStartID: undefined,
        fixedNodeEndID: undefined,
        fixedNodesBodyIDs: [],
      };
      break;
    case "PlacingSpringEnd":
      newElement = {
        type: "spring",
        id: newElementId,
        probes: [],
        overlays: {},
        positionStart: state.startHover.position,
        positionEnd: hoveredPart.position,
        fixedNodeStartID: undefined,
        fixedNodeEndID: undefined,
        stiffness: 1,
      };
      break;
    case "PlacingDamperEnd":
      newElement = {
        type: "damper",
        id: newElementId,
        probes: [],
        overlays: {},
        positionStart: state.startHover.position,
        positionEnd: hoveredPart.position,
        fixedNodeStartID: undefined,
        fixedNodeEndID: undefined,
        damping: 1,
      };
      break;
    case "PlacingBeltEnd":
      newElement = {
        type: "belt",
        id: newElementId,
        probes: [],
        overlays: {},
        positionStart: state.startHover.position,
        positionEnd: hoveredPart.position,
        fixedNodeStartID: undefined,
        fixedNodeEndID: undefined,
        attachedGearsIDs: [],
        tight: false,
      };
      break;
    case "PlacingPivot":
    case "PlacingMotor":
      newElement = {
        type: "pivot",
        id: newElementId,
        probes: [],
        overlays: {},
        position: hoveredPart.position,
        isGrounded: state.type === "PlacingMotor",
        rotatingEdgesIDs: [],
        fixedGearsIDs: [],
        motor:
          state.type === "PlacingMotor"
            ? { speed: PHYSICS.DEFAULT_MOTOR_SPEED }
            : undefined,
      };
      break;
    case "PlacingSlider":
      newElement = {
        type: "slider",
        id: newElementId,
        probes: [],
        overlays: {},
        position: hoveredPart.position,
        isGrounded: false,
        parentBeamID: undefined,
        fixedEdgesIDs: [],
      };
      break;
    case "PlacingJoin":
      newElement = {
        type: "join",
        id: newElementId,
        probes: [],
        overlays: {},
        position: hoveredPart.position,
        isGrounded: false,
        fixedEdgesIDs: [],
      };
      break;
    case "PlacingMass":
      newElement = {
        type: "mass",
        id: newElementId,
        probes: [],
        overlays: {},
        position: hoveredPart.position,
        isGrounded: false,
        fixedEdgesIDs: [],
        mass: 1,
      };
      break;
  }

  const sim = start_simulation(mechanicalElements, constraintElements, loads);
  sim.step([{ type: "CreateElement", element: newElement }]);

  if (
    "startHover" in state &&
    "positionStart" in newElement &&
    !(
      state.type === "PlacingBeltEnd" &&
      hoveredPart.type === "Edge" &&
      hoveredPart.id === "----"
    )
  ) {
    sim.step(
      connect_elements(
        state.startHover,
        newElement,
        own_part(newElement.id, "start", state.startHover),
        sim.mechanicalElements,
        sim.constraintElements,
        sim.loads,
      ),
    );
  }

  // Attaching the start may have taken over the node the end lands on, leaving
  // nothing here to attach to.
  if (sim.holds(hoveredPart) || hoveredPart.type === "Void")
    sim.step(
      connect_elements(
        hoveredPart,
        newElement,
        own_part(
          newElement.id,
          "position" in newElement ? "node" : "end",
          hoveredPart,
        ),
        sim.mechanicalElements,
        sim.constraintElements,
        sim.loads,
      ),
    );

  if (state.type === "PlacingBeltEnd") {
    for (let i = 0; i < state.attachedGearsIDs.length; i++) {
      sim.step([
        {
          type: "ConnectsAttachedGears",
          disconnect: false,
          elementID: newElementId,
          connectID: state.attachedGearsIDs[i].id,
          index: i,
          direction: state.attachedGearsIDs[i].direction,
        },
        {
          type: "ConnectsAttachedBelt",
          disconnect: false,
          elementID: state.attachedGearsIDs[i].id,
          connectID: newElementId,
        },
      ]);
    }
  }

  const actions = sim.actions;

  let newCanvasState: CanvasState | undefined;
  switch (state.type) {
    case "PlacingBeamEnd":
      newCanvasState = { type: "PlacingBeamStart" };
      break;
    case "PlacingSpringEnd":
      newCanvasState = { type: "PlacingSpringStart" };
      break;
    case "PlacingDamperEnd":
      newCanvasState = { type: "PlacingDamperStart" };
      break;
    case "PlacingBeltEnd":
      newCanvasState = { type: "PlacingBeltStart" };
      break;
  }

  // If placing the end closed the belt (landed on its start → connect_elements
  // created a join + TightenBelt), the geometric solver must run so BeltJunction
  // snaps the join onto the loop — like any TightenBelt path, not "Other".
  const bundle: ActionBundleType = actions.some((a) => a.type === "TightenBelt")
    ? "Connects"
    : "Other";
  return { actions, actionBundleType: bundle, newCanvasState };
}

function handle_place_ground(
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
): MouseDownResult {
  switch (hoveredPart.type) {
    case "Void": {
      const newJoin: JoinElement = {
        type: "join",
        id: crypto.randomUUID() as ID,
        probes: [],
        overlays: {},
        fixedEdgesIDs: [],
        position: hoveredPart.position,
        isGrounded: true,
      };
      return {
        actions: [{ type: "CreateElement", element: newJoin }],
        actionBundleType: "Other",
      };
    }
    case "Node":
      return {
        actions: [
          {
            type: "GroundNode",
            id: hoveredPart.id,
            grounded: !(
              get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as NodeElement
            ).isGrounded,
          },
        ],
        actionBundleType: "Other",
      };
    // A gear rim anchors the same way an edge does: the ground is a grounded
    // join pinned to it.
    case "Edge":
    case "GearTooth": {
      const newJoin: JoinElement = {
        type: "join",
        id: crypto.randomUUID() as ID,
        probes: [],
        overlays: {},
        fixedEdgesIDs: [],
        position: hoveredPart.position,
        isGrounded: true,
      };
      return {
        actions: [
          { type: "CreateElement", element: newJoin },
          ...connect_elements(
            hoveredPart,
            newJoin,
            own_part(newJoin.id, "node", hoveredPart),
            mechanicalElements,
            constraintElements,
            loads,
          ),
        ],
        actionBundleType: "Other",
      };
    }
    default:
      return { actions: [] };
  }
}
