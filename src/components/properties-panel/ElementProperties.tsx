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
import {
  Delete,
  KeyboardArrowDown,
  ShowChart,
  Public,
  Lock,
  LockOpen,
} from "@mui/icons-material";
import {
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  LoadElement,
  LoadFrame,
  MechanicalElement,
  PivotElement,
  UnionElement,
  available_overlays,
  overlay_shown,
} from "../../types/element";
import {
  frame2world,
  node_candidate_edges,
  world2frame,
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
  ONE,
} from "../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import { delete_element } from "../mechanism/connect-actions";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import SignedNumberInput from "./components/SignedNumberInput";
import ElementDisplay from "./components/ElementDisplay";
import { sorted_for_display } from "./element-order";
import ElementMeasures from "./ElementMeasures";
import { OVERLAY_LABELS, set_overlay } from "./overlay-actions";
import { element_to_hovered_part, linked_constraint } from "../canvas/utils";
import { measure_belt_length } from "../../utils/belt-geom";
import { DIMENSION_SPECS } from "../../constants/rendering-specs";
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
          endIcon={<KeyboardArrowDown sx={{ ml: -0.5 }} />}
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
        startIcon={<ShowChart />}
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

const create_length_dimension = (
  element: EdgeElement,
  mechanicalElements: MechanicalElement[],
): ConstraintElement => {
  const { positionStart, positionEnd } = element;
  const length =
    element.type === "belt"
      ? measure_belt_length(element, mechanicalElements)
      : positionStart.distance_to(positionEnd);
  const mid = positionStart.lerp(positionEnd, 0.5);
  const offset = positionEnd
    .sub(positionStart)
    .perp()
    .scale2length(DIMENSION_SPECS.AUTO_DIMENSION_OFFSET);
  const position = mid.add(offset);
  if (element.type === "belt") {
    return {
      type: "dimension-belt",
      id: crypto.randomUUID(),
      position,
      beltID: element.id,
      value: length,
    };
  }
  return {
    type: "dimension-edge",
    id: crypto.randomUUID(),
    position,
    edgeID: element.id,
    value: length,
  };
};

const create_radius_dimension = (gear: GearElement): ConstraintElement => {
  const position = gear.position.add(
    ONE.scale2length(gear.radius + DIMENSION_SPECS.AUTO_DIMENSION_OFFSET),
  );
  return {
    type: "dimension-radius",
    id: crypto.randomUUID(),
    position,
    gearID: gear.id,
    value: gear.radius,
  };
};

/** Build a SetDistributedForce action from partial new values (rest kept). */
const change_distributed_force = (
  load: DistributedForceElement,
  next: Partial<{
    newDirection: Point2;
    newMagnitudeStart: number;
    newMagnitudeEnd: number;
  }>,
): Action => ({
  type: "ChangeDistributedForce",
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
    const world = frame2world(load.vector, load.frame, mechanicalElements);
    actions.push({
      type: "ChangeForce",
      id: load.id,
      newVector: world2frame(world, newFrame, mechanicalElements),
      oldVector: load.vector,
    });
  } else {
    const world = frame2world(load.direction, load.frame, mechanicalElements);
    actions.push(
      change_distributed_force(load, {
        newDirection: world2frame(world, newFrame, mechanicalElements),
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
      <Public
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
          borderRadius: 3,
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
        <KeyboardArrowDown fontSize="small" sx={{ ml: -0.5 }} />
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
  // Reference edge(s) for the world/edge frame control.
  // When the host is an edge (distributed force, or a force on an edge) that edge is the single reference.
  // For a force on a node, the candidates are the edges attached to it.
  const hostEdge: EdgeElement | undefined =
    "positionStart" in element ? (element as EdgeElement) : undefined;
  const nodeEdges = hostEdge
    ? []
    : node_candidate_edges(element, mechanicalElements);
  const elementLoads = loads.filter((l) => l.targetID === element.id);
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
              pb: 0.5,
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
                  sx={{ borderRadius: 3 }}
                >
                  <Delete sx={{ width: 20, height: 20 }} />
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
                            type: "ChangeForce",
                            id: load.id,
                            newVector: load.vector.scale2length(mag),
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
                            type: "ChangeForce",
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
                          change_distributed_force(load, {
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
                        [
                          change_distributed_force(load, {
                            newMagnitudeStart: v,
                          }),
                        ],
                        "MoveLoad",
                      )
                    }
                  />
                  <NumberInput
                    label="q₁"
                    value={load.magnitudeEnd}
                    onChange={(v) =>
                      applyActions(
                        [
                          change_distributed_force(load, {
                            newMagnitudeEnd: v,
                          }),
                        ],
                        "MoveLoad",
                      )
                    }
                  />
                  <NumberInput
                    label="R (N)"
                    value={
                      (((load.magnitudeStart + load.magnitudeEnd) / 2) *
                        beamLength) /
                      1000
                    }
                    onChange={(resultant) => {
                      if (beamLength <= 0) return;
                      const current =
                        (((load.magnitudeStart + load.magnitudeEnd) / 2) *
                          beamLength) /
                        1000;
                      const next =
                        current > 1e-9
                          ? change_distributed_force(load, {
                              newMagnitudeStart:
                                load.magnitudeStart * (resultant / current),
                              newMagnitudeEnd:
                                load.magnitudeEnd * (resultant / current),
                            })
                          : change_distributed_force(load, {
                              newMagnitudeStart:
                                (resultant / beamLength) * 1000,
                              newMagnitudeEnd: (resultant / beamLength) * 1000,
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
                          type: "ChangeMoment",
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
          (e) => e.id === selectedElement.targetID,
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
                  setHoveredPart={setHoveredPart}
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
                            "Other",
                          )
                        }
                        title="Supprimer"
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
            <>
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
              </StructureOnly>
              <StructureOnly disabled={simulating} row>
                {element.type === "belt" && (
                  <BeltTensionSwitch closed={element.closed} />
                )}
              </StructureOnly>
              <StructureOnly disabled={simulating} row>
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
                    large={true}
                    accent={true}
                    signed={false}
                  />
                )}
              </StructureOnly>
              <StructureOnly disabled={simulating} row>
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
                    large={true}
                    accent={true}
                    signed={false}
                  />
                )}
              </StructureOnly>
              <StructureOnly disabled={simulating} row>
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
                    large={true}
                    accent={true}
                    signed={false}
                  />
                )}
              </StructureOnly>
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
                      "Connects",
                    )
                  }
                  title="Supprimer"
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
                adornment={
                  linkedConstraint
                    ? {
                        icon: Lock,
                        title: "Débloquer la longueur",
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
                            "Other",
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
                                element: create_radius_dimension(element),
                              },
                            ],
                            "CreateConstraint",
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
              adornment={
                linkedConstraint
                  ? {
                      icon: Lock,
                      title: "Débloquer la longueur",
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
                          "Other",
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
                              ),
                            },
                          ],
                          "CreateConstraint",
                        ),
                    }
              }
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
