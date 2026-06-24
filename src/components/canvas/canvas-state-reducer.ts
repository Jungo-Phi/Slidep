import { Point2, ZERO } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import { get_hovered_elements_by_rect } from "./get-hover";
import { Action, ActionBundleType, CanvasEvent } from "../../types/actions";
import { HoveredPart } from "../../types/hovered-part";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  EdgeElement,
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
  connect_gears,
  delete_element,
  delete_elements,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import {
  is_on_left_side_of_belt,
  resolve_angle_constraint_quadrant,
} from "../../utils";
import { DIM } from "../../constants/rendering-specs";

export function canvasStateReducer(
  state: CanvasState,
  hoveredPart: HoveredPart,
  oldPosition: Point2,
  mouseButtonDown: "none" | "left" | "right",
  event: CanvasEvent,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  setCanvasState: (state: CanvasState) => void,
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void,
  undoMechanism: () => void,
  redoMechanism: () => void,
  onMouseUpHandler: () => void,
  loads: LoadElement[] = [],
) {
  let actions: Action[] = [];
  let actionBundleType: ActionBundleType | undefined = undefined;
  switch (event.type) {
    case "MouseLeftButtonDown":
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "EditingConstraint":
          // Logique pour la sélection multiple avec Shift
          if (state.type === "SelectedElement" && event.shiftKey) {
            if (hoveredPart.type === "Void") {
              setCanvasState({
                type: "SelectingMultiple",
                startPos: hoveredPart.position,
                elementIDs: [state.elementID],
                hoveredElementIDs: [],
              });
            } else if (hoveredPart.id === state.elementID) {
              // Clic sur l'élément déjà sélectionné
              setCanvasState({ type: "Selecting" });
            } else {
              // Clic sur un nouvel élément
              setCanvasState({
                type: "SelectedMultiple",
                elementIDs: [state.elementID, hoveredPart.id],
              });
            }
            break;
          }
          if (hoveredPart.type === "Void") {
            setCanvasState({
              type: "SelectingMultiple",
              startPos: hoveredPart.position,
              elementIDs: [],
              hoveredElementIDs: [],
            });
            break;
          }
          if (hoveredPart.type === "Load") {
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
            });
            break;
          }
          if (hoveredPart.type === "ForceTip") {
            const load = loads.find(
              (l) => l.id === hoveredPart.id && l.type === "force",
            );
            if (load && load.type === "force") {
              setCanvasState({
                type: "MovingForceTip",
                loadID: load.id,
                startPos: hoveredPart.position,
                oldVector: load.vector,
              });
              break;
            }
          }
          if (hoveredPart.type === "DistributedForceTip") {
            const load = loads.find(
              (l) => l.id === hoveredPart.id && l.type === "distributed-force",
            );
            if (load && load.type === "distributed-force") {
              const oldVector =
                hoveredPart.end === "start" ? load.vectorStart : load.vectorEnd;
              setCanvasState({
                type: "MovingDistributedForceTip",
                loadID: load.id,
                end: hoveredPart.end,
                startPos: hoveredPart.position,
                oldVector,
              });
              break;
            }
          }
          const constraint = constraintElements.find(
            (element) => element.id === hoveredPart.id,
          );
          if (constraint && "value" in constraint) break;
          setCanvasState({
            type: "SelectedElement",
            elementID: hoveredPart.id,
          });
          break;
        case "SelectedMultiple":
          if (hoveredPart.type === "Void") {
            if (event.shiftKey) {
              setCanvasState({
                type: "SelectingMultiple",
                startPos: hoveredPart.position,
                elementIDs: state.elementIDs,
                hoveredElementIDs: [],
              });
              break;
            } else {
              setCanvasState({
                type: "SelectingMultiple",
                startPos: hoveredPart.position,
                elementIDs: [],
                hoveredElementIDs: [],
              });
              break;
            }
          } else if (event.shiftKey) {
            // Logique pour la sélection multiple avec Shift
            if (state.elementIDs.includes(hoveredPart.id)) {
              const newElementsIds = state.elementIDs.filter(
                (elementId: ID) => elementId !== hoveredPart.id,
              );
              if (newElementsIds.length === 1) {
                const element = mechanicalElements.find(
                  (e) => e.id === newElementsIds[0],
                );
                if (element) {
                  setCanvasState({
                    type: "SelectedElement",
                    elementID: element.id,
                  });
                  break;
                }
              } else {
                setCanvasState({
                  type: "SelectedMultiple",
                  elementIDs: newElementsIds,
                });
                break;
              }
            } else {
              setCanvasState({
                type: "SelectedMultiple",
                elementIDs: [...state.elementIDs, hoveredPart.id],
              });
              break;
            }
          } else if (state.elementIDs.includes(hoveredPart.id)) {
            setCanvasState({
              type: "MovingSelectionMultiple",
              elementIDs: state.elementIDs,
              delta: ZERO,
            });
          } else {
            // Click on element not in selection without Shift → select only that element
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
            });
          }
          break;
        case "Erasing":
          if (hoveredPart.type === "Void") {
            setCanvasState({
              type: "ErasingMultiple",
              startPos: hoveredPart.position,
              hoveredElementIDs: [],
            });
            break;
          }
          actionBundleType = "Other";
          actions.push(
            ...delete_element(
              hoveredPart.id,
              mechanicalElements,
              constraintElements,
            ),
          );
          setCanvasState({ type: "Erasing" });
          break;
        case "PlacingBeamStart":
          setCanvasState({ type: "PlacingBeamEnd", startHover: hoveredPart });
          break;
        case "PlacingSpringStart":
          setCanvasState({ type: "PlacingSpringEnd", startHover: hoveredPart });
          break;
        case "PlacingDamperStart":
          setCanvasState({ type: "PlacingDamperEnd", startHover: hoveredPart });
          break;
        case "PlacingBeltStart":
          setCanvasState({
            type: "PlacingBeltEnd",
            startHover: hoveredPart,
            attachedGearsIDs: [],
          });
          break;
        case "PlacingGearStart":
          setCanvasState({
            type: "PlacingGearRadius",
            startHover: hoveredPart,
          });
          break;
        case "PlacingForceStart":
          setCanvasState({ type: "PlacingForceEnd", startHover: hoveredPart });
          break;
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
          if (state.type === "PlacingMotor" && hoveredPart.type === "Node") {
            const node = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            );
            if (node.type === "pivot") {
              const oldConfig = node.motor;
              const newConfig = oldConfig ? undefined : { speed: 1 };
              actionBundleType = "Other";
              actions.push({
                type: "SetMotorConfig",
                id: node.id,
                newConfig,
                oldConfig,
              });
              if (node.isGrounded) break;
              actions.push({
                type: "GroundNode",
                id: node.id,
                grounded: true,
              });
              break;
            }
          }
          if (
            state.type === "PlacingBeltEnd" &&
            hoveredPart.type === "GearTooth"
          ) {
            // Placement de courroie sur un engrenage ajoute l'engrenage à `meshedGearIds` et `meshedGearDirections`
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
            setCanvasState({
              type: "PlacingBeltEnd",
              startHover: state.startHover,
              attachedGearsIDs: [
                ...state.attachedGearsIDs,
                { id: hoveredPart.id, direction },
              ],
            });
            break;
          }
          // PlacingGearRadius: atomically create a pivot + gear pair
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
              radius: state.startHover.position.distance_to(
                hoveredPart.position,
              ),
              parentAxleID: pivotId,
              fixedEdgesIDs: [],
              meshedGearsIDs: [],
              attachedBeltID: undefined,
            };
            actionBundleType = "Other";
            actions.push(
              { type: "CreateElement", element: newPivot },
              { type: "CreateElement", element: newGear },
            );
            actions.push(
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
            );
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
            } else if (hoveredPart.type === "GearTooth") {
              actions.push(...connect_gears(gearId, hoveredPart.id));
            }
            setCanvasState({ type: "PlacingGearStart" });
            break;
          }
          let newElement: MechanicalElement;
          const newElementId = crypto.randomUUID();
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
                motor: state.type === "PlacingMotor" ? { speed: 1 } : undefined,
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
          actionBundleType = "Other";
          actions.push({
            type: "CreateElement",
            element: newElement,
          });
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
          switch (state.type) {
            case "PlacingBeamEnd":
              setCanvasState({ type: "PlacingBeamStart" });
              break;
            case "PlacingSpringEnd":
              setCanvasState({ type: "PlacingSpringStart" });
              break;
            case "PlacingDamperEnd":
              setCanvasState({ type: "PlacingDamperStart" });
              break;
            case "PlacingBeltEnd":
              setCanvasState({ type: "PlacingBeltStart" });
              break;
          }
          break;
        case "PlacingGround":
          let newJoin: JoinElement;
          switch (hoveredPart.type) {
            case "Void":
              newJoin = {
                type: "join",
                fixedEdgesIDs: [],
                position: hoveredPart.position,
                isGrounded: true,
                id: crypto.randomUUID(),
              };
              actionBundleType = "Other";
              actions.push({ type: "CreateElement", element: newJoin });
              break;
            case "Node":
              actionBundleType = "Other";
              actions.push({
                type: "GroundNode",
                id: hoveredPart.id,
                grounded: !(
                  get_mechanical_element_from_id(
                    hoveredPart.id,
                    mechanicalElements,
                  ) as NodeElement
                ).isGrounded,
              });
              break;
            case "Edge":
              newJoin = {
                type: "join",
                fixedEdgesIDs: [],
                position: hoveredPart.position,
                isGrounded: true,
                id: crypto.randomUUID(),
              };
              actionBundleType = "Other";
              actions.push({ type: "CreateElement", element: newJoin });
              const connect_actions = connect_elements(
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
              );
              actions.push(...connect_actions);
              break;
          }
          break;
        case "PlacingForceEnd":
          if (state.startHover.type !== "Void") {
            const anchor =
              state.startHover.type === "Edge" &&
              state.startHover.part !== "body"
                ? state.startHover.part
                : undefined;
            const newForce: ForceElement = {
              type: "force",
              id: crypto.randomUUID() as ID,
              targetID: state.startHover.id,
              anchor,
              vector: hoveredPart.position.sub(state.startHover.position),
            };
            actionBundleType = "Other";
            const existingForce = loads.find(
              (l) =>
                l.type === "force" &&
                l.targetID === newForce.targetID &&
                l.anchor === anchor,
            );
            if (existingForce)
              actions.push({ type: "DeleteElement", element: existingForce });
            actions.push({ type: "CreateElement", element: newForce });
          }
          setCanvasState({ type: "PlacingForceStart" });
          break;
        case "PlacingMoment":
          if (hoveredPart.type === "Edge" || hoveredPart.type === "GearTooth") {
            const newMoment: MomentElement = {
              type: "moment",
              id: crypto.randomUUID() as ID,
              targetID: hoveredPart.id,
              value: 1,
              clockwise: true,
            };
            actionBundleType = "Other";
            const existingMoment = loads.find(
              (l) => l.type === "moment" && l.targetID === newMoment.targetID,
            );
            if (existingMoment)
              actions.push({ type: "DeleteElement", element: existingMoment });
            actions.push({ type: "CreateElement", element: newMoment });
          }
          break;
        case "PlacingDistributedForceStart":
          if (hoveredPart.type !== "Edge") break;
          setCanvasState({
            type: "PlacingDistributedForceEnd",
            startHover: hoveredPart,
          });
          break;
        case "PlacingDistributedForceEnd":
          if (state.startHover.type !== "Edge") break;
          const beam = get_mechanical_element_from_id(
            state.startHover.id,
            mechanicalElements,
          ) as BeamElement;
          const delta = hoveredPart.position.sub(
            beam.positionStart.lerp(beam.positionEnd, 0.5),
          );
          actionBundleType = "Other";
          const beamID = state.startHover.id;
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
              beamID: state.startHover.id,
              vectorStart: delta,
              vectorEnd: delta,
            },
          });
          setCanvasState({ type: "PlacingDistributedForceStart" });
          break;
        case "PlacingProbe":
          if (
            hoveredPart.type !== "Void" &&
            hoveredPart.type !== "Constraint"
          ) {
            actionBundleType = "Other";
            actions.push({
              type: "AddProbe",
              elementID: hoveredPart.id,
              metric: "position-x",
            });
          }
          break;

        case "DimensionStart":
          if (hoveredPart.type === "Node") {
            setCanvasState({ type: "DimensionNode", nodeID: hoveredPart.id });
            break;
          } else if (hoveredPart.type === "Edge") {
            setCanvasState({ type: "DimensionEdge", edgeID: hoveredPart.id });
            break;
          } else if (hoveredPart.type === "GearTooth") {
            setCanvasState({ type: "DimensionRadius", gearID: hoveredPart.id });
          }
          break;
        case "DimensionNode":
          if (hoveredPart.type === "Node") {
            setCanvasState({
              type: "DimensionNodeToNode",
              startNodeID: state.nodeID,
              endNodeID: hoveredPart.id,
            });
            break;
          } else if (hoveredPart.type === "Edge") {
            setCanvasState({
              type: "DimensionEdgeToNode",
              edgeID: hoveredPart.id,
              nodeID: state.nodeID,
            });
            break;
          }
          break;
        case "DimensionEdge":
          if (hoveredPart.type === "Node") {
            setCanvasState({
              type: "DimensionEdgeToNode",
              edgeID: state.edgeID,
              nodeID: hoveredPart.id,
            });
            break;
          } else if (hoveredPart.type === "Edge") {
            setCanvasState({
              type: "DimensionAngle",
              startEdgeID: state.edgeID,
              endEdgeID: hoveredPart.id,
            });
            break;
          } else if (hoveredPart.type === "Void") {
            const elementID = crypto.randomUUID();
            const edge = get_mechanical_element_from_id(
              state.edgeID,
              mechanicalElements,
            ) as EdgeElement;
            const value = edge.positionStart.distance_to(edge.positionEnd);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "dimension-edge",
                position: hoveredPart.position,
                id: elementID,
                edgeID: state.edgeID,
                value,
              },
            });
            setCanvasState({
              type: "EditingConstraint",
              elementID,
              value,
              isPlacing: true,
            });
          }
          break;
        case "DimensionNodeToNode": {
          const elementID = crypto.randomUUID();
          const startNode = get_mechanical_element_from_id(
            state.startNodeID,
            mechanicalElements,
          ) as NodeElement;
          const endNode = get_mechanical_element_from_id(
            state.endNodeID,
            mechanicalElements,
          ) as NodeElement;
          const value = startNode.position.distance_to(endNode.position);
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-node-to-node",
              position: hoveredPart.position,
              id: elementID,
              startNodeID: state.startNodeID,
              endNodeID: state.endNodeID,
              value,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID,
            value,
            isPlacing: true,
          });
          break;
        }
        case "DimensionEdgeToNode": {
          const elementID = crypto.randomUUID();
          const node = get_mechanical_element_from_id(
            state.nodeID,
            mechanicalElements,
          ) as NodeElement;
          const edge = get_mechanical_element_from_id(
            state.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          const value = node.position.distance_to_line(
            edge.positionStart,
            edge.positionEnd,
          );
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-edge-to-node",
              position: hoveredPart.position,
              id: elementID,
              nodeID: state.nodeID,
              edgeID: state.edgeID,
              value,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID,
            value,
            isPlacing: true,
          });
          break;
        }
        case "DimensionAngle": {
          const elementID = crypto.randomUUID();
          const startEdge = get_mechanical_element_from_id(
            state.startEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const endEdge = get_mechanical_element_from_id(
            state.endEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const angleConstraintQuadrant = resolve_angle_constraint_quadrant(
            startEdge.positionStart,
            startEdge.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            hoveredPart.position,
          );
          if (!angleConstraintQuadrant) break;
          const { flipStart, flipEnd, couterClockwise, angle } =
            angleConstraintQuadrant;

          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-angle",
              position: hoveredPart.position,
              id: elementID,
              startEdgeID: state.startEdgeID,
              endEdgeID: state.endEdgeID,
              flipStart,
              flipEnd,
              couterClockwise,
              value: angle,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID: elementID,
            value: angle,
            isPlacing: true,
          });
          break;
        }
        case "DimensionRadius": {
          const elementID = crypto.randomUUID();
          const gear = get_mechanical_element_from_id(
            state.gearID,
            mechanicalElements,
          ) as GearElement;
          const value = gear.radius;
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-radius",
              position: hoveredPart.position,
              id: elementID,
              gearID: state.gearID,
              value,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID,
            value,
            isPlacing: true,
          });
          break;
        }
        case "HorizontalVerticalConstraintStart":
          switch (hoveredPart.type) {
            case "Node":
              setCanvasState({
                type: "HorizontalVerticalConstraintNode",
                startNodeID: hoveredPart.id,
              });
              break;
            case "Edge":
              // Check if the edge is more vertical or horizontal
              const edge = get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as EdgeElement;
              actionBundleType = "CreateConstraint";
              if (
                Math.abs(edge.positionEnd.x - edge.positionStart.x) >
                Math.abs(edge.positionEnd.y - edge.positionStart.y)
              ) {
                actions.push({
                  type: "CreateElement",
                  element: {
                    type: "horizontal-align-edge",
                    position: edge.positionStart.lerp(edge.positionEnd, 0.5),
                    id: crypto.randomUUID(),
                    edgeID: edge.id,
                  },
                });
              } else {
                actions.push({
                  type: "CreateElement",
                  element: {
                    type: "vertical-align-edge",
                    position: edge.positionStart.lerp(edge.positionEnd, 0.5),
                    id: crypto.randomUUID(),
                    edgeID: edge.id,
                  },
                });
              }
              break;
          }
          break;
        case "HorizontalVerticalConstraintNode":
          if (hoveredPart.type === "Node") {
            // Check if the edge is more vertical or horizontal
            const startNode = get_mechanical_element_from_id(
              state.startNodeID,
              mechanicalElements,
            ) as NodeElement;
            actionBundleType = "CreateConstraint";
            if (
              Math.abs(hoveredPart.position.x - startNode.position.x) >
              Math.abs(hoveredPart.position.y - startNode.position.y)
            ) {
              actions.push({
                type: "CreateElement",
                element: {
                  type: "horizontal-align-nodes",
                  position: startNode.position.lerp(hoveredPart.position, 0.5),
                  id: crypto.randomUUID(),
                  startNodeID: state.startNodeID,
                  endNodeID: hoveredPart.id,
                },
              });
            } else {
              actions.push({
                type: "CreateElement",
                element: {
                  type: "vertical-align-nodes",
                  position: startNode.position.lerp(hoveredPart.position, 0.5),
                  id: crypto.randomUUID(),
                  startNodeID: state.startNodeID,
                  endNodeID: hoveredPart.id,
                },
              });
            }
          }
          setCanvasState({
            type: "HorizontalVerticalConstraintStart",
          });
          break;
        case "NormalConstraintStart":
          if (hoveredPart.type === "Edge") {
            setCanvasState({
              type: "NormalConstraintEdge",
              startEdgeID: hoveredPart.id,
            });
          }
          break;
        case "NormalConstraintEdge":
          if (hoveredPart.type === "Edge") {
            const startEdge = get_mechanical_element_from_id(
              state.startEdgeID,
              mechanicalElements,
            ) as EdgeElement;
            const endEdge = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as EdgeElement;
            const position = startEdge.positionStart
              .lerp(startEdge.positionEnd, 0.5)
              .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "normal",
                position,
                id: crypto.randomUUID(),
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
          }
          setCanvasState({
            type: "NormalConstraintStart",
          });
          break;
        case "ParallelConstraintStart":
          if (hoveredPart.type === "Edge") {
            setCanvasState({
              type: "ParallelConstraintEdge",
              startEdgeID: hoveredPart.id,
            });
          }
          break;
        case "ParallelConstraintEdge":
          if (hoveredPart.type === "Edge") {
            const startEdge = get_mechanical_element_from_id(
              state.startEdgeID,
              mechanicalElements,
            ) as EdgeElement;
            const endEdge = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as EdgeElement;
            const position = startEdge.positionStart
              .lerp(startEdge.positionEnd, 0.5)
              .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "parallel",
                position,
                id: crypto.randomUUID(),
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
          }
          setCanvasState({
            type: "ParallelConstraintStart",
          });
          break;
        case "EqualConstraintStart":
          if (hoveredPart.type === "Edge") {
            setCanvasState({
              type: "EqualConstraintEdge",
              startEdgeID: hoveredPart.id,
            });
          } else if (hoveredPart.type === "GearTooth") {
            setCanvasState({
              type: "EqualConstraintGear",
              startGearID: hoveredPart.id,
            });
          }
          break;
        case "EqualConstraintEdge":
          if (hoveredPart.type === "Edge") {
            const startEdge = get_mechanical_element_from_id(
              state.startEdgeID,
              mechanicalElements,
            ) as EdgeElement;
            const endEdge = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as EdgeElement;
            const position = startEdge.positionStart
              .lerp(startEdge.positionEnd, 0.5)
              .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "equal",
                position,
                id: crypto.randomUUID(),
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
          }
          setCanvasState({
            type: "EqualConstraintStart",
          });
          break;
        case "EqualConstraintGear":
          if (hoveredPart.type === "GearTooth") {
            const startGear = get_mechanical_element_from_id(
              state.startGearID,
              mechanicalElements,
            ) as GearElement;
            const endGear = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as GearElement;
            const position = startGear.position.lerp(endGear.position, 0.5);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "gear-ratio",
                position,
                id: crypto.randomUUID(),
                startGearID: startGear.id,
                endGearID: endGear.id,
                value: 1,
              },
            });
          }
          setCanvasState({
            type: "EqualConstraintStart",
          });
          break;
        case "GearRatioConstraintStart":
          if (hoveredPart.type === "GearTooth") {
            setCanvasState({
              type: "GearRatioConstraintGear",
              startGearID: hoveredPart.id,
            });
          }
          break;
        case "GearRatioConstraintGear":
          if (hoveredPart.type === "GearTooth") {
            const elementID = crypto.randomUUID();
            const startGear = get_mechanical_element_from_id(
              state.startGearID,
              mechanicalElements,
            ) as GearElement;
            const endGear = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as GearElement;
            const position = startGear.position.lerp(endGear.position, 0.5);
            actionBundleType = "CreateConstraint";
            actions.push({
              type: "CreateElement",
              element: {
                type: "gear-ratio",
                position,
                id: elementID,
                startGearID: startGear.id,
                endGearID: endGear.id,
                value: startGear.radius / endGear.radius,
              },
            });
            setCanvasState({
              type: "EditingConstraint",
              elementID: elementID,
              value: startGear.radius / endGear.radius,
              isPlacing: true,
            });
          } else {
            setCanvasState({
              type: "GearRatioConstraintStart",
            });
          }
          break;
      }
      break;

    case "MouseMove":
      if (mouseButtonDown !== "left") break;
      switch (state.type) {
        case "Selecting":
          if (hoveredPart.type === "Void") break;
          const constraint = constraintElements.find(
            (element) => element.id === hoveredPart.id,
          );
          if (constraint && "value" in constraint) {
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
            });
          }
          break;
        case "SelectedElement":
          switch (hoveredPart.type) {
            case "Node":
              setCanvasState({ type: "MovingNode", elementID: hoveredPart.id });
              break;
            case "Edge":
              switch (hoveredPart.part) {
                case "start":
                  setCanvasState({
                    type: "MovingEdgeStartPoint",
                    elementID: hoveredPart.id,
                  });
                  break;
                case "end":
                  setCanvasState({
                    type: "MovingEdgeEndPoint",
                    elementID: hoveredPart.id,
                  });
                  break;
                case "body":
                  const edge = get_mechanical_element_from_id(
                    hoveredPart.id,
                    mechanicalElements,
                  ) as EdgeElement;
                  setCanvasState({
                    type: "MovingEdgeBody",
                    elementID: hoveredPart.id,
                    t: hoveredPart.position.parameter_on_segment(
                      edge.positionStart,
                      edge.positionEnd,
                    ),
                  });
                  break;
              }
              break;
            case "GearTooth":
              setCanvasState({
                type: "ChangingGearRadius",
                elementID: hoveredPart.id,
              });
              break;
            case "BeltBody":
              const belt = get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as BeltElement;
              if (hoveredPart.section % 2 === 0) {
                // even section : straight part
                setCanvasState({
                  type: "MovingBeltBody",
                  elementID: hoveredPart.id,
                  section: hoveredPart.section,
                });
              } else {
                // odd section : gear part
                const gearIndex = (hoveredPart.section - 1) / 2;
                const gearId = belt.attachedGearsIDs[gearIndex].id;
                actionBundleType = "Connects";
                actions.push({
                  type: "ConnectsAttachedBelt",
                  disconnect: true,
                  elementID: gearId,
                  connectID: belt.id,
                });
                actions.push({
                  type: "ConnectsAttachedGears",
                  disconnect: true,
                  elementID: belt.id,
                  connectID: gearId,
                  index: gearIndex,
                  direction: belt.attachedGearsIDs[gearIndex].direction,
                });
                setCanvasState({
                  type: "MovingBeltBody",
                  elementID: hoveredPart.id,
                  section: hoveredPart.section - 1,
                });
              }
              break;
            case "Constraint":
              setCanvasState({
                type: "MovingConstraint",
                elementID: hoveredPart.id,
              });
              break;
          }
          break;
        case "MovingNode":
          if (hoveredPart.position.equals(oldPosition)) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveNode",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingEdgeStartPoint":
          if (hoveredPart.position.equals(oldPosition)) break;
          const positionEnd = (
            get_mechanical_element_from_id(
              state.elementID,
              mechanicalElements,
            ) as EdgeElement
          ).positionEnd;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeStart",
            id: state.elementID,
            newPosition: positionEnd.add(
              hoveredPart.position
                .sub(positionEnd)
                .limit_length_min(DIM.MIN_EDGE_LENGTH),
            ),
            oldPosition,
          });
          break;
        case "MovingEdgeEndPoint":
          if (hoveredPart.position.equals(oldPosition)) break;
          const positionStart = (
            get_mechanical_element_from_id(
              state.elementID,
              mechanicalElements,
            ) as EdgeElement
          ).positionStart;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeEnd",
            id: state.elementID,
            newPosition: positionStart.add(
              hoveredPart.position
                .sub(positionStart)
                .limit_length_min(DIM.MIN_EDGE_LENGTH),
            ),
            oldPosition,
          });
          break;
        case "MovingEdgeBody":
          if (hoveredPart.position.equals(oldPosition)) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeBody",
            id: state.elementID,
            t: state.t,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingForceTip": {
          if (hoveredPart.position.equals(oldPosition)) break;
          const newVec = state.oldVector.add(
            hoveredPart.position.sub(state.startPos),
          );
          actionBundleType = "MoveLoad";
          actions.push({
            type: "MoveForceVector",
            id: state.loadID,
            newVector: newVec,
            oldVector: state.oldVector,
          });
          break;
        }
        case "MovingDistributedForceTip": {
          if (hoveredPart.position.equals(oldPosition)) break;
          const newVec = state.oldVector.add(
            hoveredPart.position.sub(state.startPos),
          );
          actionBundleType = "MoveLoad";
          actions.push({
            type: "MoveDistributedForceVector",
            id: state.loadID,
            end: state.end,
            newVector: newVec,
            oldVector: state.oldVector,
          });
          break;
        }
        case "ChangingGearRadius":
          if (hoveredPart.position.equals(oldPosition)) break;
          const gear = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as GearElement;
          actionBundleType = "MoveElement";
          actions.push({
            type: "ChangeGearRadius",
            id: state.elementID,
            newRadius: Math.max(
              DIM.MIN_GEAR_RADIUS,
              gear.position.distance_to(hoveredPart.position),
            ),
            oldRadius: gear.radius,
          });
          break;
        case "SelectingMultiple":
          if (hoveredPart.position.equals(oldPosition)) break;
          const newHoveredElementsIds = get_hovered_elements_by_rect(
            mechanicalElements,
            state.startPos,
            hoveredPart.position,
          );
          const updatedIDs = [
            ...state.elementIDs.filter(
              (id) =>
                newHoveredElementsIds.includes(id) ||
                !state.hoveredElementIDs.includes(id),
            ),
            ...newHoveredElementsIds.filter(
              (id) => !state.elementIDs.includes(id),
            ),
          ];
          setCanvasState({
            type: "SelectingMultiple",
            startPos: state.startPos,
            elementIDs: updatedIDs,
            hoveredElementIDs: newHoveredElementsIds,
          });
          break;
        case "MovingSelectionMultiple":
          if (hoveredPart.position.equals(oldPosition)) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveElements",
            elementIDs: state.elementIDs,
            newPos: hoveredPart.position,
            delta: event.mouseDelta,
          });
          break;
        case "ErasingMultiple":
          if (hoveredPart.position.equals(oldPosition)) break;
          setCanvasState({
            type: "ErasingMultiple",
            startPos: state.startPos,
            hoveredElementIDs: get_hovered_elements_by_rect(
              mechanicalElements,
              state.startPos,
              hoveredPart.position,
            ),
          });
          break;
        case "MovingConstraint":
          if (hoveredPart.position.equals(oldPosition)) break;
          actionBundleType = "MoveConstraint";
          actions.push({
            type: "MoveConstraint",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
      }
      break;

    case "MouseButtonUp":
      if (mouseButtonDown !== "left") break;
      switch (state.type) {
        case "Selecting":
          if (hoveredPart.type === "Void") break;
          setCanvasState({
            type: "SelectedElement",
            elementID: hoveredPart.id,
          });
          break;
        case "SelectedElement":
          if (hoveredPart.type === "Void") break;
          if (hoveredPart.id === state.elementID) {
            const constraint = constraintElements.find(
              (element) => element.id === hoveredPart.id,
            );
            if (constraint && "value" in constraint) {
              setCanvasState({
                type: "EditingConstraint",
                elementID: state.elementID,
                value: constraint.value,
                isPlacing: false,
              });
              break;
            }
          } else {
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
            });
          }
          break;
        case "MovingNode":
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
        case "MovingEdgeBody":
          let elementPart: HoveredPart;
          switch (state.type) {
            case "MovingNode":
              elementPart = {
                type: "Node",
                position: hoveredPart.position,
                id: state.elementID,
                deleting: false,
                beamBodyHover: false,
              };
              break;
            case "MovingEdgeStartPoint":
              elementPart = {
                type: "Edge",
                position: hoveredPart.position,
                id: state.elementID,
                deleting: false,
                part:
                  hoveredPart.type === "Node" && hoveredPart.beamBodyHover
                    ? "body"
                    : "start",
              };
              break;
            case "MovingEdgeEndPoint":
              elementPart = {
                type: "Edge",
                position: hoveredPart.position,
                id: state.elementID,
                deleting: false,
                part:
                  hoveredPart.type === "Node" && hoveredPart.beamBodyHover
                    ? "body"
                    : "end",
              };
              break;
            case "MovingEdgeBody":
              elementPart = {
                type: "Edge",
                position: hoveredPart.position,
                id: state.elementID,
                deleting: false,
                part: "body",
              };
              break;
          }
          actionBundleType = "Connects";
          actions.push(
            ...connect_elements(
              hoveredPart,
              get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ),
              elementPart,
              mechanicalElements,
              constraintElements,
              loads,
            ),
          );
          if (actions.length === 0) {
            actionBundleType = "Other";
            actions.push({ type: "Blank" });
          }
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        case "MovingBeltBody":
          if (hoveredPart.type === "GearTooth") {
            const belt = get_mechanical_element_from_id(
              state.elementID,
              mechanicalElements,
            ) as BeltElement;
            actionBundleType = "Connects";
            actions.push(
              ...connect_gear_and_belt(
                hoveredPart.id,
                state.elementID,
                state.section,
                !is_on_left_side_of_belt(
                  hoveredPart.position,
                  belt,
                  state.section,
                  mechanicalElements,
                ),
              ),
            );
          }
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        case "ChangingGearRadius":
          if (hoveredPart.type === "BeltBody") {
            const belt = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as BeltElement;
            actionBundleType = "Connects";
            actions.push(
              ...connect_gear_and_belt(
                state.elementID,
                hoveredPart.id,
                hoveredPart.section,
                is_on_left_side_of_belt(
                  (
                    get_mechanical_element_from_id(
                      state.elementID,
                      mechanicalElements,
                    ) as GearElement
                  ).position,
                  belt,
                  hoveredPart.section,
                  mechanicalElements,
                ),
              ),
            );
          } else if (hoveredPart.type === "GearTooth") {
            actionBundleType = "Connects";
            actions.push(...connect_gears(state.elementID, hoveredPart.id));
          } else {
            actionBundleType = "Other";
            actions.push({ type: "Blank" });
          }
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        case "SelectingMultiple":
          if (state.elementIDs.length === 0) {
            setCanvasState({ type: "Selecting" });
            break;
          }
          if (state.elementIDs.length === 1) {
            const element = mechanicalElements.find(
              (e) => e.id === state.elementIDs[0],
            );
            if (element) {
              setCanvasState({
                type: "SelectedElement",
                elementID: element.id,
              });
              break;
            }
          }
          setCanvasState({
            type: "SelectedMultiple",
            elementIDs: state.elementIDs,
          });
          break;
        case "MovingSelectionMultiple":
          actionBundleType = "Other";
          actions.push({ type: "Blank" });
          setCanvasState({
            type: "SelectedMultiple",
            elementIDs: state.elementIDs,
          });
          break;
        case "ErasingMultiple":
          actionBundleType = "Other";
          actions.push(
            ...delete_elements(
              state.hoveredElementIDs,
              mechanicalElements,
              constraintElements,
            ),
          );
          setCanvasState({ type: "Erasing" });
          break;
        case "MovingConstraint":
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        case "MovingForceTip":
        case "MovingDistributedForceTip":
          setCanvasState({ type: "Selecting" });
          break;
      }
      break;

    case "MouseRightButtonDown":
      setCanvasState({ type: "Selecting" });
      break;

    case "KeyDown":
      switch (event.key) {
        case "Escape":
          setCanvasState({ type: "Selecting" });
          break;
        case "Delete":
          switch (state.type) {
            case "SelectedElement":
              actionBundleType = "Other";
              actions.push(
                ...delete_element(
                  state.elementID,
                  mechanicalElements,
                  constraintElements,
                ),
              );
              setCanvasState({ type: "Selecting" });
              break;
            case "SelectedMultiple":
              actionBundleType = "Other";
              actions.push(
                ...delete_elements(
                  state.elementIDs,
                  mechanicalElements,
                  constraintElements,
                ),
              );
              setCanvasState({ type: "Selecting" });
              break;
          }
          break;
        case "a":
          setCanvasState({ type: "Erasing" });
          break;
        case "b":
          setCanvasState({ type: "PlacingBeamStart" });
          break;
        case "c":
          setCanvasState({ type: "PlacingDamperStart" });
          break;
        case "d":
          setCanvasState({ type: "DimensionStart" });
          break;
        case "e":
          setCanvasState({ type: "EqualConstraintStart" });
          break;
        case "f":
          setCanvasState({ type: "PlacingForceStart" });
          break;
        case "g":
          setCanvasState({ type: "PlacingGearStart" });
          break;
        case "h":
          setCanvasState({ type: "HorizontalVerticalConstraintStart" });
          break;
        case "i":
          setCanvasState({ type: "PlacingProbe" });
          break;
        case "j":
          setCanvasState({ type: "PlacingJoin" });
          break;
        case "k":
          setCanvasState({ type: "PlacingSpringStart" });
          break;
        case "l":
          setCanvasState({ type: "ParallelConstraintStart" });
          break;
        case "m":
          setCanvasState({ type: "PlacingMass" });
          break;
        case "n":
          setCanvasState({ type: "NormalConstraintStart" });
          break;
        case "o":
          setCanvasState({ type: "PlacingMoment" });
          break;
        case "p":
          setCanvasState({ type: "PlacingPivot" });
          break;
        case "q":
          setCanvasState({ type: "GearRatioConstraintStart" });
          break;
        case "r":
          setCanvasState({ type: "PlacingGround" });
          break;
        case "s":
          setCanvasState({ type: "PlacingSlider" });
          break;
        case "t":
          setCanvasState({ type: "PlacingBeltStart" });
          break;
        case "u":
          setCanvasState({ type: "PlacingDistributedForceStart" });
          break;
        case "v":
          setCanvasState({ type: "HorizontalVerticalConstraintStart" });
          break;
        case "w":
          setCanvasState({ type: "PlacingMotor" });
          break;
        case "y":
          if (!event.ctrlKey) break;
          onMouseUpHandler();
          redoMechanism();
          break;
        case "z":
          if (!event.ctrlKey) break;
          onMouseUpHandler();
          undoMechanism();
          break;
      }
      break;
  }

  if (actions.length > 0 && actionBundleType) {
    applyActions(actions, actionBundleType);
  }
}
