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
  Menu,
  MenuItem,
  Checkbox,
  Button,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PublicIcon from "@mui/icons-material/Public";
import {
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  ID,
  LoadElement,
  LoadFrame,
  MechanicalElement,
  PivotElement,
  available_overlays,
  overlay_shown,
} from "../../types/element";
import {
  frame_to_world,
  node_candidate_edges,
  world_to_frame,
} from "../../utils/load-geom";
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
  AppMode,
  Mechanism,
  ActionBundleType,
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
import ElementMeasures from "./ElementMeasures";
import { OVERLAY_LABELS, set_overlay } from "./overlay-actions";
import { element_to_hovered_part } from "../canvas/utils";
import { measure_belt_length } from "../../utils/belt-geom";
import React from "react";

interface MotorSectionProps {
  pivot: PivotElement;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

const MotorSection: React.FC<MotorSectionProps> = ({ pivot, applyActions }) => {
  const motor = pivot.motor;
  return (
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
        <Box sx={{ mt: 0.5, display: "flex", alignItems: "center" }}>
          <SignedNumberInput
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
            large={true}
            accent={true}
          />
        </Box>
      )}
    </Box>
  );
};

interface ProbesSectionProps {
  element: MechanicalElement;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  setActiveTab: (tab: PropertiesPanelTab) => void;
}

const ProbesSection: React.FC<ProbesSectionProps> = ({
  element,
  applyActions,
  setActiveTab,
}) => {
  const probes = element.probes ?? [];
  const [metricsAnchorEl, setMetricsAnchorEl] =
    React.useState<null | HTMLElement>(null);
  return (
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
      {/* Les calques applicables à cet élément (le contrôle par élément ; la
          commande en masse vit dans le menu « Afficher » de la top-bar). */}
      {available_overlays(element).map((kind) => (
        <FormControlLabel
          key={kind}
          control={
            <Switch
              size="small"
              checked={overlay_shown(element, kind)}
              onChange={() =>
                applyActions(
                  set_overlay(element, kind, !overlay_shown(element, kind)),
                  "Other",
                )
              }
            />
          }
          label={
            <Typography variant="caption">{OVERLAY_LABELS[kind]}</Typography>
          }
        />
      ))}
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
  );
};

/**
 * Wraps the controls that only make sense at design time (geometry, dimensions,
 * ground, connections, deletion). In simulation they are greyed out: the panel
 * itself teaches which quantities can change mid-run — a live load magnitude next
 * to a greyed bar length says "this one, not that one" without any badge or text.
 */
const StructureOnly: React.FC<{
  disabled: boolean;
  /** Lay the children out in a row (for the header's trailing controls, which
   *  the ElementDisplay would otherwise flow itself). */
  row?: boolean;
  children: React.ReactNode;
}> = ({ disabled, row = false, children }) => (
  <Box
    sx={{
      ...(row && { display: "flex", alignItems: "center" }),
      opacity: disabled ? 0.3 : 1,
      pointerEvents: disabled ? "none" : "auto",
      transition: "opacity 0.2s ease",
    }}
    aria-disabled={disabled}
  >
    {children}
  </Box>
);

const to_deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;
const to_rad = (deg: number) => (deg * Math.PI) / 180;

/** Build a SetDistributedForce action from partial new values (rest kept). */
const set_distributed_force = (
  load: DistributedForceElement,
  next: Partial<{
    newDirection: Point2;
    newMagnitudeStart: number;
    newMagnitudeEnd: number;
  }>,
): Action => ({
  type: "SetDistributedForce",
  id: load.id,
  newDirection: next.newDirection ?? load.direction,
  oldDirection: load.direction,
  newMagnitudeStart: next.newMagnitudeStart ?? load.magnitudeStart,
  oldMagnitudeStart: load.magnitudeStart,
  newMagnitudeEnd: next.newMagnitudeEnd ?? load.magnitudeEnd,
  oldMagnitudeEnd: load.magnitudeEnd,
});

/**
 * Change a load's frame while preserving its visual direction: re-express the
 * stored vector/direction through the reference edge's current orientation so the
 * arrow doesn't jump — only its behaviour under motion changes.
 */
