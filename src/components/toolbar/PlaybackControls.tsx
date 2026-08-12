import React from "react";
import { Box, Chip, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import {
  ChevronLeft,
  ChevronRight,
  FirstPage,
  JoinInner,
  KeyboardDoubleArrowDown,
  LastPage,
  Pause,
  PlayArrow,
  RestartAlt,
} from "@mui/icons-material";
import { t } from "../../i18n";
import { Action, AppMode, Mechanism, MechanismMetadata, SimulationConfig, SimulationSpeed } from "../../types";
import { RuntimeState } from "../../types/runtime-state";
import { at_recording_end } from "../solver/kinematic-simulation";
import { set_sim_clock as setRuntimeState } from "../solver/sim-clock";
import { OverlaysMenu } from "./OverlaysMenu";
import { ProjectHeader } from "./ProjectHeader";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";

// Crans de vitesse de simulation, du plus lent au plus rapide.
const SPEEDS: SimulationSpeed[] = [0.1, 0.25, 0.5, 1, 2, 4, 10];

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
  simulationConfig: SimulationConfig;
  setSimulationConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  onOpenGallery: () => void;
  saveStatus: SaveStatus;
  /** Rendered at the end of the right-hand half, sharing its `flex: 1` — the
   *  play button must stay centered on the two halves together. */
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
  simulationConfig,
  setSimulationConfig,
  onOpenGallery,
  saveStatus,
  rightSlot,
}) => (
  <>
    {/* Les deux moitiés se partagent à parts égales la place laissée par
        le bouton play, qui tombe ainsi au centre exact de la fenêtre —
        donc de la grille, que le canvas occupe en pleine largeur. */}
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: tight ? 0.25 : 0.75,
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <ProjectHeader
        tight={tight}
        onOpenGallery={onOpenGallery}
        projectName={mechanism.metadata.name}
        saveStatus={saveStatus}
      />

      {/* Sélecteur de mode */}
      <ToggleButtonGroup
        value={appMode}
        exclusive
        size="small"
        onChange={(_e, newMode: AppMode) => {
          if (!newMode) return;
          setAppMode(newMode);
          if (newMode !== "edition")
            updateMetadata({ ...mechanism.metadata, lastSimulationMode: newMode });
        }}
        sx={{
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
        <Tooltip disableInteractive title={t("mode_edition_tooltip")}>
          <ToggleButton value="edition">
            {t(condensed ? "mode_edition_short" : "mode_edition")}
          </ToggleButton>
        </Tooltip>

        <Tooltip disableInteractive title={t("mode_static_tooltip")}>
          <ToggleButton value="static" disabled>
            {t(condensed ? "mode_static_short" : "mode_static")}
          </ToggleButton>
        </Tooltip>

        <Tooltip disableInteractive title={t("mode_kinematic_tooltip")}>
          <ToggleButton value="kinematic">
            {t(condensed ? "mode_kinematic_short" : "mode_kinematic")}
          </ToggleButton>
        </Tooltip>

        <Tooltip disableInteractive title={t("mode_dynamic_tooltip")}>
          <ToggleButton value="dynamic" disabled>
            {t(condensed ? "mode_dynamic_short" : "mode_dynamic")}
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>

      {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

      <Tooltip disableInteractive title={t("toolbar_reset")}>
        <span>
          <IconButton
            size="small"
            color="inherit"
            disabled={appMode === "edition" || !timeline.hasRecording}
            onClick={resetToStart}
            sx={{ p: 0.4, color: "primary.main", "&:hover": { backgroundColor: "action.hover" } }}
          >
            <RestartAlt sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>

      {!tight && <Divider flexItem sx={{ mx: 0.2 }} />}

      {/* Contrôles temporels — Play/Pause toujours actif ; les autres
          boutons sont désactivés en mode Édition ou en bout de course. */}
      <Tooltip disableInteractive title={t("toolbar_go_to_start")}>
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
                scrubbed: !at_recording_end(prev.kinematicSnapshots, 0),
              }))
            }
            sx={{ p: 0.4 }}
          >
            <FirstPage sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>

    <Tooltip disableInteractive title={t(runtimeState.isPlaying ? "toolbar_pause" : "toolbar_play")}>
      <IconButton
        size="small"
        onClick={handleSpaceKey}
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:hover": { bgcolor: "primary.dark" },
          p: 0.5,
          flexShrink: 0,
        }}
      >
        {runtimeState.isPlaying ? <Pause sx={{ fontSize: 20 }} /> : <PlayArrow sx={{ fontSize: 20 }} />}
      </IconButton>
    </Tooltip>

    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: tight ? 0.25 : 0.75,
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <Tooltip disableInteractive title={t("toolbar_go_to_end")}>
        <span>
          <IconButton
            size="small"
            color="inherit"
            disabled={appMode === "edition" || timeline.atEnd}
            sx={{ p: 0.4 }}
            onClick={() =>
              setRuntimeState((prev) => {
                const snaps = prev.kinematicSnapshots;
                const maxT = snaps.length > 0 ? snaps[snaps.length - 1].t : 0;
                // The end by construction: playing from here records on.
                return { ...prev, time: maxT, isPlaying: false, scrubbed: false };
              })
            }
          >
            <LastPage sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>

      {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

      {/* Stepper de vitesse de simulation */}
      {(() => {
        const speedIdx = SPEEDS.indexOf(runtimeState.speed);
        const setSpeed = (s: SimulationSpeed) => setRuntimeState((prev) => ({ ...prev, speed: s }));
        const disabled = appMode === "edition";
        return (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              opacity: disabled ? 0.3 : 1,
              pointerEvents: disabled ? "none" : "auto",
              transition: "opacity 0.2s ease",
            }}
          >
            <Tooltip disableInteractive title={t("toolbar_slow_down")}>
              <span>
                <IconButton
                  size="small"
                  color="inherit"
                  disabled={speedIdx <= 0}
                  onClick={() => setSpeed(SPEEDS[speedIdx - 1])}
                  sx={{ px: 0.2, py: 0.5, borderRadius: 1 }}
                >
                  <ChevronLeft sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip disableInteractive title={t("toolbar_reset_speed")}>
              <Box
                component="button"
                onClick={() => setSpeed(1)}
                sx={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 28,
                  // Matches the height of the top-bar icon buttons (20px icon + p: 0.4).
                  minHeight: 26.4,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  borderRadius: 1,
                  // La vitesse nominale est un état neutre : seul un
                  // réglage non standard mérite d'attirer l'œil.
                  color: runtimeState.speed === 1 ? "text.secondary" : "primary.main",
                  "&:hover": { backgroundColor: "action.hover" },
                }}
              >
                {runtimeState.speed}×
              </Box>
            </Tooltip>
            <Tooltip disableInteractive title={t("toolbar_speed_up")}>
              <span>
                <IconButton
                  size="small"
                  color="inherit"
                  disabled={speedIdx >= SPEEDS.length - 1}
                  onClick={() => setSpeed(SPEEDS[speedIdx + 1])}
                  sx={{ px: 0.2, py: 0.5, borderRadius: 1 }}
                >
                  <ChevronRight sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      })()}

      {!tight && <Divider flexItem sx={{ mx: 0.5 }} />}

      {/* Toggles Gravité / Collisions */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          opacity: appMode === "edition" ? 0.3 : 1,
          pointerEvents: appMode === "edition" ? "none" : "auto",
          transition: "opacity 0.2s ease",
          gap: tight ? 0.5 : 1.5,
        }}
      >
        <Tooltip disableInteractive title={t(simulationConfig.gravity ? "gravity_on" : "gravity_off")}>
          <Chip
            disabled
            icon={
              <KeyboardDoubleArrowDown
                sx={{
                  fontSize: "14px !important",
                  color: simulationConfig.gravity ? "primary.contrastText" : "inherit",
                }}
              />
            }
            label={condensed ? null : t("gravity")}
            size="small"
            clickable
            onClick={() => setSimulationConfig((prev) => ({ ...prev, gravity: !prev.gravity }))}
            variant="outlined"
            sx={{
              fontSize: "0.68rem",
              height: 22,
              borderColor: simulationConfig.gravity ? "primary.main" : "text.primary",
              backgroundColor: simulationConfig.gravity ? "primary.main" : "transparent",
              color: simulationConfig.gravity ? "primary.contrastText" : "inherit",
              "& .MuiChip-icon": {
                color: simulationConfig.gravity ? "primary.contrastText" : "inherit",
              },
              "& .MuiChip-label": { pr: condensed ? 0.1 : 1 },
              "&.MuiChip-clickable:hover": {
                backgroundColor: simulationConfig.gravity ? "primary.dark" : "action.hover",
              },
              pl: 0.2,
            }}
          />
        </Tooltip>
        <Tooltip disableInteractive title={t(simulationConfig.collisions ? "collisions_on" : "collisions_off")}>
          <Chip
            disabled
            icon={
              <JoinInner
                sx={{
                  fontSize: "14px !important",
                  color: simulationConfig.collisions ? "primary.contrastText" : "inherit",
                }}
              />
            }
            label={condensed ? null : t("collisions")}
            size="small"
            clickable
            onClick={() => setSimulationConfig((prev) => ({ ...prev, collisions: !prev.collisions }))}
            variant="outlined"
            sx={{
              fontSize: "0.68rem",
              height: 22,
              borderColor: simulationConfig.collisions ? "primary.main" : "text.primary",
              backgroundColor: simulationConfig.collisions ? "primary.main" : "transparent",
              color: simulationConfig.collisions ? "primary.contrastText" : "inherit",
              "& .MuiChip-icon": {
                color: simulationConfig.collisions ? "primary.contrastText" : "inherit",
              },
              "& .MuiChip-label": { pr: condensed ? 0.1 : 1 },
              "&.MuiChip-clickable:hover": {
                backgroundColor: simulationConfig.collisions ? "primary.dark" : "action.hover",
              },
              pl: 0.2,
            }}
          />
        </Tooltip>
      </Box>

      <Divider flexItem sx={{ mx: tight ? 0.25 : 0.5 }} />

      {/* Calques d'affichage : ce qui est montré. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          opacity: appMode === "edition" ? 0.3 : 1,
          pointerEvents: appMode === "edition" ? "none" : "auto",
          transition: "opacity 0.2s ease",
        }}
      >
        <OverlaysMenu
          mechanicalElements={mechanism.mechanicalElements}
          applyActions={applyActions}
          condensed={condensed}
        />
      </Box>

      {rightSlot}
    </Box>
  </>
);
