/**
 * Where everything in a section schema lands, the section's own centre being the origin: the section is drawn at a fixed height, each cote is placed at a constant distance from the section's own edge — never from a fixed box, which is what keeps the spacing identical from one profile to the next — and the view is then cropped to that, its height the same for every profile.
 * Cotes sharing a side stack, and one read off a side stands further out rather than cross a leader, so they cannot collide.
 *
 * A cote too narrow to carry its own label does not give up on measuring: it runs its dimension line on past the span and sets the label on that run, which is what a drawing does with a wall thickness.
 * Which way it runs is chosen to cost the schema no height.
 *
 * The drawing may go out of scale to stay readable (see `MAX_ASPECT` and `MIN_THICKNESS` in `SECTION_SCHEMA`); the values the cotes carry are always the true ones.
 */

import { ProfileShape } from "../../../types/material";
import { SECTION_SCHEMA } from "../../../constants/rendering-specs";
import { LENGTH, format_mantissa } from "../../../utils/quantity-format";
import { arial_text_width } from "../../../utils/text-width";
import {
  Annotation,
  DrawnShape,
  LeaderCote,
  OffsetCote,
  Point,
  Side,
  describe_shape,
} from "./section-schema-describe";

const {
  SECTION_SIZE,
  PAD,
  FONT,
  DIM_OFFSET,
  DIM_STEP,
  TEXT_GAP,
  EXT_OVERSHOOT,
  ARROW,
  ARROW_SPREAD,
  ARROW_TAIL,
  AXIS_OVERSHOOT,
  MAX_ASPECT,
  MAX_WIDTH,
  MIN_THICKNESS,
  MIN_THICKNESS_PX,
  MAX_THICKNESS,
} = SECTION_SCHEMA;

export interface Segment {
  from: Point;
  to: Point;
}

/** An arrowhead closing one end of a dimension: its tip on the measured point, its back edge
 * centred on `base` — inside the span, or outside it when the span is too short to seat it. */
export interface ArrowHead {
  tip: Point;
  base: Point;
}

export interface CoteText {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  baseline: "middle" | "hanging" | "auto";
  /** Turned a quarter-turn to read bottom-to-top, alongside a vertical dimension line — which
   * then runs along the label's own baseline, underlining it. */
  rotated: boolean;
}

export interface ResolvedCote {
  name: string;
  label: string;
  /** The measured span, an arrowhead closing each end. */
  line: Segment;
  /** Only the arrowheads and their tails are drawn, the span between them left clear. */
  open?: true;
  heads: ArrowHead[];
  /** The dimension line run on a little past each arrowhead set outside the span against the section itself. */
  tails: Segment[];
  /** Dimension line carried on past the span, out to where the label could fit. */
  leader: Segment[];
  /** Extension lines back to the measured points. */
  attachments: Segment[];
  text: CoteText;
}

export interface SchemaLayout {
  /** Cropped to everything the drawing covers, labels included, plus `PAD`. */
  viewBox: { x: number; y: number; w: number; h: number };
  /** The section as it came out on screen, once fitted and clamped. */
  drawn: DrawnShape;
  /** The outline, `fill-rule="evenodd"` — subpaths past the first are holes. Centred on the
   * origin, like everything else here. */
  path: string;
  cotes: ResolvedCote[];
  neutralAxis: Segment;
}

/** A cote reads `name = value`, in millimetres. */
function cote_label(a: Annotation): string {
  const precision = Math.abs(a.value) < 10e-3 ? 1 : 0;
  return `${a.name} = ${format_mantissa(a.value, LENGTH, precision)}`;
}

/** Estimated rather than measured: the dimension line is drawn to this width as well, running under the label, so a letter as narrow as `t` counted at an average width would leave the line visibly poking out past the text. */
export const text_width = (label: string): number =>
  arial_text_width(label, FONT);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const seg = (from: Point, to: Point): Segment => ({ from, to });
const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });
const scale = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });

