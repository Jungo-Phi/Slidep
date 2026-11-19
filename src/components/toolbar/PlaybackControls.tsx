import React, { useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  KeyboardArrowDown,
  FirstPage,
  LastPage,
  Pause,
  PlayArrow,
  Public,
} from "@mui/icons-material";
import { t } from "../../i18n";
import {
  Action,
  AppMode,
  BeamStressLens,
  Mechanism,
  MechanismMetadata,
  SimulationSpeed,
  is_simulating,
} from "../../types";
import { useAmbient } from "../common/use-ambient";
import { recording_end, seek_to } from "../solver/recording/seek";
import {
  set_sim_clock as setRuntimeState,
  useSimClockSelector,
} from "../solver/dynamics/sim-clock";
import {
  CLOCK_MIRROR_MS,
  TimelineState,
  timeline_state,
} from "../solver/recording/use-simulation-playback";
import { OverlaysMenu } from "./OverlaysMenu";
import { ProjectHeader } from "./ProjectHeader";
import {
  change_app_mode,
  RUN_MODES,
  SPEEDS,
} from "./playback-actions";
import { PhysicsMenu } from "./RunSettingsMenus";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";
import {
  TOP_BAR_CONTROL_HEIGHT,
  TOP_BAR_DIVIDER_SX,
  TOP_BAR_GROUP_GAP,
  TOP_BAR_SECTION_GAP,
  TOP_BAR_SLIM_BUTTON_SX,
} from "./toolbar-metrics";

interface PhysicsButtonProps {
  appMode: AppMode;
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
  /** Drops the label, the icon alone standing for the menu. */
  condensed: boolean;
}

/**
 * The "Physique ▾" top-bar button, built as "Afficher ▾" is: gravity, the contacts and their values, all behind one menu.
 * A fixed icon rather than a state: no one of the settings stands for the others, and their states are read in the menu.
 */
const PhysicsButton: React.FC<PhysicsButtonProps> = ({
  appMode,
  mechanism,
  applyActions,
  condensed,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={condensed ? t("physics_settings") : ""}>
        <Button
          color="inherit"
          size="small"
          aria-label={t("physics_settings")}
          aria-haspopup="menu"
          aria-expanded={!!anchorEl}
          onClick={(e) => {
            const button = e.currentTarget;
            setAnchorEl((current) => (current ? null : button));
          }}
          startIcon={<Public sx={{ fontSize: "18px !important" }} />}
          endIcon={
            <KeyboardArrowDown
              sx={{ ml: -0.5, fontSize: "16px !important", opacity: 0.7 }}
            />
          }
          sx={{
            fontSize: "0.72rem",
            fontWeight: 600,
            textTransform: "none",
            px: 0.75,
            py: 0,
            minHeight: TOP_BAR_CONTROL_HEIGHT,
            minWidth: 0,
            letterSpacing: 0,
            "& .MuiButton-startIcon": { mr: condensed ? 0 : undefined },
          }}
        >
          {condensed ? null : t("physics_settings")}
        </Button>
      </Tooltip>
      <PhysicsMenu
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        nonModal
        appMode={appMode}
        mechanism={mechanism}
        applyActions={applyActions}
      />
    </>
  );
};

interface ModeSelectorProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  condensed: boolean;
}

const MODE_SELECTOR_SX = {
  mr: TOP_BAR_SECTION_GAP,
  "& .MuiToggleButton-root": {
    px: 1,
    py: 0.2,
    fontSize: "0.72rem",
    fontWeight: 600,
    textTransform: "none",
    color: "text.secondary",
    borderColor: "dividers.toolbar",
    "&.Mui-selected": {
      color: "primary.contrastText",
      backgroundColor: "primary.main",
      "&:hover, &.Mui-focusVisible": { backgroundColor: "primary.dark" },
    },
  },
} as const;

/** Statics, kinematics, dynamics: the mechanism at rest, or run one way or the other. */
const ModeSelector: React.FC<ModeSelectorProps> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  condensed,
}) => {
  return (
    <ToggleButtonGroup
      value={appMode}
      exclusive
      size="small"
      onChange={(_e, newMode: AppMode) => {
        if (newMode)
          change_app_mode(newMode, setAppMode, mechanism, updateMetadata);
      }}
      sx={MODE_SELECTOR_SX}
    >
      {RUN_MODES.map(({ mode, labelKey, shortKey, tooltipKey }) => {
        const full = t(labelKey);
        const short = t(shortKey);
        // A shortened name is spelt out in full at the head of its tooltip.
        const truncated = condensed && short !== full;
        return (
          <Tooltip
            key={mode}
            title={
              truncated ? (
                <>
                  <Box component="span" sx={{ display: "block", fontWeight: 700 }}>
                    {full}
                  </Box>
                  {t(tooltipKey)}
                </>
              ) : (
                t(tooltipKey)
              )
            }
          >
            <ToggleButton value={mode}>
              {condensed ? short : full}
            </ToggleButton>
          </Tooltip>
        );
      })}
    </ToggleButtonGroup>
  );
};

