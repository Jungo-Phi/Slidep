import React from "react";
import {
  Box,
  Typography,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  Tooltip,
  Collapse,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  Add,
  WarningAmber,
  InfoOutlined,
  Troubleshoot,
  Tune,
  Close,
  ExpandMore,
} from "@mui/icons-material";
import {
  Action,
  AppMode,
  HoveredAbscissa,
  HoveredPart,
  ID,
  MechanicalElement,
  Mechanism,
  MotorConfig,
  ProbeConfig,
  ProbeMetric,
  ZERO,
} from "../../../types";
import { CanvasState } from "../../../types/canvas-state";
import {
  DynamicSnapshot,
  KinematicSnapshot,
  RuntimeState,
} from "../../../types/runtime-state";
import {
  get_dynamic_probe_series,
  get_probe_series,
  is_vector_metric,
} from "../../solver/recording/probe-series";
import {
  at_recording_end,
  dynamic_snapshot_at,
} from "../../solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../../solver/recording/cohesion-field";
import {
  metric_shows_zero,
  pool_key_for_metric,
  quantity_kind_for_metric,
} from "../../solver/recording/negligibility-pool";
import { GRAVITY } from "../../../constants/physics-specs";
import type { BeamElement } from "../../../types/element";
import {
  PROBE_METRIC_LABEL_KEYS,
  PROBE_METRIC_ORDER,
  ProbeMetricSelector,
} from "../../canvas/ProbeMetricSelector";
import SignedNumberInput from "../components/SignedNumberInput";
import ElementDisplay from "../components/ElementDisplay";
import ProbeChart, {
  ChartCurve,
  probe_curve_colors,
  PROBE_ELEMENT_COLORS,
} from "../components/ProbeChart";
import CohesionDiagrams from "../components/CohesionDiagrams";
import { element_to_hovered_part } from "../../canvas/utils";
import { shown_element_name } from "../../../utils";
import ElementMeasures from "./ElementMeasures";
import { MODE_ANIMATION } from "../../../constants/interaction-specs";
import { StringKey, t, tn } from "../../../i18n";
import { CanvasHighlight, NO_HIGHLIGHT } from "../../canvas/drawing/draw-canvas";
import {
  find_redundant_links,
  Redundancy,
  RedundancyGroup,
} from "../../solver/analysis/redundant-links";
import {
  redundancy_symbol,
  RedundancySymbol,
} from "../../solver/analysis/redundancy-symbols";
import { Link } from "../../../types";
import { undriven_motors } from "../../solver/analysis/motion-modes";
import { ChainAnalysis, useDofAnalysis } from "../useDofAnalysis";
import { ddl_status } from "../ddl-status";
import { AnimatedMode, useModeAnimation } from "../useModeAnimation";
import {
  ANGULAR_VELOCITY,
  ENERGY,
  display_unit,
} from "../../../utils/quantity-format";
import { compute_energy_balance } from "../../solver/analysis/energy-balance";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  /**
   * The mechanism in the pose on screen: what the figures describe.
   *
   * Distinct from `mechanism`, which stays the edited one.
   * In simulation the two differ, and everything the panel can act on — a motor's speed, an element's probes — must go to the edited mechanism, never to the pose a recording happens to be showing.
   */
  analysedMechanism: Mechanism;
  appMode: AppMode;
  applyActions: (actions: Action[]) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  /** Motors standing blocked at the cursor — see `motors_blocked_at`. */
  blockedMotors: ReadonlySet<ID>;
  runtimeState: RuntimeState;
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
  /** The mechanical element the canvas selection points at (a selected load
   * resolves to its host), or undefined when nothing is selected. */
  selectedElement: MechanicalElement | undefined;
  /** Names the elements the canvas should pick out; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** How a redundant constraint the panel is naming right now would yield; empty clears it. */
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Where the pose the panel is animating is published, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
  /** Publishes the abscissa hovered on the selected beam's N/T/Mf diagrams. */
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
}

/** Short human label for a solver link type, shown as the violation kind. */
const CONSTRAINT_NOUN: Record<string, StringKey> = {
  MotorBeam: "locked_motor",
  MotorAngle: "locked_motor",
  Distance: "length",
  FixedOnSegment: "fixed_on_segment",
  SlideOnSegment: "slide_on_segment",
  Angle: "angle",
  KeepOrientation: "keep_orientation",
  GearMeshing: "gear_meshing",
  GearMeshAngle: "gear_meshing",
  GearRatio: "gear_ratio",
  CoaxialAngle: "coaxial",
  GearPerimeterPin: "gear_perimeter_pin",
  BeamFollowsAngle: "beam_follows_angle",
  Normal: "normal",
  Parallel: "parallel",
  EqualLength: "equal_length",
  Horizontal: "horizontal",
  Vertical: "vertical",
  BeltSegmentNoSlip: "belt_no_slip",
  BeltLength: "belt_length",
};

