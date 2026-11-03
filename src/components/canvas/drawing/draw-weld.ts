/**
 * Drawing a weld: bars held by seamless joins (`weld_groups`), drawn as one continuous bent piece.
 *
 * The pieces are drawn in two passes — every contour, then every body over them — so no contour shows through a neighbour's body, and each join's outer corner is filled to a point.
 */

import { DIM, STROKE_WIDTHS } from "../../../constants/rendering-specs";
import { INTERACTION_SPECS } from "../../../constants/interaction-specs";
import type { ID, ScreenPoint, ViewportState } from "../../../types";
import type { Point2 } from "../../../types/point2";
import { world2screen } from "../../../utils";
import {
  beam_half_widths,
  draw_beam,
  draw_hover_circle,
  edge_stub_length,
  type BeamEnd,
  type BeamFillStop,
} from "./drawing-functions";
import {
  segments_distance,
  type WeldGroup,
  type WeldJoint,
  type WeldPiece,
} from "./weld-groups";

const TAU = 2 * Math.PI;

/** Beyond this tip length, in half bar widths, a weld's corner point is rounded: a very acute angle would grow a spike. */
const WELD_MITER_LIMIT = 1.5;
/** How far a rounded corner may reach from the weld, in half bar widths of its contour. */
const WELD_TIP_REACH = 2;

/** How a beam end held by `nodeID` is drawn, given which joins are seamless. */
export function beam_end(
  nodeID: ID | undefined,
  seamless: ReadonlySet<ID>,
): BeamEnd {
  if (nodeID === undefined) return "free";
  return seamless.has(nodeID) ? "seamless" : "join";
}

/** What `draw_weld` reads from the rest of the frame. */
export interface WeldDrawing {
  viewport: ViewportState;
  seamless: ReadonlySet<ID>;
  /** Sets `ctx` up for `piece` exactly as the rest of the mechanism is styled, and returns what its drawing needs of that state; `undefined` when it is not drawn. */
  style: (
    piece: WeldPiece,
  ) => { beamTint?: string; handleTerminal?: "start" | "end" } | undefined;
  stressStops: (beamID: ID) => BeamFillStop[] | undefined;
  /** The body color a node shows where these beams meet it, if a stress lens colors it. */
  stressFillAt: (position: Point2, beamIDs: ID[]) => string | undefined;
}

type Pass = "outline" | "fill";
type Ends = { start: ScreenPoint; end: ScreenPoint };

/** Draws `group`: its bars in full, and the stubs its springs and dampers end with at a seamless join — those draw the rest of themselves in their own layer. */
export function draw_weld(
  ctx: CanvasRenderingContext2D,
  group: WeldGroup,
  drawing: WeldDrawing,
) {
  const screen = new Map<ID, Ends>(
    group.pieces.map((piece) => [
      piece.id,
      {
        start: world2screen(piece.positionStart, drawing.viewport),
        end: world2screen(piece.positionEnd, drawing.viewport),
      },
    ]),
  );
  for (const pass of ["outline", "fill"] as const) {
    for (const piece of group.pieces)
      draw_piece(ctx, piece, screen.get(piece.id)!, pass, drawing);
    for (const joint of group.joints)
      draw_corner(ctx, joint, screen, pass, drawing);
  }
  draw_crossings(ctx, group, screen, drawing);
  for (const piece of group.pieces) {
    if (piece.type !== "beam") continue;
    const style = drawing.style(piece);
    if (!style) continue;
    const { start, end } = screen.get(piece.id)!;
    if (style.beamTint) {
      ctx.save();
      ctx.strokeStyle = style.beamTint;
      ctx.fillStyle = style.beamTint;
      ctx.globalAlpha *= INTERACTION_SPECS.LIBRARY_TINT_OPACITY;
      draw_beam(
        ctx,
        start,
        end,
        beam_end(piece.fixedNodeStartID, drawing.seamless),
        beam_end(piece.fixedNodeEndID, drawing.seamless),
      );
      ctx.restore();
    }
    if (style.handleTerminal)
      draw_hover_circle(ctx, style.handleTerminal === "end" ? end : start);
  }
}

function draw_piece(
  ctx: CanvasRenderingContext2D,
  piece: WeldPiece,
  { start, end }: Ends,
  pass: Pass,
  drawing: WeldDrawing,
) {
  const style = drawing.style(piece);
  if (!style) return;
  if (piece.type === "beam") {
    draw_beam(
      ctx,
      start,
      end,
      beam_end(piece.fixedNodeStartID, drawing.seamless),
      beam_end(piece.fixedNodeEndID, drawing.seamless),
      style.beamTint ? undefined : drawing.stressStops(piece.id),
      pass,
    );
    return;
  }
  const along = end.sub(start);
  if (along.length_squared() < 1e-9) return;
  const stub = along.normalize().mul(edge_stub_length(piece.type));
  const seamless = (nodeID: ID | undefined) =>
    nodeID !== undefined && drawing.seamless.has(nodeID);
  if (seamless(piece.fixedNodeStartID))
    draw_beam(ctx, start, start.add(stub), "seamless", "free", undefined, pass);
  if (seamless(piece.fixedNodeEndID))
    draw_beam(ctx, end, end.sub(stub), "seamless", "free", undefined, pass);
}