/** A key combination for a tooltip, the arrow drawn rather than typed: the arrow characters of most fonts sit too low and too thin beside the text. */
const ArrowKeys: React.FC<{ modifier?: string; direction: 1 | -1 }> = ({
  modifier,
  direction,
}) => {
  const Arrow = direction > 0 ? ArrowRight : ArrowLeft;
  return (
    <Box component="span" sx={{ whiteSpace: "nowrap" }}>
      {modifier && `${modifier}+`}
      <Arrow sx={{ fontSize: "1.75em", m: "-0.3em" }} />
    </Box>
  );
};

/** The jump to an end of the recording, and below it the steps the same arrow takes without Ctrl. */
const SeekTooltip: React.FC<{ direction: 1 | -1 }> = ({ direction }) => (
  <>
    {t(direction > 0 ? "go_to_end" : "go_to_start")} (
    <ArrowKeys modifier="Ctrl" direction={direction} />)
    <Box component="span" sx={{ display: "block", opacity: 0.75 }}>
      {t(direction > 0 ? "step_forward" : "step_back")}{" "}
      {"1 s "}
      (<ArrowKeys modifier="Shift" direction={direction} />)
    </Box>
    <Box component="span" sx={{ display: "block", opacity: 0.75 }}>
      {t(direction > 0 ? "step_forward" : "step_back")}{" "}
      {t("one_frame")} (<ArrowKeys direction={direction} />)
    </Box>
  </>
);

interface PlaybackControlsProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  applyActions: (actions: Action[]) => void;
  /** The mode names in their short form. */
  shortModes: boolean;
  /** The rules between the groups closed up, those around playback left out. */
  tightRules: boolean;
  /** The physics and layers menus without their labels. */
  condensed: boolean;
  handleSpaceKey: () => void;
  onOpenGallery: () => void;
  saveStatus: SaveStatus;
  /** Tries a lens on without picking it, or — with `null` — puts the picked one back (`useStressLensPreview`). */
  previewBeamStressLens: (lens: BeamStressLens | null) => void;
  trajectoryDotted: boolean;
  setTrajectoryDotted: (dotted: boolean) => void;
  /** Rendered at the end of the right-hand section. */
  rightSlot?: React.ReactNode;
}

type ScrubLimits = Pick<TimelineState, "hasRecording" | "atStart" | "atEnd">;

const same_scrub_limits = (a: ScrubLimits, b: ScrubLimits) =>
  a.hasRecording === b.hasRecording && a.atStart === b.atStart && a.atEnd === b.atEnd;

