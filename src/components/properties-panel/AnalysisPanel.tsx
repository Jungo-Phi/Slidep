import React from "react";
import {
  Box,
  Typography,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Checkbox,
  Tooltip,
} from "@mui/material";
import {
  Timeline,
  ShowChart,
  RotateRight,
  Visibility,
  Add,
  WarningAmber,
  CheckCircleOutline,
  Tune,
  Close,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  AppMode,
  HoveredPart,
  ID,
  MechanicalElement,
  Mechanism,
  PivotElement,
  ProbeConfig,
  ProbeMetric,
  ZERO,
} from "../../types";
import { CanvasState } from "../../types/canvas-state";
import { ConstraintResidual, RuntimeState } from "../../types/runtime-state";
import { get_sim_degrees_of_freedom } from "../solver/utils";
import { get_links_simulation, get_sim_nodes } from "../solver/parsing";
import { get_probe_series } from "../solver/probe-series";
import {
  PROBE_METRIC_LABELS,
  PROBE_METRIC_ORDER,
  available_probe_metrics,
  toggled_probes,
} from "../canvas/ProbeMetricSelector";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";
import ProbeChart, {
  ChartCurve,
  PROBE_CURVE_COLORS,
  PROBE_ELEMENT_COLORS,
} from "./components/ProbeChart";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import { element_to_hovered_part } from "../canvas/utils";
import { shown_element_name } from "../../utils";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  appMode: AppMode;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  unsatisfied: ConstraintResidual[];
  runtimeState: RuntimeState;
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
}

/** Short human label for a solver link type, shown as the violation kind. */
const CONSTRAINT_NOUN: Record<string, string> = {
  MotorBeam: "Moteur bloqué",
  MotorAngle: "Moteur bloqué",
  Distance: "Longueur",
  FixedOnSegment: "Position sur poutre",
  SlideOnSegment: "Glissement",
  Angle: "Angle",
  KeepOrientation: "Orientation",
  GearMeshing: "Engrènement",
  GearMeshAngle: "Engrènement",
  GearRatio: "Rapport d'engrenage",
  CoaxialAngle: "Coaxialité",
  GearPerimeterPin: "Liaison engrenage",
  BeamFollowsAngle: "Solidarité engrenage",
  Normal: "Perpendicularité",
  Parallel: "Parallélisme",
  EqualLength: "Égalité de longueur",
  Horizontal: "Horizontalité",
  Vertical: "Verticalité",
};

type DdlStatus = { label: string; color: string };

const plural = (n: number) => (n > 1 ? "s" : "");

/**
 * One DOF number (the mechanism's mobility), read through the lens of the
 * active mode. `residual = mobility − drivers`:
 *  - static: motors act as restraints → classic iso/hyper/mécanisme trichotomy;
 *  - kinematic: the residual measures unpiloted motion;
 *  - dynamic: free DOF are normal (motion comes from forces), not a defect;
 *  - edition: neutral, design-time description (no pilotage judgement).
 */
