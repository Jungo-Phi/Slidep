import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Chip,
  Button,
  Snackbar,
  Switch,
  FormControlLabel,
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
  Download,
  FileOpen,
  Apps,
  Undo,
  Redo,
  Gif,
  KeyboardArrowDown,
  RestartAlt,
  KeyboardDoubleArrowDown,
  JoinInner,
} from "@mui/icons-material";
import logoUrl from "./assets/icons/palette/logo.svg";
import {
  Action,
  ActionBundleType,
  AppMode,
  ConstraintElement,
  DEFAULT_METADATA,
  DEFAULT_RUNTIME_STATE,
  DEFAULT_SIMULATION_CONFIG,
  ID,
  Mechanism,
  MechanismMetadata,
  Point2,
  PropertiesPanelTab,
  RuntimeState,
  ScreenPoint,
  SerializedMechanism,
  SimulationConfig,
  SlidepDB,
  ViewportChange,
  ZERO,
} from "./types";
import {
  deserialize_mechanism,
  load_from_file,
  save_to_file,
  serialize_mechanism,
  debounce,
  generateThumbnail,
  screen_to_world,
  getStorageItem,
  setStorageItem,
} from "./utils";
import { lightTheme } from "./lib/mui-theme"; // import { lightTheme, darkTheme, highContrastTheme } from "./lib/mui-theme";
import MechanicalCanvas, {
  ConstraintChangeSignal,
} from "./components/canvas/MechanicalCanvas";
import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import {
  RECORD_DT,
  SimGrab,
  SimulationModel,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  step_simulation,
} from "./components/solver/kinematic-simulation";
import { KinematicSnapshot } from "./types/runtime-state";
import { CanvasState } from "./types/canvas-state";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { preload_element_icons } from "./components/element-palette/elementIcon";
import { COLORS } from "./constants/rendering-specs";
import { apply_actions } from "./components/mechanism/apply-actions";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import { openDB } from "idb";

