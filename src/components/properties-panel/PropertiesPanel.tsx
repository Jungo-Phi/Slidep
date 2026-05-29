/**
 * PropertiesPanel component
 * Displays and allows editing of selected element properties
 */

import React, { useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import {
  KeyboardArrowUp as CollapseIcon,
  KeyboardArrowDown as ExpandIcon,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  Mechanism,
  MechanismMetadata,
  SimulationConfig,
  SimulationState,
  UnionElement,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import { ProjectInfoSection } from "./ProjectInfoSection";
import ElementProperties from "./ElementProperties";
import { COLORS } from "../../constants/rendering-specs";

interface PropertiesPanelProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setMetaData: (metadata: MechanismMetadata) => void;
  setSimulationState: (state: SimulationState) => void;
  simulationState: SimulationState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  setCanvasState,
  canvasState,
  updateMechanism,
  mechanism,
  setHoveredPart,
  setMetaData,
}) => {
  const [closed, setClosed] = useState<boolean>(false);

  const togglePanel = () => {
    setClosed(!closed);
  };

  const handleProjectInfoChange = (info: any) => {
    setMetaData({
      ...mechanism.metadata,
      name: info.name,
      description: info.description,
      author: info.author,
      version: info.version,
      createdAt: info.createdAt,
      modifiedAt: info.modifiedAt,
    });
  };

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
        backgroundColor: COLORS.BACKGROUND,
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
          Propriétés
        </Typography>
        {closed ? (
          <ExpandIcon fontSize="medium" />
        ) : (
          <CollapseIcon fontSize="medium" />
        )}
      </Box>

      {!closed && (
        <Box sx={{ p: 2, flexGrow: 1, overflow: "auto" }}>
          {/* Contenu du panneau de propriétés */}
          {"elementID" in canvasState ? (
            <Box>
              {/* Affichage des propriétés de l'élément sélectionné */}
              <>
                {(() => {
                  let element: UnionElement | undefined =
                    mechanism.mechanicalElements.find(
                      (el) => el.id === canvasState.elementID,
                    );
                  if (element === undefined) {
                    element = mechanism.constraintElements.find(
                      (el) => el.id === canvasState.elementID,
                    );
                  }
                  if (element) {
                    return (
                      <ElementProperties
                        element={element}
                        setHoveredPart={setHoveredPart}
                        setCanvasState={setCanvasState}
                        updateMechanism={updateMechanism}
                        mechanism={mechanism}
                      />
                    );
                  }
                  return (
                    <Typography variant="body2">
                      Élément "
                      {canvasState.elementID.toString().padStart(3, "0")} "
                      introuvable
                    </Typography>
                  );
                })()}
              </>
            </Box>
          ) : (
            <ProjectInfoSection
              mechanism={mechanism}
              onProjectInfoChange={handleProjectInfoChange}
            />
          )}
        </Box>
      )}
    </Paper>
  );
};

export default PropertiesPanel;