const frame_change_actions = (
  load: ForceElement | DistributedForceElement,
  newFrame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Action[] => {
  const actions: Action[] = [
    { type: "SetLoadFrame", id: load.id, newFrame, oldFrame: load.frame },
  ];
  if (load.type === "force") {
    const world = frame_to_world(load.vector, load.frame, mechanicalElements);
    actions.push({
      type: "MoveForceVector",
      id: load.id,
      newVector: world_to_frame(world, newFrame, mechanicalElements),
      oldVector: load.vector,
    });
  } else {
    const world = frame_to_world(
      load.direction,
      load.frame,
      mechanicalElements,
    );
    actions.push(
      set_distributed_force(load, {
        newDirection: world_to_frame(world, newFrame, mechanicalElements),
      }),
    );
  }
  return actions;
};

interface FrameControlProps {
  load: ForceElement | DistributedForceElement;
  candidateEdges: EdgeElement[];
  mechanicalElements: MechanicalElement[];
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

/** The "world frame" option, laid out like an ElementDisplay small row (globe
 *  icon + label) so it lines up with the edge options. */
const MondeLabel: React.FC = () => (
  <Box sx={{ display: "flex", alignItems: "center", p: "4px" }}>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        m: "-4px",
        pl: 0.25,
        pr: 0.75,
      }}
    >
      <PublicIcon
        sx={{ margin: "2px", width: 20, height: 20, color: "text.primary" }}
      />
      <Typography
        sx={{
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "text.primary",
          lineHeight: 1.5,
        }}
      >
        Monde
      </Typography>
    </Box>
  </Box>
);

/** The load's reference frame: a single control showing the current reference
 *  (Monde, or the edge via ElementDisplay) that opens a menu of World + each
 *  candidate edge. Hidden when no edge can be referenced. */
