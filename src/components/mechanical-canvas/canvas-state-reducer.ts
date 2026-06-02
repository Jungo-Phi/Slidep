import { Point2, ZERO } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import { get_hovered_elements_by_rect } from "./get-hover";
import { Action, ActionBundleType, CanvasEvent } from "../../types/actions";
import { HoveredPart } from "../../types/hovered-part";
import {
  BeltElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  ID,
  JoinElement,
  MechanicalElement,
  NodeElement,
} from "../../types";
import {
  connect_elements,
  connect_gear_and_belt,
  connect_gears,
  delete_element,
  get_element_from_id,
  get_mechanical_element_from_id,
} from "./connect-actions";
import { is_on_left_side_of_belt } from "../../utils/belt-geom";

export function canvasStateReducer(
  state: CanvasState,
  setCanvasState: (state: CanvasState) => void,
  hoveredPart: HoveredPart,
  oldPosition: Point2,
  isMouseDown: boolean,
  event: CanvasEvent,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void,
  undoMechanism: () => void,
  redoMechanism: () => void,
  IDcounter: React.MutableRefObject<number>,
) {
  let actions: Action[] = [];
  let actionBundleType: ActionBundleType | undefined = undefined;
  switch (event.type) {
    case "MouseLeftButtonDown":
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "EditingConstraint":
          if (state.type === "SelectedElement") {
            // Logique pour la sélection multiple avec Shift
            if (event.shiftKey) {
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
            }
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
            // Click on another element
            // TODO : copy code from l.62
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
              get_element_from_id(
                hoveredPart.id,
                mechanicalElements,
                constraintElements,
              ),
              mechanicalElements,
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
        case "PlacingBeamEnd":
        case "PlacingSpringEnd":
        case "PlacingDamperEnd":
        case "PlacingBeltEnd":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingGearRadius":
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
          let newElement: MechanicalElement;
          const newElementId = IDcounter.current;
          IDcounter.current++;
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
              newElement = {
                type: "pivot",
                id: newElementId,
                position: hoveredPart.position,
                isGrounded: false,
                rotatingEdgesIDs: [],
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
            case "PlacingGearRadius":
              newElement = {
                type: "gear",
                id: newElementId,
                position: state.startHover.position,
                isGrounded: false,
                radius: state.startHover.position.distance_to(
                  hoveredPart.position,
                ),
                rotatingEdgesIDs: [],
                fixedEdgesIDs: [],
                meshedGearsIDs: [],
                fixedGearsIDs: [],
                attachedBeltID: undefined,
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
                mechanicalElements,
                IDcounter,
                state.startHover,
                newElement,
                {
                  type: "Edge",
                  position: newElement.positionStart,
                  id: newElement.id,
                  deleting: false,
                  part: "start",
                },
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
              mechanicalElements,
              IDcounter,
              hoveredPart,
              newElement,
              elementPart,
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
          } else if (state.type === "PlacingGearRadius") {
            if (hoveredPart.type === "BeltBody") {
              const belt = get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as BeltElement;
              actions.push(
                ...connect_gear_and_belt(
                  newElementId,
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
              actions.push(...connect_gears(newElementId, hoveredPart.id));
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
            case "PlacingGearRadius":
              setCanvasState({ type: "PlacingGearStart" });
              break;
            case "PlacingPivot":
            case "PlacingSlider":
            case "PlacingJoin":
            case "PlacingMass":
              // Remains in the same state
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
                id: IDcounter.current,
              };
              IDcounter.current++;
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
                id: IDcounter.current,
              };
              IDcounter.current++;
              actionBundleType = "Other";
              actions.push({ type: "CreateElement", element: newJoin });
              const connect_actions = connect_elements(
                mechanicalElements,
                IDcounter,
                hoveredPart,
                newJoin,
                {
                  type: "Node",
                  position: hoveredPart.position,
                  id: newJoin.id,
                  deleting: false,
                  beamBodyHover: false,
                },
              );
              actions.push(...connect_actions);
              break;
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
            const elementID = IDcounter.current;
            IDcounter.current++;
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
        case "DimensionNodeToNode":
          const elementID = IDcounter.current;
          IDcounter.current++;
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
        case "DimensionEdgeToNode":
          const elementID2 = IDcounter.current;
          IDcounter.current++;
          const node = get_mechanical_element_from_id(
            state.nodeID,
            mechanicalElements,
          ) as NodeElement;
          const edge = get_mechanical_element_from_id(
            state.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          const value2 = node.position.distance_to_line(
            edge.positionStart,
            edge.positionEnd,
          );
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-edge-to-node",
              position: hoveredPart.position,
              id: elementID2,
              nodeID: state.nodeID,
              edgeID: state.edgeID,
              value: value2,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID: elementID2,
            value: value2,
            isPlacing: true,
          });
          break;
        case "DimensionAngle":
          const elementID3 = IDcounter.current;
          IDcounter.current++;
          const startEdge = get_mechanical_element_from_id(
            state.startEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const endEdge = get_mechanical_element_from_id(
            state.endEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const value3 = startEdge.positionEnd
            .sub(startEdge.positionStart)
            .angle_to_deg(endEdge.positionEnd.sub(endEdge.positionStart));
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-angle",
              position: hoveredPart.position,
              id: elementID3,
              startEdgeID: state.startEdgeID,
              endEdgeID: state.endEdgeID,
              value: value3,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID: elementID3,
            value: value3,
            isPlacing: true,
          });
          break;
        case "DimensionRadius":
          const elementID4 = IDcounter.current;
          IDcounter.current++;
          const gear = get_mechanical_element_from_id(
            state.gearID,
            mechanicalElements,
          ) as GearElement;
          const value4 = gear.radius;
          actionBundleType = "CreateConstraint";
          actions.push({
            type: "CreateElement",
            element: {
              type: "dimension-radius",
              position: hoveredPart.position,
              id: elementID4,
              gearID: state.gearID,
              value: value4,
            },
          });
          setCanvasState({
            type: "EditingConstraint",
            elementID: elementID4,
            value: value4,
            isPlacing: true,
          });
          break;
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
                    id: IDcounter.current,
                    edgeID: edge.id,
                  },
                });
              } else {
                actions.push({
                  type: "CreateElement",
                  element: {
                    type: "vertical-align-edge",
                    position: edge.positionStart.lerp(edge.positionEnd, 0.5),
                    id: IDcounter.current,
                    edgeID: edge.id,
                  },
                });
              }
              IDcounter.current++;
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
                  id: IDcounter.current,
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
                  id: IDcounter.current,
                  startNodeID: state.startNodeID,
                  endNodeID: hoveredPart.id,
                },
              });
            }
            IDcounter.current++;
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
                id: IDcounter.current,
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
            IDcounter.current++;
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
                id: IDcounter.current,
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
            IDcounter.current++;
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
                id: IDcounter.current,
                startEdgeID: startEdge.id,
                endEdgeID: endEdge.id,
              },
            });
            IDcounter.current++;
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
                id: IDcounter.current,
                startGearID: startGear.id,
                endGearID: endGear.id,
                value: 1,
              },
            });
            IDcounter.current++;
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
                id: IDcounter.current,
                startGearID: startGear.id,
                endGearID: endGear.id,
                value: startGear.radius / endGear.radius,
              },
            });
            setCanvasState({
              type: "EditingConstraint",
              elementID: IDcounter.current,
              value: startGear.radius / endGear.radius,
              isPlacing: true,
            });
            IDcounter.current++;
          } else {
            setCanvasState({
              type: "GearRatioConstraintStart",
            });
          }
          break;
      }
      break;

    case "MouseMove":
      if (!isMouseDown) break;
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
                    deltaStart: hoveredPart.position.sub(edge.positionStart),
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
          if (hoveredPart.position === oldPosition) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveNode",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingEdgeStartPoint":
          if (hoveredPart.position === oldPosition) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeStart",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingEdgeEndPoint":
          if (hoveredPart.position === oldPosition) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeEnd",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingEdgeBody":
          if (hoveredPart.position === oldPosition) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeBody",
            id: state.elementID,
            deltaStart: state.deltaStart,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "ChangingGearRadius":
          if (hoveredPart.position === oldPosition) break;
          const gear = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as GearElement;
          actionBundleType = "MoveElement";
          actions.push({
            type: "ChangeGearRadius",
            id: state.elementID,
            newRadius: gear.position.distance_to(hoveredPart.position),
            oldRadius: gear.radius,
          });
          break;
        case "SelectingMultiple":
          if (hoveredPart.position === oldPosition) break;
          const newHoveredElementsIds = get_hovered_elements_by_rect(
            mechanicalElements,
            state.startPos,
            hoveredPart.position,
          );
          state.elementIDs.push(
            ...newHoveredElementsIds.filter(
              (elementId) => !state.elementIDs.includes(elementId),
            ),
          );
          state.elementIDs = state.elementIDs.filter(
            (elementId) =>
              newHoveredElementsIds.includes(elementId) ||
              !state.hoveredElementIDs.includes(elementId),
          );
          state.hoveredElementIDs = newHoveredElementsIds;
          break;
        case "MovingSelectionMultiple":
          if (hoveredPart.position === oldPosition) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveElements",
            elementIDs: state.elementIDs,
            newPos: hoveredPart.position,
            delta: event.mouseDelta,
          });
          break;
        case "ErasingMultiple":
          if (hoveredPart.position === oldPosition) break;
          state.hoveredElementIDs = get_hovered_elements_by_rect(
            mechanicalElements,
            state.startPos,
            hoveredPart.position,
          );
          break;
        case "MovingConstraint":
          if (hoveredPart.position === oldPosition) break;
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

    case "MouseLeftButtonUp":
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
              mechanicalElements,
              IDcounter,
              hoveredPart,
              get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ),
              elementPart,
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
          state.hoveredElementIDs.forEach((elementId: ID) => {
            actions.push(
              ...delete_element(
                get_element_from_id(
                  elementId,
                  mechanicalElements,
                  constraintElements,
                ),
                mechanicalElements,
              ),
            );
          });
          setCanvasState({ type: "Erasing" });
          break;
        case "MovingConstraint":
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
                  get_element_from_id(
                    state.elementID,
                    mechanicalElements,
                    constraintElements,
                  ),
                  mechanicalElements,
                ),
              );
              setCanvasState({ type: "Selecting" });
              break;
            case "SelectedMultiple":
              actionBundleType = "Other";
              state.elementIDs.forEach((elementId: ID) => {
                actions.push(
                  ...delete_element(
                    get_element_from_id(
                      elementId,
                      mechanicalElements,
                      constraintElements,
                    ),
                    mechanicalElements,
                  ),
                );
              });
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
        case "g":
          setCanvasState({ type: "PlacingGround" });
          break;
        case "p":
          setCanvasState({ type: "PlacingPivot" });
          break;
        case "s":
          setCanvasState({ type: "PlacingSlider" });
          break;
        case "j":
          setCanvasState({ type: "PlacingJoin" });
          break;
        case "q":
          setCanvasState({ type: "PlacingGearStart" });
          break;
        case "r":
          setCanvasState({ type: "GearRatioConstraintStart" });
          break;
        case "t":
          setCanvasState({ type: "PlacingBeltStart" });
          break;
        case "k":
          setCanvasState({ type: "PlacingSpringStart" });
          break;
        case "c":
          setCanvasState({ type: "PlacingDamperStart" });
          break;
        case "m":
          setCanvasState({ type: "PlacingMass" });
          break;
        case "d":
          setCanvasState({ type: "DimensionStart" });
          break;
        case "e":
          setCanvasState({ type: "EqualConstraintStart" });
          break;
        case "h":
          setCanvasState({ type: "HorizontalVerticalConstraintStart" });
          break;
        case "n":
          setCanvasState({ type: "NormalConstraintStart" });
          break;
        case "l":
          setCanvasState({ type: "ParallelConstraintStart" });
          break;
        case "z":
          if (!event.crtlKey) {
            break;
          }
          undoMechanism();
          break;
        case "y":
          if (!event.crtlKey) {
            break;
          }
          redoMechanism();
          break;
      }
      break;
  }

  if (actions.length > 0 && actionBundleType) {
    updateMechanism(actions, actionBundleType);
  }
}