/** `sectionSize` sets the drawn size of the section alone: its cotes keep their own sizes, so a smaller drawing stays as legible. */
export function layout_section_schema(
  shape: ProfileShape,
  sectionSize: number = SECTION_SIZE,
): SchemaLayout {
  const desc = describe_shape(shape);

  const ratio = desc.extent.w / desc.extent.h;
  const drawn_ratio = clamp(ratio, 1 / MAX_ASPECT, MAX_ASPECT);
  // Full height, every cote standing to the side or inside: only a section wider than `MAX_WIDTH` heights gives some of it up.
  const h =
    drawn_ratio <= MAX_WIDTH
      ? sectionSize
      : (sectionSize * MAX_WIDTH) / drawn_ratio;
  const w = h * drawn_ratio;

  // Thicknesses take one scalar scale rather than their own axis: a single parameter has to come out as a single drawn width, whatever the aspect clamp did to the two axes.
  const thickness_scale = Math.min(w / desc.extent.w, h / desc.extent.h);
  const true_widths = Object.entries(desc.thicknesses).map(
    ([name, value]) => [name, value * thickness_scale] as const,
  );
  // Thinning is fixed by one gain shared by every wall, not by flooring each on its own: two walls that really do differ must not come out of the clamp drawn the same.
  const short = Math.min(w, h);
  const floor = Math.max(short * MIN_THICKNESS, MIN_THICKNESS_PX);
  const thinnest = Math.min(...true_widths.map(([, width]) => width));
  const gain = true_widths.length ? Math.max(1, floor / thinnest) : 1;
  const thickened = gain > 1 + 1e-9;
  const t: Record<string, number> = {};
  for (const [name, width] of true_widths) {
    t[name] = thickened ? Math.min(width * gain, short * MAX_THICKNESS) : width;
  }

  const d: DrawnShape = { hw: w / 2, hh: h / 2, t };

  // The half-height every schema at this size is cropped to (see `crop`).
  const limit = sectionSize / 2 + ARROW;

  // Leaders are drawn where their feature is, so they are placed first and the cotes read off a side make way for them.
  const leaderBoxes = desc.annotations.flatMap((a) =>
    a.kind === "leader" ? cote_boxes(resolve_leader(a, cote_label(a), d)) : [],
  );
  const ranks: Partial<Record<Side, number>> = {};
  const cotes = desc.annotations.map((a) => {
    const label = cote_label(a);
    if (a.kind === "leader") return resolve_leader(a, label, d);
    const rank = ranks[a.side] ?? 0;
    ranks[a.side] = rank + 1;
    const placed = resolve_offset(a, label, rank, d, limit);
    const push = clearance(placed, a.side, leaderBoxes);
    return push > 0 ? resolve_offset(a, label, rank, d, limit, push) : placed;
  });

  const centroid = desc.centroid(d);
  const neutralAxis = seg(
    { x: -d.hw - AXIS_OVERSHOOT, y: centroid.y },
    { x: d.hw + AXIS_OVERSHOOT, y: centroid.y },
  );

  return {
    viewBox: crop(
      [
        { x0: -d.hw, y0: -d.hh, x1: d.hw, y1: d.hh },
        segment_box(neutralAxis),
        ...cotes.flatMap(cote_boxes),
      ],
      sectionSize,
    ),
    drawn: d,
    path: desc.path(d),
    cotes,
    neutralAxis,
  };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const point_box = (...points: Point[]): Box => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
});

const segment_box = (s: Segment): Box => point_box(s.from, s.to);

/** What a label covers, from its anchor, its baseline, and whether it is turned. */
export function text_box(text: CoteText, label: string): Box {
  const width = text_width(label);
  const [a0, a1] =
    text.anchor === "start"
      ? [0, width]
      : text.anchor === "end"
        ? [-width, 0]
        : [-width / 2, width / 2];
  const [c0, c1] =
    text.baseline === "hanging"
      ? [0, FONT]
      : text.baseline === "middle"
        ? [-FONT / 2, FONT / 2]
        : [-FONT, 0];
  // A quarter-turn anticlockwise sends the reading direction up and the baseline out sideways.
  return text.rotated
    ? { x0: text.x + c0, y0: text.y - a1, x1: text.x + c1, y1: text.y - a0 }
    : { x0: text.x + a0, y0: text.y + c0, x1: text.x + a1, y1: text.y + c1 };
}

const cote_boxes = (cote: ResolvedCote): Box[] => [
  ...mark_boxes(cote),
  ...cote.attachments.map(segment_box),
];

/** The boxes of a cote's own marks, its extension lines left out: those run back to the section, which is what the cote stands clear of. */
const mark_boxes = (cote: ResolvedCote): Box[] => [
  ...(cote.open ? [] : [segment_box(cote.line)]),
  ...cote.heads.map(arrowhead_box),
  ...cote.tails.map(segment_box),
  ...cote.leader.map(segment_box),
  text_box(cote.text, cote.label),
];

/**
 * How much further out a cote read off the left or right has to stand so that none of its marks crosses a leader — on a small I, the flange's label runs down the right-hand side across the web's leader.
 * Its extension lines lengthen to follow, so the cote keeps the style it has everywhere else.
 */
function clearance(cote: ResolvedCote, side: Side, obstacles: Box[]): number {
  if (side !== "left" && side !== "right") return 0;
  const own = mark_boxes(cote);
  const y0 = Math.min(...own.map((b) => b.y0));
  const y1 = Math.max(...own.map((b) => b.y1));
  const right = side === "right";
  const inner = right
    ? Math.min(...own.map((b) => b.x0))
    : Math.max(...own.map((b) => b.x1));
  let push = 0;
  for (const o of obstacles) {
    if (o.y1 < y0 || o.y0 > y1) continue;
    push = Math.max(
      push,
      right ? o.x1 + TEXT_GAP - inner : inner - (o.x0 - TEXT_GAP),
    );
  }
  return push;
}

