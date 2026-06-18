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
  Chip,
  CircularProgress,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Settings,
  Undo,
  Redo,
  Language,
  Info,
  Close,
  Download,
  FileOpen,
  Apps,
} from "@mui/icons-material";
import { lightTheme } from "./lib/mui-theme"; // import { lightTheme, darkTheme, highContrastTheme } from "./lib/mui-theme";
import logoUrl from "./assets/icons/palette/logo.svg";
import playIconUrl from "./assets/icons/palette/play.svg";
import selectIconUrl from "./assets/icons/palette/select.svg";
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

  const [simHover, setSimHover] = useState(false);

  useEffect(() => {
    mechanismRef.current = mechanism;
  }, [mechanism]);

  useEffect(() => {
    canvasStateRef.current = canvasState;
  }, [canvasState]);

  useEffect(() => {
    galleryOpenRef.current = galleryOpen;
  }, [galleryOpen]);

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
    const db = await openDB<SlidepDB>("SlidepDB", DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("mechanisms")) {
          // La clé est maintenant metadata.createdAt
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
          <Toolbar
            variant="dense"
            disableGutters
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mx: 1,
            }}
          >
            {/* Left side: Logo, File actions */}
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}
            >
              <Box
                component="img"
                src={logoUrl}
                alt="Slidep"
                sx={{
                  height: 32,
                  display: "block",
                }}
              />
              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: "1.8em",
                  fontWeight: 700,
                  color: COLORS.ORANGE,
                  textTransform: "uppercase",
                  letterSpacing: "-0.04em",
                }}
              >
                Slidep
              </Typography>

              <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                <Tooltip title="Menu">
                  <IconButton
                    color="inherit"
                    aria-expanded={menuOpen}
                    onClick={handleMenuClick}
                  >
                    <MenuIcon />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={menuAnchorEl}
                  open={menuOpen}
                  onClose={handleMenuClose}
                >
                  <MenuItem
                    onClick={handleMenuButtonUpload}
                    sx={{ gap: 1, marginLeft: -0.5 }}
                    disableRipple
                  >
                    <FileOpen fontSize="small" />
                    Importer
                  </MenuItem>
                  <MenuItem
                    onClick={handleMenuButtonDownload}
                    sx={{ gap: 1, marginLeft: -0.5 }}
                    disableRipple
                  >
                    <Download fontSize="small" />
                    Exporter
                  </MenuItem>
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem
                    onClick={handleSettingsOpen}
                    sx={{ gap: 1, marginLeft: -0.5 }}
                    disableRipple
                  >
                    <Settings fontSize="small" />
                    Paramètres
                  </MenuItem>
                </Menu>
              </Box>
              <Tooltip title="Mes mécanismes">
                <IconButton color="inherit" onClick={handleOpenGallery}>
                  <Apps />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Center: Name and status */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Typography variant="h6">{mechanism.metadata.name}</Typography>

              {saveStatus !== "saving" && (
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
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor:
                        saveStatus === "saved"
                          ? "success.main"
                          : saveStatus === "error"
                            ? "error.main"
                            : "transparent",
                      transition: "background-color 0.3s ease",
                      boxShadow:
                        saveStatus === "saved"
                          ? "0 0 4px rgba(76, 175, 80, 0.6)"
                          : "none",
                    }}
                  />
                </Tooltip>
              )}

              {saveStatus === "saving" && (
                <Tooltip title={"Sauvegarde en cours..."}>
                  <CircularProgress
                    size={12}
                    color="inherit"
                    sx={{ m: "-1px" }}
                  />
                </Tooltip>
              )}
            </Box>

            {/* Center: Play simulation */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                width: 200,
                mr: -5,
              }}
            >
              <Chip
                label={
                  appMode !== "edition"
                    ? simHover
                      ? "Retour à l'édition"
                      : "Simulation"
                    : simHover
                      ? "Lancer la simulation"
                      : "Édition"
                }
                icon={
                  <Box
                    component="img"
                    src={
                      (appMode !== "edition") !== simHover
                        ? playIconUrl
                        : selectIconUrl
                    }
                    sx={{ width: 18, height: 18 }}
                  />
                }
                variant={simHover ? "filled" : "outlined"}
                onMouseEnter={() => setSimHover(true)}
                onMouseLeave={() => setSimHover(false)}
                onClick={() => {
                  if (appMode !== "edition") {
                    setAppMode("edition");
                    setCanvasState({ type: "Selecting" });
                  } else {
                    setAppMode("dynamic");
                    setCanvasState({ type: "Simulating" });
                  }
                  setSimHover(false);
                }}
                sx={{
                  height: 32,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  pl: 0.5,
                  color: simHover
                    ? "primary.contrastText"
                    : appMode !== "edition"
                      ? "primary.main"
                      : "secondary.main",
                  borderColor: simHover
                    ? "primary.contrastText"
                    : appMode !== "edition"
                      ? "primary.main"
                      : "secondary.main",
                  img: {
                    filter: simHover ? "brightness(0) invert(1)" : "none",
                  },
                  "&:hover": {
                    backgroundColor:
                      appMode !== "edition"
                        ? COLORS.SELECTION_BOX
                        : "primary.main",
                  },
                }}
              />
            </Box>

            {/* Right side: Undo/Redo, Settings */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                flex: 1,
                justifyContent: "flex-end",
              }}
            >
              <Tooltip title="Annuler (Ctrl+Z)">
                <IconButton color="inherit" onClick={() => undoMechanism()}>
                  <Undo />
                </IconButton>
              </Tooltip>
              <Tooltip title="Rétablir (Ctrl+Y)">
                <IconButton color="inherit" onClick={() => redoMechanism()}>
                  <Redo />
                </IconButton>
              </Tooltip>

              <Tooltip title="Langue">
                <IconButton
                  color="inherit"
                  aria-expanded={langOpen}
                  onClick={handleLangClick}
                  sx={{ gap: 0.5 }}
                >
                  <Language />
                  {language.slice(0, 2)}
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={langAnchorEl}
                open={langOpen}
                onClose={handleLangClose}
                slotProps={{
                  paper: {
                    style: {
                      maxHeight: 175,
                    },
                  },
                }}
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
              <Tooltip title="Info">
                <IconButton color="inherit" onClick={handleInfoOpen}>
                  <Info />
                </IconButton>
              </Tooltip>
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
                    Slidep a d'abord été pensé comme l'application que j'aurais
                    aimé avoir en tant qu'étudiant en ingénierie mécanique.
                  </Typography>

                  <Typography gutterBottom align="justify">
                    La méthode par éléments finis (FEM) m'a toujours facinée. On
                    arrive avec un modèle mathématique simple à recréer un
                    comportement physique réel. Mais même si les interfaces se
                    sont améliorées, les Ansys et Abaqus restent des outils
                    complexes et souvent très chères. De plus, les pièces un peu
                    complexes demandent vite beaucoup de temps et de ressources.
                    C'est pour ça que j'ai toujours eu une fixette sur les
                    éléments de type poutre. Avec les poutres, on peut faire des
                    éléments finis en temps réel ! J'ai toujours eu envie de
                    créer un outil basé dessus.
                  </Typography>

                  <Typography gutterBottom align="justify">
                    C'est Slidep : De la simulation en temps réel avec des
                    éléments simples, le tout dans une interface facile d'accès.
                    C'est l'étape intermédiaire entre les schémas papier crayon
                    et le solveur par éléments finis. Mais pour prétendre
                    remplacer le papier crayon, il faudrais pouvoir créer tous
                    les mécanismes ! C'est pour cela qu'à l'avenir, j'aimerais
                    faire évoluer Slidep pour gérer les collisions, dessiner en
                    3D, voire même faire de la dynamique des fluides !
                  </Typography>

                  <Typography gutterBottom align="justify">
                    Implémenter ces changement à l'avenir me demandera plus que
                    de la patience, mais des moyens. Alors si vous avez des
                    idées, partagez les ! Si vous savez coder, contribuez ! Et
                    si vous avez de l'argent, financez !
                  </Typography>
                </DialogContent>
                <DialogContent>
                  <Box>Contact :</Box>
                  <a href="mailto:arnaud.jungo@slidep.ch">
                    arnaud.jungo@slidep.ch
                  </a>
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
            mechanism={mechanism}
            setHoveredPart={setHoveredPart}
            hoveredPart={hoveredPart}
            undoMechanism={undoMechanism}
            redoMechanism={redoMechanism}
          />

          {/* Floating panels */}
          <ElementPalette
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            mechanism={mechanism}
            appMode={appMode}
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
    </ThemeProvider>
  );
};

export default App;
