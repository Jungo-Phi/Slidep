import { describe, expect, it } from "vitest";
import { ProfileShape } from "../../../types/material";
import { SECTION_SCHEMA } from "../../../constants/rendering-specs";
import {
  ResolvedCote,
  SchemaLayout,
  arrowhead_points,
  layout_section_schema,
  text_box,
} from "./section-schema-layout";

/** Every kind, each in an ordinary size and in one deliberately awkward enough to break a
 * layout that reasons about a fixed box instead of the section it actually drew. */
const SHAPES: ProfileShape[] = [
  { kind: "rect", b: 0.05, h: 0.05 },
  { kind: "rect", b: 0.1, h: 0.02 },
  { kind: "rect", b: 0.005, h: 0.2 }, // 40:1, upright
  { kind: "round", d: 0.06 },
  { kind: "round", d: 0.4 },
  { kind: "box", b: 0.08, h: 0.04, e: 0.004 },
  { kind: "box", b: 0.3, h: 0.03, e: 0.0008 },
  { kind: "tube", d: 0.05, e: 0.002 },
  { kind: "tube", d: 0.25, e: 0.0005 },
  { kind: "I", b: 0.1, h: 0.2, tw: 0.006, tf: 0.01 },
  { kind: "I", b: 0.22, h: 0.6, tw: 0.012, tf: 0.019 },
  { kind: "I", b: 0.3, h: 0.04, tw: 0.002, tf: 0.003 },
];

const cases = SHAPES.map((shape) => [JSON.stringify(shape), shape] as const);

/** The library's size and the element page's, where the cotes are largest against the section. */
const SIZES = [SECTION_SCHEMA.SECTION_SIZE, SECTION_SCHEMA.PAGE_SECTION_SIZE];

type Seg = { from: { x: number; y: number }; to: { x: number; y: number } };

