import { Point2 } from "../types/point2";

/**
 * A via-point of a belt path: a pulley the belt wraps (radius > 0, `direction` = wrap sense, false: clockwise / true: counter-clockwise) or a terminal endpoint (radius 0).
 */
export type BeltVia = { pos: Point2; radius: number; direction: boolean };

/**
 * Positive angle swept by a belt arc, same convention as the `counterClockwise`
 * flag of `ctx.arc` used when drawing: `direction` {false: clockwise, true:
 * counter-clockwise}.
 */
export function belt_arc_sweep(
  startAngle: number,
  endAngle: number,
  direction: boolean,
): number {
  const TWO_PI = 2 * Math.PI;
  let span = direction ? startAngle - endAngle : endAngle - startAngle;
  span = span % TWO_PI;
  if (span < 0) span += TWO_PI;
  return span;
}

/** One ordered piece of a belt path: a straight tangent run between two vias, or an arc wrapping one via. */
export type BeltPiece =
  | {
      kind: "segment";
      length: number;
      startS: number;
      gearIndexA: number;
      gearIndexB: number;
      from: Point2;
      to: Point2;
    }
  | {
      kind: "arc";
      length: number;
      startS: number;
      gearIndex: number;
      center: Point2;
      radius: number;
      startAngle: number;
      wrap: number;
      direction: boolean;
    };

/**
 * Split a belt into its ordered geometric pieces (tangent segments + gear arcs).
 * `closed` treats the vias as a cycle (tight belt: gears only, wrap gN→g0);
 * otherwise as an open path (loose belt: terminals at both ends carry no arc).
 * Order for closed: arc(v0), seg(v0→v1), arc(v1), … ; for open: seg, arc, seg, …
 */
export function belt_pieces(
  vias: BeltVia[],
  closed = false,
  wraps?: number[],
): BeltPiece[] {
  const n = vias.length;
  const pairCount = closed ? n : Math.max(0, n - 1);
  const out: Point2[] = [];
  const inn: Point2[] = [];
  for (let p = 0; p < pairCount; p++) {
    const a = vias[p];
    const b = vias[(p + 1) % n];
    const { start, end } = Point2.circles_link(
      a.pos,
      a.radius,
      a.direction,
      b.pos,
      b.radius,
      b.direction,
    );
    out.push(a.pos.add(start));
    inn.push(b.pos.add(end));
  }
  const arrival: (Point2 | null)[] = new Array(n).fill(null);
  const departure: (Point2 | null)[] = new Array(n).fill(null);
  for (let p = 0; p < pairCount; p++) {
    departure[p] = out[p];
    arrival[(p + 1) % n] = inn[p];
  }

  const pieces: BeltPiece[] = [];
  let s = 0;
  const pushArc = (v: number) => {
    const arr = arrival[v];
    const dep = departure[v];
    if (!arr || !dep || vias[v].radius <= 0) return;
    const c = vias[v].pos;
    const startAngle = arr.sub(c).angle();
    // Continuous wrap (winding turns included) when provided, else the geometric
    // fractional wrap ∈ [0, 2π). Lets the junction travel around a wound pulley.
    const wrap =
      wraps?.[v] !== undefined
        ? Math.abs(wraps[v])
        : belt_arc_sweep(startAngle, dep.sub(c).angle(), vias[v].direction);
    const length = vias[v].radius * wrap;
    pieces.push({
      kind: "arc",
      length,
      startS: s,
      gearIndex: v,
      center: c,
      radius: vias[v].radius,
      startAngle,
      wrap,
      direction: vias[v].direction,
    });
    s += length;
  };
  const pushSeg = (p: number) => {
    const length = out[p].distance_to(inn[p]);
    pieces.push({
      kind: "segment",
      length,
      startS: s,
      gearIndexA: p,
      gearIndexB: (p + 1) % n,
      from: out[p],
      to: inn[p],
    });
    s += length;
  };

  if (closed) {
    for (let v = 0; v < n; v++) {
      pushArc(v);
      pushSeg(v);
    }
  } else {
    // A terminal resting ON its pulley's rim is NOT a special case: circles_link
    // then returns the radial rim point, so the run is emitted with length 0 and
    // the arc already reaches the terminal. Keeping that degenerate run is what
    // lets the length constraint recover its tangent point (and hence the no-slip
    // coupling to the belt travel φ) while an end touches a pulley.
    for (let p = 0; p < pairCount; p++) {
      pushSeg(p);
      pushArc(p + 1);
    }
  }
  return pieces;
}

/**
 * Raw wrap angle (∈ [0, 2π)) of each via on the path, 0 for terminals / vias
 * with no arc. Index-aligned to `vias`.
 */
export function belt_wraps(vias: BeltVia[], closed = false): number[] {
  const wraps = new Array(vias.length).fill(0);
  for (const piece of belt_pieces(vias, closed))
    if (piece.kind === "arc") wraps[piece.gearIndex] = piece.wrap;
  return wraps;
}

/**
 * Raw ARRIVAL rim angle (the arc's `startAngle`, ∈ (−π, π]) of each via, 0 for
 * terminals / vias with no arc. Index-aligned to `vias`.
 *
 * This is the angle the belt touches down at. Together with the wrap it fixes the
 * terminal's belt arc-length position IN THE PULLEY'S FRAME — the quantity the
 * no-slip differential must be written in (see `applyBeltLengthConstraint`), because
 * the free-strand length alone is a V at the tangency point and cannot be used.
 */
export function belt_arrivals(vias: BeltVia[], closed = false): number[] {
  const arrivals = new Array(vias.length).fill(0);
  for (const piece of belt_pieces(vias, closed))
    if (piece.kind === "arc") arrivals[piece.gearIndex] = piece.startAngle;
  return arrivals;
}

