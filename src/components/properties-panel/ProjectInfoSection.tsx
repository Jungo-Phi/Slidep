import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Mechanism, MechanismMetadata } from "../../types";
import { format_date, validate_mechanism } from "../../utils";

interface ProjectInfoSectionProps {
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata) => void;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  mechanism,
  updateMetadata,
}) => {
  const validationErrors = useMemo(
    () => validate_mechanism(mechanism),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mechanism.mechanicalElements, mechanism.constraintElements],
  );

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

      {validationErrors !== null && (
        <>
          <Divider />
          <Alert
            severity="error"
            icon={false}
            sx={{
              py: 0.5,
              borderRadius: 0,
              border: "none",
              boxShadow: "none",
              mb: -2,
            }}
          >
            <AlertTitle
              sx={{
                fontSize: "0.85rem",
                mb: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <ErrorOutlineIcon fontSize="small" />
              {validationErrors.length} erreur
              {validationErrors.length > 1 ? "s" : ""} détectée
              {validationErrors.length > 1 ? "s" : ""}
            </AlertTitle>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {validationErrors.map((err, i) => (
                <Box key={i} sx={{ fontSize: "0.72rem" }}>
                  • {err.message}
                </Box>
              ))}
            </Box>
          </Alert>
        </>
      )}
    </Box>
  );
};

export default ProjectInfoSection;