const DB_VERSION = 3;
const DEBOUNCE_AUTOSAVE_TIME = 1000; // 1000 ms = 1s
const VIEWPORT_ZOOM_SENSITIVITY = 250; // Nombre de "crans" de molette nécessaires pour multiplier le zoom par 2
const LANGUAGES = ["Deutsch", "English", "Español", "Français"];

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
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    DEFAULT_SIMULATION_CONFIG,
  );
  const currentTheme = lightTheme;

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
  // Live-updated every render so the RAF loop always reads fresh state
  const kinematicRef = useRef({ mechanism, runtimeState, appMode });
  kinematicRef.current = { mechanism, runtimeState, appMode };
  const kinematicLastWallTime = useRef<number | null>(null);
  const kinematicGrabRef = useRef<SimGrab | null>(null);
  // Frozen simulation model, compiled on entering simulation and on edits during sim.
  const simulationModelRef = useRef<SimulationModel | null>(null);
  // History length when simulation mode was last entered — used to distinguish
  // edition-mode actions from simulation-mode actions on undo.
  const simStartHistoryLengthRef = useRef<number>(0);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: "" });

  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>("project");
  const [prevCanvasState, setPrevCanvasState] =
    useState<CanvasState>(canvasState);

  // Derived state pattern: sync tab with canvas state during render, not in useEffect.
  // This prevents a one-frame flash where old tab content renders with new canvas state
  // (e.g. element list appearing briefly before switching to project tab on deselect).
  if (prevCanvasState !== canvasState) {
    // TODO : mettre aussi à jour quand on change activeTab
    setPrevCanvasState(canvasState);
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
    } else if (appMode !== "edition") {
      setActiveTab("analysis");
    } else {
      setActiveTab("project");
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
    } else {
      simulationModelRef.current = null;
    }
    setRuntimeState((prev) => ({
      ...prev,
      isPlaying: false,
      time: 0,
      kinematicSnapshots: [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode]);

  // Recompile the simulation model + truncate future snapshots whenever the
  // mechanism is edited during simulation. Re-bake references from the current
  // simulated state (apply the last snapshot first) so motor angle and gear
  // rotations stay continuous across the edit.
  useEffect(() => {
    if (kinematicRef.current.appMode === "edition") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanism]);

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
          if (nextTime >= prevFrontier) {
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
    }, DEBOUNCE_AUTOSAVE_TIME),
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
        pan = change.center.sub(screen_to_world(change.center, ov).mul(zoom));
      }
      return { ...prevMechanism, viewport: { pan, zoom } };
    });
  }, []);

  const applyActions = useCallback(
    (actions: Action[], actionBundleType: ActionBundleType) => {
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
          !newMechanism.constraintElements.find((e) => e.id === cs.elementID)
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
        if (c.type.startsWith("dimension-")) continue;
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
        if (c.type.startsWith("dimension-")) continue;
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

    setMechanism((prevMechanism) => {
      const lastActionsForUndo = [
        ...prevMechanism.history.slice(-1)[0],
      ].reverse();
      let newMechanism = actionReducer(
        {
          ...prevMechanism,
          history: [...prevMechanism.history.slice(0, -1)],
          future: [...prevMechanism.future, prevMechanism.history.slice(-1)[0]],
        },
        lastActionsForUndo,
        true,
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
        )
      ) {
        setCanvasState({ type: "Selecting" });
      }
      return newMechanism;
    });

    if (isInSim) {
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

    setMechanism((prevMechanism) => {
      let nextActions = prevMechanism.future.slice(-1)[0];
      let newMechanism = actionReducer(
        {
          ...prevMechanism,
          history: [...prevMechanism.history, [...nextActions]],
          future: [...prevMechanism.future.slice(0, -1)],
        },
        nextActions,
        false,
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
        )
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
      let thumbnailData = "";
      if (canvasRef.current) {
        thumbnailData = await generateThumbnail(canvasRef.current);
      }
      const db = await openDB<SlidepDB>("SlidepDB", DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("mechanisms")) {
            const store = db.createObjectStore("mechanisms", {
              keyPath: "metadata.createdAt",
            });
            store.createIndex("by-date", "metadata.modifiedAt");
          }
        },
      });
      const mechanismToSave = {
        ...mechanismRef.current,
        metadata: {
          ...mechanismRef.current.metadata,
          thumbnail: thumbnailData,
          modifiedAt: Date.now(),
        },
      };
      await db.put("mechanisms", serialize_mechanism(mechanismToSave));
      setSaveStatus("saved");

      if (galleryOpenRef.current) {
        const allRecords = await db.getAll("mechanisms");
        setSavedMechanisms(allRecords);
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      setSaveStatus("error");
    }
  }, []);

  const [menuAnchorEl, setMenuAnchorEl] = React.useState<null | HTMLElement>(
    null,
  );
  const menuOpen = Boolean(menuAnchorEl);
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleOpenGallery = useCallback(async () => {
    setMenuAnchorEl(null);
    const db = await openDB<SlidepDB>("SlidepDB", DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("mechanisms")) {
          const store = db.createObjectStore("mechanisms", {
            keyPath: "metadata.createdAt",
          });
          store.createIndex("by-date", "metadata.modifiedAt");
        }
      },
    });

    const allRecords = await db.getAll("mechanisms");
    setSavedMechanisms(allRecords);
    setGalleryOpen(true);
  }, []);

  const handleLoadFromGallery = useCallback(
    (mechanismRecord: SerializedMechanism) => {
      setMechanism(deserialize_mechanism(mechanismRecord));
      setGalleryOpen(false);
      setCanvasState({ type: "Selecting" });
      setAppMode("edition");
      setSnackbar({ open: true, message: "Mécanisme chargé" });
    },
    [],
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
    setMenuAnchorEl(null);
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
    setSaveStatus("idle");
  }, []);

  const handleMenuButtonUpload = () => {
    setMenuAnchorEl(null);
    load_from_file()
      .then((data) => {
        setMechanism(deserialize_mechanism(data));
        setSaveStatus("saving");
        debouncedSave();
      })
      .catch(() => setSaveStatus("error"));
  };

  const handleMenuButtonDownload = () => {
    setMenuAnchorEl(null);
    save_to_file(
      serialize_mechanism(mechanism),
      `${mechanism.metadata.name}.slidep`,
    );
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
      setAppMode(mechanism.metadata.lastSimulationMode);
      setRuntimeState((prev) => ({ ...prev, isPlaying: true })); // TODO : est appliqué, mais remit à false l'instant d'après
    } else {
      setRuntimeState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  }, [appMode, mechanism.metadata.lastSimulationMode]);

  const handleSimulationGrab = useCallback(
    (key: string, target: Point2, bodyRatio?: number) => {
      // Feed the grab into the RAF loop for snapshot recording
      const grab: SimGrab =
        bodyRatio !== undefined
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

  /** App starts */
  useEffect(() => {
    preload_element_icons();
    handleOpenGallery();
  }, [handleOpenGallery]);

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
            backgroundColor: COLORS.FILL_NODE,
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
              gap: 1,
              minHeight: "40px !important",
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
                src={logoUrl}
                alt="Slidep"
                sx={{ height: 26, display: "block", flexShrink: 0 }}
              />
              <Typography
                sx={{
                  fontSize: "1.5em",
                  fontWeight: 700,
                  color: COLORS.ORANGE,
                  letterSpacing: "-0.04em",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                Slidep
              </Typography>

              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

              {/* Bouton Bibliothèque — accès direct à la galerie */}
              <Tooltip title="Bibliothèque de mécanismes">
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
                  sx={{ maxWidth: 180, opacity: 0.9 }}
                >
                  {mechanism.metadata.name}
                </Typography>

                {saveStatus === "saving" ? (
                  <Tooltip title="Sauvegarde en cours...">
                    <CircularProgress
                      size={8}
                      color="inherit"
                      sx={{ flexShrink: 0, opacity: 0.7 }}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip
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
                        boxShadow:
                          saveStatus === "saved"
                            ? "0 0 4px rgba(76,175,80,0.7)"
                            : "none",
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
            </Box>

            {/* ── Zone 2 : Cockpit de Simulation (Centre) ── */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                flexShrink: 0,
              }}
            >
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
                <Tooltip title="Éditer le mécanisme">
                  <ToggleButton value="edition">Édition</ToggleButton>
                </Tooltip>
                <Tooltip title="Étude de mécanismes immobiles [ ∑F = 0 ]. On pourra déterminer des variables qui permettent de respecter la condition d'équilibre des forces.">
                  <ToggleButton value="static">Statique</ToggleButton>
                </Tooltip>
                <Tooltip title="Analyse du mouvement (pas de masses ou de forces).">
                  <ToggleButton value="kinematic">Cinématique</ToggleButton>
                </Tooltip>
                <Tooltip title="Combine la statique et la cinématique [ ∑F = ma ].">
                  <ToggleButton value="dynamic">Dynamique</ToggleButton>
                </Tooltip>
              </ToggleButtonGroup>

              <Divider flexItem sx={{ mx: 0.5 }} />

              {/* Contrôles temporels — toujours affichés, grisés en mode Édition */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  opacity: appMode === "edition" ? 0.3 : 1,
                  pointerEvents: appMode === "edition" ? "none" : "auto",
                  transition: "opacity 0.2s ease",
                }}
              >
                <Tooltip title="Réinitialiser">
                  <IconButton
                    size="small"
                    color="inherit"
                    onClick={() => {
                      // Recompile from the initial geometry so motor targets and
                      // gear angles reset cleanly.
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
                    sx={{ p: 0.4 }}
                  >
                    <RestartAlt sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Aller au début">
                  <IconButton
                    size="small"
                    color="inherit"
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
                </Tooltip>

                <Tooltip title={runtimeState.isPlaying ? "Pause" : "Play"}>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setRuntimeState((prev) => ({
                        ...prev,
                        isPlaying: !prev.isPlaying,
                      }))
                    }
                    sx={{
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                      p: 0.5,
                    }}
                  >
                    {runtimeState.isPlaying ? (
                      <Pause sx={{ fontSize: 20 }} />
                    ) : (
                      <PlayArrow sx={{ fontSize: 20 }} />
                    )}
                  </IconButton>
                </Tooltip>

                <Tooltip title="Aller à la fin">
                  <IconButton
                    size="small"
                    color="inherit"
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
                </Tooltip>
              </Box>

              <Divider flexItem sx={{ mx: 0.5 }} />

              {/* Vitesse : boutons segmentés */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  opacity: appMode === "edition" ? 0.3 : 1,
                  pointerEvents: appMode === "edition" ? "none" : "auto",
                  transition: "opacity 0.2s ease",
                }}
              >
                <ToggleButtonGroup
                  value={runtimeState.speed}
                  exclusive
                  size="small"
                  onChange={(_e, val) => {
                    if (val === null) return;
                    setRuntimeState((prev) => ({ ...prev, speed: val }));
                  }}
                  sx={{
                    "& .MuiToggleButton-root": {
                      px: 0.6,
                      py: 0.2,
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      textTransform: "none",
                      color: "text.secondary",
                      borderColor: "divider",
                      minWidth: 0,
                      lineHeight: 1.4,
                      "&.Mui-selected": {
                        color: "primary.contrastText",
                        backgroundColor: "primary.main",
                        "&:hover": { backgroundColor: "primary.dark" },
                      },
                    },
                  }}
                >
                  {[0.25, 0.5, 1, 2, 4].map((s) => (
                    <ToggleButton key={s} value={s}>
                      {s < 1 ? `${s}×` : `${s}×`}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>

              <Divider flexItem sx={{ mx: 0.5 }} />

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
                    label="Gravité"
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
                        : COLORS.STROKE,
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
                      "& .MuiChip-label": { pr: 1 },
                      "&.MuiChip-clickable:hover": {
                        backgroundColor: simulationConfig.gravity
                          ? COLORS.ORANGE_STROKE
                          : "action.hover",
                      },
                      pl: 0.2,
                    }}
                  />
                </Tooltip>
                <Tooltip
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
                    label="Collisions"
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
                        : COLORS.STROKE,
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
                      "& .MuiChip-label": { pr: 1 },
                      "&.MuiChip-clickable:hover": {
                        backgroundColor: simulationConfig.collisions
                          ? COLORS.ORANGE_STROKE
                          : "action.hover",
                      },
                      pl: 0.2,
                    }}
                  />
                </Tooltip>
              </Box>
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
              <Tooltip title="Recentrer la vue">
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
              <Tooltip title="Annuler (Ctrl+Z)">
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
              <Tooltip title="Rétablir (Ctrl+Y)">
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

              {/* Menu Fichier — bouton textuel */}
              <Button
                color="inherit"
                size="small"
                onClick={handleMenuClick}
                endIcon={
                  <KeyboardArrowDown
                    sx={{ ml: -0.5, fontSize: "16px !important", opacity: 0.7 }}
                  />
                }
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "none",
                  px: 1,
                  py: 0.5,
                  minWidth: 0,
                  letterSpacing: 0,
                }}
              >
                Fichier
              </Button>
              <Menu
                anchorEl={menuAnchorEl}
                open={menuOpen}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <MenuItem
                  onClick={handleMenuButtonUpload}
                  sx={{ gap: 1, fontSize: "14px" }}
                  disableRipple
                >
                  <FileOpen fontSize="small" />
                  Importer
                </MenuItem>
                <MenuItem
                  onClick={handleMenuButtonDownload}
                  sx={{ gap: 1, fontSize: "14px" }}
                  disableRipple
                >
                  <Download fontSize="small" />
                  Exporter le mécanisme
                </MenuItem>
                <MenuItem
                  onClick={handleMenuButtonDownload}
                  sx={{ gap: 1, fontSize: "14px" }}
                  disableRipple
                >
                  <Gif fontSize="small" />
                  Exporter une animation
                </MenuItem>
              </Menu>

              {/* Langue */}
              <Tooltip title="Langue">
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
              <Tooltip title="Paramètres">
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
                onClose={handleSettingsClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
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
                <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
                  Thème (Couleurs)
                </MenuItem>
                <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
                  Style des éléments
                </MenuItem>
              </Menu>

              {/* À propos */}
              <Tooltip title="À propos de Slidep">
                <IconButton
                  color="inherit"
                  size="small"
                  onClick={handleInfoOpen}
                >
                  <Info sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Toolbar>

          {/* ── Barre de progression temporelle (sous la toolbar) ── */}
          {/*
          
          */}
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
            setAppMode={setAppMode}
            onSpaceKey={handleSpaceKey}
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
          />

          {/* Floating panels */}

          {/* Timeline */}
          {appMode !== "edition" &&
            (() => {
              const snaps = runtimeState.kinematicSnapshots;
              const timelineMax =
                appMode === "kinematic" && snaps.length > 0
                  ? snaps[snaps.length - 1].t
                  : runtimeState.current
                    ? runtimeState.current.timestamp
                    : 30;
              const timelinePct = Math.min(
                100,
                (runtimeState.time / timelineMax) * 100,
              ).toFixed(2);
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
                    backgroundColor: COLORS.FILL_NODE,
                    borderRadius: 999,
                    boxShadow: 3,
                    px: 1.5,
                    width: "min(480px, 55vw)",
                    height: 24,
                  }}
                >
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
                              : 30;
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
                        backgroundColor: "rgba(0,0,0,0.1)",
                      }}
                    />
                    {/* Fill */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: COLORS.ORANGE,
                        width: `${timelinePct}%`,
                      }}
                    />
                    {/* Thumb */}
                    <Tooltip
                      title={`t = ${runtimeState.time.toFixed(1)} s`}
                      placement="bottom"
                      open={timelineHovered || timelineDragging}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          top: "50%",
                          left: `${timelinePct}%`,
                          transform: `translate(-50%, -50%) scale(${timelineHovered || timelineDragging ? 1.3 : 1})`,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          backgroundColor: "white",
                          border: "2px solid",
                          borderColor: COLORS.ORANGE,
                          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                          pointerEvents: "none",
                        }}
                      />
                    </Tooltip>
                  </Box>
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
      />
      <Dialog open={infoOpen} onClose={handleInfoClose}>
        <DialogTitle fontSize={"large"}>Infos</DialogTitle>
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
          <Typography gutterBottom align="justify">
            Slidep a d'abord été pensé comme l'application que j'aurais aimé
            avoir en tant qu'étudiant en ingénierie mécanique.
          </Typography>

          <Typography gutterBottom align="justify">
            La méthode par éléments finis (FEM) m'a toujours facinée. On arrive
            avec un modèle mathématique simple à recréer un comportement
            physique réel. Mais même si les interfaces se sont améliorées, les
            Ansys et Abaqus restent des outils complexes et souvent très chères.
            De plus, les pièces un peu complexes demandent vite beaucoup de
            temps et de ressources. C'est pour ça que j'ai toujours eu une
            fixette sur les éléments de type poutre. Avec les poutres, on peut
            faire des éléments finis en temps réel ! J'ai toujours eu envie de
            créer un outil basé dessus.
          </Typography>

          <Typography gutterBottom align="justify">
            C'est Slidep : De la simulation en temps réel avec des éléments
            simples, le tout dans une interface facile d'accès. C'est l'étape
            intermédiaire entre les schémas papier crayon et le solveur par
            éléments finis. Mais pour prétendre remplacer le papier crayon, il
            faudrais pouvoir créer tous les mécanismes ! C'est pour cela qu'à
            l'avenir, j'aimerais faire évoluer Slidep pour gérer les collisions,
            dessiner en 3D, voire même faire de la dynamique des fluides !
          </Typography>

          <Typography gutterBottom align="justify">
            Implémenter ces changement à l'avenir me demandera plus que de la
            patience, mais des moyens. Alors si vous avez des idées, partagez
            les ! Si vous savez coder, contribuez ! Et si vous avez de l'argent,
            financez !
          </Typography>
        </DialogContent>
        <DialogContent>
          <Box>Contact :</Box>
          <a href="mailto:arnaud.jungo@slidep.ch">arnaud.jungo@slidep.ch</a>
          <Box>Code :</Box>
          <a href="https://github.com/Jungo-Phi/Slidep">
            github.com/Jungo-Phi/Slidep
          </a>
        </DialogContent>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
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
            backgroundColor: "#0008",
            backdropFilter: "blur(6px)",
            color: "#FFF",
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
              color: "rgba(255,255,255,0.6)",
              p: 0.25,
              "&:hover": { color: "#fff" },
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
