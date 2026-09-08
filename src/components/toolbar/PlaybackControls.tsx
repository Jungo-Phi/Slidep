import React from "react";
import {
  Box,
  Chip,
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
  HorizontalRule,
  JoinInner,
  KeyboardDoubleArrowDown,
  LastPage,
  Pause,
  PlayArrow,
  RestartAlt,
} from "@mui/icons-material";
import { t } from "../../i18n";
import {
  Action,
  AppMode,
  BeamStressLens,
  Mechanism,
  MechanismMetadata,
  SimulationSpeed,
} from "../../types";
import { RuntimeState } from "../../types/runtime-state";
import { at_recording_end } from "../solver/dynamics/simulation-engine";
import { set_sim_clock as setRuntimeState } from "../solver/dynamics/sim-clock";
import { simulationResetPatch } from "../solver/recording/use-simulation-playback";
import { OverlaysMenu } from "./OverlaysMenu";
import { ProjectHeader } from "./ProjectHeader";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";
import {
  TOP_BAR_CONTROL_HEIGHT,
  TOP_BAR_DIVIDER_SX,
  TOP_BAR_GROUP_GAP,
  TOP_BAR_SECTION_GAP,
  TOP_BAR_SLIM_BUTTON_SX,
} from "./toolbar-metrics";

// Simulation speed steps, slowest to fastest.
const SPEEDS: SimulationSpeed[] = [0.1, 0.25, 0.5, 1, 2, 4, 10];

interface PhysicsToggleProps {
  on: boolean;
  Icon: typeof KeyboardDoubleArrowDown;
  tooltip: string;
  onToggle: () => void;
}

/** One simulation switch (gravity, collisions, floor): icon only, filled when on. */
const PhysicsToggle: React.FC<PhysicsToggleProps> = ({
  on,
  Icon,
  tooltip,
  onToggle,
}) => (
  <Tooltip title={tooltip}>
    <Chip
      icon={<Icon sx={{ fontSize: "14px !important" }} />}
      size="small"
      clickable
      onClick={onToggle}
      variant="outlined"
      sx={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        borderColor: on ? "primary.main" : "text.primary",
        backgroundColor: on ? "primary.main" : "transparent",
        color: on ? "primary.contrastText" : "inherit",
        // The label's slot is what makes a chip a pill: dropped, the icon centres on its own.
        "& .MuiChip-label": { display: "none" },
        "& .MuiChip-icon": {
          margin: 0,
          color: on ? "primary.contrastText" : "inherit",
        },
        "&.MuiChip-clickable:hover": {
          backgroundColor: on ? "primary.dark" : "action.hover",
        },
      }}
    />
  </Tooltip>
);

interface PlaybackControlsProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata) => void;
  applyActions: (actions: Action[]) => void;
  condensed: boolean;
  tight: boolean;
  timeline: { hasRecording: boolean; atStart: boolean; atEnd: boolean };
  runtimeState: RuntimeState;
  resetToStart: () => void;
  handleSpaceKey: () => void;
  onOpenGallery: () => void;
  saveStatus: SaveStatus;
  beamStressLens: BeamStressLens;
  setBeamStressLens: (lens: BeamStressLens) => void;
  /** Tries a lens on without picking it, or — with `null` — puts the picked one back (`useStressLensPreview`). */
  previewBeamStressLens: (lens: BeamStressLens | null) => void;
  trajectoryDotted: boolean;
  setTrajectoryDotted: (dotted: boolean) => void;
  /** Rendered at the end of the right-hand section. */
  rightSlot?: React.ReactNode;
}

