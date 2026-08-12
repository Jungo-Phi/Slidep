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
  List,
  ListItem,
  useTheme,
} from "@mui/material";
import {
  Add,
  WarningAmber,
  CheckCircleOutline,
  InfoOutlined,
  Troubleshoot,
  Tune,
  Close,
} from "@mui/icons-material";
import {
  Action,
  AppMode,
  HoveredPart,
  ID,
  MechanicalElement,
  Mechanism,
  ProbeConfig,
  ProbeMetric,
  ZERO,
} from "../../types";
import { CanvasState } from "../../types/canvas-state";
import { ConstraintResidual, RuntimeState } from "../../types/runtime-state";
import { get_probe_series } from "../solver/probe-series";
import { at_recording_end } from "../solver/kinematic-simulation";
import {
  PROBE_METRIC_LABEL_KEYS,
  PROBE_METRIC_ORDER,
  ProbeMetricSelector,
} from "../canvas/ProbeMetricSelector";
import SignedNumberInput from "./components/SignedNumberInput";
import ElementDisplay from "./components/ElementDisplay";
import ProbeChart, {
  ChartCurve,
  probe_curve_colors,
  PROBE_ELEMENT_COLORS,
} from "./components/ProbeChart";
import { get_element_from_id } from "../mechanism/connect-actions";
import { element_to_hovered_part } from "../canvas/utils";
import { shown_element_name } from "../../utils";
import ElementMeasures from "./ElementMeasures";
import { MODE_ANIMATION } from "../../constants/rendering-specs";
import { StringKey, t, tn } from "../../i18n";
import { CanvasHighlight, NO_HIGHLIGHT } from "../canvas/draw-canvas";
import {
  find_redundant_links,
  Redundancy,
  RedundancyGroup,
} from "../solver/redundant-links";
import {
  redundancy_symbol,
  RedundancySymbol,
} from "../solver/redundancy-symbols";
import { Link } from "../../types";
import { undriven_motors } from "../solver/motion-modes";
import { ChainAnalysis, useDofAnalysis } from "./useDofAnalysis";
import { ddl_status } from "./ddl-status";
import { AnimatedMode, useModeAnimation } from "./useModeAnimation";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  /**
   * The mechanism in the pose on screen: what the figures describe.
   *
   * Distinct from `mechanism`, which stays the edited one. In simulation the two differ,
   * and everything the panel can act on — a motor's speed, an element's probes — must go
   * to the edited mechanism, never to the pose a recording happens to be showing.
   */
  analysedMechanism: Mechanism;
  appMode: AppMode;
  applyActions: (actions: Action[]) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  unsatisfied: ConstraintResidual[];
  runtimeState: RuntimeState;
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
  /** The mechanical element the canvas selection points at (a selected load
   *  resolves to its host), or undefined when nothing is selected. */
  selectedElement: MechanicalElement | undefined;
  /** Names the elements the canvas should pick out; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** How a redundant constraint the panel is naming right now would yield; empty clears it. */
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Where the pose the panel is animating is published, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
}

