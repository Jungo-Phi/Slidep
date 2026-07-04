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
  Chip,
  Switch,
  FormControlLabel,
  Menu,
  MenuItem,
  Checkbox,
  Button,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  LoadElement,
  MechanicalElement,
  PivotElement,
  is_node_element,
} from "../../types/element";
import {
  PROBE_METRIC_LABELS,
  available_probe_metrics,
  toggled_probes,
} from "../canvas/ProbeMetricSelector";
import VectorInput from "./components/VectorInput";
import GroundSwitch from "./components/GroundSwitch";
import BeltTensionSwitch from "./components/BeltTensionSwitch";
import {
  CanvasState,
  Action,
  Mechanism,
  ActionBundleType,
  Point2,
  PropertiesPanelTab,
  ZERO,
} from "../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import { delete_element } from "../mechanism/connect-actions";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";
import { element_to_hovered_part } from "../canvas/utils";
import React from "react";

interface MotorSectionProps {
  pivot: PivotElement;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

const MotorSection: React.FC<MotorSectionProps> = ({ pivot, applyActions }) => {
  const motor = pivot.motor;
  return (
    <>
      <Divider sx={{ my: 1 }} />
      <Box sx={{ px: 2, pb: 1 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={!!motor}
              onChange={(e) =>
                applyActions(
                  [
                    {
                      type: "SetMotorConfig",
                      id: pivot.id,
                      newConfig:
                        e.target.checked && motor
                          ? { speed: motor.speed }
                          : undefined,
                      oldConfig: motor,
                    },
                  ],
                  "Other",
                )
              }
            />
          }
          label={<Typography variant="caption">Moteur</Typography>}
        />
        {motor && (
          <Box sx={{ mt: 0.5 }}>
            <NumberInput
              label="tr/min"
              value={motor.speed}
              onChange={(speed) =>
                applyActions(
                  [
                    {
                      type: "SetMotorConfig",
                      id: pivot.id,
                      newConfig: { ...motor, speed },
                      oldConfig: motor,
                    },
                  ],
                  "ChangeConstant",
                )
              }
              accent={true}
            />
          </Box>
        )}
      </Box>
    </>
  );
};

interface ProbesSectionProps {
  element: MechanicalElement;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  setActiveTab: (tab: PropertiesPanelTab) => void;
}

/** The measurements (probe metrics) taken on this element, one labeled row
 *  per role: active-metrics summary + "Mesures ▾" menu button (same checkbox
 *  menu as the probe-placement popover), trajectory switch (nodes only, same
 *  pattern as the Moteur/Ancrage switches), and a text shortcut to the graphs
 *  in the analysis tab. */
const ProbesSection: React.FC<ProbesSectionProps> = ({
  element,
  applyActions,
  setActiveTab,
}) => {
  const probes = element.probes ?? [];
  const [metricsAnchorEl, setMetricsAnchorEl] =
    React.useState<null | HTMLElement>(null);
  return (
    <>
      <Divider sx={{ my: 1 }} />
      <Box
        sx={{
          px: 2,
          pb: 1,
          display: "flex",
          flexDirection: "column",
          gap: 0.25,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Mesures
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="caption"
            color={probes.length > 0 ? "text.primary" : "text.disabled"}
            noWrap
            sx={{ flex: 1, minWidth: 0 }}
          >
            {probes.length > 0
              ? probes.map((p) => PROBE_METRIC_LABELS[p.metric]).join(" · ")
              : "Aucune mesure"}
          </Typography>
          <Button
            size="small"
            endIcon={<KeyboardArrowDownIcon sx={{ ml: -0.5 }} />}
            onClick={(e) => setMetricsAnchorEl(e.currentTarget)}
            sx={{ textTransform: "none", flexShrink: 0, py: 0, minWidth: 0 }}
          >
            Mesures
          </Button>
        </Box>
        {is_node_element(element) && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={!!element.showTrajectory}
                onChange={() =>
                  applyActions(
                    [
                      {
                        type: "SetShowTrajectory",
                        elementID: element.id,
                        newValue: !element.showTrajectory,
                        oldValue: element.showTrajectory ?? false,
                      },
                    ],
                    "Other",
                  )
                }
              />
            }
            label={
              <Typography variant="caption">Afficher la trajectoire</Typography>
            }
          />
        )}
        <Button
          size="small"
          startIcon={<ShowChartIcon />}
          onClick={() => setActiveTab("analysis")}
          sx={{
            textTransform: "none",
            alignSelf: "flex-start",
            py: 0,
            minWidth: 0,
          }}
        >
          Voir les graphiques
        </Button>
        <Menu
          anchorEl={metricsAnchorEl}
          open={!!metricsAnchorEl}
          onClose={() => setMetricsAnchorEl(null)}
        >
          {available_probe_metrics(element).map((metric) => (
            <MenuItem
              key={metric}
              dense
              onClick={() =>
                applyActions(
                  [
                    {
                      type: "SetProbes",
                      elementID: element.id,
                      newProbes: toggled_probes(element, metric),
                      oldProbes: probes,
                    },
                  ],
                  "Other",
                )
              }
            >
              <Checkbox
                size="small"
                checked={probes.some((p) => p.metric === metric)}
                sx={{ p: 0.5, mr: 0.5 }}
              />
              {PROBE_METRIC_LABELS[metric]}
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </>
  );
};

function load_label(load: LoadElement): string {
  if (load.type === "force") {
    const mag = Math.round(Math.sqrt(load.vector.x ** 2 + load.vector.y ** 2));
    return `Force${load.anchor ? ` (${load.anchor})` : ""} — ${mag} N`;
  }
  if (load.type === "moment") return `Moment — ${load.value} N·m`;
  return "Force répartie";
}

interface LoadsSectionProps {
  element: MechanicalElement;
  loads: LoadElement[];
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

const LoadsSection: React.FC<LoadsSectionProps> = ({
  element,
  loads,
  applyActions,
}) => {
  const elementLoads = loads.filter((l) => {
    if (l.type === "force" || l.type === "moment")
      return l.targetID === element.id;
    if (l.type === "distributed-force") return l.beamID === element.id;
    return false;
  });
  if (elementLoads.length === 0) return null;
  return (
    <>
      <Divider sx={{ my: 1 }} />
      <Box sx={{ px: 1, pb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          Charges appliquées
        </Typography>
        <List dense disablePadding>
          {elementLoads.map((load) => (
            <ListItem
              key={load.id}
              disablePadding
              sx={{
                display: "flex",
                justifyContent: "space-between",
                py: 0.25,
              }}
            >
              <Chip
                label={load_label(load)}
                size="small"
                sx={{ fontSize: "0.75rem", bgcolor: "#ffe0cc" }}
              />
              <IconButton
                size="small"
                color="error"
                onClick={() =>
                  applyActions(
                    [{ type: "DeleteElement", element: load }],
                    "Other",
                  )
                }
              >
                <DeleteIcon sx={{ width: 16, height: 16 }} />
              </IconButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </>
  );
};

interface ElementPropertiesProps {
  element: MechanicalElement | undefined;
  selectedLoad?: LoadElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
  setActiveTab: (tab: PropertiesPanelTab) => void;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element,
  selectedLoad,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
  setActiveTab,
}) => {
  const handleMouseEnter = (el: MechanicalElement) => {
    setHoveredPart(element_to_hovered_part(el, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  if (!element && selectedLoad) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: "bold" }}>
          {selectedLoad.type === "force"
            ? "Force"
            : selectedLoad.type === "moment"
              ? "Moment"
              : "Force répartie"}
        </Typography>
        {selectedLoad.type === "force" && (
          <>
            <Typography variant="caption" color="text.secondary">
              Vecteur (x, y)
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, mb: 1 }}>
              <NumberInput
                label="x"
                value={selectedLoad.vector.x}
                onChange={(x) =>
                  applyActions(
                    [
                      {
                        type: "MoveForceVector",
                        id: selectedLoad.id,
                        newVector: new Point2(x, selectedLoad.vector.y),
                        oldVector: selectedLoad.vector,
                      },
                    ],
                    "Other",
                  )
                }
              />
              <NumberInput
                label="y"
                value={selectedLoad.vector.y}
                onChange={(y) =>
                  applyActions(
                    [
                      {
                        type: "MoveForceVector",
                        id: selectedLoad.id,
                        newVector: new Point2(selectedLoad.vector.x, y),
                        oldVector: selectedLoad.vector,
                      },
                    ],
                    "Other",
                  )
                }
              />
            </Box>
          </>
        )}
        {selectedLoad.type === "moment" && (
          <Box sx={{ mt: 0.5, mb: 1 }}>
            <NumberInput
              label="N·m"
              value={selectedLoad.value}
              onChange={(v) =>
                applyActions(
                  [
                    {
                      type: "ChangeMomentValue",
                      id: selectedLoad.id,
                      newValue: v,
                      oldValue: selectedLoad.value,
                    },
                  ],
                  "ChangeConstant",
                )
              }
              accent={true}
            />
          </Box>
        )}
        <IconButton
          size="small"
          color="error"
          onClick={() =>
            applyActions(
              [{ type: "DeleteElement", element: selectedLoad }],
              "Other",
            )
          }
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  if (!element) {
    const hasElements = mechanism.mechanicalElements.length > 0;
    return (
      <Box>
        <Box sx={{ textAlign: "center", p: 4, pb: hasElements ? 2 : 4 }}>
          <Box sx={{ fontSize: "0.875rem", color: "text.disabled" }}>
            Sélectionnez un élément pour voir ses propriétés
          </Box>
        </Box>
        {hasElements && (
          <List
            sx={{
              display: "flex",
              alignItems: "center",
              flexDirection: "column",
              mx: 2,
              my: 1,
            }}
          >
            {mechanism.mechanicalElements.map((element, index) => (
              <React.Fragment key={index}>
                <ListItem
                  disablePadding
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    marginY: "-1px",
                  }}
                >
                  <Box border={2} borderColor={"#00000025"} borderRadius={5}>
                    <ElementDisplay
                      element={element}
                      setHoveredPart={setHoveredPart}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                      size="medium"
                      editable={true}
                    ></ElementDisplay>
                  </Box>

                  <IconButton
                    color="error"
                    onMouseEnter={() => handleMouseEnter(element)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() =>
                      applyActions(
                        [{ type: "DeleteElement", element }],
                        "Other",
                      )
                    }
                    title="Supprimer"
                  >
                    <DeleteIcon sx={{ width: 20, height: 20 }} />
                  </IconButton>
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          m: 1,
        }}
      >
        <ElementDisplay
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="large"
          editable={true}
        ></ElementDisplay>

        {"isGrounded" in element && element.type !== "mass" && (
          <GroundSwitch
            grounded={element.isGrounded}
            setGround={(grounded) =>
              applyActions(
                [{ type: "GroundNode", id: element.id, grounded }],
                "Other",
              )
            }
          />
        )}
        {element.type === "belt" && (
          <BeltTensionSwitch
            tightened={element.tight}
            setTight={(tightened) =>
              applyActions(
                [
                  {
                    type: "TightenBelt",
                    id: element.id,
                    tightened,
                  },
                ],
                "Other",
              )
            }
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
                "ChangeConstant",
              )
            }
            accent={true}
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
                "ChangeConstant",
              )
            }
            accent={true}
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
                "ChangeConstant",
              )
            }
            accent={true}
          />
        )}
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
              "Other",
            )
          }
          title="Supprimer"
          onMouseEnter={(_e) => handleMouseEnter(element)}
          onMouseLeave={handleMouseLeave}
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      <Divider sx={{ my: 1 }} />

      {"position" in element && (
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
            x={element.position.x}
            y={element.position.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveNode",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.position,
                  },
                ],
                "MoveElement",
              )
            }
          />
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
                      // No mouse here: aim the perimeter grab straight out along
                      // +x at the requested radius so the solver resolves to it.
                      target: new Point2(
                        element.position.x + radius,
                        element.position.y,
                      ),
                    },
                  ],
                  "MoveElement",
                );
              }}
              label="Rayon"
              large={true}
            />
          )}
        </Box>
      )}

      {"positionStart" in element && (
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
            x={element.positionStart.x}
            y={element.positionStart.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveEdgeStart",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.positionStart,
                  },
                ],
                "MoveElement",
              )
            }
          />
          <NumberInput
            value={element.positionStart.distance_to(element.positionEnd)}
            onChange={(length) => {
              const linkedDim = mechanism.constraintElements.find(
                (c) => c.type === "dimension-edge" && c.edgeID === element.id,
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
                  "ChangeDimension",
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
                  "MoveElement",
                );
              }
            }}
            large={true}
            label="Longueur"
          />
          <VectorInput
            x={element.positionEnd.x}
            y={element.positionEnd.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveEdgeEnd",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.positionEnd,
                  },
                ],
                "MoveElement",
              )
            }
          />
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      {(element.type === "beam" ||
        element.type === "belt" ||
        element.type === "damper" ||
        element.type === "gear" ||
        element.type === "join" ||
        element.type === "mass" ||
        element.type === "pivot" ||
        element.type === "slidep" ||
        element.type === "slider" ||
        element.type === "spring") && (
        <ConnectionsProperties
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          mechanism={mechanism}
        ></ConnectionsProperties>
      )}

      {element.type === "pivot" && (
        <MotorSection
          pivot={element as PivotElement}
          applyActions={applyActions}
        />
      )}

      <LoadsSection
        element={element}
        loads={mechanism.loads}
        applyActions={applyActions}
      />

      <ProbesSection
        element={element}
        applyActions={applyActions}
        setActiveTab={setActiveTab}
      />
    </Box>
  );
};

export default ElementProperties;