/** Mode selector, timeline scrub buttons, play/pause, speed, physics toggles, overlays. */
export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  applyActions,
  condensed,
  tight,
  timeline,
  runtimeState,
  resetToStart,
  handleSpaceKey,
  onOpenGallery,
  saveStatus,
  beamStressLens,
  setBeamStressLens,
  previewBeamStressLens,
  trajectoryDotted,
  setTrajectoryDotted,
  rightSlot,
}) => (
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
      {/* Mode selector */}
      <ToggleButtonGroup
        value={appMode}
        exclusive
        size="small"
        onChange={(_e, newMode: AppMode) => {
          if (!newMode) return;
          setAppMode(newMode);
          // Same tick as `setAppMode`, not left to the hook's own effect: switching directly between kinematic and dynamic (no edition in between) otherwise leaves a render where `appMode` already reads the new mode but `runtimeState.simulationSnapshots` still holds the other mode's snapshot shape — see `simulationResetPatch`.
          setRuntimeState((prev) => ({
            ...prev,
            ...simulationResetPatch(newMode, mechanism),
            isPlaying: false,
          }));
          if (newMode !== "edition")
            updateMetadata({
              ...mechanism.metadata,
              lastSimulationMode: newMode,
            });
        }}
        sx={{
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
        }}
      >
        <Tooltip title={t("mode_edition_tooltip")}>
          <ToggleButton value="edition">
            {t(condensed ? "mode_edition_short" : "mode_edition")}
          </ToggleButton>
        </Tooltip>

        <Tooltip title={t("mode_static_tooltip")}>
          <ToggleButton value="static" disabled>
            {t(condensed ? "mode_static_short" : "mode_static")}
          </ToggleButton>
        </Tooltip>

        <Tooltip title={t("mode_kinematic_tooltip")}>
          <ToggleButton value="kinematic">
            {t(condensed ? "mode_kinematic_short" : "mode_kinematic")}
          </ToggleButton>
        </Tooltip>

        <Tooltip title={t("mode_dynamic_tooltip")}>
          <ToggleButton value="dynamic">
            {t(condensed ? "mode_dynamic_short" : "mode_dynamic")}
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>

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

      <Tooltip title={t(runtimeState.isPlaying ? "pause" : "play")}>
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
          {runtimeState.isPlaying ? (
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
        const speedIdx = SPEEDS.indexOf(runtimeState.speed);
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
                    runtimeState.speed === 1
                      ? "text.secondary"
                      : "primary.main",
                  "&:hover": { backgroundColor: "action.hover" },
                }}
              >
                {runtimeState.speed}×
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

      {!condensed && <Divider flexItem sx={TOP_BAR_DIVIDER_SX} />}

      {/* Gravity / collisions / floor — reachable in edition too: these are settings of the mechanism, not of the run. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: TOP_BAR_GROUP_GAP,
        }}
      >
        <PhysicsToggle
          on={mechanism.simulation.gravity}
          Icon={KeyboardDoubleArrowDown}
          tooltip={t(
            mechanism.simulation.gravity ? "gravity_on" : "gravity_off",
          )}
          onToggle={() =>
            applyActions([
              { type: "SetGravity", enabled: !mechanism.simulation.gravity },
            ])
          }
        />
        <PhysicsToggle
          on={mechanism.simulation.collisions}
          Icon={JoinInner}
          tooltip={t(
            mechanism.simulation.collisions
              ? "collisions_on"
              : "collisions_off",
          )}
          onToggle={() =>
            applyActions([
              {
                type: "SetCollisions",
                enabled: !mechanism.simulation.collisions,
              },
            ])
          }
        />
        <PhysicsToggle
          on={mechanism.simulation.floor.enabled}
          Icon={HorizontalRule}
          tooltip={t(
            mechanism.simulation.floor.enabled ? "floor_on" : "floor_off",
          )}
          onToggle={() =>
            applyActions([
              {
                type: "SetFloorEnabled",
                enabled: !mechanism.simulation.floor.enabled,
              },
            ])
          }
        />
      </Box>

      <Divider
        flexItem
        sx={{
          ...TOP_BAR_DIVIDER_SX,
          mx: condensed ? 0.25 : TOP_BAR_DIVIDER_SX.mx,
        }}
      />

      {/* Display layers: what gets drawn.
          Reachable in edition too — picking a layer arms what the run will show, it does not draw anything by itself. */}
      <OverlaysMenu
        mechanicalElements={mechanism.mechanicalElements}
        applyActions={applyActions}
        beamStressLens={beamStressLens}
        onChangeBeamStressLens={setBeamStressLens}
        onPreviewBeamStressLens={previewBeamStressLens}
        trajectoryDotted={trajectoryDotted}
        onChangeTrajectoryDotted={setTrajectoryDotted}
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
