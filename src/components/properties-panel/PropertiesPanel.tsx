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
  Mechanism,
  MechanismMetadata,
  PropertiesPanelTab,
  RuntimeState,
  SimulationConfig,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import { ProjectInfoSection } from "./ProjectInfoSection";
import ElementProperties from "./ElementProperties";
import ConstraintsPanel from "./ConstraintsPanel";
import AnalysisPanel from "./AnalysisPanel";

export interface PropertiesPanelProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  updateMetadata: (metadata: MechanismMetadata) => void;
  setRuntimeState: (state: RuntimeState) => void;
  runtimeState: RuntimeState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
  appMode: AppMode;
  activeTab: PropertiesPanelTab;
  setActiveTab: (tab: PropertiesPanelTab) => void;
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
}) => {
  const handleProjectInfoChange = (info: any) => {
    updateMetadata({
      ...mechanism.metadata,
      name: info.name,
      description: info.description,
      author: info.author,
      version: info.version,
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

  return (
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
                color: "#fff",
              },
            },
            "& .MuiTabs-indicator": {
              backgroundColor: "#fff",
              height: 3,
              borderRadius: "3px 3px 0 0",
            },
          }}
        >
          {[
            { id: "project", icon: ProjectIcon, label: "Projet" },
            { id: "element", icon: ElementIcon, label: "Élément" },
            { id: "constraints", icon: ConstraintsIcon, label: "Contraintes" },
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
          />
        )}
        {activeTab === "element" && (
          <ElementProperties
            element={mechanism.mechanicalElements.find(
              (el) => el.id === (canvasState as any).elementID,
            )}
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
          <AnalysisPanel mechanism={mechanism} appMode={appMode} />
        )}
      </Box>
    </Paper>
  );
};

export default PropertiesPanel;
