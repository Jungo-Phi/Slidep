/**
 * ProjectInfoSection component
 * Displays general project information and canvas statistics
 * Shown when no element is selected
 */

import React, { useState } from "react";
import { Box, Typography, TextField, Divider } from "@mui/material";
import { Mechanism } from "../../types";

interface ProjectInfoSectionProps {
  mechanism: Mechanism;
  onProjectInfoChange?: (info: ProjectMetadata) => void;
}

interface ProjectMetadata {
  name: string;
  description: string;
  author: string;
  version: string;
  createdAt: string;
  modifiedAt: string;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  mechanism,
  onProjectInfoChange,
}) => {
  // TODO : simplifier
  const [projectInfo, setProjectInfo] = useState<ProjectMetadata>({
    name: mechanism.metadata.name,
    description: mechanism.metadata.description,
    author: mechanism.metadata.author,
    version: mechanism.metadata.version,
    createdAt: new Date(mechanism.metadata.createdAt).toLocaleDateString(),
    modifiedAt: new Date(mechanism.metadata.modifiedAt).toLocaleDateString(),
  });

  // Mettez à jour le state local si le mechanism.metadata change (ex: lors du chargement d'un nouveau projet)
  React.useEffect(() => {
    setProjectInfo({
      name: mechanism.metadata.name,
      description: mechanism.metadata.description,
      author: mechanism.metadata.author,
      version: mechanism.metadata.version,
      createdAt: new Date(mechanism.metadata.createdAt).toLocaleDateString(),
      modifiedAt: new Date(mechanism.metadata.modifiedAt).toLocaleDateString(),
    });
  }, [mechanism.metadata]);

  const handleInfoChange = (field: keyof ProjectMetadata, value: string) => {
    const updatedInfo = {
      ...projectInfo,
      [field]: value,
      modifiedAt: new Date().toLocaleDateString(),
    };
    setProjectInfo(updatedInfo);
    if (onProjectInfoChange) {
      // Convertir les dates en ISOString pour la sauvegarde
      onProjectInfoChange({
        ...updatedInfo,
        createdAt: mechanism.metadata.createdAt,
        modifiedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <TextField
          fullWidth
          label="Nom du projet"
          value={projectInfo.name}
          onChange={(e) => handleInfoChange("name", e.target.value)}
          size="small"
        />
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <TextField
          fullWidth
          label="Description"
          multiline
          rows={3}
          value={projectInfo.description}
          onChange={(e) => handleInfoChange("description", e.target.value)}
          size="small"
        />
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <TextField
          fullWidth
          label="Auteur·rice·x"
          value={projectInfo.author}
          onChange={(e) => handleInfoChange("author", e.target.value)}
          size="small"
        />
      </Box>

      <Box sx={{ mb: 1.5, mt: 1, display: "flex", gap: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Créé le :
          </Typography>
          <Typography variant="body2">{projectInfo.createdAt}</Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Modifié le :
          </Typography>
          <Typography variant="body2">{projectInfo.modifiedAt}</Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Version :
          </Typography>
          <Typography variant="body2">{projectInfo.version}</Typography>
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginRight: 1,
        }}
      >
        <Typography variant="body2">Nombre d'éléments :</Typography>
        <Typography variant="body1" fontWeight={500}>
          {mechanism.mechanicalElements.length}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginRight: 1,
        }}
      >
        <Typography variant="body2">Nombre de contraintes :</Typography>
        <Typography variant="body1" fontWeight={500}>
          {mechanism.constraintElements.length}
        </Typography>
      </Box>
    </Box>
  );
};

export default ProjectInfoSection;
