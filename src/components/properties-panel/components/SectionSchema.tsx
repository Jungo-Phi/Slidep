import React from "react";
import { Box, useTheme } from "@mui/material";
import { ProfileShape } from "../../../types/material";
import { LENGTH, format_quantity } from "../../../utils/quantity-format";

/**
 * The cross-section schema on a beam's properties: its shape, cotes, and which one is `h` —
 * the cote that resists bending, drawn vertically here because that is the plane the 2D
 * mechanism itself is drawn in. A written convention would go unread; this is the thing that
 * actually settles it.
 */

const VIEW_W = 220;
const VIEW_H = 170;
const PLOT_MAX = 84; // px, largest extent the shape's own bounding box may reach
// The shape sits at the schema's own center; the dimensions and leaders are what get placed
// around it, never the other way around.
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const ARROW = 4;

function shape_extent(shape: ProfileShape): { w: number; h: number } {
  switch (shape.kind) {
    case "rect":
      return { w: shape.b, h: shape.h };
    case "round":
      return { w: shape.d, h: shape.d };
    case "box":
      return { w: shape.b, h: shape.h };
    case "tube":
      return { w: shape.d, h: shape.d };
    case "I":
      return { w: shape.b, h: shape.h };
  }
}

const mm = (valueSI: number) => format_quantity(valueSI, LENGTH, 0);

interface DimLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  color: string;
  /** Text sits to the side of the line instead of centered on it — used for the vertical
   *  cote, whose midpoint would otherwise land on the shape itself. */
  labelOffset?: { x: number; y: number };
}

/** A dimension line, arrowheads pointing outward — away from the span they measure, tips at
 *  `x1`/`x2` (or `y1`/`y2`) themselves — label at its midpoint (or `labelOffset` from it).
 *  Horizontal or vertical only — the only two orientations a cote here ever needs. Always
 *  called with the smaller coordinate first, so the first arrow always points toward -x/-y
 *  and the second toward +x/+y. */
const DimLine: React.FC<DimLineProps> = ({
  x1,
  y1,
  x2,
  y2,
  label,
  color,
  labelOffset,
}) => {
  const horizontal = y1 === y2;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const textPos = labelOffset
    ? { x: mid.x + labelOffset.x, y: mid.y + labelOffset.y }
    : { x: mid.x, y: mid.y - 4 };
  // The tip sits `dir*ARROW` past (x,y), away from the line's own span; the base is the pair
  // of points spread perpendicular right at (x,y) — so the point always faces outward.
  const arrowAt = (x: number, y: number, dir: 1 | -1) =>
    horizontal
      ? `${x + dir * ARROW},${y} ${x},${y - ARROW / 1.4} ${x},${y + ARROW / 1.4}`
      : `${x},${y + dir * ARROW} ${x - ARROW / 1.4},${y} ${x + ARROW / 1.4},${y}`;
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1} />
      <polygon points={arrowAt(x1, y1, -1)} strokeWidth={0} />
      <polygon points={arrowAt(x2, y2, 1)} strokeWidth={0} />
      <text
        x={textPos.x}
        y={textPos.y}
        fontSize={10}
        stroke="none"
        textAnchor="middle"
        dominantBaseline={horizontal ? "auto" : "middle"}
      >
        {label}
      </text>
    </g>
  );
};

