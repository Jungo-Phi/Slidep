import React from "react";
import { IconButton } from "@mui/material";
import { Action, Mechanism, UnionElement } from "../../types";
import { t } from "../../i18n";
import { is_groundable } from "../../utils/element-queries";
import {
  ANGULAR_VELOCITY,
  DAMPING,
  LENGTH,
  MASS,
  STIFFNESS,
} from "../../utils/quantity-format";
import NumberInput from "../properties-panel/components/NumberInput";
import SignedNumberInput from "../properties-panel/components/SignedNumberInput";
import ToggleIcon from "../properties-panel/components/ToggleIcon";
import { LoadValueInput } from "../properties-panel/components/LoadDetails";
import {
  change_constraint_value,
  change_damping,
  change_edge_length,
  change_gear_radius,
  change_mass,
  change_motor_speed,
  change_stiffness,
  toggle_ground,
  VALUE_KIND,
} from "../properties-panel/element-value-actions";

interface QuickValueProps {
  element: UnionElement;
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
}

/**
 * The one value of `element` the quick-access bar edits, written as its page writes it — or nothing, for an element with no value that stands out.
 * The values its page already sets apart (m, k, b, ω), a beam's length, a gear's radius, a load's value, a dimension's; a node's anchoring, the one switch among them.
 */
export const QuickValue: React.FC<QuickValueProps> = ({
  element,
  mechanism,
  applyActions,
}) => {
  const apply = (action: Action) => applyActions([action]);
  switch (element.type) {
    case "mass":
      return (
        <NumberInput
          label="m"
          title={t("mass")}
          kind={MASS}
          value={element.mass}
          onChange={(mass) => apply(change_mass(element, mass))}
          accent
          unsigned
        />
      );
    case "spring":
      return (
        <NumberInput
          label="k"
          title={t("stiffness")}
          kind={STIFFNESS}
          value={element.stiffness}
          onChange={(stiffness) => apply(change_stiffness(element, stiffness))}
          accent
          unsigned
        />
      );
    case "damper":
      return (
        <NumberInput
          label="b"
          title={t("damping")}
          kind={DAMPING}
          value={element.damping}
          onChange={(damping) => apply(change_damping(element, damping))}
          accent
          unsigned
        />
      );
    case "beam":
      return (
        <NumberInput
          label="L"
          title={t("length")}
          kind={LENGTH}
          value={element.positionStart.distance_to(element.positionEnd)}
          onChange={(length) =>
            apply(change_edge_length(element, length, mechanism))
          }
          unsigned
        />
      );
    case "gear":
      return (
        <NumberInput
          label="R"
          title={t("radius")}
          kind={LENGTH}
          value={element.radius}
          onChange={(radius) => apply(change_gear_radius(element, radius))}
          unsigned
        />
      );
    case "force":
    case "distributed-force":
    case "moment": {
      const host = mechanism.mechanicalElements.find(
        (candidate) => candidate.id === element.targetID,
      );
      if (!host) return null;
      return (
        <LoadValueInput
          load={element}
          host={host}
          shownLoad={element}
          applyActions={applyActions}
        />
      );
    }
  }
  // A motor's speed takes the place of the pivot's anchoring, which a motor holds itself.
  if (element.type === "pivot" && element.motor) {
    const motor = element.motor;
    return (
      <SignedNumberInput
        label="ω"
        title={t("motor_speed_label")}
        kind={ANGULAR_VELOCITY()}
        value={motor.speed}
        onChange={(speed) => apply(change_motor_speed(element, motor, speed))}
        accent
      />
    );
  }
  const node = mechanism.mechanicalElements.find(
    (candidate) => candidate.id === element.id,
  );
  if (node && is_groundable(node))
    return (
      <IconButton
        aria-label={t(node.isGrounded ? "release" : "anchor")}
        aria-pressed={node.isGrounded}
        onClick={() => apply(toggle_ground(node))}
        sx={{ padding: 0.5, border: 1, borderColor: "divider" }}
      >
        <ToggleIcon
          on={node.isGrounded}
          onName="ground"
          offName="ground-off"
          size={24}
        />
      </IconButton>
    );
  const kind = VALUE_KIND[element.type];
  if (kind && "value" in element) {
    const action = (value: number) => change_constraint_value(element, value);
    return (
      <NumberInput
        label={
          element.type === "dimension-angle"
            ? "α"
            : element.type === "dimension-radius"
              ? "R"
              : "L"
        }
        title={t("dimension")}
        kind={kind}
        value={element.value}
        onChange={(value) => {
          const write = action(value);
          if (write) apply(write);
        }}
        unsigned={kind === LENGTH}
      />
    );
  }
  return null;
};
