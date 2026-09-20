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
  useTheme,
} from "@mui/material";
import {
  Add,
  WarningAmber,
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
  MotorConfig,
  ProbeConfig,
  ProbeMetric,
  WorldPoint,
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
  get_beam_stress_series,
  get_probe_series,
  is_beam_stress_metric,
  is_vector_metric,
  metric_needs_dynamics,
  ProbeSeries,
} from "../../solver/recording/probe-series";
import { dynamic_snapshot_at } from "../../solver/dynamics/simulation-engine";
import {
  CohesionField,
  compute_cohesion_field,
  shear_admissible_stress,
} from "../../solver/recording/cohesion-field";
import { beam_strength } from "../../../utils/section-properties";
import {
  metric_shows_zero,
  pool_key_for_metric,
  quantity_kind_for_metric,
} from "../../solver/recording/negligibility-pool";
import { GRAVITY } from "../../../constants/physics-specs";
import type { BeamElement, LoadElement } from "../../../types/element";
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
import ForceBalanceTable from "../components/ForceBalanceTable";
import { useDismissOnShortcut } from "../../common/dismiss-popups";
import { is_probes_only_bundle } from "../../mechanism/action-kind";
import {
  BalanceTerm,
  ForceBalance,
  HoveredBalanceTerm,
  MomentBalanceReference,
  compute_force_balance,
  resolve_moment_balance_point,
} from "../../solver/analysis/force-balance";
import { element_to_hovered_part } from "../../canvas/utils";
import type { HoveredAbscissa } from "../../../types/hovered-part";
import type { FocusedOverlay } from "../../canvas/drawing/drawing-functions";

import { shown_element_name } from "../../../utils";
import { MODE_ANIMATION } from "../../../constants/interaction-specs";
import { StringKey, t, tn } from "../../../i18n";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "../../canvas/drawing/draw-canvas";
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
  FORCE,
  MOMENT,
  display_unit,
  format_quantity,
} from "../../../utils/quantity-format";

/** How the loop-residual list is ordered: a force magnitude and a moment added together, units and all.
 * Only ever a rank between beams of one mechanism, never a figure shown. */
const residual_rank = (r: CohesionField["loopResidual"]): number =>
  Math.hypot(r.fx, r.fy) + Math.abs(r.m);

/** The canvas hover a load's own arrow answers to — what a cursor resting on it would set, so pointing at its line in the balance thickens the very same stroke. */
function load_hovered_part(
  loadID: ID,
  position: WorldPoint,
  loads: LoadElement[],
): HoveredPart {
  const load = loads.find((candidate) => candidate.id === loadID);
  const type =
    load?.type === "moment"
      ? "Moment"
      : load?.type === "distributed-force"
        ? "DistributedForce"
        : "Force";
  return { type, id: loadID, position, deleting: false, part: "body" };
}

/** What the cursor rests on in the balance, named the way it survives a rebuild: one term by its own id, a whole sum, or the law's right-hand member. */
type HoveredBalanceLine = {
  id: string | "total" | "inertia";
  quantity: "force" | "moment";
};

/** What a hovered line names, resolved against the balance on screen — `null` wherever there is no balance left to read it in, the inertia member included.
 * That is the only thing that un-names a line whose row was unmounted under the cursor, an unmount firing no leave event.
 * The inertia member is no term of any sum, so it resolves to itself rather than to a list. */
function hovered_from(
  line: HoveredBalanceLine,
  balance: ForceBalance | undefined,
): HoveredBalanceTerm | null {
  if (!balance) return null;
  if (line.id === "inertia")
    return { terms: [], inertia: true, quantity: line.quantity };
  const terms =
    line.id === "total"
      ? balance.actions
      : balance.actions.filter((action) => action.id === line.id);
  return terms.length > 0 ? { terms, quantity: line.quantity } : null;
}

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
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;
  /** Motors standing blocked at the cursor — see `motors_blocked_at`. */
  blockedMotors: ReadonlySet<ID>;
  runtimeState: RuntimeState;
  /** Moves the cursor to an instant read off a chart — see `PropertiesPanel`'s own. */
  seekTime: (time: number) => void;
  /** Names the elements the canvas should pick out; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** How a redundant constraint the panel is naming right now would yield; empty clears it. */
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Publishes the elements a freedom carrying no inertia moves, for the inspector above to paint the mass they are missing. */
  setInertiaFreeElements: (elements: ReadonlySet<ID>) => void;
  /** Where the pose the panel is animating is published, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
  /** See `App`'s own `hoveredBalanceTerm`. */
  setHoveredBalanceTerm: (hovered: HoveredBalanceTerm | null) => void;
  /** Where along the selected beam a hovered chart's value was found, for the canvas to tick — the same channel the selection inspector's own N/T/Mf diagrams use (`HoveredAbscissa`). */
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
  /** See `App`'s own `momentBalanceReference`. */
  momentBalanceReference: MomentBalanceReference;
  setMomentBalanceReference: (reference: MomentBalanceReference) => void;
  /** See `App`'s own `momentBalanceReferenceHovered`. */
  setMomentBalanceReferenceHovered: (hovered: boolean) => void;
  /** See `App`'s own `setFocusedOverlay`. */
  setFocusedOverlay: (overlay: FocusedOverlay) => void;
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

