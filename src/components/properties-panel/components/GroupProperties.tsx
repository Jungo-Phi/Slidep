import React from "react";
import { Box } from "@mui/material";
import {
  Action,
  BeamElement,
  ConstraintElement,
  GearElement,
  MassElement,
  MechanicalElement,
  MotorConfig,
  PivotElement,
  Point2,
  SliderElement,
  SlidepElement,
  SpringElement,
  DamperElement,
} from "../../../types";
import { MaterialDef, ProfileDef } from "../../../types/material";
import NumberInput from "./NumberInput";
import SignedNumberInput from "./SignedNumberInput";
import StructureOnly from "./StructureOnly";
import MaterialProfileSection from "./MaterialProfileSection";
import { t } from "../../../i18n";
import {
  ANGULAR_VELOCITY,
  DAMPING,
  LENGTH,
  MASS,
  MOMENT,
  QuantityKind,
  STIFFNESS,
  SURFACE_MASS,
  same_shown_value,
} from "../../../utils/quantity-format";

/**
 * One value the group's elements give for a field, and whether they agree. `undefined` when none
 * of them carries it — which is how a group only renders the fields its own type has.
 *
 * `kind` and `precision` are the field's own: agreeing means agreeing on what it would show, so
 * they must be the pair passed to the input below — see `same_shown_value`.
 */
function common_value<T extends MechanicalElement>(
  elements: MechanicalElement[],
  narrow: (el: MechanicalElement) => el is T,
  getValue: (el: T) => number,
  kind?: QuantityKind,
  precision?: number,
): { elements: T[]; value: number; mixed: boolean } | undefined {
  const typed = elements.filter(narrow);
  if (typed.length === 0) return undefined;
  const values = typed.map(getValue);
  return {
    elements: typed,
    value: values[0],
    mixed: values.some((v) => !same_shown_value(v, values[0], kind, precision)),
  };
}

const is_spring = (el: MechanicalElement): el is SpringElement =>
  el.type === "spring";
const is_gear = (el: MechanicalElement): el is GearElement =>
  el.type === "gear";
/** Belts are left out: their length is measured around their pulleys, not between two ends. */
const is_straight_edge = (
  el: MechanicalElement,
): el is BeamElement | SpringElement | DamperElement =>
  el.type === "beam" || el.type === "spring" || el.type === "damper";
const is_motorised = (
  el: MechanicalElement,
): el is PivotElement & { motor: MotorConfig } =>
  el.type === "pivot" && el.motor !== undefined;

/** A spring's rest length falls back to how long it is right now, as the panel's own field does. */
const rest_length = (el: SpringElement) =>
  el.restLength ?? el.positionStart.distance_to(el.positionEnd);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      gap: 1,
    }}
  >
    {children}
  </Box>
);

interface GroupPropertiesProps {
  /** The elements of one group of the selection — all of the same display type. */
  elements: MechanicalElement[];
  /** Needed to write a length through the dimension holding it, when one does. */
  constraintElements: ConstraintElement[];
  materials: MaterialDef[];
  profiles: ProfileDef[];
  applyActions: (actions: Action[]) => void;
  simulating: boolean;
}

/**
 * The fields one group of the selection shares, editable for all of it at once. A group is one
 * element type, so every field here speaks for the whole group and nothing else — which is what
 * lets `L` mean the beams' length under the beams and the springs' under the springs.
 *
 * A control loses whatever part of itself cannot be shared — the motor's direction switch, since
 * a sense of rotation is read off one motor's place in the mechanism — but only while the group
 * holds more than one element: alone, an element keeps its own panel's full control.
 *
 * Deliberately excludes the geometry that carries a position — position and angle — since canvas
 * drag already moves a selection together and setting them all to one absolute value would
 * collapse them onto each other. A length or a radius is not in that class: three beams sharing
 * a length stay three beams, each about its own start.
 */
