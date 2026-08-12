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
  alpha,
  useMediaQuery,
} from "@mui/material";
import { Close, WarningAmber } from "@mui/icons-material";
import {
  Action,
  AppMode,
  ConstraintElement,
  DEFAULT_METADATA,
  DEFAULT_SIMULATION_CONFIG,
  ID,
  Mechanism,
  MechanismMetadata,
  PropertiesPanelTab,
  SimulationConfig,
  UnionElement,
  ViewportChange,
  ZERO,
} from "./types";
import { getStorageItem, setStorageItem, zoom_on_point } from "./utils";
import { useThemeChoice } from "./constants/use-theme-choice";
import { get_language, Lang, set_language, t } from "./i18n";
import { SNACKBAR_DURATION } from "./constants/rendering-specs";
import MechanicalCanvas, {
  ConstraintChangeSignal,
} from "./components/canvas/MechanicalCanvas";
import { CanvasHighlight, NO_HIGHLIGHT } from "./components/canvas/draw-canvas";
import {
  EMPTY_REDUNDANCY_SYMBOLS,
  RedundancySymbol,
} from "./components/solver/redundancy-symbols";

import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import { AboutDialog } from "./components/toolbar/AboutDialog";
import { SimulationTimeline } from "./components/toolbar/SimulationTimeline";
import { ToolsMenu } from "./components/toolbar/ToolsMenu";
import { PlaybackControls } from "./components/toolbar/PlaybackControls";
import { set_sim_clock as setRuntimeState } from "./components/solver/sim-clock";
import {
  apply_snapshot_to_mechanism,
  snapshot_at,
} from "./components/solver/kinematic-simulation";
import {
  useKinematicPlayback,
  SimulationLimitReason,
} from "./components/solver/use-kinematic-playback";
import { CanvasState } from "./types/canvas-state";
import {
  ANGLE_STEPS,
  DEFAULT_SNAP_SETTINGS,
  type SnapSettings,
} from "./components/canvas/snap-corridor";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { assert_actions_preserve_validity } from "./utils/assert-mechanism";
import { apply_actions } from "./components/mechanism/apply-actions";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import {
  fit_to_content,
  useMechanismLibrary,
} from "./components/mechanisms-gallery/use-mechanism-library";

/** Raccourcit les libellés (Édition → Édit, masque les labels des chips). */
const CONDENSED_BREAKPOINT = 1400;
/** Retire en plus les séparateurs et resserre les espacements pour les fenêtres vraiment étroites. */
const TIGHT_BREAKPOINT = 1100;

/**
 * The three classes an edit can fall into during a simulation.
 *
 *  - **observation** (probe configs, overlay visibility): affects neither the
 *    model nor the snapshots — no recompile, no truncation.
 *  - **parameter** (loads, motor speed): takes effect at the current time. The
 *    past snapshots stay valid, the future ones are truncated and the motion is
 *    recomputed from there. Does NOT leave simulation mode.
 *  - **structure** (geometry, dimensions, ground, connections): forbidden at the
 *    source by greying out the controls (ElementProperties); the exit to edition
 *    remains only as a safety net.
 */
const OBSERVATION_ACTIONS: Action["type"][] = ["SetProbes", "SetShowOverlay"];

const PARAMETER_ACTIONS: Action["type"][] = [
  "SetMotorConfig",
  "ChangeForce",
  "ChangeDistributedForce",
  "ChangeMoment",
  "SetLoadFrame",
];

const is_observation_only_bundle = (actions: Action[]) =>
  actions.length > 0 &&
  actions.every((a) => OBSERVATION_ACTIONS.includes(a.type));

/** A load creation/deletion is a parameter edit too (a load is an input, not
 *  structure); any other Create/Delete is structural. */
const is_load_element = (el: UnionElement) =>
  el.type === "force" ||
  el.type === "moment" ||
  el.type === "distributed-force";

const is_parameter_action = (a: Action) =>
  PARAMETER_ACTIONS.includes(a.type) ||
  ((a.type === "CreateElement" || a.type === "DeleteElement") &&
    is_load_element(a.element));

/** Structure edits are the ones the simulation cannot absorb: they still exit
 *  to edition (the safety net behind the greyed-out controls). */