/**
 * The view the drawing needs, plus `PAD`.
 * Horizontally it is widened to whichever side reaches further, so the section — drawn about the origin — stays centred in the panel however lopsided its cotes are.
 * Vertically it is the same for every profile drawn at `sectionSize` — its full height and an arrowhead set outside it, top and bottom — so the neutral axis sits at the same height whichever profile is shown, with even margins above and below.
 */
function crop(
  boxes: Box[],
  sectionSize: number,
): { x: number; y: number; w: number; h: number } {
  const half = Math.max(...boxes.flatMap((b) => [-b.x0, b.x1])) + PAD;
  const tall =
    Math.max(...boxes.flatMap((b) => [-b.y0, b.y1]), sectionSize / 2 + ARROW) +
    PAD;
  return { x: -half, y: -tall, w: 2 * half, h: 2 * tall };
}

/** An arrowhead's tip and the two corners its back edge spreads to. */
export function arrowhead_points(head: ArrowHead): Point[] {
  const dx = head.tip.x - head.base.x;
  const dy = head.tip.y - head.base.y;
  const length = Math.hypot(dx, dy) || 1;
  const across = {
    x: (-dy / length) * ARROW_SPREAD,
    y: (dx / length) * ARROW_SPREAD,
  };
  return [head.tip, add(head.base, across), add(head.base, scale(across, -1))];
}

const arrowhead_box = (head: ArrowHead): Box =>
  point_box(...arrowhead_points(head));

/** Tip on the measured point, body falling back inside the span — or out of it when the span is
 * too short to seat both heads.
 * `out` points away from the span. */
const head = (tip: Point, out: Point, outside: boolean): ArrowHead => ({
  tip,
  base: add(tip, scale(out, outside ? ARROW : -ARROW)),
});

/** The dimension line behind an arrowhead set outside the span, run a little past its back. */
const tail = ({ tip, base }: ArrowHead): Segment =>
  seg(tip, add(tip, scale(add(base, scale(tip, -1)), (ARROW + ARROW_TAIL) / ARROW)));

/**
 * How a label that will not fit between its own two measured points is carried out on the dimension line instead: `run` is the unit direction the line is continued in and `start` the point it leaves from.
 * The label then stands off that continuation exactly as it would off a dimension line it did fit on, so the two placements read the same.
 */
function carried_label(
  start: Point,
  run: Point,
  run_in: number,
  width: number,
  rotated: boolean,
): { leader: Segment; text: CoteText } {
  const clearance = add(start, scale(run, run_in));
  const end = add(clearance, scale(run, width));
  const forward = run.x + run.y > 0;
  // Off the line the same way and the same distance a label that fitted would have been.
  const aside = run.y !== 0 ? { x: -TEXT_GAP, y: 0 } : { x: 0, y: -TEXT_GAP };
  return {
    leader: seg(start, end),
    text: rotated
      ? {
          // Turned, the label reads upward from its anchor, so the anchor is its lower end.
          x: clearance.x + aside.x,
          y: forward ? end.y : clearance.y,
          anchor: "start",
          baseline: "auto",
          rotated: true,
        }
      : {
          x: clearance.x,
          y: clearance.y + aside.y,
          anchor: forward ? "start" : "end",
          baseline: "auto",
          rotated: false,
        },
  };
}