export const GroupProperties: React.FC<GroupPropertiesProps> = ({
  elements,
  constraintElements,
  materials,
  profiles,
  applyActions,
  simulating,
}) => {
  const alone = elements.length === 1;

  const mass = common_value(
    elements,
    (el): el is MassElement => el.type === "mass",
    (el) => el.mass,
    MASS,
  );
  const stiffness = common_value(
    elements,
    is_spring,
    (el) => el.stiffness,
    STIFFNESS,
  );
  const restLength = common_value(elements, is_spring, rest_length, LENGTH);
  const damping = common_value(
    elements,
    (el): el is DamperElement => el.type === "damper",
    (el) => el.damping,
    DAMPING,
  );
  const length = common_value(
    elements,
    is_straight_edge,
    (el) => el.positionStart.distance_to(el.positionEnd),
    LENGTH,
  );
  const radius = common_value(elements, is_gear, (el) => el.radius, LENGTH);
  const surfaceMass = common_value(
    elements,
    is_gear,
    (el) => el.surfaceMass,
    SURFACE_MASS,
  );
  const rotationalFriction = common_value(
    elements,
    (el): el is PivotElement | SlidepElement => "rotatingEdgesIDs" in el,
    (el) => el.rotationalFriction,
    undefined,
    3,
  );
  const slidingFriction = common_value(
    elements,
    (el): el is SliderElement | SlidepElement =>
      "parentBeamID" in el && "slidingFriction" in el,
    (el) => el.slidingFriction,
    undefined,
    2,
  );
  const torque = common_value(
    elements,
    is_motorised,
    (el) => el.motor.torque,
    MOMENT,
  );
  const speed = common_value(
    elements,
    is_motorised,
    (el) => (alone ? el.motor.speed : Math.abs(el.motor.speed)),
    ANGULAR_VELOCITY(),
  );
  const beams = elements.filter((el): el is BeamElement => el.type === "beam");

  // A dimensioned edge is lengthened through its dimension, exactly as its own panel does —
  // writing the edge directly would leave the two disagreeing until the solver pulled it back.
  const set_length = (
    el: BeamElement | SpringElement | DamperElement,
    newLength: number,
  ): Action[] => {
    const dimension = constraintElements.find(
      (c) => c.type === "dimension-edge" && c.edgeID === el.id,
    );
    if (dimension?.type === "dimension-edge")
      return [
        {
          type: "ChangeDimensionEdgeValue",
          id: dimension.id,
          newValue: newLength,
          oldValue: dimension.value,
        },
      ];
    return [
      {
        type: "ChangeEdgeLength",
        id: el.id,
        newLength,
        oldLength: el.positionStart.distance_to(el.positionEnd),
      },
    ];
  };

  // A group of belts or joins carries nothing editable — no empty band under its header.
  const carriesFields =
    length ||
    mass ||
    stiffness ||
    damping ||
    radius ||
    surfaceMass ||
    rotationalFriction ||
    slidingFriction ||
    torque;
  if (!carriesFields) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        pt: 1,
        pb: 0.5,
      }}
    >
      {(length || radius) && (
        <StructureOnly disabled={simulating}>
          <Row>
            {length && (
              <NumberInput
                label="L"
                title={t("length")}
                kind={LENGTH}
                value={length.value}
                mixed={length.mixed}
                onChange={(newLength) =>
                  applyActions(
                    length.elements.flatMap((el) => set_length(el, newLength)),
                  )
                }
                unsigned
              />
            )}
            {radius && (
              <NumberInput
                label="R"
                title={t("radius")}
                kind={LENGTH}
                value={radius.value}
                mixed={radius.mixed}
                onChange={(newRadius) =>
                  applyActions(
                    radius.elements.map((el) => ({
                      type: "ChangeGearRadius",
                      id: el.id,
                      newRadius,
                      oldRadius: el.radius,
                      target: new Point2(
                        el.position.x + newRadius,
                        el.position.y,
                      ),
                      committed: true,
                    })),
                  )
                }
                unsigned
              />
            )}
          </Row>
        </StructureOnly>
      )}
      {mass && (
        <Row>
          <NumberInput
            label="m"
            title={t("mass")}
            kind={MASS}
            value={mass.value}
            mixed={mass.mixed}
            onChange={(newValue) =>
              applyActions(
                mass.elements.map((el) => ({
                  type: "ChangeMass",
                  id: el.id,
                  delta: newValue - el.mass,
                })),
              )
            }
            accent
            unsigned
          />
        </Row>
      )}
      {stiffness && restLength && (
        <Row>
          <NumberInput
            label="k"
            title={t("stiffness")}
            kind={STIFFNESS}
            value={stiffness.value}
            mixed={stiffness.mixed}
            onChange={(newValue) =>
              applyActions(
                stiffness.elements.map((el) => ({
                  type: "ChangeStiffness",
                  id: el.id,
                  delta: newValue - el.stiffness,
                })),
              )
            }
            accent
            unsigned
          />
          <NumberInput
            label="L₀"
            title={t("rest_length")}
            kind={LENGTH}
            value={restLength.value}
            mixed={restLength.mixed}
            onChange={(newValue) =>
              applyActions(
                restLength.elements.map((el) => ({
                  type: "UpdateElementRestLength",
                  id: el.id,
                  newValue,
                  oldValue: el.restLength,
                })),
              )
            }
            unsigned
          />
        </Row>
      )}
      {damping && (
        <Row>
          <NumberInput
            label="b"
            title={t("damping")}
            kind={DAMPING}
            value={damping.value}
            mixed={damping.mixed}
            onChange={(newValue) =>
              applyActions(
                damping.elements.map((el) => ({
                  type: "ChangeDamping",
                  id: el.id,
                  delta: newValue - el.damping,
                })),
              )
            }
            accent
            unsigned
          />
        </Row>
      )}
      {surfaceMass && (
        <Row>
          <NumberInput
            label="mₛ"
            title={t("surface_mass")}
            kind={SURFACE_MASS}
            value={surfaceMass.value}
            mixed={surfaceMass.mixed}
            onChange={(newValue) =>
              applyActions(
                surfaceMass.elements.map((el) => ({
                  type: "ChangeSurfaceMass",
                  id: el.id,
                  delta: newValue - el.surfaceMass,
                })),
              )
            }
            accent
            unsigned
          />
        </Row>
      )}
      {(rotationalFriction || slidingFriction) && (
        <Row>
          {rotationalFriction && (
            <NumberInput
              label="μᵣ"
              title={t("rotational_friction")}
              value={rotationalFriction.value}
              mixed={rotationalFriction.mixed}
              onChange={(newValue) =>
                applyActions(
                  rotationalFriction.elements.map((el) => ({
                    type: "ChangeRotationalFriction",
                    id: el.id,
                    delta: newValue - el.rotationalFriction,
                  })),
                )
              }
              unsigned
              precision={3}
              step={0.001}
            />
          )}
          {slidingFriction && (
            <NumberInput
              label="μₛ"
              title={t("sliding_friction")}
              value={slidingFriction.value}
              mixed={slidingFriction.mixed}
              onChange={(newValue) =>
                applyActions(
                  slidingFriction.elements.map((el) => ({
                    type: "ChangeSlidingFriction",
                    id: el.id,
                    delta: newValue - el.slidingFriction,
                  })),
                )
              }
              unsigned
              precision={2}
              step={0.01}
            />
          )}
        </Row>
      )}
      {torque && speed && (
        <Row>
          <NumberInput
            label="C"
            title={t("motor_torque_label")}
            kind={MOMENT}
            value={torque.value}
            mixed={torque.mixed}
            onChange={(newTorque) =>
              applyActions(
                torque.elements.map((el) => ({
                  type: "SetMotorConfig",
                  id: el.id,
                  newConfig: { ...el.motor, torque: newTorque },
                  oldConfig: el.motor,
                })),
              )
            }
            unsigned
          />
          {alone ? (
            <SignedNumberInput
              label="ω"
              title={t("motor_speed_label")}
              kind={ANGULAR_VELOCITY()}
              value={speed.value}
              onChange={(newSpeed) =>
                applyActions(
                  speed.elements.map((el) => ({
                    type: "SetMotorConfig",
                    id: el.id,
                    newConfig: { ...el.motor, speed: newSpeed },
                    oldConfig: el.motor,
                  })),
                )
              }
            />
          ) : (
            <NumberInput
              label="ω"
              title={t("motor_speed_label")}
              kind={ANGULAR_VELOCITY()}
              value={speed.value}
              mixed={speed.mixed}
              onChange={(magnitude) =>
                applyActions(
                  speed.elements.map((el) => ({
                    type: "SetMotorConfig",
                    id: el.id,
                    newConfig: {
                      ...el.motor,
                      speed: el.motor.speed < 0 ? -magnitude : magnitude,
                    },
                    oldConfig: el.motor,
                  })),
                )
              }
              unsigned
            />
          )}
        </Row>
      )}
      {beams.length > 0 && (
        <MaterialProfileSection
          elements={beams}
          materials={materials}
          profiles={profiles}
          applyActions={applyActions}
        />
      )}
    </Box>
  );
};

export default GroupProperties;
