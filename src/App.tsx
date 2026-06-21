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
import { lightTheme } from "./lib/mui-theme"; // import { lightTheme, darkTheme, highContrastTheme } from "./lib/mui-theme";
import logoUrl from "./assets/icons/palette/logo.svg";
import MechanicalCanvas from "./components/mechanical-canvas/MechanicalCanvas";
import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import { CanvasState } from "./types/canvas-state";
import {
  Action,
  ActionBundleType,
  AppMode,
  DEFAULT_METADATA,
  DEFAULT_RUNTIME_STATE,
  DEFAULT_SIMULATION_CONFIG,
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
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { preload_element_icons } from "./components/element-palette/elementIcon";
import { COLORS } from "./constants/rendering-specs";
import {
  deserialize_mechanism,
  load_from_file,
  save_to_file,
  serialize_mechanism,
} from "./utils/serialization";
import { apply_actions } from "./components/mechanism/apply-actions";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import { openDB } from "idb";
import { generateThumbnail } from "./utils/thumbnail-generator";
import { debounce } from "./utils/debounce";
import { screen_to_world } from "./components/mechanical-canvas/viewport";

export interface UserPreferences {
  theme: string;
  gridVisible: boolean;
  snapToGrid: boolean;
  constraintsVisible: boolean;
  gridSize: number;
}

/*
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  gridVisible: true,
  snapToGrid: true,
  constraintsVisible: true,
  gridSize: 50,
};
*/

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
    history: [],
    future: [],
  });

  const [hoveredPart, setHoveredPart] = useState<HoveredPart>({
    type: "Void",
    position: ZERO,
  });
  const [appMode, setAppMode] = useState<AppMode>("edition");
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(
    DEFAULT_RUNTIME_STATE,
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
  const galleryOpenRef = useRef(galleryOpen);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const runtimeStateRef = useRef<RuntimeState>(DEFAULT_RUNTIME_STATE);

  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>("project");
  const userSelectedTabRef = useRef(false);

  // Sync active tab with canvas selection (only when user hasn't manually selected)
  useEffect(() => {
    if (userSelectedTabRef.current) {
      userSelectedTabRef.current = false;
      return;
    }
    const cs = canvasState;
    if ("elementID" in cs) {
      const mechanicalElement = mechanism.mechanicalElements.find(
        (el) => el.id === cs.elementID,
      );
      if (mechanicalElement) {
        setActiveTab("element");
      } else if (
        mechanism.constraintElements.find((el) => el.id === cs.elementID)
      ) {
        setActiveTab("constraints");
      }
    }
  }, [canvasState, mechanism]);

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
      setSaveStatus("saving");
      debouncedSave();
    },
    [debouncedSave],
  );

  const undoMechanism = useCallback(() => {
    if (mechanismRef.current.history.length === 0) return;
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
    setSaveStatus("saving");
    debouncedSave();
  }, [debouncedSave]);

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
    setSaveStatus("saving");
    debouncedSave();
  }, [debouncedSave]);

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
      // TODO : Afficher un snackbar "Mécanisme chargé"
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
    // TODO : Afficher un snackbar "Mécanisme supprimé"
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

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const handleSettingsOpen = () => {
    setSettingsOpen(true);
  };
  const handleSettingsClose = () => {
    setMenuAnchorEl(null);
    setSettingsOpen(false);
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

  /** App starts */
  useEffect(() => {
    preload_element_icons();
    //handleOpenGallery();
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
                <ToggleButton value="edition">Édition</ToggleButton>
                <ToggleButton value="static">Statique</ToggleButton>
                <ToggleButton value="kinematic">Cinématique</ToggleButton>
                <ToggleButton value="dynamic">Dynamique</ToggleButton>
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
                    onClick={() =>
                      setRuntimeState((prev) => ({
                        ...prev,
                        time: 0,
                        isPlaying: false,
                        current: null,
                        history: [],
                      }))
                    }
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
                  <IconButton size="small" color="inherit" sx={{ p: 0.4 }}>
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
            mechanism={mechanism}
            setHoveredPart={setHoveredPart}
            hoveredPart={hoveredPart}
            undoMechanism={undoMechanism}
            redoMechanism={redoMechanism}
          />

          {/* Floating panels */}

          {/* Timeline */}
          {appMode !== "edition" && (
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
                    const maxTime = runtimeStateRef.current.current
                      ? runtimeStateRef.current.current.timestamp
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
                    width: `${((runtimeState.time / (runtimeState.current ? runtimeState.current.timestamp : 30)) * 100).toFixed(2)}%`,
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
                      left: `${((runtimeState.time / (runtimeState.current ? runtimeState.current.timestamp : 30)) * 100).toFixed(2)}%`,
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
          )}
          <ElementPalette
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            mechanism={mechanism}
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
      <Dialog open={settingsOpen} onClose={handleSettingsClose}>
        <DialogTitle fontSize={"large"} sx={{ mb: -2 }}>
          Paramètres
        </DialogTitle>
        <IconButton
          onClick={handleSettingsClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
          }}
        >
          <Close />
        </IconButton>
        <DialogContent>
          <Typography>Afficher les contraintes</Typography>
          <Typography>Aimanter à la grille</Typography>
          <Typography>Thème (Couleurs)</Typography>
          <Typography>Style des éléments</Typography>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
};

export default App;