/** Mode selector, timeline scrub buttons, play/pause, speed, physics toggles, overlays. */
const PlaybackControlsView: React.FC<PlaybackControlsProps> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  applyActions,
  shortModes,
  tightRules,
  condensed,
  handleSpaceKey,
  onOpenGallery,
  saveStatus,
  previewBeamStressLens,
  trajectoryDotted,
  setTrajectoryDotted,
  rightSlot,
}) => {
  useAmbient();
  const isPlaying = useSimClockSelector((clock) => clock.isPlaying, CLOCK_MIRROR_MS);
  const speed = useSimClockSelector((clock) => clock.speed, CLOCK_MIRROR_MS);
  const timeline = useSimClockSelector(
    (clock): ScrubLimits => timeline_state(appMode, clock),
    CLOCK_MIRROR_MS,
    same_scrub_limits,
  );
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: TOP_BAR_GROUP_GAP,
          minWidth: 0,
        }}
      >
        <ProjectHeader
          onOpenGallery={onOpenGallery}
          projectName={mechanism.metadata.name}
          saveStatus={saveStatus}
        />
      </Box>

      {/* Centre section — everything that drives or reflects the run: mode, playback, speed, physics settings and layers. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: TOP_BAR_GROUP_GAP,
        }}
      >
        <ModeSelector
          appMode={appMode}
          setAppMode={setAppMode}
          mechanism={mechanism}
          updateMetadata={updateMetadata}
          condensed={shortModes}
        />

        {!tightRules && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

        {/* Play/Pause stays live; the other buttons go dead at rest or at the ends of the recording. */}
        <Tooltip title={<SeekTooltip direction={-1} />}>
          <span>
            <IconButton
              size="small"
              color="inherit"
              disabled={!is_simulating(appMode) || timeline.atStart}
              onClick={() => seek_to(0, true)}
              sx={TOP_BAR_SLIM_BUTTON_SX}
            >
              <FirstPage sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title={t(isPlaying ? "pause" : "play")}>
          <IconButton
            size="small"
            onClick={handleSpaceKey}
            data-hint-anchor="play"
            sx={{
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
              flexShrink: 0,
            }}
          >
            {isPlaying ? (
              <Pause sx={{ fontSize: 20 }} />
            ) : (
              <PlayArrow sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title={<SeekTooltip direction={1} />}>
          <span>
            <IconButton
              size="small"
              color="inherit"
              disabled={!is_simulating(appMode) || timeline.atEnd}
              sx={TOP_BAR_SLIM_BUTTON_SX}
              onClick={() => seek_to(recording_end(), true)}
            >
              <LastPage sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        {!tightRules && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

        {/* Simulation speed stepper */}
        {(() => {
          const speedIdx = SPEEDS.indexOf(speed);
          const setSpeed = (s: SimulationSpeed) =>
            setRuntimeState((prev) => ({ ...prev, speed: s }));
          return (
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Tooltip title={t("slow_down")}>
                <span>
                  <IconButton
                    size="small"
                    color="inherit"
                    disabled={speedIdx <= 0}
                    onClick={() => setSpeed(SPEEDS[speedIdx - 1])}
                    sx={TOP_BAR_SLIM_BUTTON_SX}
                  >
                    <ChevronLeft sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t("reset_speed")}>
                <Box
                  component="button"
                  onClick={() => setSpeed(1)}
                  sx={{
                    all: "unset",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: TOP_BAR_CONTROL_HEIGHT,
                    minHeight: TOP_BAR_CONTROL_HEIGHT,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                    borderRadius: 1,
                    // Nominal speed is a neutral state: only a setting away from it deserves to catch the eye.
                    color:
                      speed === 1
                        ? "text.secondary"
                        : "primary.main",
                    // `all: unset` takes the focus outline with it: the keyboard gets the hover's ground instead.
                    "&:hover, &:focus-visible": { backgroundColor: "action.hover" },
                  }}
                >
                  {speed}×
                </Box>
              </Tooltip>
              <Tooltip title={t("speed_up")}>
                <span>
                  <IconButton
                    size="small"
                    color="inherit"
                    disabled={speedIdx >= SPEEDS.length - 1}
                    onClick={() => setSpeed(SPEEDS[speedIdx + 1])}
                    sx={TOP_BAR_SLIM_BUTTON_SX}
                  >
                    <ChevronRight sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          );
        })()}

        <Divider
          flexItem
          sx={{
            ...TOP_BAR_DIVIDER_SX,
            mx: tightRules ? 0 : TOP_BAR_DIVIDER_SX.mx,
          }}
        />

        {/* Gravity / collisions / floor — reachable in edition too: these are settings of the mechanism, not of the run. */}
        <PhysicsButton
          appMode={appMode}
          mechanism={mechanism}
          applyActions={applyActions}
          condensed={condensed}
        />

        <Divider
          flexItem
          sx={{
            ...TOP_BAR_DIVIDER_SX,
            mx: tightRules ? 0.25 : TOP_BAR_DIVIDER_SX.mx,
          }}
        />

        {/* Display layers: what gets drawn.
            Reachable in edition too — picking a layer arms what the run will show, it does not draw anything by itself. */}
        <OverlaysMenu
          mechanicalElements={mechanism.mechanicalElements}
          applyActions={applyActions}
          beamStressLens={mechanism.simulation.beamStressLens}
          onChangeBeamStressLens={(lens) =>
            applyActions([
              {
                type: "SetBeamStressLens",
                newValue: lens,
                oldValue: mechanism.simulation.beamStressLens,
              },
            ])
          }
          onPreviewBeamStressLens={previewBeamStressLens}
          trajectoryDotted={trajectoryDotted}
          onChangeTrajectoryDotted={setTrajectoryDotted}
          supportReactions={mechanism.simulation.supportReactions}
          onChangeSupportReactions={(on) =>
            applyActions([{ type: "SetSupportReactions", enabled: on }])
          }
          condensed={condensed}
        />

        <Divider flexItem sx={{ mx: tightRules ? 0.75 : 2 }} />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {rightSlot}
      </Box>
    </>
  );
};

export const PlaybackControls = React.memo(PlaybackControlsView);
