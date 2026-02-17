/**
 * Main App component for slidep
 * Mechanical mechanism design and simulation application
 */

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
} from "@mui/material";
import {
  Save as SaveIcon,
  FolderOpen as OpenIcon,
  Add as NewIcon,
  Settings as SettingsIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
} from "@mui/icons-material";
import { lightTheme, darkTheme, highContrastTheme } from "./lib/mui-theme";
import logoUrl from "./assets/icons/palette/logo.svg";
import MechanicalCanvas from "./components/mechanical-canvas/MechanicalCanvas";
import { ElementPalette } from "./components/element-palette";
import { PropertiesPanel } from "./components/properties-panel/PropertiesPanel";
import { CanvasState } from "./types/canvas-state";
import {
  Action,
  DEFAULT_METADATA,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_SIMULATION_STATE,
  DEFAULT_VIEWPORT,
  Mechanism,
  MechanismMetadata,
  SimulationConfig,
  SimulationState,
  ZERO,
} from "./types";
import { HoveredPart } from "./types/hovered-part";
import { actionReducer } from "./components/mechanical-canvas/action-reducer";
import { preload_element_icons } from "./components/element-palette/elementIcon";
import { COLORS } from "./constants/rendering-specs";
//import { SimulationControls } from './components/simulation-controls';

/**
 * User preferences
 */
export interface UserPreferences {
  theme: string;
  gridVisible: boolean;
  snapToGrid: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}

/**
 * Default preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  gridVisible: true,
  snapToGrid: true,
  autoSave: true,
  autoSaveInterval: 30,
};

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

  const updateMechanism = (actions: Action[]) => {
    let newHistory = [...mechanism.history, actions];
    // bundle Move actions
    const action = actions[0];
    if (
      (action.type === "MoveNode" ||
        action.type === "MoveEdgeStart" ||
        action.type === "MoveEdgeEnd" ||
        action.type === "MoveEdgeBody" ||
        action.type === "MoveElements" ||
        action.type === "ChangeEdgeLength" ||
        action.type === "ChangeStiffness" ||
        action.type === "ChangeDamping" ||
        action.type === "ChangeMass" ||
        action.type === "ChangeGearRadius" ||
        action.type === "ChangeGearAngle" ||
        action.type === "MoveConstraint") &&
      mechanism.history.length > 0
    ) {
      let lastAction = mechanism.history.slice(-1)[0][0];
      if (action.type === lastAction.type) {
        switch (lastAction.type) {
          case "MoveNode":
          case "MoveEdgeStart":
          case "MoveEdgeEnd":
          case "MoveEdgeBody":
            if (action.type === lastAction.type) {
              lastAction.newPosition = action.newPosition;
            }
            break;
          case "MoveElements":
            if (action.type === lastAction.type) {
              lastAction.delta = lastAction.delta.add(action.delta);
            }
            break;
          case "ChangeEdgeLength":
          case "ChangeStiffness":
          case "ChangeDamping":
          case "ChangeMass":
            if (action.type === lastAction.type) {
              lastAction.delta += action.delta;
            }
            break;
          case "ChangeGearRadius":
            if (action.type === lastAction.type) {
              lastAction.newRadius = action.newRadius;
            }
            break;
          case "ChangeGearAngle":
            if (action.type === lastAction.type) {
              lastAction.newAngle = action.newAngle;
            }
            break;
          case "MoveConstraint":
            if (action.type === lastAction.type) {
              lastAction.newPosition = action.newPosition;
            }
            break;
        }
        newHistory = [...mechanism.history];
      }
    }
    let newMechanism = {
      history: newHistory,
      future: [],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    setMechanism(actionReducer(newMechanism, actions, false));
  };

  const undoMechanism = () => {
    // Undo (ctrl+Z)
    if (mechanism.history.length === 0) {
      return;
    }
    let actions = mechanism.history.slice(-1)[0];
    let newMechanism = {
      history: [...mechanism.history.slice(0, -1)],
      future: [...mechanism.future, [...actions]],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    actions.reverse();
    setMechanism(actionReducer(newMechanism, actions, true));
  };

  const redoMechanism = () => {
    // Redo (ctrl+Y)
    if (mechanism.future.length === 0) {
      return;
    }
    let actions = mechanism.future.slice(-1)[0];
    let newMechanism = {
      history: [...mechanism.history, [...actions]],
      future: [...mechanism.future.slice(0, -1)],
      mechanicalElements: [...mechanism.mechanicalElements],
      constraintElements: [...mechanism.constraintElements],
      viewport: { ...mechanism.viewport },
      metadata: { ...mechanism.metadata },
    };
    setMechanism(actionReducer(newMechanism, actions, false));
  };

  const setMetaData = (metadata: MechanismMetadata) => {
    setMechanism({ ...mechanism, metadata });
  };

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
            backgroundColor: "oklch(0.85 0.11 64)",
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
              ml: 1,
              mr: 1,
            }}
          >
            {/* Left side: Logo, File actions, Name */}
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
                <Tooltip title="Nouveau mécanisme">
                  <IconButton
                    size="medium"
                    color="inherit"
                    aria-label="Nouveau"
                  >
                    <NewIcon fontSize="medium" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Ouvrir">
                  <IconButton size="medium" color="inherit" aria-label="Ouvrir">
                    <OpenIcon fontSize="medium" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Sauvegarder">
                  <IconButton
                    size="medium"
                    color="inherit"
                    aria-label="Sauvegarder"
                  >
                    <SaveIcon fontSize="medium" />
                  </IconButton>
                </Tooltip>
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
                <IconButton size="medium" color="inherit" aria-label="Annuler">
                  <UndoIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Rétablir (Ctrl+Y)">
                <IconButton size="medium" color="inherit" aria-label="Rétablir">
                  <RedoIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Paramètres">
                <IconButton
                  size="medium"
                  color="inherit"
                  aria-label="Paramètres"
                >
                  <SettingsIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
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