/** What the panel publishes once it has nothing to say about inertia any more. */
const NO_ELEMENTS: ReadonlySet<ID> = new Set();

/** Point the canvas at these elements: something to look at, not something wrong with them. */
const focus = (elements: Iterable<ID>): CanvasHighlight => ({
  elements: new Set(elements),
  kind: "focus",
});

/**
 * The same, for constraints an audit found dispensable.
 * Drawn red.
 */
const fault = (elements: Iterable<ID>): CanvasHighlight => ({
  elements: new Set(elements),
  kind: "fault",
});

/** Stable identity for the resting state, like `NO_HIGHLIGHT`. */
const EMPTY_SYMBOLS: RedundancySymbol[] = [];

/** The four curves the "Bilan énergétique" chart can show — see `EnergyBalanceSeries`. */
/** The motor config to *show*, resolved through `analysedElementOf` — the pose on screen, which while scrubbed can hold a different value than the live mechanism. */
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
  /** Same lookup, in the pose on screen — only for the motor speed shown, never for the action `elementOf`'s result feeds; see `MotorSpeed`. */
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
            const motorBlocked =
              motor !== undefined && blockedMotors.has(motor.id);
            // A freedom nothing weighs: in dynamics whatever speed it takes is the solver's own mass floor talking.
            // Said only there — the other modes never read a mass — and only where no motor drives the freedom, since a prescribed motion answers to its motor rather than to its inertia.
            const noInertia =
              appMode === "dynamic" && mode.inertiaFree && !mode.drivenByMotor;
            return (
              // The whole row carries the block's explanation, since the whole row is what turns red.
              // An empty title renders no tooltip, which is how a row that is not blocked — or one whose speed field is speaking for itself — stays silent.
              <Tooltip
                key={modeIndex}
                title={
                  motorBlocked && speedHovered !== modeIndex
                    ? t("ddl_motor_blocked_hint")
                    : noInertia
                      ? t("mode_no_inertia_hint")
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
                    // Two rows the mechanism cannot answer for, painted alike: a motor it will not follow, and a freedom nothing weighs.
                    // Swinging a mode wins the background back below, which is what keeps the two from fighting over it.
                    ...((motorBlocked || noInertia) && {
                      backgroundColor: "errorSoft",
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

                    {noInertia && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: "warning.main",
                          whiteSpace: "nowrap",
                          pr: 1,
                        }}
                      >
                        {t("mode_no_inertia")}
                      </Typography>
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
                <Tooltip title={t("ddl_motor_undriven_hint")}>
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
  canvasState,
  setCanvasState,
  blockedMotors,
  runtimeState,
  seekTime,
  setHighlight,
  setRedundancySymbols,
  setInertiaFreeElements,
  modePreviewRef,
  setHoveredBalanceTerm,
  setHoveredAbscissa,
  momentBalanceReference,
  setMomentBalanceReference,
  setMomentBalanceReferenceHovered,
  setFocusedOverlay,
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
    applyActions([
      {
        type: "SetProbes",
        elementID: element.id,
        newProbes,
        oldProbes: element.probes ?? [],
      },
    ]);
  };

  /**
   * The running scale and the own-floor this metric's chart is judged against, both 0 for a metric the pool does not bound (see `pool_key_for_metric`) — which is how a chart opts out of the negligibility flattening altogether, as the energy balance does.
   */
  const pool_scales = (metric: ProbeMetric): { poolMax: number; ownFloor: number } => {
    const key = pool_key_for_metric(metric);
    if (!key) return { poolMax: 0, ownFloor: 0 };
    return {
      poolMax: runtimeState.negligibilityPool[key],
      ownFloor: runtimeState.negligibilityPool.ownFloors[key],
    };
  };

  /**
   * What a probe plots, and — for the readings taken along a beam — where along its span each value was found.
   * A beam's efforts and stresses come out of the recording's stress cache rather than the snapshots (`is_beam_stress_metric`), which is also the one door its `axial-force` goes through; a spring's or a damper's goes through its own law like every other metric.
   */
  const probe_readout = (
    element: MechanicalElement,
    metric: ProbeMetric,
  ): { series: ProbeSeries; abscissa?: number[] } => {
    if (element.type === "beam" && is_beam_stress_metric(metric))
      return get_beam_stress_series(element.id, metric, runtimeState.stressScale);
    return {
      series:
        appMode === "kinematic"
          ? get_probe_series(
              element,
              metric,
              runtimeState.simulationSnapshots as KinematicSnapshot[],
            )
          : get_dynamic_probe_series(
              element,
              metric,
              runtimeState.simulationSnapshots as DynamicSnapshot[],
            ),
    };
  };

  /** The limit a stress chart is read against: `Re` for a normal stress, `τ_adm` for a shear one. Absent for every other metric, and for a beam whose material or profile does not resolve. */
  const stress_reference = (
    element: MechanicalElement,
    metric: ProbeMetric,
  ): { value: number; label: string } | undefined => {
    if (element.type !== "beam") return undefined;
    if (metric !== "stress" && metric !== "shear-stress") return undefined;
    const strength = beam_strength(
      element.materialID,
      element.profileID,
      mechanism.materials,
      mechanism.profiles,
    );
    if (!strength) return undefined;
    return metric === "stress"
      ? { value: strength.Re, label: "Re" }
      : { value: shear_admissible_stress(strength.Re), label: "τ adm" };
  };

  // Withdrawn when the panel goes away: a tick outliving the chart that named it would point at nothing.
  React.useEffect(() => () => setHoveredAbscissa(null), [setHoveredAbscissa]);

  /** `abscissa` at the recorded instant nearest the one on screen — the same nearest-sample rule `get_metric_at` reads a series by.
   * Read at `runtimeState.time` rather than wherever the pointer sits: the canvas is posed at that instant, and an abscissa taken from another one would be marked on a beam that was somewhere else when it was measured. */
  const shown_abscissa = (
    series: ProbeSeries,
    abscissa: number[],
  ): number | null => {
    if (series.t.length === 0) return null;
    const time = runtimeState.time;
    let best = 0;
    for (let i = 1; i < series.t.length; i++)
      if (Math.abs(series.t[i] - time) < Math.abs(series.t[best] - time)) best = i;
    return abscissa[best] ?? null;
  };

  const chart_empty_message = (metric: ProbeMetric): string =>
    t(
      appMode === "kinematic" && metric_needs_dynamics(metric)
        ? "chart_not_in_kinematic"
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
  useDismissOnShortcut(
    !!metricMenu && !!menuElement,
    () => setMetricMenu(null),
    (replayed) =>
      !!menuElement && is_probes_only_bundle(replayed, menuElement.id),
  );

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

  // A freedom nothing weighs, and everything it moves: the mass those parts are missing is what leaves it without inertia, and the inspector above says so on their own row.
  // Dynamics only, and never a freedom a motor drives — the same reading the mode rows show.
  const inertiaFreeElements = React.useMemo(() => {
    const ids = new Set<ID>();
    if (appMode !== "dynamic") return ids;
    for (const { modes } of analysis.chains)
      for (const mode of modes)
        if (mode.inertiaFree && !mode.drivenByMotor)
          for (const id of mode.moves) ids.add(id);
    return ids;
  }, [analysis.chains, appMode]);

  React.useEffect(() => {
    setInertiaFreeElements(inertiaFreeElements);
  }, [inertiaFreeElements, setInertiaFreeElements]);

  // Leaving the tab unmounts the panel without a mouse-leave, which would strand the highlight — and a redundancy symbol — on a canvas nothing is pointing at any more.
  React.useEffect(
    () => () => {
      setHighlight(NO_HIGHLIGHT);
      setRedundancySymbols(EMPTY_SYMBOLS);
      setInertiaFreeElements(NO_ELEMENTS);
    },
    [setHighlight, setRedundancySymbols, setInertiaFreeElements],
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

  // Every beam's own loop residual at the instant on screen, worst first — how far its marched field lands from the torsor the statics pass read independently at its far end (`CohesionField.loopResidual`).
  // Mechanism-wide rather than for the selected beam alone: what it is read for is finding WHICH beam the physics is off on.
  const cohesionResiduals = React.useMemo(() => {
    if (appMode !== "dynamic") return [];
    const dynSnap = dynamic_snapshot_at(
      runtimeState.simulationSnapshots as DynamicSnapshot[],
      runtimeState.time,
    );
    if (!dynSnap) return [];
    const gravity = analysedMechanism.simulation.gravity ? GRAVITY : ZERO;
    const rows: {
      beam: BeamElement;
      residual: CohesionField["loopResidual"];
    }[] = [];
    for (const el of analysedMechanism.mechanicalElements) {
      if (el.type !== "beam") continue;
      const cohesion = dynSnap.beamCohesion?.find((c) => c.beamID === el.id);
      if (!cohesion) continue;
      const field = compute_cohesion_field(
        el,
        analysedMechanism.materials,
        analysedMechanism.profiles,
        cohesion,
        analysedMechanism.loads,
        dynSnap,
        gravity,
      );
      if (field) rows.push({ beam: el, residual: field.loopResidual });
    }
    return rows.sort(
      (a, b) => residual_rank(b.residual) - residual_rank(a.residual),
    );
  }, [
    appMode,
    runtimeState.simulationSnapshots,
    runtimeState.time,
    analysedMechanism,
  ]);
  // `momentBalanceReference` resolved to the pose on screen, the way every other position the panel reads is.
  const momentBalancePoint = React.useMemo(
    () =>
      resolve_moment_balance_point(momentBalanceReference, analysedMechanism),
    [analysedMechanism, momentBalanceReference],
  );
  // What the reference chip reads — `undefined` for a point of its own, and for an element deleted since: both read as the coordinates the reference resolves to, the origin in the second case.
  const momentBalanceReferenceLabel = React.useMemo(() => {
    switch (momentBalanceReference.kind) {
      case "point":
        return undefined;
      case "center-of-mass":
        return t("balance_reference_center_of_mass");
      case "node": {
        const node = mechanism.mechanicalElements.find(
          (el) => el.id === momentBalanceReference.nodeID,
        );
        return node && shown_element_name(node);
      }
      case "edge-end": {
        const edge = mechanism.mechanicalElements.find(
          (el) => el.id === momentBalanceReference.edgeID,
        );
        if (!edge) return undefined;
        return `${shown_element_name(edge)} ${t(
          momentBalanceReference.which === "start"
            ? "point_start"
            : "point_end",
        )}`;
      }
    }
  }, [mechanism.mechanicalElements, momentBalanceReference]);
  // The free body's own balance at the instant on screen, itemised — read off the pose the panel displays, so a moment arm is measured where the body actually is.
  const forceBalance = React.useMemo(() => {
    if (appMode !== "dynamic") return undefined;
    const dynSnap = dynamic_snapshot_at(
      runtimeState.simulationSnapshots as DynamicSnapshot[],
      runtimeState.time,
    );
    if (!dynSnap) return undefined;
    return compute_force_balance(
      analysedMechanism,
      dynSnap,
      analysedMechanism.simulation.gravity ? GRAVITY : ZERO,
      momentBalancePoint,
    );
  }, [
    appMode,
    runtimeState.simulationSnapshots,
    runtimeState.time,
    analysedMechanism,
    momentBalancePoint,
  ]);

  // Held by IDENTITY rather than by the terms themselves: the terms are rebuilt at every instant, so holding one would freeze the canvas marker on the pose it was first hovered in while the mechanism moves on.
  const [hoveredBalanceLine, setHoveredBalanceLine] =
    React.useState<HoveredBalanceLine | null>(null);
  // Re-resolves the hovered line against each rebuilt balance, so the canvas marker follows the mechanism — and un-names it as soon as that balance stops holding the line.
  // It does NOT publish the hover itself: an effect only runs after the commit, so the first frame drawn after the cursor lands would carry nothing and the marker would appear a frame late — `onHoverTerm` writes both states at once instead, resolved from the balance it already holds.
  React.useEffect(() => {
    setHoveredBalanceTerm(
      hoveredBalanceLine ? hovered_from(hoveredBalanceLine, forceBalance) : null,
    );
  }, [hoveredBalanceLine, forceBalance, setHoveredBalanceTerm]);
  // Nothing else un-sets it once this panel goes away with the cursor still on a line.
  React.useEffect(
    () => () => setHoveredBalanceTerm(null),
    [setHoveredBalanceTerm],
  );

  // A term clicked selects the very thing pointing at it already lights up — a load through the ordinary element selection, exactly as clicking its own arrow on the canvas does; a weight or support reaction through `focusedOverlay`, the same register `onSelectOverlay` reports into from a canvas click.
  const handleClickBalanceTerm = (term: BalanceTerm) => {
    if (term.kind === "load")
      setCanvasState({ type: "SelectedElement", elementID: term.elementID });
    else
      setFocusedOverlay({
        elementID: term.elementID,
        kind: term.kind === "weight" ? "weight" : "reaction-support",
        which: term.kind === "support" ? "node" : undefined,
      });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      {appMode !== "edition" && (
        <>
          {cohesionResiduals.length > 0 && (
            <Box sx={{ mx: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                {t("cohesion_residual_heading")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                {cohesionResiduals.map(({ beam, residual }) => (
                  <Box
                    key={beam.id}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Typography variant="caption" noWrap>
                      {shown_element_name(beam)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {format_quantity(
                        Math.hypot(residual.fx, residual.fy),
                        FORCE,
                      )}
                      {" · "}
                      {format_quantity(residual.m, MOMENT)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {forceBalance && (
            <ForceBalanceTable
              balance={forceBalance}
              onHoverTerm={(target, quantity) => {
                const line: HoveredBalanceLine | null =
                  target === null
                    ? null
                    : target === "total" || target === "inertia"
                      ? { id: target, quantity }
                      : { id: target.id, quantity };
                const term =
                  target === null || target === "total" || target === "inertia"
                    ? null
                    : target;
                setHoveredBalanceLine(line);
                // Published from the event rather than left to the effect above: both land in one render, so the very next frame the canvas draws already carries the marker.
                setHoveredBalanceTerm(
                  line ? hovered_from(line, forceBalance) : null,
                );
                // Written on entering or leaving a line only: the balance is rebuilt at every instant, and writing on each rebuild would wipe the canvas's own hover while the simulation runs.
                // A load's own arrow is part of the mechanism rather than of the overlay set, so pointing at its row is telling the canvas the cursor is on it, which is what shows its value. Several at once are lit by the drawing instead (`litLoadIDs`), this register naming only one.
                setHoveredPart(
                  term?.kind === "load"
                    ? load_hovered_part(term.elementID, term.at, mechanism.loads)
                    : { type: "Void", position: ZERO },
                );
              }}
              onClickTerm={handleClickBalanceTerm}
              referenceKind={momentBalanceReference.kind}
              referenceLabel={momentBalanceReferenceLabel}
              referencePoint={momentBalancePoint}
              pickingReference={canvasState.type === "PickingMomentBalanceNode"}
              onArmPicking={() =>
                setCanvasState({ type: "PickingMomentBalanceNode" })
              }
              onStopPicking={() => setCanvasState({ type: "Selecting" })}
              onSetPoint={(point) =>
                setMomentBalanceReference({ kind: "point", point })
              }
              onReferenceHoverChange={setMomentBalanceReferenceHovered}
            />
          )}

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
                  <Tooltip title={t("choose_metrics")}>
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
                const { series, abscissa } = probe_readout(element, probe.metric);
                const reference = stress_reference(element, probe.metric);
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
                      <Tooltip title={t("remove_metric")}>
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
                      {...pool_scales(probe.metric)}
                      unitFactor={unit.factor}
                      showZero={metric_shows_zero(probe.metric)}
                      reference={reference}
                      emptyMessage={
                        noComponentSelected
                          ? t("chart_no_component")
                          : chart_empty_message(probe.metric)
                      }
                      onHover={
                        abscissa
                          ? (inside) => {
                              const s = inside
                                ? shown_abscissa(series, abscissa)
                                : null;
                              setHoveredAbscissa(
                                s === null ? null : { beamID: element.id, s },
                              );
                            }
                          : undefined
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
              // No reference line here: each beam is read against its own `Re`, and several of them have no one line to share.
              const { series } = probe_readout(el, metric);
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
                  {...pool_scales(metric)}
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