function resolve_offset(
  a: OffsetCote,
  label: string,
  rank: number,
  d: DrawnShape,
  /** How far from the neutral axis a carried label may run: the half-height every schema at this size shares. */
  limit: number,
  /** Extra distance out from the section, to clear a leader (see `clearance`). */
  push = 0,
): ResolvedCote {
  const [lo, hi] = a.span(d);
  const from = Math.min(lo, hi);
  const to = Math.max(lo, hi);
  const at = a.at(d);
  const vertical = a.side === "left" || a.side === "right";
  // Which way the cote is read from the section: +1 towards bottom/right, -1 towards top/left.
  const dir = a.side === "bottom" || a.side === "right" ? 1 : -1;
  const reach =
    (vertical ? d.hw : d.hh) + DIM_OFFSET + rank * DIM_STEP + push;
  const width = text_width(label);

  /** A point on the dimension line, `along` measured on the span's own axis. */
  const on_line = (along: number): Point =>
    vertical ? { x: dir * reach, y: along } : { x: along, y: dir * reach };
  /** The matching point on the section, where the extension line starts. */
  const on_section = (along: number): Point =>
    vertical ? { x: at, y: along } : { x: along, y: at };
  const along_axis = (s: number): Point =>
    vertical ? { x: 0, y: s } : { x: s, y: 0 };

  const arrows_outside = to - from < 2 * ARROW;
  const line = seg(on_line(from), on_line(to));
  const heads = [
    head(line.from, along_axis(-1), arrows_outside),
    head(line.to, along_axis(1), arrows_outside),
  ];
  const common = {
    name: a.name,
    label,
    line,
    heads,
    // Its heads stand on extension lines, which already run on past them.
    tails: [],
    attachments: [from, to].map((v) =>
      seg(
        on_section(v),
        vertical
          ? { x: dir * (reach + EXT_OVERSHOOT), y: v }
          : { x: v, y: dir * (reach + EXT_OVERSHOOT) },
      ),
    ),
  };

  // The label may sit between the two measured points as long as it does not reach the extension lines standing at them — that, and nothing about the span's absolute size, is what says a cote is too cramped to carry its own label.
  if (width <= to - from) {
    return {
      ...common,
      leader: [],
      text: vertical
        ? {
            x: dir * reach - TEXT_GAP,
            y: (from + to) / 2,
            anchor: "middle",
            baseline: "auto",
            rotated: true,
          }
        : {
            x: (from + to) / 2,
            y: dir * reach - TEXT_GAP,
            anchor: "middle",
            baseline: "auto",
            rotated: false,
          },
    };
  }

  // Stood off the line, set level: costs width, which the panel has to spare, rather than height.
  const level: ResolvedCote = {
    ...common,
    leader: [],
    text: {
      x: dir * (reach + TEXT_GAP),
      y: (from + to) / 2,
      anchor: dir > 0 ? "start" : "end",
      baseline: "middle",
      rotated: false,
    },
  };
  // A vertical cote spanning the whole section has no section left to run alongside.
  if (vertical && to - from >= 2 * d.hh - 1e-6) return level;
  // The line runs on towards the section's own middle rather than away from it — alongside the section, where the other way would push the view out past it.
  // A horizontal cote pays no height whichever way it runs, so one spanning the whole width simply goes left.
  const forward = (from + to) / 2 < 0 ? 1 : -1;
  const carried = carried_label(
    on_line(forward > 0 ? to : from),
    along_axis(forward),
    ARROW + TEXT_GAP,
    width,
    vertical,
  );
  // On a flat section the run would reach past the height every schema shares.
  if (vertical && Math.abs(carried.leader.to.y) > limit) return level;
  return { ...common, leader: [carried.leader], text: carried.text };
}

function resolve_leader(
  a: LeaderCote,
  label: string,
  d: DrawnShape,
): ResolvedCote {
  const from = a.from(d);
  const to = a.to(d);
  const line = seg(from, to);
  // The leader picks up where the cote stops on the section itself, never at the bounding box: what it has to clear is the feature it measures, and a wall buried in the section is already clear of everything else.
  //
  // `DIM_OFFSET` is calibrated for cotes that already start at the section's edge; run along a single axis from deep inside instead (a web's `tw`) and it can overshoot the edge, reaching as far out as an edge cote's own dimension line.
  // So on a single axis it is capped at that edge, kept the same clear gap `TEXT_GAP` stands other lines off a feature.
  // A leader running off both axes (a bore wall, read along a radius) has no such edge to cap against — its silhouette is a circle, not this box — so it keeps the plain offset.
  const axis_aligned = (a.out.x === 0) !== (a.out.y === 0);
  let reach: number = DIM_OFFSET;
  if (axis_aligned) {
    const boundary = a.out.y === 0 ? d.hw : d.hh;
    const start = a.out.y === 0 ? from.x : from.y;
    reach = Math.min(reach, Math.max(0, boundary - Math.abs(start) - TEXT_GAP));
  }
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const arrows_outside = a.arrowsOutside === true || length < 2 * ARROW;
  const heads = [
    head(from, a.out, arrows_outside),
    head(to, scale(a.out, -1), arrows_outside),
  ];
  const marks = {
    name: a.name,
    label,
    line,
    open: a.open,
    heads,
    tails: arrows_outside ? heads.map(tail) : [],
    attachments: [],
  };
  const width = text_width(label);

  const elbow = add(from, scale(a.out, reach));
  const carried = carried_label(
    elbow,
    { x: a.out.x >= 0 ? 1 : -1, y: 0 },
    // An arrowhead set outside already stands on the run: the label starts past it.
    (arrows_outside && reach === 0 ? ARROW : 0) + TEXT_GAP,
    width,
    false,
  );
  return {
    ...marks,
    leader: [seg(from, elbow), carried.leader],
    text: carried.text,
  };
}
