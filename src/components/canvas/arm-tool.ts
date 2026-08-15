import type { CanvasState, CanvasStateType } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import {
  ConstraintElement,
  LoadElement,
  MechanicalElement,
  ViewportState,
} from "../../types";
import { is_node_element } from "../../utils/element-queries";
import { tool_state, ToolStateType } from "../../constants/shortcuts";
import { HOVER_TARGETS } from "./get-hover";
import { element_to_hovered_part } from "./utils";
import type { MouseDownResult } from "./placing-element-actions";
import { handle_placing_element } from "./placing-element-actions";
import { handle_placing_constraint } from "./placing-constraint-actions";

/**
 * Whether a tool in `stateType` may take `element` as a whole. A selection names
 * an element, never one of its ends or one of a belt's runs, so a step that only
 * picks those has nothing to take.
 */
function targets_whole_element(
  stateType: CanvasStateType,
  element: MechanicalElement,
): boolean {
  const targets = HOVER_TARGETS[stateType];
  if (element.type === "gear") return targets.gear !== undefined;
  if (element.type === "belt")
    return targets.belt === "full" || targets.belt === "runs+arcs";
  // "carried-gear" designates a gear the selection does not name, so it answers no.
  if (is_node_element(element)) return targets.node === "centre";
  switch (targets.edge) {
    case "body":
    case "body-centre":
    case "ends+body":
      return true;
    case "ends+beam-body":
      return element.type === "beam";
    default:
      return false;
  }
}

/** The selection as the hover that would have named it. */
function selected_part(element: MechanicalElement): HoveredPart {
  // A belt is a target of its own, which `element_to_hovered_part` flattens to
  // an edge; the run is not read past a first step, which takes the belt whole.
  if (element.type === "belt")
    return {
      type: "BeltBody",
      position: element.positionStart.lerp(element.positionEnd, 0.5),
      id: element.id,
      deleting: false,
      section: 0,
    };
  return element_to_hovered_part(element);
}

/**
 * The steps a further element can be handed to. Only constraints chain: the
 * states left by a load or a probe read the cursor as a vector or anchor a
 * popover, and name no second element.
 */
const CHAINABLE_STEPS = [
  "DimensionNode",
  "DimensionEdge",
  "HorizontalVerticalConstraintNode",
  "NormalConstraintEdge",
  "ParallelConstraintEdge",
  "EqualConstraintEdge",
  "EqualConstraintGear",
  "GearRatioConstraintGear",
] as const;

type ChainableStep = Extract<
  CanvasState,
  { type: (typeof CHAINABLE_STEPS)[number] }
>;

function is_chainable_step(state: CanvasState): state is ChainableStep {
  return (CHAINABLE_STEPS as readonly string[]).includes(state.type);
}

/** What the tool would do, had `part` been clicked. Tools that start on a free cursor answer nothing. */
function first_step(
  toolState: ToolStateType,
  part: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
  viewport: ViewportState,
): MouseDownResult | undefined {
  switch (toolState) {
    case "DimensionStart":
    case "HorizontalVerticalConstraintStart":
    case "NormalConstraintStart":
    case "ParallelConstraintStart":
    case "EqualConstraintStart":
    case "GearRatioConstraintStart":
      return handle_placing_constraint(
        { type: toolState },
        part,
        mechanicalElements,
        constraintElements,
      );
    case "PlacingForceStart":
    case "PlacingMomentStart":
    case "PlacingProbe":
      return handle_placing_element(
        { type: toolState },
        part,
        mechanicalElements,
        constraintElements,
        loads,
        viewport,
      );
    default:
      return undefined;
  }
}

/** What the selection offers the tool, in the order it was picked. */
function selected_elements(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): MechanicalElement[] {
  const ids =
    state.type === "SelectedElement"
      ? [state.elementID]
      : state.type === "SelectedMultiple"
        ? state.elementIDs
        : [];
  const elements: MechanicalElement[] = [];
  for (const id of ids) {
    const element = mechanicalElements.find((one) => one.id === id);
    // Loads and constraints are selectable but start no tool.
    if (!element) return [];
    elements.push(element);
  }
  return elements;
}

/**
 * The state arming `toolState` lands in. The selected elements are handed to the
 * tool in the order they were picked, as the clicks they stand for — dimensioning
 * the angle between two selected edges then costs one click instead of three.
 *
 * Arming never edits the mechanism: a step that builds on its own, as a second
 * edge handed to the parallel tool would, is dropped and the tool waits for a
 * click on the canvas. That leaves the dimensioning tool as the only one a
 * multiple selection carries beyond its first step. Anything the selection
 * cannot start arms the tool plainly.
 */
export function armed_tool_state(
  toolState: ToolStateType,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
  viewport: ViewportState,
): CanvasState {
  const plain = tool_state(toolState);
  let armed: CanvasState = plain;
  for (const [index, element] of selected_elements(
    state,
    mechanicalElements,
  ).entries()) {
    if (!targets_whole_element(armed.type, element)) return plain;
    const part = selected_part(element);
    const step =
      index === 0
        ? first_step(
            toolState,
            part,
            mechanicalElements,
            constraintElements,
            loads,
            viewport,
          )
        : is_chainable_step(armed)
          ? handle_placing_constraint(
              armed,
              part,
              mechanicalElements,
              constraintElements,
            )
          : undefined;
    if (!step || step.actions.length > 0 || !step.newCanvasState) return plain;
    armed = step.newCanvasState;
  }
  return armed;
}
