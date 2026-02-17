/**
 * SimulationControls component
 * Controls for running and managing simulations
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Slider,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material';
import {
  Pause as PauseIcon,
  Timeline as TrajectoryIcon,
  ShowChart as ForceIcon,
  RotateRight as MomentIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';

import playIconUrl from '../../assets/icons/palette/play.svg';
import stopIconUrl from '../../assets/icons/palette/stop.svg';

import { SimulationSpeed } from '../../types';

/**
 * Speed marks for slider
 */
const SPEED_MARKS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];

/**
 * SimulationControls component
 */
export const SimulationControls: React.FC<{ isTopBar?: boolean }> = ({ isTopBar = false }) => {
  /**
   * Handle play/pause toggle
   */
  const handlePlayPause = () => {
    if (status === 'running') {
      pause();
    } else if (status === 'paused') {
      resume();
    } else {
      start();
    }
  };

  /**
   * Handle speed change
   */
  const handleSpeedChange = (_: Event, value: number | number[]) => {
    setSpeed(value as SimulationSpeed);
  };

  /**
   * Format time display
   */
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  /**
   * Get status color
   */
  const getStatusColor = (): 'default' | 'primary' | 'success' | 'warning' => {
    switch (status) {
      case 'running':
        return 'success';
      case 'paused':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (isTopBar) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={status === 'running' ? 'Pause' : 'Démarrer'}>
          <IconButton
            onClick={handlePlayPause}
            color="inherit"
            size="small"
          >
            {status === 'running' ? (
              <PauseIcon fontSize="small" />
            ) : (
              <Box
                component="img"
                src={playIconUrl}
                alt="Démarrer"
                sx={{
                  width: 20,
                  height: 20,
                  display: 'block',
                }}
              />
            )}
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Arrêter">
          <IconButton
            onClick={stop}
            disabled={status === 'stopped'}
            color="inherit"
            size="small"
          >
            <Box
              component="img"
              src={stopIconUrl}
              alt="Arrêter"
              sx={{ width: 20, height: 20, display: 'block', opacity: (status === 'stopped') ? 0.5 : 1 }}
            />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Réinitialiser">
          <IconButton onClick={reset} color="inherit" size="small">
            <ReplayIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <Box sx={{ ml: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right', fontWeight: 500 }}>
            {formatTime(currentTime)}
          </Typography>
          <Chip
            label={`${speed}x`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.65rem', borderColor: 'rgba(0,0,0,0.1)' }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 400,
        padding: 2,
        zIndex: 1000,
      }}
    >
      {/* Status and time */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Chip
          label={status.toUpperCase()}
          color={getStatusColor()}
          size="small"
        />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {formatTime(currentTime)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {fps} FPS
          </Typography>
        </Box>
      </Box>

      {/* Main controls */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
        <Tooltip title={status === 'running' ? 'Pause' : 'Démarrer'}>
          <IconButton
            onClick={handlePlayPause}
            color="primary"
            size="large"
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {status === 'running' ? (
              <PauseIcon />
            ) : (
              <Box
                component="img"
                src={playIconUrl}
                alt="Démarrer"
                sx={{
                  width: 28,
                  height: 28,
                  display: 'block',
                  filter: 'brightness(0) invert(1)',
                }}
              />
            )}
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Arrêter">
          <IconButton
            onClick={stop}
            disabled={status === 'stopped'}
            size="large"
          >
            <Box
              component="img"
              src={stopIconUrl}
              alt="Arrêter"
              sx={{ width: 28, height: 28, display: 'block' }}
            />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Réinitialiser">
          <IconButton onClick={reset} size="large">
            <ReplayIcon sx={{ fontSize: 28 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Speed control */}
      <Box sx={{ px: 2 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Vitesse de simulation
        </Typography>
        <Slider
          value={speed}
          onChange={handleSpeedChange}
          min={0.25}
          max={4}
          step={null}
          marks={SPEED_MARKS}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => `${value}x`}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Visualization toggles */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
        <Tooltip title="Afficher les trajectoires">
          <IconButton
            onClick={toggleTrajectories}
            color={showTrajectories ? 'primary' : 'default'}
            size="small"
          >
            <TrajectoryIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Afficher les forces">
          <IconButton
            onClick={toggleForces}
            color={showForces ? 'primary' : 'default'}
            size="small"
          >
            <ForceIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Afficher les moments">
          <IconButton
            onClick={toggleMoments}
            color={showMoments ? 'primary' : 'default'}
            size="small"
          >
            <MomentIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default SimulationControls;
