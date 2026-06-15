import React, { useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import {
  KeyboardArrowUp as CollapseIcon,
  KeyboardArrowDown as ExpandIcon,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  MechanicalElement,
  Mechanism,
  MechanismMetadata,
  SimulationConfig,
  SimulationState,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import { ProjectInfoSection } from "./ProjectInfoSection";
import ElementProperties from "./ElementProperties";
import ConstraintsPanel from "./ConstraintsPanel";
import SimulationControls from "../simulation-controls";
import { legible_id } from "../../utils";

interface PropertiesPanelProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  updateMetadata: (metadata: MechanismMetadata) => void;
  setSimulationState: (state: SimulationState) => void;
  simulationState: SimulationState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  setCanvasState,
  canvasState,
  applyActions,
  mechanism,
  setHoveredPart,
  updateMetadata,
}) => {
  const [closed, setClosed] = useState<boolean>(false);

  const togglePanel = () => {
    setClosed(!closed);
  };

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

  let title = "Propriétés";
  if (!closed) {
    if (canvasState.type === "Simulating") {
      title = "Contrôles de la simulation";
    } else if ("elementID" in canvasState) {
      const mechanicalElement: MechanicalElement | undefined =
        mechanism.mechanicalElements.find(
          (el) => el.id === canvasState.elementID,
        );
      if (mechanicalElement) {
        title += " de l'élément";
      } else if (
        mechanism.constraintElements.find(
          (el) => el.id === canvasState.elementID,
        )
      ) {
        title = " Contraintes";
      } else {
        title = "Erreur";
      }
    } else {
      title += " générales";
    }
  }

  return (
    <Paper
      sx={{
        position: "absolute",
        right: 16,
        top: 16,
        width: closed ? 150 : 300,
        maxHeight: "calc(100% - 32px)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        overflow: "hidden",
        borderRadius: 1,
        boxShadow: 3,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: closed ? 0.5 : 1.5,
          pl: closed ? 1 : 2,
          backgroundColor: "primary.main",
          color: "primary.contrastText",
          cursor: "pointer",
          "&:hover": { backgroundColor: "primary.dark" },
        }}
        onClick={togglePanel}
        title={closed ? "Ouvrir le panneau" : "Réduire le panneau"}
      >
        <Typography variant="subtitle1" fontWeight={500}>
          {title}
        </Typography>
        {closed ? (
          <ExpandIcon fontSize="medium" />
        ) : (
          <CollapseIcon fontSize="medium" />
        )}
      </Box>

      {!closed && (
        <Box sx={{ p: 2, overflow: "auto" }}>
          {/* Contenu du panneau de propriétés */}
          {canvasState.type === "Simulating" ? (
            <SimulationControls />
          ) : "elementID" in canvasState ? (
            <Box>
              <>
                {(() => {
                  const mechanicalElement: MechanicalElement | undefined =
                    mechanism.mechanicalElements.find(
                      (el) => el.id === canvasState.elementID,
                    );
                  if (mechanicalElement) {
                    return (
                      <ElementProperties
                        element={mechanicalElement}
                        setHoveredPart={setHoveredPart}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                        mechanism={mechanism}
                      />
                    );
                  }
                  if (
                    mechanism.constraintElements.find(
                      (el) => el.id === canvasState.elementID,
                    )
                  ) {
                    return (
                      <ConstraintsPanel
                        constraintID={canvasState.elementID}
                        setHoveredPart={setHoveredPart}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                        mechanism={mechanism}
                      />
                    );
                  }
                  return (
                    <Typography variant="body2">
                      Élément "{legible_id(canvasState.elementID)} " introuvable
                    </Typography>
                  );
                })()}
              </>
            </Box>
          ) : (
            <ProjectInfoSection
              mechanism={mechanism}
              updateMetadata={handleProjectInfoChange}
            />
          )}
        </Box>
      )}
    </Paper>
  );
};

export default PropertiesPanel;
