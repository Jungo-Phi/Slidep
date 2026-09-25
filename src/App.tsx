import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Snackbar,
  Fade,
  alpha,
  useMediaQuery,
} from "@mui/material";
import { Close, UploadFile, WarningAmber } from "@mui/icons-material";
import {
  default_profile,
  seed_material_catalog,
} from "./constants/material-profile-catalog";
import {
  Action,
  AppMode,
  ConstraintElement,
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  DEFAULT_SIMULATION_CONFIG,
  ID,
  KinematicSnapshot,
  Mechanism,
  MechanismMetadata,
  Point2,
  PropertiesPanelTab,
  SimulationConfig,
  ViewportChange,
  ZERO,
  is_simulating,
} from "./types";
import { DynamicSnapshot } from "./types/runtime-state";
import {
  clamp_pan,
  getStorageItem,
  setStorageItem,
  zoom_delta_to,
  zoom_on_point,
} from "./utils";
import { useThemeChoice } from "./theme/use-theme-choice";
import { get_language, Lang, set_language, t } from "./i18n";
import {
  SNACKBAR_DURATION,
  VALUE_EDIT_COALESCE_MS,
} from "./constants/interaction-specs";
import { CANVAS_STATE_SIM_EFFECT } from "./constants/canvas-state-sim-effect";
import { rebased_bundle } from "./components/mechanism/parameter-rebase";
import { set_sim_clock, sim_clock } from "./components/solver/dynamics/sim-clock";

/** Remembers, across sessions, that the notice explaining a pause triggered by an edit has been shown. */
const PAUSED_FOR_EDIT_NOTICE_KEY = "pausedForEditNoticeShown";
import MechanicalCanvas, {
  ConstraintChangeSignal,
} from "./components/canvas/MechanicalCanvas";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "./components/canvas/drawing/draw-canvas";
import {
  EMPTY_REDUNDANCY_SYMBOLS,
  RedundancySymbol,
} from "./components/solver/analysis/redundancy-symbols";

