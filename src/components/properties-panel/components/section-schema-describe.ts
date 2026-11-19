/**
 * What each profile kind looks like and which cotes are read off it — the only file to touch when a new `ProfileShape` kind appears.
 * Everything here is expressed against the *drawn* geometry (`DrawnShape`, px, centred on the section's own centre) and never against the view: where a cote ends up on screen is `section-schema-layout`'s business.
 *
 * Cotes stand to the side of the section or inside it, never above or below: the section takes the schema's full height, and the neutral axis sits at the same height whatever the profile.
 */

import { ProfileShape } from "../../../types/material";
import { SECTION_SCHEMA } from "../../../constants/rendering-specs";

export interface Point {
  x: number;
  y: number;
}

/** Which side of the section a cote is pushed out to. */
export type Side = "left" | "right" | "top" | "bottom";

/** The drawn section a description resolves its geometry against. */
export interface DrawnShape {
  /** Half-extents of the drawn outline. */
  hw: number;
  hh: number;
  /** Drawn width of each thickness parameter, floored so a thin wall stays legible. */
  t: Readonly<Record<string, number>>;
}

interface CoteBase {
  /** Matches the field that edits this cote, so the schema and the inputs name the same thing. */
  name: string;
  /** SI, always the true value — the drawing may go out of scale, the cote never does. */
  value: number;
}

/**
 * Measured on the section, its dimension line pushed clear of it on `side` with extension lines running back to the two measured points.
 * For a cote those lines can reach without cutting across the section — an overall extent, or a wall lying on the bounding box edge.
 *
 * The measured axis follows from `side`: a cote read off a vertical side measures vertically, and `at` is then its x.
 */
export interface OffsetCote extends CoteBase {
  kind: "offset";
  side: Side;
  /** The two measured coordinates, along the axis this side is read across. */
  span: (d: DrawnShape) => [number, number];
  /** Where they sit on the other axis. */
  at: (d: DrawnShape) => number;
}

/**
 * Drawn where the feature actually is, with a leader running out of the section to carry the label.
 * For a feature buried inside the outline, which extension lines could not reach without cutting across the section.
 */
export interface LeaderCote extends CoteBase {
  kind: "leader";
  /** The two measured points, `from` being the one the leader leaves by. */
  from: (d: DrawnShape) => Point;
  to: (d: DrawnShape) => Point;
  /** Unit direction the leader runs in. */
  out: Point;
  /** Arrowheads set outside the two points, pointing in: what a cote across a whole section reads best with. */
  arrowsOutside?: true;
  /** The arrowheads alone, no line drawn between them: across the section, a line would read as part of its drawing. */
  open?: true;
}

export type Annotation = OffsetCote | LeaderCote;

export interface ShapeDescription {
  /** True extent, SI — what the layout draws and clamps. */
  extent: { w: number; h: number };
  /** Thickness parameters, SI, by the name their `DrawnShape.t` entry takes. */
  thicknesses: Readonly<Record<string, number>>;
  /** Where the neutral axis is drawn, offset from the section's centre. */
  centroid: (d: DrawnShape) => Point;
  /** The outline as one `evenodd` path: subpaths past the first read as holes. */
  path: (d: DrawnShape) => string;
  annotations: Annotation[];
}

const rect_path = (x0: number, y0: number, x1: number, y1: number) =>
  `M ${x0},${y0} H ${x1} V ${y1} H ${x0} Z`;

const circle_path = (r: number) =>
  `M ${-r},0 a ${r},${r} 0 1 0 ${2 * r},0 a ${r},${r} 0 1 0 ${-2 * r},0 Z`;

/** The 12-point outline of an I, centred on the origin. */
function i_path(hw: number, hh: number, tw: number, tf: number): string {
  const w = tw / 2;
  const pts: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, -hh + tf],
    [w, -hh + tf],
    [w, hh - tf],
    [hw, hh - tf],
    [hw, hh],
    [-hw, hh],
    [-hw, hh - tf],
    [-w, hh - tf],
    [-w, -hh + tf],
    [-hw, -hh + tf],
  ];
  return `M ${pts.map(([x, y]) => `${x},${y}`).join(" L ")} Z`;
}

const CENTRED = () => ({ x: 0, y: 0 });

const { FONT, TEXT_GAP, ARROW_SPREAD } = SECTION_SCHEMA;

/**
 * Where a horizontal cote stands, its label set above it, for the two together to sit centred between `top` and `bottom`.
 * `spread` is how far its arrowheads reach below the line, where they stand inside that band.
 */
const centred_with_label = (top: number, bottom: number, spread = 0) =>
  (top + bottom + FONT + TEXT_GAP - spread) / 2;

/** The width cote below the neutral axis, centred with its label down to `bottom` — but on a section too low for that, kept well clear of `bottom` all the same. */
const under_axis = (bottom: number) =>
  Math.min(centred_with_label(0, bottom), bottom * 0.85);

/** The overall width, read at height `at` (below the neutral axis) by two arrowheads pointing in at the edges, its label carried out to the right. */
const width_cote = (
  value: number,
  at: (d: DrawnShape) => number,
): Annotation => ({
  kind: "leader",
  name: "b",
  value,
  from: (d) => ({ x: d.hw, y: at(d) }),
  to: (d) => ({ x: -d.hw, y: at(d) }),
  out: { x: 1, y: 0 },
  arrowsOutside: true,
  open: true,
});