/** The screen angles the pieces of `joint` leave it along: one per end it holds, both ways for a beam it sits on. */
function joint_directions(
  joint: WeldJoint,
  screen: ReadonlyMap<ID, Ends>,
): { angle: number; piece: WeldPiece }[] {
  const joinID = joint.join.id;
  return joint.held.flatMap((piece) => {
    const { start, end } = screen.get(piece.id)!;
    const along = end.sub(start).angle();
    const angles: number[] = [];
    if (piece.fixedNodeStartID === joinID) angles.push(along);
    if (piece.fixedNodeEndID === joinID) angles.push(along + Math.PI);
    if (angles.length === 0) angles.push(along, along + Math.PI);
    return angles.map((angle) => ({
      angle: ((angle % TAU) + TAU) % TAU,
      piece,
    }));
  });
}

/** Each half of a corner, on either side of its point, is drawn in the style of the bar it extends: a hovered bar keeps its thickened side all the way to the point. */
function draw_corner(
  ctx: CanvasRenderingContext2D,
  joint: WeldJoint,
  screen: ReadonlyMap<ID, Ends>,
  pass: Pass,
  drawing: WeldDrawing,
) {
  const gap = weld_corner_gap(joint_directions(joint, screen));
  if (!gap) return;
  const position = joint.join.position;
  const side_of = (piece: WeldPiece) => {
    if (!drawing.style(piece)) return undefined;
    const { outline, fill } = beam_half_widths(ctx.lineWidth);
    return {
      half: pass === "outline" ? outline : fill,
      contour: outline - fill,
      color:
        pass === "outline"
          ? ctx.strokeStyle
          : (drawing.stressFillAt(position, [piece.id]) ?? ctx.fillStyle),
      alpha: ctx.globalAlpha,
      shadowColor: ctx.shadowColor,
      shadowBlur: ctx.shadowBlur,
    };
  };
  const from = side_of(gap.from.piece);
  const to = side_of(gap.to.piece);
  if (!from || !to) return;
  const paint = (side: typeof from) => {
    ctx.fillStyle = side.color;
    ctx.globalAlpha = side.alpha;
    ctx.shadowColor = side.shadowColor;
    ctx.shadowBlur = side.shadowBlur;
    ctx.fill();
  };
  const center = world2screen(position, drawing.viewport);
  const contour = pass === "outline" ? 0 : (from.contour + to.contour) / 2;
  const trace = () =>
    trace_weld_corner(
      ctx,
      center,
      gap.from.angle,
      gap.opening,
      from.half,
      to.half,
      contour,
    );

  const tip = trace();
  paint(to);
  const alike =
    from.half === to.half &&
    from.color === to.color &&
    from.alpha === to.alpha &&
    from.shadowBlur === to.shadowBlur;
  if (alike || !tip) return;
  // The `from` half is painted over the whole, clipped to its own side of the line through the point: no seam where the two meet.
  const reach = Math.hypot(tip.x - center.x, tip.y - center.y) || 1;
  const d = { x: (tip.x - center.x) / reach, y: (tip.y - center.y) / reach };
  const n = { x: Math.cos(gap.from.angle), y: Math.sin(gap.from.angle) };
  const far = 4 * DIM.BEAM_WIDTH + reach;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(center.x - d.x * far, center.y - d.y * far);
  ctx.lineTo(center.x + d.x * far, center.y + d.y * far);
  ctx.lineTo(center.x + (d.x + n.x) * far, center.y + (d.y + n.y) * far);
  ctx.lineTo(center.x + (n.x - d.x) * far, center.y + (n.y - d.y) * far);
  ctx.closePath();
  ctx.clip();
  trace();
  paint(from);
  ctx.restore();
}

/**
 * Two bars of one weld crossing where no join holds them: the earlier one's body has covered the later one's sides, which are drawn again over its band so the crossing reads as an overlap, as it does outside a weld.
 * The sides alone, not the whole bar: redrawing contour and body under an anti-aliased clip would blend the two along the clip's edge.
 */
