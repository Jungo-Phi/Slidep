import React, { useRef } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { ProbeCurveKey } from "../../solver/probe-series";

/**
 * Categorical palette for the plotted curves. Unlike the UI's semantic roles,
 * these are chosen for mutual distinguishability, so they are their own palette
 * rather than theme tokens — the scalar curve is the one that borrows the
 * theme's accent, which is why this is a function of it and not a constant.
 */
export const probe_curve_colors = (
  accent: string,
): Record<ProbeCurveKey, string> => ({
  x: "#E5484D",
  y: "#2F81F7",
  norm: "#8250DF",
  value: accent,
});

/** Colors used to distinguish elements in the superposed (comparison) mode. */
export const PROBE_ELEMENT_COLORS = [
  "#E5484D",
  "#2F81F7",
  "#2DA44E",
  "#8250DF",
  "#D4A72C",
  "#FD7E14",
  "#12A594",
  "#D6409F",
];

/** One plotted curve: its own time axis + values (same length). */
export interface ChartCurve {
  id: string;
  color: string;
  t: number[];
  values: number[];
}

/** Logical drawing size — the SVG scales to its container via viewBox. */
const VIEW_W = 260;
const VIEW_H = 84;
/** Left gutter holding the y min/max labels, so text never overlaps curves. */
const GUTTER = 36;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;
const PAD_RIGHT = 4;
const FONT_SIZE = 10;

interface ProbeChartProps {
  curves: ChartCurve[];
  /** Simulation time, drawn as a vertical cursor. */
  currentTime: number;
  /** Shown when no curve has data. */
  emptyMessage: string;
  /** Click/drag on the plot seeks the simulation to that time (pauses it). */
  onSeek?: (t: number) => void;
}

/**
 * Lightweight SVG time chart for probe metrics. Downsamples to roughly one
 * point per horizontal unit, auto-scales the y range, draws a cursor at the
 * current simulation time, and the time can be changed by clicking/dragging like on the timeline.
 */
export const ProbeChart: React.FC<ProbeChartProps> = ({
  curves,
  currentTime,
  emptyMessage,
  onSeek,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // SVG paints through presentation attributes, not `sx`, so the theme tokens
  // have to be resolved to values here rather than passed as role names.
  const { palette } = useTheme();
  const plotted = curves.filter((c) => c.t.length >= 2);
  const hasData = plotted.length > 0;

  let content: React.ReactNode;
  if (!hasData) {
    content = (
      <Box
        sx={{
          height: VIEW_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
        }}
      >
        <Typography variant="caption" color="text.disabled" align="center">
          {emptyMessage}
        </Typography>
      </Box>
    );
  } else {
    const t0 = Math.min(...plotted.map((c) => c.t[0]));
    const t1 = Math.max(...plotted.map((c) => c.t[c.t.length - 1]));
    const tSpan = Math.max(t1 - t0, 1e-9);

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const c of plotted) {
      for (const v of c.values) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    // Pad the range; keep a visible band for flat curves.
    const spanRaw = yMax - yMin;
    const pad = spanRaw > 1e-9 ? spanRaw * 0.08 : Math.max(Math.abs(yMax), 1);
    yMin -= pad;
    yMax += pad;
    const ySpan = yMax - yMin;

    const plotW = VIEW_W - GUTTER - PAD_RIGHT;
    const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
    const toX = (t: number) => GUTTER + ((t - t0) / tSpan) * plotW;
    const toY = (v: number) => PAD_TOP + (1 - (v - yMin) / ySpan) * plotH;

    const fmt = (v: number) => {
      const a = Math.abs(v);
      return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
    };

    const cursorX = toX(Math.min(Math.max(currentTime, t0), t1));

    const seekFromClientX = (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || !onSeek) return;
      const rect = svg.getBoundingClientRect();
      const xView = ((clientX - rect.left) / rect.width) * VIEW_W;
      const ratio = Math.max(0, Math.min(1, (xView - GUTTER) / plotW));
      onSeek(t0 + ratio * tSpan);
    };

    content = (
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          cursor: onSeek ? "crosshair" : "default",
        }}
        onMouseDown={
          onSeek
            ? (e) => {
                e.preventDefault();
                seekFromClientX(e.clientX);
                const onMove = (ev: MouseEvent) => seekFromClientX(ev.clientX);
                const onUp = () => {
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }
            : undefined
        }
      >
        {/* Y axis */}
        <line
          x1={GUTTER - 2}
          x2={GUTTER - 2}
          y1={PAD_TOP}
          y2={VIEW_H - PAD_BOTTOM}
          stroke={palette.divider}
          strokeWidth={0.5}
        />
        {/* Zero line */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={GUTTER - 2}
            x2={VIEW_W - PAD_RIGHT}
            y1={toY(0)}
            y2={toY(0)}
            // Same colour as the axis: the dashes already say it is a different
            // kind of line, so a different weight on top would only add noise.
            stroke={palette.divider}
            strokeWidth={0.5}
            strokeDasharray="3 3"
          />
        )}
        {/* Curves */}
        {plotted.map((c) => {
          const n = c.t.length;
          // ~1 sample per horizontal unit is plenty
          const step = Math.max(1, Math.floor(n / plotW));
          let d = "";
          for (let i = 0; i < n; i += step) {
            d += `${d ? "L" : "M"}${toX(c.t[i]).toFixed(1)} ${toY(c.values[i]).toFixed(1)}`;
          }
          // Always include the last sample
          if ((n - 1) % step !== 0)
            d += `L${toX(c.t[n - 1]).toFixed(1)} ${toY(c.values[n - 1]).toFixed(1)}`;
          return (
            <path
              key={c.id}
              d={d}
              fill="none"
              stroke={c.color}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          );
        })}
        {/* Time cursor */}
        <line
          x1={cursorX}
          x2={cursorX}
          y1={PAD_TOP}
          y2={VIEW_H - PAD_BOTTOM}
          stroke={palette.primary.main}
          strokeWidth={0.8}
          opacity={0.6}
        />
        {/* Y min/max labels, in the left gutter */}
        <text
          x={GUTTER - 5}
          y={PAD_TOP + FONT_SIZE - 2}
          fontSize={FONT_SIZE}
          fill={palette.text.secondary}
          textAnchor="end"
        >
          {fmt(yMax)}
        </text>
        <text
          x={GUTTER - 5}
          y={VIEW_H - PAD_BOTTOM - 2}
          fontSize={FONT_SIZE}
          fill={palette.text.secondary}
          textAnchor="end"
        >
          {fmt(yMin)}
        </text>
      </svg>
    );
  }

  return (
    <Box
      sx={{
        borderRadius: 1,
        backgroundColor: "background.sunken",
        overflow: "hidden",
      }}
    >
      {content}
    </Box>
  );
};

export default ProbeChart;
