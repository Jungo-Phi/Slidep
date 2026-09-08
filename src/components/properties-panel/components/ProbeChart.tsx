import React, { useRef } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { ProbeCurveKey } from "../../solver/recording/probe-series";
import { NEGLIGIBLE_RATIO } from "../../solver/recording/negligibility-pool";

/**
 * Categorical palette for the plotted curves.
 * Unlike the UI's semantic roles, these are chosen for mutual distinguishability, so they are their own palette rather than theme tokens — the scalar curve is the one that borrows the theme's accent, which is why this is a function of it and not a constant.
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
const GUTTER = 32;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;
const PAD_RIGHT = 6;
const FONT_SIZE = 9;
/** Max fraction of the flat band's height a "flat" curve (one label, see `ownFlat`) may
 * visually fill.
 * Without this, the band's half-height is only floored at `ownFloor`, which doesn't grow with the curve's own excursion — so a curve whose spread sneaks up on `ownFloor` from below fills up to half the band while still reading as flat and getting a single label, then jumps straight to a tightly-padded two-label range the instant it crosses.
 * Keeping the fill bounded well below "looks like a real range" makes that jump land where the chart actually changes look, not well before it. */
const FLAT_FILL_TARGET = 0.25;

interface ProbeChartProps {
  curves: ChartCurve[];
  /** Simulation time, drawn as a vertical cursor. */
  currentTime: number;
  /** This metric's own running scale (`NegligibilityPool`'s field for its kind), over the whole recording — sizes the flattened band once `ownFloor` (below) has already decided the curve collapses to one reading, so that band still reads as small next to a mechanism that does more elsewhere, rather than as a fixed width regardless of scale. */
  poolMax: number;
  /** This metric's own floor (`NegligibilityPool.ownFloors`' field for its kind, from `own_floors` in `negligibility-pool.ts`) — a curve whose own excursion (`dataMax - dataMin`) sits under this is flat on its own terms, not just small next to the rest of the mechanism, so a single reading is drawn instead of the two extremes either side of it.
   * Independent of `poolMax`/`showZero`: those decide how to draw the axis, this alone decides whether there is a real spread to draw two numbers for in the first place. */
  ownFloor: number;
  /** The unit the caller is already showing above this chart (its own SI-prefix pick, e.g.
   * "mN" for a chart full of small forces) — dividing by this before formatting a label is what keeps every number in this chart consistent with that one header, instead of a fixed-decimals formatter rounding a real but small value away to "0.00". */
  unitFactor: number;
  /** Whether `0` is a meaningful reading for this metric (a force, a velocity — "at rest",
   * "no load") rather than an arbitrary reference (a position, an angle) — see `metric_shows_zero`.
   * Forces the axis to always include it when true; left to the natural range otherwise, since forcing it there could squash a real reading that sits far from an arbitrary origin. */
  showZero: boolean;
  /** Shown when no curve has data. */
  emptyMessage: string;
  /** Click/drag on the plot seeks the simulation to that time (pauses it). */
  onSeek?: (t: number) => void;
}

/**
 * Lightweight SVG time chart for probe metrics.
 * Downsamples to roughly one point per horizontal unit, auto-scales the y range, draws a cursor at the current simulation time, and the time can be changed by clicking/dragging like on the timeline.
 */
