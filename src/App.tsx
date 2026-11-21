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
  Mechanism,
  MechanismMetadata,
  ParameterSnapshot,
  Point2,
  PropertiesPanelTab,
  SimulationConfig,
  ViewportChange,
  ViewportState,
  ZERO,
  is_simulating,
} from "./types";
import {
  clamp_pan,
  follow_view_area,
  getStorageItem,
  setStorageItem,
  ViewArea,
  zoom_delta_to,
  zoom_on_point,
} from "./utils";
import { PHONE_LAYOUT } from "./constants/layout-specs";
import { useThemeChoice } from "./theme/use-theme-choice";
import { get_language, Lang, set_language, t } from "./i18n";
import { LanguageContext } from "./i18n/language-context";
import {
  PANEL_SLIDE_MS,
  SNACKBAR_DURATION,
  VALUE_EDIT_COALESCE_MS,
} from "./constants/interaction-specs";
import { CANVAS_STATE_SIM_EFFECT } from "./constants/canvas-state-sim-effect";
import { rebased_bundle } from "./components/mechanism/parameter-rebase";
import {
  set_sim_clock,
  sim_clock,
  useSimClockSelector,
} from "./components/solver/dynamics/sim-clock";

/** Remembers, across sessions, that the notice explaining a pause triggered by an edit has been shown. */
const PAUSED_FOR_EDIT_NOTICE_KEY = "pausedForEditNoticeShown";
import MechanicalCanvas, {
  ConstraintChangeSignal,
  type MechanicalCanvasProps,
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
import { HintLayer } from "./components/hints/HintLayer";
import { resolve_hint } from "./components/hints/hints";
import {
  PropertiesPanel,
  type PropertiesPanelProps,
} from "./components/properties-panel/PropertiesPanel";
import {
  PhoneLayout,
  type PhoneSheetState,
} from "./components/phone/PhoneLayout";
import { PhoneAppActions } from "./components/phone/PhoneAppActions";
import { usePhoneLayout } from "./components/phone/use-phone-layout";
import {
  escape_goes_to_popup_or_field,
  press_escape,
  useBackAsEscape,
} from "./components/common/use-back-as-escape";
import { AboutDialog } from "./components/toolbar/AboutDialog";
import { WelcomeDialog } from "./components/welcome/WelcomeDialog";
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
import { carried_focus } from "./components/properties-panel/selection-subject";
import { set_sim_clock as setRuntimeState } from "./components/solver/dynamics/sim-clock";
import { parameter_snapshot_at } from "./components/solver/dynamics/simulation-engine";
import {
  CLOCK_MIRROR_MS,
  analysed_mechanism,
  blocked_motors,
  same_members,
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
import {
  HoveredAbscissaSource,
  HoveredPart,
  is_measured_reading,
} from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { assert_actions_preserve_validity } from "./utils/assert-mechanism";
import { apply_actions } from "./components/mechanism/apply-actions";
import { note_slidep_birth } from "./components/canvas/slidep-birth";
import {
  HistorySeal,
  HistorySealContext,
} from "./components/mechanism/history-seal";
import {
  is_display_only_bundle,
  is_inert_bundle,
  is_load_value_only_bundle,
  is_observation_only_bundle,
  is_structure_bundle,
} from "./components/mechanism/action-kind";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import {
  focus_zone,
  useRovingToolbar,
  useZoneCycling,
  zone_props,
} from "./components/common/keyboard-zones";
import {
  fit_to_content,
  useMechanismLibrary,
} from "./components/mechanisms-gallery/use-mechanism-library";

/** Shortens the mode names (Statique → Stat): the widest labels of the bar go first. */
const SHORT_MODES_BREAKPOINT = 1250;
/** Then closes up the rules between the groups of the bar. */
const TIGHT_RULES_BREAKPOINT = 1155;
/** Last, hides the labels of the physics and layers menus. */
const CONDENSED_BREAKPOINT = 1080;

/** Whether a canvas state is an armed placement tool waiting for its first click — no element selected, no gesture started. */
const is_armed_tool_waiting = (state: CanvasState, mechanism: Mechanism) => {
  if (
    state.type === "Selecting" ||
    state.type === "Grabbing" ||
    state.type === "SelectingMultiple"
  )
    return false;
  if ("elementIDs" in state) return state.elementIDs.length === 0;
  if (!("elementID" in state)) return true;
  return !(
    mechanism.mechanicalElements.some((el) => el.id === state.elementID) ||
    mechanism.loads.some((el) => el.id === state.elementID) ||
    mechanism.constraintElements.some((el) => el.id === state.elementID)
  );
};

/** What of a `size` canvas is in sight with `cover` of its height hidden under an overlay along its bottom. */
const view_area = (size: ViewArea, cover: number): ViewArea => ({
  width: size.width,
  height: size.height * (1 - cover),
});

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
  // The one exception is a member's internal effort, which follows the selection to another member of the same kind.
  useEffect(() => {
    setFocusedOverlay((focus) =>
      carried_focus(focus, canvasState, mechanismRef.current.mechanicalElements),
    );
  }, [canvasState]);

  /** Elements the analysis panel is pointing at, and why (see `CanvasHighlight`). */
  const [highlight, setHighlight] = useState<CanvasHighlight>(NO_HIGHLIGHT);

  /** How a redundant constraint the analysis panel is naming right now would yield. */
  const [redundancySymbols, setRedundancySymbols] = useState<
    RedundancySymbol[]
  >(EMPTY_REDUNDANCY_SYMBOLS);

  const modePreviewRef = useRef<Mechanism | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("static");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(
    getStorageItem<boolean>("snapToGrid", true),
  );
  const [showGrid, setShowGrid] = useState<boolean>(
    getStorageItem<boolean>("showGrid", true),
  );
  const [showContactPoints, setShowContactPoints] = useState<boolean>(
    getStorageItem<boolean>("showContactPoints", true),
  );
  const [sidePanelOpen, setSidePanelOpenState] = useState<boolean>(
    getStorageItem<boolean>("sidePanelOpen", true),
  );
  // Until when the canvas changes width for the panel folding or unfolding (`performance.now()` ms): every resize of that slide keeps the drawing's scale.
  const panelSlidingUntilRef = useRef(0);
  const setSidePanelOpen = useCallback((open: boolean) => {
    setSidePanelOpenState((before) => {
      // A frame of slack past the slide, for its last resize.
      if (before !== open) panelSlidingUntilRef.current = performance.now() + PANEL_SLIDE_MS + 50;
      return open;
    });
    setStorageItem("sidePanelOpen", open);
  }, []);
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
    setStorageItem("showContactPoints", showContactPoints);
  }, [showContactPoints]);

  useEffect(() => {
    setStorageItem("trajectoryDotted", trajectoryDotted);
  }, [trajectoryDotted]);

  useEffect(() => {
    setStorageItem("snapSettings", snapSettings);
  }, [snapSettings]);

  // The top bar's width follows the window, not the canvas: these queries re-render the component every time a breakpoint is crossed.
  // The keyboard crosses the window by zones, and the top bar is one Tab stop whose buttons the arrows walk.
  useZoneCycling();
  const topBarRef = useRef<HTMLElement>(null);
  useRovingToolbar(topBarRef, { below: "palette" });
  const shortModes = useMediaQuery(`(max-width:${SHORT_MODES_BREAKPOINT}px)`);
  const tightRules = useMediaQuery(`(max-width:${TIGHT_RULES_BREAKPOINT}px)`);
  const condensed = useMediaQuery(`(max-width:${CONDENSED_BREAKPOINT}px)`);
  const phone = usePhoneLayout();
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    DEFAULT_SIMULATION_CONFIG,
  );
  const { themeChoice, systemDark, previewLater, changeTheme, currentTheme } =
    useThemeChoice();

  // The chosen language lives in `i18n`, which every module reads through `t`; this state is only what makes React repaint the app around it, `LanguageContext` included.
  const [language, setLanguageState] = useState<Lang>(get_language);
  const handleSelectLang = useCallback((newLanguage: Lang) => {
    set_language(newLanguage);
    setLanguageState(newLanguage);
  }, []);

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

  // The panel tab the desktop shows — on a phone, the one its bottom bar lights while no sheet says otherwise.
  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>("project");
  // The phone's sheet: it keeps its own tab across selections, so the canvas draws for that tab while the sheet is up.
  const [phoneSheet, setPhoneSheet] = useState<PhoneSheetState | null>(null);
  const shownTab =
    phone && phoneSheet && phoneSheet.tab !== "palette"
      ? phoneSheet.tab
      : activeTab;
  // A move from within the panel — a drill-down, a library link — takes the phone's sheet along when it is up on the panel.
  const showTab = useCallback((tab: PropertiesPanelTab) => {
    setActiveTab(tab);
    setPhoneSheet((sheet) =>
      sheet && sheet.tab !== "palette" ? { ...sheet, tab } : sheet,
    );
  }, []);
  // The analysis has a panel of its own on the desktop, always on screen: only the phone, where it is one tab among others, is taken to it.
  const showAnalysis = useCallback(() => {
    if (phone) setActiveTab("analysis");
  }, [phone]);
  // On a phone in a simulation, where the analysis is one tab among others, a selection moves no tab: a tap does, since a drag takes hold of an element where a tap names it.
  // A tap on an element opens its tab; a tap on empty space goes back to the analysis — a tap, not any deselection.
  const handlePhoneCanvasTap = useCallback(
    (onElement: boolean, state: CanvasState) => {
      if (!is_simulating(appMode)) return;
      if (onElement && state.type === "SelectedElement")
        setActiveTab("elements");
      else if (!onElement && state.type === "Selecting") showAnalysis();
    },
    [appMode, showAnalysis],
  );
  // Enter on a selection from the keyboard opens its page, unfolding the panel, and hands it the focus to go on editing there.
  const inspectFromCanvas = useCallback(() => {
    const ids = selected_ids(canvasStateRef.current);
    const mech = mechanismRef.current;
    const constraintsOnly = ids.every((id) =>
      mech.constraintElements.some((element) => element.id === id),
    );
    showTab(constraintsOnly ? "constraints" : "elements");
    setSidePanelOpen(true);
    // The page is drawn by the render this asks for, so it is entered on the next frame.
    requestAnimationFrame(() => focus_zone("panel"));
  }, [showTab, setSidePanelOpen]);
  // A reading's arrow clicked on the canvas is read on its element's own page; the grab's has none, and leaves the tab where it is.
  const selectOverlayFromCanvas = useCallback((overlay: FocusedOverlay) => {
    setFocusedOverlay(overlay);
    if (is_measured_reading(overlay)) setActiveTab("elements");
  }, []);
  const [prevCanvasState, setPrevCanvasState] =
    useState<CanvasState>(canvasState);

  if (prevCanvasState !== canvasState) {
    setPrevCanvasState(canvasState);
    if (
      canvasState.type === "PlacingProbe" ||
      canvasState.type === "PlacingProbeMetrics" ||
      // Closing the metric box leaves its element selected, and the tab on the measures.
      // A click that lands on something else is a move away from it, and follows the ordinary rules below.
      (prevCanvasState.type === "PlacingProbeMetrics" &&
        selected_ids(canvasState)[0] === prevCanvasState.elementID)
    ) {
      // The measures are read in the analysis.
      if (phone) setActiveTab("analysis");
    } else if (!(phone && is_simulating(appMode))) {
      if (
        // A pull in a simulation takes hold of an element without selecting it: neither it nor its end moves the tab.
        canvasState.type === "SimulationDragging" ||
        prevCanvasState.type === "SimulationDragging" ||
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
    }
  }

  useEffect(() => {
    mechanismRef.current = mechanism;
  }, [mechanism]);

  useEffect(() => {
    canvasStateRef.current = canvasState;
  }, [canvasState]);

  // On the phone, a simulation opens on the mechanism's analysis, unless the elements tab is being read with an element or a load selected: that page is where the reader already was, and it stays.
  // A selection alone never pulls the tab over to the elements.
  // The desktop has the analysis on screen already, beside the canvas: its tabs stay where they are.
  useEffect(() => {
    if (!phone || !is_simulating(appMode)) return;
    const mech = mechanismRef.current;
    const elementSelected = selected_ids(canvasStateRef.current).some(
      (id) =>
        mech.mechanicalElements.some((el) => el.id === id) ||
        mech.loads.some((load) => load.id === id),
    );
    setActiveTab((tab) =>
      tab === "elements" && elementSelected ? "elements" : "analysis",
    );
  }, [appMode, phone]);

  /** Set once `markDirty` exists, below. */
  const adoptValuesRef = useRef<(start: ParameterSnapshot) => void>(
    () => {},
  );

  const {
    liveFrameRef,
    timelineTrackRef,
    handleSpaceKey: handleSpaceKeyForMode,
    handleSimulationGrab,
    handleSimulationGrabEnd,
    changeMode,
    goToRest,
    cutKeptRecording,
    restoreCutRecording,
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
    gravity: mechanism.simulation.gravity
      ? mechanism.simulation.gravityStrength
      : 0,
    collisions: mechanism.simulation.collisions,
    floor: mechanism.simulation.floor.enabled,
    supportReactions: mechanism.simulation.supportReactions,
    focusedOverlay,
    hoveredOverlay:
      hoveredPart.type === "Overlay" && is_measured_reading(hoveredPart.reading)
        ? hoveredPart.reading
        : null,
    inertiaNamed: hoveredBalanceTerm?.inertia === true,
    adoptValues: (shown) => adoptValuesRef.current(shown),
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

  // The clock reaches App only through these selectors, each re-rendering it when its own answer changes: a mirror tick that changes none of them must not reconcile the whole application.
  const blockedMotors = useSimClockSelector(
    (clock) => blocked_motors(appMode, clock),
    CLOCK_MIRROR_MS,
    same_members,
  );
  /** `momentBalanceReference` resolved to the pose on screen, the way every other position the panel reads is. */
  const momentBalancePoint = useSimClockSelector(
    (clock) =>
      resolve_moment_balance_point(
        momentBalanceReference,
        // A plain point reads nothing from the pose, so it is not worth posing the mechanism for.
        momentBalanceReference.kind === "point"
          ? mechanism
          : analysed_mechanism(mechanism, appMode, clock),
      ),
    CLOCK_MIRROR_MS,
    (a, b) => a.equals(b),
  );

  // Entering a gesture is what pauses a running simulation or brings it back to rest, whichever route led to it (see `CANVAS_STATE_SIM_EFFECT`).
  // Keyed on the state alone: entering simulation with a tool still armed must not bounce straight back to rest.
  useEffect(() => {
    if (!is_simulating(simulationRef.current.appMode)) {
      // A pull from rest sets the mechanism moving from where it stands: a fresh run of the mode last used, not the replay of a kept one, which could not be pulled on.
      if (canvasState.type === "SimulationDragging")
        changeMode(mechanismRef.current.metadata.lastSimulationMode, {
          fresh: true,
        });
      return;
    }
    const effect = CANVAS_STATE_SIM_EFFECT[canvasState.type];
    if (effect === "exit") goToRest();
    if (effect !== "pause" || !sim_clock().isPlaying) return;
    pauseSimulation();
    // A pause nobody asked for reads as a bug, but only the first time: the notice is not repeated once seen.
    if (getStorageItem<boolean>(PAUSED_FOR_EDIT_NOTICE_KEY, false)) return;
    setStorageItem(PAUSED_FOR_EDIT_NOTICE_KEY, true);
    setSnackbar({ open: true, message: t("simulation_paused_for_edit") });
  }, [canvasState.type, changeMode, goToRest, pauseSimulation, simulationRef]);

  // The action each hint points at resolves it, whether the hint was shown or not.
  useEffect(() => {
    if (is_simulating(appMode)) resolve_hint("run");
  }, [appMode]);
  useEffect(() => {
    if (canvasState.type === "SimulationDragging") resolve_hint("grab");
  }, [canvasState.type]);
  const isPlaying = useSimClockSelector((clock) => clock.isPlaying, CLOCK_MIRROR_MS);

  const handleSpaceKey = useCallback(
    () => handleSpaceKeyForMode(mechanism.metadata.lastSimulationMode),
    [handleSpaceKeyForMode, mechanism.metadata.lastSimulationMode],
  );

  const resetSimulationState = useCallback(
    () => resetSimulationStateFor(setSimulationConfig),
    [resetSimulationStateFor],
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
    handleUpdateMetadataFromGallery,
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

  // The edit-at-t rule (see `rebased_bundle`) with no edit of its own: the values go back to those of a recorded instant, in one entry a single undo takes back.
  // On the way back to rest, that instant is t=0 — an undo of it, being an edit at rest, cuts the kept recording off.
  // `mechanismRef` is updated at once, for the structure edit that brought the mechanism back to rest to be cut from the history it lands on.
  adoptValuesRef.current = (shown) => {
    const before = mechanismRef.current;
    const rebase = rebased_bundle(before, shown, []);
    if (rebase.length === 0) return;
    const after = apply_actions(before, rebase);
    mechanismRef.current = after;
    setMechanism((prev) => {
      if (prev === before) return after;
      const late = rebased_bundle(prev, shown, []);
      return late.length === 0 ? prev : apply_actions(prev, late);
    });
    markDirty(true);
  };

  // The tags already carried by a mechanism somewhere in the library.
  // The three simulation modes are always suggested alongside them, as the most common way to sort a library.
  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const record of savedMechanisms)
      for (const tag of record.metadata.tags) set.add(tag);
    return set;
  }, [savedMechanisms]);
  const allTags = useMemo(
    () =>
      [
        ...new Set([
          t("mode_static"),
          t("mode_kinematic"),
          t("mode_dynamic"),
          ...usedTags,
        ]),
      ].sort(),
    // `language` is what `t` answers in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usedTags, language],
  );

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
      const simulating = is_simulating(simulationRef.current.appMode);
      const observationOnly = is_observation_only_bundle(actions);
      const structure = is_structure_bundle(actions);
      // An edit made behind later ones in the recording cuts them off, values included (see `rebased_bundle`).
      // Their snapshots go now rather than in the recompile effect: an edit arriving before that effect runs must not see them and cut this one off in turn.
      const clock = sim_clock();
      // A lone `Blank` closing a coalescing run edits nothing, so it cuts nothing off.
      // A replayed recording's later values are not in the stored mechanism either, which stands at t=0 (see `adoptValues`): an edit at its end brings them back first.
      const shown =
        simulating &&
        !observationOnly &&
        !structure &&
        actions.some((action) => action.type !== "Blank")
          ? parameter_snapshot_at(clock.parameterSnapshots, clock.time)
          : null;
      const cutOff =
        shown &&
        (clock.parameterSnapshots.some((s) => s.t > clock.time) ||
          rebased_bundle(mechanismRef.current, shown, []).length > 0)
          ? shown
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
      note_slidep_birth(actions);
      if (simulating && structure) goToRest();
      // An edit at rest is an edit at t=0: it cuts off the whole kept recording.
      if ((!simulating || structure) && !is_inert_bundle(actions))
        cutKeptRecording(mechanismRef.current.history);
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
      goToRest,
      cutKeptRecording,
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

    const isInSim = is_simulating(simulationRef.current.appMode);
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

    // Undoing an edit made before the simulation started takes it back to rest.
    // An edit made during it is the [mechanism] effect's business, which recompiles and truncates the snapshots.
    const history = mechanismRef.current.history;
    const leavesSimulation =
      isInSim &&
      !observationOnly &&
      history.length <= simStartHistoryLengthRef.current;
    if (leavesSimulation) changeMode("static", { keepValues: true });
    // At rest, an undo is an edit like any other, unless it lands back on the history a cut-off recording was made for.
    if ((!isInSim || leavesSimulation) && !is_inert_bundle(history[history.length - 1]))
      if (!restoreCutRecording(history.slice(0, -1))) cutKeptRecording(history);

    markDirty(!displayOnly);
  }, [
    markDirty,
    signalConstraintChange,
    setCanvasState,
    simulationRef,
    observationOnlyEditRef,
    simStartHistoryLengthRef,
    changeMode,
    cutKeptRecording,
    restoreCutRecording,
  ]);

  const redoMechanism = useCallback(() => {
    if (mechanismRef.current.future.length === 0) return;

    if (is_observation_only_bundle(mechanismRef.current.future.slice(-1)[0]))
      observationOnlyEditRef.current = true;
    const displayOnly = is_display_only_bundle(
      mechanismRef.current.future.slice(-1)[0],
    );
    if (
      !is_simulating(simulationRef.current.appMode) &&
      !is_inert_bundle(mechanismRef.current.future.slice(-1)[0])
    )
      cutKeptRecording(mechanismRef.current.history);

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
    simulationRef,
    cutKeptRecording,
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
  const handleInfoOpen = useCallback(() => setInfoOpen(true), []);
  const handleInfoClose = useCallback(() => setInfoOpen(false), []);

  // Shown on the first launch only; About opens it again.
  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(
    () => !getStorageItem<boolean>("welcome-seen", false),
  );
  const handleWelcomeOpen = useCallback(() => {
    setInfoOpen(false);
    setWelcomeOpen(true);
  }, []);
  const handleWelcomeClose = useCallback(() => {
    setWelcomeOpen(false);
    setStorageItem("welcome-seen", true);
  }, []);

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
    if (shownTab !== "library") {
      setLibrarySection(null);
      setHoveredLibraryEntryID(null);
    }
  }, [shownTab]);


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

  // The share of the canvas hidden under the phone's sheet: the view works in what is left in sight above it.
  // Raised to full height, the sheet keeps the half's share — nothing of the canvas is left to aim at.
  const cover = phone && phoneSheet ? PHONE_LAYOUT.SHEET_HALF : 0;
  const coverRef = useRef(cover);
  const canvasSizeRef = useRef<ViewArea | null>(null);
  const followViewArea = useCallback(
    (before: ViewArea, after: ViewArea, keepScale = false) =>
      setMechanism((prev) => ({
        ...prev,
        viewport: follow_view_area(
          prev.viewport,
          before,
          after,
          (area) => fit_to_content(prev, area),
          keepScale,
        ),
      })),
    [],
  );
  // A resized canvas keeps the mechanism where it was in sight, rather than pinned to the top-left corner.
  const handleCanvasResize = useCallback(
    (width: number, height: number) => {
      // A canvas laid out at nothing (hidden) has no centre to keep: its last real size stands.
      if (width === 0 || height === 0) return;
      const before = canvasSizeRef.current;
      canvasSizeRef.current = { width, height };
      // A panel folded or unfolded by the user shows more or less of the drawing, at the same size: a drawing that zoomed with it would read as having changed.
      const keepScale = performance.now() < panelSlidingUntilRef.current;
      if (before)
        followViewArea(
          view_area(before, coverRef.current),
          view_area({ width, height }, coverRef.current),
          keepScale,
        );
    },
    [followViewArea],
  );
  // A sheet raised over the canvas would hide half the mechanism: the view moves into what is left in sight, and back once it goes down.
  useLayoutEffect(() => {
    const before = coverRef.current;
    if (before === cover) return;
    coverRef.current = cover;
    const size = canvasSizeRef.current;
    if (size) followViewArea(view_area(size, before), view_area(size, cover));
  }, [cover, followViewArea]);

  // The system back button of a touch device answers as Escape, the sheet going down before the canvas steps back, and closes the app once there is nothing left to undo.
  const touchDevice = useMediaQuery("(pointer: coarse)");
  useBackAsEscape(touchDevice, () => {
    if (escape_goes_to_popup_or_field()) {
      press_escape();
      return true;
    }
    if (phone && phoneSheet) {
      setPhoneSheet(null);
      return true;
    }
    if (is_simulating(appMode) || canvasStateRef.current.type !== "Selecting") {
      press_escape();
      return true;
    }
    return false;
  });

  // What "Recentrer" aims for, and what its disabled state compares against.
  // Kept as the same object while its value holds, so the menu below is not rebuilt for a target that did not move.
  const fitted = canvasRef.current
    ? fit_to_content(mechanism, view_area(canvasRef.current, cover))
    : null;
  const recenterTargetRef = useRef(fitted);
  const held = recenterTargetRef.current;
  if (
    fitted === null ||
    held === null ||
    fitted.scale !== held.scale ||
    !fitted.pan.equals(held.pan)
  )
    recenterTargetRef.current = fitted;
  const recenterTarget = recenterTargetRef.current;

  const recenter = useCallback(
    (target: ViewportState) =>
      setMechanism((prev) => ({ ...prev, viewport: target })),
    [],
  );

  // The same canvas and panel whichever layout holds them.
  const canvasProps: MechanicalCanvasProps = {
    recenterTarget,
    onRecenter: recenter,
    setCanvasState,
    canvasState,
    applyActions,
    changeViewport,
    mechanism,
    setHoveredPart,
    hoveredPart,
    undoMechanism,
    redoMechanism,
    appMode,
    activeTab: shownTab,
    constraintChangeRef,
    onSpaceKey: handleSpaceKey,
    onEscapeKey: goToRest,
    onSimulationGrab: handleSimulationGrab,
    onSimulationGrabEnd: handleSimulationGrabEnd,
    snapToGrid,
    snapSettings,
    showGrid,
    showContactPoints,
    beamStressLens: activeBeamStressLens,
    trajectoryDotted,
    liveFrameRef,
    highlight,
    blockedMotors,
    modePreviewRef,
    redundancySymbols,
    hoveredAbscissa,
    hoveredBalanceTerm,
    momentBalancePoint,
    onMomentBalanceReferencePicked: setMomentBalanceReference,
    momentBalanceReferenceHovered,
    onSelectOverlay: selectOverlayFromCanvas,
    onInspect: inspectFromCanvas,
    focusedOverlay,
    librarySection:
      shownTab === "library" ? (librarySection ?? undefined) : undefined,
    hoveredLibraryEntryID,
    galleryOpen,
    onResize: handleCanvasResize,
  };
  const panelProps: PropertiesPanelProps = {
    setHighlight,
    setRedundancySymbols,
    modePreviewRef,
    setCanvasState,
    canvasState,
    applyActions,
    mechanism,
    hoveredPart,
    setHoveredPart,
    updateMetadata,
    allTags,
    setRuntimeState,
    setSimulationConfig,
    simulationConfig,
    appMode,
    activeTab,
    setActiveTab: showTab,
    blockedMotors,
    setHoveredAbscissa,
    setHoveredBalanceTerm,
    momentBalanceReference,
    setMomentBalanceReference,
    setMomentBalanceReferenceHovered,
    focusedOverlay,
    setFocusedOverlay,
    setLibrarySection,
    hoveredLibraryEntryID,
    setHoveredLibraryEntryID,
    sideOpen: sidePanelOpen,
    setSideOpen: setSidePanelOpen,
  };

  const toolsMenu = useMemo(
    () => (
      <ToolsMenu
        mechanism={mechanism}
        recenterTarget={recenterTarget}
        onRecenter={recenter}
        onZoomTo={zoomTo}
        language={language}
        onSelectLang={handleSelectLang}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        showContactPoints={showContactPoints}
        setShowContactPoints={setShowContactPoints}
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
    ),
    [
      mechanism,
      recenterTarget,
      recenter,
      zoomTo,
      language,
      handleSelectLang,
      showGrid,
      showContactPoints,
      snapToGrid,
      snapSettings,
      isCustomAngleStep,
      themeChoice,
      systemDark,
      changeTheme,
      previewLater,
      handleInfoOpen,
    ],
  );
  // Held across renders like the menu above: the gallery is memoised, and a fresh node would re-render it with the clock.
  const galleryPhoneActions = useMemo(
    () =>
      phone ? (
        <PhoneAppActions
          language={language}
          onSelectLang={handleSelectLang}
          onOpenAbout={handleInfoOpen}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          showContactPoints={showContactPoints}
          setShowContactPoints={setShowContactPoints}
          snapToGrid={snapToGrid}
          setSnapToGrid={setSnapToGrid}
          snapSettings={snapSettings}
          setSnapSettings={setSnapSettings}
          isCustomAngleStep={isCustomAngleStep}
          themeChoice={themeChoice}
          systemDark={systemDark}
          changeTheme={changeTheme}
          previewLater={previewLater}
        />
      ) : undefined,
    [
      phone,
      language,
      handleSelectLang,
      handleInfoOpen,
      showGrid,
      showContactPoints,
      snapToGrid,
      snapSettings,
      isCustomAngleStep,
      themeChoice,
      systemDark,
      changeTheme,
      previewLater,
    ],
  );

  return (
    <LanguageContext.Provider value={language}>
    <ThemeProvider theme={currentTheme}>
      <HistorySealContext.Provider value={historySeal}>
        <CssBaseline />
        {phone ? (
          <PhoneLayout
            renderCanvas={(onTap) => (
              <MechanicalCanvas
                ref={canvasRef}
                {...canvasProps}
                onTap={(onElement, state) => {
                  onTap(onElement);
                  handlePhoneCanvasTap(onElement, state);
                }}
              />
            )}
            topBar={{
              mechanism,
              undoMechanism,
              redoMechanism,
              recenterTarget,
              onRecenter: recenter,
              appMode,
              setAppMode: changeMode,
              updateMetadata,
              applyActions,
              onOpenGallery: handleOpenGallery,
              overlays: {
                mechanicalElements: mechanism.mechanicalElements,
                applyActions,
                beamStressLens: mechanism.simulation.beamStressLens,
                onChangeBeamStressLens: (lens) =>
                  applyActions([
                    {
                      type: "SetBeamStressLens",
                      newValue: lens,
                      oldValue: mechanism.simulation.beamStressLens,
                    },
                  ]),
                onPreviewBeamStressLens: previewLensLater,
                trajectoryDotted,
                onChangeTrajectoryDotted: setTrajectoryDotted,
                supportReactions: mechanism.simulation.supportReactions,
                onChangeSupportReactions: (on) =>
                  applyActions([{ type: "SetSupportReactions", enabled: on }]),
              },
            }}
            panel={panelProps}
            sheet={phoneSheet}
            setSheet={setPhoneSheet}
            setCanvasState={setCanvasState}
            onPlayPause={handleSpaceKey}
            timelineTrackRef={timelineTrackRef}
          />
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              overflow: "hidden",
              // Clear of what a tablet lays over the page (status bar aside, a home indicator, a notch on the side); the top bar runs its ground under the status bar itself.
              pb: "env(safe-area-inset-bottom)",
              pl: "env(safe-area-inset-left)",
              pr: "env(safe-area-inset-right)",
            }}
          >
            {/* App Bar */}
            <AppBar
              ref={topBarRef}
              {...zone_props("topbar")}
              role="toolbar"
              position="static"
              elevation={0}
              sx={{
                pt: "env(safe-area-inset-top)",
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
                  setAppMode={changeMode}
                  mechanism={mechanism}
                  updateMetadata={updateMetadata}
                  applyActions={applyActions}
                  shortModes={shortModes}
                  tightRules={tightRules}
                  condensed={condensed}
                  handleSpaceKey={handleSpaceKey}
                  onOpenGallery={handleOpenGallery}
                  saveStatus={saveStatus}
                  previewBeamStressLens={previewLensLater}
                  trajectoryDotted={trajectoryDotted}
                  setTrajectoryDotted={setTrajectoryDotted}
                  rightSlot={toolsMenu}
                />
              </Toolbar>

              <SimulationTimeline
                appMode={appMode}
                timelineTrackRef={timelineTrackRef}
              />
            </AppBar>

            <ElementPalette
              setCanvasState={setCanvasState}
              canvasState={canvasState}
              mechanism={mechanism}
              appMode={appMode}
              undoMechanism={undoMechanism}
              redoMechanism={redoMechanism}
              leaveSimulation={goToRest}
            />

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
              <PropertiesPanel {...panelProps} variant="analysis" />

              <Box sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
                <MechanicalCanvas
                  ref={canvasRef}
                  {...canvasProps}
                />
              </Box>

              <PropertiesPanel {...panelProps} />
            </Box>
          </Box>
        )}
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
          onUpdateMetadata={handleUpdateMetadataFromGallery}
          currentId={mechanism.metadata.createdAt}
          phoneActions={galleryPhoneActions}
        />
        <AboutDialog
          open={infoOpen}
          onClose={handleInfoClose}
          onOpenWelcome={handleWelcomeOpen}
        />
        {/* After the gallery, which may open at launch: the welcome is read first, over it. */}
        <WelcomeDialog open={welcomeOpen} onClose={handleWelcomeClose} />
        {!welcomeOpen && !galleryOpen && (
          <HintLayer
            eligible={{
              run:
                !is_simulating(appMode) &&
                mechanism.mechanicalElements.length >= 3,
              grab: is_simulating(appMode) && !isPlaying,
            }}
          />
        )}
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
    </LanguageContext.Provider>
  );
};

export default App;
