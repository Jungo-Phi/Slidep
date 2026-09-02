import React from "react";
import { Box, useTheme } from "@mui/material";
import { ProfileShape } from "../../../types/material";
import { SECTION_SCHEMA } from "../../../constants/rendering-specs";
import {
  ResolvedCote,
  Segment,
  arrowhead_points,
  layout_section_schema,
} from "./section-schema-layout";

/**
 * The cross-section schema on a beam's properties: its shape, its cotes, and which one is `h` —
 * the cote that resists bending, drawn vertically here because that is the plane the 2D
 * mechanism itself is drawn in. A written convention would go unread; this is the thing that
 * actually settles it.
 *
 * Only the painting lives here: what to draw comes from `section-schema-describe`, where to put
 * it from `section-schema-layout`, and how big from `SECTION_SCHEMA`.
 */

const line_props = ({ from, to }: Segment) => ({
  x1: from.x,
  y1: from.y,
  x2: to.x,
  y2: to.y,
});

interface CoteProps {
  cote: ResolvedCote;
  color: string;
}

const Cote: React.FC<CoteProps> = ({ cote, color }) => (
  <g stroke={color} fill={color} strokeWidth={SECTION_SCHEMA.DIM_WIDTH}>
    {cote.attachments.map((seg, i) => (
      <line key={i} {...line_props(seg)} strokeWidth={SECTION_SCHEMA.EXT_WIDTH} />
    ))}
    {[cote.line, ...cote.leader].map((seg, i) => (
      <line key={i} {...line_props(seg)} />
    ))}
    {cote.heads.map((head, i) => (
      <polygon
        key={i}
        points={arrowhead_points(head)
          .map((p) => `${p.x},${p.y}`)
          .join(" ")}
        strokeWidth={0}
      />
    ))}
    <text
      x={cote.text.x}
      y={cote.text.y}
      fontSize={SECTION_SCHEMA.FONT}
      stroke="none"
      textAnchor={cote.text.anchor}
      dominantBaseline={cote.text.baseline}
      transform={
        cote.text.rotated
          ? `rotate(-90 ${cote.text.x} ${cote.text.y})`
          : undefined
      }
    >
      {cote.label}
    </text>
  </g>
);

interface SectionSchemaProps {
  shape: ProfileShape;
}

export const SectionSchema: React.FC<SectionSchemaProps> = ({ shape }) => {
  const { palette } = useTheme();
  const { viewBox, path, cotes, neutralAxis } = layout_section_schema(shape);

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        style={{
          // One drawing unit to the pixel, so a label or a stroke keeps the same weight on every
          // profile however wide a view that profile ended up needing.
          width: viewBox.w,
          maxWidth: "100%",
          height: "auto",
          display: "block",
        }}
      >
        <path
          d={path}
          fillRule="evenodd"
          fill={palette.action.selected}
          stroke={palette.text.primary}
          strokeWidth={SECTION_SCHEMA.OUTLINE_WIDTH}
          strokeLinejoin="round"
        />
        {/* The bending axis: horizontal, through the centroid — the neutral fibre a technical
         *  drawing's own centerline convention marks, not a cote to measure. */}
        <line
          {...line_props(neutralAxis)}
          stroke={palette.primary.main}
          strokeWidth={SECTION_SCHEMA.DIM_WIDTH}
          strokeDasharray={SECTION_SCHEMA.AXIS_DASH}
        />
        {cotes.map((cote) => (
          <Cote key={cote.name} cote={cote} color={palette.text.secondary} />
        ))}
      </svg>
    </Box>
  );
};

export default SectionSchema;
