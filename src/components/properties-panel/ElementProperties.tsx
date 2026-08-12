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
  Typography,
  Switch,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import { Delete, Lock, LockOpen } from "@mui/icons-material";
import {
  ID,
  LoadElement,
  MechanicalElement,
  UnionElement,
} from "../../types/element";
import VectorInput from "./components/VectorInput";
import {
  CanvasState,
  Action,
  AppMode,
  Mechanism,
  Point2,
  PropertiesPanelTab,
  RuntimeState,
  ZERO,
} from "../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import { delete_element } from "../mechanism/connect-actions";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import SignedNumberInput from "./components/SignedNumberInput";
import ElementDisplay from "./components/ElementDisplay";
import { sorted_for_display } from "./element-order";
import ElementMeasures from "./ElementMeasures";
import { t } from "../../i18n";
import { element_to_hovered_part, linked_constraint } from "../canvas/utils";
import { measure_belt_length } from "../../utils/belt-geom";
import { PHYSICS } from "../../constants/rendering-specs";
import React from "react";
import { icon } from "../element-palette/iconDataUris";
import StructureOnly from "./components/StructureOnly";
import ProbesSection from "./components/ProbesSection";
import LoadsSection from "./components/LoadsSection";
import {
  create_length_dimension,
  create_radius_dimension,
} from "./element-dimensions";

const to_deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;
const to_rad = (deg: number) => (deg * Math.PI) / 180;