/**
 * Advance a continuous (unwrapped) wrap angle per via from its previous value,
 * so a wrap that shrinks through 0 goes NEGATIVE (contact lost) and one that
 * grows past 2π keeps climbing (winding), instead of the raw [0,2π) value
 * jumping across the 0/2π seam. `prev` undefined → seed with the raw wrap.
 */
export function advance_continuous_wraps(
  vias: BeltVia[],
  prev: number[] | undefined,
  closed = false,
): number[] {
  const raw = belt_wraps(vias, closed);
  if (!prev) return raw;
  const TWO_PI = 2 * Math.PI;
  return raw.map((r, i) => {
    const p = prev[i] ?? r;
    let delta = r - (((p % TWO_PI) + TWO_PI) % TWO_PI); // raw − (p mod 2π)
    while (delta > Math.PI) delta -= TWO_PI;
    while (delta <= -Math.PI) delta += TWO_PI;
    return p + delta;
  });
}

/**
 * Nearest point of a belt piece to `p`, clamped to the piece's real extent: a
 * segment is clamped to its endpoints, an arc to its **wrapped** angular sector
 * (from belt arrival to departure) — so a point never snaps onto the free,
 * non-contact side of a pulley.
 */
export function nearest_point_on_piece(p: Point2, piece: BeltPiece): Point2 {
  if (piece.kind === "segment") {
    const d = piece.to.sub(piece.from);
    const len2 = d.length_squared();
    if (len2 < 1e-12) return piece.from;
    const t = Math.max(0, Math.min(1, p.sub(piece.from).dot(d) / len2));
    return piece.from.lerp(piece.to, t);
  }
  // Arc: clamp the swept angle to [0, wrap] along the traversal direction.
  const swept = belt_arc_sweep(
    piece.startAngle,
    p.sub(piece.center).angle(),
    piece.direction,
  );
  const param =
    swept <= piece.wrap
      ? swept
      : swept < (piece.wrap + 2 * Math.PI) / 2 // past the end → nearer endpoint
        ? piece.wrap
        : 0;
  const angle = piece.startAngle + (piece.direction ? -param : param);
  return piece.center.add(Point2.from_polar(piece.radius, angle));
}

/**
 * Project a point onto a belt path: returns the arc-length `s`, the on-belt
 * `point`, and the unit `tangent` there. Uses the clamped nearest point of each
 * piece (so it never lands on a pulley's free side).
 */
export function belt_project(
  vias: BeltVia[],
  p: Point2,
  closed = false,
  wraps?: number[],
): { s: number; point: Point2; tangent: Point2 } {
  const pieces = belt_pieces(vias, closed, wraps);
  if (pieces.length === 0) return { s: 0, point: p, tangent: new Point2(1, 0) };
  let bestDist = Infinity;
  let bestS = 0;
  let bestPoint =
    pieces[0].kind === "arc"
      ? pieces[0].center.add(
          Point2.from_polar(pieces[0].radius, pieces[0].startAngle),
        )
      : pieces[0].from;
  for (const piece of pieces) {
    const np = nearest_point_on_piece(p, piece);
    const d = p.distance_to(np);
    if (d >= bestDist) continue;
    bestDist = d;
    bestPoint = np;
    const local =
      piece.kind === "segment"
        ? piece.from.distance_to(np)
        : belt_arc_sweep(
            piece.startAngle,
            np.sub(piece.center).angle(),
            piece.direction,
          ) * piece.radius;
    bestS = piece.startS + local;
  }
  return {
    s: bestS,
    point: bestPoint,
    tangent: belt_point_tangent(vias, bestS, closed, wraps).tangent,
  };
}

/**
 * Point and unit tangent at arc-length `s` along a belt path (wrapping for a
 * closed path). Tangent points in the direction of increasing `s` (belt travel).
 */
export function belt_point_tangent(
  vias: BeltVia[],
  s: number,
  closed = false,
  wraps?: number[],
): { point: Point2; tangent: Point2; curvature: number } {
  const pieces = belt_pieces(vias, closed, wraps);
  const total = pieces.reduce((a, p) => a + p.length, 0);
  if (pieces.length === 0)
    return {
      point: vias[0]?.pos ?? new Point2(0, 0),
      tangent: new Point2(1, 0),
      curvature: 0,
    };
  let local = closed && total > 0 ? ((s % total) + total) % total : s;

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (local <= piece.length || i === pieces.length - 1) {
      if (piece.kind === "segment") {
        const dir = piece.to.sub(piece.from);
        const t = piece.length > 1e-9 ? local / piece.length : 0;
        return {
          point: piece.from.lerp(piece.to, t),
          tangent:
            dir.length_squared() > 1e-12 ? dir.normalize() : new Point2(1, 0),
          curvature: 0,
        };
      }
      const sign = piece.direction ? -1 : 1;
      const angle = piece.startAngle + (sign * local) / piece.radius;
      return {
        point: piece.center.add(Point2.from_polar(piece.radius, angle)),
        tangent: Point2.from_polar(sign, angle).perp(),
        curvature: sign / piece.radius,
      };
    }
    local -= piece.length;
  }
  const last = pieces[pieces.length - 1];
  if (last.kind === "segment") {
    return {
      point: last.to,
      tangent: last.to.sub(last.from).normalize(),
      curvature: 0,
    };
  }
  return {
    point: last.center.add(Point2.from_polar(last.radius, last.startS)),
    tangent: Point2.from_polar(last.direction ? -1 : 1, last.startAngle).perp(),
    curvature: 0,
  };
}
