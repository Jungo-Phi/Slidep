import React, { useState } from "react";
import { Box, IconButton, Tooltip, Typography, alpha } from "@mui/material";
import { Gif } from "@mui/icons-material";
import { AppMode, is_simulating } from "../../types";
import { RuntimeState } from "../../types/runtime-state";
import { format_sim_time } from "../../utils";
import { t } from "../../i18n";
import { at_recording_end } from "../solver/dynamics/simulation-engine";
import {
  set_sim_clock as setRuntimeState,
  sim_clock,
} from "../solver/dynamics/sim-clock";
import { belt_events } from "../solver/recording/belt-events";
import { dead_points } from "../solver/kinematics/dead-points";

/** Something worth marking on the rail, whatever found it. */
type TimelineEvent = {
  t: number;
  kind: "belt" | "dead-point";
  label: string;
};

/**
 * One colour per family, and never a second shape: the marks share a form so the rail reads as one kind of object, and the colour says which family without anything to decipher.
 */
const MARK_COLOR: Record<TimelineEvent["kind"], string> = {
  belt: "warning.main",
  "dead-point": "error.main",
};

/** Severity order, for a mark that carries several families at once. */
const MARK_PRIORITY: TimelineEvent["kind"][] = ["dead-point", "belt"];

const dominant_kind = (
  kinds: Set<TimelineEvent["kind"]>,
): TimelineEvent["kind"] =>
  MARK_PRIORITY.find((kind) => kinds.has(kind)) ?? "belt";

/** Share of the rail below which two marks would draw on top of one another. */
const MARK_MERGE_RATIO = 0.012;

