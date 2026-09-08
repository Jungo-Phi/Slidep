/**
 * ElementProperties component Displays properties for element elements
 */

import { Box, IconButton, Divider, Tooltip, Typography } from "@mui/material";
import { Delete, Lock, LockOpen, Replay } from "@mui/icons-material";
import {
  ID,
  LoadElement,
  MechanicalElement,
  UnionElement,
} from "../../../types/element";
import VectorInput from "../components/VectorInput";
import {
  BeamElement,
  CanvasState,
  Action,
  AppMode,
  Mechanism,
  Point2,
  RuntimeState,
  ZERO,
} from "../../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import {
  delete_element,
  delete_elements,
} from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";
import NumberInput from "../components/NumberInput";
import SignedNumberInput from "../components/SignedNumberInput";
import ElementDisplay from "../components/ElementDisplay";
import ElementsOverview from "../components/ElementsOverview";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "../../canvas/drawing/draw-canvas";
import ElementMeasures from "./ElementMeasures";
import { t } from "../../../i18n";
import { element_to_hovered_part, linked_constraint } from "../../canvas/utils";
import { measure_belt_length } from "../../../utils/belt-geom";
import { is_groundable } from "../../../utils/element-queries";
import React from "react";
import { icon } from "../../element-palette/iconDataUris";
import StructureOnly from "../components/StructureOnly";
import ProbesSection from "../components/ProbesSection";
import LoadsSection from "../components/LoadsSection";
import {
  create_length_dimension,
  create_radius_dimension,
} from "../element-dimensions";
import ElementPicker from "../components/ElementPicker";
import MaterialProfileSection from "../components/MaterialProfileSection";
import { DEFAULT } from "../../../constants/physics-specs";
import {
  ANGLE,
  ANGULAR_VELOCITY,
  INERTIA,
  LENGTH,
  MASS,
  MOMENT,
  POWER,
  STIFFNESS,
  SURFACE_MASS,
  DAMPING,
  ANGULAR_DAMPING,
  format_quantity,
  wrap_angle_rad,
} from "../../../utils/quantity-format";
import {
  gear_inertia,
  surface_mass_for_inertia,
} from "../../../utils/gear-mass";
import { get_dynamic_metric_at } from "../../solver/recording/probe-series";
import { DynamicSnapshot } from "../../../types/runtime-state";

/** The ground/unground button's icon, reused as the ElementPicker "world" option
 * so a motor's anchor reads with the same visual language as the ground toggle. */
const GroundIcon: React.FC<{ sx?: object }> = ({ sx }) => (
  <Box component="img" src={icon("ground")} sx={sx} />
);

