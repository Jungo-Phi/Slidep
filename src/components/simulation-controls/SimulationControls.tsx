import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Slider,
  Tooltip,
  Chip,
} from "@mui/material";
import {
  Pause as PauseIcon,
  Timeline as TrajectoryIcon,
  ShowChart as ForceIcon,
  RotateRight as MomentIcon,
  Replay as ReplayIcon,
} from "@mui/icons-material";

import playIconUrl from "../../assets/icons/palette/play.svg";
import stopIconUrl from "../../assets/icons/palette/stop.svg";
import { SimulationStatus } from "../../types";

const SPEED_MARKS = [
  { value: -2, label: "0.25x" },
  { value: -1, label: "0.5x" },
  { value: 0, label: "1x" },
  { value: 1, label: "2x" },
  { value: 2, label: "4x" },
];

const currentTime = 0;
const fps = 60;

/**
 * SimulationControls component
 */
export const SimulationControls: React.FC = () => {
  const [speed, setSpeed] = useState<number>(0);
  const handleSpeedChange = (_: Event, value: number) => {
    setSpeed(value);
  };

  const [showTrajectories, setShowTrajectories] = useState<boolean>(true);
  const toggleTrajectories = () => {
    setShowTrajectories(!showTrajectories);
  };
  const [showForces, setShowForces] = useState<boolean>(true);
  const toggleForces = () => {
    setShowForces(!showForces);
  };
  const [showMoments, setShowMoments] = useState<boolean>(false);
  const toggleMoments = () => {
    setShowMoments(!showMoments);
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const [simulationStatus, setSimulationStatus] =
    useState<SimulationStatus>("paused");
  const handlePlayPause = () => {
    setSimulationStatus(simulationStatus === "running" ? "paused" : "running");
  };
  const onReset = () => {
    setSimulationStatus("stopped");
  };
  const getStatusColor = (): "default" | "primary" | "success" | "warning" => {
    switch (simulationStatus) {
      case "running":
        return "success";
      case "paused":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Chip
          label={simulationStatus.toUpperCase()}
          color={getStatusColor()}
          size="small"
        />
        <Typography variant="body2" color="text.secondary">
          {formatTime(currentTime)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {fps} FPS
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <Tooltip title={simulationStatus === "running" ? "Pause" : "Démarrer"}>
          <IconButton
            onClick={handlePlayPause}
            color="primary"
            size="medium"
            sx={{
              backgroundColor:
                simulationStatus === "stopped" ? "" : "primary.main",
              color: "primary.contrastText",
              "&:hover": {
                backgroundColor:
                  simulationStatus === "stopped" ? "" : "primary.dark",
              },
            }}
          >
            {simulationStatus === "running" ? (
              <PauseIcon
                sx={{
                  width: 28,
                  height: 28,
                }}
              />
            ) : (
              <Box
                component="img"
                src={playIconUrl}
                alt="Démarrer"
                sx={{
                  width: 28,
                  height: 28,
                  display: "block",
                  filter:
                    simulationStatus === "stopped"
                      ? "none"
                      : "brightness(0) invert(1)",
                }}
              />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Arrêter">
          <IconButton
            onClick={onReset}
            size="medium"
            sx={{
              backgroundColor:
                simulationStatus === "stopped" ? "primary.main" : "",
              "&:hover": {
                backgroundColor:
                  simulationStatus === "stopped" ? "primary.dark" : "",
              },
            }}
          >
            <Box
              component="img"
              src={stopIconUrl}
              alt="Arrêter"
              sx={{
                width: 28,
                height: 28,
                display: "block",
                filter:
                  simulationStatus === "stopped"
                    ? "brightness(0) invert(1)"
                    : "none",
              }}
            />
          </IconButton>
        </Tooltip>

        <Tooltip title="Réinitialiser">
          <IconButton onClick={onReset} size="medium" color="inherit">
            <ReplayIcon sx={{ fontSize: 28 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Slider
        value={speed}
        onChange={handleSpeedChange}
        min={-2}
        max={2}
        step={null}
        marks={SPEED_MARKS}
        valueLabelFormat={(value) => `${value}x`}
        sx={{ width: 200 }}
      />

      <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
        <Tooltip title="Afficher les trajectoires">
          <IconButton
            onClick={toggleTrajectories}
            color={showTrajectories ? "primary" : "default"}
            size="small"
          >
            <TrajectoryIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Afficher les forces">
          <IconButton
            onClick={toggleForces}
            color={showForces ? "primary" : "default"}
            size="small"
          >
            <ForceIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Afficher les moments">
          <IconButton
            onClick={toggleMoments}
            color={showMoments ? "primary" : "default"}
            size="small"
          >
            <MomentIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default SimulationControls;
