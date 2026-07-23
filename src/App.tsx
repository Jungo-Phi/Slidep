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
  Tooltip,
  Typography,
  MenuItem,
  Menu,
  Divider,
  Link as MuiLink,
  Dialog,
  DialogTitle,
  DialogContent,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Chip,
  Snackbar,
  Switch,
  FormControlLabel,
  alpha,
  ListItemIcon,
  useMediaQuery,
} from "@mui/material";
import {
  CenterFocusStrong,
  FirstPage,
  PlayArrow,
  Pause,
  LastPage,
  Settings,
  Language,
  Info,
  Close,
  Apps,
  Undo,
  Redo,
  Gif,
  ChevronLeft,
  ChevronRight,
  RestartAlt,
  KeyboardDoubleArrowDown,
  JoinInner,
  LightMode,
  DarkMode,
  SettingsBrightness,
  Check,
  Bolt,
  CloudOff,
  Lock,
} from "@mui/icons-material";
import { icon } from "./components/element-palette/iconDataUris";
import {
  Action,
  ActionBundleType,
  AppMode,
  ConstraintElement,
  DEFAULT_METADATA,
  DEFAULT_RUNTIME_STATE,
  DEFAULT_SIMULATION_CONFIG,
  ID,
  Link,
  Mechanism,
  MechanismMetadata,
  Point2,
  PropertiesPanelTab,
  RuntimeState,
  SimulationSpeed,
  ScreenPoint,
  SerializedMechanism,
  SimulationConfig,
  SlidepDB,
  UnionElement,
  ViewportChange,
  ZERO,
} from "./types";
import {
  load_mechanism,
  migrate_document,
  Repair,
  repair_summary,
  load_mechanisms_from_file,
  save_all_to_zip,
  save_to_file,
  serialize_mechanism,
  debounce,
  screen2world,
  getStorageItem,
  setStorageItem,
} from "./utils";
import {
  THEMES,
  THEME_FAMILIES,
  DEFAULT_THEME,
  resolve_theme,
  ThemeMode,
  ThemeName,
} from "./constants/mui-theme";
import {
  set_canvas_theme,
  SNACKBAR_DURATION,
} from "./constants/rendering-specs";
import MechanicalCanvas, {
  ConstraintChangeSignal,
} from "./components/canvas/MechanicalCanvas";
import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import { OverlaysMenu } from "./components/toolbar/OverlaysMenu";
import {
  RECORD_DT,
  SimGrab,
  SimulationModel,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  step_simulation,
} from "./components/solver/kinematic-simulation";
import {
  EMPTY_TRAJECTORY_CACHE,
  TrajectoryCache,
  extend_probe_trajectories,
  trajectories_at,
} from "./components/solver/probe-series";
import { PROBE_ELEMENT_COLORS } from "./components/properties-panel/components/ProbeChart";
import { KinematicSnapshot } from "./types/runtime-state";
import { CanvasState } from "./types/canvas-state";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { assert_actions_preserve_validity } from "./utils/assert-mechanism";
import { apply_actions } from "./components/mechanism/apply-actions";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import { IDBPDatabase, openDB } from "idb";

const DB_VERSION = 3;

/** The mechanism library. Keyed by `metadata.createdAt`, so two records sharing one are the same entry. */
const openMechanismsDB = () =>
  openDB<SlidepDB>("SlidepDB", DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("mechanisms")) {
        const store = db.createObjectStore("mechanisms", {
          keyPath: "metadata.createdAt",
        });
        store.createIndex("by-date", "metadata.modifiedAt");
      }
    },
  });

/** Every stored mechanism, raised to the current file format. The only way to read the library. */
const read_all_records = async (db: IDBPDatabase<SlidepDB>) =>
  (await db.getAll("mechanisms")).map(migrate_document);

const DEBOUNCE_AUTOSAVE_TIME_MILLIS = 1000;
const VIEWPORT_ZOOM_SENSITIVITY = 250; // Nombre de "crans" de molette nécessaires pour multiplier le zoom par 2
const LANGUAGES = ["Deutsch", "English", "Español", "Français"];

// Paliers de la top-bar. `condensed` raccourcit les libellés (Édition → Édit,
// masque les labels des chips) ; `tight` retire en plus les séparateurs et
// resserre les espacements pour les fenêtres vraiment étroites.
const CONDENSED_BREAKPOINT = 1400;
const TIGHT_BREAKPOINT = 1100;

// Crans de vitesse de simulation, du plus lent au plus rapide.
const SPEEDS: SimulationSpeed[] = [0.1, 0.25, 0.5, 1, 2, 4, 10];

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

/**
 * The ambience the whole app is in, whichever family it wears — the choice is
 * global, as it is in the system it can defer to, and not a property of each
 * family.
 */
const THEME_MODES: {
  mode: ThemeMode;
  title: string;
  Icon: typeof LightMode;
}[] = [
  { mode: "light", title: "Clair", Icon: LightMode },
  { mode: "dark", title: "Sombre", Icon: DarkMode },
  { mode: "system", title: "Système", Icon: SettingsBrightness },
];

/**
 * How long the pointer must rest on a theme before it is tried on. A swipe
 * across the menu on the way somewhere else asks for nothing, and should
 * repaint nothing.
 */
