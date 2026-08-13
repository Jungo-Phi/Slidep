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
  apply_parameter_snapshot_to_mechanism,
  apply_snapshot_to_mechanism,
  parameter_snapshot_at,
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

  const analysedMechanism = useMemo(() => {
    if (appMode !== "kinematic") return mechanism;
    const snapshot = snapshot_at(
      runtimeState.kinematicSnapshots,
      runtimeState.time,
    );
    if (!snapshot) return mechanism;
    const geometryMechanism = apply_snapshot_to_mechanism(mechanism, snapshot);
    const paramSnapshot = parameter_snapshot_at(
      runtimeState.parameterSnapshots,
      runtimeState.time,
    );
    return paramSnapshot
      ? apply_parameter_snapshot_to_mechanism(geometryMechanism, paramSnapshot)
      : geometryMechanism;
    // Depend on geometry/parameters only, not the whole mechanism: a viewport (pan/zoom)
    // change keeps these array refs identical, so it must not re-derive the pose on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appMode,
    mechanism.mechanicalElements,
    mechanism.loads,
    runtimeState.kinematicSnapshots,
    runtimeState.parameterSnapshots,
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
    handleUpdateTagsFromGallery,
    handleDeleteFromGallery,
    handleNewFromGallery,
    handleMenuButtonUpload,
    handleFilesDropped,
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

  // Valeurs déjà utilisées quelque part dans la bibliothèque. Les trois modes de simulation
  // sont toujours suggérés en plus, comme point de départ le plus courant pour trier.
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
    [markDirty, setCanvasState, exitToEdition, kinematicRef, probeOnlyEditRef],
  );

  /** Repère les contraintes-icônes recréées/supprimées par un undo/redo pour que le canvas les fasse réapparaître (reveal) ou s'estomper (fantôme rouge). */
  const signalConstraintChange = useCallback(
    (before: ConstraintElement[], after: ConstraintElement[]) => {
      const beforeById = new Map(before.map((c) => [c.id, c]));
      const afterById = new Map(after.map((c) => [c.id, c]));
      const revealIDs: ID[] = [];
      const removed: ConstraintElement[] = [];
      for (const c of after) {
        if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
          continue;
        // Attached badges have no position/value of their own to have changed —
        // recreation (including by undo/redo) is the only way one of these gets
        // revealed here.
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
  }, [markDirty, signalConstraintChange, setCanvasState, probeOnlyEditRef]);

  // Window-wide drop target for importing .slidep/.zip files, independent of
  // whatever React element the pointer happens to be over (incl. portaled
  // dialogs like the gallery). The enter/leave counter is the standard trick
  // to keep the overlay visible while the pointer crosses child elements.
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

  // What "Recentrer" aims for, and what its disabled state compares against.
  // Computed once here rather than twice inside the button's JSX.
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
            allTags={allTags}
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
        onUpdateTags={handleUpdateTagsFromGallery}
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
            // A constant dark veil rather than a themed surface, so the drop
            // zone reads the same over any drawing/theme underneath — same
            // choice as the snackbar's scrim below.
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
    </ThemeProvider>
  );
};

export default App;
