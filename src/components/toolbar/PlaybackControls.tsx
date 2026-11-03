import React, { useState } from "react";
import {
  Box,
  Divider,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import {
  ChevronLeft,
  ChevronRight,
  FirstPage,
  LastPage,
  Pause,
  PlayArrow,
  Public,
  RestartAlt,
} from "@mui/icons-material";
import { StringKey, t } from "../../i18n";
import {
  Action,
  AppMode,
  BeamStressLens,
  Mechanism,
  MechanismMetadata,
  SimulationSpeed,
} from "../../types";
import { useAmbient } from "../common/use-ambient";
import { at_recording_end } from "../solver/dynamics/simulation-engine";
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
  usePhysicsSwitches,
} from "./playback-actions";
import {
  MenuTrigger,
  ModeMenu,
  PhysicsMenu,
  PhysicsToggle,
} from "./RunSettingsMenus";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";
import {
  TOP_BAR_CONTROL_HEIGHT,
  TOP_BAR_DIVIDER_SX,
  TOP_BAR_GROUP_GAP,
  TOP_BAR_SECTION_GAP,
  TOP_BAR_SLIM_BUTTON_SX,
} from "./toolbar-metrics";

interface PhysicsTogglesProps {
  appMode: AppMode;
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
  /** Folds the three switches behind a single button opening them as a menu. */
  folded: boolean;
}

/** Gravity, collisions and floor, as they stand at the instant on screen: what they show is what they flip. */
const PhysicsToggles: React.FC<PhysicsTogglesProps> = ({
  appMode,
  mechanism,
  applyActions,
  folded,
}) => {
  const switches = usePhysicsSwitches(appMode, mechanism);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  if (folded)
    return (
      <>
        {/* A fixed icon for the three settings together: none of them stands for the others, and their states are read in the menu. */}
        <MenuTrigger
          label={t("physics_settings")}
          expanded={!!anchorEl}
          onToggle={(button) =>
            setAnchorEl((current) => (current ? null : button))
          }
        >
          <Public sx={{ fontSize: 20 }} />
        </MenuTrigger>
        <PhysicsMenu
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          nonModal
          switches={switches}
          applyActions={applyActions}
        />
      </>
    );
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: TOP_BAR_GROUP_GAP }}>
      {switches.map((row) => (
        <PhysicsToggle
          key={row.iconName}
          on={row.on}
          iconName={row.iconName}
          tooltip={t(row.stateKey)}
          onToggle={() => applyActions([row.toggle])}
        />
      ))}
    </Box>
  );
};

interface ModeSelectorProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  condensed: boolean;
  /** Shows only the current mode, the others behind its menu. */
  folded: boolean;
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
      "&:hover": { backgroundColor: "primary.dark" },
    },
  },
} as const;

/** Every mode the unfolded selector shows, statics included, greyed out until it exists. */
const MODE_BUTTONS: {
  mode: "edition" | "static" | "kinematic" | "dynamic";
  tooltipKey: StringKey;
  disabled?: boolean;
}[] = [
  { mode: "edition", tooltipKey: "mode_edition_tooltip" },
  { mode: "static", tooltipKey: "mode_static_tooltip", disabled: true },
  { mode: "kinematic", tooltipKey: "mode_kinematic_tooltip" },
  { mode: "dynamic", tooltipKey: "mode_dynamic_tooltip" },
];

/** Edition, statics, kinematics, dynamics: what the app is doing. */
const ModeSelector: React.FC<ModeSelectorProps> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  condensed,
  folded,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  if (folded) {
    const current = RUN_MODES.find((m) => m.mode === appMode) ?? RUN_MODES[0];
    return (
      <>
        <Box sx={{ mr: TOP_BAR_SECTION_GAP }}>
          <MenuTrigger
            label={t(current.labelKey)}
            tooltip={t(current.tooltipKey)}
            expanded={!!anchorEl}
            onToggle={(button) =>
              setAnchorEl((open) => (open ? null : button))
            }
            outlined
          >
            <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 700 }}>
              {t(current.labelKey)}
            </Box>
          </MenuTrigger>
        </Box>
        <ModeMenu
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          nonModal
          appMode={appMode}
          setAppMode={setAppMode}
          mechanism={mechanism}
          updateMetadata={updateMetadata}
        />
      </>
    );
  }
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
      {MODE_BUTTONS.map(({ mode, tooltipKey, disabled }) => {
        const full = t(`mode_${mode}`);
        const short = t(`mode_${mode}_short`);
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
            <ToggleButton value={mode} disabled={disabled}>
              {condensed ? short : full}
            </ToggleButton>
          </Tooltip>
        );
      })}
    </ToggleButtonGroup>
  );
};

interface PlaybackControlsProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  applyActions: (actions: Action[]) => void;
  condensed: boolean;
  tight: boolean;
  /** Shows only the current mode, the others behind its menu: narrower still than `tight`, the mode being read at a glance. */
  foldMode: boolean;
  resetToStart: () => void;
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
  condensed,
  tight,
  foldMode,
  resetToStart,
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
          tight={tight}
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
          condensed={condensed}
          folded={foldMode}
        />

        {!condensed && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

        <Tooltip title={t("reset")}>
          <span>
            <IconButton
              size="small"
              color="inherit"
              disabled={appMode === "edition" || !timeline.hasRecording}
              onClick={resetToStart}
              sx={{
                color: "primary.main",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <RestartAlt sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        {!condensed && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

        {/* Play/Pause stays live; the other buttons go dead in edition mode or at the ends of the recording. */}
        <Tooltip title={t("go_to_start")}>
          <span>
            <IconButton
              size="small"
              color="inherit"
              disabled={appMode === "edition" || timeline.atStart}
              onClick={() =>
                setRuntimeState((prev) => ({
                  ...prev,
                  time: 0,
                  isPlaying: false,
                  // Nothing recorded yet ⇒ the start IS the end.
                  scrubbed: !at_recording_end(prev.simulationSnapshots, 0),
                }))
              }
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

        <Tooltip title={t("go_to_end")}>
          <span>
            <IconButton
              size="small"
              color="inherit"
              disabled={appMode === "edition" || timeline.atEnd}
              sx={TOP_BAR_SLIM_BUTTON_SX}
              onClick={() =>
                setRuntimeState((prev) => {
                  const snaps = prev.simulationSnapshots;
                  const maxT = snaps.length > 0 ? snaps[snaps.length - 1].t : 0;
                  // The end by construction: playing from here records on.
                  return {
                    ...prev,
                    time: maxT,
                    isPlaying: false,
                    scrubbed: false,
                  };
                })
              }
            >
              <LastPage sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        {!condensed && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

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
                    "&:hover": { backgroundColor: "action.hover" },
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
            mx: tight ? -0.25 : condensed ? 0 : TOP_BAR_DIVIDER_SX.mx,
          }}
        />

        {/* Gravity / collisions / floor — reachable in edition too: these are settings of the mechanism, not of the run. */}
        <PhysicsToggles
          appMode={appMode}
          mechanism={mechanism}
          applyActions={applyActions}
          folded={tight}
        />

        <Divider
          flexItem
          sx={{
            ...TOP_BAR_DIVIDER_SX,
            mx: tight ? -0.25 : condensed ? 0.25 : TOP_BAR_DIVIDER_SX.mx,
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