/** Short human label for a solver link type, shown as the violation kind. */
const CONSTRAINT_NOUN: Record<string, StringKey> = {
  MotorBeam: "link_motor",
  MotorAngle: "link_motor",
  Distance: "length",
  FixedOnSegment: "link_fixed_on_segment",
  SlideOnSegment: "link_slide_on_segment",
  Angle: "angle",
  KeepOrientation: "link_keep_orientation",
  GearMeshing: "link_gear_meshing",
  GearMeshAngle: "link_gear_meshing",
  GearRatio: "link_gear_ratio",
  CoaxialAngle: "link_coaxial",
  GearPerimeterPin: "link_gear_perimeter_pin",
  BeamFollowsAngle: "link_beam_follows_angle",
  Normal: "link_normal",
  Parallel: "link_parallel",
  EqualLength: "link_equal_length",
  Horizontal: "link_horizontal",
  Vertical: "link_vertical",
  BeltSegmentNoSlip: "link_belt_no_slip",
  BeltLength: "link_belt_length",
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

/** A motor's speed, wherever its row sits — a mode it drives, or none at all. */
const MotorSpeed: React.FC<{
  element: MechanicalElement | undefined;
  applyActions: (actions: Action[]) => void;
}> = ({ element, applyActions }) => {
  if (element?.type !== "pivot" || !element.motor) return null;
  const config = element.motor;
  return (
    <SignedNumberInput
      label={t("unit_rpm")}
      value={config.speed}
      onChange={(speed) =>
        applyActions(
          [
            {
              type: "SetMotorConfig",
              id: element.id,
              newConfig: { ...config, speed },
              oldConfig: config,
            },
          ],
        )
      }
      accent
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
   * The analysis is debounced, so for up to its delay the modes still name a part the
   * mechanism no longer holds. Rare, brief, and not worth blanking the panel over.
   */
  elementOf: (id: ID) => MechanicalElement | undefined;
  animated: AnimatedMode;
  setAnimated: (animated: AnimatedMode) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  /** A running simulation already shows motion; a mode swung over it would only muddle it. */
  modesPlayable: boolean;
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
  animated,
  setAnimated,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  modesPlayable,
  audit,
  auditing,
  onAudit,
}) => {
  const { chain, mobility, modes, highlight } = analysis;
  const status = ddl_status(mobility.mobility, chain.motors.length, appMode);
  const idleMotors = undriven_motors(chain, modes);
  // The card's own hover, not its animation: entering a mode row keeps it true, since
  // `onMouseEnter` does not fire again for children and `onMouseLeave` waits for the card.
  const [hovered, setHovered] = React.useState(false);

  return (
    <Box
      // Pointing at a chain lights it on the canvas; leaving lets the whole
      // mechanism come back.
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
          <Tooltip disableInteractive title={status.hint}>
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
            // A driven mode carries its motor's speed: now that modes name their
            // motors, a separate motors list would say the same thing twice.
            const motor =
              mode.drivenByMotor && named?.type === "pivot" && named.motor
                ? named
                : undefined;
            return (
              <Box
                key={modeIndex}
                onMouseEnter={() => {
                  if (!modesPlayable) return;
                  setAnimated({ chainIndex: index, modeIndex });
                  // Everything the mode moves, not just what it is named after:
                  // `contributors` is a ranking, trimmed of its small shares.
                  setHighlight(focus(mode.moves));
                }}
                onMouseLeave={() => {
                  if (!modesPlayable) return;
                  setAnimated(null);
                  // The row sits inside the chain's card, which gets no enter
                  // event of its own on the way out — hand the chain back its
                  // own highlight rather than clearing the canvas.
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
                    // Reaching for the speed is not pointing at the mode: the swing
                    // stops so the value can be read while it is being changed.
                    onMouseEnter={() => {
                      setAnimated(null);
                      setHighlight(focus(highlight));
                    }}
                    onMouseLeave={() => {
                      if (!modesPlayable) return;
                      setAnimated({ chainIndex: index, modeIndex });
                      setHighlight(focus(mode.moves));
                    }}
                  >
                    <MotorSpeed element={motor} applyActions={applyActions} />
                  </Box>
                )}
              </Box>
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
                  disableInteractive
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
                <MotorSpeed element={element} applyActions={applyActions} />
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
                // The whole set at once, then one at a time on each row: the reader sees
                // where the redundancy lives before picking through it.
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
  unsatisfied,
  runtimeState,
  setRuntimeState,
  setHighlight,
  setRedundancySymbols,
  modePreviewRef,
  selectedElement,
}) => {
  const { palette } = useTheme();
  const curveColors = probe_curve_colors(palette.primary.main);
  const [superpose, setSuperpose] = React.useState(false);
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
    applyActions(
      [
        {
          type: "SetProbes",
          elementID: element.id,
          newProbes,
          oldProbes: element.probes ?? [],
        },
      ],
    );
  };

  /** Click/drag on a chart: scrub the simulation time (and pause), like the timeline. */
  const seekTime = (t: number) =>
    setRuntimeState((prev) => ({
      ...prev,
      time: t,
      isPlaying: false,
      // Landing on the end is not scrubbing: playing from there records on.
      scrubbed: !at_recording_end(prev.kinematicSnapshots, t),
    }));

  const chart_empty_message = (metric: ProbeMetric): string =>
    t(
      metric === "force"
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

  // The superposed view only makes sense with several probed elements; fall
  // back to the per-element view (and its hidden switch) below that.
  const superposed = superpose && probedElements.length >= 2;

  const analysis = useDofAnalysis(analysedMechanism);

  /** The mode being pointed at, if any. */
  const [animated, setAnimated] = React.useState<AnimatedMode>(null);

  // Starting the simulation leaves the pointer where it was, so no row is ever told it has
  // been left: without this the row it sits on goes on beating for a swing that has stopped
  // and a mechanism that is now moving of its own accord.
  const modesPlayable = !runtimeState.isPlaying;
  React.useEffect(() => {
    if (!modesPlayable) setAnimated(null);
  }, [modesPlayable]);

  /** Redundancy audits already asked for, by chain, and the one currently running. */
  const [audits, setAudits] = React.useState(
    () => new Map<string, Redundancy>(),
  );
  const [auditing, setAuditing] = React.useState<string | null>(null);

  // An audit describes one measurement of one mechanism. A new measurement makes every
  // answer stale at once, however little the edit changed.
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
      // Seconds of solving on a big chain, and it blocks the thread. Handing the browser
      // one frame first is what lets the button show it was pressed.
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

  // Still means analysable and showable: edition, or a simulation on pause. While it plays
  // the mechanism already moves, and a mode swinging on top of it would only muddle that.
  useModeAnimation(
    modePreviewRef,
    analysis.mechanism,
    analysis.model,
    analysis.chains,
    animated,
    modesPlayable,
  );

  // Leaving the tab unmounts the panel without a mouse-leave, which would strand the
  // highlight — and a redundancy symbol — on a canvas nothing is pointing at any more.
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
              reserveHeight
            />
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
              animated={animated}
              setAnimated={setAnimated}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              modesPlayable={modesPlayable}
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

      {/* Unsatisfied constraints */}
      {appMode !== "edition" && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              marginX: 2,
              gap: 0.75,
              mb: -1,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              {t("analysis_unsatisfied")}
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
          {/* Hauteur stable mais pas grande : une seule ligne dans le cas
              fréquent (tout est respecté), la boîte de 96 px seulement quand il
              y a des violations — le saut de hauteur signifie alors quelque chose. */}
          <Box
            sx={{
              height: unsatisfied.length === 0 ? "auto" : 96,
              overflowY: "auto",
              marginX: 2,
              borderRadius: 3,
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
              {unsatisfied.map((constraint, index) => (
                <React.Fragment key={index}>
                  <ListItem disablePadding>
                    <Box
                      sx={{
                        width: "100%",
                      }}
                    >
                      <ElementDisplay // TODO : Pour des trainlingControls de type Typo dans ce cas, le hover doit aussi marcher sur ces éléments
                        element={get_element_from_id(
                          constraint.owner,
                          mechanism.mechanicalElements,
                          mechanism.constraintElements,
                          mechanism.loads,
                        )}
                        hoveredPart={hoveredPart}
                        setHoveredPart={setHoveredPart}
                        selectedIds={selectedIds}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                        size="small"
                        editable={false}
                        trailingControls={
                          <>
                            <WarningAmber fontSize="small" color="warning" />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {CONSTRAINT_NOUN[constraint.type]
                                ? t(CONSTRAINT_NOUN[constraint.type])
                                : constraint.type}{" "}
                              {`e = ${constraint.residual.toFixed(2)} mm`}
                            </Typography>
                          </>
                        }
                      />
                    </Box>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
            {unsatisfied.length === 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.75,
                }}
              >
                <CheckCircleOutline fontSize="small" color="success" />
                <Typography
                  noWrap
                  sx={{
                    fontSize: "0.8rem",
                    color: "text.disabled",
                  }}
                >
                  {t("analysis_all_satisfied")}
                </Typography>
              </Box>
            )}
          </Box>

          <Divider />
        </>
      )}

      {/* Mesures : sondes actives + graphiques */}
      <Box sx={{ mx: 2, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            {t("palette_measurements")}
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
                  <IconButton
                    size="small"
                    onClick={(e) =>
                      setMetricMenu({
                        elementID: element.id,
                        anchorEl: e.currentTarget,
                      })
                    }
                    title={t("analysis_choose_metrics")}
                    sx={{ borderRadius: 3 }}
                  >
                    <Tune fontSize="small" />
                  </IconButton>
                }
              />

              {element.probes.map((probe) => {
                const series = get_probe_series(
                  element,
                  probe.metric,
                  runtimeState.kinematicSnapshots,
                );
                const isVector =
                  probe.metric !== "angle" &&
                  probe.metric !== "angular-velocity";
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
                        disableInteractive
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
            const isVector =
              metric !== "angle" && metric !== "angular-velocity";
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
                  {t(PROBE_METRIC_LABEL_KEYS[metric])}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                  >
                    {` (${unit})`}
                    {isVector && t("chart_norm_suffix")}
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
              applyActions(
                [
                  {
                    type: "SetProbes",
                    elementID: menuElement.id,
                    newProbes,
                    oldProbes: menuElement.probes ?? [],
                  },
                ],
              )
            }
          />
        )}
      </Menu>
    </Box>
  );
};

export default AnalysisPanel;
