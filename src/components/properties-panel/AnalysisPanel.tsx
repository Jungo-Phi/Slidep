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
  ActionBundleType,
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
import { ChainAnalysis, useDofAnalysis } from "./useDofAnalysis";
import { ddl_status } from "./ddl-status";
import { PosePreview, usePosePreview } from "./usePosePreview";
import { strained_link } from "../solver/strain-animation";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  appMode: AppMode;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  unsatisfied: ConstraintResidual[];
  runtimeState: RuntimeState;
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
  /** The mechanical element the canvas selection points at (a selected load
   *  resolves to its host), or undefined when nothing is selected. */
  selectedElement: MechanicalElement | undefined;
  /** Names the elements the canvas should pick out; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** Where the pose the panel is animating is published, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
}

/** Short human label for a solver link type, shown as the violation kind. */
const CONSTRAINT_NOUN: Record<string, StringKey> = {
  MotorBeam: "link_motor",
  MotorAngle: "link_motor",
  Distance: "link_distance",
  FixedOnSegment: "link_fixed_on_segment",
  SlideOnSegment: "link_slide_on_segment",
  Angle: "link_angle",
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

/** A row whose animation is playing beats in time with it, so panel and canvas agree. */
const BEATING = {
  animation: `mode-beat ${MODE_ANIMATION.PERIOD_S / 2}s ease-in-out infinite`,
  "@keyframes mode-beat": {
    "0%, 100%": { backgroundColor: "action.selected" },
    "50%": { backgroundColor: "action.hover" },
  },
} as const;

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

/** One chain's block: its mobility headline, its motors, and its redundancies. */
const ChainCard: React.FC<{
  analysis: ChainAnalysis;
  index: number;
  appMode: AppMode;
  setHighlight: (highlight: CanvasHighlight) => void;
  /**
   * The element a mode is named after — absent only in the moment after a deletion.
   *
   * The analysis is debounced, so for up to its delay the modes still name a part the
   * mechanism no longer holds. Rare, brief, and not worth blanking the panel over.
   */
  elementOf: (id: ID) => MechanicalElement | undefined;
  preview: PosePreview;
  setPreview: (preview: PosePreview) => void;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  /** A running simulation already shows motion; a mode swung over it would only muddle it. */
  modesPlayable: boolean;
  /** Whether the pointed-at row is really animating — a strain sometimes has nothing to show. */
  playing: boolean;
  /** The redundancy audit's answer for this chain, or undefined until it is asked for. */
  audit: Redundancy | undefined;
  auditing: boolean;
  onAudit: () => void;
}> = ({
  analysis,
  index,
  appMode,
  setHighlight,
  elementOf,
  preview,
  setPreview,
  setHoveredPart,
  setCanvasState,
  applyActions,
  modesPlayable,
  playing,
  audit,
  auditing,
  onAudit,
}) => {
  const { chain, mobility, modes, highlight } = analysis;
  const status = ddl_status(mobility.mobility, chain.motors.length, appMode);
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
      {modes.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", mx: 1 }}>
          {modes.map((mode, modeIndex) => {
            const shown =
              preview?.kind === "mode" &&
              preview.chainIndex === index &&
              preview.modeIndex === modeIndex;
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
                  setPreview({ kind: "mode", chainIndex: index, modeIndex });
                  // Everything the mode moves, not just what it is named after:
                  // `contributors` is a ranking, trimmed of its small shares.
                  setHighlight(focus(mode.moves));
                }}
                onMouseLeave={() => {
                  if (!modesPlayable) return;
                  setPreview(null);
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
                  ...(shown && BEATING),
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

                  {named ? (
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <ElementDisplay
                        element={named}
                        setHoveredPart={setHoveredPart}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                        size="small"
                        editable={false}
                        interactive={false}
                      />
                    </Box>
                  ) : (
                    <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
                      {t("ddl_mode", { index: modeIndex + 1 })}
                    </Typography>
                  )}
                </Box>
                {motor && (
                  <Box
                    // Reaching for the speed is not pointing at the mode: the swing
                    // stops so the value can be read while it is being changed.
                    onMouseEnter={() => {
                      setPreview(null);
                      setHighlight(focus(highlight));
                    }}
                    onMouseLeave={() => {
                      if (!modesPlayable) return;
                      setPreview({ kind: "mode", chainIndex: index, modeIndex });
                      setHighlight(focus(mode.moves));
                    }}
                  >
                    <SignedNumberInput
                      label=""
                      value={motor.motor!.speed}
                      onChange={(speed) =>
                        applyActions(
                          [
                            {
                              type: "SetMotorConfig",
                              id: motor.id,
                              newConfig: { ...motor.motor!, speed },
                              oldConfig: motor.motor,
                            },
                          ],
                          "ChangeConstant",
                        )
                      }
                      accent
                    />
                  </Box>
                )}
              </Box>
            );
          })}
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
                onMouseEnter={() =>
                  setHighlight(fault(audit.groups.flatMap((g) => g.elements)))
                }
                onMouseLeave={() => setHighlight(focus(highlight))}
                sx={{ mt: 0.5 }}
              >
                {audit.groups.map((group) => {
                  const element = elementOf(group.owner);
                  if (!element) return null;
                  // The one constraint of the group a lie is told to. Absent when none of
                  // them holds a value to be wrong about — a slider's rail, say — and the
                  // row then only lights its parts.
                  const lied = strained_link(group.links);
                  // Marked only while something is really moving: a constraint the
                  // mechanism has no way of answering shows nothing, and a row that lit
                  // up anyway would promise a motion nobody is going to see.
                  const straining =
                    playing &&
                    preview?.kind === "strain" &&
                    preview.owner === group.owner;
                  return (
                    <Box
                      key={group.owner}
                      onMouseEnter={() => {
                        setHighlight(fault(group.elements));
                        if (lied && modesPlayable)
                          setPreview({
                            kind: "strain",
                            chainIndex: index,
                            owner: group.owner,
                            link: lied,
                          });
                      }}
                      onMouseLeave={() => {
                        setPreview(null);
                        setHighlight(
                          fault(audit.groups.flatMap((g) => g.elements)),
                        );
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 0.5,
                        borderRadius: 3,
                        backgroundColor: straining
                          ? "action.selected"
                          : "transparent",
                        ...(straining && BEATING),
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
                          setHoveredPart={setHoveredPart}
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
  appMode,
  applyActions,
  setHoveredPart,
  setCanvasState,
  unsatisfied,
  runtimeState,
  setRuntimeState,
  setHighlight,
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
      "Other",
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

  const analysis = useDofAnalysis(mechanism);

  /** The mode or the strained constraint being pointed at, if any. */
  const [preview, setPreview] = React.useState<PosePreview>(null);

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

  // Still means analysable and showable: edition, or a simulation on pause. While it plays
  // the mechanism already moves, and anything swung on top of it would only muddle that.
  const playing = usePosePreview(
    modePreviewRef,
    mechanism,
    analysis.model,
    analysis.chains,
    preview,
    !runtimeState.isPlaying,
  );

  // Leaving the tab unmounts the panel without a mouse-leave, which would strand the
  // highlight on a canvas nothing is pointing at any more.
  React.useEffect(
    () => () => setHighlight(NO_HIGHLIGHT),
    [setHighlight],
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
                setHoveredPart={setHoveredPart}
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
              elementOf={elementOf}
              preview={preview}
              setPreview={setPreview}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              modesPlayable={!runtimeState.isPlaying}
              playing={playing}
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
                        setHoveredPart={setHoveredPart}
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
                setHoveredPart={setHoveredPart}
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
                "Other",
              )
            }
          />
        )}
      </Menu>
    </Box>
  );
};

export default AnalysisPanel;
