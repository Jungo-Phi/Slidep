import React, { useState, useRef, useEffect } from "react";
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
  DEFAULT_METADATA,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_SIMULATION_STATE,
  DEFAULT_VIEWPORT,
  Mechanism,
  MechanismMetadata,
  SerializedMechanism,
  SimulationConfig,
  SimulationState,
  SlidepDB,
  ZERO,
} from "./types";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanism/action-reducer";
import { preload_element_icons } from "./components/element-palette/elementIcon";
import { COLORS } from "./constants/rendering-specs";
import {
  deserializeMechanism,
  loadFromFile,
  saveToFile,
  serializeMechanism,
} from "./utils/serialization";
import { get_hovered_part } from "./components/mechanical-canvas/get-hover";
import { update_mechanism } from "./components/mechanism/update-mechanism";
import MechanismsGallery from "./components/mechanisms-gallery/MechanismsGallery";
import { openDB } from "idb";
import { generateThumbnail } from "./utils/thumbnail-generator";
import { debounce } from "./utils/debounce";

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
  constraintsVisible: true;
  gridSize: 50;
};
*/

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
    viewport: DEFAULT_VIEWPORT,
    mechanicalElements: [],
    constraintElements: [],
    history: [],
    future: [],
  });
  const mechanismRef = useRef<Mechanism>(mechanism);
  useEffect(() => {
    mechanismRef.current = mechanism;
  }, [mechanism]);

  const [hoveredPart, setHoveredPart] = useState<HoveredPart>({
    type: "Void",
    position: ZERO,
  });
  const [simulationState, setSimulationState] = useState<SimulationState>(
    DEFAULT_SIMULATION_STATE,
  );
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(
    DEFAULT_SIMULATION_CONFIG,
  );
  const currentTheme = lightTheme;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dbVersion = 3;
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saved" | "saving" | "error"
  >("idle");

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [savedMechanisms, setSavedMechanisms] = useState<SerializedMechanism[]>(
    [],
  );

  const [simHover, setSimHover] = useState(false);

  /** Preload all icons when the app starts */
  useEffect(() => {
    preload_element_icons();
  }, []);

  const IDcounter = useRef(1);

  const updateMetadata = (metadata: MechanismMetadata) => {
    setMechanism({ ...mechanism, metadata });
    setSaveStatus("saving");
    debouncedSave();
  };

  const updateMechanism = (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => {
    const updatedMechanism = update_mechanism(
      mechanism,
      actions,
      actionBundleType,
    );
    setMechanism(updatedMechanism);
    setSaveStatus("saving");
    debouncedSave();

    setHoveredPart(
      get_hovered_part(
        updatedMechanism.mechanicalElements,
        updatedMechanism.constraintElements,
        true, // TODO : Add parameter to toggle showing constraints
        hoveredPart.position,
        canvasState,
      ),
    );

    if (canvasState.type !== "SelectedElement") return;
    if (
      updatedMechanism.mechanicalElements.find(
        (el) => el.id === canvasState.elementID,
      ) ||
      updatedMechanism.constraintElements.find(
        (el) => el.id === canvasState.elementID,
      )
    )
      return;
    setCanvasState({ type: "Selecting" });
  };

  const undoMechanism = () => {
    // Undo (ctrl+Z)
    if (mechanism.history.length === 0) return;
    let lastActions = mechanism.history.slice(-1)[0];
    let newMechanism = {
      history: [...mechanism.history.slice(0, -1)],
      future: [...mechanism.future, [...lastActions]],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    lastActions.reverse();
    const updatedMechanism = actionReducer(newMechanism, lastActions, true);
    setMechanism(updatedMechanism);

    if (canvasState.type !== "SelectedElement") return;
    if (
      !updatedMechanism.mechanicalElements.find(
        (el) => el.id === canvasState.elementID,
      ) &&
      !updatedMechanism.constraintElements.find(
        (el) => el.id === canvasState.elementID,
      )
    ) {
      setCanvasState({ type: "Selecting" });
    }
  };

  const redoMechanism = () => {
    // Redo (ctrl+Y)
    if (mechanism.future.length === 0) return;
    let nextActions = mechanism.future.slice(-1)[0];
    let newMechanism = {
      history: [...mechanism.history, [...nextActions]],
      future: [...mechanism.future.slice(0, -1)],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    setMechanism(actionReducer(newMechanism, nextActions, false));
  };

  const performSaveToDB = async () => {
    setSaveStatus("saving");
    try {
      let thumbnailData = "";
      if (canvasRef.current) {
        thumbnailData = await generateThumbnail(canvasRef.current);
      }
      const db = await openDB<SlidepDB>("SlidepDB", dbVersion, {
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
      await db.put("mechanisms", serializeMechanism(mechanismToSave));
      setSaveStatus("saved");

      // Mise à jour de la galerie si ouverte
      if (galleryOpen) {
        const allRecords = await db.getAll("mechanisms");
        setSavedMechanisms(allRecords);
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde auto :", error);
      setSaveStatus("error");
    }
  };

  // Création de la fonction debouncée (attend 2s après la dernière modif)
  // On le fait dans un useEffect pour ne pas recréer la fonction à chaque rendu
  const debouncedSave = useRef(
    debounce(() => {
      performSaveToDB();
    }, 1500),
  ).current;

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

  const handleOpenGallery = async () => {
    const db = await openDB<SlidepDB>("SlidepDB", dbVersion, {
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
  };

  const handleLoadFromGallery = (mechanismRecord: SerializedMechanism) => {
    setMechanism(deserializeMechanism(mechanismRecord));
    setGalleryOpen(false);
    // Optionnel : Afficher un snackbar "Mécanisme chargé"
    console.log("Loaded new mechanism.");
    console.log(deserializeMechanism(mechanismRecord));
  };

  const handleDeleteFromGallery = async (createdAtId: number) => {
    if (!window.confirm("Supprimer ce mécanisme définitivement ?")) return;

    const db = await openDB<SlidepDB>("SlidepDB", dbVersion);
    await db.delete("mechanisms", createdAtId);

    setSavedMechanisms((prev) =>
      prev.filter((r) => r.metadata.createdAt !== createdAtId),
    );
    // Optionnel : Afficher un snackbar "Mécanisme supprimé"
    console.log("Deleted mechanism.");
  };

  const handleNewFromGallery = () => {
    setMechanism({
      metadata: {
        ...DEFAULT_METADATA,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
      viewport: DEFAULT_VIEWPORT,
      mechanicalElements: [],
      constraintElements: [],
      history: [],
      future: [],
    });
    setGalleryOpen(false);
    setSaveStatus("idle");
  };

  const handleMenuButtonUpload = () => {
    loadFromFile().then((data) => setMechanism(deserializeMechanism(data)));
    setSaveStatus("saving");
    debouncedSave();
    setMenuAnchorEl(null);
    return;
  };
  const handleMenuButtonDownload = () => {
    saveToFile(
      serializeMechanism(mechanism),
      `${mechanism.metadata.name}.slidep`,
    );
    setMenuAnchorEl(null);
  };

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const handleSettingsOpen = () => {
    setSettingsOpen(true);
  };
  const handleSettingsClose = () => {
    setSettingsOpen(false);
    setMenuAnchorEl(null);
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

  const LANGUAGES = ["Deutsch", "English", "Español", "Français"];

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
                      ? "Sauvgardé"
                      : saveStatus === "error"
                        ? "Erreur de sauvgarde"
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
                <Tooltip title={"Sauvgarde en cours..."}>
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
                  canvasState.type === "Simulating"
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
                      (canvasState.type === "Simulating") !== simHover
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
                  setCanvasState({
                    type:
                      canvasState.type === "Simulating"
                        ? "Selecting"
                        : "Simulating",
                  });
                  setSimHover(false);
                }}
                sx={{
                  height: 32,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  pl: 0.5,
                  color: simHover
                    ? "primary.contrastText"
                    : canvasState.type === "Simulating"
                      ? "primary.main"
                      : "secondary.main",
                  borderColor: simHover
                    ? "primary.contrastText"
                    : canvasState.type === "Simulating"
                      ? "primary.main"
                      : "secondary.main",
                  img: {
                    filter: simHover ? "brightness(0) invert(1)" : "none",
                  },
                  "&:hover": {
                    backgroundColor:
                      canvasState.type === "Simulating"
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
                    C'est l'étape intermédiaire entre les shémas papier crayon
                    et le solveur par éléments finits. Mais pour prétendre
                    remplacer le papier crayon, il faudrais pouvoir créer tous
                    les mécanismes ! C'est pour cela qu'à l'avenir, j'aimerais
                    faire évoluer Slidep pour gérer les collisions, dessiner en
                    3D, voire même faire de la dynamique des fluides !
                  </Typography>

                  <Typography gutterBottom align="justify">
                    Implémenter ces changement à l'avenir me demandera plus que
                    de la patience, mais des moyens. Alors si vous avez des
                    idées, partagez les ! Si vous savez coder, contribuez ! Et
                    si vous avec de l'argent, financez !
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
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            setHoveredPart={setHoveredPart}
            hoveredPart={hoveredPart}
            undoMechanism={undoMechanism}
            redoMechanism={redoMechanism}
            IDcounter={IDcounter}
          />

          {/* Floating panels */}
          <ElementPalette
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            mechanism={mechanism}
          />
          <PropertiesPanel
            setCanvasState={setCanvasState}
            canvasState={canvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            setHoveredPart={setHoveredPart}
            updateMetadata={updateMetadata}
            setSimulationState={setSimulationState}
            simulationState={simulationState}
            setSimulationConfig={setSimulationConfig}
            simulationConfig={simulationConfig}
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
