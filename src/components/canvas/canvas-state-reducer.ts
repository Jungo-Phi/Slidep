import { Point2, ZERO } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import { get_hovered_elements_by_rect } from "./get-hover";
import { Action, ActionBundleType, CanvasEvent } from "../../types/actions";
import { HoveredPart } from "../../types/hovered-part";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  LoadElement,
  MechanicalElement,
} from "../../types";
import {
  connect_elements,
  connect_gear_and_belt,
  connect_meshed_gears,
  delete_element,
  delete_elements,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import { is_on_left_side_of_belt } from "../../utils";
import { DIM } from "../../constants/rendering-specs";
import { handle_placing_element } from "./placing-element-actions";
import { handle_placing_constraint } from "./placing-constraint-actions";

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
  loadElements: LoadElement[] = [],
  isSimulating: boolean = false,
  onSimulationGrab: (
    key: string,
    target: Point2,
    bodyRatio?: number,
    gearPerimeter?: { gearID: ID; angleOffset: number; radius: number },
  ) => void = () => {},
  onSimulationGrabEnd: () => void = () => {},
  worldMousePos: Point2 = ZERO,
) {
  const actions: Action[] = [];
  let actionBundleType: ActionBundleType | undefined = undefined;
  switch (event.type) {
    case "MouseLeftButtonDown":
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "EditingConstraint":
          // En simulation : pas de multi-sélection, pas de Moving* sur click
          if (isSimulating) {
            if (hoveredPart.type === "Void") {
              setCanvasState({ type: "Selecting" });
              break;
            }
            const simConstraint = constraintElements.find(
              (element) => element.id === hoveredPart.id,
            );
            if (simConstraint && "value" in simConstraint) break;
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
            });
            break;
          }
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
            const load = get_load_element_from_id(hoveredPart.id, loadElements);
            setCanvasState({
              type: "MovingForce",
              elementID: load.id,
            });
            break;
          }
          if (hoveredPart.type === "DistributedForce") {
            const load = get_load_element_from_id(hoveredPart.id, loadElements);
            setCanvasState({
              type: "MovingDistributedForce",
              elementID: load.id,
              part: hoveredPart.part,
            });
            break;
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
              loadElements,
            ),
          );
          setCanvasState({ type: "Erasing" });
          break;
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "PlacingMotor":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingGearStart":
        case "PlacingGearRadius":
        case "PlacingGround":
        case "PlacingForceStart":
        case "PlacingForceEnd":
        case "PlacingDistributedForceStart":
        case "PlacingDistributedForceEnd":
        case "PlacingMoment":
        case "PlacingProbe": {
          const r = handle_placing_element(
            state,
            hoveredPart,
            mechanicalElements,
            constraintElements,
            loadElements,
          );
          if (r.newCanvasState) setCanvasState(r.newCanvasState);
          actions.push(...r.actions);
          if (r.actionBundleType) actionBundleType = r.actionBundleType;
          break;
        }
        case "DimensionStart":
        case "DimensionNode":
        case "DimensionEdge":
        case "DimensionNodeToNode":
        case "DimensionEdgeToNode":
        case "DimensionAngle":
        case "DimensionRadius":
        case "HorizontalVerticalConstraintStart":
        case "HorizontalVerticalConstraintNode":
        case "NormalConstraintStart":
        case "NormalConstraintEdge":
        case "ParallelConstraintStart":
        case "ParallelConstraintEdge":
        case "EqualConstraintStart":
        case "EqualConstraintEdge":
        case "EqualConstraintGear":
        case "GearRatioConstraintStart":
        case "GearRatioConstraintGear": {
          const r = handle_placing_constraint(
            state,
            hoveredPart,
            mechanicalElements,
          );
          if (r.newCanvasState) setCanvasState(r.newCanvasState);
          actions.push(...r.actions);
          if (r.actionBundleType) actionBundleType = r.actionBundleType;
          break;
        }
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
          if (isSimulating) {
            let simKey: string | null = null;
            let simElementID: ID | null = null;
            let bodyRatio: number | undefined = undefined;
            let gearPerimeter:
              | { gearID: ID; angleOffset: number; radius: number }
              | undefined = undefined;
            if (hoveredPart.type === "GearTooth") {
              // Grab a gear tooth → rotate the gear: capture the angle offset of
              // the grabbed point relative to the gear angle (held constant).
              const grabbedGear = get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as GearElement;
              simKey = hoveredPart.id;
              simElementID = hoveredPart.id;
              gearPerimeter = {
                gearID: hoveredPart.id,
                angleOffset:
                  worldMousePos.sub(grabbedGear.position).angle() -
                  grabbedGear.angle,
                radius: grabbedGear.radius,
              };
            } else if (hoveredPart.type === "Node") {
              simKey = hoveredPart.id;
              simElementID = hoveredPart.id;
            } else if (hoveredPart.type === "Edge") {
              simElementID = hoveredPart.id;
              if (hoveredPart.part === "start")
                simKey = `${hoveredPart.id}:start`;
              else if (hoveredPart.part === "end")
                simKey = `${hoveredPart.id}:end`;
              else {
                // Body grab: pull the beam at the grabbed ratio.
                const simEdge = get_mechanical_element_from_id(
                  hoveredPart.id,
                  mechanicalElements,
                ) as EdgeElement;
                simKey = hoveredPart.id;
                bodyRatio = hoveredPart.position.parameter_on_segment(
                  simEdge.positionStart,
                  simEdge.positionEnd,
                );
              }
            }
            if (simKey && simElementID) {
              setCanvasState({
                type: "SimulationDragging",
                grabbedKey: simKey,
                elementID: simElementID,
                bodyRatio,
                gearPerimeter,
              });
            }
            break;
          }
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
        case "MovingForce": {
          if (hoveredPart.position.equals(oldPosition)) break;
          const force = get_load_element_from_id(
            state.elementID,
            loadElements,
          ) as ForceElement;
          const targetEle = get_mechanical_element_from_id(
            force.targetID,
            mechanicalElements,
          );
          const targetPos =
            "position" in targetEle
              ? targetEle.position
              : force.anchor === "start"
                ? targetEle.positionStart
                : targetEle.positionEnd;
          actionBundleType = "MoveLoad";
          actions.push({
            type: "MoveForceVector",
            id: state.elementID,
            newVector: hoveredPart.position.sub(targetPos),
            oldVector: force.vector,
          });
          break;
        }
        case "MovingDistributedForce": {
          if (hoveredPart.position.equals(oldPosition)) break;
          const distForce = get_load_element_from_id(
            state.elementID,
            loadElements,
          ) as DistributedForceElement;
          const beam = get_mechanical_element_from_id(
            distForce.beamID,
            mechanicalElements,
          ) as BeamElement;
          actionBundleType = "MoveLoad";
          let newVectorStart = distForce.vectorStart;
          let newVectorEnd = distForce.vectorEnd;
          switch (state.part) {
            case "start":
              newVectorStart = hoveredPart.position.sub(beam.positionStart);
              break;
            case "end":
              newVectorEnd = hoveredPart.position.sub(beam.positionEnd);
              break;
            case "body":
              const delta = hoveredPart.position.sub(oldPosition);
              newVectorStart = distForce.vectorStart.add(delta);
              newVectorEnd = distForce.vectorEnd.add(delta);
              break;
          }
          actions.push({
            type: "MoveDistributedForceVectors",
            id: state.elementID,
            newVectorStart,
            oldVectorStart: distForce.vectorStart,
            newVectorEnd,
            oldVectorEnd: distForce.vectorEnd,
          });
          break;
        }
        case "ChangingGearRadius":
          const gear = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as GearElement;
          // Grab a point on the perimeter and pull the gear toward the mouse
          // (raw mouse, not the hovered part, so pinned nodes don't hijack it).
          // The geometric solver decides whether the radius grows or the centre
          // moves (radius-constrained / meshed) — see resolveGeometricConstraints.
          actionBundleType = "MoveElement";
          actions.push({
            type: "ChangeGearRadius",
            id: state.elementID,
            newRadius: Math.max(
              DIM.MIN_GEAR_RADIUS,
              gear.position.distance_to(worldMousePos),
            ),
            oldRadius: gear.radius,
            target: worldMousePos,
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
        case "SimulationDragging":
          onSimulationGrab(
            state.grabbedKey,
            // For a gear-tooth grab, follow the raw mouse (rotation target),
            // not the hovered part which could snap to another element.
            state.gearPerimeter ? worldMousePos : hoveredPart.position,
            state.bodyRatio,
            state.gearPerimeter,
          );
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
              loadElements,
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
            actions.push(
              ...connect_meshed_gears(state.elementID, hoveredPart.id),
            );
          } else if (
            (hoveredPart.type === "Node" || hoveredPart.type === "Edge") &&
            hoveredPart.id !==
              (
                get_mechanical_element_from_id(
                  state.elementID,
                  mechanicalElements,
                ) as GearElement
              ).parentAxleID
          ) {
            // Pin the dragged gear to the hovered node/edge (GEAR on NODE/EDGE).
            // The gear's own axle is excluded so dragging the tooth toward the
            // centre keeps resizing instead of self-pinning.
            actionBundleType = "Connects";
            actions.push(
              ...connect_elements(
                hoveredPart,
                get_mechanical_element_from_id(
                  state.elementID,
                  mechanicalElements,
                ),
                {
                  type: "GearTooth",
                  position: hoveredPart.position,
                  id: state.elementID,
                  deleting: false,
                },
                mechanicalElements,
                constraintElements,
                loadElements,
              ),
            );
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
              loadElements,
            ),
          );
          setCanvasState({ type: "Erasing" });
          break;
        case "MovingConstraint":
        case "MovingForce":
        case "MovingDistributedForce":
          if (actions.length === 0) {
            actionBundleType = "Other";
            actions.push({ type: "Blank" });
          }
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        case "SimulationDragging":
          onSimulationGrabEnd();
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
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
                  loadElements,
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
                  loadElements,
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
          setCanvasState({ type: "PlacingMotor" });
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
          setCanvasState({ type: "PlacingMass" });
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
