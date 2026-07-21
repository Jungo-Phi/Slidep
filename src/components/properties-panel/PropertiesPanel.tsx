import React from "react";
import { Box, Paper, Tabs, Tab } from "@mui/material";
import {
  Folder as ProjectIcon,
  Build as ElementIcon,
  Straighten as ConstraintsIcon,
  Assessment as AnalysisIcon,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  AppMode,
  ID,
  Mechanism,
  MechanismMetadata,
  PropertiesPanelTab,
  RuntimeState,
  SimulationConfig,
} from "../../types";
import { ConstraintResidual } from "../../types/runtime-state";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import { ProjectInfoSection } from "./ProjectInfoSection";
import ElementProperties from "./ElementProperties";
import ConstraintsPanel from "./ConstraintsPanel";
import AnalysisPanel from "./AnalysisPanel";
import { host_mechanical_element } from "../mechanism/connect-actions";
import { ElementNavigationContext } from "./element-navigation";

export interface PropertiesPanelProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  updateMetadata: (metadata: MechanismMetadata) => void;
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
  runtimeState: RuntimeState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
  appMode: AppMode;
  activeTab: PropertiesPanelTab;
  setActiveTab: (tab: PropertiesPanelTab) => void;
  unsatisfied: ConstraintResidual[];
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  setCanvasState,
  canvasState,
  applyActions,
  mechanism,
  setHoveredPart,
  updateMetadata,
  appMode,
  activeTab,
  setActiveTab,
  unsatisfied,
  runtimeState,
  setRuntimeState,
}) => {
  const handleProjectInfoChange = (info: any) => {
    updateMetadata({
      ...mechanism.metadata,
      name: info.name,
      description: info.description,
      author: info.author,
      createdAt: info.createdAt,
      modifiedAt: info.modifiedAt,
    });
  };

  const handleTabChange = (
    _event: React.SyntheticEvent,
    newValue: PropertiesPanelTab,
  ) => {
    setActiveTab(newValue);
  };

  const selectedID: ID | undefined = (canvasState as { elementID?: ID })
    .elementID;
  // The mechanical element the selection points at (a selected load resolves to
  // its host). Shared by the elements tab and the analysis tab's measures section.
  const selectedElement = host_mechanical_element(
    selectedID,
    mechanism.mechanicalElements,
    mechanism.loads,
  );

  // Any ElementDisplay clicked anywhere in the panel drills down to the element
  // it names. Declared once here rather than wired card by card, so no panel can
  // forget it and none has to special-case which of its cards navigate.
  const drillDownToElement = React.useCallback(
    () => setActiveTab("elements"),
    [setActiveTab],
  );

  return (
    <ElementNavigationContext.Provider value={drillDownToElement}>
      <Paper
        sx={{
          position: "absolute",
          right: 16,
          top: 16,
          width: 300,
          maxHeight: "calc(100% - 32px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1000,
          overflow: "hidden",
          borderRadius: 1,
          boxShadow: 3,
        }}
      >
        <Box
          sx={{
            backgroundColor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            textColor="inherit"
            tabIndex={0}
            sx={{
              minHeight: 40,
              height: 40,
              "& .MuiTabs-flexContainer": {
                justifyContent: "space-around",
              },
              "& .MuiTab-root": {
                px: 2,
                my: -0.5,
                fontWeight: "bold",
                "&.Mui-selected": {
                  color: "primary.contrastText",
                },
              },
              "& .MuiTabs-indicator": {
                backgroundColor: "primary.contrastText",
                height: 3,
                borderRadius: "3px 3px 0 0",
              },
            }}
          >
            {[
              { id: "project", icon: ProjectIcon, label: "Projet" },
              { id: "elements", icon: ElementIcon, label: "Éléments" },
              {
                id: "constraints",
                icon: ConstraintsIcon,
                label: "Contraintes",
              },
              { id: "analysis", icon: AnalysisIcon, label: "Analyse" },
            ].map((tab) => {
              return (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  icon={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <tab.icon fontSize="small" />
                      {activeTab === tab.id && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                            lineHeight: 1.2,
                          }}
                        >
                          {tab.label}
                        </span>
                      )}
                    </Box>
                  }
                  label=""
                  sx={{
                    minWidth: "auto",
                    justifyContent: "center",
                  }}
                />
              );
            })}
          </Tabs>
        </Box>

        <Box sx={{ overflow: "auto", flexGrow: 1 }}>
          {activeTab === "project" && (
            <ProjectInfoSection
              mechanism={mechanism}
              updateMetadata={handleProjectInfoChange}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
            />
          )}
          {activeTab === "elements" && (
            <ElementProperties
              element={
                mechanism.mechanicalElements.find(
                  (el) => el.id === selectedID,
                ) || mechanism.loads.find((l) => l.id === selectedID)
              }
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
              setActiveTab={setActiveTab}
              appMode={appMode}
              runtimeState={runtimeState}
            />
          )}
          {activeTab === "constraints" && (
            <ConstraintsPanel
              constraintID={(canvasState as any).elementID}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          )}
          {activeTab === "analysis" && (
            <AnalysisPanel
              mechanism={mechanism}
              appMode={appMode}
              applyActions={applyActions}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              unsatisfied={unsatisfied}
              runtimeState={runtimeState}
              setRuntimeState={setRuntimeState}
              selectedElement={selectedElement}
            />
          )}
        </Box>
      </Paper>
    </ElementNavigationContext.Provider>
  );
};

export default PropertiesPanel;
