import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { Close, Delete } from "@mui/icons-material";
import {
  Action,
  CanvasState,
  ID,
  MechanicalElement,
  UnionElement,
  ZERO,
} from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import { element_to_hovered_part } from "../../canvas/utils";
import ElementDisplay from "./ElementDisplay";
import StructureOnly from "./StructureOnly";
import NumberInput from "./NumberInput";
import SignedNumberInput from "./SignedNumberInput";
import { t } from "../../../i18n";
import {
  ANGULAR_VELOCITY,
  DAMPING,
  MASS,
  QuantityKind,
  STIFFNESS,
} from "../../../utils/quantity-format";

/** The one scalar a row shows next to an element's name — the quantity that identifies it at a glance. */
interface Headline {
  label: string;
  title: string;
  kind: QuantityKind;
  value: number;
  /** Direction is part of the value: shown with a rotation arrow rather than a minus sign. */
  signed?: boolean;
  /** Locked while the simulation runs. */
  structureOnly?: boolean;
  toActions: (value: number) => Action[];
}

function headline(element: MechanicalElement): Headline | undefined {
  switch (element.type) {
    case "mass":
      return {
        label: "m",
        title: t("mass"),
        kind: MASS,
        value: element.mass,
        toActions: (mass) => [
          { type: "ChangeMass", id: element.id, delta: mass - element.mass },
        ],
      };
    case "spring":
      return {
        label: "k",
        title: t("stiffness"),
        kind: STIFFNESS,
        value: element.stiffness,
        toActions: (stiffness) => [
          {
            type: "ChangeStiffness",
            id: element.id,
            delta: stiffness - element.stiffness,
          },
        ],
      };
    case "damper":
      return {
        label: "b",
        title: t("damping"),
        kind: DAMPING,
        value: element.damping,
        toActions: (damping) => [
          {
            type: "ChangeDamping",
            id: element.id,
            delta: damping - element.damping,
          },
        ],
      };
    case "pivot": {
      const motor = element.motor;
      if (!motor) return undefined;
      return {
        label: "ω",
        title: t("motor_speed_label"),
        kind: ANGULAR_VELOCITY(),
        value: motor.speed,
        signed: true,
        structureOnly: true,
        toActions: (speed) => [
          {
            type: "SetMotorConfig",
            id: element.id,
            newConfig: { ...motor, speed },
            oldConfig: motor,
          },
        ],
      };
    }
    default:
      return undefined;
  }
}

interface ElementRowProps {
  element: MechanicalElement;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  /** Off in the elements/edition context — motor speed can't be tweaked mid-simulation. */
  simulating: boolean;
  size?: "small" | "medium";
  /** Identification only: no quick-edit field, no rename. For a list whose editing happens
   *  elsewhere — the selection summary, where the same fields are already offered for the
   *  whole selection at once just above. */
  readOnly?: boolean;
  /** Present only inside a selection summary: swaps the trailing delete button for one that
   *  just drops this one element out of the selection — destroying the model from three
   *  levels deep in a selection-refinement list would read as far too heavy a click. */
  onDeselect?: (id: ID) => void;
}

/** One row of the element list: icon, name, its headline quick-edit field, and delete
 *  (or, inside a selection summary, deselect). Shared by the empty-selection list and the
 *  multi-selection summary, so a row looks and behaves the same wherever it appears. */
export const ElementRow: React.FC<ElementRowProps> = ({
  element,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  simulating,
  size = "medium",
  readOnly = false,
  onDeselect,
}) => {
  const handleMouseEnter = (el: UnionElement, deleting: boolean) => {
    setHoveredPart(element_to_hovered_part(el, deleting));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  const quantity = readOnly ? undefined : headline(element);
  const controlIcon = size === "small" ? 16 : 20;

  let field: React.ReactNode = null;
  if (quantity) {
    const input = quantity.signed ? (
      <SignedNumberInput
        label={quantity.label}
        title={quantity.title}
        kind={quantity.kind}
        value={quantity.value}
        onChange={(value) => applyActions(quantity.toActions(value))}
        accent
      />
    ) : (
      <NumberInput
        label={quantity.label}
        title={quantity.title}
        kind={quantity.kind}
        value={quantity.value}
        onChange={(value) => applyActions(quantity.toActions(value))}
        accent
        unsigned
      />
    );
    field = quantity.structureOnly ? (
      <StructureOnly disabled={simulating}>{input}</StructureOnly>
    ) : (
      input
    );
  }

  return (
    <ElementDisplay
      element={element}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={selectedIds}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      size={size}
      editable={!readOnly}
      trailingControls={
        <>
          {field}
          {onDeselect ? (
            <Tooltip title={t("selection_remove_group")}>
              <IconButton
                size="small"
                onClick={() => onDeselect(element.id)}
                sx={{ borderRadius: 3 }}
              >
                <Close sx={{ width: controlIcon, height: controlIcon }} />
              </IconButton>
            </Tooltip>
          ) : (
            <StructureOnly disabled={simulating} row>
              <Tooltip title={t("delete")}>
                <IconButton
                  color="error"
                  size="small"
                  onMouseEnter={() => handleMouseEnter(element, true)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() =>
                    applyActions([{ type: "DeleteElement", element }])
                  }
                  sx={{ borderRadius: 3 }}
                >
                  <Delete sx={{ width: controlIcon, height: controlIcon }} />
                </IconButton>
              </Tooltip>
            </StructureOnly>
          )}
        </>
      }
    />
  );
};

export default ElementRow;