/** `{ kind: "I" }`'s 12-point outline, centered at the origin. */
function i_beam_points(b: number, h: number, tw: number, tf: number): string {
  const B = b / 2;
  const H = h / 2;
  const w = tw / 2;
  const pts: [number, number][] = [
    [-B, -H],
    [B, -H],
    [B, -H + tf],
    [w, -H + tf],
    [w, H - tf],
    [B, H - tf],
    [B, H],
    [-B, H],
    [-B, H - tf],
    [-w, H - tf],
    [-w, -H + tf],
    [-B, -H + tf],
  ];
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

interface SectionSchemaProps {
  shape: ProfileShape;
}

export const SectionSchema: React.FC<SectionSchemaProps> = ({ shape }) => {
  const { palette } = useTheme();
  const outline = palette.text.primary;
  const dim = palette.text.secondary;
  const accent = palette.primary.main;
  // `background.sunken` (the wrapping `Box`'s own CSS background, below) is a translucent
  // veil (`rgba(…, 0.04)`) meant to stack over its parent — an SVG fill can't reproduce that
  // stacking, so filling shapes with the token directly painted a near-black patch on a dark
  // theme instead of the intended faint tint. `background.sunkenOpaque` is the same tint
  // pre-mixed onto `paper` into one flat, opaque color — same look, safe as a flat SVG fill.
  const canvasBackground = palette.background.sunkenOpaque;
  const hole = canvasBackground;

  const extent = shape_extent(shape);
  const scale = PLOT_MAX / Math.max(extent.w, extent.h);
  const w = extent.w * scale;
  const h = extent.h * scale;

  const left = CX - PLOT_MAX / 2 - 16;
  const bottom = CY + PLOT_MAX / 2 + 16;

  let outlineEl: React.ReactNode;
  /** A leader from near the shape's own corner to a short label — used for a wall
   *  thickness, never a full dimension line: `e`/`tw`/`tf` only need to be named, not
   *  spanned exactly the way `b`/`h`/`d` are. */
  let leader: React.ReactNode = null;

  switch (shape.kind) {
    case "rect":
      outlineEl = (
        <rect
          x={CX - w / 2}
          y={CY - h / 2}
          width={w}
          height={h}
          fill={palette.action.selected}
          stroke={outline}
          strokeWidth={1.5}
        />
      );
      break;
    case "round":
      outlineEl = (
        <circle
          cx={CX}
          cy={CY}
          r={w / 2}
          fill={palette.action.selected}
          stroke={outline}
          strokeWidth={1.5}
        />
      );
      break;
    case "box": {
      const e = shape.e * scale;
      const outerY = CY - h / 2;
      const innerY = outerY + e;
      outlineEl = (
        <>
          <rect
            x={CX - w / 2}
            y={CY - h / 2}
            width={w}
            height={h}
            fill={palette.action.selected}
            stroke={outline}
            strokeWidth={1.5}
          />
          <rect
            x={CX - w / 2 + e}
            y={CY - h / 2 + e}
            width={w - 2 * e}
            height={h - 2 * e}
            fill={hole}
            stroke={outline}
            strokeWidth={1.5}
          />
        </>
      );
      // A small bracket spanning the wall itself — from its outer to its inner edge, ticked at
      // both — rather than a pointer to a single point: what `e` measures should be as legible
      // as `b`/`h`'s own dimension lines are, even though it is too thin here for full arrows.
      leader = (
        <g stroke={dim} fill={dim}>
          <line
            x1={CX - w / 2 - 3}
            y1={outerY}
            x2={CX - w / 2 + 3}
            y2={outerY}
          />
          <line
            x1={CX - w / 2 - 3}
            y1={innerY}
            x2={CX - w / 2 + 3}
            y2={innerY}
          />
          <line x1={CX - w / 2} y1={outerY} x2={CX - w / 2} y2={innerY} />
          <line
            x1={CX - w / 2}
            y1={(outerY + innerY) / 2}
            x2={CX - w / 2 - 14}
            y2={outerY - 10}
          />
          <text
            x={CX - w / 2 - 16}
            y={outerY - 13}
            fontSize={9}
            stroke="none"
            textAnchor="middle"
          >
            e = {mm(shape.e)}
          </text>
        </g>
      );
      break;
    }
    case "tube": {
      const e = shape.e * scale;
      const outerY = CY - w / 2;
      const innerY = outerY + e;
      outlineEl = (
        <>
          <circle
            cx={CX}
            cy={CY}
            r={w / 2}
            fill={palette.action.selected}
            stroke={outline}
            strokeWidth={1.5}
          />
          <circle
            cx={CX}
            cy={CY}
            r={w / 2 - e}
            fill={hole}
            stroke={outline}
            strokeWidth={1.5}
          />
        </>
      );
      // Same bracket as the box's wall, along the top radius instead of a corner.
      leader = (
        <g stroke={dim} fill={dim}>
          <line x1={CX - 3} y1={outerY} x2={CX + 3} y2={outerY} />
          <line x1={CX - 3} y1={innerY} x2={CX + 3} y2={innerY} />
          <line x1={CX} y1={outerY} x2={CX} y2={innerY} />
          <line x1={CX} y1={(outerY + innerY) / 2} x2={CX} y2={outerY - 10} />
          <text
            x={CX}
            y={outerY - 13}
            fontSize={9}
            stroke="none"
            textAnchor="middle"
          >
            e = {mm(shape.e)}
          </text>
        </g>
      );
      break;
    }
    case "I": {
      const tw = shape.tw * scale;
      const tf = shape.tf * scale;
      outlineEl = (
        <polygon
          points={i_beam_points(w, h, tw, tf)}
          transform={`translate(${CX}, ${CY})`}
          fill={palette.action.selected}
          stroke={outline}
          strokeWidth={1.5}
        />
      );
      leader = (
        <g stroke={dim} fill={dim}>
          <line x1={CX + tw / 2} y1={CY} x2={CX + w / 2 + 12} y2={CY} />
          <text
            x={CX + w / 2 + 14}
            y={CY + 3}
            fontSize={9}
            stroke="none"
            textAnchor="start"
          >
            tw = {mm(shape.tw)}
          </text>
          <line
            x1={CX}
            y1={CY - h / 2 + tf / 2}
            x2={CX - w / 2 - 12}
            y2={CY - h / 2 + tf / 2}
          />
          <text
            x={CX - w / 2 - 14}
            y={CY - h / 2 + tf / 2 + 3}
            fontSize={9}
            stroke="none"
            textAnchor="end"
          >
            tf = {mm(shape.tf)}
          </text>
        </g>
      );
      break;
    }
  }

  const wLabel =
    shape.kind === "round" || shape.kind === "tube" ? mm(shape.d) : mm(shape.b);
  const hLabel =
    shape.kind === "round" || shape.kind === "tube" ? mm(shape.d) : mm(shape.h);

  return (
    <Box
      sx={{
        borderRadius: 3,
        backgroundColor: "background.sunken",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{
          width: "100%",
          maxWidth: 260,
          height: "auto",
          display: "block",
        }}
      >
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={canvasBackground} />
        {outlineEl}
        {leader}
        <DimLine
          x1={CX - w / 2}
          y1={bottom}
          x2={CX + w / 2}
          y2={bottom}
          label={wLabel}
          color={dim}
        />
        <DimLine
          x1={left}
          y1={CY - h / 2}
          x2={left}
          y2={CY + h / 2}
          label={hLabel}
          color={dim}
          labelOffset={{ x: -10, y: 0 }}
        />
        {/* The bending axis itself: horizontal, through the centroid — the neutral fibre a
         *  technical drawing's own centerline convention marks, not a cote to measure. */}
        <g stroke={accent}>
          <line
            x1={CX - w / 2 - 12}
            y1={CY}
            x2={CX + w / 2 + 12}
            y2={CY}
            strokeWidth={1}
            strokeDasharray="6,2,1,2"
          />
        </g>
      </svg>
    </Box>
  );
};

export default SectionSchema;
