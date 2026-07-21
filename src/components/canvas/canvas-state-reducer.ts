import { Point2, ZERO } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import { get_hovered_elements_by_rect } from "./get-hover";
import { Action, ActionBundleType, CanvasEvent } from "../../types/actions";
import { HoveredPart, names_element } from "../../types/hovered-part";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  Link,
  LoadElement,
  MechanicalElement,
  MomentElement,
} from "../../types";
import type { OwnPartKind } from "../mechanism/connect-actions";
import {
  attach_gear_to_belt,
  connect_elements,
  connect_meshed_gears,
  own_part,
  delete_element,
  delete_elements,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import { TOOL_STATE_BY_KEY, tool_state } from "../../constants/shortcuts";
import {
  distributed_grab_magnitude,
  distributed_tip_magnitude,
  force_stored_vector,
  frame2world,
  moment_center_position,
  radius2moment_value,
  world2frame,
} from "../../utils/load-geom";
import {
  belt_merged_run_section,
  belt_section_gear_index,
} from "../../utils/belt-path";
import { belt_without_gear } from "../../utils/belt-geom";
import { belt_body_grab_pin, elements_by_id } from "../solver/parsing";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";
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
    beltPin?: Extract<Link, { type: "BeltPin" }>,
  ) => void = () => {},
  onSimulationGrabEnd: () => void = () => {},
  worldMousePos: Point2 = ZERO,
  viewportZoom: number = 1,
) {
  const actions: Action[] = [];
  let actionBundleType: ActionBundleType | undefined = undefined;
  switch (event.type) {
    case "MouseLeftButtonDown":
      // A closure names no element, so only the belt placement that offered it
      // can act on one — every other state sees empty space. Handled here so
      // the states below are typed against a target that has an id.
      if (hoveredPart.type === "BeltClosure") {
        if (state.type === "PlacingBeltEnd") {
          const closing = handle_placing_element(
            state,
            hoveredPart,
            mechanicalElements,
            constraintElements,
            loadElements,
          );
          if (closing.newCanvasState) setCanvasState(closing.newCanvasState);
          actions.push(...closing.actions);
          if (closing.actionBundleType)
            actionBundleType = closing.actionBundleType;
        }
        break;
      }
      // An opaque refusal is binding, not advisory: the spot showing the
      // forbidden cursor takes nothing, whatever tool is armed. The tool stays
      // armed so the user can aim again.
      if (hoveredPart.type === "Void" && hoveredPart.rejected) break;
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "EditingValue":
        case "PlacingValue":
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
              pendingHit: hoveredPart,
              downPos: worldMousePos,
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
          // Étiquette de valeur d'une charge : on ouvre l'éditeur dès le 1ᵉʳ
          // clic. C'est une cible distincte du corps, donc aucun drag n'est à
          // armer ici. Le reste de la charge (corps, poignées) tombe dans le cas
          // générique plus bas : sélection + drag armé via `pendingHit`.
          if (
            (hoveredPart.type === "Force" ||
              hoveredPart.type === "DistributedForce" ||
              hoveredPart.type === "Moment") &&
            (hoveredPart.part === "value" ||
              hoveredPart.part === "start-value" ||
              hoveredPart.part === "end-value")
          ) {
            // Pendant une saisie, on ne fait rien : le blur de l'input s'en charge.
            if (state.type === "EditingValue" || state.type === "PlacingValue")
              break;
            const load = get_load_element_from_id(hoveredPart.id, loadElements);
            const part =
              hoveredPart.part === "start-value"
                ? "start"
                : hoveredPart.part === "end-value"
                  ? "end"
                  : undefined;
            setCanvasState({
              type: "EditingValue",
              elementID: load.id,
              value:
                load.type === "moment"
                  ? load.value
                  : load.type === "force"
                    ? load.vector.length()
                    : // Unsigned, like the label it is opened from: the side of
                      // the beam an end pushes on is set by dragging, not typed.
                      Math.abs(
                        part === "end"
                          ? load.magnitudeEnd
                          : load.magnitudeStart,
                      ),
              part,
            });
            break;
          }
          const constraint = constraintElements.find(
            (element) => element.id === hoveredPart.id,
          );
          // Dimension (contrainte à valeur) : pendant une saisie, on ne fait
          // rien ici — le blur de l'input s'en charge.
          if (
            constraint &&
            "value" in constraint &&
            (state.type === "EditingValue" || state.type === "PlacingValue")
          )
            break;
          setCanvasState({
            type: "SelectedElement",
            elementID: hoveredPart.id,
            pendingHit: hoveredPart,
            downPos: worldMousePos,
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
              grabbedID: hoveredPart.id,
              hasMoved: false,
            });
          } else {
            // Click on element not in selection without Shift → select only that element
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
              pendingHit: hoveredPart,
              downPos: worldMousePos,
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
          // A deletion changes connections, so it solves like any other
          // connection change (its separation spreads what it detaches).
          actionBundleType = "Connects";
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
        case "PlacingDistributedForce":
        case "PlacingMomentStart":
        case "PlacingMomentEnd":
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
        case "DimensionBelt":
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
          if (!names_element(hoveredPart)) break;
          const constraint = constraintElements.find(
            (element) => element.id === hoveredPart.id,
          );
          if (constraint && "value" in constraint) {
            setCanvasState({
              type: "SelectedElement",
              elementID: hoveredPart.id,
              pendingHit: hoveredPart,
              downPos: worldMousePos,
            });
          }
          break;
        case "SelectedElement": {
          // Le drag ne démarre qu'à partir de la cible capturée au mouseDown (`pendingHit`) et une fois le seuil de déplacement franchi.
          const hit = state.pendingHit;
          if (
            !hit ||
            !state.downPos ||
            worldMousePos.distance_to(state.downPos) <
              HIT_TOLERANCE.DRAG_START / viewportZoom
          )
            break;
          if (isSimulating) {
            let simKey: string | null = null;
            let simElementID: ID | null = null;
            let bodyRatio: number | undefined = undefined;
            let gearPerimeter:
              { gearID: ID; angleOffset: number; radius: number } | undefined =
              undefined;
            let beltPin: Extract<Link, { type: "BeltPin" }> | undefined =
              undefined;
            if (hit.type === "GearTooth") {
              // Grab a gear tooth → rotate the gear: capture the angle offset of
              // the grabbed point relative to the gear angle (held constant).
              const grabbedGear = get_mechanical_element_from_id(
                hit.id,
                mechanicalElements,
              ) as GearElement;
              simKey = hit.id;
              simElementID = hit.id;
              gearPerimeter = {
                gearID: hit.id,
                angleOffset:
                  worldMousePos.sub(grabbedGear.position).angle() -
                  grabbedGear.angle,
                radius: grabbedGear.radius,
              };
            } else if (hit.type === "Node") {
              simKey = hit.id;
              simElementID = hit.id;
            } else if (hit.type === "BeltBody") {
              // Grab any point of a closed belt → rotate the belt with the point
              // under the cursor: bake a transient BeltPin at the grabbed
              // arc-length (from the live sim geometry).
              const belt = get_mechanical_element_from_id(
                hit.id,
                mechanicalElements,
              ) as BeltElement;
              const pin = belt_body_grab_pin(
                belt,
                elements_by_id(mechanicalElements),
                hit.position,
                "grab_belt",
              );
              if (pin) {
                simKey = hit.id;
                simElementID = hit.id;
                beltPin = pin;
              }
            } else if (hit.type === "Edge") {
              simElementID = hit.id;
              if (hit.part === "start") simKey = `${hit.id}:start`;
              else if (hit.part === "end") simKey = `${hit.id}:end`;
              else {
                // Body grab: pull the beam at the grabbed ratio.
                const simEdge = get_mechanical_element_from_id(
                  hit.id,
                  mechanicalElements,
                ) as EdgeElement;
                simKey = hit.id;
                bodyRatio = hit.position.parameter_on_segment(
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
                beltPin,
              });
            }
            break;
          }
          switch (hit.type) {
            case "Node":
              setCanvasState({ type: "MovingNode", elementID: hit.id });
              break;
            case "Edge":
              switch (hit.part) {
                case "start":
                  setCanvasState({
                    type: "MovingEdgeStartPoint",
                    elementID: hit.id,
                  });
                  break;
                case "end":
                  setCanvasState({
                    type: "MovingEdgeEndPoint",
                    elementID: hit.id,
                  });
                  break;
                case "body":
                  const edge = get_mechanical_element_from_id(
                    hit.id,
                    mechanicalElements,
                  ) as EdgeElement;
                  setCanvasState({
                    type: "MovingEdgeBody",
                    elementID: hit.id,
                    t: hit.position.parameter_on_segment(
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
                elementID: hit.id,
              });
              break;
            case "BeltBody":
              const belt = get_mechanical_element_from_id(
                hit.id,
                mechanicalElements,
              ) as BeltElement;
              const gearIndex = belt_section_gear_index(
                hit.section,
                belt.closed,
              );
              if (gearIndex === undefined) {
                // A run: the drag inserts a new pulley into it.
                setCanvasState({
                  type: "MovingBeltBody",
                  elementID: hit.id,
                  section: hit.section,
                });
              } else {
                // An arc: the drag carries the run the two runs it joined merge
                // into. The pulley itself only comes off at the drop.
                setCanvasState({
                  type: "MovingBeltBody",
                  elementID: hit.id,
                  section: belt_merged_run_section(
                    hit.section,
                    belt.closed,
                    belt.attachedGearsIDs.length,
                  ),
                  removingGearIndex: gearIndex,
                });
              }
              break;
            case "Constraint":
              setCanvasState({
                type: "MovingConstraint",
                elementID: hit.id,
              });
              break;
            case "Force":
              setCanvasState({ type: "MovingForce", elementID: hit.id });
              break;
            case "Moment":
              setCanvasState({ type: "MovingMoment", elementID: hit.id });
              break;
            case "DistributedForce":
              // Les étiquettes de valeur n'arment jamais de drag (elles ouvrent
              // l'éditeur au mouseDown), mais le type les autorise ici.
              if (hit.part === "start-value" || hit.part === "end-value") break;
              setCanvasState(
                hit.part === "body"
                  ? {
                      type: "MovingDistributedForce",
                      elementID: hit.id,
                      part: "body",
                      grabT: hit.t ?? 0.5,
                    }
                  : {
                      type: "MovingDistributedForce",
                      elementID: hit.id,
                      part: hit.part,
                    },
              );
              break;
          }
          break;
        }
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
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeStart",
            id: state.elementID,
            newPosition: hoveredPart.position,
            oldPosition,
          });
          break;
        case "MovingEdgeEndPoint":
          if (hoveredPart.position.equals(oldPosition)) break;
          actionBundleType = "MoveElement";
          actions.push({
            type: "MoveEdgeEnd",
            id: state.elementID,
            newPosition: hoveredPart.position,
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
            type: "ChangeForce",
            id: state.elementID,
            newVector: world2frame(
              force_stored_vector(hoveredPart.position.sub(targetPos)),
              force.frame,
              mechanicalElements,
            ),
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
            distForce.targetID,
            mechanicalElements,
          ) as BeamElement;
          actionBundleType = "MoveLoad";
          // Every handle does the same thing — slide along the load's direction
          // — and only differs in what the slid length means. Aiming is not
          // part of any of them: the direction is chosen when the load is
          // placed and edited in the panel, so a load dragged across its beam
          // simply goes negative instead of swinging round, which would make
          // its two ends look like they had swapped.
          let newMagnitudeStart = distForce.magnitudeStart;
          let newMagnitudeEnd = distForce.magnitudeEnd;
          const worldDirection = frame2world(
            distForce.direction,
            distForce.frame,
            mechanicalElements,
          );
          const projection_at = (base: Point2) =>
            // Signed: past the base the projection goes negative and the arrow
            // flips to the other side of the beam rather than being clamped.
            hoveredPart.position.sub(base).dot(worldDirection);
          switch (state.part) {
            case "start":
              newMagnitudeStart = distributed_tip_magnitude(
                projection_at(beam.positionStart),
                distForce.magnitudeEnd,
              );
              break;
            case "end":
              newMagnitudeEnd = distributed_tip_magnitude(
                projection_at(beam.positionEnd),
                distForce.magnitudeStart,
              );
              break;
            case "body": {
              // The grabbed point of the crest line follows the cursor and both
              // magnitudes are translated with it, keeping their difference
              // fixed: the taper is a property of the load, not something
              // moving it should rewrite. So pushing the load towards its beam
              // takes the trailing end through zero into the negatives — it
              // crosses to the other side — instead of collapsing the trapezoid
              // into a rectangle.
              const grabbed =
                distForce.magnitudeStart +
                (distForce.magnitudeEnd - distForce.magnitudeStart) *
                  state.grabT;
              const offsetStart = distForce.magnitudeStart - grabbed;
              const offsetEnd = distForce.magnitudeEnd - grabbed;
              const magnitude = distributed_grab_magnitude(
                projection_at(
                  beam.positionStart.lerp(beam.positionEnd, state.grabT),
                ),
                offsetStart,
                offsetEnd,
              );
              newMagnitudeStart = magnitude + offsetStart;
              newMagnitudeEnd = magnitude + offsetEnd;
              break;
            }
          }
          actions.push({
            type: "ChangeDistributedForce",
            id: state.elementID,
            newDirection: distForce.direction,
            oldDirection: distForce.direction,
            newMagnitudeStart,
            oldMagnitudeStart: distForce.magnitudeStart,
            newMagnitudeEnd,
            oldMagnitudeEnd: distForce.magnitudeEnd,
          });
          break;
        }
        case "MovingMoment": {
          if (hoveredPart.position.equals(oldPosition)) break;
          const moment = get_load_element_from_id(
            state.elementID,
            loadElements,
          ) as MomentElement;
          const beamCenter = moment_center_position(moment, mechanicalElements);
          actionBundleType = "MoveLoad";
          actions.push({
            type: "ChangeMoment",
            id: state.elementID,
            // The drag radius maps back through the arc's own scale; the sign
            // is a placement choice, so a move only ever resizes the arc.
            newValue:
              radius2moment_value(
                hoveredPart.position.distance_to(beamCenter),
              ) * (moment.value < 0 ? -1 : 1),
            oldValue: moment.value,
          });
          break;
        }
        case "ChangingGearRadius":
          const gear = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as GearElement;
          // Grab a point on the perimeter and pull the gear toward the mouse:
          // the raw mouse rather than the hovered part, because the nodes pinned
          // to the rim move with it and would lock the radius on its own value.
          // A belt is the exception — the hover has already placed the tangency
          // point, so the rim snaps onto it instead of stopping short.
          // The geometric solver decides whether the radius grows or the centre
          // moves (radius-constrained / meshed) — see resolveGeometricConstraints.
          const gearTarget =
            hoveredPart.type === "BeltBody"
              ? hoveredPart.position
              : worldMousePos;
          actionBundleType = "MoveElement";
          actions.push({
            type: "ChangeGearRadius",
            id: state.elementID,
            newRadius: gear.position.distance_to(gearTarget),
            oldRadius: gear.radius,
            target: gearTarget,
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
          if (!state.hasMoved) {
            setCanvasState({ ...state, hasMoved: true });
          }
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
            // For a gear-tooth or belt grab, follow the raw mouse (rotation
            // target), not the hovered part which could snap to another element.
            state.gearPerimeter || state.beltPin
              ? worldMousePos
              : hoveredPart.position,
            state.bodyRatio,
            state.gearPerimeter,
            state.beltPin,
          );
          break;
      }
      break;
    case "MouseButtonUp":
      if (mouseButtonDown !== "left") break;
      switch (state.type) {
        case "Selecting":
          if (!names_element(hoveredPart)) break;
          setCanvasState({
            type: "SelectedElement",
            elementID: hoveredPart.id,
          });
          break;
        case "SelectedElement":
          if (!names_element(hoveredPart)) break;
          if (hoveredPart.id === state.elementID) {
            // Un clic simple (sans drag) sur une dimension ouvre directement
            // l'édition de sa valeur.
            const constraint = constraintElements.find(
              (element) => element.id === hoveredPart.id,
            );
            if (constraint && "value" in constraint) {
              setCanvasState({
                type: "EditingValue",
                elementID: state.elementID,
                value: constraint.value,
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
          const draggedKind: OwnPartKind =
            state.type === "MovingNode"
              ? "node"
              : state.type === "MovingEdgeStartPoint"
                ? "start"
                : state.type === "MovingEdgeEndPoint"
                  ? "end"
                  : "body";
          actionBundleType = "Connects";
          actions.push(
            ...connect_elements(
              hoveredPart,
              get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ),
              own_part(state.elementID, draggedKind, hoveredPart),
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
        case "MovingBeltBody": {
          const belt = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as BeltElement;
          // Removal and insertion travel as one bundle: they apply in order, and
          // the closure pass judges the net result, so swapping a pulley for
          // another never opens the belt in between.
          const removing = state.removingGearIndex;
          const shortened =
            removing === undefined ? belt : belt_without_gear(belt, removing);
          const beltActions: Action[] = [];
          if (removing !== undefined) {
            const removed = belt.attachedGearsIDs[removing];
            beltActions.push(
              {
                type: "ConnectsAttachedBelt",
                disconnect: true,
                elementID: removed.id,
                connectID: belt.id,
              },
              {
                type: "ConnectsAttachedGears",
                disconnect: true,
                elementID: belt.id,
                connectID: removed.id,
                index: removing,
                direction: removed.direction,
              },
            );
          }
          if (hoveredPart.type === "GearTooth") {
            const gear = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as GearElement;
            const attach = attach_gear_to_belt(
              gear.id,
              gear.position,
              shortened,
              state.section,
              mechanicalElements,
              "belt-onto-gear",
            );
            // Empty means the carried section is not a run of the shortened belt,
            // so it was renumbered wrong: committing the removal alone would cost
            // a pulley for nothing. Drop the whole gesture instead.
            if (attach.length === 0) beltActions.length = 0;
            else beltActions.push(...attach);
          }
          if (beltActions.length > 0) {
            actionBundleType = "Connects";
            actions.push(...beltActions);
          }
          setCanvasState({
            type: "SelectedElement",
            elementID: state.elementID,
          });
          break;
        }
        case "ChangingGearRadius":
          if (hoveredPart.type === "BeltBody") {
            const belt = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as BeltElement;
            const gear = get_mechanical_element_from_id(
              state.elementID,
              mechanicalElements,
            ) as GearElement;
            actionBundleType = "Connects";
            actions.push(
              ...attach_gear_to_belt(
                gear.id,
                gear.position,
                belt,
                hoveredPart.section,
                mechanicalElements,
                "gear-onto-belt",
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
                own_part(state.elementID, "gear", hoveredPart),
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
          if (!state.hasMoved) {
            // Simple clic (sans déplacement) sur un élément de la sélection
            // multiple → ne sélectionner que cet élément.
            setCanvasState({
              type: "SelectedElement",
              elementID: state.grabbedID,
            });
            break;
          }
          actionBundleType = "Other";
          actions.push({ type: "Blank" });
          setCanvasState({
            type: "SelectedMultiple",
            elementIDs: state.elementIDs,
          });
          break;
        case "ErasingMultiple":
          actionBundleType = "Connects";
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
        case "Delete":
          switch (state.type) {
            case "SelectedElement":
              actionBundleType = "Connects";
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
              actionBundleType = "Connects";
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
        default: {
          const toolState = TOOL_STATE_BY_KEY[event.key];
          if (toolState) setCanvasState(tool_state(toolState));
          break;
        }
      }
      break;
  }

  if (actions.length > 0 && actionBundleType) {
    applyActions(actions, actionBundleType);
  }
}