interface ElementPropertiesProps {
  element: MechanicalElement | LoadElement | undefined;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
  setActiveTab: (tab: PropertiesPanelTab) => void;
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
  setActiveTab,
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
                    <StructureOnly disabled={simulating} row>
                      <IconButton
                        color="error"
                        onMouseEnter={() => handleMouseEnter(element, true)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() =>
                          applyActions(
                            [{ type: "DeleteElement", element }],
                          )
                        }
                        title={t("action_delete")}
                        sx={{ borderRadius: 3 }}
                      >
                        <Delete sx={{ width: 20, height: 20 }} />
                      </IconButton>
                    </StructureOnly>
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
                      disableInteractive
                      title={t(
                        element.isGrounded ? "ground_anchored" : "ground_free",
                      )}
                    >
                      <IconButton
                        color="inherit"
                        size="small"
                        onClick={() =>
                          applyActions(
                            [
                              {
                                type: "GroundNode",
                                id: element.id,
                                grounded: !element.isGrounded,
                              },
                            ],
                          )
                        }
                        sx={{ padding: 0.5, border: 1, borderColor: "divider" }}
                      >
                        <Box
                          component="img"
                          style={{ width: 28, height: 28 }}
                          src={icon(element.isGrounded ? "ground" : "unground")}
                        />
                      </IconButton>
                    </Tooltip>
                  )}
              </StructureOnly>

              {element.type === "pivot" && element.motor && (
                <SignedNumberInput
                  label={t("unit_rpm")}
                  value={element.motor.speed}
                  onChange={(speed) =>
                    applyActions(
                      [
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: { ...element.motor, speed },
                          oldConfig: element.motor,
                        },
                      ],
                    )
                  }
                  large
                  accent
                />
              )}
              {element.type === "mass" && (
                <NumberInput
                  label="kg"
                  value={element.mass}
                  onChange={(mass) =>
                    applyActions(
                      [
                        {
                          type: "ChangeMass",
                          id: element.id,
                          delta: mass - element.mass,
                        },
                      ],
                    )
                  }
                  large
                  accent
                  unsigned
                />
              )}
              {element.type === "spring" && (
                <NumberInput
                  label="N/m"
                  value={element.stiffness}
                  onChange={(stiffness) =>
                    applyActions(
                      [
                        {
                          type: "ChangeStiffness",
                          id: element.id,
                          delta: stiffness - element.stiffness,
                        },
                      ],
                    )
                  }
                  large
                  accent
                  unsigned
                />
              )}
              {element.type === "damper" && (
                <NumberInput
                  label="N·s/m"
                  value={element.damping}
                  onChange={(damping) =>
                    applyActions(
                      [
                        {
                          type: "ChangeDamping",
                          id: element.id,
                          delta: damping - element.damping,
                        },
                      ],
                    )
                  }
                  large
                  accent
                  unsigned
                />
              )}
              <StructureOnly disabled={simulating} row>
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
                  title={t("action_delete")}
                  onMouseEnter={(_e) => handleMouseEnter(element, true)}
                  onMouseLeave={handleMouseLeave}
                  sx={{ borderRadius: 4 }}
                >
                  <Delete />
                </IconButton>
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
              direction: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              m: 1,
            }}
          >
            <VectorInput
              value={element.position}
              onChange={(pos) =>
                applyActions(
                  [
                    {
                      type: "MoveNode",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.position,
                      committed: true,
                    },
                  ],
                )
              }
            />
            {element.type === "pivot" && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!element.motor}
                    onChange={() => {
                      const actions: Action[] = [
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: element.motor
                            ? undefined
                            : { speed: PHYSICS.DEFAULT_MOTOR_SPEED },
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
                  />
                }
                label={
                  <Typography variant="caption">
                    {t("element_motor")}
                  </Typography>
                }
              />
            )}
            {element.type === "gear" && (
              <NumberInput
                value={element.radius}
                onChange={(radius) => {
                  applyActions(
                    [
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
                    ],
                  );
                }}
                label={t("element_radius")}
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
                          applyActions(
                            [
                              {
                                type: "DeleteElement",
                                element: linkedConstraint,
                              },
                            ],
                          ),
                      }
                    : {
                        icon: LockOpen,
                        title: t("length_lock"),
                        onClick: () =>
                          applyActions(
                            [
                              {
                                type: "CreateElement",
                                element: create_radius_dimension(
                                  element,
                                  mechanism.viewport,
                                ),
                              },
                            ],
                          ),
                      }
                }
              />
            )}
          </Box>
        </StructureOnly>
      )}

      {"positionStart" in element && (
        <StructureOnly disabled={simulating}>
          <Box
            sx={{
              display: "flex",
              direction: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              m: 1,
            }}
          >
            <VectorInput
              value={element.positionStart}
              onChange={(pos) =>
                applyActions(
                  [
                    {
                      type: "MoveEdgeStart",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionStart,
                      committed: true,
                    },
                  ],
                )
              }
            />

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              <NumberInput
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
                      applyActions(
                        [
                          {
                            type: "ChangeDimensionBeltValue",
                            id: beltDim.id,
                            newValue: length,
                            oldValue: beltDim.value,
                          },
                        ],
                      );
                    } else {
                      applyActions(
                        [
                          {
                            type: "ChangeBeltLength",
                            id: element.id,
                            newLength: length,
                            oldLength: measure_belt_length(
                              element,
                              mechanism.mechanicalElements,
                            ),
                          },
                        ],
                      );
                    }
                    return;
                  }
                  const linkedDim = mechanism.constraintElements.find(
                    (c) =>
                      c.type === "dimension-edge" && c.edgeID === element.id,
                  );
                  if (linkedDim && linkedDim.type === "dimension-edge") {
                    applyActions(
                      [
                        {
                          type: "ChangeDimensionEdgeValue",
                          id: linkedDim.id,
                          newValue: length,
                          oldValue: linkedDim.value,
                        },
                      ],
                    );
                  } else {
                    applyActions(
                      [
                        {
                          type: "ChangeEdgeLength",
                          id: element.id,
                          newLength: length,
                          oldLength: element.positionStart.distance_to(
                            element.positionEnd,
                          ),
                        },
                      ],
                    );
                  }
                }}
                label={t("length")}
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
                          applyActions(
                            [
                              {
                                type: "DeleteElement",
                                element: linkedConstraint,
                              },
                            ],
                          ),
                      }
                    : {
                        icon: LockOpen,
                        title: "Bloquer la longueur",
                        onClick: () =>
                          applyActions(
                            [
                              {
                                type: "CreateElement",
                                element: create_length_dimension(
                                  element,
                                  mechanism.mechanicalElements,
                                  mechanism.viewport,
                                ),
                              },
                            ],
                          ),
                      }
                }
              />
              {element.type !== "belt" && (
                <NumberInput
                  value={to_deg(
                    element.positionEnd.sub(element.positionStart).angle(),
                  )}
                  onChange={(deg) =>
                    applyActions(
                      [
                        {
                          type: "ChangeEdgeAngle",
                          id: element.id,
                          newAngle: to_rad(deg),
                          oldAngle: element.positionEnd
                            .sub(element.positionStart)
                            .angle(),
                        },
                      ],
                    )
                  }
                  suffix={"°"}
                  label={t("angle")}
                  large
                />
              )}
            </Box>
            <VectorInput
              value={element.positionEnd}
              onChange={(pos) =>
                applyActions(
                  [
                    {
                      type: "MoveEdgeEnd",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionEnd,
                      committed: true,
                    },
                  ],
                )
              }
            />
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
      <ProbesSection
        element={element}
        applyActions={applyActions}
        setActiveTab={setActiveTab}
      />
      {/* Les grandeurs mesurées, sous les propriétés : approfondir depuis
              l'onglet Analyse ne doit jamais faire perdre ce qu'on y voyait. */}
      {simulating && (
        <>
          <Divider sx={{ my: 1 }} />
          <ElementMeasures element={element} runtimeState={runtimeState} />
        </>
      )}
    </Box>
  );
};

export default ElementProperties;