const is_structure_bundle = (actions: Action[]) =>
  actions.some(
    (a) => !OBSERVATION_ACTIONS.includes(a.type) && !is_parameter_action(a),
  );

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
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  });

  const [hoveredPart, setHoveredPart] = useState<HoveredPart>({
    type: "Void",
    position: ZERO,
  });

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
  const [snapSettings, setSnapSettings] = useState<SnapSettings>(
    getStorageItem<SnapSettings>("snapSettings", DEFAULT_SNAP_SETTINGS),
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
    setStorageItem("snapSettings", snapSettings);
  }, [snapSettings]);

  // La largeur de la top-bar suit la fenêtre, pas le canvas : ces requêtes
  // re-rendent le composant à chaque franchissement de palier.
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
  // Canal de retour visuel undo/redo des contraintes-icônes (lu par le canvas).
  const constraintChangeRef = useRef<ConstraintChangeSignal | null>(null);
  const constraintChangeSeqRef = useRef(0);

  /** `duration` overrides the default for messages that take longer to read, or
   *  that report something lost. `severity: "warning"` marks those same messages
   *  visually — the two aren't always paired (e.g. `file_unreadable` stays short
   *  but still warrants the warning look). */
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
      prevCanvasState.type === "PlacingProbeMetrics"
    ) {
      setActiveTab("analysis");
    } else if (appMode === "edition") {
      if (
        canvasState.type === "Erasing" ||
        canvasState.type === "ErasingMultiple" ||
        canvasState.type === "EditingValue"
      ) {
        // Armed tool / transient value edit: never moves the tab.
      } else if (canvasState.type === "SelectingMultiple") {
        setActiveTab(
          canvasState.elementIDs.length > 0 ? "elements" : "project",
        );
      } else if ("elementID" in canvasState) {
        const constraint = mechanism.constraintElements.find(
          (el) => el.id === canvasState.elementID,
        );
        if (
          mechanism.mechanicalElements.find(
            (el) => el.id === canvasState.elementID,
          ) ||
          mechanism.loads.find((el) => el.id === canvasState.elementID)
        ) {
          setActiveTab("elements");
        } else if (constraint && !("value" in constraint)) {
          setActiveTab("constraints");
        }
      } else if (
        "elementIDs" in canvasState &&
        canvasState.elementIDs.length > 0
      ) {
        setActiveTab("elements");
      } else if (!is_armed_tool_waiting(prevCanvasState, mechanism)) {
        // "Selecting", or any armed tool carrying no selection at all
        // (PlacingBeamStart, DimensionStart, ...): only a genuine
        // deselection deserves the fallback.
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

  // Entering simulation is the one automatic switch to the analysis tab;
  // from there, selecting elements no longer moves it.
  useEffect(() => {
    if (appMode !== "edition") setActiveTab("analysis");
  }, [appMode]);

  const {
    runtimeState,
    liveFrameRef,
    timelineTrackRef,
    timeline,
    currentKinematicSnapshot,
    canSimulationGrab,
    handleSpaceKey: handleSpaceKeyForMode,
    handleEscapeKey,
    handleSimulationGrab,
    handleSimulationGrabEnd,
    resetToStart,
    exitToEdition,
    pauseSimulation,
    resetSimulationState: resetSimulationStateFor,
    kinematicRef,
    simStartHistoryLengthRef,
    probeOnlyEditRef,
  } = useKinematicPlayback({
    mechanism,
    appMode,
    setAppMode,
    setCanvasState,
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

  const handleSpaceKey = useCallback(
    () => handleSpaceKeyForMode(mechanism.metadata.lastSimulationMode),
    [handleSpaceKeyForMode, mechanism.metadata.lastSimulationMode],
  );

  const resetSimulationState = useCallback(
    () => resetSimulationStateFor(setSimulationConfig),
    [resetSimulationStateFor],
  );

  /**
   * The pose the analysis describes: the one on screen, not the one being edited.
   *
   * Memoised on the clock's INPUTS rather than on `currentKinematicSnapshot`, which
   * `snapshot_at` rebuilds by interpolation whenever the cursor sits between two samples —
   * a fresh object every render, and with it a fresh element list. The analysis caches its
   * measurements by that list, so deriving from the snapshot would re-measure on every
   * render of the application. Held still, this yields one measurement; scrubbing is what
   * the panel's debounce is there for.
   *
   * The panel keeps the edition mechanism for everything else: it is a place one edits
   * from, and a simulated pose must never become the thing an action is applied to.
   */
  const analysedMechanism = useMemo(() => {
    if (appMode !== "kinematic") return mechanism;
    const snapshot = snapshot_at(
      runtimeState.kinematicSnapshots,
      runtimeState.time,
    );
    return snapshot
      ? apply_snapshot_to_mechanism(mechanism, snapshot)
      : mechanism;
  }, [
    appMode,
    mechanism,
    runtimeState.kinematicSnapshots,
    runtimeState.time,
  ]);

  const {
    saveStatus,
    galleryOpen,
    savedMechanisms,
    markDirty,
    handleOpenGallery,
    closeGallery,
    handleLoadFromGallery,
    handleRenameFromGallery,
    handleDeleteFromGallery,
    handleNewFromGallery,
    handleMenuButtonUpload,
    handleExportRecord,
    handleExportAllRecords,
  } = useMechanismLibrary({
    mechanismRef,
    canvasRef,
    setMechanism,
    setCanvasState,
    setSnackbar,
    resetSimulationState,
  });

  const updateMetadata = useCallback(
    (metadata: MechanismMetadata) => {
      setMechanism((prevMechanism) => ({ ...prevMechanism, metadata }));
      markDirty();
    },
    [markDirty],
  );

  const changeViewport = useCallback((change: ViewportChange) => {
    setMechanism((prevMechanism) => {
      const ov = prevMechanism.viewport;
      return {
        ...prevMechanism,
        viewport:
          change.type === "Pan"
            ? { pan: ov.pan.add(change.delta), scale: ov.scale }
            : zoom_on_point(change.deltaY, change.center, ov),
      };
    });
  }, []);

  const applyActions = useCallback(
    (actions: Action[]) => {
      if (is_observation_only_bundle(actions)) probeOnlyEditRef.current = true;
      if (
        kinematicRef.current.appMode !== "edition" &&
        is_structure_bundle(actions)
      ) {
        exitToEdition();
      }
      setMechanism((prevMechanism) => {
        const newMechanism = apply_actions(prevMechanism, actions);
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
      markDirty();
    },
    [
      markDirty,
      setCanvasState,
      exitToEdition,
      kinematicRef,
      probeOnlyEditRef,
    ],
  );

  /** Repère les contraintes-icônes recréées/supprimées par un undo/redo pour que le canvas les fasse réapparaître (reveal) ou s'estomper (fantôme rouge). */
  const signalConstraintChange = useCallback(
    (
      before: ConstraintElement[],
      after: ConstraintElement[],
      actions: Action[],
    ) => {
      const movedByAction = new Set<ID>();
      for (const a of actions)
        if (a.type === "MoveConstraint") movedByAction.add(a.id);
      const beforeById = new Map(before.map((c) => [c.id, c]));
      const afterById = new Map(after.map((c) => [c.id, c]));
      const revealIDs: ID[] = [];
      const removed: ConstraintElement[] = [];
      for (const c of after) {
        if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
          continue;
        const prev = beforeById.get(c.id);
        // Recréée, ou déplacée/éditée par une action explicite → la révéler.
        if (
          !prev ||
          (movedByAction.has(c.id) &&
            (prev.position.x !== c.position.x ||
              prev.position.y !== c.position.y)) ||
          ("value" in prev && "value" in c && prev.value !== c.value)
        )
          revealIDs.push(c.id);
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

    const isInSim = kinematicRef.current.appMode !== "edition";
    const probeOnly = is_observation_only_bundle(
      mechanismRef.current.history.slice(-1)[0],
    );
    if (probeOnly) probeOnlyEditRef.current = true;

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
        lastActionsForUndo,
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

    if (isInSim && !probeOnly) {
      const isEditionAction =
        mechanismRef.current.history.length <= simStartHistoryLengthRef.current;
      if (isEditionAction) {
        // Undoing an action made before entering simulation → exit to edition.
        // The mode-change useEffect resets the kinematic state.
        setAppMode("edition");
      }
      // Otherwise the [mechanism] effect recompiles + truncates snapshots.
    }

    markDirty();
  }, [
    markDirty,
    signalConstraintChange,
    setCanvasState,
    kinematicRef,
    probeOnlyEditRef,
    simStartHistoryLengthRef,
  ]);

  const redoMechanism = useCallback(() => {
    if (mechanismRef.current.future.length === 0) return;

    if (is_observation_only_bundle(mechanismRef.current.future.slice(-1)[0]))
      probeOnlyEditRef.current = true;

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
        nextActions,
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
    markDirty();
  }, [
    markDirty,
    signalConstraintChange,
    setCanvasState,
    probeOnlyEditRef,
  ]);

  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const handleInfoOpen = () => {
    setInfoOpen(true);
  };
  const handleInfoClose = () => {
    setInfoOpen(false);
  };

  // The chosen language lives in `i18n`, which every module reads through `t`; this state is
  // only what makes React repaint the app around it.
  const [language, setLanguageState] = useState<Lang>(get_language);
  const handleSelectLang = (newLanguage: Lang) => {
    set_language(newLanguage);
    setLanguageState(newLanguage);
  };

  /**
   * App starts: frame the (still empty) mechanism like "Recentrer" would, which
   * is only measurable once the canvas has been laid out.
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

  // What "Recentrer" aims for, and what its disabled state compares against —
  // computed once here rather than twice inside the button's JSX.
  const recenterTarget = canvasRef.current
    ? fit_to_content(mechanism, canvasRef.current)
    : null;

  return (
    <ThemeProvider theme={currentTheme}>
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
            // A rule in the top bar is read against the toolbar, never against
            // the `paper` the default divider is cut for.
            "& .MuiDivider-root": { borderColor: "dividers.toolbar" },
          }}
        >
          {/* ── Toolbar principale ── */}
          <Toolbar
            variant="dense"
            disableGutters
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1,
              gap: 0.5,
              minHeight: "40px !important",
            }}
          >
            <PlaybackControls
              appMode={appMode}
              setAppMode={setAppMode}
              mechanism={mechanism}
              updateMetadata={updateMetadata}
              applyActions={applyActions}
              condensed={condensed}
              tight={tight}
              timeline={timeline}
              runtimeState={runtimeState}
              resetToStart={resetToStart}
              handleSpaceKey={handleSpaceKey}
              simulationConfig={simulationConfig}
              setSimulationConfig={setSimulationConfig}
              onOpenGallery={handleOpenGallery}
              saveStatus={saveStatus}
              rightSlot={
                <ToolsMenu
                  mechanism={mechanism}
                  recenterTarget={recenterTarget}
                  onRecenter={(target) =>
                    setMechanism((prev) => ({ ...prev, viewport: target }))
                  }
                  undoMechanism={undoMechanism}
                  redoMechanism={redoMechanism}
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
        </AppBar>

        {/* Main content area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            position: "relative",
            overflow: "hidden",
            backgroundColor: "background.default",
          }}
        >
          {/* Canvas */}
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
            onExitToEdition={exitToEdition}
            onPauseSim={pauseSimulation}
            onSimulationGrab={handleSimulationGrab}
            onSimulationGrabEnd={handleSimulationGrabEnd}
            canSimulationGrab={canSimulationGrab}
            snapToGrid={snapToGrid}
            snapSettings={snapSettings}
            showGrid={showGrid}
            liveFrameRef={liveFrameRef}
            highlight={highlight}
            modePreviewRef={modePreviewRef}
            redundancySymbols={redundancySymbols}
          />

          {/* Floating panels */}

          {appMode !== "edition" && (
            <SimulationTimeline
              appMode={appMode}
              runtimeState={runtimeState}
              timeline={timeline}
              timelineTrackRef={timelineTrackRef}
            />
          )}
          <ElementPalette
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            mechanism={mechanism}
            appMode={appMode}
            onExitToEdition={exitToEdition}
            onPauseSim={pauseSimulation}
          />
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
            setRuntimeState={setRuntimeState}
            runtimeState={runtimeState}
            setSimulationConfig={setSimulationConfig}
            simulationConfig={simulationConfig}
            appMode={appMode}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            unsatisfied={currentKinematicSnapshot?.unsatisfied ?? []}
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
        onNew={handleNewFromGallery}
        onImport={handleMenuButtonUpload}
        onExport={handleExportRecord}
        onExportAll={handleExportAllRecords}
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
            // Deliberately a dark scrim rather than a themed surface: the toast
            // floats over the canvas and must stay legible against any drawing.
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
            <WarningAmber sx={{ fontSize: 17, color: "warning.main", flexShrink: 0 }} />
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
    </ThemeProvider>
  );
};

export default App;
