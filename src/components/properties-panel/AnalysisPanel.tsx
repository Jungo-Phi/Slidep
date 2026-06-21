import React from "react";
import {
  Box,
  Typography,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
  Button,
} from "@mui/material";
import {
  Timeline,
  ShowChart,
  RotateRight,
  Visibility,
  Add,
} from "@mui/icons-material";
import { AppMode, Mechanism } from "../../types";
import { get_degrees_of_freedom } from "../solver/utils";
import { get_links, get_nodes } from "../solver/parsing";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  appMode: AppMode;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mechanism,
  appMode,
}) => {
  const [overlays, setOverlays] = React.useState({
    forces: false,
    velocities: false,
    constraints: false,
    path: false,
  });

  const [tags, setTags] = React.useState<string[]>([]);

  const toggleOverlay = (key: keyof typeof overlays) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addTag = () => {
    const metrics = ["Vitesse", "Force", "Position", "Angle"];
    const randomMetric = metrics[Math.floor(Math.random() * metrics.length)];
    setTags((prev) => [...prev, randomMetric]);
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const ddl = get_degrees_of_freedom(
    get_nodes(mechanism.mechanicalElements),
    get_links(mechanism.mechanicalElements, mechanism.constraintElements),
  );

  const ddlStatus =
    ddl === 0
      ? "Isostatique"
      : ddl > 0
        ? `Hyperstatique (${ddl} DDL)`
        : "Mécanisme";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      {/* DDL Indicator */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Degrés de liberté
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            borderRadius: 1,
            backgroundColor: "action.hover",
          }}
        >
          <Typography variant="h6" fontWeight={700} color="primary">
            DDL = {ddl}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ddlStatus}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Overlays */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Overlays visuels
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.forces}
                onChange={() => toggleOverlay("forces")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ShowChart fontSize="small" />
                <Typography variant="body2">Forces de réaction</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.velocities}
                onChange={() => toggleOverlay("velocities")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Timeline fontSize="small" />
                <Typography variant="body2">Vitesses</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.constraints}
                onChange={() => toggleOverlay("constraints")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <RotateRight fontSize="small" />
                <Typography variant="body2">Contraintes (MPa)</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.path}
                onChange={() => toggleOverlay("path")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Visibility fontSize="small" />
                <Typography variant="body2">Path (trajectoires)</Typography>
              </Box>
            }
          />
        </Box>
      </Box>

      <Divider />

      {/* App Mode */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {appMode}
        </Typography>
      </Box>

      <Divider />

      {/* Balises / Mesures */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Balises actives
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {tags.length === 0 && (
            <Typography variant="caption" color="text.disabled">
              Aucune balise active
            </Typography>
          )}
          {tags.map((tag, index) => (
            <Chip
              key={index}
              label={tag}
              size="small"
              onDelete={() => removeTag(index)}
              icon={<ShowChart fontSize="small" />}
            />
          ))}
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={addTag}
          fullWidth
        >
          Ajouter une mesure
        </Button>
      </Box>

      <Divider />

      {/* Graphiques placeholder */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Graphiques
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            backgroundColor: "action.hover",
            textAlign: "center",
          }}
        >
          <Typography variant="caption" color="text.disabled">
            Les graphiques avancés arrivent en Phase 2
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default AnalysisPanel;