const cross = (o: Seg["from"], a: Seg["from"], b: Seg["from"]) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Strictly: two lines of one drawing meeting at an end — a leader leaving its dimension line — do not count. */
function segments_cross(s: Seg, t: Seg): boolean {
  const d1 = cross(t.from, t.to, s.from);
  const d2 = cross(t.from, t.to, s.to);
  const d3 = cross(s.from, s.to, t.from);
  const d4 = cross(s.from, s.to, t.to);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

function box_meets_segment(
  box: { x0: number; y0: number; x1: number; y1: number },
  s: Seg,
): boolean {
  const inside = (p: Seg["from"]) =>
    p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
  if (inside(s.from) || inside(s.to)) return true;
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  return corners.some((c, i) =>
    segments_cross(s, { from: c, to: corners[(i + 1) % 4] }),
  );
}

/** The lines a cote actually draws, extension lines aside. */
const strokes = (cote: ResolvedCote): Seg[] => [
  ...(cote.open ? [] : [cote.line]),
  ...cote.tails,
  ...cote.leader,
];

const by_name = (layout: SchemaLayout) =>
  Object.fromEntries(layout.cotes.map((c) => [c.name, c]));

function true_extent(shape: ProfileShape): { w: number; h: number } {
  switch (shape.kind) {
    case "round":
    case "tube":
      return { w: shape.d, h: shape.d };
    default:
      return { w: shape.b, h: shape.h };
  }
}

/** Everything the drawing paints, labels and arrowheads included — the check that the cropped
 * view really did cover it all. */
function content_box(layout: SchemaLayout) {
  const xs = [
    -layout.drawn.hw,
    layout.drawn.hw,
    layout.neutralAxis.from.x,
    layout.neutralAxis.to.x,
  ];
  const ys = [-layout.drawn.hh, layout.drawn.hh, layout.neutralAxis.from.y];
  for (const cote of layout.cotes) {
    for (const s of [cote.line, ...cote.tails, ...cote.leader, ...cote.attachments]) {
      xs.push(s.from.x, s.to.x);
      ys.push(s.from.y, s.to.y);
    }
    for (const head of cote.heads) {
      for (const p of arrowhead_points(head)) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    const box = text_box(cote.text, cote.label);
    xs.push(box.x0, box.x1);
    ys.push(box.y0, box.y1);
  }
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

/**
 * How far each dimension line sits past the section's edge on the side it is read from.
 * A cote drawn on the feature itself lands on no side at all.
 */
function side_gaps(layout: SchemaLayout): number[] {
  const { hw, hh } = layout.drawn;
  return layout.cotes
    .map((c) =>
      Math.min(
        ...[
          -hw - c.line.from.x,
          c.line.from.x - hw,
          -hh - c.line.from.y,
          c.line.from.y - hh,
        ].filter((gap) => gap > 0.5),
      ),
    )
    .filter(Number.isFinite);
}

describe("layout_section_schema", () => {
  it.each(cases)("crops the view to what it drew — %s", (_, shape) => {
    for (const size of SIZES) {
      const layout = layout_section_schema(shape, size);
      const { viewBox } = layout;
      const box = content_box(layout);
      expect(box.x0).toBeGreaterThanOrEqual(viewBox.x);
      expect(box.y0).toBeGreaterThanOrEqual(viewBox.y);
      expect(box.x1).toBeLessThanOrEqual(viewBox.x + viewBox.w);
      expect(box.y1).toBeLessThanOrEqual(viewBox.y + viewBox.h);
      // Cropped horizontally, so no profile carries slack beyond what it takes to keep the section itself centred.
      const pad = Math.min(box.x0 - viewBox.x, viewBox.x + viewBox.w - box.x1);
      expect(pad).toBeCloseTo(SECTION_SCHEMA.PAD, 6);
      expect(viewBox.x + viewBox.w / 2).toBeCloseTo(0, 6);
    }
  });

  it("keeps the neutral axis at the same height for every profile drawn at one size", () => {
    for (const size of SIZES) {
      const bands = new Set(
        SHAPES.map((shape) => {
          const { viewBox } = layout_section_schema(shape, size);
          return `${viewBox.y.toFixed(6)} ${viewBox.h.toFixed(6)}`;
        }),
      );
      expect([...bands], `size ${size}`).toHaveLength(1);
    }
  });

  it("puts every cote the same distance from the section, unless it has a leader to clear", () => {
    const gaps = SHAPES.flatMap((shape) => side_gaps(layout_section_schema(shape)));
    const nearest = Math.min(...gaps);
    expect(nearest).toBeCloseTo(SECTION_SCHEMA.DIM_OFFSET, 6);
    for (const shape of SHAPES) {
      const layout = layout_section_schema(shape);
      const pushed = side_gaps(layout).some((gap) => gap > nearest + 1e-6);
      // Only a cote with a carried label leaving on its side stands further off: an I's or a box's.
      if (pushed) expect(["I", "box"]).toContain(shape.kind);
    }
  });

  it.each(cases)("never lets one cote cross another — %s", (_, shape) => {
    for (const size of SIZES) {
      const { cotes } = layout_section_schema(shape, size);
      for (const cote of cotes) {
        for (const other of cotes) {
          if (other === cote) continue;
          const label = text_box(cote.text, cote.label);
          for (const s of strokes(other)) {
            expect(box_meets_segment(label, s), `${cote.name} label × ${other.name}, size ${size}`).toBe(false);
          }
          for (const s of strokes(cote)) {
            for (const t of strokes(other)) {
              expect(segments_cross(s, t), `${cote.name} × ${other.name}, size ${size}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it.each(cases)(
    "draws every wall thick enough to hang a cote on, hole still open — %s",
    (_, shape) => {
      const { drawn } = layout_section_schema(shape);
      for (const [param, width] of Object.entries(drawn.t)) {
        expect(width, param).toBeGreaterThan(1);
      }
      // The cote a wall carries needs two edges to point at: whatever the clamp did, the wall may never eat the feature it is cut from.
      if (shape.kind === "box" || shape.kind === "tube") {
        expect(2 * drawn.t.e).toBeLessThan(2 * Math.min(drawn.hw, drawn.hh));
      }
      if (shape.kind === "I") {
        expect(2 * drawn.t.tf).toBeLessThan(2 * drawn.hh);
        expect(drawn.t.tw).toBeLessThan(2 * drawn.hw);
      }
    },
  );

  it("keeps two walls that differ from being drawn the same", () => {
    const { drawn } = layout_section_schema({
      kind: "I",
      b: 0.1,
      h: 0.2,
      tw: 0.006,
      tf: 0.01,
    });
    expect(drawn.t.tf / drawn.t.tw).toBeCloseTo(10 / 6, 6);
  });

  it.each(cases)("never lets a label run over a guide line — %s", (_, shape) => {
    for (const cote of layout_section_schema(shape).cotes) {
      const label = text_box(cote.text, cote.label);
      for (const s of cote.attachments) {
        const overlaps =
          Math.min(s.from.x, s.to.x) < label.x1 &&
          Math.max(s.from.x, s.to.x) > label.x0 &&
          Math.min(s.from.y, s.to.y) < label.y1 &&
          Math.max(s.from.y, s.to.y) > label.y0;
        expect(overlaps, cote.name).toBe(false);
      }
    }
  });

  it("carries a cramped label out on its own dimension line, towards the section", () => {
    const layout = layout_section_schema({
      kind: "I",
      b: 0.1,
      h: 0.2,
      tw: 0.006,
      tf: 0.01,
    });
    const { h, tf } = by_name(layout);
    // `h` spans the whole section: turned, centred, no run needed.
    expect(h.text.rotated).toBe(true);
    expect(h.leader).toHaveLength(0);
    // A flange is a few px deep: the line runs on past it, downwards — away from the top, where it would have cost the schema height — and the label rides that run, still turned.
    expect(tf.leader).toHaveLength(1);
    expect(tf.text.rotated).toBe(true);
    const run = tf.leader[0];
    expect(run.to.y).toBeGreaterThan(run.from.y);
    expect(run.from.x).toBeCloseTo(tf.line.from.x, 6);
    expect(text_box(tf.text, tf.label).y0).toBeGreaterThan(tf.line.to.y);
  });

  it("stands a carried label off its line, and stops the line where the label ends", () => {
    for (const shape of SHAPES) {
      for (const cote of layout_section_schema(shape).cotes) {
        if (!cote.leader.length) continue;
        const label = text_box(cote.text, cote.label);
        const run = cote.leader[cote.leader.length - 1];
        const horizontal = Math.abs(run.to.y - run.from.y) < 1e-6;
        // The same clear gap a label gets when it does fit on its dimension line.
        const gap = horizontal
          ? run.from.y - label.y1
          : run.from.x - label.x1;
        expect(gap, cote.name).toBeGreaterThan(0);
        // …and the line stops with the label rather than poking out past it.
        const forward = horizontal
          ? run.to.x > run.from.x
          : run.to.y > run.from.y;
        const line_end = horizontal ? run.to.x : run.to.y;
        const label_end = horizontal
          ? forward
            ? label.x1
            : label.x0
          : forward
            ? label.y1
            : label.y0;
        expect(line_end - label_end, cote.name).toBeCloseTo(0, 6);
      }
    }
  });

  it("starts a leader at the feature it measures, not at the bounding box", () => {
    const layout = layout_section_schema({
      kind: "I",
      b: 0.1,
      h: 0.2,
      tw: 0.006,
      tf: 0.01,
    });
    const { tw } = by_name(layout);
    // The web is a couple of px wide at the centre: its leader has no business reaching as far out as a cote read off the flange edge does.
    expect(tw.leader[0].from.x).toBeCloseTo(-layout.drawn.t.tw / 2, 6);
    expect(tw.leader[0].to.x).toBeGreaterThan(-layout.drawn.hw);
    // …and it sits above the neutral axis, leaving by the left, clear of `b` below and of `tf` on the right.
    expect(tw.line.from.y).toBeLessThan(layout.neutralAxis.from.y);
  });

  it("reads a bore's wall along a radius, out to the lower right, and its diameter across it to the lower left", () => {
    const layout = layout_section_schema({ kind: "tube", d: 0.05, e: 0.002 });
    const { e } = by_name(layout);
    // Measured squarely across the wall: both ends on one ray, the leader leaving by the outer.
    const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
    expect(radius(e.line.from)).toBeCloseTo(layout.drawn.hw, 6);
    expect(radius(e.line.to)).toBeCloseTo(layout.drawn.hw - layout.drawn.t.e, 6);
    expect(e.line.from.x).toBeGreaterThan(0);
    expect(e.line.from.y).toBeGreaterThan(0);
    // Neither horizontal nor vertical: one would sit on the neutral axis, the other cost height.
    expect(e.line.from.y).not.toBeCloseTo(e.line.to.y, 6);
    expect(e.line.from.x).not.toBeCloseTo(e.line.to.x, 6);
    // The label is set level, on a horizontal run at the end of the leader.
    expect(e.text.rotated).toBe(false);
    expect(e.leader[1].from.y).toBeCloseTo(e.leader[1].to.y, 6);
    // The diameter runs through the centre, leaving by the lower left, which the wall leaves free.
    const { d } = by_name(layout);
    expect(radius(d.line.from)).toBeCloseTo(layout.drawn.hw, 6);
    expect(d.line.from.x + d.line.to.x).toBeCloseTo(0, 6);
    expect(d.line.from.x).toBeLessThan(0);
    expect(d.line.from.y).toBeGreaterThan(0);
    // Neither cote rises past the section: the band above it is the same for every profile.
    for (const cote of layout.cotes) expect(text_box(cote.text, cote.label).y0).toBeGreaterThan(-layout.drawn.hh);
  });

  it.each(cases)(
    "never draws a section more slender than it is, nor on its side — %s",
    (_, shape) => {
      const extent = true_extent(shape);
      const { drawn } = layout_section_schema(shape);
      const true_ratio = extent.w / extent.h;
      const drawn_ratio = drawn.hw / drawn.hh;
      if (true_ratio >= 1) {
        expect(drawn_ratio).toBeGreaterThanOrEqual(1);
        expect(drawn_ratio).toBeLessThanOrEqual(true_ratio + 1e-9);
      } else {
        expect(drawn_ratio).toBeLessThanOrEqual(1);
        expect(drawn_ratio).toBeGreaterThanOrEqual(true_ratio - 1e-9);
      }
    },
  );


  it.each(cases)("reads a width or a diameter by its arrowheads alone, its label outside the section — %s", (_, shape) => {
    const layout = layout_section_schema(shape);
    const across = layout.cotes.find((c) => c.name === "b" || c.name === "d");
    if (!across) return;
    expect(across.open).toBe(true);
    // Each head points in at the outline from outside it, the line run on a little past its back.
    for (const head of across.heads) expect(Math.hypot(head.base.x, head.base.y)).toBeGreaterThan(Math.hypot(head.tip.x, head.tip.y));
    expect(across.tails).toHaveLength(2);
    const label = text_box(across.text, across.label);
    expect(label.x0 > layout.drawn.hw || label.x1 < -layout.drawn.hw).toBe(true);
    // Below the neutral axis, the arrowheads on the section's own height.
    expect(across.line.from.y).toBeGreaterThan(layout.neutralAxis.from.y);
    expect(across.line.from.y).toBeLessThan(layout.drawn.hh);
  });

  it("labels a clamped drawing with its true cotes", () => {
    const flat = layout_section_schema({ kind: "rect", b: 0.2, h: 0.005 });
    expect(flat.cotes.map((c) => c.label)).toEqual(["b = 200", "h = 5"]);
  });
});
