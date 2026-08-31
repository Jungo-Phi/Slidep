import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { CohesionField, CohesionSample } from "../../solver/cohesion-field";
import { is_negligible, NEGLIGIBLE_RATIO } from "../../solver/negligibility-pool";
import {
  CohesionQuantity,
  COHESION_DIAGRAM_COLOR,
} from "../../../constants/rendering-specs";
import { t } from "../../../i18n";

/**
 * Three stacked N/T/Mf diagrams of one beam — docs/plan-efforts-interieurs.md phase 5bis.
 * A measurement tool, not a display layer: mounted only while a beam is selected, gone at
 * deselection, one quantity per own y-scale, discontinuities drawn as real jumps (never
 * smoothed — `field.samples` already carries a "just before"/"just after" pair at the same
 * `s` for exactly that reason, see `compute_cohesion_field`).
 */

const VIEW_W = 260;
const VIEW_H = 56;
/** Left gutter holding the y min/max labels, so text never overlaps a curve. */
const GUTTER = 30;
const PAD_TOP = 3;
const PAD_BOTTOM = 3;
const PAD_RIGHT = 4;
const FONT_SIZE = 9;

const sample_value = (
  sample: CohesionSample,
  quantity: CohesionQuantity,
): number =>
  quantity === "N" ? sample.N : quantity === "T" ? sample.T : sample.Mf;

const fmt = (v: number): string => {
  const a = Math.abs(v);
  return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
};

/** The curve's own value at a CONTINUOUS abscissa `s` — linear between the two bracketing
 *  samples, so it lies exactly on the drawn polyline (itself already straight between
 *  samples, never a true smooth curve). At a discontinuity this naturally resolves to
 *  whichever side `s` sits on, since the bracket search only crosses to the far side once
 *  `s` is past the jump's own abscissa entirely. */
function value_at(field: CohesionField, s: number, quantity: CohesionQuantity): number {
  const samples = field.samples;
  let i = 0;
  while (i < samples.length - 1 && samples[i + 1].s <= s) i++;
  if (i >= samples.length - 1) return sample_value(samples[i], quantity);
  const a = samples[i];
  const b = samples[i + 1];
  const span = b.s - a.s;
  const u = span > 1e-9 ? (s - a.s) / span : 0;
  const va = sample_value(a, quantity);
  const vb = sample_value(b, quantity);
  return va + u * (vb - va);
}

interface OneDiagramProps {
  field: CohesionField;
  quantity: CohesionQuantity;
  /** This quantity's own running scale (force for N/T, moment for Mf) over the whole
   *  recording — the axis flattens instead of auto-zooming when the field's own excursion
   *  is negligible next to it (see `is_negligible`). */
  poolMax: number;
  toX: (s: number) => number;
  /** Where the cursor line/dot is DRAWN — snapped to a "point particulier" when close enough,
   *  otherwise the same as `hoveredValueS`. */
  hoveredS: number | null;
  /** Where the cursor's VALUE is read from — always the raw, unsnapped position, so a
   *  snapped cursor still shows the value of whichever side of a jump the mouse actually
   *  approached from, not an arbitrary pick. */
  hoveredValueS: number | null;
  color: string;
  divider: string;
  textSecondary: string;
}

/**
 * One quantity's own chart: shares the abscissa scale (`toX`) with its siblings, but its
 * OWN y-scale — the plan's "chacun avec son axe gradué", never one shared scale across N/T/Mf.
 */