/** What one element's dispensable constraints are, in words: "2 × Distance". */
const redundancy_kinds = (group: RedundancyGroup): string => {
  const counts = new Map<string, number>();
  for (const link of group.links) {
    const noun = CONSTRAINT_NOUN[link.type]
      ? t(CONSTRAINT_NOUN[link.type])
      : link.type;
    counts.set(noun, (counts.get(noun) ?? 0) + 1);
  }
  return [...counts]
    .map(([noun, count]) => (count > 1 ? `${count} × ${noun}` : noun))
    .join(", ");
};

/** Point the canvas at these elements: something to look at, not something wrong with them. */
const focus = (elements: Iterable<ID>): CanvasHighlight => ({
  elements: new Set(elements),
  kind: "focus",
});

/** The same, for constraints an audit found dispensable. Drawn red. */
const fault = (elements: Iterable<ID>): CanvasHighlight => ({
  elements: new Set(elements),
  kind: "fault",
});

/** Stable identity for the resting state, like `NO_HIGHLIGHT`. */
const EMPTY_SYMBOLS: RedundancySymbol[] = [];

/** The four curves the "Bilan énergétique" chart can show — see `EnergyBalanceSeries`. */
const ENERGY_COMPONENTS = ["kinetic", "potential", "mechanical", "netWorkIn"] as const;
type EnergyComponent = (typeof ENERGY_COMPONENTS)[number];

const ENERGY_COMPONENT_LABEL_KEYS: Record<EnergyComponent, StringKey> = {
  kinetic: "energy_balance_kinetic",
  potential: "energy_balance_potential",
  mechanical: "energy_balance_mechanical",
  netWorkIn: "energy_balance_net_work",
};

/** What each curve actually is — on its own chip rather than a single header tooltip, since
 * the four are different enough (one is a rate integral, the rest are state) that a shared blurb either says too little about each or grows too long to skim. */
const ENERGY_COMPONENT_HINT_KEYS: Record<EnergyComponent, StringKey> = {
  kinetic: "energy_balance_kinetic_hint",
  potential: "energy_balance_potential_hint",
  mechanical: "energy_balance_mechanical_hint",
  netWorkIn: "energy_balance_net_work_hint",
};

/** The motor config to *show*, resolved through `analysedElementOf` — the pose on screen,
 * which while scrubbed can hold a different value than the live mechanism. */
const motor_config_at = (
  analysedElementOf: (id: ID) => MechanicalElement | undefined,
  id: ID,
): MotorConfig | undefined => {
  const shown = analysedElementOf(id);
  return shown?.type === "pivot" ? shown.motor : undefined;
};

/**
 * A motor's speed, wherever its row sits — a mode it drives, or none at all.
 *
 * `element` (live) is what the edit is built against — id and `oldConfig` must always name the mechanism's actual current config, whatever value happens to be on screen.
 * `displayConfig` is only what's shown before the user touches it: while scrubbed to a past instant, it is the config that was in effect there, which can differ from the live one.
 */
const MotorSpeed: React.FC<{
  element: MechanicalElement | undefined;
  displayConfig: MotorConfig | undefined;
  applyActions: (actions: Action[]) => void;
  /** The mechanism is not following this motor — see `motors_blocked_at`. */
  blocked?: boolean;
}> = ({ element, displayConfig, applyActions, blocked = false }) => {
  if (element?.type !== "pivot" || !element.motor) return null;
  const config = element.motor;
  return (
    <SignedNumberInput
      label="ω"
      title={t("motor_speed_label")}
      kind={ANGULAR_VELOCITY()}
      value={(displayConfig ?? config).speed}
      onChange={(speed) =>
        applyActions([
          {
            type: "SetMotorConfig",
            id: element.id,
            newConfig: { ...config, speed },
            oldConfig: config,
          },
        ])
      }
      accent
      alert={blocked}
    />
  );
};