const FrameControl: React.FC<FrameControlProps> = ({
  load,
  candidateEdges,
  mechanicalElements,
  setHoveredPart,
  setCanvasState,
  applyActions,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  if (candidateEdges.length === 0) return null;

  const frameEdgeID = load.frame !== "world" ? load.frame.edgeID : undefined;
  const currentEdge =
    frameEdgeID !== undefined
      ? (candidateEdges.find((e) => e.id === frameEdgeID) ??
        (mechanicalElements.find(
          (e) => e.id === frameEdgeID && "positionStart" in e,
        ) as EdgeElement | undefined))
      : undefined;
  const clearHover = () => setHoveredPart({ type: "Void", position: ZERO });
  const hoverEdge = (edge: EdgeElement) =>
    setHoveredPart(element_to_hovered_part(edge, false));
  const choose = (frame: LoadFrame) => {
    applyActions(
      frame_change_actions(load, frame, mechanicalElements),
      "Other",
    );
    setAnchorEl(null);
    clearHover();
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Repère :
      </Typography>
      <Box
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onMouseEnter={() => currentEdge && hoverEdge(currentEdge)}
        onMouseLeave={clearHover}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          borderRadius: 1,
          "&:hover": { backgroundColor: "action.hover" },
        }}
      >
        {currentEdge ? (
          <ElementDisplay
            element={currentEdge}
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            size="small"
            editable={false}
            interactive={false}
          />
        ) : (
          <MondeLabel />
        )}
        <KeyboardArrowDownIcon fontSize="small" sx={{ ml: -0.5 }} />
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          dense
          selected={load.frame === "world"}
          onClick={() => choose("world")}
        >
          <MondeLabel />
        </MenuItem>
        {candidateEdges.map((edge) => (
          <MenuItem
            key={edge.id}
            dense
            selected={load.frame !== "world" && load.frame.edgeID === edge.id}
            onClick={() => choose({ mode: "edge", edgeID: edge.id })}
            onMouseEnter={() => hoverEdge(edge)}
            onMouseLeave={clearHover}
          >
            <ElementDisplay
              element={edge}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              size="small"
              editable={false}
              interactive={false}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

interface LoadsSectionProps {
  element: MechanicalElement;
  mechanicalElements: MechanicalElement[];
  loads: LoadElement[];
  selectedLoadID: ID | undefined;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

const LoadsSection: React.FC<LoadsSectionProps> = ({
  element,
  mechanicalElements,
  loads,
  selectedLoadID,
  setHoveredPart,
  setCanvasState,
  applyActions,
}) => {
  // Reference edge(s) for the world/edge frame control. When the host is an edge
  // (distributed force, or a force on an edge) that edge is the single reference.
  // For a force on a node, the candidates are the edges attached to it.
  const hostEdge: EdgeElement | undefined =
    "positionStart" in element ? (element as EdgeElement) : undefined;
  const nodeEdges = hostEdge
    ? []
    : node_candidate_edges(element, mechanicalElements);
  const elementLoads = loads.filter((l) => {
    if (l.type === "force") return l.targetID === element.id;
    return l.beamID === element.id;
  });
  const beamLength =
    "positionStart" in element
      ? element.positionStart.distance_to(element.positionEnd)
      : 0;

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        Charges appliquées
      </Typography>
      {elementLoads.length === 0 ? (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ px: 1, display: "block" }}
        >
          Aucune charge
        </Typography>
      ) : (
        elementLoads.map((load) => (
          <Box
            key={load.id}
            sx={{
              mt: 0.5,
              borderRadius: 3,
              border: 1,
              borderColor:
                load.id === selectedLoadID ? "primary.main" : "transparent",
            }}
          >
            <ElementDisplay
              element={load}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              size="medium"
              editable={true}
              trailingControls={
                <IconButton
                  size="small"
                  color="error"
                  onClick={() =>
                    applyActions(
                      [{ type: "DeleteElement", element: load }],
                      "Other",
                    )
                  }
                  title="Supprimer"
                >
                  <DeleteIcon sx={{ width: 16, height: 16 }} />
                </IconButton>
              }
            />
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
              }}
            >
              {load.type === "force" && (
                <>
                  <NumberInput
                    label="N"
                    value={load.vector.length()}
                    onChange={(mag) =>
                      applyActions(
                        [
                          {
                            type: "MoveForceVector",
                            id: load.id,
                            newVector: load.vector.scale_to_length(mag),
                            oldVector: load.vector,
                          },
                        ],
                        "MoveLoad",
                      )
                    }
                    signed={false}
                  />
                  <NumberInput
                    label="°"
                    value={to_deg(load.vector.angle())}
                    onChange={(deg) =>
                      applyActions(
                        [
                          {
                            type: "MoveForceVector",
                            id: load.id,
                            newVector: Point2.from_polar(
                              load.vector.length(),
                              to_rad(deg),
                            ),
                            oldVector: load.vector,
                          },
                        ],
                        "MoveLoad",
                      )
                    }
                  />
                </>
              )}
              {load.type === "distributed-force" && (
                <>
                  <NumberInput
                    label="°"
                    value={to_deg(load.direction.angle())}
                    onChange={(deg) =>
                      applyActions(
                        [
                          set_distributed_force(load, {
                            newDirection: Point2.from_polar(1, to_rad(deg)),
                          }),
                        ],
                        "MoveLoad",
                      )
                    }
                  />
                  <NumberInput
                    label="q₀"
                    value={load.magnitudeStart}
                    onChange={(v) =>
                      applyActions(
                        [set_distributed_force(load, { newMagnitudeStart: v })],
                        "MoveLoad",
                      )
                    }
                  />
                  <NumberInput
                    label="q₁"
                    value={load.magnitudeEnd}
                    onChange={(v) =>
                      applyActions(
                        [set_distributed_force(load, { newMagnitudeEnd: v })],
                        "MoveLoad",
                      )
                    }
                  />
                  <NumberInput
                    label="R (N)"
                    value={
                      ((load.magnitudeStart + load.magnitudeEnd) / 2) *
                      beamLength
                    }
                    onChange={(resultant) => {
                      if (beamLength <= 0) return;
                      const current =
                        ((load.magnitudeStart + load.magnitudeEnd) / 2) *
                        beamLength;
                      const next =
                        current > 1e-9
                          ? set_distributed_force(load, {
                              newMagnitudeStart:
                                load.magnitudeStart * (resultant / current),
                              newMagnitudeEnd:
                                load.magnitudeEnd * (resultant / current),
                            })
                          : set_distributed_force(load, {
                              newMagnitudeStart: resultant / beamLength,
                              newMagnitudeEnd: resultant / beamLength,
                            });
                      applyActions([next], "MoveLoad");
                    }}
                  />
                </>
              )}
              {load.type === "moment" && (
                <SignedNumberInput
                  label="N·m"
                  value={load.value}
                  onChange={(value) =>
                    applyActions(
                      [
                        {
                          type: "ChangeMomentValue",
                          id: load.id,
                          newValue: value,
                          oldValue: load.value,
                        },
                      ],
                      "MoveLoad",
                    )
                  }
                />
              )}
              {(load.type === "force" || load.type === "distributed-force") && (
                <FrameControl
                  load={load}
                  candidateEdges={hostEdge ? [hostEdge] : nodeEdges}
                  mechanicalElements={mechanicalElements}
                  setHoveredPart={setHoveredPart}
                  setCanvasState={setCanvasState}
                  applyActions={applyActions}
                />
              )}
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
};

interface ElementPropertiesProps {
  element: MechanicalElement | LoadElement | undefined;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
  setActiveTab: (tab: PropertiesPanelTab) => void;
  appMode: AppMode;
  runtimeState: RuntimeState;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element: selectedElement,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
  setActiveTab,
  appMode,
  runtimeState,
}) => {
  // Structure (geometry, dimensions, ground, connections, deletion) is frozen
  // during a simulation; parameters (loads, motor) and observation (probes,
  // overlays) stay live.
  const simulating = appMode !== "edition";
  // A load has no panel of its own: selecting one shows its host element, with
  // the load listed (and editable) in the host's "Charges appliquées" section.
  const element: MechanicalElement | undefined =
    selectedElement &&
    (selectedElement.type === "force" ||
      selectedElement.type === "moment" ||
      selectedElement.type === "distributed-force")
      ? mechanism.mechanicalElements.find(
          (e) =>
            e.id ===
            (selectedElement.type === "force"
              ? selectedElement.targetID
              : selectedElement.beamID),
        )
      : selectedElement;

  // The load whose row should be highlighted (a load was clicked → host shown).
  const selectedLoadID: ID | undefined =
    selectedElement &&
    (selectedElement.type === "force" ||
      selectedElement.type === "moment" ||
      selectedElement.type === "distributed-force")
      ? selectedElement.id
      : undefined;

  const handleMouseEnter = (el: MechanicalElement | LoadElement) => {
    setHoveredPart(element_to_hovered_part(el, true));
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
          {mechanism.mechanicalElements.map((element, index) => (
            <React.Fragment key={index}>
              <ListItem disablePadding>
                <ElementDisplay
                  element={element}
                  setHoveredPart={setHoveredPart}
                  setCanvasState={setCanvasState}
                  applyActions={applyActions}
                  size="medium"
                  editable={true}
                  trailingControls={
                    <StructureOnly disabled={simulating} row>
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

  return (
    <Box sx={{ mb: 1 }}>
      <Box margin={1}>
        <ElementDisplay
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="large"
          editable={true}
          trailingControls={
            <StructureOnly disabled={simulating} row>
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
                      "Connects",
                    )
                  }
                />
              )}
              {element.type === "belt" &&
                (() => {
                  const beltDim = mechanism.constraintElements.find(
                    (c) =>
                      c.type === "dimension-belt" && c.beltID === element.id,
                  );
                  return (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={!!beltDim}
                          onChange={(_, checked) => {
                            if (checked) {
                              applyActions(
                                [
                                  {
                                    type: "CreateElement",
                                    element: {
                                      type: "dimension-belt",
                                      id: crypto.randomUUID(),
                                      position: element.positionStart,
                                      beltID: element.id,
                                      value: measure_belt_length(
                                        element,
                                        mechanism.mechanicalElements,
                                      ),
                                    },
                                  },
                                ],
                                "CreateConstraint",
                              );
                            } else if (beltDim) {
                              applyActions(
                                [{ type: "DeleteElement", element: beltDim }],
                                "Connects",
                              );
                            }
                          }}
                        />
                      }
                      label="Longueur fixée"
                    />
                  );
                })()}
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
                  signed={false}
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
                  signed={false}
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
                  signed={false}
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
            </StructureOnly>
          }
        />
      </Box>

      <Divider sx={{ my: 1 }} />

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
                signed={false}
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
              gap: 2,
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
                    },
                  ],
                  "MoveElement",
                )
              }
            />
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
                      "ChangeDimension",
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
                      "MoveElement",
                    );
                  }
                  return;
                }
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
              signed={false}
            />
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
                    },
                  ],
                  "MoveElement",
                )
              }
            />
          </Box>
        </StructureOnly>
      )}

      {/* Le moteur est un paramètre : réglable à chaud. */}
      {element.type === "pivot" && (
        <>
          <Divider sx={{ my: 1 }} />
          <MotorSection
            pivot={element as PivotElement}
            applyActions={applyActions}
          />
        </>
      )}

      {("position" in element || "positionStart" in element) && (
        <>
          <Divider sx={{ my: 1 }} />
          <StructureOnly disabled={simulating}>
            <ConnectionsProperties
              element={element}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          </StructureOnly>
          <Divider sx={{ my: 1 }} />
          {/* Les charges sont des paramètres : leurs valeurs restent éditables
              pendant la simulation (le mouvement change à partir de maintenant). */}
          <LoadsSection
            element={element}
            mechanicalElements={mechanism.mechanicalElements}
            loads={mechanism.loads}
            selectedLoadID={selectedLoadID}
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
          />
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
        </>
      )}
    </Box>
  );
};

export default ElementProperties;