const OneDiagram: React.FC<OneDiagramProps> = ({
  field,
  quantity,
  poolMax,
  toX,
  hoveredS,
  hoveredValueS,
  color,
  divider,
  textSecondary,
}) => {
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (const sample of field.samples) {
    const v = sample_value(sample, quantity);
    if (v < dataMin) dataMin = v;
    if (v > dataMax) dataMax = v;
  }
  if (!Number.isFinite(dataMin)) {
    dataMin = 0;
    dataMax = 0;
  }
  const spanRaw = dataMax - dataMin;
  let yMin: number;
  let yMax: number;
  if (is_negligible(spanRaw, poolMax)) {
    // This beam's own excursion is noise next to what this quantity reaches elsewhere in
    // the mechanism — auto-zooming into it would draw noise as a real signal. Flatten the
    // axis to the pool's own scale instead (this also covers the flat two-force-member
    // case, N constant/T,Mf≡0: a real but unchanging reading gets a band sized to the
    // mechanism's own force scale rather than an arbitrary function of its own value).
    const mid = (dataMin + dataMax) / 2;
    const halfSpan = NEGLIGIBLE_RATIO * poolMax;
    yMin = mid - halfSpan;
    yMax = mid + halfSpan;
  } else {
    const pad =
      spanRaw > 1e-9 ? spanRaw * 0.15 : Math.max(Math.abs(dataMax), 1) * 0.2;
    yMin = dataMin - pad;
    yMax = dataMax + pad;
  }
  // The abscissa (y = 0) is always in view, never just when the data happens to straddle
  // it — otherwise a curve sitting entirely at, say, ~67 never shows its own axis at all,
  // which is exactly backwards: that IS the case where a reference matters most, to tell a
  // real (if small) slope apart from visual noise from the auto-scaled band alone.
  yMin = Math.min(yMin, 0);
  yMax = Math.max(yMax, 0);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const ySpan = yMax - yMin;

  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  // `Mf`'s axis points DOWN (positive = "the beam smiles") — see "Décisions actées".
  const flip = quantity === "Mf";
  const toY = (v: number) =>
    PAD_TOP + (flip ? (v - yMin) / ySpan : 1 - (v - yMin) / ySpan) * plotH;

  let d = "";
  field.samples.forEach((sample, i) => {
    const p = `${toX(sample.s).toFixed(1)} ${toY(sample_value(sample, quantity)).toFixed(1)}`;
    d += i === 0 ? `M${p}` : `L${p}`;
  });

  // The filled area between the curve and its own abscissa — the classic diagram look
  // (same as the retired canvas version), anchored to a REFERENCE axis that is now always
  // drawn, not just when zero happens to fall inside the auto-scaled band.
  const zeroY = toY(0);
  const firstX = toX(field.samples[0].s);
  const lastX = toX(field.samples[field.samples.length - 1].s);
  let fillD = `M${firstX.toFixed(1)} ${zeroY.toFixed(1)}`;
  field.samples.forEach((sample) => {
    fillD += ` L${toX(sample.s).toFixed(1)} ${toY(sample_value(sample, quantity)).toFixed(1)}`;
  });
  fillD += ` L${lastX.toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // A tick from the abscissa up to the curve at every "special" point — where a discontinuity
  // sits (a discrete load, a support, the two ends). A tolerance rather than `===`: the value
  // walking IN from the left and the value jumping TO from the station itself are computed
  // through different arithmetic and can land a float apart even at the very same `s`.
  const isDiscontinuity = (s: number) =>
    field.discontinuities.some((d) => Math.abs(d - s) < 1e-6);
  // The right end (`s = length`) gets no explicit tick: the fill area's own closing edge
  // already draws a line there, from the curve down to the abscissa, so a second one on top
  // only reads as an odd extra-thick stroke.
  const ticks: { s: number; value: number }[] = [];
  for (const s of field.discontinuities) {
    if (s >= field.length - 1e-6) continue;
    for (const sample of field.samples)
      if (Math.abs(sample.s - s) < 1e-6)
        ticks.push({ s, value: sample_value(sample, quantity) });
  }

  const extremum = field.extremum[quantity];
  const extremumX = toX(extremum.s);
  const extremumY = toY(extremum.value);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <line
        x1={GUTTER - 2}
        x2={GUTTER - 2}
        y1={PAD_TOP}
        y2={VIEW_H - PAD_BOTTOM}
        stroke={divider}
        strokeWidth={0.5}
      />
      {/* The abscissa itself (y = 0) — always drawn, the reference the filled area anchors
       *  to, not a dashed hint shown only when the data happens to straddle zero. */}
      <line
        x1={GUTTER - 2}
        x2={VIEW_W - PAD_RIGHT}
        y1={zeroY}
        y2={zeroY}
        stroke={divider}
        strokeWidth={0.5}
      />
      <path d={fillD} fill={color} opacity={0.18} stroke="none" />
      {/* The field's own sample grid — a light, neutral tick per point (not the accent
       *  colour: these are a reading aid, the "points particuliers" below carry the
       *  meaning). Skips samples that coincide with a discontinuity — that one already
       *  gets its own, more prominent tick just below. */}
      {field.samples.map(
        (sample, i) =>
          !isDiscontinuity(sample.s) && (
            <line
              key={i}
              x1={toX(sample.s)}
              x2={toX(sample.s)}
              y1={zeroY}
              y2={toY(sample_value(sample, quantity))}
              stroke={divider}
              strokeWidth={0.5}
              opacity={0.6}
            />
          ),
      )}
      {ticks.map((tick) => (
        <line
          key={`${tick.s}-${tick.value}`}
          x1={toX(tick.s)}
          x2={toX(tick.s)}
          y1={zeroY}
          y2={toY(tick.value)}
          stroke={color}
          strokeWidth={0.6}
          opacity={0.5}
        />
      ))}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle cx={extremumX} cy={extremumY} r={2.5} fill={color} />
      {hoveredS !== null && hoveredValueS !== null && (
        <>
          <line
            x1={toX(hoveredS)}
            x2={toX(hoveredS)}
            y1={PAD_TOP}
            y2={VIEW_H - PAD_BOTTOM}
            stroke={color}
            strokeWidth={0.8}
            opacity={0.5}
          />
          <circle
            cx={toX(hoveredS)}
            cy={toY(value_at(field, hoveredValueS, quantity))}
            r={2}
            fill={color}
          />
        </>
      )}
      <text
        x={GUTTER - 5}
        y={PAD_TOP + FONT_SIZE - 1}
        fontSize={FONT_SIZE}
        fill={textSecondary}
        textAnchor="end"
      >
        {fmt(dataMax)}
      </text>
      <text
        x={GUTTER - 5}
        y={VIEW_H - PAD_BOTTOM - 1}
        fontSize={FONT_SIZE}
        fill={textSecondary}
        textAnchor="end"
      >
        {fmt(dataMin)}
      </text>
      <text
        x={5}
        y={(PAD_TOP + (VIEW_H - PAD_BOTTOM)) / 2 + FONT_SIZE / 2 - 1}
        fontSize={FONT_SIZE}
        fill={color}
        fontWeight={700}
      >
        {quantity}
      </text>
    </svg>
  );
};

interface CohesionDiagramsProps {
  field: CohesionField | undefined;
  /** The mechanism's own running force/moment scale over the whole recording (see
   *  `NegligibilityPool`) — N/T flatten against `forcePoolMax`, Mf against `momentPoolMax`. */
  forcePoolMax: number;
  momentPoolMax: number;
  /** Shown in place of the diagrams when `field` is undefined (kinematic mode, or dynamic
   *  mode with nothing recorded yet). */
  emptyMessage: string;
  /** Abscissa hovered over any of the three diagrams — `null` off them. Panel → canvas only
   *  (see docs/plan-efforts-interieurs.md phase 5bis: the reverse link was cut, unneeded). */
  onHoverS?: (s: number | null) => void;
}

/** How close the cursor must be to a "point particulier" (`field.discontinuities`) to lock
 *  onto it, in the SVG's own viewBox units — proportional to the rendered width regardless
 *  of the container's actual screen size. Everywhere else the cursor is fully continuous. */
const SNAP_TOLERANCE_VIEW = 5;

export const CohesionDiagrams: React.FC<CohesionDiagramsProps> = ({
  field,
  forcePoolMax,
  momentPoolMax,
  emptyMessage,
  onHoverS,
}) => {
  const { palette } = useTheme();
  // `hoveredS` is where the cursor is DRAWN (snapped when close to a discontinuity);
  // `hoveredValueS` is the raw position, which value readouts always use — see `value_at`.
  const [hoveredS, setHoveredS] = React.useState<number | null>(null);
  const [hoveredValueS, setHoveredValueS] = React.useState<number | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  if (!field || field.length < 1e-9) {
    return (
      <Box
        sx={{
          mx: 2,
          height: VIEW_H * 3 + 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
          borderRadius: 3,
          backgroundColor: "background.sunken",
        }}
      >
        <Typography variant="caption" color="text.disabled" align="center">
          {emptyMessage}
        </Typography>
      </Box>
    );
  }

  const plotW = VIEW_W - GUTTER - PAD_RIGHT;
  const toX = (s: number) => GUTTER + (s / field.length) * plotW;

  const handleMove = (e: React.MouseEvent) => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xView = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = Math.max(0, Math.min(1, (xView - GUTTER) / plotW));
    const rawS = ratio * field.length;

    // Snap the DRAWN position onto the nearest "point particulier" within tolerance — the
    // value readout still uses `rawS` (below), so it keeps reading whichever side of a jump
    // the mouse actually approached from, not an arbitrary pick forced by the snap.
    const tolerance = (SNAP_TOLERANCE_VIEW / plotW) * field.length;
    let snappedS = rawS;
    let nearestDist = tolerance;
    for (const d of field.discontinuities) {
      const dist = Math.abs(d - rawS);
      if (dist < nearestDist) {
        nearestDist = dist;
        snappedS = d;
      }
    }

    setHoveredS(snappedS);
    setHoveredValueS(rawS);
    onHoverS?.(snappedS);
  };
  const handleLeave = () => {
    setHoveredS(null);
    setHoveredValueS(null);
    onHoverS?.(null);
  };

  const residual = field.loopResidual;
  const residualMagnitude =
    Math.abs(residual.fx) + Math.abs(residual.fy) + Math.abs(residual.m);

  return (
    <Box
      ref={wrapperRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      sx={{
        mx: 2,
        borderRadius: 3,
        backgroundColor: "background.sunken",
        overflow: "hidden",
        cursor: "crosshair",
      }}
    >
      {(["N", "T", "Mf"] as const).map((quantity) => (
        <OneDiagram
          key={quantity}
          field={field}
          quantity={quantity}
          poolMax={quantity === "Mf" ? momentPoolMax : forcePoolMax}
          toX={toX}
          hoveredS={hoveredS}
          hoveredValueS={hoveredValueS}
          color={COHESION_DIAGRAM_COLOR[quantity]}
          divider={palette.divider}
          textSecondary={palette.text.secondary}
        />
      ))}
      {/* Residual: a modelling/convergence indicator, never the physics itself — kept small
       *  and only shown once it is large enough to matter next to the values above. */}
      {residualMagnitude > 1e-6 && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: "block", px: 1, pb: 0.5 }}
        >
          {t("cohesion_residual")} {fmt(residual.fx)}, {fmt(residual.fy)} N ·{" "}
          {fmt(residual.m)} N·m
        </Typography>
      )}
    </Box>
  );
};

export default CohesionDiagrams;