function draw_crossings(
  ctx: CanvasRenderingContext2D,
  group: WeldGroup,
  screen: ReadonlyMap<ID, Ends>,
  drawing: WeldDrawing,
) {
  const welded = new Set<string>();
  for (const { held } of group.joints)
    for (const a of held) for (const b of held) welded.add(`${a.id}|${b.id}`);
  const beams = group.pieces.filter((piece) => piece.type === "beam");
  for (let i = 0; i < beams.length; i++)
    for (let j = i + 1; j < beams.length; j++) {
      const [under, over] = [beams[i], beams[j]];
      if (welded.has(`${under.id}|${over.id}`)) continue;
      const u = screen.get(under.id)!;
      const o = screen.get(over.id)!;
      if (segments_distance(u.start, u.end, o.start, o.end) >= DIM.BEAM_WIDTH)
        continue;
      if (!drawing.style(under)) continue;
      const band = DIM.BEAM_WIDTH / 2 + STROKE_WIDTHS.HOVER_GAIN;
      ctx.save();
      const base = ctx.getTransform();
      ctx.translate(u.start.x, u.start.y);
      ctx.rotate(u.end.sub(u.start).angle());
      ctx.beginPath();
      ctx.rect(-band, -band, u.start.distance_to(u.end) + 2 * band, 2 * band);
      ctx.clip();
      ctx.setTransform(base);
      if (drawing.style(over)) {
        const { outline, fill } = beam_half_widths(ctx.lineWidth);
        const length = o.start.distance_to(o.end);
        ctx.translate(o.start.x, o.start.y);
        ctx.rotate(o.end.sub(o.start).angle());
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(0, -outline, length, outline - fill);
        ctx.fillRect(0, fill, length, outline - fill);
      }
      ctx.restore();
    }
}

/**
 * The opening a weld's corner fills: the widest one between two consecutive bars, when it is more than a half-turn.
 * `directions` carry the screen angle each welded bar leaves the weld along; `from` and `to` bound the opening counterclockwise, and `opening` is its angle.
 */
export function weld_corner_gap<T extends { angle: number }>(
  directions: readonly T[],
): { from: T; to: T; opening: number } | undefined {
  if (directions.length < 2) return undefined;
  const sorted = [...directions].sort((x, y) => x.angle - y.angle);
  let from = sorted[sorted.length - 1];
  let to = sorted[0];
  let opening = to.angle + TAU - from.angle;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].angle - sorted[i - 1].angle > opening) {
      opening = sorted[i].angle - sorted[i - 1].angle;
      from = sorted[i - 1];
      to = sorted[i];
    }
  }
  return opening > Math.PI + 1e-6 ? { from, to, opening } : undefined;
}

/**
 * Traces the corner filling a weld's opening (`weld_corner_gap`) at `center`, as a path to fill: a point where the two bars' outer sides meet, rounded past `WELD_MITER_LIMIT`.
 * `fromHalf` and `toHalf` are each bar's half width in the pass being drawn, so a bar drawn thicker than its neighbour keeps its own side up to the point.
 * `contour` is how much thicker the contour is than the part drawn here (0 when drawing the contour itself): a rounded point then follows the contour's curve, so the stroke keeps its thickness around it.
 * Returns the point the two sides meet at, which splits the corner between the two bars.
 */
export function trace_weld_corner(
  ctx: CanvasRenderingContext2D,
  center: ScreenPoint,
  fromAngle: number,
  opening: number,
  fromHalf: number,
  toHalf: number,
  contour = 0,
): { x: number; y: number } | undefined {
  const toAngle = fromAngle + opening;
  const u1 = { x: Math.cos(fromAngle), y: Math.sin(fromAngle) };
  const u2 = { x: Math.cos(toAngle), y: Math.sin(toAngle) };
  // The two side lines facing the opening, each run backwards until they meet.
  const p1 = { x: center.x - u1.y * fromHalf, y: center.y + u1.x * fromHalf };
  const p2 = { x: center.x + u2.y * toHalf, y: center.y - u2.x * toHalf };
  const cross = u1.x * u2.y - u1.y * u2.x;
  ctx.beginPath();
  if (Math.abs(cross) < 1e-9) {
    ctx.arc(center.x, center.y, Math.max(fromHalf, toHalf), 0, TAU);
    return undefined;
  }
  const t = ((p2.x - p1.x) * u2.y - (p2.y - p1.y) * u2.x) / cross;
  const tip = { x: p1.x + t * u1.x, y: p1.y + t * u1.y };
  // Half the angle between the bars, read off the contour so both passes agree on the point's shape.
  const sine = Math.sin((TAU - opening) / 2);
  const outer = (fromHalf + toHalf) / 2 + contour;
  let radius = 0;
  if (sine < 1 / WELD_MITER_LIMIT) {
    const reaching = (outer * (1 - WELD_TIP_REACH * sine)) / (1 - sine);
    radius = Math.max(Math.min(reaching, outer) - contour, 0);
  }
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.arcTo(tip.x, tip.y, p2.x, p2.y, radius);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  return tip;
}