interface SimulationTimelineProps {
  appMode: AppMode;
  runtimeState: RuntimeState;
  timeline: {
    duration: number;
    recording: boolean;
  };
  timelineTrackRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The playback rail: elapsed/total time, seekable track, recording halo.
 *
 * Meant as the second row of the top bar, across the whole window, and mounted in every mode so that entering a simulation never shifts the layout.
 * In edition it stays in place but inert: an empty rail, with no head that would read as a recording of zero length.
 */
export const SimulationTimeline: React.FC<SimulationTimelineProps> = ({
  appMode,
  runtimeState,
  timeline,
  timelineTrackRef,
}) => {
  const disabled = appMode === "edition";
  const [timelineHovered, setTimelineHovered] = useState(false);
  const [timelineDragging, setTimelineDragging] = useState(false);
  /**
   * A mark is under the pointer, so the rail must hold its own tooltip back.
   *
   * The marks sit inside the track, which therefore stays hovered under them: without this the time bubble and the mark's label open on top of one another, and the one the pointer is actually on is the one that loses.
   */
  const [markHovered, setMarkHovered] = useState(false);

  /**
   * Instants where a belt changed pulleys, grouped by the frame that carries them.
   *
   * Read off the snapshots, never measured: the simulation decides contact itself and writes it into every frame, so this costs a scan of flags — 0.9 ms over twenty seconds of recording, against 42 ms for a single mobility measurement.
   * It can therefore be redone whenever the recording grows, which is what puts the marks on the rail while it is still being written.
   */
  const events = React.useMemo((): TimelineEvent[] => {
    // Belt contact and stalled motors are both filed by either engine, so this reads whichever mode is active.
    const beltMarks = belt_events(runtimeState.simulationSnapshots).map(
      (event) => ({
        t: event.t,
        kind: "belt" as const,
        label: t(event.kind === "detach" ? "belt_detach" : "belt_reattach"),
      }),
    );
    return [
      ...beltMarks,
      ...dead_points(runtimeState.simulationSnapshots).map((point) => ({
        t: point.t,
        kind: "dead-point" as const,
        label: t(
          point.kind === "blocked" ? "dead_point" : "dead_point_released",
        ),
      })),
    ];
  }, [runtimeState.simulationSnapshots]);

  /**
   * Those marks the rail can actually place, merged when they would overlap.
   *
   * Past the cursor is dropped rather than clamped.
   * While recording, the worker is aimed ahead of the cursor and the rail spans `[0, cursor]` with the head pinned to its end — so a later event has no place on it, and pausing deletes that overshoot anyway.
   * A mark pinned to the end would announce something that has not happened yet and may never.
   *
   * Two events closer together than a mark is wide are one mark carrying both labels: a second tick drawn over the first says nothing and steals the hover from it.
   */
  const marks = React.useMemo(() => {
    if (timeline.duration <= 0) return [];
    const merged: {
      t: number;
      kinds: Set<TimelineEvent["kind"]>;
      labels: string[];
    }[] = [];
    for (const event of [...events].sort((a, b) => a.t - b.t)) {
      if (event.t > timeline.duration) continue;
      const last = merged[merged.length - 1];
      if (last && event.t - last.t <= MARK_MERGE_RATIO * timeline.duration) {
        last.kinds.add(event.kind);
        if (!last.labels.includes(event.label)) last.labels.push(event.label);
        continue;
      }
      merged.push({
        t: event.t,
        kinds: new Set([event.kind]),
        labels: [event.label],
      });
    }
    return merged;
  }, [events, timeline.duration]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        pl: 1,
        pr: 1.5,
        height: 24,
        // The same rule as the top bar's own dividers: it splits the bar in two rows without cutting the bar off.
        borderTop: "1px solid",
        borderColor: "dividers.toolbar",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontVariantNumeric: "tabular-nums",
          fontSize: "0.68rem",
          color: "text.secondary",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {/* The current time is sized on a hidden copy of the duration, which it never exceeds: the label only widens when the duration's format gains a character, never while replaying.
            Right-aligned, so the " / duration" part stays still. */}
        <Box
          component="span"
          sx={{
            display: "inline-grid",
            justifyItems: "end",
            fontWeight: 700,
            "& > *": { gridArea: "1 / 1" },
          }}
        >
          <Box component="span" aria-hidden sx={{ visibility: "hidden" }}>
            {format_sim_time(timeline.duration)}
          </Box>
          <Box component="span" sx={{ color: "text.primary" }}>
            {format_sim_time(runtimeState.time)}
          </Box>
        </Box>
        <Box component="span" sx={{ opacity: 0.55 }}>
          {` / ${format_sim_time(timeline.duration)}`}
        </Box>
      </Typography>

      <Box
        ref={timelineTrackRef}
        sx={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          position: "relative",
          cursor: disabled ? "default" : "pointer",
        }}
        onMouseEnter={() => setTimelineHovered(true)}
        onMouseLeave={() => {
          setTimelineHovered(false);
          // Also cleared here: a mark unmounting under the pointer — the recording grows and regroups them — never fires its own leave, and would hold the rail's tooltip shut for good.
          setMarkHovered(false);
        }}
        onMouseDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          setTimelineDragging(true);
          const rect = timelineTrackRef.current!.getBoundingClientRect();
          const seek = (clientX: number) => {
            const ratio = Math.max(
              0,
              Math.min(1, (clientX - rect.left) / rect.width),
            );
            const rs = sim_clock();
            const maxTime =
              is_simulating(appMode) && rs.simulationSnapshots.length > 0
                ? rs.simulationSnapshots[rs.simulationSnapshots.length - 1].t
                : 0;
            setRuntimeState((prev) => {
              const t = ratio * maxTime;
              return {
                ...prev,
                time: t,
                isPlaying: false,
                // Dropped ON the end is not scrubbing: playing from there extends the recording instead of replaying nothing.
                scrubbed: !at_recording_end(prev.simulationSnapshots, t),
              };
            });
          };
          seek(e.clientX);
          const onMove = (ev: MouseEvent) => seek(ev.clientX);
          const onUp = () => {
            setTimelineDragging(false);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      >
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            backgroundColor: "action.hover",
            opacity: disabled ? 0.6 : 1,
          }}
        />
        {!disabled && (
          <Box
            sx={{
              position: "absolute",
              left: 0,
              height: 5,
              borderRadius: 3,
              backgroundColor: "primary.main",
              width: "var(--playhead, 0%)",
            }}
          />
        )}
        {/* Where something happened in the recording.
            Sitting ON the rail rather than beside it: the mark states something about that instant, and reading it anywhere but on the time axis would make it a legend to decipher.
            Clicking one lands exactly on its frame, which dragging the rail cannot do. */}
        {!disabled &&
          marks.map((mark) => (
            <Tooltip
              key={mark.t}
              placement="bottom"
              // Held back while scrubbing: the pointer is then following the head, not pointing at what it happens to pass over.
              disableHoverListener={timelineDragging}
              title={`${format_sim_time(mark.t)} · ${mark.labels.join(" · ")}`}
            >
              <Box
                onMouseEnter={() => setMarkHovered(true)}
                onMouseLeave={() => setMarkHovered(false)}
                onMouseDown={(e) => {
                  // The rail seeks from the pointer's x; this knows the exact instant.
                  e.stopPropagation();
                  e.preventDefault();
                  setRuntimeState((prev) => ({
                    ...prev,
                    time: mark.t,
                    isPlaying: false,
                    scrubbed: !at_recording_end(
                      prev.simulationSnapshots,
                      mark.t,
                    ),
                  }));
                }}
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: `${(mark.t / timeline.duration) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 3,
                  height: 12,
                  borderRadius: 1.5,
                  cursor: "pointer",
                  backgroundColor: MARK_COLOR[dominant_kind(mark.kinds)],
                  // Widened on hover rather than moved or recoloured: the mark must stay exactly where its instant is, and a 3 px target is hard to hit.
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: "-4px -6px",
                  },
                  "&:hover": { transform: "translate(-50%, -50%) scaleX(1.8)" },
                }}
              />
            </Tooltip>
          ))}

        {!disabled && (
          <Tooltip
            title={format_sim_time(runtimeState.time)}
            placement="bottom"
            open={(timelineHovered && !markHovered) || timelineDragging}
          >
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "var(--playhead, 0%)",
                transform: `translate(-50%, -50%) scale(${
                  !timeline.recording && (timelineHovered || timelineDragging)
                    ? 1.3
                    : 1
                })`,
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: timeline.recording
                  ? "primary.contrastText"
                  : "primary.main",
                border: "2px solid",
                borderColor: "primary.main",
                boxShadow: (t) =>
                  `0 1px 4px ${alpha(t.palette.common.black, 0.3)}`,
                pointerEvents: "none",
                "&::after": timeline.recording
                  ? {
                      content: '""',
                      position: "absolute",
                      inset: -2,
                      borderRadius: "50%",
                      border: "2px solid",
                      borderColor: "primary.main",
                      animation: "slidepRecHalo 1.1s ease-out infinite",
                    }
                  : undefined,
                "@keyframes slidepRecHalo": {
                  "0%": { transform: "scale(1)", opacity: 0.8 },
                  "100%": { transform: "scale(2.8)", opacity: 0 },
                },
              }}
            />
          </Tooltip>
        )}
      </Box>

      <Tooltip title={t("export_animation")}>
        <span>
          <IconButton
            size="small"
            color="inherit"
            disabled
            sx={{ pl: 0.25, pr: 0, flexShrink: 0 }}
          >
            <Gif sx={{ fontSize: 18 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};