import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import { AboutDialog } from "./components/toolbar/AboutDialog";
import { SimulationTimeline } from "./components/toolbar/SimulationTimeline";
import { ToolsMenu } from "./components/toolbar/ToolsMenu";
import { PlaybackControls } from "./components/toolbar/PlaybackControls";
import { useStressLensPreview } from "./components/toolbar/use-stress-lens-preview";
import type {
  HoveredBalanceTerm,
  MomentBalanceReference,
} from "./components/solver/analysis/force-balance";
import { resolve_moment_balance_point } from "./components/solver/analysis/force-balance";
import type { FocusedOverlay } from "./components/canvas/drawing/drawing-functions";
import { set_sim_clock as setRuntimeState } from "./components/solver/dynamics/sim-clock";
import {
  apply_dynamic_snapshot_to_mechanism,
  apply_parameter_snapshot_to_mechanism,
  apply_snapshot_to_mechanism,
  dynamic_snapshot_at,
  parameter_snapshot_at,
  snapshot_at,
} from "./components/solver/dynamics/simulation-engine";
import {
  useSimulationPlayback,
  SimulationLimitReason,
} from "./components/solver/recording/use-simulation-playback";
import { CanvasState, selected_ids } from "./types/canvas-state";
import {
  ANGLE_STEPS,
  DEFAULT_SNAP_SETTINGS,
  migrate_snap_settings,
  type SnapSettings,
} from "./utils/snap-corridor";
import { HoveredAbscissaSource, HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { assert_actions_preserve_validity } from "./utils/assert-mechanism";
import { apply_actions } from "./components/mechanism/apply-actions";
import {
  HistorySeal,
  HistorySealContext,
} from "./components/mechanism/history-seal";
import {
  is_display_only_bundle,
  is_load_value_only_bundle,
  is_observation_only_bundle,
  is_structure_bundle,
} from "./components/mechanism/action-kind";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import {
  fit_to_content,
  useMechanismLibrary,
} from "./components/mechanisms-gallery/use-mechanism-library";

/** Shortens the labels (Édition → Édit) and hides the chip labels. */
const CONDENSED_BREAKPOINT = 1400;
/** Also drops the separators and tightens the spacing, for really narrow windows. */
const TIGHT_BREAKPOINT = 1150;

/** Whether a canvas state is an armed placement tool waiting for its first click — no element selected, no gesture started. */
const is_armed_tool_waiting = (state: CanvasState, mechanism: Mechanism) => {
  if (state.type === "Selecting" || state.type === "SelectingMultiple")
    return false;
  if ("elementIDs" in state) return state.elementIDs.length === 0;
  if (!("elementID" in state)) return true;
  return !(
    mechanism.mechanicalElements.some((el) => el.id === state.elementID) ||
    mechanism.loads.some((el) => el.id === state.elementID) ||
    mechanism.constraintElements.some((el) => el.id === state.elementID)
  );
};

const App: React.FC = () => {
  const [canvasState, setCanvasState] = useState<CanvasState>({
    type: "Selecting",
  });
  const [mechanism, setMechanism] = useState<Mechanism>({
    metadata: {
      ...DEFAULT_METADATA,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    },
    viewport: { scale: 1, pan: ZERO },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    materials: seed_material_catalog(),
    profiles: [default_profile()],
    history: [],
    future: [],
  });

  const [hoveredPart, setHoveredPart] = useState<HoveredPart>({
    type: "Void",
    position: ZERO,
  });

  /** An abscissa hovered on the analysis panel's N/T/Mf diagrams, for the canvas to mark on the beam — see docs/plan-efforts-interieurs.md phase 5bis. */
  const [hoveredAbscissa, setHoveredAbscissaState] =
    useState<HoveredAbscissaSource | null>(null);
  // A resolver is itself a function, which `setState` would call as an updater: it goes in wrapped.
  const setHoveredAbscissa = useCallback(
    (source: HoveredAbscissaSource | null) =>
      setHoveredAbscissaState(() => source),
    [],
  );

  /** A line of the analysis panel's force balance the cursor rests on, for the canvas to show the vector it stands for — which is what tells a reader which term of the sum is which. */
  const [hoveredBalanceTerm, setHoveredBalanceTerm] =
    useState<HoveredBalanceTerm | null>(null);

  /**
   * Where the force balance's moment is taken about.
   * A UI preference, not a mechanism edit, so it lives here rather than going through `Action`.
   */
  const [momentBalanceReference, setMomentBalanceReference] =
    useState<MomentBalanceReference>({ kind: "point", point: ZERO });
  /** The panel's own reference-point picker is hovered — previews the marker on the canvas without arming the picking tool. */
  const [momentBalanceReferenceHovered, setMomentBalanceReferenceHovered] =
    useState(false);

  /** A physics-overlay arrow or moment clicked on the canvas — a UI preference, not a mechanism edit, the same reasoning as `momentBalanceReference`.
   * Never touches `canvasState`: naming an overlay is not an element selection, so the two stay independent registers, one read by the analysis panel and both read by the canvas — which draws the reading itself as selected while it stands, and its own element as not (`draw_mechanism`'s own `isSelected`). */
  const [focusedOverlay, setFocusedOverlay] = useState<FocusedOverlay | null>(
    null,
  );
  // Goes stale the moment anything else happens on the canvas — a new selection, an armed tool, a deselection.
  // The click that sets it never touches `canvasState` itself, so this is the only thing that ever clears it.
  useEffect(() => {
    setFocusedOverlay(null);
  }, [canvasState]);

  /** Elements the analysis panel is pointing at, and why (see `CanvasHighlight`). */
  const [highlight, setHighlight] = useState<CanvasHighlight>(NO_HIGHLIGHT);

  /** How a redundant constraint the analysis panel is naming right now would yield. */
  const [redundancySymbols, setRedundancySymbols] = useState<
    RedundancySymbol[]
  >(EMPTY_REDUNDANCY_SYMBOLS);

  const modePreviewRef = useRef<Mechanism | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("edition");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(
    getStorageItem<boolean>("snapToGrid", true),
  );
  const [showGrid, setShowGrid] = useState<boolean>(
    getStorageItem<boolean>("showGrid", true),
  );
  const { previewLens, previewLensLater } = useStressLensPreview(appMode);
  // What the canvas paints the beams with: the lens hovered in the menu while one is being tried on, the chosen one the rest of the time.
  const activeBeamStressLens = previewLens ?? mechanism.simulation.beamStressLens;
  const [trajectoryDotted, setTrajectoryDotted] = useState<boolean>(
    getStorageItem<boolean>("trajectoryDotted", false),
  );
  const [snapSettings, setSnapSettings] = useState<SnapSettings>(
    migrate_snap_settings(
      getStorageItem<SnapSettings>("snapSettings", DEFAULT_SNAP_SETTINGS),
    ),
  );
  const isCustomAngleStep =
    snapSettings.angleStepIsCustom ??
    !ANGLE_STEPS.includes(snapSettings.angleStep);

  useEffect(() => {
    setStorageItem("snapToGrid", snapToGrid);
  }, [snapToGrid]);

  useEffect(() => {
    setStorageItem("showGrid", showGrid);
  }, [showGrid]);

  useEffect(() => {
    setStorageItem("trajectoryDotted", trajectoryDotted);
  }, [trajectoryDotted]);

  useEffect(() => {
    setStorageItem("snapSettings", snapSettings);
  }, [snapSettings]);

  // The top bar's width follows the window, not the canvas: these queries re-render the component every time a breakpoint is crossed.
  const condensed = useMediaQuery(`(max-width:${CONDENSED_BREAKPOINT}px)`);
  const tight = useMediaQuery(`(max-width:${TIGHT_BREAKPOINT}px)`);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    DEFAULT_SIMULATION_CONFIG,
  );
  const { themeChoice, systemDark, previewLater, changeTheme, currentTheme } =
    useThemeChoice();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStateRef = useRef<CanvasState>(canvasState);
  const mechanismRef = useRef<Mechanism>(mechanism);
  // The channel asking the canvas for visual feedback after an undo/redo that touched icon constraints.
  const constraintChangeRef = useRef<ConstraintChangeSignal | null>(null);
  const constraintChangeSeqRef = useRef(0);

  /** `duration` overrides the default for messages that take longer to read, or that report something lost.
   * `severity: "warning"` marks those same messages visually.
   * The two aren't always paired (e.g. `file_unreadable` stays short but still warrants the warning look). */
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    duration?: number;
    severity?: "warning";
  }>({ open: false, message: "" });

  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>("project");
  const [prevCanvasState, setPrevCanvasState] =
    useState<CanvasState>(canvasState);
  const skipTabSyncStateRef = useRef<CanvasState | null>(null);

  if (prevCanvasState !== canvasState) {
    setPrevCanvasState(canvasState);
    if (canvasState === skipTabSyncStateRef.current) {
      // no-op: this exact transition asked to keep the current tab.
    } else if (
      canvasState.type === "PlacingProbe" ||
      canvasState.type === "PlacingProbeMetrics" ||
      // Closing the metric box leaves its element selected, and the tab on the measures.
      // A click that lands on something else is a move away from it, and follows the ordinary rules below.
      (prevCanvasState.type === "PlacingProbeMetrics" &&
        selected_ids(canvasState)[0] === prevCanvasState.elementID)
    ) {
      setActiveTab("analysis");
    } else if (appMode === "edition") {
      if (
        canvasState.type === "Erasing" ||
        canvasState.type === "ErasingMultiple" ||
        canvasState.type === "EditingValue" ||
        canvasState.type === "SelectingMultiple" ||
        // The ruler reads in its own corner of the canvas and names no element, so there is nothing for a tab to show and no reason to leave the one being read.
        canvasState.type === "Measuring" ||
        canvasState.type === "MeasuringFrom" ||
        canvasState.type === "Measured"
      ) {
        // Armed tool / transient value edit / box-select in progress: never moves the tab mid-drag — it resolves once SelectingMultiple settles into its final state on mouseup.
      } else if ("elementID" in canvasState) {
        if (
          mechanism.mechanicalElements.find(
            (el) => el.id === canvasState.elementID,
          ) ||
          mechanism.loads.find((el) => el.id === canvasState.elementID)
        ) {
          setActiveTab("elements");
        } else if (
          mechanism.constraintElements.find(
            (el) => el.id === canvasState.elementID,
          )
        ) {
          setActiveTab("constraints");
        }
      } else if (
        "elementIDs" in canvasState &&
        canvasState.elementIDs.length > 0
      ) {
        setActiveTab("elements");
      } else if (!is_armed_tool_waiting(prevCanvasState, mechanism)) {
        setActiveTab("project");
      }
    } else if (canvasState.type === "Selecting") {
      setActiveTab("analysis");
    }
  }

  const clearSelectionKeepTab = useCallback(() => {
    const next: CanvasState = { type: "Selecting" };
    skipTabSyncStateRef.current = next;
    setCanvasState(next);
  }, []);

  useEffect(() => {
    mechanismRef.current = mechanism;
  }, [mechanism]);

  useEffect(() => {
    canvasStateRef.current = canvasState;
  }, [canvasState]);

  useEffect(() => {
    if (appMode !== "edition") setActiveTab("analysis");
  }, [appMode]);

  const {
    runtimeState,
    liveFrameRef,
    timelineTrackRef,
    timeline,
    blockedMotors,
    canSimulationGrab,
    handleSpaceKey: handleSpaceKeyForMode,
    handleEscapeKey,
    handleSimulationGrab,
    handleSimulationGrabEnd,
    resetToStart,
    exitToEdition,
    pauseSimulation,
    resetSimulationState: resetSimulationStateFor,
    simulationRef,
    simStartHistoryLengthRef,
    observationOnlyEditRef,
    loadValueOnlyEditRef,
  } = useSimulationPlayback({
    mechanism,
    appMode,
    setAppMode,
    setCanvasState,
    gravity: mechanism.simulation.gravity,
    collisions: mechanism.simulation.collisions,
    floor: mechanism.simulation.floor.enabled,
    supportReactions: mechanism.simulation.supportReactions,
    focusedOverlay,
    hoveredOverlay:
      hoveredPart.type === "Overlay" ? hoveredPart.reading : null,
    inertiaNamed: hoveredBalanceTerm?.inertia === true,
    onRecordingLimitReached: (
      reason: SimulationLimitReason,
      maxTime: number,
    ) => {
      setSnackbar({
        open: true,
        message: t(
          reason === "time" ? "recording_limit_time" : "recording_limit_memory",
          { minutes: maxTime / 60 },
        ),
        duration: SNACKBAR_DURATION.REPORT,
        severity: "warning",
      });
    },
  });

  const isPlayingRef = useRef(runtimeState.isPlaying);
  isPlayingRef.current = runtimeState.isPlaying;

  // Entering a gesture is what pauses or leaves a running simulation, whichever route led to it (see `CANVAS_STATE_SIM_EFFECT`).
  // Keyed on the state alone: entering simulation with a tool still armed must not bounce straight back to edition.
  useEffect(() => {
    if (simulationRef.current.appMode === "edition") return;
    const effect = CANVAS_STATE_SIM_EFFECT[canvasState.type];
    if (effect === "exit") exitToEdition();
    if (effect !== "pause" || !isPlayingRef.current) return;
    pauseSimulation();
    // A pause nobody asked for reads as a bug, but only the first time: the notice is not repeated once seen.
    if (getStorageItem<boolean>(PAUSED_FOR_EDIT_NOTICE_KEY, false)) return;
    setStorageItem(PAUSED_FOR_EDIT_NOTICE_KEY, true);
    setSnackbar({ open: true, message: t("simulation_paused_for_edit") });
  }, [canvasState.type, exitToEdition, pauseSimulation, simulationRef]);

  const handleSpaceKey = useCallback(
    () => handleSpaceKeyForMode(mechanism.metadata.lastSimulationMode),
    [handleSpaceKeyForMode, mechanism.metadata.lastSimulationMode],
  );

  const resetSimulationState = useCallback(
    () => resetSimulationStateFor(setSimulationConfig),
    [resetSimulationStateFor],
  );

  const analysedMechanism = useMemo(() => {
    if (!is_simulating(appMode)) return mechanism;
    // Narrowed by the `is_simulating` check above: only a kinematic or dynamic run ever fills `simulationSnapshots` while its own mode is active, and the concrete shape follows which — the same invariant `Recorder` itself relies on.
    const snapshot =
      appMode === "kinematic"
        ? snapshot_at(
            runtimeState.simulationSnapshots as KinematicSnapshot[],
            runtimeState.time,
          )
        : dynamic_snapshot_at(
            runtimeState.simulationSnapshots as DynamicSnapshot[],
            runtimeState.time,
          );
    if (!snapshot) return mechanism;
    const geometryMechanism =
      appMode === "kinematic"
        ? apply_snapshot_to_mechanism(mechanism, snapshot as KinematicSnapshot)
        : apply_dynamic_snapshot_to_mechanism(
            mechanism,
            snapshot as DynamicSnapshot,
          );
    const paramSnapshot = parameter_snapshot_at(
      runtimeState.parameterSnapshots,
      runtimeState.time,
    );
    return paramSnapshot
      ? apply_parameter_snapshot_to_mechanism(geometryMechanism, paramSnapshot)
      : geometryMechanism;
    // Depend on geometry/parameters only, not the whole mechanism: a viewport (pan/zoom) change keeps these array refs identical, so it must not re-derive the pose on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appMode,
    mechanism.mechanicalElements,
    mechanism.loads,
    mechanism.materials,
    mechanism.profiles,
    mechanism.simulation,
    runtimeState.simulationSnapshots,
    runtimeState.parameterSnapshots,
    runtimeState.time,
  ]);

  /** `momentBalanceReference` resolved to the pose on screen, the way every other position the panel reads is. */
  const momentBalancePoint = useMemo(
    () => resolve_moment_balance_point(momentBalanceReference, analysedMechanism),
    [analysedMechanism, momentBalanceReference],
  );

  const {
    saveStatus,
    galleryOpen,
    savedMechanisms,
    markDirty,
    handleOpenGallery,
    closeGallery,
    handleLoadFromGallery,
    handleRenameFromGallery,
    handleUpdateTagsFromGallery,
    handleDeleteFromGallery,
    handleDuplicateFromGallery,
    handleNewFromGallery,
    handleMenuButtonUpload,
    handleFilesDropped,
    handleExportRecord,
    handleExportAllRecords,
    handleRestoreExamples,
  } = useMechanismLibrary({
    mechanismRef,
    canvasRef,
    setMechanism,
    setCanvasState,
    setSnackbar,
    resetSimulationState,
  });

  useEffect(() => {
    if (galleryOpen) pauseSimulation();
  }, [galleryOpen, pauseSimulation]);

  const updateMetadata = useCallback(
    (metadata: MechanismMetadata, touch = true) => {
      setMechanism((prevMechanism) => ({ ...prevMechanism, metadata }));
      markDirty(touch);
    },
    [markDirty],
  );

  // The tags already carried by a mechanism somewhere in the library.
  // The three simulation modes are always suggested alongside them, as the most common way to sort a library.
  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const record of savedMechanisms)
      for (const tag of record.metadata.tags) set.add(tag);
    return set;
  }, [savedMechanisms]);
  const allTags = [
    ...new Set([
      t("mode_static"),
      t("mode_kinematic"),
      t("mode_dynamic"),
      ...usedTags,
    ]),
  ].sort();

  const changeViewport = useCallback((change: ViewportChange) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setMechanism((prevMechanism) => {
      const ov = prevMechanism.viewport;
      return {
        ...prevMechanism,
        viewport:
          change.type === "Pan"
            ? {
                pan: clamp_pan(
                  ov.pan.add(change.delta),
                  ov.scale,
                  canvas.width,
                  canvas.height,
                ),
                scale: ov.scale,
              }
            : zoom_on_point(
                change.deltaY,
                change.center,
                ov,
                canvas.width,
                canvas.height,
              ),
      };
    });
  }, []);

  /** Zooms the canvas's middle to an exact scale — what the toolbar's zoom steps aim at, routed through the same gesture path as the wheel. */
  const zoomTo = useCallback(
    (scale: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      changeViewport({
        type: "Zoom",
        deltaY: zoom_delta_to(mechanismRef.current.viewport.scale, scale),
        center: new Point2(
          canvas.width / 2,
          canvas.height / 2,
        ).as_space<"screen">(),
      });
    },
    [changeViewport],
  );

  const applyActions = useCallback(
    (actions: Action[]) => {
      const simulating = simulationRef.current.appMode !== "edition";
      const observationOnly = is_observation_only_bundle(actions);
      const structure = is_structure_bundle(actions);
      // An edit made behind later ones in the recording cuts them off, values included (see `rebased_bundle`).
      // Their snapshots go now rather than in the recompile effect: an edit arriving before that effect runs must not see them and cut this one off in turn.
      const clock = sim_clock();
      // A lone `Blank` closing a coalescing run edits nothing, so it cuts nothing off.
      const cutOff =
        simulating &&
        !observationOnly &&
        !structure &&
        actions.some((action) => action.type !== "Blank") &&
        clock.parameterSnapshots.some((s) => s.t > clock.time)
          ? parameter_snapshot_at(clock.parameterSnapshots, clock.time)
          : null;
      if (cutOff)
        set_sim_clock((prev) => ({
          ...prev,
          parameterSnapshots: prev.parameterSnapshots.filter(
            (s) => s.t <= prev.time,
          ),
        }));
      if (observationOnly) observationOnlyEditRef.current = true;
      // The values coming back may be anything, not just this load's: only a full recompile takes them all.
      else if (!cutOff && is_load_value_only_bundle(actions))
        loadValueOnlyEditRef.current = true;
      if (simulating && structure) {
        exitToEdition();
      }
      setMechanism((prevMechanism) => {
        const newMechanism = apply_actions(
          prevMechanism,
          cutOff ? rebased_bundle(prevMechanism, cutOff, actions) : actions,
        );
        const cs = canvasStateRef.current;
        if (
          cs.type === "SelectedElement" &&
          !newMechanism.mechanicalElements.find((e) => e.id === cs.elementID) &&
          !newMechanism.constraintElements.find((e) => e.id === cs.elementID) &&
          !newMechanism.loads.find((e) => e.id === cs.elementID)
        ) {
          setCanvasState({ type: "Selecting" });
        }
        return newMechanism;
      });
      markDirty(!is_display_only_bundle(actions));
    },
    [
      markDirty,
      setCanvasState,
      exitToEdition,
      simulationRef,
      observationOnlyEditRef,
      loadValueOnlyEditRef,
    ],
  );

  // The field a coalescing run is open for, and the timer that ends it.
  // A run only ever holds the newest entry open, so one of each is enough for the whole app.
  const sealKeyRef = useRef<string | null>(null);
  const sealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const historySeal: HistorySeal = useMemo(() => {
    const close = () => {
      if (sealTimerRef.current !== null) clearTimeout(sealTimerRef.current);
      sealTimerRef.current = null;
      sealKeyRef.current = null;
      applyActions([{ type: "Blank" }]);
    };
    return {
      arm: (key) => {
        // Called before the step it belongs to, so the run it interrupts still ends on its own last entry rather than on the one this step is about to write.
        if (sealKeyRef.current !== null && sealKeyRef.current !== key) close();
        sealKeyRef.current = key;
        if (sealTimerRef.current !== null) clearTimeout(sealTimerRef.current);
        sealTimerRef.current = setTimeout(close, VALUE_EDIT_COALESCE_MS);
      },
      close,
    };
  }, [applyActions]);

  /** Spots the icon constraints an undo/redo recreated or removed, so the canvas reveals them again or fades them out as a red ghost. */
  const signalConstraintChange = useCallback(
    (before: ConstraintElement[], after: ConstraintElement[]) => {
      const beforeById = new Map(before.map((c) => [c.id, c]));
      const afterById = new Map(after.map((c) => [c.id, c]));
      const revealIDs: ID[] = [];
      const removed: ConstraintElement[] = [];
      for (const c of after) {
        if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
          continue;
        // Attached badges have no position/value of their own to have changed — recreation (including by undo/redo) is the only way one of these gets revealed here.
        if (!beforeById.has(c.id)) revealIDs.push(c.id);
      }
      for (const c of before) {
        if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
          continue;
        if (!afterById.has(c.id)) removed.push(c);
      }
      if (revealIDs.length === 0 && removed.length === 0) return;
      constraintChangeRef.current = {
        revealIDs,
        removed,
        seq: ++constraintChangeSeqRef.current,
      };
    },
    [],
  );

  const undoMechanism = useCallback(() => {
    if (mechanismRef.current.history.length === 0) return;

    const isInSim = simulationRef.current.appMode !== "edition";
    const observationOnly = is_observation_only_bundle(
      mechanismRef.current.history.slice(-1)[0],
    );
    if (observationOnly) observationOnlyEditRef.current = true;
    // Taking back a display setting is no more an edit than choosing it was.
    const displayOnly = is_display_only_bundle(
      mechanismRef.current.history.slice(-1)[0],
    );

    setMechanism((prevMechanism) => {
      const lastActionsForUndo = [
        ...prevMechanism.history.slice(-1)[0],
      ].reverse();
      const newMechanism = actionReducer(
        {
          ...prevMechanism,
          history: [...prevMechanism.history.slice(0, -1)],
          future: [...prevMechanism.future, prevMechanism.history.slice(-1)[0]],
        },
        lastActionsForUndo,
        true,
      );
      assert_actions_preserve_validity(
        prevMechanism,
        newMechanism,
        lastActionsForUndo,
        "Undo",
      );
      signalConstraintChange(
        prevMechanism.constraintElements,
        newMechanism.constraintElements,
      );
      const currentState = canvasStateRef.current;
      if (
        currentState.type === "SelectedElement" &&
        !newMechanism.mechanicalElements.find(
          (el) => el.id === currentState.elementID,
        ) &&
        !newMechanism.constraintElements.find(
          (el) => el.id === currentState.elementID,
        ) &&
        !newMechanism.loads.find((el) => el.id === currentState.elementID)
      ) {
        setCanvasState({ type: "Selecting" });
      }
      return newMechanism;
    });

    if (isInSim && !observationOnly) {
      const isEditionAction =
        mechanismRef.current.history.length <= simStartHistoryLengthRef.current;
      if (isEditionAction) {
        // Undoing an action made before entering simulation → exit to edition.
        // The mode-change useEffect resets the kinematic state.
        setAppMode("edition");
      }
      // Otherwise the [mechanism] effect recompiles + truncates snapshots.
    }

    markDirty(!displayOnly);
  }, [
    markDirty,
    signalConstraintChange,
    setCanvasState,
    simulationRef,
    observationOnlyEditRef,
    simStartHistoryLengthRef,
  ]);

  const redoMechanism = useCallback(() => {
    if (mechanismRef.current.future.length === 0) return;

    if (is_observation_only_bundle(mechanismRef.current.future.slice(-1)[0]))
      observationOnlyEditRef.current = true;
    const displayOnly = is_display_only_bundle(
      mechanismRef.current.future.slice(-1)[0],
    );

    setMechanism((prevMechanism) => {
      const nextActions = prevMechanism.future.slice(-1)[0];
      const newMechanism = actionReducer(
        {
          ...prevMechanism,
          history: [...prevMechanism.history, [...nextActions]],
          future: [...prevMechanism.future.slice(0, -1)],
        },
        nextActions,
        false,
      );
      assert_actions_preserve_validity(
        prevMechanism,
        newMechanism,
        nextActions,
        "Redo",
      );
      signalConstraintChange(
        prevMechanism.constraintElements,
        newMechanism.constraintElements,
      );
      const currentState = canvasStateRef.current;
      if (
        currentState.type === "SelectedElement" &&
        !newMechanism.mechanicalElements.find(
          (el) => el.id === currentState.elementID,
        ) &&
        !newMechanism.constraintElements.find(
          (el) => el.id === currentState.elementID,
        ) &&
        !newMechanism.loads.find((el) => el.id === currentState.elementID)
      ) {
        setCanvasState({ type: "Selecting" });
      }
      return newMechanism;
    });

    // In simulation, the [mechanism] effect recompiles + truncates snapshots.
    markDirty(!displayOnly);
  }, [
    markDirty,
    signalConstraintChange,
    setCanvasState,
    observationOnlyEditRef,
  ]);

  // Window-wide drop target for importing .slidep/.zip files, independent of whatever React element the pointer happens to be over (incl. portaled dialogs like the gallery).
  // The enter/leave counter is the standard trick to keep the overlay visible while the pointer crosses child elements.
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  useEffect(() => {
    let dragCounter = 0;
    const isFileDrag = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter++;
      setIsDraggingFile(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) setIsDraggingFile(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingFile(false);
      if (e.dataTransfer && e.dataTransfer.files.length > 0)
        handleFilesDropped(e.dataTransfer.files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFilesDropped]);

  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const handleInfoOpen = () => {
    setInfoOpen(true);
  };
  const handleInfoClose = () => {
    setInfoOpen(false);
  };

  /** Which section is hovered in the library tab — also what tints the canvas for as long as that hover lasts, the same "hover a group to color it" gesture the DDL redundancy audit already uses.
   * `null` the rest of the time. */
  const [librarySection, setLibrarySection] = useState<
    "materials" | "profiles" | null
  >(null);
  /** A row hovered there, for the canvas to accentuate its beams and fade the rest. */
  const [hoveredLibraryEntryID, setHoveredLibraryEntryID] = useState<ID | null>(
    null,
  );
  useEffect(() => {
    if (activeTab !== "library") {
      setLibrarySection(null);
      setHoveredLibraryEntryID(null);
    }
  }, [activeTab]);

  // The chosen language lives in `i18n`, which every module reads through `t`; this state is only what makes React repaint the app around it.
  const [language, setLanguageState] = useState<Lang>(get_language);
  const handleSelectLang = (newLanguage: Lang) => {
    set_language(newLanguage);
    setLanguageState(newLanguage);
  };

  /**
   * App starts: frame the (still empty) mechanism like "Recentrer" would, which is only measurable once the canvas has been laid out.
   */
  useLayoutEffect(() => {
    let frame = 0;
    const center = () => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width === 0) {
        frame = requestAnimationFrame(center);
        return;
      }
      setMechanism((prev) => ({
        ...prev,
        viewport: fit_to_content(prev, canvas),
      }));
    };
    center();
    return () => cancelAnimationFrame(frame);
  }, []);

  // What "Recentrer" aims for, and what its disabled state compares against.
  // Computed once here rather than twice inside the button's JSX.
  const recenterTarget = canvasRef.current
    ? fit_to_content(mechanism, canvasRef.current)
    : null;

  return (
    <ThemeProvider theme={currentTheme}>
      <HistorySealContext.Provider value={historySeal}>
        <CssBaseline />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            overflow: "hidden",
          }}
        >
          {/* App Bar */}
          <AppBar
            position="static"
            elevation={0}
            sx={{
              backgroundColor: "background.toolbar",
              border: "none",
              borderRadius: 0,
              // A rule in the top bar is read against the toolbar, never against the `paper` the default divider is cut for.
              "& .MuiDivider-root": { borderColor: "dividers.toolbar" },
            }}
          >
            {/* ── Main toolbar ── */}
            <Toolbar
              variant="dense"
              disableGutters
              sx={{
                display: "grid",
                // Equal side columns keep the center column geometrically centered regardless of how wide the title or the right-hand controls are.
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                px: 1,
                gap: 0.5,
                minHeight: "40px !important",
              }}
            >
              <PlaybackControls
                appMode={appMode}
                setAppMode={setAppMode}
                mechanism={mechanism}
                shownSimulation={analysedMechanism.simulation}
                updateMetadata={updateMetadata}
                applyActions={applyActions}
                condensed={condensed}
                tight={tight}
                timeline={timeline}
                runtimeState={runtimeState}
                resetToStart={resetToStart}
                handleSpaceKey={handleSpaceKey}
                onOpenGallery={handleOpenGallery}
                saveStatus={saveStatus}
                previewBeamStressLens={previewLensLater}
                trajectoryDotted={trajectoryDotted}
                setTrajectoryDotted={setTrajectoryDotted}
                rightSlot={
                  <ToolsMenu
                    mechanism={mechanism}
                    recenterTarget={recenterTarget}
                    onRecenter={(target) =>
                      setMechanism((prev) => ({ ...prev, viewport: target }))
                    }
                    undoMechanism={undoMechanism}
                    redoMechanism={redoMechanism}
                    onZoomTo={zoomTo}
                    tight={tight}
                    language={language}
                    onSelectLang={handleSelectLang}
                    showGrid={showGrid}
                    setShowGrid={setShowGrid}
                    snapToGrid={snapToGrid}
                    setSnapToGrid={setSnapToGrid}
                    snapSettings={snapSettings}
                    setSnapSettings={setSnapSettings}
                    isCustomAngleStep={isCustomAngleStep}
                    themeChoice={themeChoice}
                    systemDark={systemDark}
                    changeTheme={changeTheme}
                    previewLater={previewLater}
                    onOpenAbout={handleInfoOpen}
                  />
                }
              />
            </Toolbar>

            <SimulationTimeline
              appMode={appMode}
              runtimeState={runtimeState}
              timeline={timeline}
              timelineTrackRef={timelineTrackRef}
            />
          </AppBar>

          {/* Main content area */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
              backgroundColor: "background.default",
            }}
          >
            <ElementPalette
              setCanvasState={setCanvasState}
              canvasState={canvasState}
              mechanism={mechanism}
              appMode={appMode}
            />

            <Box sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
              <MechanicalCanvas
                ref={canvasRef}
                setCanvasState={setCanvasState}
                canvasState={canvasState}
                applyActions={applyActions}
                changeViewport={changeViewport}
                mechanism={mechanism}
                setHoveredPart={setHoveredPart}
                hoveredPart={hoveredPart}
                undoMechanism={undoMechanism}
                redoMechanism={redoMechanism}
                appMode={appMode}
                activeTab={activeTab}
                constraintChangeRef={constraintChangeRef}
                onSpaceKey={handleSpaceKey}
                onEscapeKey={handleEscapeKey}
                onSimulationGrab={handleSimulationGrab}
                onSimulationGrabEnd={handleSimulationGrabEnd}
                canSimulationGrab={canSimulationGrab}
                snapToGrid={snapToGrid}
                snapSettings={snapSettings}
                showGrid={showGrid}
                beamStressLens={activeBeamStressLens}
                trajectoryDotted={trajectoryDotted}
                liveFrameRef={liveFrameRef}
                highlight={highlight}
                blockedMotors={blockedMotors}
                modePreviewRef={modePreviewRef}
                redundancySymbols={redundancySymbols}
                hoveredAbscissa={hoveredAbscissa}
                hoveredBalanceTerm={hoveredBalanceTerm}
                momentBalancePoint={momentBalancePoint}
                onMomentBalanceReferencePicked={setMomentBalanceReference}
                momentBalanceReferenceHovered={momentBalanceReferenceHovered}
                onSelectOverlay={setFocusedOverlay}
                focusedOverlay={focusedOverlay}
                librarySection={
                  activeTab === "library"
                    ? (librarySection ?? undefined)
                    : undefined
                }
                hoveredLibraryEntryID={hoveredLibraryEntryID}
              />
            </Box>

            <PropertiesPanel
              setHighlight={setHighlight}
              setRedundancySymbols={setRedundancySymbols}
              modePreviewRef={modePreviewRef}
              setCanvasState={setCanvasState}
              clearSelectionKeepTab={clearSelectionKeepTab}
              canvasState={canvasState}
              applyActions={applyActions}
              mechanism={mechanism}
              analysedMechanism={analysedMechanism}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              updateMetadata={updateMetadata}
              allTags={allTags}
              setRuntimeState={setRuntimeState}
              runtimeState={runtimeState}
              setSimulationConfig={setSimulationConfig}
              simulationConfig={simulationConfig}
              appMode={appMode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              blockedMotors={blockedMotors}
              setHoveredAbscissa={setHoveredAbscissa}
              setHoveredBalanceTerm={setHoveredBalanceTerm}
              momentBalanceReference={momentBalanceReference}
              setMomentBalanceReference={setMomentBalanceReference}
              setMomentBalanceReferenceHovered={setMomentBalanceReferenceHovered}
              focusedOverlay={focusedOverlay}
              setFocusedOverlay={setFocusedOverlay}
              setLibrarySection={setLibrarySection}
              hoveredLibraryEntryID={hoveredLibraryEntryID}
              setHoveredLibraryEntryID={setHoveredLibraryEntryID}
            />
          </Box>
        </Box>
        <MechanismsGallery
          open={galleryOpen}
          onClose={closeGallery}
          mechanismRecords={savedMechanisms}
          onLoad={handleLoadFromGallery}
          onRename={handleRenameFromGallery}
          onDelete={handleDeleteFromGallery}
          onDuplicate={handleDuplicateFromGallery}
          onUpdateTags={handleUpdateTagsFromGallery}
          onNew={handleNewFromGallery}
          onImport={handleMenuButtonUpload}
          onExport={handleExportRecord}
          onExportAll={handleExportAllRecords}
          onRestoreExamples={handleRestoreExamples}
        />
        <AboutDialog open={infoOpen} onClose={handleInfoClose} />
        <Snackbar
          open={snackbar.open}
          autoHideDuration={snackbar.duration ?? SNACKBAR_DURATION.DEFAULT}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              pl: 2,
              pr: 1.5,
              py: 1,
              borderRadius: 999,
              // Deliberately a dark scrim rather than a themed surface: the toast floats over the canvas and must stay legible against any drawing.
              backgroundColor: (t) => alpha(t.palette.common.black, 0.53),
              backdropFilter: "blur(6px)",
              color: "common.white",
              fontSize: "0.85rem",
              fontWeight: 500,
              // Inset rather than a real border, so the pill's radius stays exact.
              ...(snackbar.severity === "warning" && {
                boxShadow: (t) => `inset 0 0 0 1.5px ${t.palette.warning.main}`,
              }),
            }}
          >
            {snackbar.severity === "warning" && (
              <WarningAmber
                sx={{ fontSize: 17, color: "warning.main", flexShrink: 0 }}
              />
            )}
            <Typography
              sx={{
                fontSize: "inherit",
                fontWeight: "inherit",
                color: "inherit",
              }}
            >
              {snackbar.message}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setSnackbar((prev) => ({ ...prev, open: false }))}
              sx={{
                color: (t) => alpha(t.palette.common.white, 0.6),
                p: 0.25,
                "&:hover": { color: "common.white" },
              }}
            >
              <Close sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        </Snackbar>
        <Fade in={isDraggingFile}>
          <Box
            sx={{
              position: "fixed",
              inset: 0,
              // Above dialogs (the gallery included) and the snackbar: the drop target is the whole window, whatever is open on top of it.
              zIndex: (t) => t.zIndex.tooltip + 100,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // A constant dark veil rather than a themed surface, so the drop zone reads the same over any drawing/theme underneath — same choice as the snackbar's scrim below.
              backgroundColor: (t) => alpha(t.palette.common.black, 0.55),
              backdropFilter: "blur(2px)",
            }}
          >
            <Box
              sx={{
                m: 3,
                px: 5,
                py: 4,
                borderRadius: 3,
                border: "2px dashed",
                borderColor: "primary.main",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
                color: "primary.main",
              }}
            >
              <UploadFile sx={{ fontSize: 40, color: "inherit" }} />
              <Typography
                sx={{ fontSize: "1.1rem", fontWeight: 600, color: "inherit" }}
              >
                {t("drop_to_import")}
              </Typography>
            </Box>
          </Box>
        </Fade>
      </HistorySealContext.Provider>
    </ThemeProvider>
  );
};

export default App;
