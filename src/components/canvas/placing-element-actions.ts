import type { CanvasState } from "../../types/canvas-state";
import type { Action, ActionBundleType } from "../../types/actions";
import type { HoveredPart } from "../../types/hovered-part";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  ForceElement,
  GearElement,
  ID,
  JoinElement,
  LoadElement,
  MechanicalElement,
  MomentElement,
  NodeElement,
  PivotElement,
} from "../../types";
import {
  connect_elements,
  connect_gear_and_belt,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import { is_on_left_side_of_belt } from "../../utils";
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
      | "PlacingDistributedForceStart"
      | "PlacingDistributedForceEnd"
      | "PlacingMoment"
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
    case "PlacingForceStart":
      if (hoveredPart.type === "Void")
        return {
          actions: [],
          newCanvasState: state,
        };
      return {
        actions: [],
        newCanvasState: { type: "PlacingForceEnd", startHover: hoveredPart },
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

    case "PlacingForceEnd": {
      const anchor =
        state.startHover.type === "Edge" && state.startHover.part !== "body"
          ? state.startHover.part
          : undefined;
      if (state.startHover.type === "Void")
        return { actions: [], newCanvasState: { type: "PlacingForceStart" } };
      const newForce: ForceElement = {
        type: "force",
        id: crypto.randomUUID() as ID,
        targetID: state.startHover.id,
        anchor,
        vector: hoveredPart.position.sub(state.startHover.position),
      };
      const actions: Action[] = [];
      const existingForce = loads.find(
        (l) =>
          l.type === "force" &&
          l.targetID === newForce.targetID &&
          l.anchor === anchor,
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

    case "PlacingMoment": {
      if (hoveredPart.type !== "Edge" && hoveredPart.type !== "GearTooth")
        return { actions: [] };
      const newMoment: MomentElement = {
        type: "moment",
        id: crypto.randomUUID() as ID,
        targetID: hoveredPart.id,
        value: 1,
        clockwise: true,
      };
      const actions: Action[] = [];
      const existingMoment = loads.find(
        (l) => l.type === "moment" && l.targetID === newMoment.targetID,
      );
      if (existingMoment)
        actions.push({ type: "DeleteElement", element: existingMoment });
      actions.push({ type: "CreateElement", element: newMoment });
      return { actions, actionBundleType: "Other" };
    }

    case "PlacingDistributedForceStart":
      if (hoveredPart.type !== "Edge") return { actions: [] };
      return {
        actions: [],
        newCanvasState: {
          type: "PlacingDistributedForceEnd",
          startHover: hoveredPart,
        },
      };

    case "PlacingDistributedForceEnd": {
      if (state.startHover.type !== "Edge") return { actions: [] };
      const beam = get_mechanical_element_from_id(
        state.startHover.id,
        mechanicalElements,
      ) as BeamElement;
      const delta = hoveredPart.position.sub(
        beam.positionStart.lerp(beam.positionEnd, 0.5),
      );
      const beamID = state.startHover.id;
      const actions: Action[] = [];
      const existingDF = loads.find(
        (l) => l.type === "distributed-force" && l.beamID === beamID,
      );
      if (existingDF)
        actions.push({ type: "DeleteElement", element: existingDF });
      actions.push({
        type: "CreateElement",
        element: {
          type: "distributed-force",
          id: crypto.randomUUID() as ID,
          beamID,
          vectorStart: delta,
          vectorEnd: delta,
        },
      });
      return {
        actions,
        actionBundleType: "Other",
        newCanvasState: { type: "PlacingDistributedForceStart" },
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
    return {
      actions: [],
      newCanvasState: {
        type: "PlacingBeltEnd",
        startHover: state.startHover,
        attachedGearsIDs: [
          ...state.attachedGearsIDs,
          { id: hoveredPart.id, direction },
        ],
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
      position: state.startHover.position,
      isGrounded: false,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [gearId],
    };
    const newGear: GearElement = {
      type: "gear",
      id: gearId,
      position: state.startHover.position,
      angle: 0,
      radius: state.startHover.position.distance_to(hoveredPart.position),
      parentAxleID: pivotId,
      fixedNodesBodyIDs: [],
      meshedGearsIDs: [],
      attachedBeltID: undefined,
    };
    const actions: Action[] = [
      { type: "CreateElement", element: newPivot },
      { type: "CreateElement", element: newGear },
      ...connect_elements(
        state.startHover,
        newPivot,
        {
          type: "Node",
          position: newPivot.position,
          id: pivotId,
          deleting: false,
          beamBodyHover: false,
        },
        mechanicalElements,
        constraintElements,
        loads,
      ),
      ...connect_elements(
        hoveredPart,
        newGear,
        {
          type: "GearTooth",
          position: hoveredPart.position,
          id: gearId,
          deleting: false,
        },
        mechanicalElements,
        constraintElements,
        loads,
      ),
    ];
    if (hoveredPart.type === "BeltBody") {
      const belt = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as BeltElement;
      actions.push(
        ...connect_gear_and_belt(
          gearId,
          hoveredPart.id,
          hoveredPart.section,
          is_on_left_side_of_belt(
            state.startHover.position,
            belt,
            hoveredPart.section,
            mechanicalElements,
          ),
        ),
      );
    }
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
        position: hoveredPart.position,
        isGrounded: false,
        fixedEdgesIDs: [],
      };
      break;
    case "PlacingMass":
      newElement = {
        type: "mass",
        id: newElementId,
        position: hoveredPart.position,
        isGrounded: false,
        fixedEdgesIDs: [],
        mass: 1,
      };
      break;
  }

  const actions: Action[] = [{ type: "CreateElement", element: newElement }];

  if ("startHover" in state && "positionStart" in newElement) {
    actions.push(
      ...connect_elements(
        state.startHover,
        newElement,
        {
          type: "Edge",
          position: newElement.positionStart,
          id: newElement.id,
          deleting: false,
          part: "start",
        },
        mechanicalElements,
        constraintElements,
        loads,
      ),
    );
  }

  let elementPart: HoveredPart;
  if ("position" in newElement) {
    elementPart = {
      type: "Node",
      position: hoveredPart.position,
      id: newElement.id,
      deleting: false,
      beamBodyHover: false,
    };
  } else {
    elementPart = {
      type: "Edge",
      position: hoveredPart.position,
      id: newElement.id,
      deleting: false,
      part:
        hoveredPart.type === "Node" && hoveredPart.beamBodyHover
          ? "body"
          : "end",
    };
  }
  actions.push(
    ...connect_elements(
      hoveredPart,
      newElement,
      elementPart,
      mechanicalElements,
      constraintElements,
      loads,
    ),
  );

  if (state.type === "PlacingBeltEnd") {
    for (let i = 0; i < state.attachedGearsIDs.length; i++) {
      actions.push(
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
      );
    }
  }

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

  return { actions, actionBundleType: "Other", newCanvasState };
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
        fixedEdgesIDs: [],
        position: hoveredPart.position,
        isGrounded: true,
        id: crypto.randomUUID() as ID,
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
    case "Edge": {
      const newJoin: JoinElement = {
        type: "join",
        fixedEdgesIDs: [],
        position: hoveredPart.position,
        isGrounded: true,
        id: crypto.randomUUID() as ID,
      };
      return {
        actions: [
          { type: "CreateElement", element: newJoin },
          ...connect_elements(
            hoveredPart,
            newJoin,
            {
              type: "Node",
              position: hoveredPart.position,
              id: newJoin.id,
              deleting: false,
              beamBodyHover: false,
            },
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