/** One chain's block: its mobility headline, its motors, and its redundancies. */
const ChainCard: React.FC<{
  analysis: ChainAnalysis;
  index: number;
  appMode: AppMode;
  setHighlight: (highlight: CanvasHighlight) => void;
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Turns a set of links into the symbols showing how each of them yields. */
  symbolsFor: (links: Link[]) => RedundancySymbol[];
  /**
   * The element a mode is named after — absent only in the moment after a deletion.
   *
   * The analysis is debounced, so for up to its delay the modes still name a part the deletion has already removed.
   * Rare, brief, and not worth blanking the panel over.
   */
  elementOf: (id: ID) => MechanicalElement | undefined;
  /** Same lookup, in the pose on screen — only for the motor speed shown, never for the
   * action `elementOf`'s result feeds; see `MotorSpeed`. */
  analysedElementOf: (id: ID) => MechanicalElement | undefined;
  animated: AnimatedMode;
  setAnimated: (animated: AnimatedMode) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  /** A running simulation already shows motion; a mode swung over it would only muddle it. */
  modesPlayable: boolean;
  /** Motors standing blocked at the cursor — see `motors_blocked_at`. */
  blockedMotors: ReadonlySet<ID>;
  /** The redundancy audit's answer for this chain, or undefined until it is asked for. */
  audit: Redundancy | undefined;
  auditing: boolean;
  onAudit: () => void;
}> = ({
  analysis,
  index,
  appMode,
  setHighlight,
  setRedundancySymbols,
  symbolsFor,
  elementOf,
  analysedElementOf,
  animated,
  setAnimated,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  modesPlayable,
  blockedMotors,
  audit,
  auditing,
  onAudit,
}) => {
  const { chain, mobility, modes, highlight } = analysis;
  const status = ddl_status(mobility.mobility, chain.motors.length, appMode);
  const idleMotors = undriven_motors(chain, modes);
  // The card's own hover, not its animation: entering a mode row keeps it true, since `onMouseEnter` does not fire again for children and `onMouseLeave` waits for the card.
  const [hovered, setHovered] = React.useState(false);
  // Which mode row has the cursor on its speed field, so the row's own tooltip can stand aside for the field's — mouseover bubbles, and the two would otherwise stack.
  const [speedHovered, setSpeedHovered] = React.useState<number | null>(null);

  return (
    <Box
      // Pointing at a chain lights it on the canvas; leaving lets the whole mechanism come back.
      onMouseEnter={() => {
        setHovered(true);
        setHighlight(focus(highlight));
      }}
      onMouseLeave={() => {
        setHovered(false);
        setHighlight(NO_HIGHLIGHT);
        setRedundancySymbols(EMPTY_SYMBOLS);
      }}
      sx={{
        display: "flex",
        flexDirection: "column",
        py: 1,
        gap: 0.5,
        borderRadius: 1,
        backgroundColor: hovered ? "background.hover" : "background.sunken",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1 }}>
        <Typography
          variant="body1"
          fontWeight={700}
          color="primary"
          sx={{ flex: 1 }}
        >
          {t("ddl_abbrev")} = {mobility.mobility}
        </Typography>

        {/* The verdict is a couple of words; the sentence behind it waits behind the
            mark rather than crowding a row meant to be read at a glance. */}
        <Typography
          variant="body2"
          fontWeight={600}
          color={status.color}
          noWrap
          sx={{ maxWidth: "75%" }}
        >
          {status.label}
        </Typography>
        {status.hint && (
          <Tooltip title={status.hint}>
            <InfoOutlined
              sx={{
                fontSize: 16,
                color: "text.disabled",
                "&:hover": { color: "text.secondary" },
              }}
            />
          </Tooltip>
        )}
      </Box>

      {/* One row per mode: pointing at it swings the mechanism along that freedom. */}
      {(modes.length > 0 || idleMotors.length > 0) && (
        <Box sx={{ display: "flex", flexDirection: "column", mx: 1 }}>
          {modes.map((mode, modeIndex) => {
            const shown =
              animated?.chainIndex === index &&
              animated?.modeIndex === modeIndex;
            const named = elementOf(mode.dominant);
            // A driven mode carries its motor's speed: the mode already names the motor, so a separate motors list would say the same thing twice.
            const motor =
              mode.drivenByMotor && named?.type === "pivot" && named.motor
                ? named
                : undefined;
            const motorDisplayConfig = motor
              ? motor_config_at(analysedElementOf, motor.id)
              : undefined;
            const motorBlocked = motor !== undefined && blockedMotors.has(motor.id);
            return (
              // The whole row carries the block's explanation, since the whole row is what turns red.
              // An empty title renders no tooltip, which is how a row that is not blocked — or one whose speed field is speaking for itself — stays silent.
              <Tooltip
                key={modeIndex}
                title={
                  motorBlocked && speedHovered !== modeIndex
                    ? t("ddl_motor_blocked_hint")
                    : ""
                }
              >
                <Box
                  onMouseEnter={() => {
                    if (!modesPlayable) return;
                    setAnimated({ chainIndex: index, modeIndex });
                    // Everything the mode moves, not just what it is named after: `contributors` is a ranking, trimmed of its small shares.
                    setHighlight(focus(mode.moves));
                  }}
                  onMouseLeave={() => {
                    if (!modesPlayable) return;
                    setAnimated(null);
                    // The row sits inside the chain's card, which gets no enter event of its own on the way out — hand the chain back its own highlight rather than clearing the canvas.
                    setHighlight(focus(highlight));
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.2,
                    borderRadius: 3,
                    cursor: "default",
                    backgroundColor: shown ? "action.selected" : "transparent",
                    // A block only ever exists while a simulation runs, which is exactly when no mode is being swung, so the two never fight over this background.
                    ...(motorBlocked && {
                      backgroundColor: (theme) => alpha(theme.palette.error.main, 0.12),
                    }),
                    ...(shown && {
                      animation: `mode-beat ${MODE_ANIMATION.PERIOD_S / 2}s ease-in-out infinite`,
                      "@keyframes mode-beat": {
                        "0%, 100%": { backgroundColor: "action.selected" },
                        "50%": { backgroundColor: "action.hover" },
                      },
                    }),
                  }}
                >
                  {/* The mode's identity, and the only inert part of the row while a
                      simulation plays. Opacity multiplies down the tree, so the speed
                      input has to sit outside it to keep its own. */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flex: 1,
                      minWidth: 0,
                      opacity: modesPlayable ? 1 : 0.5,
                    }}
                  >
                    <Chip
                      size="small"
                      color={shown ? "primary" : "default"}
                      label={modeIndex + 1}
                      sx={{
                        width: 18,
                        height: 18,
                        ml: 0.5,
                        pr: 0.75,
                        fontWeight: 600,
                      }}
                    />

                    {named && (
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <ElementDisplay
                          element={named}
                          hoveredPart={hoveredPart}
                          setHoveredPart={setHoveredPart}
                          selectedIds={selectedIds}
                          setCanvasState={setCanvasState}
                          applyActions={applyActions}
                          size="small"
                          editable={false}
                          interactive={false}
                        />
                      </Box>
                    )}
                  </Box>
                  {motor && (
                    <Box
                      // Reaching for the speed is not pointing at the mode: the swing stops so the value can be read while it is being changed.
                      onMouseEnter={() => {
                        setSpeedHovered(modeIndex);
                        setAnimated(null);
                        setHighlight(focus(highlight));
                      }}
                      onMouseLeave={() => {
                        setSpeedHovered(null);
                        if (!modesPlayable) return;
                        setAnimated({ chainIndex: index, modeIndex });
                        setHighlight(focus(mode.moves));
                      }}
                    >
                      <MotorSpeed
                        element={motor}
                        displayConfig={motorDisplayConfig}
                        applyActions={applyActions}
                        blocked={motorBlocked}
                      />
                    </Box>
                  )}
                </Box>
              </Tooltip>
            );
          })}

          {/* A motor with no freedom of its own to name it after. It has no mode row,
              so this is the only place it exists in the panel — and the verdict above
              has just called the chain over-driven without saying which one is spare. */}
          {idleMotors.map((id) => {
            const element = elementOf(id);
            if (!element) return null;
            return (
              <Box
                key={id}
                onMouseEnter={() => setHighlight(focus([id]))}
                onMouseLeave={() => setHighlight(focus(highlight))}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  py: 0.2,
                  borderRadius: 3,
                  cursor: "default",
                }}
              >
                <Tooltip
                  title={t("ddl_motor_undriven_hint")}
                >
                  <WarningAmber
                    sx={{ fontSize: 16, ml: 0.5, color: "warning.main" }}
                  />
                </Tooltip>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ElementDisplay
                    element={element}
                    hoveredPart={hoveredPart}
                    setHoveredPart={setHoveredPart}
                    selectedIds={selectedIds}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    size="small"
                    editable={false}
                    interactive={false}
                  />
                </Box>
                <MotorSpeed
                  element={element}
                  displayConfig={motor_config_at(analysedElementOf, id)}
                  applyActions={applyActions}
                />
              </Box>
            );
          })}
        </Box>
      )}

      {/* `h = m − G` cannot be negative: the rank of a constraint set never exceeds the
          number of rows, so a shortfall means the probe missed a motion and the exhaustive
          sweep missed it too. That is a broken measurement, not a mechanical property —
          it is said as such rather than shown as a count of −2 redundant constraints, and
          it is never left silent, since every figure on the card is then understated. */}
      {mobility.hyperstaticity < 0 && (
        <Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ mx: 1 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ display: "block" }}
              color="warning.main"
            >
              {t("ddl_measure_incomplete")}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              {tn("ddl_measure_incomplete_hint", -mobility.hyperstaticity)}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Hyperstaticity: a separate fact, never a negative DOF. */}
      {mobility.hyperstaticity > 0 && (
        <Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ mx: 1 }}>
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ display: "block" }}
              color="info.main"
            >
              {t("ddl_hyperstatic_heading")} ·{" "}
              {tn("ddl_hyperstatic_degree", mobility.hyperstaticity)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              {t("ddl_hyperstatic_hint")}
            </Typography>

            {/* Naming the joints costs one mobility measurement per link — seconds on a
                big chain — so it waits to be asked for. */}
            {audit === undefined ? (
              <Button
                size="small"
                variant="text"
                disabled={auditing}
                onClick={onAudit}
                startIcon={
                  auditing ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <Troubleshoot fontSize="small" />
                  )
                }
                sx={{ mt: 0.5 }}
              >
                {t("ddl_locate")}
              </Button>
            ) : audit.groups.length === 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.5, fontStyle: "italic" }}
              >
                {t("ddl_redundant_none")}
              </Typography>
            ) : (
              <Box
                // The whole set at once, then one at a time on each row: the reader sees where the redundancy lives before picking through it.
                onMouseEnter={() => {
                  setHighlight(fault(audit.groups.flatMap((g) => g.elements)));
                  setRedundancySymbols(symbolsFor(audit.links));
                }}
                onMouseLeave={() => {
                  setHighlight(focus(highlight));
                  setRedundancySymbols(EMPTY_SYMBOLS);
                }}
                sx={{ mt: 0.5 }}
              >
                {audit.groups.map((group) => {
                  const element = elementOf(group.owner);
                  if (!element) return null;
                  return (
                    <Box
                      key={group.owner}
                      onMouseEnter={() => {
                        setHighlight(fault(group.elements));
                        setRedundancySymbols(symbolsFor(group.links));
                      }}
                      onMouseLeave={() => {
                        setHighlight(
                          fault(audit.groups.flatMap((g) => g.elements)),
                        );
                        setRedundancySymbols(symbolsFor(audit.links));
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 0.5,
                        borderRadius: 3,
                      }}
                    >
                      {/* The constraint is what is one too many; the element only says
                          where it sits. Naming the element first read as an invitation to
                          delete the part, which removes far more than the constraint. */}
                      <Typography variant="caption" fontWeight={600} noWrap>
                        {redundancy_kinds(group)}
                      </Typography>
                      <Box sx={{ minWidth: 0, opacity: 0.75 }}>
                        <ElementDisplay
                          element={element}
                          hoveredPart={hoveredPart}
                          setHoveredPart={setHoveredPart}
                          selectedIds={selectedIds}
                          setCanvasState={setCanvasState}
                          applyActions={applyActions}
                          size="small"
                          editable={false}
                          interactive={false}
                        />
                      </Box>
                    </Box>
                  );
                })}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  {t("ddl_redundant_candidates")}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mechanism,
  analysedMechanism,
  appMode,
  applyActions,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  blockedMotors,
  runtimeState,
  setRuntimeState,
  setHighlight,
  setRedundancySymbols,
  modePreviewRef,
  selectedElement,
  setHoveredAbscissa,
}) => {
  const { palette } = useTheme();
  const curveColors = probe_curve_colors(palette.primary.main);
  const [superpose, setSuperpose] = React.useState(false);
  // Collapsed by default: a diagnostic for the solver's own conservation, not something most mechanisms need read every run — see docs discussion, "Bilan énergétique".
  const [energyExpanded, setEnergyExpanded] = React.useState(false);
  // "Totale" and "travail net" on by default — the pair the diagnostic is actually about; kinetic/potential are there to answer "where did it go", opted into like x/y/norm.
  const [energyComponents, setEnergyComponents] = React.useState<
    Record<EnergyComponent, boolean>
  >({ kinetic: false, potential: false, mechanical: true, netWorkIn: true });
  const energyBalance = React.useMemo(
    () =>
      appMode === "dynamic"
        ? compute_energy_balance(runtimeState.simulationSnapshots as DynamicSnapshot[])
        : { t: [], kinetic: [], potential: [], mechanical: [], netWorkIn: [] },
    [appMode, runtimeState.simulationSnapshots],
  );
  const [metricMenu, setMetricMenu] = React.useState<{
    elementID: ID;
    anchorEl: HTMLElement;
  } | null>(null);

  const probedElements = mechanism.mechanicalElements.filter(
    (el): el is MechanicalElement & { probes: ProbeConfig[] } =>
      !!el.probes && el.probes.length > 0,
  );

  const setElementProbes = (
    element: MechanicalElement,
    newProbes: ProbeConfig[],
  ) => {
    applyActions([
      {
        type: "SetProbes",
        elementID: element.id,
        newProbes,
        oldProbes: element.probes ?? [],
      },
    ]);
  };

  /** Click/drag on a chart: scrub the simulation time (and pause), like the timeline. */
  const seekTime = (t: number) =>
    setRuntimeState((prev) => ({
      ...prev,
      time: t,
      isPlaying: false,
      // Landing on the end is not scrubbing: playing from there records on.
      scrubbed: !at_recording_end(prev.simulationSnapshots, t),
    }));

  const isReactionMetric = (metric: ProbeMetric): boolean =>
    metric === "force" ||
    metric === "force-start" ||
    metric === "force-end" ||
    metric === "moment" ||
    metric === "moment-start" ||
    metric === "moment-end";

  const chart_empty_message = (metric: ProbeMetric): string =>
    t(
      appMode === "kinematic" && isReactionMetric(metric)
        ? "chart_force_kinematic"
        : appMode === "edition"
          ? "chart_run_simulation"
          : "chart_waiting",
    );

  const element_color = (el: MechanicalElement): string =>
    PROBE_ELEMENT_COLORS[
      probedElements.findIndex((e) => e.id === el.id) %
        PROBE_ELEMENT_COLORS.length
    ];

  const menuElement = metricMenu
    ? probedElements.find((el) => el.id === metricMenu.elementID)
    : undefined;

  // The superposed view only makes sense with several probed elements; fall back to the per-element view (and its hidden switch) below that.
  const superposed = superpose && probedElements.length >= 2;

  const analysis = useDofAnalysis(analysedMechanism);

  /** The mode being pointed at, if any. */
  const [animated, setAnimated] = React.useState<AnimatedMode>(null);

  // Starting the simulation leaves the pointer where it was, so no row is ever told it has been left: without this the row it sits on goes on beating for a swing that has stopped and a mechanism that is now moving of its own accord.
  const modesPlayable = !runtimeState.isPlaying;
  React.useEffect(() => {
    if (!modesPlayable) setAnimated(null);
  }, [modesPlayable]);

  /** Redundancy audits already asked for, by chain, and the one currently running. */
  const [audits, setAudits] = React.useState(
    () => new Map<string, Redundancy>(),
  );
  const [auditing, setAuditing] = React.useState<string | null>(null);

  // An audit describes one measurement of one mechanism.
  // A new measurement makes every answer stale at once, however little the edit changed.
  const measuredModel = analysis.model;
  React.useEffect(() => {
    setAudits(new Map());
    setAuditing(null);
  }, [measuredModel]);

  const runAudit = React.useCallback(
    (chainAnalysis: ChainAnalysis) => {
      if (!measuredModel) return;
      const { chain, mobility } = chainAnalysis;
      setAuditing(chain.id);
      // Seconds of solving on a big chain, and it blocks the thread.
      // Handing the browser one frame first is what lets the button show it was pressed.
      setTimeout(() => {
        const found = find_redundant_links(measuredModel, chain, mobility);
        setAudits((prev) => new Map(prev).set(chain.id, found));
        setAuditing(null);
      }, 0);
    },
    [measuredModel],
  );

  /** Turns a set of links into the symbols showing how each yields — only some types have one. */
  const symbolsFor = React.useCallback(
    (links: Link[]): RedundancySymbol[] => {
      if (!measuredModel) return EMPTY_SYMBOLS;
      const symbols: RedundancySymbol[] = [];
      for (const link of links) {
        const symbol = redundancy_symbol(measuredModel, link);
        if (symbol) symbols.push(symbol);
      }
      return symbols;
    },
    [measuredModel],
  );

  // Still means analysable and showable: edition, or a simulation on pause.
  // While it plays the mechanism already moves, and a mode swinging on top of it would only muddle that.
  useModeAnimation(
    modePreviewRef,
    analysis.mechanism,
    analysis.model,
    analysis.chains,
    animated,
    modesPlayable,
  );

  // Leaving the tab unmounts the panel without a mouse-leave, which would strand the highlight — and a redundancy symbol — on a canvas nothing is pointing at any more.
  React.useEffect(
    () => () => {
      setHighlight(NO_HIGHLIGHT);
      setRedundancySymbols(EMPTY_SYMBOLS);
    },
    [setHighlight, setRedundancySymbols],
  );

  /** The element a mode is named after, for its row's `ElementDisplay`. */
  const elementOf = React.useCallback(
    (id: ID) => mechanism.mechanicalElements.find((el) => el.id === id),
    [mechanism.mechanicalElements],
  );

  /** Same lookup, in the pose on screen — for `MotorSpeed`'s displayed value only. */
  const analysedElementOf = React.useCallback(
    (id: ID) => analysedMechanism.mechanicalElements.find((el) => el.id === id),
    [analysedMechanism.mechanicalElements],
  );

  // N/T/Mf diagrams (docs/plan-efforts-interieurs.md phase 5bis) — a beam selected, dynamic mode, read off the recorded snapshot nearest the cursor the same way every other measure in this panel does (`ElementMeasures`'s own `get_dynamic_metric_at`), rather than the live per-frame ref the canvas itself draws from: this panel re-renders declaratively off `runtimeState`, not off a `requestAnimationFrame` loop.
  const selectedBeam: BeamElement | undefined =
    selectedElement?.type === "beam" ? selectedElement : undefined;
  const cohesionField = React.useMemo(() => {
    if (!selectedBeam || appMode !== "dynamic") return undefined;
    const dynSnap = dynamic_snapshot_at(
      runtimeState.simulationSnapshots as DynamicSnapshot[],
      runtimeState.time,
    );
    const cohesion = dynSnap?.beamCohesion?.find(
      (c) => c.beamID === selectedBeam.id,
    );
    if (!dynSnap || !cohesion) return undefined;
    const gravity = mechanism.simulation.gravity ? GRAVITY : ZERO;
    return compute_cohesion_field(
      selectedBeam,
      mechanism.materials,
      mechanism.profiles,
      cohesion,
      mechanism.loads,
      dynSnap,
      gravity,
    );
  }, [
    selectedBeam,
    appMode,
    runtimeState.simulationSnapshots,
    runtimeState.time,
    mechanism.simulation.gravity,
    mechanism.loads,
    mechanism.materials,
    mechanism.profiles,
  ]);

  // Clears the canvas's hover marker on deselection and when this panel goes away — nothing else ever un-sets it once a diagram stops being hovered without the mouse ever leaving.
  React.useEffect(() => {
    if (!selectedBeam) {
      setHoveredAbscissa(null);
      return;
    }
    return () => setHoveredAbscissa(null);
  }, [selectedBeam, setHoveredAbscissa]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      {appMode !== "edition" && (
        <>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "left",
              gap: 0.5,
            }}
          >
            {selectedElement ? (
              <ElementDisplay
                element={selectedElement}
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
                size={"small"}
                editable={false}
              />
            ) : (
              <Typography
                variant="subtitle2"
                fontWeight={600}
                sx={{ mx: 2 }}
                gutterBottom
              >
                {t("analysis_selected_element")}
              </Typography>
            )}

            <ElementMeasures
              element={selectedElement}
              runtimeState={runtimeState}
              appMode={appMode}
              reserveHeight
            />

            {selectedBeam && (
              <CohesionDiagrams
                field={cohesionField}
                forcePoolMax={runtimeState.negligibilityPool.force}
                momentPoolMax={runtimeState.negligibilityPool.moment}
                emptyMessage={t(
                  appMode === "kinematic"
                    ? "cohesion_kinematic"
                    : "chart_waiting",
                )}
                onHoverS={(s) =>
                  setHoveredAbscissa(
                    s === null ? null : { beamID: selectedBeam.id, s },
                  )
                }
              />
            )}
          </Box>

          <Divider />
        </>
      )}

      {/* DDL Indicator — one block per kinematic chain */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {t("ddl_heading")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {analysis.chains.map((chainAnalysis, index) => (
            <ChainCard
              key={chainAnalysis.chain.id}
              analysis={chainAnalysis}
              index={index}
              appMode={appMode}
              setHighlight={setHighlight}
              setRedundancySymbols={setRedundancySymbols}
              symbolsFor={symbolsFor}
              elementOf={elementOf}
              analysedElementOf={analysedElementOf}
              animated={animated}
              setAnimated={setAnimated}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              modesPlayable={modesPlayable}
              blockedMotors={blockedMotors}
              audit={audits.get(chainAnalysis.chain.id)}
              auditing={auditing === chainAnalysis.chain.id}
              onAudit={() => runAudit(chainAnalysis)}
            />
          ))}
          {/* Only once measured: an empty list before the first pass means "not
              yet", which is not the same statement as "nothing moves". */}
          {analysis.ready && analysis.chains.length === 0 && (
            <Typography variant="body2" color="text.disabled" sx={{ p: 1 }}>
              {t("ddl_rigid_zero")}
            </Typography>
          )}
        </Box>
      </Box>

      <Divider />

      {/* Bilan énergétique — diagnostic du solveur, pas une mesure du mécanisme : replié par
          défaut, jamais recalculé côté solveur (voir `EnergySample`), donc gratuit à ouvrir. */}
      {appMode === "dynamic" &&
        (() => {
          const componentColors: Record<EnergyComponent, string> = {
            kinetic: PROBE_ELEMENT_COLORS[1],
            potential: PROBE_ELEMENT_COLORS[2],
            mechanical: curveColors.value,
            netWorkIn: PROBE_ELEMENT_COLORS[4],
          };
          const curves: ChartCurve[] = ENERGY_COMPONENTS.filter(
            (k) => energyComponents[k],
          ).map((k) => ({
            id: k,
            color: componentColors[k],
            t: energyBalance.t,
            values: energyBalance[k],
          }));
          const peak = curves.reduce(
            (m, c) => c.values.reduce((mm, v) => Math.max(mm, Math.abs(v)), m),
            0,
          );
          const unit = display_unit(peak, ENERGY);
          return (
            <>
              <Box sx={{ mx: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                    {t("energy_balance_heading")}
                    {/* Only once there is a chart to name a unit for — collapsed, the
                        heading describes the section, not a reading. */}
                    {energyExpanded && (
                      <Typography
                        component="span"
                        variant="subtitle2"
                        color="text.secondary"
                      >
                        {` (${unit.symbol})`}
                      </Typography>
                    )}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setEnergyExpanded((prev) => !prev)}
                    sx={{ borderRadius: 3 }}
                  >
                    <ExpandMore
                      fontSize="small"
                      sx={{
                        transform: energyExpanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s ease",
                      }}
                    />
                  </IconButton>
                </Box>
                <Collapse in={energyExpanded}>
                  <Box sx={{ pt: 0.5 }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: 0.5,
                        mb: 0.5,
                      }}
                    >
                      {ENERGY_COMPONENTS.map((k) => (
                        <Tooltip key={k} title={t(ENERGY_COMPONENT_HINT_KEYS[k])}>
                          <Chip
                            label={t(ENERGY_COMPONENT_LABEL_KEYS[k])}
                            size="small"
                            clickable
                            onClick={() =>
                              setEnergyComponents((prev) => ({ ...prev, [k]: !prev[k] }))
                            }
                            sx={{
                              height: 20,
                              "& .MuiChip-label": { px: 1 },
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: energyComponents[k] ? "common.white" : "text.secondary",
                              backgroundColor: energyComponents[k]
                                ? componentColors[k]
                                : "background.sunken",
                              "&:hover": {
                                backgroundColor: energyComponents[k]
                                  ? componentColors[k]
                                  : "action.hover",
                              },
                            }}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                    <ProbeChart
                      curves={curves}
                      currentTime={runtimeState.time}
                      poolMax={0}
                      ownFloor={0}
                      unitFactor={unit.factor}
                      // Never forced: `potential`/`mechanical` carry the drawing's own coordinate-origin offset (see `EnergyBalanceSeries`), so pulling 0 into view could squash their real excursion the way it would for a `position` chart — same reasoning as `metric_shows_zero`'s exceptions.
                      showZero={false}
                      emptyMessage={
                        curves.length === 0
                          ? t("chart_no_component")
                          : t("chart_waiting")
                      }
                      onSeek={seekTime}
                    />
                  </Box>
                </Collapse>
              </Box>

              <Divider />
            </>
          );
        })()}

      {/* Mesures : sondes actives + graphiques */}
      <Box sx={{ mx: 2, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            {t("measurements")}
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
          probedElements.map((element) => (
            <Box
              key={element.id}
              sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
            >
              {/* Element header + metric edit menu */}
              <ElementDisplay
                element={element}
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
                size={"small"}
                editable={false}
                trailingControls={
                  <Tooltip title={t("analysis_choose_metrics")}>
                    <IconButton
                      size="small"
                      onClick={(e) =>
                        setMetricMenu({
                          elementID: element.id,
                          anchorEl: e.currentTarget,
                        })
                      }
                      sx={{ borderRadius: 3 }}
                    >
                      <Tune fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              />

              {element.probes.map((probe) => {
                const series =
                  appMode === "kinematic"
                    ? get_probe_series(
                        element,
                        probe.metric,
                        runtimeState.simulationSnapshots as KinematicSnapshot[],
                      )
                    : get_dynamic_probe_series(
                        element,
                        probe.metric,
                        runtimeState.simulationSnapshots as DynamicSnapshot[],
                      );
                const isVector = is_vector_metric(probe.metric);
                const curves: ChartCurve[] = series.curves
                  .filter((c) =>
                    isVector
                      ? probe.components[c.key as "x" | "y" | "norm"]
                      : true,
                  )
                  .map((c) => ({
                    id: c.key,
                    color: curveColors[c.key],
                    t: series.t,
                    values: c.values,
                  }));
                // Data exists but every component toggle is off
                const noComponentSelected =
                  series.t.length >= 2 && curves.length === 0;
                // The chart's own SI prefix (mN, µN, kN…), picked from what it actually shows rather than the metric's bare base unit — named once here, in the header, so every label inside the chart can stay a bare mantissa in the same unit instead of repeating it.
                const peak = curves.reduce(
                  (m, c) =>
                    c.values.reduce((mm, v) => Math.max(mm, Math.abs(v)), m),
                  0,
                );
                const unit = display_unit(
                  peak,
                  quantity_kind_for_metric(probe.metric),
                );
                return (
                  <Box
                    key={probe.metric}
                    onMouseEnter={() =>
                      setHoveredPart(element_to_hovered_part(element))
                    }
                    onMouseLeave={() =>
                      setHoveredPart({ type: "Void", position: ZERO })
                    }
                  >
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
                        {t(PROBE_METRIC_LABEL_KEYS[probe.metric])}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          {` (${unit.symbol})`}
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
                                element,
                                element.probes.map((p) =>
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
                                ? "common.white"
                                : "text.secondary",
                              backgroundColor: probe.components[k]
                                ? curveColors[k]
                                : "background.sunken",
                              "&:hover": {
                                backgroundColor: probe.components[k]
                                  ? curveColors[k]
                                  : "action.hover",
                              },
                            }}
                          />
                        ))}
                      <Tooltip
                        title={t("analysis_remove_metric")}
                      >
                        <IconButton
                          size="small"
                          color="error"
                          sx={{ p: 0.25 }}
                          onClick={() =>
                            setElementProbes(
                              element,
                              element.probes.filter(
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
                      poolMax={
                        runtimeState.negligibilityPool[
                          pool_key_for_metric(probe.metric)
                        ]
                      }
                      ownFloor={
                        runtimeState.negligibilityPool.ownFloors[
                          pool_key_for_metric(probe.metric)
                        ]
                      }
                      unitFactor={unit.factor}
                      showZero={metric_shows_zero(probe.metric)}
                      emptyMessage={
                        noComponentSelected
                          ? t("chart_no_component")
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
            const isVector = is_vector_metric(metric);
            const curves: ChartCurve[] = contributors.flatMap((el) => {
              const series =
                appMode === "kinematic"
                  ? get_probe_series(
                      el,
                      metric,
                      runtimeState.simulationSnapshots as KinematicSnapshot[],
                    )
                  : get_dynamic_probe_series(
                      el,
                      metric,
                      runtimeState.simulationSnapshots as DynamicSnapshot[],
                    );
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
            // The chart's own SI prefix, picked from what it actually shows — see the per-element mode above for the same reasoning.
            const peak = curves.reduce(
              (m, c) =>
                c.values.reduce((mm, v) => Math.max(mm, Math.abs(v)), m),
              0,
            );
            const unit = display_unit(peak, quantity_kind_for_metric(metric));
            return (
              <Box key={metric}>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.25 }}
                >
                  {t(PROBE_METRIC_LABEL_KEYS[metric])}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                  >
                    {` (${unit.symbol})`}
                    {isVector && t("chart_norm_suffix")}
                  </Typography>
                </Typography>
                <ProbeChart
                  curves={curves}
                  currentTime={runtimeState.time}
                  poolMax={
                    runtimeState.negligibilityPool[pool_key_for_metric(metric)]
                  }
                  ownFloor={
                    runtimeState.negligibilityPool.ownFloors[
                      pool_key_for_metric(metric)
                    ]
                  }
                  unitFactor={unit.factor}
                  showZero={metric_shows_zero(metric)}
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
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={!!metricMenu && !!menuElement}
        onClose={() => setMetricMenu(null)}
      >
        {menuElement && (
          <ProbeMetricSelector
            element={menuElement}
            onToggle={(newProbes) =>
              applyActions([
                {
                  type: "SetProbes",
                  elementID: menuElement.id,
                  newProbes,
                  oldProbes: menuElement.probes ?? [],
                },
              ])
            }
          />
        )}
      </Menu>
    </Box>
  );
};

export default AnalysisPanel;