function ddl_status(
  mobility: number,
  drivers: number,
  appMode: AppMode,
): DdlStatus {
  const residual = mobility - drivers;
  const GREEN = "success.main";
  const ORANGE = "warning.main";
  const RED = "error.main";
  const BLUE = "info.main";
  const GREY = "text.secondary";

  switch (appMode) {
    case "edition":
      if (mobility < 0) return { label: "Sur-contraint", color: RED };
      if (mobility === 0)
        return { label: "Structure rigide — 0 ddl", color: GREY };
      return {
        label: `Mécanisme — ${mobility} ddl mobile${plural(mobility)}`,
        color: BLUE,
      };

    case "static":
      if (residual > 0) return { label: "Instable (mécanisme)", color: ORANGE };
      if (residual === 0) return { label: "Isostatique", color: GREEN };
      return { label: `Hyperstatique (degré ${-residual})`, color: BLUE };

    case "kinematic":
      if (mobility === 0)
        return { label: "Structure rigide — aucun mouvement", color: GREY };
      if (drivers === 0)
        return {
          label: "Aucun moteur — déplacez le mécanisme à la main",
          color: BLUE,
        };
      if (residual === 0) return { label: "Mouvement déterminé", color: GREEN };
      if (residual > 0)
        return {
          label: `Sous-motorisé — ${residual} ddl non piloté${plural(residual)}`,
          color: ORANGE,
        };
      return { label: "Sur-contraint", color: RED };

    case "dynamic":
      if (mobility === 0) return { label: "Structure rigide", color: GREY };
      if (residual < 0) return { label: "Sur-contraint", color: RED };
      if (residual === 0) return { label: "Mouvement déterminé", color: GREEN };
      return {
        label: `Mouvement libre — ${residual} ddl`,
        color: BLUE,
      };
  }
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mechanism,
  appMode,
  applyActions,
  setHoveredPart,
  setCanvasState,
  unsatisfied,
  runtimeState,
  setRuntimeState,
}) => {
  const [overlays, setOverlays] = React.useState({
    forces: false,
    velocities: false,
    constraints: false,
    path: false,
  });
  const [superpose, setSuperpose] = React.useState(false);
  const [metricMenu, setMetricMenu] = React.useState<{
    elementID: ID;
    anchorEl: HTMLElement;
  } | null>(null);

  const toggleOverlay = (key: keyof typeof overlays) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const probedElements = mechanism.mechanicalElements.filter(
    (el): el is MechanicalElement & { probes: ProbeConfig[] } =>
      !!el.probes && el.probes.length > 0,
  );

  const setElementProbes = (
    element: MechanicalElement,
    newProbes: ProbeConfig[],
  ) => {
    applyActions(
      [
        {
          type: "SetProbes",
          elementID: element.id,
          newProbes,
          oldProbes: element.probes ?? [],
        },
      ],
      "Other",
    );
  };

  /** Click/drag on a chart: scrub the simulation time (and pause), like the timeline. */
  const seekTime = (t: number) =>
    setRuntimeState((prev) => ({ ...prev, time: t, isPlaying: false }));

  const chart_empty_message = (metric: ProbeMetric): string =>
    metric === "force"
      ? "Forces non calculées en mode cinématique"
      : appMode === "edition"
        ? "Lancez une simulation pour mesurer"
        : "En attente de données…";

  const element_color = (el: MechanicalElement): string =>
    PROBE_ELEMENT_COLORS[
      probedElements.findIndex((e) => e.id === el.id) %
        PROBE_ELEMENT_COLORS.length
    ];

  const menuElement = metricMenu
    ? probedElements.find((el) => el.id === metricMenu.elementID)
    : undefined;

  // The superposed view only makes sense with several probed elements; fall
  // back to the per-element view (and its hidden switch) below that.
  const superposed = superpose && probedElements.length >= 2;

  const nodes = get_sim_nodes(mechanism.mechanicalElements);
  const links = get_links_simulation(mechanism.mechanicalElements, nodes);

  // Headline value = the mechanism's mobility (DOF), motors NOT subtracted —
  // that is what "degrés de liberté" means to a mechanic (a driven 4-bar reads
  // DDL = 1, not 0). A motor is a driving constraint (its link carries ddl 1),
  // so get_sim_degrees_of_freedom already nets it out; we add it back to recover
  // the bare mobility, and let the mode-specific subtitle read the relation.
  const drivingMotors = links.filter(
    (l) => l.type === "MotorBeam" || l.type === "MotorAngle",
  ).length;
  const mobility = get_sim_degrees_of_freedom(nodes, links) + drivingMotors;
  const status = ddl_status(mobility, drivingMotors, appMode);

  const motorPivots = mechanism.mechanicalElements.filter(
    (el): el is PivotElement => el.type === "pivot" && !!el.motor,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      {/* Overlays */}
      <Box sx={{ mx: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.forces}
                onChange={() => toggleOverlay("forces")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ShowChart fontSize="small" />
                <Typography variant="body2">Forces de réaction</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.velocities}
                onChange={() => toggleOverlay("velocities")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Timeline fontSize="small" />
                <Typography variant="body2">Vitesses</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.constraints}
                onChange={() => toggleOverlay("constraints")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <RotateRight fontSize="small" />
                <Typography variant="body2">Contraintes (MPa)</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.path}
                onChange={() => toggleOverlay("path")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Visibility fontSize="small" />
                <Typography variant="body2">Path (trajectoires)</Typography>
              </Box>
            }
          />
        </Box>
      </Box>

      <Divider />

      {/* DDL Indicator */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Degrés de liberté
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            p: 1,
            borderRadius: 1,
            backgroundColor: "action.hover",
          }}
        >
          <Typography variant="h6" fontWeight={700} color="primary">
            DDL = {mobility}
          </Typography>
          <Typography variant="body2" fontWeight={600} color={status.color}>
            {status.label}
          </Typography>
        </Box>
      </Box>

      {/* Motors */}
      {motorPivots.length > 0 && (
        <>
          <Box sx={{ mx: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Moteurs ({motorPivots.length})
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {motorPivots.map((pivot) => (
                <Box
                  key={pivot.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <ElementDisplay
                    element={pivot}
                    setHoveredPart={setHoveredPart}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    size={"small"}
                    editable={false}
                  ></ElementDisplay>
                  <NumberInput
                    label="tr/min"
                    value={pivot.motor!.speed}
                    onChange={(speed) =>
                      applyActions(
                        [
                          {
                            type: "SetMotorConfig",
                            id: pivot.id,
                            newConfig: { ...pivot.motor!, speed },
                            oldConfig: pivot.motor,
                          },
                        ],
                        "ChangeConstant",
                      )
                    }
                    accent
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      <Divider />

      {/* Unsatisfied constraints */}
      {appMode !== "edition" && (
        <>
          <Box sx={{ mx: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Contraintes non respectées
              </Typography>
              {unsatisfied.length > 0 && (
                <Chip
                  size="small"
                  color="error"
                  label={unsatisfied.length}
                  sx={{ height: 18, "& .MuiChip-label": { px: 0.75 } }}
                />
              )}
            </Box>
            <Box
              sx={{
                height: 96,
                overflowY: "auto",
                borderRadius: 1,
                backgroundColor: "action.hover",
                p: 0.5,
              }}
            >
              {unsatisfied.length === 0 ? (
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                  }}
                >
                  <CheckCircleOutline fontSize="small" color="success" />
                  <Typography variant="caption" color="text.secondary">
                    Toutes les contraintes respectées
                  </Typography>
                </Box>
              ) : (
                unsatisfied.map((c, i) => (
                  <Box
                    key={`${c.owner}-${c.type}-${i}`}
                    onClick={() =>
                      setCanvasState({
                        type: "SelectedElement",
                        elementID: c.owner,
                      })
                    }
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "action.selected" },
                    }}
                  >
                    <ElementDisplay
                      element={get_mechanical_element_from_id(
                        c.owner,
                        mechanism.mechanicalElements,
                      )}
                      setHoveredPart={setHoveredPart}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                      size={"small"}
                      editable={false}
                    ></ElementDisplay>
                    <WarningAmber fontSize="small" color="warning" />
                    <Typography variant="caption" color="text.secondary">
                      {CONSTRAINT_NOUN[c.type] ?? c.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {`e = ${c.residual.toFixed(2)}`}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>

          <Divider />
        </>
      )}

      {/* Mesures : sondes actives + graphiques */}
      <Box sx={{ mx: 2, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Mesures
          </Typography>
          {probedElements.length >= 2 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={superpose}
                  onChange={() => setSuperpose((prev) => !prev)}
                />
              }
              label={<Typography variant="caption">Superposer</Typography>}
              sx={{ mr: 0 }}
            />
          )}
        </Box>

        {!superposed &&
          probedElements.map((el) => (
            <Box
              key={el.id}
              sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
            >
              {/* Element header + metric edit menu */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ElementDisplay
                    element={el}
                    setHoveredPart={setHoveredPart}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    size={"small"}
                    editable={false}
                  ></ElementDisplay>
                </Box>
                <Tooltip title="Choisir les mesures">
                  <IconButton
                    size="small"
                    onClick={(e) =>
                      setMetricMenu({
                        elementID: el.id,
                        anchorEl: e.currentTarget,
                      })
                    }
                  >
                    <Tune fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {el.probes.map((probe) => {
                const series = get_probe_series(
                  el,
                  probe.metric,
                  runtimeState.kinematicSnapshots,
                );
                const isVector =
                  probe.metric !== "angle" &&
                  probe.metric !== "angular-velocity";
                const curves: ChartCurve[] = series.curves
                  .filter((c) =>
                    isVector ? probe.components[c.key as "x" | "y" | "norm"] : true,
                  )
                  .map((c) => ({
                    id: c.key,
                    color: PROBE_CURVE_COLORS[c.key],
                    t: series.t,
                    values: c.values,
                  }));
                // Data exists but every component toggle is off
                const noComponentSelected =
                  series.t.length >= 2 && curves.length === 0;
                return (
                  <Box key={probe.metric}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        mb: 0.25,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        noWrap
                        sx={{ flex: 1, minWidth: 0 }}
                      >
                        {PROBE_METRIC_LABELS[probe.metric]}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          {` (${series.unit})`}
                        </Typography>
                      </Typography>
                      {isVector &&
                        (["x", "y", "norm"] as const).map((k) => (
                          <Chip
                            key={k}
                            label={k === "norm" ? "norme" : k}
                            size="small"
                            clickable
                            onClick={() =>
                              setElementProbes(
                                el,
                                el.probes.map((p) =>
                                  p.metric === probe.metric
                                    ? {
                                        ...p,
                                        components: {
                                          ...p.components,
                                          [k]: !p.components[k],
                                        },
                                      }
                                    : p,
                                ),
                              )
                            }
                            sx={{
                              height: 18,
                              "& .MuiChip-label": { px: 0.75 },
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: probe.components[k]
                                ? "#fff"
                                : "text.secondary",
                              backgroundColor: probe.components[k]
                                ? PROBE_CURVE_COLORS[k]
                                : "action.hover",
                              "&:hover": {
                                backgroundColor: probe.components[k]
                                  ? PROBE_CURVE_COLORS[k]
                                  : "action.selected",
                              },
                            }}
                          />
                        ))}
                      <Tooltip title="Supprimer cette mesure">
                        <IconButton
                          size="small"
                          color="error"
                          sx={{ p: 0.25 }}
                          onClick={() =>
                            setElementProbes(
                              el,
                              el.probes.filter(
                                (p) => p.metric !== probe.metric,
                              ),
                            )
                          }
                        >
                          <Close sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <ProbeChart
                      curves={curves}
                      currentTime={runtimeState.time}
                      emptyMessage={
                        noComponentSelected
                          ? "Aucune composante sélectionnée (x, y, norme)"
                          : chart_empty_message(probe.metric)
                      }
                      onSeek={appMode !== "edition" ? seekTime : undefined}
                    />
                  </Box>
                );
              })}
            </Box>
          ))}

        {/* Superposed mode: one chart per metric, one curve per element */}
        {superposed &&
          PROBE_METRIC_ORDER.filter((metric) =>
            probedElements.some((el) =>
              el.probes.some((p) => p.metric === metric),
            ),
          ).map((metric) => {
            const contributors = probedElements.filter((el) =>
              el.probes.some((p) => p.metric === metric),
            );
            const isVector = metric !== "angle" && metric !== "angular-velocity";
            let unit = "";
            const curves: ChartCurve[] = contributors.flatMap((el) => {
              const series = get_probe_series(
                el,
                metric,
                runtimeState.kinematicSnapshots,
              );
              unit = series.unit;
              const curve = series.curves.find(
                (c) => c.key === (isVector ? "norm" : "value"),
              );
              return curve
                ? [
                    {
                      id: el.id,
                      color: element_color(el),
                      t: series.t,
                      values: curve.values,
                    },
                  ]
                : [];
            });
            return (
              <Box key={metric}>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.25 }}
                >
                  {PROBE_METRIC_LABELS[metric]}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                  >
                    {` (${unit})`}
                    {isVector && " — norme"}
                  </Typography>
                </Typography>
                <ProbeChart
                  curves={curves}
                  currentTime={runtimeState.time}
                  emptyMessage={chart_empty_message(metric)}
                  onSeek={appMode !== "edition" ? seekTime : undefined}
                />
                <Box
                  sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}
                >
                  {contributors.map((el) => (
                    <Chip
                      key={el.id}
                      size="small"
                      variant="outlined"
                      icon={
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: element_color(el),
                            ml: 0.5,
                          }}
                        />
                      }
                      label={shown_element_name(el)}
                      onMouseEnter={() =>
                        setHoveredPart(element_to_hovered_part(el))
                      }
                      onMouseLeave={() =>
                        setHoveredPart({ type: "Void", position: ZERO })
                      }
                      onClick={() =>
                        setCanvasState({
                          type: "SelectedElement",
                          elementID: el.id,
                        })
                      }
                      sx={{ height: 20 }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}

        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => setCanvasState({ type: "PlacingProbe" })}
          fullWidth
        >
          Ajouter une mesure
        </Button>
      </Box>

      {/* Metric edit menu (shared by the element cards) */}
      <Menu
        anchorEl={metricMenu?.anchorEl ?? null}
        open={!!metricMenu && !!menuElement}
        onClose={() => setMetricMenu(null)}
      >
        {menuElement &&
          available_probe_metrics(menuElement).map((metric) => (
            <MenuItem
              key={metric}
              dense
              onClick={() => {
                const newProbes = toggled_probes(menuElement, metric);
                setElementProbes(menuElement, newProbes);
                if (newProbes.length === 0) setMetricMenu(null);
              }}
            >
              <Checkbox
                size="small"
                checked={menuElement.probes.some((p) => p.metric === metric)}
                sx={{ p: 0.5, mr: 0.5 }}
              />
              {PROBE_METRIC_LABELS[metric]}
            </MenuItem>
          ))}
      </Menu>
    </Box>
  );
};

export default AnalysisPanel;
