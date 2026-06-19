import React, { useEffect, useState } from "react";
import { Box, Typography, TextField, Divider } from "@mui/material";
import { Mechanism, MechanismMetadata } from "../../types";
import { get_degrees_of_freedom } from "../solver/utils";
import { get_links, get_nodes } from "../solver/parsing";
import { format_date } from "../../utils";

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
    <Box sx={{ my: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          mx: 2,
        }}
      >
        <TextField
          fullWidth
          label="Nom du projet"
          value={projectInfo.name}
          onChange={(e) => handleInfoChange("name", e.target.value)}
          size="small"
        />

        <TextField
          fullWidth
          label="Description"
          multiline
          rows={3}
          value={projectInfo.description}
          onChange={(e) => handleInfoChange("description", e.target.value)}
          size="small"
        />

        <TextField
          fullWidth
          label="Auteur·rice·x"
          value={projectInfo.author}
          onChange={(e) => handleInfoChange("author", e.target.value)}
          size="small"
        />
      </Box>

      <Box
        sx={{
          m: 2,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Box>
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
        <Box>
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
        <Box>
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

      <Divider />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          m: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
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
          }}
        >
          <Typography variant="body2">Contraintes :</Typography>
          <Typography variant="body1" fontWeight={500}>
            {mechanism.constraintElements.length}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default ProjectInfoSection;
