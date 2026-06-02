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
                <IconButton
                  size="medium"
                  color="inherit"
                  aria-label="Annuler"
                  onClick={() => undoMechanism()}
                >
                  <UndoIcon fontSize="medium" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Rétablir (Ctrl+Y)">
                <IconButton
                  size="medium"
                  color="inherit"
                  aria-label="Rétablir"
                  onClick={() => redoMechanism()}
                >
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