const THEME_PREVIEW_DELAY_MS = 100;

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
    viewport: { zoom: 1, pan: ZERO },
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
  const [appMode, setAppMode] = useState<AppMode>("edition");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(
    getStorageItem<boolean>("snapToGrid", true),
  );
  const [showGrid, setShowGrid] = useState<boolean>(
    getStorageItem<boolean>("showGrid", true),
  );

  useEffect(() => {
    setStorageItem("snapToGrid", snapToGrid);
  }, [snapToGrid]);

  useEffect(() => {
    setStorageItem("showGrid", showGrid);
  }, [showGrid]);

  const [runtimeState, setRuntimeState] = useState<RuntimeState>(
    DEFAULT_RUNTIME_STATE,
  );
  const [grabSnapshot, setGrabSnapshot] = useState<KinematicSnapshot | null>(
    null,
  );
  const [timelineHovered, setTimelineHovered] = useState(false);
  const [timelineDragging, setTimelineDragging] = useState(false);

  // La largeur de la top-bar suit la fenêtre, pas le canvas : ces requêtes
  // re-rendent le composant à chaque franchissement de palier.
  const condensed = useMediaQuery(`(max-width:${CONDENSED_BREAKPOINT}px)`);
  const tight = useMediaQuery(`(max-width:${TIGHT_BREAKPOINT}px)`);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    DEFAULT_SIMULATION_CONFIG,
  );
  // A theme is chosen as a family and a mode, not as one of the six names: the
  // name is what those two resolve to, once the browser has had its say on
  // "système".
  const [themeChoice, setThemeChoice] = useState<{
    family: string;
    mode: ThemeMode;
  }>(() => {
    const legacy = getStorageItem<ThemeName>("theme", DEFAULT_THEME);
    const chosen = legacy in THEMES ? THEMES[legacy] : THEMES[DEFAULT_THEME];
    return {
      family: getStorageItem<string>("themeFamily", chosen.family),
      mode: getStorageItem<ThemeMode>("themeMode", chosen.mode),
    };
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  // "Système" keeps following the browser, even once the menu is closed.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  const themeName = resolve_theme(
    themeChoice.family,
    themeChoice.mode,
    systemDark,
  );

  // Resting on a theme in the menu tries it on: the whole app, canvas included,
  // repaints. Only a click makes it stick — leaving the menu puts back the one
  // that was chosen.
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null);
  const activeTheme = previewTheme ?? themeName;

  const previewTimer = useRef<number | null>(null);
  // Arms the preview, or — with `null` — disarms it and drops the one showing.
  // The pointer must dwell: a theme swept over on the way to another is not a
  // theme asked for.
  const previewLater = useCallback((name: ThemeName | null) => {
    if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    if (name === null) {
      previewTimer.current = null;
      setPreviewTheme(null);
      return;
    }
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      setPreviewTheme(name);
    }, THEME_PREVIEW_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    },
    [],
  );

  // The canvas palette lives in a module binding rather than in React state, so
  // it is repointed before the first paint of the new theme, not after it. It
  // then fades towards it, in step with the interface — except on the very
  // first paint, which has no previous theme to fade from.
  const themeEverApplied = useRef(false);
  useMemo(() => {
    set_canvas_theme(activeTheme, themeEverApplied.current ? undefined : 0);
    themeEverApplied.current = true;
  }, [activeTheme]);

  // The menu stays open on a choice, as it does for the grid switches above it:
  // ambience and family are two controls, and one is rarely set without a look
  // at the other.
  const changeTheme = (family: string, mode: ThemeMode) => {
    setThemeChoice({ family, mode });
    setStorageItem("themeFamily", family);
    setStorageItem("themeMode", mode);
    previewLater(null);
  };

  const currentTheme = THEMES[activeTheme].mui;

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saved" | "saving" | "error"
  >("idle");

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [savedMechanisms, setSavedMechanisms] = useState<SerializedMechanism[]>(
    [],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStateRef = useRef<CanvasState>(canvasState);
  const mechanismRef = useRef<Mechanism>(mechanism);
  // Canal de retour visuel undo/redo des contraintes-icônes (lu par le canvas).
  const constraintChangeRef = useRef<ConstraintChangeSignal | null>(null);
  const constraintChangeSeqRef = useRef(0);
  const galleryOpenRef = useRef(galleryOpen);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const runtimeStateRef = useRef<RuntimeState>(DEFAULT_RUNTIME_STATE);

  // ── Kinematic simulation refs ──────────────────────────────
  const kinematicRef = useRef({ mechanism, runtimeState, appMode });
  kinematicRef.current = { mechanism, runtimeState, appMode };
  const kinematicLastWallTime = useRef<number | null>(null);
  const kinematicGrabRef = useRef<SimGrab | null>(null);
  const autoPlayOnEnterRef = useRef<boolean>(false);
  const simulationModelRef = useRef<SimulationModel | null>(null);
  const simStartHistoryLengthRef = useRef<number>(0);
  const probeOnlyEditRef = useRef<boolean>(false);

  /** `duration` overrides the default for messages that take longer to read, or
   *  that report something lost. */
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    duration?: number;
  }>({ open: false, message: "" });

  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>("project");
  const [prevCanvasState, setPrevCanvasState] =
    useState<CanvasState>(canvasState);

  // Derived state pattern: sync tab with canvas state during render, not in useEffect.
  // This prevents a one-frame flash where old tab content renders with new canvas state
  // (e.g. element list appearing briefly before switching to project tab on deselect).
  //
  // The switch only happens in edition, where selecting means wanting to edit. In
  // simulation, selecting means wanting to observe: the analysis tab stays put and
  // shows the selected element's measures (ElementMeasures) instead.
  if (prevCanvasState !== canvasState) {
    // TODO : mettre aussi à jour quand on change activeTab
    setPrevCanvasState(canvasState);
    if (
      canvasState.type === "PlacingProbe" ||
      canvasState.type === "PlacingProbeMetrics"
    ) {
      // Probe workflow: the probes and their graphs live in the analysis tab
      setActiveTab("analysis");
    } else if (appMode === "edition") {
      if ("elementID" in canvasState) {
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
        [
          "DimensionStart",
          "DimensionNode",
          "DimensionEdge",
          "DimensionNodeToNode",
          "DimensionEdgeToNode",
          "DimensionAngle",
          "DimensionRadius",
          "DimensionBelt",
          "HorizontalVerticalConstraintStart",
          "HorizontalVerticalConstraintNode",
          "NormalConstraintStart",
          "NormalConstraintEdge",
          "ParallelConstraintStart",
          "ParallelConstraintEdge",
          "EqualConstraintStart",
          "EqualConstraintEdge",
          "EqualConstraintGear",
          "GearRatioConstraintStart",
          "GearRatioConstraintGear",
        ].includes(canvasState.type)
      ) {
        setActiveTab("constraints");
      } else {
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

  useEffect(() => {
    galleryOpenRef.current = galleryOpen;
  }, [galleryOpen]);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  // Reset kinematic state on every mode change (fresh start each time)
  useEffect(() => {
    kinematicLastWallTime.current = null;
    if (appMode !== "edition") {
      simStartHistoryLengthRef.current = mechanismRef.current.history.length;
      // Compile the frozen simulation model from the current mechanism.
      simulationModelRef.current = compile_simulation_model(
        mechanismRef.current,
      );
      // Entering simulation is the one automatic switch to the analysis tab;
      // from there, selecting elements no longer moves it.
      setActiveTab("analysis");
    } else {
      simulationModelRef.current = null;
    }
    // Capture the flag synchronously: the setRuntimeState updater below runs
    // later, after this line has already reset the ref to false.
    const shouldAutoPlay = appMode !== "edition" && autoPlayOnEnterRef.current;
    autoPlayOnEnterRef.current = false;
    setRuntimeState((prev) => ({
      ...prev,
      isPlaying: shouldAutoPlay,
      time: 0,
      kinematicSnapshots: [],
    }));
  }, [appMode]);

  // Recompile the simulation model + truncate future snapshots whenever the
  // mechanism is edited during simulation. Re-bake references from the current
  // simulated state (apply the last snapshot first) so motor angle and gear
  // rotations stay continuous across the edit.
  useEffect(() => {
    const probeOnly = probeOnlyEditRef.current;
    probeOnlyEditRef.current = false;
    if (kinematicRef.current.appMode === "edition") return;
    // Probe-config edits don't affect the simulated motion: keep the model
    // and the already-recorded snapshots.
    if (probeOnly) return;
    const rs = runtimeStateRef.current;
    const snaps = rs.kinematicSnapshots;
    const idx =
      snaps.length > 0
        ? Math.min(
            Math.max(0, Math.floor(rs.time / RECORD_DT)),
            snaps.length - 1,
          )
        : -1;
    const baseSnap = idx >= 0 ? snaps[idx] : null;
    const baseMech = baseSnap
      ? apply_snapshot_to_mechanism(mechanism, baseSnap)
      : mechanism;
    simulationModelRef.current = compile_simulation_model(baseMech);
    setRuntimeState((prev) => ({
      ...prev,
      kinematicSnapshots: prev.kinematicSnapshots.filter((s) => s.t <= rs.time),
    }));
    // Depend on geometry/topology only, not the whole mechanism: a viewport
    // (pan/zoom) change keeps these array refs identical, so it no longer
    // recompiles the simulation model nor truncates the snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mechanism.mechanicalElements,
    mechanism.constraintElements,
    mechanism.loads,
  ]);

  // RAF loop: records kinematic snapshots while playing in kinematic mode
  useEffect(() => {
    let rafId: number;

    const step = (wallTime: number) => {
      const { runtimeState: rs, appMode: mode } = kinematicRef.current;

      if (mode !== "kinematic" || !rs.isPlaying) {
        kinematicLastWallTime.current = null;
        rafId = requestAnimationFrame(step);
        return;
      }

      const lastWallTime = kinematicLastWallTime.current;
      kinematicLastWallTime.current = wallTime;

      if (lastWallTime === null) {
        rafId = requestAnimationFrame(step);
        return;
      }

      const realDt = Math.min((wallTime - lastWallTime) / 1000, 0.1);
      const simDt = realDt * rs.speed;

      const existingSnaps = rs.kinematicSnapshots;
      const frontier =
        existingSnaps.length > 0
          ? existingSnaps[existingSnaps.length - 1].t
          : -RECORD_DT;

      // Replay mode: history exists ahead of current time → just advance the cursor
      if (frontier > rs.time + RECORD_DT / 2) {
        setRuntimeState((prev) => {
          const prevFrontier =
            prev.kinematicSnapshots.length > 0
              ? prev.kinematicSnapshots[prev.kinematicSnapshots.length - 1].t
              : 0;
          const nextTime = prev.time + simDt;
          // Stop as soon as the next step would leave the replay zone
          // (mirrors the `frontier > time + RECORD_DT / 2` mode test above),
          // otherwise the cursor can land just under the frontier and the
          // next frame falls through to create mode while still playing.
          if (nextTime >= prevFrontier - RECORD_DT / 2) {
            return { ...prev, time: prevFrontier, isPlaying: false };
          }
          return { ...prev, time: nextTime };
        });
      } else {
        // Create mode: compute new snapshots
        const model = simulationModelRef.current;
        const newTime = rs.time + simDt;
        const newSnaps: KinematicSnapshot[] = [];
        let t = frontier + RECORD_DT;
        while (model && t <= newTime + RECORD_DT / 2) {
          const prevSnap =
            newSnaps.length > 0
              ? newSnaps[newSnaps.length - 1]
              : existingSnaps.length > 0
                ? existingSnaps[existingSnaps.length - 1]
                : null;
          newSnaps.push(
            step_simulation(
              model,
              t,
              prevSnap?.positions ?? null,
              prevSnap?.angles ?? null,
              RECORD_DT,
              kinematicGrabRef.current ?? undefined,
            ),
          );
          t += RECORD_DT;
        }

        setRuntimeState((prev) => {
          const prevFrontier =
            prev.kinematicSnapshots.length > 0
              ? prev.kinematicSnapshots[prev.kinematicSnapshots.length - 1].t
              : -RECORD_DT;
          const uniqueSnaps = newSnaps.filter((s) => s.t > prevFrontier);
          return {
            ...prev,
            time: newTime,
            kinematicSnapshots:
              uniqueSnaps.length > 0
                ? [...prev.kinematicSnapshots, ...uniqueSnaps]
                : prev.kinematicSnapshots,
          };
        });
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []); // intentionally runs once; all state accessed via kinematicRef

  const debouncedSave = useRef(
    debounce(() => {
      performSaveToDB();
    }, DEBOUNCE_AUTOSAVE_TIME_MILLIS),
  ).current;

  const updateMetadata = useCallback(
    (metadata: MechanismMetadata) => {
      setMechanism((prevMechanism) => ({ ...prevMechanism, metadata }));
      setSaveStatus("saving");
      debouncedSave();
    },
    [debouncedSave],
  );

  const changeViewport = useCallback((change: ViewportChange) => {
    setMechanism((prevMechanism) => {
      const ov = prevMechanism.viewport;
      let pan: ScreenPoint;
      let zoom = ov.zoom;
      if (change.type === "Pan") {
        pan = ov.pan.add(change.delta);
      } else {
        const zoomFactor = 2 ** (-change.deltaY / VIEWPORT_ZOOM_SENSITIVITY);
        zoom *= zoomFactor;
        pan = change.center.sub(screen2world(change.center, ov).mul(zoom));
      }
      return { ...prevMechanism, viewport: { pan, zoom } };
    });
  }, []);

  const applyActions = useCallback(
    (actions: Action[], actionBundleType: ActionBundleType) => {
      if (is_observation_only_bundle(actions)) probeOnlyEditRef.current = true;
      // Safety net behind the greyed-out structure controls (ElementProperties):
      // a structural edit invalidates the compiled model, so if one reaches us
      // anyway we leave simulation rather than silently rebuild under the user.
      // Parameter edits (loads, motor) stay in simulation: the [mechanism] effect
      // recompiles from the current snapshot and truncates only the future.
      if (
        kinematicRef.current.appMode !== "edition" &&
        is_structure_bundle(actions)
      ) {
        setAppMode("edition");
        setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
      }
      setMechanism((prevMechanism) => {
        const newMechanism = apply_actions(
          prevMechanism,
          actions,
          actionBundleType,
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
      // In simulation mode, edits trigger the [mechanism] effect which recompiles
      // the model and truncates future snapshots — nothing extra to do here.
      setSaveStatus("saving");
      debouncedSave();
    },
    [debouncedSave],
  );

  // Repère les contraintes-icônes recréées/supprimées par un undo/redo pour que
  // le canvas les fasse réapparaître (reveal) ou s'estomper (fantôme rouge). Les
  // dimensions sont ignorées car toujours visibles.
  const signalConstraintChange = useCallback(
    (before: ConstraintElement[], after: ConstraintElement[]) => {
      const beforeById = new Map(before.map((c) => [c.id, c]));
      const afterById = new Map(after.map((c) => [c.id, c]));
      const revealIDs: ID[] = [];
      const removed: ConstraintElement[] = [];
      for (const c of after) {
        if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
          continue;
        const prev = beforeById.get(c.id);
        // Recréée, déplacée ou éditée → la révéler.
        if (
          !prev ||
          prev.position.x !== c.position.x ||
          prev.position.y !== c.position.y ||
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

    setSaveStatus("saving");
    debouncedSave();
  }, [debouncedSave, signalConstraintChange]);

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
    setSaveStatus("saving");
    debouncedSave();
  }, [debouncedSave, signalConstraintChange]);

  const performSaveToDB = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const db = await openMechanismsDB();
      // Pas de miniature encodée ici : la galerie redessine chaque mécanisme à
      // l'ouverture, au thème courant.
      const mechanismToSave = {
        ...mechanismRef.current,
        metadata: {
          ...mechanismRef.current.metadata,
          modifiedAt: Date.now(),
        },
      };
      await db.put("mechanisms", serialize_mechanism(mechanismToSave));
      setSaveStatus("saved");

      if (galleryOpenRef.current) {
        setSavedMechanisms(await read_all_records(db));
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      setSaveStatus("error");
    }
  }, []);

  const handleOpenGallery = useCallback(async () => {
    const db = await openMechanismsDB();
    setSavedMechanisms(await read_all_records(db));
    setGalleryOpen(true);
  }, []);

  // Repartir sur des réglages de simulation neufs (vitesse, gravité,
  // collisions, lecture/temps, snapshots…) lorsqu'on change de mécanisme, pour
  // ne pas hériter de ceux du mécanisme précédent.
  const resetSimulationState = useCallback(() => {
    setAppMode("edition");
    setRuntimeState(DEFAULT_RUNTIME_STATE);
    setSimulationConfig(DEFAULT_SIMULATION_CONFIG);
  }, []);

  const handleLoadFromGallery = useCallback(
    (mechanismRecord: SerializedMechanism) => {
      const { mechanism: loaded, repairs } = load_mechanism(mechanismRecord);
      setMechanism(loaded);
      setGalleryOpen(false);
      setCanvasState({ type: "Selecting" });
      resetSimulationState();
      setSnackbar(
        repairs.length > 0
          ? {
              open: true,
              message: repair_summary(repairs),
              duration: SNACKBAR_DURATION.REPORT,
            }
          : { open: true, message: "Mécanisme chargé" },
      );
    },
    [resetSimulationState],
  );

  const handleDeleteFromGallery = useCallback(async (createdAtId: number) => {
    if (!window.confirm("Supprimer ce mécanisme définitivement ?")) return;

    const db = await openDB<SlidepDB>("SlidepDB", DB_VERSION);
    await db.delete("mechanisms", createdAtId);

    setSavedMechanisms((prev) =>
      prev.filter((r) => r.metadata.createdAt !== createdAtId),
    );
    setSnackbar({ open: true, message: "Mécanisme supprimé" });
  }, []);

  const handleNewFromGallery = useCallback(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;

    setMechanism({
      metadata: {
        ...DEFAULT_METADATA,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
      viewport: {
        zoom: 1,
        pan: new Point2(currentCanvas.width / 2, currentCanvas.height / 2),
      },
      mechanicalElements: [],
      constraintElements: [],
      loads: [],
      history: [],
      future: [],
    });
    setGalleryOpen(false);
    setCanvasState({ type: "Selecting" });
    resetSimulationState();
    setSaveStatus("idle");
  }, [resetSimulationState]);

  // Un import n'écrase jamais un mécanisme existant : quand l'identifiant est
  // déjà pris — typiquement en réimportant un fichier qu'on a exporté — l'entrée
  // entre dans la bibliothèque comme une copie, à côté de l'originale.
  const storeImportedRecords = useCallback(
    async (records: SerializedMechanism[]) => {
      const db = await openMechanismsDB();
      const existing = await db.getAll("mechanisms");
      const takenIds = new Set(existing.map((r) => r.metadata.createdAt));
      const takenNames = new Set(existing.map((r) => r.metadata.name));

      // Importing is an entry, so records are repaired before anything is
      // written: a known-broken entry must not land in the library when the
      // sound version is already in hand. Reading them all up front also keeps
      // an archive importing fully or not at all.
      const repairs: Repair[] = [];
      const sound = records.map((record) => {
        const loaded = load_mechanism(record);
        repairs.push(...loaded.repairs);
        return serialize_mechanism(loaded.mechanism);
      });

      const stored: SerializedMechanism[] = [];
      for (const record of sound) {
        const metadata = { ...record.metadata, modifiedAt: Date.now() };

        if (takenIds.has(metadata.createdAt)) {
          let id = Date.now();
          while (takenIds.has(id)) id++;
          metadata.createdAt = id;

          const base = record.metadata.name || "Mécanisme";
          let name = `${base} (copie)`;
          for (let n = 2; takenNames.has(name); n++)
            name = `${base} (copie ${n})`;
          metadata.name = name;
        }

        takenIds.add(metadata.createdAt);
        takenNames.add(metadata.name);

        const entry = { ...record, metadata };
        await db.put("mechanisms", entry);
        stored.push(entry);
      }
      return { stored, repairs };
    },
    [],
  );

  // Un `.slidep` s'ouvre dans l'éditeur, comme un clic sur une carte ; une
  // archive remplit la bibliothèque et laisse la galerie ouverte.
  const handleMenuButtonUpload = () => {
    load_mechanisms_from_file()
      .then(async ({ records, isArchive }) => {
        const { stored, repairs } = await storeImportedRecords(records);

        if (isArchive) {
          setSavedMechanisms((prev) => [...prev, ...stored]);
          const plural = stored.length > 1 ? "s" : "";
          setSnackbar({
            open: true,
            message:
              `${stored.length} mécanisme${plural} importé${plural}` +
              (repairs.length > 0 ? ` — ${repair_summary(repairs)}` : ""),
          });
          return;
        }

        // Already repaired on the way into the library.
        setMechanism(load_mechanism(stored[0]).mechanism);
        setCanvasState({ type: "Selecting" });
        resetSimulationState();
        setGalleryOpen(false);
        setSaveStatus("saved");
        setSnackbar({
          open: true,
          message:
            repairs.length > 0 ? repair_summary(repairs) : "Mécanisme importé",
        });
      })
      .catch(() => setSnackbar({ open: true, message: "Fichier illisible" }));
  };

  // Export depuis la galerie : les enregistrements y sont déjà sérialisés.
  const handleExportRecord = (record: SerializedMechanism) => {
    save_to_file(record, `${record.metadata.name || "mecanisme"}.slidep`);
  };

  const handleExportAllRecords = () => {
    save_all_to_zip(savedMechanisms);
    const plural = savedMechanisms.length > 1 ? "s" : "";
    setSnackbar({
      open: true,
      message: `${savedMechanisms.length} mécanisme${plural} exporté${plural}`,
    });
  };

  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const handleSettingsOpen = (event: React.MouseEvent<HTMLElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };
  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const handleInfoOpen = () => {
    setInfoOpen(true);
  };
  const handleInfoClose = () => {
    setInfoOpen(false);
  };

  const [language, setlanguage] = useState<string>("Français");
  const [langAnchorEl, setLangAnchorEl] = React.useState<null | HTMLElement>(
    null,
  );
  const langOpen = Boolean(langAnchorEl);
  const handleLangClick = (event: React.MouseEvent<HTMLElement>) => {
    setLangAnchorEl(event.currentTarget);
  };
  const handleLangClose = () => {
    setLangAnchorEl(null);
  };
  const handleSelectLang = (newLanguage: string) => {
    setlanguage(newLanguage);
    setLangAnchorEl(null);
  };

  const handleSpaceKey = useCallback(() => {
    if (appMode === "edition") {
      // Arm auto-play so the mode-change effect starts the simulation instead
      // of resetting isPlaying to false right after we set it.
      autoPlayOnEnterRef.current = true;
      setAppMode(mechanism.metadata.lastSimulationMode);
      // Entering simulation restarts from a clean canvas, just like Space does in the canvas handler.
      setCanvasState({ type: "Selecting" });
    } else {
      setRuntimeState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  }, [appMode, mechanism.metadata.lastSimulationMode]);

  // Escape while the simulation is running behaves like the "Réinitialiser"
  // button (reset to t=0 and stop); otherwise it exits to edition mode.
  const handleEscapeKey = useCallback(() => {
    if (appMode !== "edition" && runtimeStateRef.current.isPlaying) {
      simulationModelRef.current = compile_simulation_model(
        mechanismRef.current,
      );
      setRuntimeState((prev) => ({
        ...prev,
        time: 0,
        isPlaying: false,
        current: null,
        history: [],
        kinematicSnapshots: [],
      }));
    } else {
      setAppMode("edition");
      setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [appMode]);

  const handleSimulationGrab = useCallback(
    (
      key: string,
      target: Point2,
      bodyRatio?: number,
      gearPerimeter?: { gearID: string; angleOffset: number; radius: number },
      beltPin?: Extract<Link, { type: "BeltPin" }>,
    ) => {
      // Feed the grab into the RAF loop for snapshot recording
      const grab: SimGrab = beltPin
        ? { beltPin, target }
        : gearPerimeter
          ? {
              gearID: gearPerimeter.gearID,
              angleOffset: gearPerimeter.angleOffset,
              radius: gearPerimeter.radius,
              target,
            }
          : bodyRatio !== undefined
            ? { edgeID: key, t: bodyRatio, target }
            : { key, target };
      kinematicGrabRef.current = grab;
      const { runtimeState: rs } = kinematicRef.current;
      const model = simulationModelRef.current;
      if (!model) return;
      // Start playback if paused
      if (!rs.isPlaying) {
        setRuntimeState((prev) => ({ ...prev, isPlaying: true }));
      }
      // Also compute an immediate display snapshot for sub-frame responsiveness
      const snaps = rs.kinematicSnapshots;
      const idx =
        snaps.length > 0
          ? Math.min(
              Math.max(0, Math.floor(rs.time / RECORD_DT)),
              snaps.length - 1,
            )
          : -1;
      const prevSnap = idx >= 0 ? snaps[idx] : null;
      setGrabSnapshot(
        step_simulation(
          model,
          rs.time,
          prevSnap?.positions ?? null,
          prevSnap?.angles ?? null,
          RECORD_DT,
          grab,
        ),
      );
    },
    [],
  );

  const handleSimulationGrabEnd = useCallback(() => {
    kinematicGrabRef.current = null;
    setGrabSnapshot(null);
  }, []);

  // Derive the display mechanism: use simulated positions when in kinematic mode
  const currentKinematicSnapshot = (() => {
    if (appMode !== "kinematic" || runtimeState.kinematicSnapshots.length === 0)
      return null;
    const idx = Math.min(
      Math.max(0, Math.floor(runtimeState.time / RECORD_DT)),
      runtimeState.kinematicSnapshots.length - 1,
    );
    return runtimeState.kinematicSnapshots[idx];
  })();

  const activeSnapshot = grabSnapshot ?? currentKinematicSnapshot;
  const displayMechanism = activeSnapshot
    ? apply_snapshot_to_mechanism(mechanism, activeSnapshot)
    : mechanism;

  // ── État de la timeline, partagé par la top-bar et le rail ──
  //
  // `frontier` est le temps le plus avancé déjà calculé. Le curseur en deçà =
  // relecture ; au niveau de la frontière et en lecture = enregistrement.
  //
  // Le rail est toujours à l'échelle de la frontière : en enregistrement, on
  // est par définition au bout du temps connu, donc la tête reste collée à
  // droite. On la force à 100 % au lieu de calculer `time / frontier` — les
  // deux avancent ensemble mais pas au même rythme (le temps est continu, les
  // snapshots arrivent par pas de RECORD_DT), et cet écart d'arrondi est
  // exactement ce qui faisait vibrer la tête d'une image à l'autre.
  // `current` est un champ d'état ordinaire, pas une ref : on le destructure
  // pour que la règle exhaustive-deps ne le prenne pas pour un `ref.current`.
  const {
    kinematicSnapshots: timelineSnaps,
    current: timelineCurrent,
    time: timelineTime,
    isPlaying: timelinePlaying,
  } = runtimeState;
  const timeline = useMemo(() => {
    const frontier =
      appMode === "kinematic" && timelineSnaps.length > 0
        ? timelineSnaps[timelineSnaps.length - 1].t
        : timelineCurrent
          ? timelineCurrent.timestamp
          : 0;
    const recording = timelinePlaying && timelineTime >= frontier - RECORD_DT;
    const pct = recording
      ? 100
      : frontier > 0
        ? Math.min(100, (timelineTime / frontier) * 100)
        : 0;
    return {
      frontier,
      recording,
      pct,
      atStart: timelineTime <= 0,
      atEnd: frontier > 0 && timelineTime >= frontier - RECORD_DT / 2,
      hasRecording: frontier > 0 || timelineSnaps.length > 0,
    };
  }, [appMode, timelineSnaps, timelineCurrent, timelineTime, timelinePlaying]);

  // Trajectoires des éléments dont l'affichage est activé (showTrajectory),
  // tracées sur le canvas pendant la simulation.
  // Le cache n'est étendu que par les nouveaux snapshots : reconstruire les
  // trajectoires entières à chaque frame coûte le carré de la durée enregistrée.
  const trajectoryCacheRef = useRef<TrajectoryCache>(EMPTY_TRAJECTORY_CACHE);
  const trajectories = useMemo(() => {
    if (
      appMode !== "kinematic" ||
      runtimeState.kinematicSnapshots.length === 0
    ) {
      trajectoryCacheRef.current = EMPTY_TRAJECTORY_CACHE;
      return [];
    }
    trajectoryCacheRef.current = extend_probe_trajectories(
      trajectoryCacheRef.current,
      mechanism.mechanicalElements,
      runtimeState.kinematicSnapshots,
    );
    return trajectories_at(trajectoryCacheRef.current, runtimeState.time).map(
      (traj, i) => ({
        points: traj.points,
        headCount: traj.headCount,
        color: PROBE_ELEMENT_COLORS[i % PROBE_ELEMENT_COLORS.length],
      }),
    );
  }, [
    appMode,
    mechanism.mechanicalElements,
    runtimeState.kinematicSnapshots,
    runtimeState.time,
  ]);

  /**
   * App starts: put the world origin at the middle of the canvas, which is only
   * measurable once it has been laid out.
   */
  useLayoutEffect(() => {
    let frame = 0;
    const center = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        frame = requestAnimationFrame(center);
        return;
      }
      // The backing store is integral, so the pan the "Recentrer" button aims
      // for is computed from the truncated size, not from the CSS one.
      setMechanism((prev) => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          pan: new Point2(
            Math.trunc(rect.width) / 2,
            Math.trunc(rect.height) / 2,
          ),
        },
      }));
    };
    center();
    return () => cancelAnimationFrame(frame);
  }, []);

  /** App starts: only greet with the gallery when there is something to load. */
  useEffect(() => {
    (async () => {
      const db = await openMechanismsDB();
      const records = await read_all_records(db);
      if (records.length === 0) return;
      setSavedMechanisms(records);
      setGalleryOpen(true);
    })();
  }, []);

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
            {/* Les deux moitiés se partagent à parts égales la place laissée par
                le bouton play, qui tombe ainsi au centre exact de la fenêtre —
                donc de la grille, que le canvas occupe en pleine largeur. */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: tight ? 0.25 : 0.75,
                flex: "1 1 0",
                minWidth: 0,
              }}
            >
              {/* ── Zone 1 : Logo + Bibliothèque + Nom du projet (Gauche) ── */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* Logo */}
                <Box
                  component="img"
                  src={icon("logo")}
                  alt="Slidep"
                  sx={{ height: 26, display: "block", flexShrink: 0 }}
                />
                {/* Le mot-symbole est le premier sacrifié : le logo suffit à
                  identifier l'app quand la place manque. */}
                {!tight && (
                  <Typography
                    sx={{
                      fontSize: "1.5em",
                      fontWeight: 700,
                      color: "primary.main",
                      letterSpacing: "-0.04em",
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    Slidep
                  </Typography>
                )}

                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ mx: tight ? 0.5 : 1 }}
                />

                {/* Bouton Bibliothèque — accès direct à la galerie */}
                <Tooltip disableInteractive title="Bibliothèque de mécanismes">
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={handleOpenGallery}
                    sx={{ m: -1 }}
                  >
                    <Apps sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>

                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

                {/* Nom du projet + pastille */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={400}
                    noWrap
                    sx={{
                      maxWidth: tight ? 90 : condensed ? 130 : 180,
                      opacity: 0.9,
                    }}
                  >
                    {mechanism.metadata.name}
                  </Typography>

                  {saveStatus === "saving" ? (
                    <Tooltip disableInteractive title="Sauvegarde en cours...">
                      <CircularProgress
                        size={8}
                        color="inherit"
                        sx={{ flexShrink: 0, opacity: 0.7 }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip
                      disableInteractive
                      title={
                        saveStatus === "saved"
                          ? "Sauvegardé"
                          : saveStatus === "error"
                            ? "Erreur de sauvegarde"
                            : ""
                      }
                    >
                      <Box
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          flexShrink: 0,
                          backgroundColor:
                            saveStatus === "saved"
                              ? "success.main"
                              : saveStatus === "error"
                                ? "error.main"
                                : "transparent",
                          transition: "background-color 0.3s ease",
                          boxShadow: (t) =>
                            saveStatus === "saved"
                              ? `0 0 4px ${alpha(t.palette.success.light, 0.7)}`
                              : "none",
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {/* Sélecteur de mode */}
              <ToggleButtonGroup
                value={appMode}
                exclusive
                size="small"
                onChange={(_e, newMode: AppMode) => {
                  if (!newMode) return;
                  setAppMode(newMode);
                  if (newMode !== "edition")
                    updateMetadata({
                      ...mechanism.metadata,
                      lastSimulationMode: newMode,
                    });
                }}
                sx={{
                  "& .MuiToggleButton-root": {
                    px: 1,
                    py: 0.2,
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "none",
                    color: "text.secondary",
                    borderColor: "divider",
                    "&.Mui-selected": {
                      color: "primary.contrastText",
                      backgroundColor: "primary.main",
                      "&:hover": { backgroundColor: "primary.dark" },
                    },
                  },
                }}
              >
                <Tooltip disableInteractive title="Éditer le mécanisme">
                  <ToggleButton value="edition">
                    {condensed ? "Édit" : "Édition"}
                  </ToggleButton>
                </Tooltip>

                <Tooltip
                  disableInteractive
                  title="Étude de cas immobiles [ ∑F = 0 ] (à venir)"
                >
                  {/* Span supprimé ici */}
                  <ToggleButton value="static" disabled>
                    {condensed ? "Stat" : "Statique"}
                  </ToggleButton>
                </Tooltip>

                <Tooltip disableInteractive title="Analyse du mouvement">
                  <ToggleButton value="kinematic">
                    {condensed ? "Ciné" : "Cinématique"}
                  </ToggleButton>
                </Tooltip>

                <Tooltip
                  disableInteractive
                  title="Combine la statique et la cinématique [ ∑F = ma ] (à venir)"
                >
                  {/* Span supprimé ici */}
                  <ToggleButton value="dynamic" disabled>
                    {condensed ? "Dyna" : "Dynamique"}
                  </ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>

              {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

              <Tooltip disableInteractive title="Réinitialiser (Esc)">
                <span>
                  <IconButton
                    size="small"
                    color="inherit"
                    disabled={appMode === "edition" || !timeline.hasRecording}
                    onClick={() => {
                      // Recompile from the initial geometry
                      if (appMode !== "edition")
                        simulationModelRef.current = compile_simulation_model(
                          mechanismRef.current,
                        );
                      setRuntimeState((prev) => ({
                        ...prev,
                        time: 0,
                        isPlaying: false,
                        current: null,
                        history: [],
                        kinematicSnapshots: [],
                      }));
                    }}
                    sx={{
                      p: 0.4,
                      color: "primary.main",
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <RestartAlt sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {!tight && <Divider flexItem sx={{ mx: 0.2 }} />}

              {/* Contrôles temporels — Play/Pause toujours actif ; les autres
                  boutons sont désactivés en mode Édition ou en bout de course. */}
              <Tooltip disableInteractive title="Aller au début">
                <span>
                  <IconButton
                    size="small"
                    color="inherit"
                    disabled={appMode === "edition" || timeline.atStart}
                    onClick={() =>
                      setRuntimeState((prev) => ({
                        ...prev,
                        time: 0,
                        isPlaying: false,
                      }))
                    }
                    sx={{ p: 0.4 }}
                  >
                    <FirstPage sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            <Tooltip
              disableInteractive
              title={runtimeState.isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              <IconButton
                size="small"
                onClick={handleSpaceKey}
                sx={{
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                  p: 0.5,
                  flexShrink: 0,
                }}
              >
                {runtimeState.isPlaying ? (
                  <Pause sx={{ fontSize: 20 }} />
                ) : (
                  <PlayArrow sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Tooltip>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: tight ? 0.25 : 0.75,
                flex: "1 1 0",
                minWidth: 0,
              }}
            >
              <Tooltip
                disableInteractive
                title="Aller à la fin de l'enregistrement"
              >
                <span>
                  <IconButton
                    size="small"
                    color="inherit"
                    disabled={appMode === "edition" || timeline.atEnd}
                    sx={{ p: 0.4 }}
                    onClick={() =>
                      setRuntimeState((prev) => {
                        const snaps = prev.kinematicSnapshots;
                        const maxT =
                          snaps.length > 0 ? snaps[snaps.length - 1].t : 0;
                        return { ...prev, time: maxT, isPlaying: false };
                      })
                    }
                  >
                    <LastPage sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>

              {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

              {/* Stepper de vitesse de simulation */}
              {(() => {
                const speedIdx = SPEEDS.indexOf(runtimeState.speed);
                const setSpeed = (s: SimulationSpeed) =>
                  setRuntimeState((prev) => ({ ...prev, speed: s }));
                const disabled = appMode === "edition";
                return (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      opacity: disabled ? 0.3 : 1,
                      pointerEvents: disabled ? "none" : "auto",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <Tooltip disableInteractive title="Ralentir la simulation">
                      <span>
                        <IconButton
                          size="small"
                          color="inherit"
                          disabled={speedIdx <= 0}
                          onClick={() => setSpeed(SPEEDS[speedIdx - 1])}
                          sx={{ px: 0.2, py: 0.5, borderRadius: 1 }}
                        >
                          <ChevronLeft sx={{ fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip
                      disableInteractive
                      title="Réinitialiser la vitesse"
                    >
                      <Box
                        component="button"
                        onClick={() => setSpeed(1)}
                        sx={{
                          all: "unset",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 28,
                          // Matches the height of the top-bar icon buttons (20px icon + p: 0.4).
                          minHeight: 26.4,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1,
                          borderRadius: 1,
                          // La vitesse nominale est un état neutre : seul un
                          // réglage non standard mérite d'attirer l'œil.
                          color:
                            runtimeState.speed === 1
                              ? "text.secondary"
                              : "primary.main",
                          "&:hover": { backgroundColor: "action.hover" },
                        }}
                      >
                        {runtimeState.speed}×
                      </Box>
                    </Tooltip>
                    <Tooltip disableInteractive title="Accélérer la simulation">
                      <span>
                        <IconButton
                          size="small"
                          color="inherit"
                          disabled={speedIdx >= SPEEDS.length - 1}
                          onClick={() => setSpeed(SPEEDS[speedIdx + 1])}
                          sx={{ px: 0.2, py: 0.5, borderRadius: 1 }}
                        >
                          <ChevronRight sx={{ fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                );
              })()}

              {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

              {/* Toggles Gravité / Collisions */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  opacity: appMode === "edition" ? 0.3 : 1,
                  pointerEvents: appMode === "edition" ? "none" : "auto",
                  transition: "opacity 0.2s ease",
                  gap: 1.5,
                }}
              >
                <Tooltip
                  disableInteractive
                  title={
                    simulationConfig.gravity
                      ? "Gravité activée"
                      : "Gravité désactivée"
                  }
                >
                  <Chip
                    icon={
                      <KeyboardDoubleArrowDown
                        sx={{
                          fontSize: "14px !important",
                          color: simulationConfig.gravity
                            ? "primary.contrastText"
                            : "inherit",
                        }}
                      />
                    }
                    label={condensed ? null : "Gravité"}
                    size="small"
                    clickable
                    onClick={() =>
                      setSimulationConfig((prev) => ({
                        ...prev,
                        gravity: !prev.gravity,
                      }))
                    }
                    variant="outlined"
                    sx={{
                      fontSize: "0.68rem",
                      height: 22,
                      borderColor: simulationConfig.gravity
                        ? "primary.main"
                        : "text.primary",
                      backgroundColor: simulationConfig.gravity
                        ? "primary.main"
                        : "transparent",
                      color: simulationConfig.gravity
                        ? "primary.contrastText"
                        : "inherit",
                      "& .MuiChip-icon": {
                        color: simulationConfig.gravity
                          ? "primary.contrastText"
                          : "inherit",
                      },
                      "& .MuiChip-label": { pr: condensed ? 0.1 : 1 },
                      "&.MuiChip-clickable:hover": {
                        backgroundColor: simulationConfig.gravity
                          ? "primary.dark"
                          : "action.hover",
                      },
                      pl: 0.2,
                    }}
                  />
                </Tooltip>
                <Tooltip
                  disableInteractive
                  title={
                    simulationConfig.collisions
                      ? "Collisions activées"
                      : "Collisions désactivées"
                  }
                >
                  <Chip
                    icon={
                      <JoinInner
                        sx={{
                          fontSize: "14px !important",
                          color: simulationConfig.collisions
                            ? "primary.contrastText"
                            : "inherit",
                        }}
                      />
                    }
                    label={condensed ? null : "Collisions"}
                    size="small"
                    clickable
                    onClick={() =>
                      setSimulationConfig((prev) => ({
                        ...prev,
                        collisions: !prev.collisions,
                      }))
                    }
                    variant="outlined"
                    sx={{
                      fontSize: "0.68rem",
                      height: 22,
                      borderColor: simulationConfig.collisions
                        ? "primary.main"
                        : "text.primary",
                      backgroundColor: simulationConfig.collisions
                        ? "primary.main"
                        : "transparent",
                      color: simulationConfig.collisions
                        ? "primary.contrastText"
                        : "inherit",
                      "& .MuiChip-icon": {
                        color: simulationConfig.collisions
                          ? "primary.contrastText"
                          : "inherit",
                      },
                      "& .MuiChip-label": { pr: condensed ? 0.1 : 1 },
                      "&.MuiChip-clickable:hover": {
                        backgroundColor: simulationConfig.collisions
                          ? "primary.dark"
                          : "action.hover",
                      },
                      pl: 0.2,
                    }}
                  />
                </Tooltip>
              </Box>

              {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

              {/* Calques d'affichage — groupe distinct de gravité/collisions :
                  ceux-là changent ce qui est calculé, celui-ci ce qui est montré. */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  opacity: appMode === "edition" ? 0.3 : 1,
                  pointerEvents: appMode === "edition" ? "none" : "auto",
                  transition: "opacity 0.2s ease",
                }}
              >
                <OverlaysMenu
                  mechanicalElements={mechanism.mechanicalElements}
                  applyActions={applyActions}
                  condensed={condensed}
                />
              </Box>

              {/* ── Zone 3 : Outils & Config (Droite) ── */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.25,
                  flex: 1,
                  justifyContent: "flex-end",
                }}
              >
                {/* Recentrer */}
                <Tooltip disableInteractive title="Recentrer la vue">
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={() => {
                      const currentCanvas = canvasRef.current;
                      if (!currentCanvas) return;
                      setMechanism((prev) => ({
                        ...prev,
                        viewport: {
                          zoom: 1,
                          pan: new Point2(
                            currentCanvas.width / 2,
                            currentCanvas.height / 2,
                          ),
                        },
                      }));
                    }}
                    disabled={
                      canvasRef.current
                        ? mechanism.viewport.zoom === 1 &&
                          mechanism.viewport.pan.equals(
                            new Point2(
                              canvasRef.current!.width / 2,
                              canvasRef.current!.height / 2,
                            ),
                          )
                        : true
                    }
                  >
                    <CenterFocusStrong sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>

                {/* Undo / Redo */}
                <Tooltip disableInteractive title="Annuler (Ctrl+Z)">
                  <span>
                    <IconButton
                      color="inherit"
                      size="small"
                      onClick={() => undoMechanism()}
                      disabled={mechanism.history.length === 0}
                    >
                      <Undo sx={{ fontSize: 20 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip disableInteractive title="Rétablir (Ctrl+Y)">
                  <span>
                    <IconButton
                      color="inherit"
                      size="small"
                      onClick={() => redoMechanism()}
                      disabled={mechanism.future.length === 0}
                    >
                      <Redo sx={{ fontSize: 20 }} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ ml: 0.75, mr: 0.5, my: 0.25 }}
                />

                {/* Langue */}
                <Tooltip disableInteractive title="Langue">
                  <IconButton
                    color="inherit"
                    size="small"
                    aria-expanded={langOpen}
                    onClick={handleLangClick}
                    sx={{
                      gap: 0.4,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      px: 0.75,
                    }}
                  >
                    <Language sx={{ fontSize: 20 }} />
                    {language.slice(0, 2).toUpperCase()}
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={langAnchorEl}
                  open={langOpen}
                  onClose={handleLangClose}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                  slotProps={{ paper: { style: { maxHeight: 175 } } }}
                >
                  {LANGUAGES.map((lang) => (
                    <MenuItem
                      key={lang}
                      selected={lang === language}
                      onClick={() => handleSelectLang(lang)}
                      disableRipple
                    >
                      {lang}
                    </MenuItem>
                  ))}
                </Menu>

                {/* Paramètres */}
                <Tooltip disableInteractive title="Paramètres">
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={handleSettingsOpen}
                  >
                    <Settings sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={settingsAnchorEl}
                  open={Boolean(settingsAnchorEl)}
                  onClose={() => {
                    previewLater(null);
                    handleSettingsClose();
                  }}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                  // Leaving the list — for another setting or out of the menu
                  // entirely — drops the preview, armed or showing, and restores
                  // the chosen theme.
                  MenuListProps={{ onMouseLeave: () => previewLater(null) }}
                >
                  <MenuItem disableRipple>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showGrid}
                          size="small"
                          onChange={(e) => setShowGrid(e.target.checked)}
                        />
                      }
                      label="Afficher la grille"
                    />
                  </MenuItem>
                  <MenuItem disableRipple>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={snapToGrid}
                          size="small"
                          onChange={(e) => setSnapToGrid(e.target.checked)}
                        />
                      }
                      label="Aimanter à la grille"
                    />
                  </MenuItem>
                  <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
                    Taille de la grille (100mm)
                  </MenuItem>
                  <Divider />
                  <MenuItem disableRipple disabled>
                    <FormControlLabel
                      control={<Switch size="small" disabled />}
                      label="Afficher les contraintes"
                    />
                  </MenuItem>
                  <Divider />
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 3,
                      pl: 3,
                      pr: 2,
                      py: 0.5,
                    }}
                  >
                    <Typography variant="body2" color="textDisabled">
                      Thème
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="medium"
                      value={themeChoice.mode}
                      onChange={(_, mode: ThemeMode | null) =>
                        mode && changeTheme(themeChoice.family, mode)
                      }
                    >
                      {THEME_MODES.map(({ mode, title, Icon }) => (
                        <ToggleButton
                          key={mode}
                          value={mode}
                          onMouseEnter={() =>
                            previewLater(
                              resolve_theme(
                                themeChoice.family,
                                mode,
                                systemDark,
                              ),
                            )
                          }
                          sx={{ px: 1, py: 0.25, border: 0 }}
                        >
                          <Tooltip disableInteractive title={title}>
                            <Icon sx={{ fontSize: 18 }} />
                          </Tooltip>
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                  {/* The families, each shown in the ambience currently set. The
                    grey name is the theme the pair resolves to, where the family
                    does not already carry it (Fantaisie → Blueprint). */}
                  {THEME_FAMILIES.map((family) => {
                    const resolved = resolve_theme(
                      family.name,
                      themeChoice.mode,
                      systemDark,
                    );
                    return (
                      <MenuItem
                        key={family.name}
                        selected={family.name === themeChoice.family}
                        onClick={() =>
                          changeTheme(family.name, themeChoice.mode)
                        }
                        onMouseEnter={() => previewLater(resolved)}
                      >
                        <ListItemIcon>
                          {family.name === themeChoice.family && (
                            <Check sx={{ fontSize: 18 }} />
                          )}
                        </ListItemIcon>
                        {family.name}
                      </MenuItem>
                    );
                  })}
                  <Divider />
                  <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
                    Style des éléments
                  </MenuItem>
                </Menu>

                {/* À propos */}
                <Tooltip disableInteractive title="À propos de Slidep">
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={handleInfoOpen}
                  >
                    <Info sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
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
            mechanism={displayMechanism}
            setHoveredPart={setHoveredPart}
            hoveredPart={hoveredPart}
            undoMechanism={undoMechanism}
            redoMechanism={redoMechanism}
            appMode={appMode}
            activeTab={activeTab}
            constraintChangeRef={constraintChangeRef}
            onSpaceKey={handleSpaceKey}
            onEscapeKey={handleEscapeKey}
            onExitToEdition={() => {
              setAppMode("edition");
              setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
            }}
            onPauseSim={() =>
              setRuntimeState((prev) => ({ ...prev, isPlaying: false }))
            }
            onSimulationGrab={handleSimulationGrab}
            onSimulationGrabEnd={handleSimulationGrabEnd}
            snapToGrid={snapToGrid}
            showGrid={showGrid}
            trajectories={trajectories}
          />

          {/* Floating panels */}

          {/* Timeline */}
          {appMode !== "edition" &&
            (() => {
              const timelinePct = timeline.pct.toFixed(2);
              return (
                <Box
                  sx={{
                    position: "absolute",
                    left: "50%",
                    top: 8,
                    transform: "translateX(-50%)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    backgroundColor: "background.toolbar",
                    borderRadius: 999,
                    boxShadow: 3,
                    px: 1.5,
                    width: "min(560px, 60vw)",
                    height: 28,
                  }}
                >
                  {/* Temps courant / durée enregistrée. Chiffres tabulaires et
                      largeur réservée : le libellé ne doit pas pousser le rail
                      à chaque image. Aligné à gauche, pour que la marge de
                      réserve tombe côté rail plutôt que contre le bord. */}
                  <Typography
                    variant="caption"
                    sx={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "0.68rem",
                      color: "text.secondary",
                      flexShrink: 0,
                      textAlign: "left",
                      lineHeight: 1,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ color: "text.primary", fontWeight: 700 }}
                    >
                      {runtimeState.time.toFixed(1)}
                    </Box>
                    <Box component="span" sx={{ opacity: 0.55 }}>
                      {` / ${timeline.frontier.toFixed(1)} s`}
                    </Box>
                  </Typography>

                  <Box
                    ref={timelineTrackRef}
                    sx={{
                      flex: 1,
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      position: "relative",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setTimelineHovered(true)}
                    onMouseLeave={() => setTimelineHovered(false)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTimelineDragging(true);
                      const rect =
                        timelineTrackRef.current!.getBoundingClientRect();
                      const seek = (clientX: number) => {
                        const ratio = Math.max(
                          0,
                          Math.min(1, (clientX - rect.left) / rect.width),
                        );
                        const rs = runtimeStateRef.current;
                        const maxTime =
                          appMode === "kinematic" &&
                          rs.kinematicSnapshots.length > 0
                            ? rs.kinematicSnapshots[
                                rs.kinematicSnapshots.length - 1
                              ].t
                            : rs.current
                              ? rs.current.timestamp
                              : 0;
                        setRuntimeState((prev) => ({
                          ...prev,
                          time: ratio * maxTime,
                          isPlaying: false,
                        }));
                      };
                      seek(e.clientX);
                      const onMove = (ev: MouseEvent) => seek(ev.clientX);
                      const onUp = () => {
                        setTimelineDragging(false);
                        document.removeEventListener("mousemove", onMove);
                        document.removeEventListener("mouseup", onUp);
                      };
                      document.addEventListener("mousemove", onMove);
                      document.addEventListener("mouseup", onUp);
                    }}
                  >
                    {/* Rail */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: "action.hover",
                      }}
                    />
                    {/* Fill jusqu'au curseur */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: "primary.main",
                        width: `${timelinePct}%`,
                      }}
                    />
                    {/* Dot */}
                    <Tooltip
                      disableInteractive
                      title={`${runtimeState.time.toFixed(1)} s`}
                      placement="bottom"
                      open={timelineHovered || timelineDragging}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          top: "50%",
                          left: `${timelinePct}%`,
                          transform: `translate(-50%, -50%) scale(${
                            !timeline.recording &&
                            (timelineHovered || timelineDragging)
                              ? 1.3
                              : 1
                          })`,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          backgroundColor: timeline.recording
                            ? "primary.contrastText"
                            : "primary.main",
                          border: "2px solid",
                          borderColor: "primary.main",
                          boxShadow: (t) =>
                            `0 1px 4px ${alpha(t.palette.common.black, 0.3)}`,
                          pointerEvents: "none",
                          "&::after": timeline.recording
                            ? {
                                content: '""',
                                position: "absolute",
                                inset: -2,
                                borderRadius: "50%",
                                border: "2px solid",
                                borderColor: "primary.main",
                                animation:
                                  "slidepRecHalo 1.1s ease-out infinite",
                              }
                            : undefined,
                          "@keyframes slidepRecHalo": {
                            "0%": { transform: "scale(1)", opacity: 0.8 },
                            "100%": { transform: "scale(2.8)", opacity: 0 },
                          },
                        }}
                      />
                    </Tooltip>
                  </Box>

                  <Tooltip
                    disableInteractive
                    title="Exporter une animation (à venir)"
                  >
                    <span>
                      <IconButton
                        size="small"
                        color="inherit"
                        disabled
                        sx={{ p: 0.25, flexShrink: 0 }}
                      >
                        <Gif sx={{ fontSize: 18 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              );
            })()}
          <ElementPalette
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            mechanism={mechanism}
            appMode={appMode}
            onExitToEdition={() => {
              setAppMode("edition");
              setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
            }}
            onPauseSim={() =>
              setRuntimeState((prev) => ({ ...prev, isPlaying: false }))
            }
          />
          <PropertiesPanel
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            applyActions={applyActions}
            mechanism={mechanism}
            setHoveredPart={setHoveredPart}
            updateMetadata={updateMetadata}
            setRuntimeState={setRuntimeState}
            runtimeState={runtimeState}
            setSimulationConfig={setSimulationConfig}
            simulationConfig={simulationConfig}
            appMode={appMode}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            unsatisfied={activeSnapshot?.unsatisfied ?? []}
          />
        </Box>
      </Box>
      <MechanismsGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        mechanismRecords={savedMechanisms}
        onLoad={handleLoadFromGallery}
        onDelete={handleDeleteFromGallery}
        onNew={handleNewFromGallery}
        onImport={handleMenuButtonUpload}
        onExport={handleExportRecord}
        onExportAll={handleExportAllRecords}
      />
      <Dialog open={infoOpen} onClose={handleInfoClose} maxWidth="sm" fullWidth>
        <DialogTitle fontSize={"large"}>À propos</DialogTitle>
        <IconButton
          onClick={handleInfoClose}
          sx={() => ({
            position: "absolute",
            right: 8,
            top: 8,
          })}
        >
          <Close />
        </IconButton>
        <DialogContent dividers>
          <Typography gutterBottom>
            Slidep simule des mécanismes plans en temps réel. On dessine, on
            tire sur une pièce, et tout le système réagit.
          </Typography>

          <Typography gutterBottom>
            C'est l'application que j'aurais aimé avoir quand j'étais étudiant
            en génie mécanique. Slidep se place entre le schéma papier-crayon et
            le solveur par éléments finis. Mais pour vraiment remplacer le
            papier-crayon, il faudrait pouvoir modéliser n'importe quel
            mécanisme : j'aimerais un jour gérer les collisions, dessiner en 3D,
            peut-être faire de la dynamique des fluides.
          </Typography>

          <Typography>
            Slidep donne tout de suite des ordres de grandeur : on voit une
            flèche, un effort ou un rapport de transmission changer en direct.
            Ça ne remplace pas un solveur validé quand il faut signer un
            dimensionnement, mais pour explorer, comparer et comprendre, c'est
            bien plus rapide.
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              gap: 2,
              mt: 3,
            }}
          >
            {[
              {
                icon: <Bolt sx={{ fontSize: 20 }} />,
                title: "Temps réel",
                body: "Le mécanisme se recalcule pendant que vous le manipulez.",
              },
              {
                icon: <CloudOff sx={{ fontSize: 20 }} />,
                title: "Hors ligne",
                body: "Installez Slidep depuis votre navigateur, il fonctionne sans connexion.",
              },
              {
                icon: <Lock sx={{ fontSize: 20 }} />,
                title: "Chez vous",
                body: "Vos mécanismes restent sur votre machine. Pas de compte, pas de serveur.",
              },
            ].map((feature) => (
              <Box key={feature.title}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    color: "primary.main",
                    mb: 0.25,
                  }}
                >
                  {feature.icon}
                  <Typography variant="subtitle2" color="text.primary">
                    {feature.title}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {feature.body}
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography sx={{ mt: 3 }}>
            Si vous avez des idées, écrivez-moi. Et si vous savez coder, le
            dépôt est ouvert.
          </Typography>
        </DialogContent>
        <DialogContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 2,
              rowGap: 0.75,
              alignItems: "baseline",
              fontSize: "0.875rem",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Version
            </Typography>
            <Typography variant="body2">{__APP_VERSION__}</Typography>

            <Typography variant="body2" color="text.secondary">
              Licence
            </Typography>
            <Typography variant="body2">à définir</Typography>

            <Typography variant="body2" color="text.secondary">
              Contact
            </Typography>
            <MuiLink
              variant="body2"
              href="mailto:arnaud.jungo@slidep.ch"
              sx={{ justifySelf: "start" }}
            >
              arnaud.jungo@slidep.ch
            </MuiLink>

            <Typography variant="body2" color="text.secondary">
              Code
            </Typography>
            <MuiLink
              variant="body2"
              href="https://github.com/Jungo-Phi/Slidep"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ justifySelf: "start" }}
            >
              github.com/Jungo-Phi/Slidep
            </MuiLink>
          </Box>
        </DialogContent>
      </Dialog>
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
          }}
        >
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
