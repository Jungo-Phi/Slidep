import React, { useState } from "react";
import {
  alpha,
  Box,
  ButtonBase,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import { Pause, PlayArrow } from "@mui/icons-material";
import { AppMode } from "../../types";
import { t } from "../../i18n";
import {
  CANVAS_CORNER_BOTTOM,
  PHONE_LAYOUT,
} from "../../constants/layout-specs";
import {
  set_sim_clock as setRuntimeState,
  useSimClockSelector,
} from "../solver/dynamics/sim-clock";
import { CLOCK_MIRROR_MS } from "../solver/recording/use-simulation-playback";
import { SimulationTimeline } from "../toolbar/SimulationTimeline";
import { SPEEDS } from "../toolbar/playback-actions";

/** The ×1 chip: the speed, opening the steps to pick another. */
const SpeedPill: React.FC = () => {
  const speed = useSimClockSelector((clock) => clock.speed, CLOCK_MIRROR_MS);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <ButtonBase
        aria-label={t("simulation_speed")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          width: PHONE_LAYOUT.BAR_HEIGHT,
          height: "100%",
          flexShrink: 0,
          fontSize: "0.85rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          // Nominal speed is a neutral state: only a setting away from it deserves to catch the eye.
          color: speed === 1 ? "text.secondary" : "primary.main",
        }}
      >
        {speed}×
      </ButtonBase>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {[...SPEEDS].reverse().map((step) => (
          <MenuItem
            key={step}
            selected={step === speed}
            onClick={() => {
              setRuntimeState((prev) => ({ ...prev, speed: step }));
              setAnchorEl(null);
            }}
            sx={{ minHeight: 44, justifyContent: "center" }}
          >
            {step}×
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

/**
 * The simulation's transport, a row above the bottom bar: play/pause, the timeline, the speed.
 * Shown in simulation only; in edition, play is the floating `PlayFab` instead.
 */
export const PhoneTransport: React.FC<{
  appMode: AppMode;
  onPlayPause: () => void;
  timelineTrackRef: React.RefObject<HTMLDivElement | null>;
}> = ({ appMode, onPlayPause, timelineTrackRef }) => {
  const isPlaying = useSimClockSelector((clock) => clock.isPlaying, CLOCK_MIRROR_MS);
  return (
    <Box
      sx={{
        height: PHONE_LAYOUT.TRANSPORT_HEIGHT,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        backgroundColor: "background.toolbar",
        borderTop: 1,
        borderColor: "dividers.toolbar",
      }}
    >
      <IconButton
        aria-label={t(isPlaying ? "pause" : "play")}
        onClick={onPlayPause}
        sx={{
          mx: 0.5,
          flexShrink: 0,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:hover": { bgcolor: "primary.dark" },
        }}
      >
        {isPlaying ? <Pause /> : <PlayArrow />}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <SimulationTimeline
          appMode={appMode}
          timelineTrackRef={timelineTrackRef}
          height={PHONE_LAYOUT.TRANSPORT_HEIGHT}
          divider={false}
        />
      </Box>
      <SpeedPill />
    </Box>
  );
};

/**
 * Play, floating in the canvas' bottom-left corner while editing: starts the simulation in the last mode used, as Space does on desktop.
 * The same discreet button as the ruler's in the opposite corner.
 */
export const PlayFab: React.FC<{ onPlay: () => void }> = ({ onPlay }) => (
  <IconButton
    aria-label={t("play")}
    onClick={onPlay}
    sx={{
      position: "absolute",
      left: 12,
      bottom: CANVAS_CORNER_BOTTOM,
      zIndex: 1,
      color: "primary.main",
      backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.07),
      "&:hover": {
        backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.14),
      },
    }}
  >
    <PlayArrow />
  </IconButton>
);
