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
} from "@mui/material";
import {
  Menu as MenuIcon,
  Settings,
  Undo,
  Redo,
  Save,
  Language,
  Info,
  AddCircle,
  Folder,
  Close,
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
  DEFAULT_METADATA,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_SIMULATION_STATE,
  DEFAULT_VIEWPORT,
  Mechanism,
  MechanismMetadata,
  Nodes,
  SimulationConfig,
  SimulationState,
  ZERO,
} from "./types";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanical-canvas/action-reducer";
import { preload_element_icons } from "./components/element-palette/elementIcon";
import { COLORS } from "./constants/rendering-specs";
import { cloneMechanism } from "./utils/serialization";
import { resolveGeometricConstraints } from "./components/solver/geometric-solver";
import { get_nodes } from "./components/solver/parsing";
//import { SimulationControls } from './components/simulation-controls';

export interface UserPreferences {
  theme: string;
  gridVisible: boolean;
  snapToGrid: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}

/*
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  gridVisible: true,
  snapToGrid: true,
  autoSave: true,
  autoSaveInterval: 30,
};
*/

/**
 * App component
 */
const App: React.FC = () => {
  const [canvasState, setCanvasState] = useState<CanvasState>({
    type: "Selecting",
  });
  const [mechanism, setMechanism] = useState<Mechanism>({
    metadata: DEFAULT_METADATA,
    viewport: DEFAULT_VIEWPORT,
    mechanicalElements: [],
    constraintElements: [],
    history: [],
    future: [],
  });
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

  /** Preload all icons when the app starts */
  useEffect(() => {
    preload_element_icons();
  }, []);

  const IDcounter = useRef(1);

  const updateMechanism = (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => {
    const newAction = actions[0];
    let newActions = actions;
    let lastActions: Action[];
    let lastAction: Action;
    let secondToLastAction: Action;
    let oldNodes: Nodes;
    let newNodes: Nodes;

    let newHistory: Action[][] | undefined = undefined;

    switch (actionBundleType) {
      case "MoveConstraint":
      case "ChangeConstant":
        if (
          newAction.type !== "MoveConstraint" &&
          newAction.type !== "ChangeMass" &&
          newAction.type !== "ChangeStiffness" &&
          newAction.type !== "ChangeDamping"
        )
          throw console.error("impossible");
        if (mechanism.history.length === 0) break;
        lastActions = mechanism.history[mechanism.history.length - 1];
        if (lastActions.length < 1) break;
        lastAction = lastActions[lastActions.length - 1];
        if (newAction.type !== lastAction.type) break;
        switch (lastAction.type) {
          case "ChangeStiffness":
          case "ChangeDamping":
          case "ChangeMass":
            if (newAction.type === lastAction.type) {
              lastAction.delta += newAction.delta;
            }
            break;
          case "MoveConstraint":
            if (newAction.type === lastAction.type) {
              lastAction.newPosition = newAction.newPosition;
            }
            break;
        }
        newHistory = [...mechanism.history];
        break;
      case "MoveElement":
        if (
          newAction.type !== "MoveNode" &&
          newAction.type !== "MoveEdgeStart" &&
          newAction.type !== "MoveEdgeEnd" &&
          newAction.type !== "MoveEdgeBody" &&
          newAction.type !== "MoveElements" &&
          newAction.type !== "ChangeGearRadius" &&
          newAction.type !== "ChangeEdgeLength"
        )
          throw console.error("impossible");

        oldNodes = get_nodes(mechanism.mechanicalElements);
        newNodes = resolveGeometricConstraints(
          mechanism,
          actionBundleType,
          newAction,
        );
        newActions = [
          ...actions,
          {
            type: "UpdatePositionsToValidState",
            masterActionType: newAction.type,
            newNodes,
            oldNodes,
          },
        ];
        if (mechanism.history.length === 0) break;
        lastActions = mechanism.history[mechanism.history.length - 1];
        if (lastActions.length < 2) break;
        lastAction = lastActions[lastActions.length - 1];
        secondToLastAction = lastActions[lastActions.length - 2];
        if (
          lastAction.type !== "UpdatePositionsToValidState" ||
          newAction.type !== lastAction.masterActionType
        )
          break;
        newHistory = [...mechanism.history];
        lastAction.newNodes = newNodes;
        if (secondToLastAction.type !== newAction.type)
          throw console.error("impossible");
        switch (secondToLastAction.type) {
          case "MoveNode":
          case "MoveEdgeStart":
          case "MoveEdgeEnd":
          case "MoveEdgeBody":
            if (secondToLastAction.type !== newAction.type)
              throw console.error("impossible");
            secondToLastAction.newPosition = newAction.newPosition;
            break;
          case "MoveElements":
            if (secondToLastAction.type !== newAction.type)
              throw console.error("impossible");
            secondToLastAction.delta = secondToLastAction.delta.add(
              newAction.delta,
            );
            break;
          case "ChangeGearRadius":
            if (secondToLastAction.type !== newAction.type)
              throw console.error("impossible");
            secondToLastAction.newRadius = newAction.newRadius;
            break;
          case "ChangeEdgeLength":
            if (secondToLastAction.type !== newAction.type)
              throw console.error("impossible");
            secondToLastAction.newLength = newAction.newLength;
            break;
        }
        break;
      case "ChangeDimension":
        if (
          newAction.type !== "ChangeDimensionEdgeValue" &&
          newAction.type !== "ChangeDimensionNodeToNodeValue" &&
          newAction.type !== "ChangeDimensionEdgeToNodeValue" &&
          newAction.type !== "ChangeDimensionAngleValue" &&
          newAction.type !== "ChangeDimensionRadiusValue" &&
          newAction.type !== "ChangeGearRatioValue"
        )
          throw console.error("impossible");

        oldNodes = get_nodes(mechanism.mechanicalElements);
        newNodes = resolveGeometricConstraints(
          actionReducer(cloneMechanism(mechanism), actions, false),
          actionBundleType,
          newAction,
        );
        newActions = [
          ...actions,
          {
            type: "UpdatePositionsToValidState",
            masterActionType: newAction.type,
            newNodes,
            oldNodes,
          },
        ];
        if (
          mechanism.history.length === 0 ||
          newAction.type === "ChangeGearRatioValue"
        )
          break;
        lastActions = mechanism.history[mechanism.history.length - 1];
        if (lastActions.length < 2) break;
        lastAction = lastActions[lastActions.length - 1];
        secondToLastAction = lastActions[lastActions.length - 2];
        if (
          lastAction.type !== "UpdatePositionsToValidState" ||
          newAction.type !== lastAction.masterActionType
        )
          break;
        newHistory = [...mechanism.history];
        lastAction.newNodes = newNodes;
        if (secondToLastAction.type !== newAction.type)
          throw console.error("impossible");
        secondToLastAction.newValue = newAction.newValue;
        break;
      case "Connects":
        if (
          newAction.type !== "ConnectsParentBeam" &&
          newAction.type !== "ConnectsFixedNodeStart" &&
          newAction.type !== "ConnectsFixedNodeEnd" &&
          newAction.type !== "ConnectsAttachedBelt" &&
          newAction.type !== "ConnectsFixedEdges" &&
          newAction.type !== "ConnectsRotatingEdges" &&
          newAction.type !== "ConnectsFixedNodesBody" &&
          newAction.type !== "ConnectsMeshedGears" &&
          newAction.type !== "ConnectsAttachedGears" &&
          newAction.type !== "ConnectsFixedGears" &&
          newAction.type !== "CreateElement" &&
          newAction.type !== "DeleteElement"
        )
          throw console.error("impossible");

        oldNodes = get_nodes(mechanism.mechanicalElements);
        newNodes = resolveGeometricConstraints(
          actionReducer(cloneMechanism(mechanism), actions, false),
          actionBundleType,
          newAction,
        );
        newActions = [
          ...actions,
          {
            type: "UpdatePositionsToValidState",
            masterActionType: newAction.type,
            newNodes,
            oldNodes,
          },
        ];
        break;
      case "CreateConstraint":
        if (
          newAction.type !== "CreateElement" ||
          (newAction.element.type !== "horizontal-align-edge" &&
            newAction.element.type !== "horizontal-align-nodes" &&
            newAction.element.type !== "vertical-align-edge" &&
            newAction.element.type !== "vertical-align-nodes" &&
            newAction.element.type !== "normal" &&
            newAction.element.type !== "parallel" &&
            newAction.element.type !== "equal" &&
            newAction.element.type !== "gear-ratio")
        )
          break;
        oldNodes = get_nodes(mechanism.mechanicalElements);
        newNodes = resolveGeometricConstraints(
          actionReducer(cloneMechanism(mechanism), actions, false),
          actionBundleType,
          newAction,
        );
        newActions = [
          ...actions,
          {
            type: "UpdatePositionsToValidState",
            masterActionType: newAction.type,
            newNodes,
            oldNodes,
          },
        ];
        break;
      case "Other":
        if (newAction.type == "Blank") {
          if (mechanism.history.length === 0) break;
          mechanism.history[mechanism.history.length - 1].push(newAction);
          newHistory = [...mechanism.history];
        }
    }
    if (!newHistory) newHistory = [...mechanism.history, newActions];

    let newMechanism = {
      history: newHistory,
      future: [],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    const updatedMechanism = actionReducer(newMechanism, newActions, false);
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

  const setMetaData = (metadata: MechanismMetadata) => {
    setMechanism({ ...mechanism, metadata });
  };

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

  const handleMenuButtonNew = () => {
    // TODO : Demander "Voulez-vous enregistrer le mécanisme actuel avant d'en créer un nouveau ?"
    setMechanism({
      metadata: DEFAULT_METADATA,
      viewport: DEFAULT_VIEWPORT,
      mechanicalElements: [],
      constraintElements: [],
      history: [],
      future: [],
    });
    setMenuAnchorEl(null);
  };
  const handleMenuButtonOpen = () => {
    // TODO : Demander "Voulez-vous enregistrer le mécanisme actuel avant d'en ouvrir un autre ?"
    // TODO : Ouvrir le système de fichiers "ouvrir"
    setMenuAnchorEl(null);
  };
  const handleMenuButtonSave = () => {
    // TODO : Ouvrir le système de fichiers "sauvgarder"
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

              <Box sx={{ display: "flex", gap: 0.5, mr: 2 }}>
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
                    onClick={handleMenuButtonNew}
                    disableRipple
                    sx={{ gap: 1, marginLeft: -0.5 }}
                  >
                    <AddCircle />
                    Nouveau
                  </MenuItem>
                  <MenuItem
                    onClick={handleMenuButtonOpen}
                    disableRipple
                    sx={{ gap: 1, marginLeft: -0.5 }}
                  >
                    <Folder />
                    Ouvrir
                  </MenuItem>
                  <MenuItem
                    onClick={handleMenuButtonSave}
                    disableRipple
                    sx={{ gap: 1, marginLeft: -0.5 }}
                  >
                    <Save />
                    Enregistrer
                  </MenuItem>
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem
                    onClick={handleSettingsOpen}
                    disableRipple
                    sx={{ gap: 1, marginLeft: -0.5 }}
                  >
                    <Settings />
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
            </Box>

            {/* Center: Simulation controls */}
            <Box sx={{ flex: 0 }}>{/* <SimulationControls isTopBar /> */}</Box>

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
                  <Typography gutterBottom>
                    Cras mattis consectetur purus sit amet fermentum. Cras justo
                    odio, dapibus ac facilisis in, egestas eget quam. Morbi leo
                    risus, porta ac consectetur ac, vestibulum at eros.
                  </Typography>

                  <Typography gutterBottom>
                    Cras mattis consectetur purus sit amet fermentum. Cras justo
                    odio, dapibus ac facilisis in, egestas eget quam. Morbi leo
                    risus, porta ac consectetur ac, vestibulum at eros.
                  </Typography>
                </DialogContent>
                <DialogContent>
                  <Box>Contact :</Box>
                  <a href="mailto:arnaud.jungo@slidep.ch">
                    arnaud.jungo@slidep.ch
                  </a>

                  <Box>Code :</Box>
                  <a href="https://github.com/Jungo-Phi/Slidep">
                    https://github.com/Jungo-Phi/Slidep
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
            setMetaData={setMetaData}
            setSimulationState={setSimulationState}
            simulationState={simulationState}
            setSimulationConfig={setSimulationConfig}
            simulationConfig={simulationConfig}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