interface ElementPropertiesProps {
  element: MechanicalElement | LoadElement | undefined;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
  /** The mechanism in the pose on screen — see the same field on `AnalysisPanel`. Only feeds
   * the values shown for a motor/load while scrubbed; every write still goes to `mechanism`. */
  analysedMechanism: Mechanism;
  appMode: AppMode;
  runtimeState: RuntimeState;
  /** Names what the canvas should pick out, and why — see the same prop on `PropertiesPanel`. */
  setHighlight: (highlight: CanvasHighlight) => void;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element: selectedElement,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  mechanism,
  analysedMechanism,
  appMode,
  runtimeState,
  setHighlight,
}) => {
  const simulating = appMode !== "edition";
  const element: MechanicalElement | undefined =
    selectedElement &&
    (selectedElement.type === "force" ||
      selectedElement.type === "moment" ||
      selectedElement.type === "distributed-force")
      ? mechanism.mechanicalElements.find(
          (e) => e.id === selectedElement.targetID,
        )
      : selectedElement;

  const selectedLoadID: ID | undefined =
    selectedElement &&
    (selectedElement.type === "force" ||
      selectedElement.type === "moment" ||
      selectedElement.type === "distributed-force")
      ? selectedElement.id
      : undefined;

  const handleMouseEnter = (el: UnionElement, deleting: boolean) => {
    setHoveredPart(element_to_hovered_part(el, deleting));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  if (!element) {
    return (
      <ElementsOverview
        selectedIds={selectedIds}
        mechanism={mechanism}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
        setHighlight={setHighlight}
        onDeleteElements={(ids) => {
          applyActions(
            delete_elements(
              ids,
              mechanism.mechanicalElements,
              mechanism.constraintElements,
              mechanism.loads,
            ),
          );
          setHighlight(NO_HIGHLIGHT);
          setCanvasState({ type: "Selecting" });
        }}
      />
    );
  }

  // A spring with no rest length of its own takes the drawn one, and follows it.
  const restLengthIsDrawn =
    element.type === "spring" && element.restLength === undefined;

  const linkedConstraint = linked_constraint(
    element,
    mechanism.constraintElements,
  );

  const elementLoads = mechanism.loads.filter((l) => l.targetID === element.id);
  const displayLoads = analysedMechanism.loads.filter(
    (l) => l.targetID === element.id,
  );
  const analysedElement =
    element.type === "pivot"
      ? analysedMechanism.mechanicalElements.find((e) => e.id === element.id)
      : undefined;
  const displayMotorConfig =
    analysedElement?.type === "pivot" ? analysedElement.motor : undefined;
  const motorConfig = element.type === "pivot" ? element.motor : undefined;
  // The motor's own instantaneous draw — only a dynamic run has real torque/velocity to read it from (kinematic motors just track position, `motor-power` reads empty there).
  const motorPowerSample =
    motorConfig && appMode === "dynamic"
      ? get_dynamic_metric_at(
          element,
          "motor-power",
          runtimeState.simulationSnapshots as DynamicSnapshot[],
          runtimeState.time,
        )
      : undefined;

  // Beams the pivot's motor can push against: the beams rotating about it.
  const motorBeams: BeamElement[] =
    element.type === "pivot"
      ? element.rotatingEdgesIDs
          .map((id) => mechanism.mechanicalElements.find((e) => e.id === id))
          .filter((e): e is BeamElement => e?.type === "beam")
      : [];

  return (
    <Box sx={{ mb: 1 }}>
      <Box margin={1}>
        <ElementDisplay
          element={element}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          selectedIds={selectedIds}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="large"
          editable={true}
          trailingControls={
            <>
              <StructureOnly actions={["GroundNode"]} row>
                {is_groundable(element) && (
                  <Tooltip title={t(element.isGrounded ? "release" : "anchor")}>
                    <IconButton
                      color="inherit"
                      size="small"
                      onClick={() =>
                        applyActions([
                          {
                            type: "GroundNode",
                            id: element.id,
                            grounded: !element.isGrounded,
                          },
                        ])
                      }
                      sx={{
                        padding: 0.2,
                        border: 1,
                        borderColor: "divider",
                      }}
                    >
                      <Box
                        component="img"
                        style={{ width: 28, height: 28 }}
                        src={icon(element.isGrounded ? "ground" : "ground-off")}
                      />
                    </IconButton>
                  </Tooltip>
                )}
              </StructureOnly>

              {element.type === "pivot" && element.motor && motorConfig && (
                <StructureOnly actions={["SetMotorConfig", "GroundNode"]} row>
                  <ElementPicker
                    label="Ancrage moteur"
                    options={motorBeams}
                    extraOption={{
                      label: t("ground"),
                      icon: GroundIcon,
                      selected: motorConfig.parentBeamID === undefined,
                    }}
                    selected={motorBeams.find(
                      (beam) => beam.id === motorConfig.parentBeamID,
                    )}
                    onSelectExtra={() =>
                      applyActions([
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: {
                            ...motorConfig,
                            parentBeamID: undefined,
                          },
                          oldConfig: motorConfig,
                        },
                        ...(element.isGrounded
                          ? []
                          : ([
                              {
                                type: "GroundNode",
                                id: element.id,
                                grounded: true,
                              },
                            ] satisfies Action[])),
                      ])
                    }
                    onSelectElement={(beam) =>
                      applyActions([
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: { ...motorConfig, parentBeamID: beam.id },
                          oldConfig: motorConfig,
                        },
                        ...(element.isGrounded
                          ? ([
                              {
                                type: "GroundNode",
                                id: element.id,
                                grounded: false,
                              },
                            ] satisfies Action[])
                          : []),
                      ])
                    }
                    onHoverElement={(beam) =>
                      setHoveredPart(element_to_hovered_part(beam, false))
                    }
                    onHoverEnd={() =>
                      setHoveredPart({ type: "Void", position: ZERO })
                    }
                    hoveredPart={hoveredPart}
                    setHoveredPart={setHoveredPart}
                    selectedIds={selectedIds}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    large
                  />
                </StructureOnly>
              )}
              {element.type === "mass" && (
                <NumberInput
                  label="m"
                  title={t("mass")}
                  kind={MASS}
                  value={element.mass}
                  onChange={(mass) =>
                    applyActions([
                      {
                        type: "ChangeMass",
                        id: element.id,
                        delta: mass - element.mass,
                      },
                    ])
                  }
                  large
                  accent
                  unsigned
                />
              )}
              {element.type === "spring" && (
                <NumberInput
                  label="k"
                  title={t("stiffness")}
                  kind={STIFFNESS}
                  value={element.stiffness}
                  onChange={(stiffness) =>
                    applyActions([
                      {
                        type: "ChangeStiffness",
                        id: element.id,
                        delta: stiffness - element.stiffness,
                      },
                    ])
                  }
                  large
                  accent
                  unsigned
                />
              )}
              {element.type === "damper" && (
                <NumberInput
                  label="b"
                  title={t("damping")}
                  kind={DAMPING}
                  value={element.damping}
                  onChange={(damping) =>
                    applyActions([
                      {
                        type: "ChangeDamping",
                        id: element.id,
                        delta: damping - element.damping,
                      },
                    ])
                  }
                  large
                  accent
                  unsigned
                />
              )}
              <StructureOnly actions={["DeleteElement"]} row>
                <Tooltip title={t("delete")}>
                  <IconButton
                    color="error"
                    onClick={() =>
                      applyActions(
                        delete_element(
                          element.id,
                          mechanism.mechanicalElements,
                          mechanism.constraintElements,
                          mechanism.loads,
                        ),
                      )
                    }
                    onMouseEnter={(_e) => handleMouseEnter(element, true)}
                    onMouseLeave={handleMouseLeave}
                    sx={{ borderRadius: 4 }}
                  >
                    <Delete />
                  </IconButton>
                </Tooltip>
              </StructureOnly>
            </>
          }
        />
      </Box>

      <Divider sx={{ mt: 1, mb: 1.5 }} />

      {"position" in element && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            m: 1,
          }}
        >
          <StructureOnly
            actions={[
              "MoveNode",
              "SetMotorConfig",
              "GroundNode",
              "ChangeGearRadius",
              "CreateElement",
              "DeleteElement",
            ]}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <VectorInput
                value={element.position}
                onChange={(pos) =>
                  applyActions([
                    {
                      type: "MoveNode",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.position,
                      committed: true,
                    },
                  ])
                }
              />
              {element.type === "pivot" && (
                <Tooltip
                  title={t(element.motor ? "motor_revert" : "motor_convert")}
                >
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={() => {
                      const actions: Action[] = [
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: element.motor
                            ? undefined
                            : {
                                speed: DEFAULT.MOTOR_SPEED,
                                torque: DEFAULT.MOTOR_TORQUE,
                              },
                          oldConfig: element.motor,
                        },
                      ];
                      if (!element.motor && !element.isGrounded) {
                        actions.push({
                          type: "GroundNode",
                          id: element.id,
                          grounded: true,
                        });
                      }
                      applyActions(actions);
                    }}
                    sx={{ padding: 0.25, border: 1, borderColor: "divider" }}
                  >
                    <Box
                      component="img"
                      style={{ width: 24, height: 24 }}
                      src={icon(element.motor ? "motor" : "motor-off")}
                    />
                  </IconButton>
                </Tooltip>
              )}
              {element.type === "gear" && (
                <NumberInput
                  label="R"
                  title={t("radius")}
                  kind={LENGTH}
                  value={element.radius}
                  onChange={(radius) => {
                    applyActions([
                      {
                        type: "ChangeGearRadius",
                        id: element.id,
                        newRadius: radius,
                        oldRadius: element.radius,
                        target: new Point2(
                          element.position.x + radius,
                          element.position.y,
                        ),
                        committed: true,
                      },
                    ]);
                  }}
                  large
                  unsigned
                  adornment={
                    linkedConstraint
                      ? {
                          icon: Lock,
                          title: t("length_unlock"),
                          color: "secondary",
                          onMouseEnter: () =>
                            handleMouseEnter(linkedConstraint, true),
                          onMouseLeave: handleMouseLeave,
                          onClick: () =>
                            applyActions([
                              {
                                type: "DeleteElement",
                                element: linkedConstraint,
                              },
                            ]),
                        }
                      : {
                          icon: LockOpen,
                          title: t("length_lock"),
                          onClick: () =>
                            applyActions([
                              {
                                type: "CreateElement",
                                element: create_radius_dimension(
                                  element,
                                  mechanism.viewport,
                                ),
                              },
                            ]),
                        }
                  }
                />
              )}
            </Box>
          </StructureOnly>
          {element.type === "pivot" && element.motor && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                }}
              >
                <NumberInput
                  label="C"
                  title={t("motor_torque_label")}
                  kind={MOMENT}
                  value={(displayMotorConfig ?? element.motor).torque}
                  onChange={(torque) => {
                    const motor = element.motor!;
                    applyActions([
                      {
                        type: "SetMotorConfig",
                        id: element.id,
                        newConfig: { ...motor, torque },
                        oldConfig: motor,
                      },
                    ]);
                  }}
                  unsigned
                  large
                />
                <SignedNumberInput
                  label="ω"
                  title={t("motor_speed_label")}
                  kind={ANGULAR_VELOCITY()}
                  value={(displayMotorConfig ?? element.motor).speed}
                  onChange={(speed) => {
                    const motor = element.motor!;
                    applyActions([
                      {
                        type: "SetMotorConfig",
                        id: element.id,
                        newConfig: { ...motor, speed },
                        oldConfig: motor,
                      },
                    ]);
                  }}
                  large
                  accent
                />
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", textAlign: "center", mb: -0.5 }}
              >
                {t("metric_motor_power")} :{" "}
                {motorPowerSample?.values.length
                  ? format_quantity(motorPowerSample.values[0].value, POWER)
                  : "—"}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {"positionStart" in element && (
        <StructureOnly
          actions={[
            "MoveEdgeStart",
            "MoveEdgeEnd",
            "ChangeEdgeLength",
            "ChangeBeltLength",
            "ChangeDimensionEdgeValue",
            "ChangeDimensionBeltValue",
            "ChangeEdgeAngle",
            "CreateElement",
            "DeleteElement",
          ]}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              m: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <VectorInput
                value={element.positionStart}
                onChange={(pos) =>
                  applyActions([
                    {
                      type: "MoveEdgeStart",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionStart,
                      committed: true,
                    },
                  ])
                }
              />
              <VectorInput
                value={element.positionEnd}
                onChange={(pos) =>
                  applyActions([
                    {
                      type: "MoveEdgeEnd",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionEnd,
                      committed: true,
                    },
                  ])
                }
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 1,
              }}
            >
              <NumberInput
                label="L"
                title={t("length")}
                kind={LENGTH}
                value={
                  element.type === "belt"
                    ? measure_belt_length(element, mechanism.mechanicalElements)
                    : element.positionStart.distance_to(element.positionEnd)
                }
                onChange={(length) => {
                  if (element.type === "belt") {
                    const beltDim = mechanism.constraintElements.find(
                      (c) =>
                        c.type === "dimension-belt" && c.beltID === element.id,
                    );
                    if (beltDim && beltDim.type === "dimension-belt") {
                      // Persistent dimension: update its value.
                      applyActions([
                        {
                          type: "ChangeDimensionBeltValue",
                          id: beltDim.id,
                          newValue: length,
                          oldValue: beltDim.value,
                        },
                      ]);
                    } else {
                      applyActions([
                        {
                          type: "ChangeBeltLength",
                          id: element.id,
                          newLength: length,
                          oldLength: measure_belt_length(
                            element,
                            mechanism.mechanicalElements,
                          ),
                        },
                      ]);
                    }
                    return;
                  }
                  const linkedDim = mechanism.constraintElements.find(
                    (c) =>
                      c.type === "dimension-edge" && c.edgeID === element.id,
                  );
                  if (linkedDim && linkedDim.type === "dimension-edge") {
                    applyActions([
                      {
                        type: "ChangeDimensionEdgeValue",
                        id: linkedDim.id,
                        newValue: length,
                        oldValue: linkedDim.value,
                      },
                    ]);
                  } else {
                    applyActions([
                      {
                        type: "ChangeEdgeLength",
                        id: element.id,
                        newLength: length,
                        oldLength: element.positionStart.distance_to(
                          element.positionEnd,
                        ),
                      },
                    ]);
                  }
                }}
                large
                unsigned
                adornment={
                  linkedConstraint
                    ? {
                        icon: Lock,
                        title: t("length_unlock"),
                        color: "secondary",
                        onMouseEnter: () =>
                          handleMouseEnter(linkedConstraint, true),
                        onMouseLeave: handleMouseLeave,
                        onClick: () =>
                          applyActions([
                            {
                              type: "DeleteElement",
                              element: linkedConstraint,
                            },
                          ]),
                      }
                    : {
                        icon: LockOpen,
                        title: "Bloquer la longueur",
                        onClick: () =>
                          applyActions([
                            {
                              type: "CreateElement",
                              element: create_length_dimension(
                                element,
                                mechanism.mechanicalElements,
                                mechanism.viewport,
                              ),
                            },
                          ]),
                      }
                }
              />
              {element.type !== "belt" && (
                <NumberInput
                  label="α"
                  title={t("angle")}
                  kind={ANGLE}
                  value={wrap_angle_rad(
                    element.positionEnd.sub(element.positionStart).angle(),
                  )}
                  onChange={(newAngle) =>
                    applyActions([
                      {
                        type: "ChangeEdgeAngle",
                        id: element.id,
                        newAngle,
                        oldAngle: element.positionEnd
                          .sub(element.positionStart)
                          .angle(),
                      },
                    ])
                  }
                  large
                />
              )}
            </Box>
          </Box>
        </StructureOnly>
      )}

      <Divider sx={{ mt: 1.5, mb: 1 }} />
      <ConnectionsProperties
        element={element}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        selectedIds={selectedIds}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
        mechanism={mechanism}
      />
      {elementLoads.length > 0 && (
        <Box>
          <Divider sx={{ my: 1 }} />
          <LoadsSection
            element={element}
            mechanicalElements={mechanism.mechanicalElements}
            loads={elementLoads}
            displayLoads={displayLoads}
            selectedLoadID={selectedLoadID}
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
          />
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      <ProbesSection element={element} applyActions={applyActions} />

      {("rotatingEdgesIDs" in element ||
        "parentBeamID" in element ||
        element.type === "gear" ||
        element.type === "beam" ||
        element.type === "spring") && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              mx: 2,
              my: 1.5,
            }}
          >
            {"rotatingEdgesIDs" in element && (
              <NumberInput
                label="bᵣ"
                title={t("rotational_friction")}
                kind={ANGULAR_DAMPING}
                value={element.rotationalFriction}
                onChange={(rotationalFriction) =>
                  applyActions([
                    {
                      type: "ChangeRotationalFriction",
                      id: element.id,
                      delta: rotationalFriction - element.rotationalFriction,
                    },
                  ])
                }
                unsigned
                large
                precision={2}
                step={0.1}
              />
            )}
            {"parentBeamID" in element && (
              <NumberInput
                label="bₛ"
                title={t("sliding_friction")}
                kind={DAMPING}
                value={element.slidingFriction}
                onChange={(slidingFriction) =>
                  applyActions([
                    {
                      type: "ChangeSlidingFriction",
                      id: element.id,
                      delta: slidingFriction - element.slidingFriction,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "gear" && (
              <NumberInput
                label="mₛ"
                title={t("surface_mass")}
                kind={SURFACE_MASS}
                value={element.surfaceMass}
                onChange={(surfaceMass) =>
                  applyActions([
                    {
                      type: "ChangeSurfaceMass",
                      id: element.id,
                      delta: surfaceMass - element.surfaceMass,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "gear" && (
              <NumberInput
                label="J"
                title={t("inertia")}
                kind={INERTIA}
                value={gear_inertia(element.surfaceMass, element.radius)}
                onChange={(inertia) =>
                  applyActions([
                    {
                      type: "ChangeSurfaceMass",
                      id: element.id,
                      delta:
                        surface_mass_for_inertia(inertia, element.radius) -
                        element.surfaceMass,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "beam" && (
              <MaterialProfileSection
                elements={[element]}
                materials={mechanism.materials}
                profiles={mechanism.profiles}
                applyActions={applyActions}
              />
            )}
            {element.type === "spring" && (
              <NumberInput
                label="L₀"
                title={t("rest_length")}
                kind={LENGTH}
                value={
                  element.restLength ??
                  element.positionStart.distance_to(element.positionEnd)
                }
                onChange={(restLength) =>
                  applyActions([
                    {
                      type: "UpdateElementRestLength",
                      id: element.id,
                      newValue: restLength,
                      oldValue: element.restLength,
                    },
                  ])
                }
                implicit={restLengthIsDrawn}
                adornment={{
                  icon: Replay,
                  title: t("back_to_rest"),
                  disabled: restLengthIsDrawn,
                  color: "secondary",
                  onClick: () =>
                    applyActions([
                      {
                        type: "UpdateElementRestLength",
                        id: element.id,
                        newValue: undefined,
                        oldValue: element.restLength,
                      },
                    ]),
                }}
                unsigned
                large
              />
            )}
          </Box>
        </>
      )}

      {/* Les grandeurs mesurées, sous les propriétés : approfondir depuis
              l'onglet Analyse ne doit jamais faire perdre ce qu'on y voyait. */}
      {simulating && (
        <>
          <Divider sx={{ my: 1 }} />
          <ElementMeasures
            element={element}
            runtimeState={runtimeState}
            appMode={appMode}
          />
        </>
      )}
    </Box>
  );
};

export default ElementProperties;