/** The bending cote, read off the left — vertical here because that is the plane the 2D
 * mechanism is drawn in, which is what settles which cote resists bending. */
const height_cote = (value: number): Annotation => ({
  kind: "offset",
  name: "h",
  value,
  side: "left",
  span: (d) => [-d.hh, d.hh],
  at: (d) => -d.hw,
});

const ANGLE = (SECTION_SCHEMA.ROUND_COTE_ANGLE * Math.PI) / 180;
/** The two directions a round section is read along, both just below the horizontal: off it so a cote does not sit on the neutral axis, under it so its label rises no higher than the section. */
const LOWER_RIGHT = { x: Math.cos(ANGLE), y: Math.sin(ANGLE) };
const LOWER_LEFT = { x: -LOWER_RIGHT.x, y: LOWER_RIGHT.y };

/** The diameter, read through the centre by two arrowheads pointing in at the outline, and carried out to the lower left — a round section has no `h` cote taking that side. */
const diameter_cote = (value: number): Annotation => ({
  kind: "leader",
  name: "d",
  value,
  from: (d) => ({ x: d.hw * LOWER_LEFT.x, y: d.hw * LOWER_LEFT.y }),
  to: (d) => ({ x: -d.hw * LOWER_LEFT.x, y: -d.hw * LOWER_LEFT.y }),
  out: LOWER_LEFT,
  arrowsOutside: true,
  open: true,
});

/** A straight wall's thickness, read off the right at the top corner: both its points lie on the
 * bounding box, so extension lines reach them, and the side costs the schema no height. */
const wall_cote = (
  name: string,
  value: number,
  thickness: string,
): Annotation => ({
  kind: "offset",
  name,
  value,
  side: "right",
  span: (d) => [-d.hh, -d.hh + d.t[thickness]],
  at: (d) => d.hw,
});


/** The web's cote, under the top flange of an I, its arrowheads never down on the neutral axis however low the flange. */
const tw_height = (d: DrawnShape) =>
  Math.min(
    centred_with_label(-(d.hh - d.t.tf), 0, ARROW_SPREAD),
    -ARROW_SPREAD - 1,
  );

export function describe_shape(shape: ProfileShape): ShapeDescription {
  switch (shape.kind) {
    case "rect":
      return {
        extent: { w: shape.b, h: shape.h },
        thicknesses: {},
        centroid: CENTRED,
        path: (d) => rect_path(-d.hw, -d.hh, d.hw, d.hh),
        annotations: [
          width_cote(shape.b, (d) => under_axis(d.hh)),
          height_cote(shape.h),
        ],
      };

    case "box":
      return {
        extent: { w: shape.b, h: shape.h },
        thicknesses: { e: shape.e },
        centroid: CENTRED,
        path: (d) =>
          `${rect_path(-d.hw, -d.hh, d.hw, d.hh)} ${rect_path(-d.hw + d.t.e, -d.hh + d.t.e, d.hw - d.t.e, d.hh - d.t.e)}`,
        annotations: [
          // At the bore's height, below the neutral axis as on a solid section.
          width_cote(shape.b, (d) => under_axis(d.hh - d.t.e)),
          height_cote(shape.h),
          wall_cote("e", shape.e, "e"),
        ],
      };

    case "round":
      return {
        extent: { w: shape.d, h: shape.d },
        thicknesses: {},
        centroid: CENTRED,
        path: (d) => circle_path(d.hw),
        annotations: [diameter_cote(shape.d)],
      };

    case "tube":
      return {
        extent: { w: shape.d, h: shape.d },
        thicknesses: { e: shape.e },
        centroid: CENTRED,
        path: (d) => `${circle_path(d.hw)} ${circle_path(d.hw - d.t.e)}`,
        annotations: [
          diameter_cote(shape.d),
          // A bore has no straight edge to hang a cote off, so the wall is read along a radius — the only direction that crosses it squarely — on the side the diameter leaves free.
          {
            kind: "leader",
            name: "e",
            value: shape.e,
            from: (d) => ({ x: d.hw * LOWER_RIGHT.x, y: d.hw * LOWER_RIGHT.y }),
            to: (d) => ({
              x: (d.hw - d.t.e) * LOWER_RIGHT.x,
              y: (d.hw - d.t.e) * LOWER_RIGHT.y,
            }),
            out: LOWER_RIGHT,
          },
        ],
      };

    case "I":
      return {
        extent: { w: shape.b, h: shape.h },
        thicknesses: { tw: shape.tw, tf: shape.tf },
        centroid: CENTRED,
        path: (d) => i_path(d.hw, d.hh, d.t.tw, d.t.tf),
        annotations: [
          // Its arrows on the bottom flange's tips, its label carried out to the right.
          width_cote(shape.b, (d) => d.hh - d.t.tf / 2),
          height_cote(shape.h),
          wall_cote("tf", shape.tf, "tf"),
          // Across the web, it and its label centred between the neutral axis and the top flange, its leader leaving through the open notch to the left, where it balances the cotes on the right.
          {
            kind: "leader",
            name: "tw",
            value: shape.tw,
            from: (d) => ({ x: -d.t.tw / 2, y: tw_height(d) }),
            to: (d) => ({ x: d.t.tw / 2, y: tw_height(d) }),
            out: { x: -1, y: 0 },
          },
        ],
      };
  }
}
