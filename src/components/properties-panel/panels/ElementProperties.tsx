/**
 * ElementProperties component
 * Displays properties for element elements
 */

import {
  Box,
  IconButton,
  Divider,
  List,
  ListItem,
  Tooltip,
} from "@mui/material";
import { Delete, Lock, LockOpen } from "@mui/icons-material";
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
import { delete_element } from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";
import NumberInput from "../components/NumberInput";
import SignedNumberInput from "../components/SignedNumberInput";
import ElementDisplay from "../components/ElementDisplay";
import { sorted_for_display } from "../element-order";
import ElementMeasures from "./ElementMeasures";
import { t } from "../../../i18n";
import { element_to_hovered_part, linked_constraint } from "../../canvas/utils";
import { measure_belt_length } from "../../../utils/belt-geom";
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
  STIFFNESS,
  SURFACE_MASS,
  DAMPING,
  wrap_angle_rad,
} from "../../../utils/quantity-format";
import {
  gear_inertia,
  surface_mass_for_inertia,
} from "../../../utils/gear-mass";

/** The ground/unground button's icon, reused as the ElementPicker "world" option
 *  so a motor's anchor reads with the same visual language as the ground toggle. */
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
   *  the values shown for a motor/load while scrubbed; every write still goes to `mechanism`. */
  analysedMechanism: Mechanism;
  appMode: AppMode;
  runtimeState: RuntimeState;
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
    const hasElements = mechanism.mechanicalElements.length > 0;
    return (
      <Box
        sx={{
          borderRadius: 3,
          margin: 2,
          backgroundColor: "background.sunken",
        }}
      >
        <List
          disablePadding
          sx={{
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
            width: "100%",
          }}
        >
          {sorted_for_display(mechanism.mechanicalElements).map((element) => (
            <React.Fragment key={element.id}>
              <ListItem disablePadding>
                <ElementDisplay
                  element={element}
                  hoveredPart={hoveredPart}
                  setHoveredPart={setHoveredPart}
                  selectedIds={selectedIds}
                  setCanvasState={setCanvasState}
                  applyActions={applyActions}
                  size="medium"
                  editable={true}
                  trailingControls={
                    <>
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
                          accent
                          unsigned
                        />
                      )}
                      {element.type === "pivot" && element.motor && (
                        <StructureOnly disabled={simulating}>
                          <SignedNumberInput
                            label="ω"
                            title={t("motor_speed_label")}
                            kind={ANGULAR_VELOCITY()}
                            value={element.motor.speed}
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
                            accent
                          />
                        </StructureOnly>
                      )}
                      <StructureOnly disabled={simulating} row>
                        <Tooltip title={t("delete")}>
                          <IconButton
                            color="error"
                            onMouseEnter={() => handleMouseEnter(element, true)}
                            onMouseLeave={handleMouseLeave}
                            onClick={() =>
                              applyActions([{ type: "DeleteElement", element }])
                            }
                            sx={{ borderRadius: 3 }}
                          >
                            <Delete sx={{ width: 20, height: 20 }} />
                          </IconButton>
                        </Tooltip>
                      </StructureOnly>
                    </>
                  }
                />
              </ListItem>
            </React.Fragment>
          ))}
        </List>
        {!hasElements && (
          <Box
            sx={{
              padding: 2,
              textAlign: "center",
              fontSize: "0.875rem",
              color: "text.disabled",
            }}
          >
            Pas encore d'éléments
          </Box>
        )}
      </Box>
    );
  }

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
              <StructureOnly disabled={simulating} row>
                {"isGrounded" in element &&
                  element.type !== "mass" &&
                  !(element.type === "pivot" && element.motor) && (
                    <Tooltip
                      title={t(element.isGrounded ? "release" : "anchor")}
                    >
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
                          src={icon(
                            element.isGrounded ? "ground" : "ground-off",
                          )}
                        />
                      </IconButton>
                    </Tooltip>
                  )}
              </StructureOnly>

              {element.type === "pivot" && element.motor && motorConfig && (
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
              <StructureOnly disabled={simulating} row>
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
        <StructureOnly disabled={simulating}>
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
            {element.type === "pivot" && element.motor && (
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
                />
              </Box>
            )}
          </Box>
        </StructureOnly>
      )}

      {"positionStart" in element && (
        <StructureOnly disabled={simulating}>
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
      <StructureOnly disabled={simulating}>
        <ConnectionsProperties
          element={element}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          selectedIds={selectedIds}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          mechanism={mechanism}
        />
      </StructureOnly>
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
          <Divider sx={{ mt: 1, mb: 1.5 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
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
              {"rotatingEdgesIDs" in element && (
                <NumberInput
                  label="μᵣ"
                  title={t("rotational_friction")}
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
                  precision={3}
                  step={0.001}
                />
              )}
              {"parentBeamID" in element && (
                <NumberInput
                  label="μₛ"
                  title={t("sliding_friction")}
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
                  precision={2}
                  step={0.01}
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
                  element={element}
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
                  unsigned
                  large
                />
              )}
            </Box>
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