export const ProbeChart: React.FC<ProbeChartProps> = ({
  curves,
  currentTime,
  poolMax,
  ownFloor,
  unitFactor,
  showZero,
  emptyMessage,
  onSeek,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // SVG paints through presentation attributes, not `sx`, so the theme tokens have to be resolved to values here rather than passed as role names.
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

    let scanMin = Infinity;
    let scanMax = -Infinity;
    for (const c of plotted) {
      for (const v of c.values) {
        if (v < scanMin) scanMin = v;
        if (v > scanMax) scanMax = v;
      }
    }
    // What the curve actually reaches — the gutter labels below start from this, not from the padded/flattened/zero-anchored bound, except where a branch below deliberately relabels an end (flattened: no real min/max to report; zero-anchored: the axis no longer starts at the curve's own extreme, so neither should its label).
    const dataMin = scanMin;
    const dataMax = scanMax;
    const spanRaw = dataMax - dataMin;
    const mid = (dataMin + dataMax) / 2;

    // In the SAME unit the header above already names (`unitFactor`) — a bare mantissa, no unit of its own to repeat.
    const fmt = (v: number) => {
      const scaled = v / unitFactor;
      const a = Math.abs(scaled);
      return a >= 1000
        ? scaled.toFixed(0)
        : a >= 10
          ? scaled.toFixed(1)
          : scaled.toFixed(2);
    };

    // Flat on its OWN terms — not just small next to the rest of the mechanism (`poolMax` has no say here): a curve that genuinely climbed from 0 to a real, if pool-small, reading is a real spread, not noise, whatever `showZero` says about it.
    const ownFlat = spanRaw < ownFloor;
    // Whether the flat reading is itself (numerically, not just as formatted) zero — a real (if small) constant reading, like a beam end sitting at a steady 9.97 N, still prints its own value rather than being forced to "0".
    // Checked against the raw value, never the formatted label: with an adaptive unit a real reading almost always prints as something other than "0" anyway, but this must hold regardless of formatting.
    const midIsZero = Math.abs(mid) < 1e-9;

    // Each branch below decides its axis bounds and every label together, as one object, instead of mutating shared `let`s: the zero-gridline bug (drawn from `yMin`/`yMax` geometry that happened to cross 0, on a metric where 0 isn't a meaningful reference) came from a derived fact — "is 0 worth a line" — being decided in a different place than the bounds that produced it.
    // One object per branch makes that impossible to desync again: nothing outside a branch can see partial state.
    interface AxisPlan {
      yMin: number;
      yMax: number;
      topLabel: string;
      bottomLabel: string;
      centerLabel: string | null;
      /** A second, "0" label — only set alongside `centerLabel`: the two-label plans below
       * already print zero as one of their own two extremes. */
      zeroLabel: string | null;
      /** Whether 0 is a meaningful reference to draw a gridline for. */
      zeroLine: boolean;
    }

    let plan: AxisPlan;
    if (ownFlat) {
      // Nothing real to report a spread for — one label rather than a min and a max either side of it, since printing two numbers this close (often both rounding to the same digits) reads as a spurious range where there is none.
      // The band drawn around it is still sized off `poolMax` (never narrower than `ownFloor` itself, so it always contains the curve it's drawn around) purely so it reads as small against a mechanism that does more elsewhere, not to decide whether it collapses in the first place — and never narrower than what keeps the curve's own excursion under `FLAT_FILL_TARGET` of the band, so it still reads as flat right up to the `ownFlat` boundary instead of visually filling half the band on a fixed-height floor.
      const halfSpan = Math.max(
        NEGLIGIBLE_RATIO * poolMax,
        ownFloor,
        spanRaw / (2 * FLAT_FILL_TARGET),
      );
      let flatMin = mid - halfSpan;
      let flatMax = mid + halfSpan;
      // A meaningful zero still belongs on the axis even when there's only one reading to print — the distance from it is itself the information ("9.97 N, but resting is 0").
      // An arbitrary-origin metric has no such reference to show, so its band stays exactly centred on the reading.
      if (showZero) {
        flatMin = Math.min(flatMin, 0);
        flatMax = Math.max(flatMax, 0);
      }
      const centerLabel = midIsZero ? fmt(0) : fmt(mid);
      plan = {
        yMin: flatMin,
        yMax: flatMax,
        topLabel: centerLabel,
        bottomLabel: centerLabel,
        centerLabel,
        // The axis was just pulled open to fit 0 in — read that reference too, not just the one reading, unless the reading already IS that reference (`centerLabel` then).
        zeroLabel: showZero && !midIsZero ? fmt(0) : null,
        // `showZero` pulled 0 in on purpose; `midIsZero` means the one reading IS 0, so the gridline would sit exactly on `centerLabel` — meaningful either way.
        // Without either, the band still centers on `mid` and can drift past 0 (`halfSpan` is sized off `poolMax`, not off `mid`), but that's incidental geometry, not a reference worth a line.
        zeroLine: showZero || midIsZero,
      };
    } else if (showZero && dataMin >= 0) {
      // A real reading, however small next to the mechanism (not own-flat, whatever its scale relative to `poolMax`) — anchor it to true zero rather than a band centred on itself, or a padding undershoot below zero with nothing to show there.
      const pad = spanRaw > 1e-9 ? spanRaw * 0.08 : Math.max(dataMax, 1) * 0.08;
      plan = {
        yMin: 0,
        yMax: dataMax + pad,
        topLabel: fmt(dataMax),
        bottomLabel: fmt(0),
        centerLabel: null,
        zeroLabel: null,
        zeroLine: true,
      };
    } else if (showZero && dataMax <= 0) {
      const pad =
        spanRaw > 1e-9 ? spanRaw * 0.08 : Math.max(-dataMin, 1) * 0.08;
      plan = {
        yMin: dataMin - pad,
        yMax: 0,
        topLabel: fmt(0),
        bottomLabel: fmt(dataMin),
        centerLabel: null,
        zeroLabel: null,
        zeroLine: true,
      };
    } else {
      // Already straddles zero (showZero's own doing or not — an arbitrary-origin metric can too), or doesn't show it at all: pad the range same as ever.
      const pad =
        spanRaw > 1e-9 ? spanRaw * 0.08 : Math.max(Math.abs(dataMax), 1);
      plan = {
        yMin: dataMin - pad,
        yMax: dataMax + pad,
        topLabel: fmt(dataMax),
        bottomLabel: fmt(dataMin),
        centerLabel: null,
        zeroLabel: null,
        // Judged off the real data, not the padded bounds — the small 8% pad could nudge a reading that never actually reaches 0 across it, same failure mode as the flat plan's.
        zeroLine: dataMin <= 0 && dataMax >= 0,
      };
    }
    const {
      yMin,
      yMax,
      topLabel,
      bottomLabel,
      centerLabel,
      zeroLabel,
      zeroLine,
    } = plan;
    const ySpan = yMax - yMin;

    const plotW = VIEW_W - GUTTER - PAD_RIGHT;
    const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
    const toX = (t: number) => GUTTER + ((t - t0) / tSpan) * plotW;
    const toY = (v: number) => PAD_TOP + (1 - (v - yMin) / ySpan) * plotH;

    const cursorX = toX(Math.min(Math.max(currentTime, t0), t1));
    // Where the single reading actually sits — the box's vertical middle only when the band is centred on it (an arbitrary-origin metric, or a zero reading), never a fixed spot once `showZero` has pulled the band toward 0: a label detached from the line it annotates would read as pointing at nothing.
    // Clamped like `topLabel`/`bottomLabel`'s own fixed edges, so it never crowds past the plot box even when `mid` sits at its rim.
    const centerLabelY = Math.min(
      Math.max(toY(mid), PAD_TOP + FONT_SIZE - 2),
      VIEW_H - PAD_BOTTOM - 2,
    );
    const zeroLabelY = Math.min(
      Math.max(toY(0), PAD_TOP + FONT_SIZE - 2),
      VIEW_H - PAD_BOTTOM - 2,
    );
    // `zeroLabel` was decided from `midIsZero`, a numeric near-zero test on the raw value — it says nothing about where `mid` and 0 actually land once squeezed into the same clamped gutter space (`halfSpan` can dwarf `mid` on a mechanism with a large `poolMax` elsewhere, putting both labels on the same pixel row).
    // Redundant, overlapping text at that point, so only draw it once the two rows are actually far enough apart to read as two separate numbers.
    const showZeroLabel =
      zeroLabel !== null && Math.abs(zeroLabelY - centerLabelY) >= FONT_SIZE;

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
        {/* Zero line — drawn from `zeroLine` (decided alongside the bounds), not re-derived
         * from `yMin`/`yMax`: those can dip past 0 as incidental geometry (see `zeroLine`'s
         *  own comments) without 0 being a meaningful reference for this metric. */}
        {zeroLine && (
          <line
            x1={GUTTER - 2}
            x2={VIEW_W - PAD_RIGHT}
            y1={toY(0)}
            y2={toY(0)}
            stroke={palette.divider}
            strokeWidth={0.5}
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
        {/* Y label(s), in the left gutter: min/max either side, or — when there is no real
         * spread to report two numbers for — one reading (`centerLabel`) plus, when the
         *  axis was pulled open to fit a meaningful zero in, that zero too. */}
        {centerLabel !== null ? (
          <>
            <text
              x={GUTTER - 5}
              y={centerLabelY + FONT_SIZE / 2 - 2}
              fontSize={FONT_SIZE}
              fill={palette.text.secondary}
              textAnchor="end"
            >
              {centerLabel}
            </text>
            {showZeroLabel && (
              <text
                x={GUTTER - 5}
                y={zeroLabelY + FONT_SIZE / 2 - 2}
                fontSize={FONT_SIZE}
                fill={palette.text.secondary}
                textAnchor="end"
              >
                {zeroLabel}
              </text>
            )}
          </>
        ) : (
          <>
            <text
              x={GUTTER - 5}
              y={PAD_TOP + FONT_SIZE - 2}
              fontSize={FONT_SIZE}
              fill={palette.text.secondary}
              textAnchor="end"
            >
              {topLabel}
            </text>
            <text
              x={GUTTER - 5}
              y={VIEW_H - PAD_BOTTOM - 2}
              fontSize={FONT_SIZE}
              fill={palette.text.secondary}
              textAnchor="end"
            >
              {bottomLabel}
            </text>
          </>
        )}
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
