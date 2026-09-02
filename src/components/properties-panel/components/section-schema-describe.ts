/**
 * What each profile kind looks like and which cotes are read off it — the only file to touch
 * when a new `ProfileShape` kind appears. Everything here is expressed against the *drawn*
 * geometry (`DrawnShape`, px, centred on the section's own centre) and never against the view:
 * where a cote ends up on screen is `section-schema-layout`'s business.
 *
 * Cotes are placed to cost the schema as little height as possible — a thickness goes out to
 * the side rather than off the top, since the panel has width to spare and the profiles that
 * matter are tall.
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
 * Measured on the section, its dimension line pushed clear of it on `side` with extension lines
 * running back to the two measured points. For a cote those lines can reach without cutting
 * across the section — an overall extent, or a wall lying on the bounding box edge.
 *
 * The measured axis follows from `side`: a cote read off a vertical side measures vertically,
 * and `at` is then its x.
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
 * Drawn where the feature actually is, with a leader running out of the section to carry the
 * label. For a feature buried inside the outline, which extension lines could not reach without
 * cutting across the section.
 */
export interface LeaderCote extends CoteBase {
  kind: "leader";
  /** The two measured points, `from` being the one the leader leaves by. */
  from: (d: DrawnShape) => Point;
  to: (d: DrawnShape) => Point;
  /** Unit direction the leader runs in. */
  out: Point;
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

/** The overall width, read off the bottom. */
const width_cote = (value: number): Annotation => ({
  kind: "offset",
  name: "b",
  value,
  side: "bottom",
  span: (d) => [-d.hw, d.hw],
  at: (d) => d.hh,
});

/** The bending cote, read off the left — vertical here because that is the plane the 2D
 *  mechanism is drawn in, which is what settles which cote resists bending. */
const height_cote = (value: number): Annotation => ({
  kind: "offset",
  name: "h",
  value,
  side: "left",
  span: (d) => [-d.hh, d.hh],
  at: (d) => -d.hw,
});

/** The diameter, read off the bottom across the horizontal tangent points. */
const diameter_cote = (value: number): Annotation => ({
  kind: "offset",
  name: "d",
  value,
  side: "bottom",
  span: (d) => [-d.hw, d.hw],
  at: () => 0,
});

/** A straight wall's thickness, read off the right at the top corner: both its points lie on the
 *  bounding box, so extension lines reach them, and the side costs the schema no height. */
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

const ANGLE = (SECTION_SCHEMA.ROUND_WALL_ANGLE * Math.PI) / 180;
const RADIAL = { x: Math.cos(ANGLE), y: -Math.sin(ANGLE) };

export function describe_shape(shape: ProfileShape): ShapeDescription {
  switch (shape.kind) {
    case "rect":
      return {
        extent: { w: shape.b, h: shape.h },
        thicknesses: {},
        centroid: CENTRED,
        path: (d) => rect_path(-d.hw, -d.hh, d.hw, d.hh),
        annotations: [width_cote(shape.b), height_cote(shape.h)],
      };

    case "box":
      return {
        extent: { w: shape.b, h: shape.h },
        thicknesses: { e: shape.e },
        centroid: CENTRED,
        path: (d) =>
          `${rect_path(-d.hw, -d.hh, d.hw, d.hh)} ${rect_path(-d.hw + d.t.e, -d.hh + d.t.e, d.hw - d.t.e, d.hh - d.t.e)}`,
        annotations: [
          width_cote(shape.b),
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
          // A bore has no straight edge to hang a cote off, so the wall is read along a radius —
          // the only direction that crosses it squarely.
          {
            kind: "leader",
            name: "e",
            value: shape.e,
            from: (d) => ({ x: d.hw * RADIAL.x, y: d.hw * RADIAL.y }),
            to: (d) => ({
              x: (d.hw - d.t.e) * RADIAL.x,
              y: (d.hw - d.t.e) * RADIAL.y,
            }),
            out: RADIAL,
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
          width_cote(shape.b),
          height_cote(shape.h),
          wall_cote("tf", shape.tf, "tf"),
          // Across the web, three quarters of the way down to the bottom flange: clear of the
          // neutral axis, and low enough to pass under the run `tf`'s own label makes down the
          // right-hand side. Its leader then leaves through the open notch.
          {
            kind: "leader",
            name: "tw",
            value: shape.tw,
            from: (d) => ({ x: d.t.tw / 2, y: ((d.hh - d.t.tf) * 3) / 4 }),
            to: (d) => ({ x: -d.t.tw / 2, y: ((d.hh - d.t.tf) * 3) / 4 }),
            out: { x: 1, y: 0 },
          },
        ],
      };
  }
}
