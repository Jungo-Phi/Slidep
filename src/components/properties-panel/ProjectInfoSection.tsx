import React, { useEffect, useState } from "react";
import { Box, Typography, TextField, Divider } from "@mui/material";
import { Mechanism, MechanismMetadata } from "../../types";
import { get_degrees_of_freedom } from "../solver/utils";
import { get_links, get_nodes } from "../solver/parsing";
import { format_date } from "../../utils/string-math";

interface ProjectInfoSectionProps {
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata) => void;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  mechanism,
  updateMetadata,
}) => {
  const [projectInfo, setProjectInfo] = useState<MechanismMetadata>({
    name: mechanism.metadata.name,
    description: mechanism.metadata.description,
    author: mechanism.metadata.author,
    version: mechanism.metadata.version,
    createdAt: mechanism.metadata.createdAt,
    modifiedAt: mechanism.metadata.modifiedAt,
    tags: mechanism.metadata.tags,
    thumbnail: mechanism.metadata.thumbnail,
  });

  useEffect(() => {
    setProjectInfo({
      name: mechanism.metadata.name,
      description: mechanism.metadata.description,
      author: mechanism.metadata.author,
      version: mechanism.metadata.version,
      createdAt: mechanism.metadata.createdAt,
      modifiedAt: mechanism.metadata.modifiedAt,
      tags: mechanism.metadata.tags,
      thumbnail: mechanism.metadata.thumbnail,
    });
  }, [mechanism.metadata]);

  const handleInfoChange = (field: keyof MechanismMetadata, value: string) => {
    const updatedInfo = {
      ...projectInfo,
      [field]: value,
    };
    setProjectInfo(updatedInfo);
    updateMetadata({ ...updatedInfo });
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
          <Typography variant="body2">
            {format_date(projectInfo.createdAt)}
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Modifié le :
          </Typography>
          <Typography variant="body2">
            {format_date(projectInfo.modifiedAt)}
          </Typography>
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
          alignItems: "center",
          gap: 1,
          mx: 1,
        }}
      >
        <Typography variant="body2">Éléments :</Typography>
        <Typography variant="body1" fontWeight={500}>
          {mechanism.mechanicalElements.length}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mx: 1,
        }}
      >
        <Typography variant="body2">Contraintes :</Typography>
        <Typography variant="body1" fontWeight={500}>
          {mechanism.constraintElements.length}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mx: 1,
        }}
      >
        <Typography variant="body2">Degrés de liberté :</Typography>
        <Typography variant="body1" fontWeight={500}>
          {get_degrees_of_freedom(
            get_nodes(mechanism.mechanicalElements),
            get_links(
              mechanism.mechanicalElements,
              mechanism.constraintElements,
            ),
          )}
        </Typography>
      </Box>
    </Box>
  );
};

export default ProjectInfoSection;
