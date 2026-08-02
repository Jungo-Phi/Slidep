import { Point2, Space } from "../types/point2";

/**
 * A via-point of a belt path: a pulley the belt wraps (radius > 0, `direction` = wrap sense, false: clockwise / true: counter-clockwise) or a terminal endpoint (radius 0).
 *
 * Tagged with its space like `Point2`, and defaulting to `"world"` the same way: a
 * screen path is not just mirrored coordinates, it also flips every `direction`, so
 * feeding one where the other is expected is a mistake worth catching.
 */
export type BeltVia<S extends Space = "world"> = {
  pos: Point2<S>;
  radius: number;
  direction: boolean;
};

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
export type BeltPiece<S extends Space = "world"> =
  | {
      kind: "segment";
      length: number;
      startS: number;
      gearIndexA: number;
      gearIndexB: number;
      from: Point2<S>;
      to: Point2<S>;
    }
  | {
      kind: "arc";
      length: number;
      startS: number;
      gearIndex: number;
      center: Point2<S>;
      radius: number;
      startAngle: number;
      wrap: number;
      direction: boolean;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Scalar core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A belt's tangent geometry in flat arrays, allocated once and reused: a solver
 * constraint rebuilds what it needs three hundred times a frame, and the objects it used
 * to allocate for that dominated its cost.
 *
 * Pair `p` runs from via `p` to via `(p+1) % n`: `dep` is where the belt leaves via `p`,
 * `arr` where it lands on the next one. Everything else — strand lengths, contact arcs —
 * derives from those two points, so a constraint that needs one strand solves two pairs
 * instead of the whole belt.
 */
export interface BeltScratch {
  cx: Float64Array;
  cy: Float64Array;
  r: Float64Array;
  /** Wrap sense per via, 1 = counter-clockwise (`BeltVia.direction`). */
  ccw: Uint8Array;
  depX: Float64Array;
  depY: Float64Array;
  arrX: Float64Array;
  arrY: Float64Array;
  /** Strand length of pair `p`. */
  ell: Float64Array;
  /** Arrival (touch-down) rim angle of via `v`, set by `belt_solve_arc`. */
  arcAngle: Float64Array;
  /** Wrap angle of via `v`, set by `belt_solve_arc`. */
  arcWrap: Float64Array;
}

export function belt_scratch(capacity: number): BeltScratch {
  return {
    cx: new Float64Array(capacity),
    cy: new Float64Array(capacity),
    r: new Float64Array(capacity),
    ccw: new Uint8Array(capacity),
    depX: new Float64Array(capacity),
    depY: new Float64Array(capacity),
    arrX: new Float64Array(capacity),
    arrY: new Float64Array(capacity),
    ell: new Float64Array(capacity),
    arcAngle: new Float64Array(capacity),
    arcWrap: new Float64Array(capacity),
  };
}

let shared: BeltScratch = belt_scratch(16);

/** The module's scratch, grown to hold `n` vias. Single-threaded, never nested. */
export function belt_shared_scratch(n: number): BeltScratch {
  if (shared.cx.length < n) shared = belt_scratch(Math.max(n, 2 * shared.cx.length));
  return shared;
}

/**
 * Solve tangent pair `p` (via `p` → via `(p+1) % n`) into `dep`/`arr`/`ell`.
 * Transcribed from `Point2.circles_link` term for term, including its degenerate
 * branch — the geometry must not shift by a last-place digit.
 */
export function belt_solve_pair(sc: BeltScratch, p: number, n: number): void {
  const a = p;
  const b = (p + 1) % n;
  const dx = sc.cx[b] - sc.cx[a];
  const dy = sc.cy[b] - sc.cy[a];
  const d = Math.sqrt(dx * dx + dy * dy);
  const ccwA = sc.ccw[a] === 1;
  const ccwB = sc.ccw[b] === 1;
  const same = ccwA === ccwB;
  const gap = same ? sc.r[a] - sc.r[b] : sc.r[b] + sc.r[a];
  let sx: number, sy: number, ex: number, ey: number;
  if (d < (same ? Math.abs(gap) : gap)) {
    // Nested/overlapping circles: `circles_link` falls back to the radial points, and
    // `Point2.div` answers (0, 0) on a zero length.
    const ux = d === 0 ? 0 : dx / d;
    const uy = d === 0 ? 0 : dy / d;
    sx = ux * sc.r[a];
    sy = uy * sc.r[a];
    ex = ux * -sc.r[b];
    ey = uy * -sc.r[b];
  } else {
    const angle = Math.atan2(dy, dx) + Math.asin(gap / d) * (ccwA ? -1 : 1) + Math.PI / 2;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const ka = sc.r[a] * (ccwA ? 1 : -1);
    const kb = sc.r[b] * (ccwB ? 1 : -1);
    sx = nx * ka;
    sy = ny * ka;
    ex = nx * kb;
    ey = ny * kb;
  }
  sc.depX[p] = sc.cx[a] + sx;
  sc.depY[p] = sc.cy[a] + sy;
  sc.arrX[p] = sc.cx[b] + ex;
  sc.arrY[p] = sc.cy[b] + ey;
  const lx = sc.arrX[p] - sc.depX[p];
  const ly = sc.arrY[p] - sc.depY[p];
  sc.ell[p] = Math.sqrt(lx * lx + ly * ly);
}

/** Every tangent pair of the belt. */
export function belt_solve_pairs(
  sc: BeltScratch,
  n: number,
  closed: boolean,
): number {
  const pairs = closed ? n : Math.max(0, n - 1);
  for (let p = 0; p < pairs; p++) belt_solve_pair(sc, p, n);
  return pairs;
}

/**
 * Whether via `v` carries a contact arc: it needs a radius, and an open belt's two
 * terminals are only ever touched by one strand.
 */
export function belt_has_arc(
  sc: BeltScratch,
  v: number,
  n: number,
  closed: boolean,
): boolean {
  if (sc.r[v] <= 0) return false;
  return closed || (v !== 0 && v !== n - 1);
}

/** Arrival (touch-down) rim angle of via `v`. Needs pair `v−1` solved. */
export function belt_arrival_angle(
  sc: BeltScratch,
  v: number,
  n: number,
  closed: boolean,
): number {
  const pairs = closed ? n : n - 1;
  const pIn = (v - 1 + pairs) % pairs;
  return Math.atan2(sc.arrY[pIn] - sc.cy[v], sc.arrX[pIn] - sc.cx[v]);
}

/**
 * The contact arc of via `v` — arrival angle and wrap, into `arcAngle`/`arcWrap`.
 * Needs pairs `v−1` (arrival) and `v` (departure) solved. False when there is no arc.
 * `wrap` overrides the geometric wrap with a continuous (winding) one.
 */
export function belt_solve_arc(
  sc: BeltScratch,
  v: number,
  n: number,
  closed: boolean,
  wrap?: number,
): boolean {
  if (!belt_has_arc(sc, v, n, closed)) return false;
  const startAngle = belt_arrival_angle(sc, v, n, closed);
  sc.arcAngle[v] = startAngle;
  sc.arcWrap[v] =
    wrap !== undefined
      ? Math.abs(wrap)
      : belt_arc_sweep(
          startAngle,
          Math.atan2(sc.depY[v] - sc.cy[v], sc.depX[v] - sc.cx[v]),
          sc.ccw[v] === 1,
        );
  return true;
}

/**
 * Where an arc-length falls on a belt. Filled in place so that locating a point allocates
 * nothing — the caller keeps one of these for the life of the module.
 */
export interface BeltAt {
  /** Total path length, summed in traversal order. */
  total: number;
  px: number;
  py: number;
  /** Unit tangent, pointing the way `s` increases (belt travel). */
  tx: number;
  ty: number;
  curvature: number;
  /** Vias bounding the piece `s` fell on; both are the same one on an arc, −1 on none. */
  viaA: number;
  viaB: number;
}

export function belt_at(): BeltAt {
  return { total: 0, px: 0, py: 0, tx: 1, ty: 0, curvature: 0, viaA: -1, viaB: -1 };
}

/**
 * Point, tangent and bounding vias at arc-length `s`, straight from the scratch — the
 * scalar twin of `belt_point_tangent` followed by a piece lookup, in one traversal and
 * without building a single `BeltPiece`.
 *
 * Needs the pairs already solved (`belt_solve_pairs`). Transcribed term for term from the
 * boxed pair, including the order lengths are summed in: floating-point addition is not
 * associative, and the two must answer the same bits.
 */
export function belt_total(
  sc: BeltScratch,
  n: number,
  closed: boolean,
  wraps: ArrayLike<number> | undefined,
): { total: number; count: number } {
  const pairs = closed ? n : Math.max(0, n - 1);
  let total = 0;
  let count = 0;
  // Summed in the order the pieces are traversed, arcs interleaved with strands, because
  // floating-point addition is not associative and this must match the boxed walk.
  if (closed)
    for (let v = 0; v < n; v++) {
      if (belt_solve_arc(sc, v, n, closed, wraps?.[v])) {
        total += sc.r[v] * sc.arcWrap[v];
        count++;
      }
      total += sc.ell[v];
      count++;
    }
  else
    for (let p = 0; p < pairs; p++) {
      total += sc.ell[p];
      count++;
      const v = p + 1;
      if (belt_solve_arc(sc, v, n, closed, wraps?.[v])) {
        total += sc.r[v] * sc.arcWrap[v];
        count++;
      }
    }
  return { total, count };
}

export function belt_locate(
  sc: BeltScratch,
  n: number,
  closed: boolean,
  s: number,
  wraps: ArrayLike<number> | undefined,
  out: BeltAt,
): void {
  const pairs = closed ? n : Math.max(0, n - 1);
  // `belt_solve_arc` is idempotent on solved pairs, so the walk below reads what this wrote.
  const { total, count } = belt_total(sc, n, closed, wraps);
  out.total = total;

  if (count === 0) {
    out.px = n > 0 ? sc.cx[0] : 0;
    out.py = n > 0 ? sc.cy[0] : 0;
    out.tx = 1;
    out.ty = 0;
    out.curvature = 0;
    out.viaA = -1;
    out.viaB = -1;
    return;
  }

  let local = closed && total > 0 ? ((s % total) + total) % total : s;
  // The last piece answers for any `s` past the end, which is how the boxed walk behaves
  // when it reaches its final index. Remembered rather than recomputed.
  let lastIsArc = false;
  let lastIndex = -1;
  let lastLocal = 0;

  const fill = (isArc: boolean, index: number, at: number) => {
    if (isArc) {
      const sign = sc.ccw[index] === 1 ? -1 : 1;
      const angle = sc.arcAngle[index] + (sign * at) / sc.r[index];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      out.px = sc.cx[index] + sc.r[index] * cos;
      out.py = sc.cy[index] + sc.r[index] * sin;
      out.tx = -(sign * sin);
      out.ty = sign * cos;
      out.curvature = sign / sc.r[index];
      out.viaA = index;
      out.viaB = index;
      return;
    }
    const fx = sc.depX[index];
    const fy = sc.depY[index];
    const dx = sc.arrX[index] - fx;
    const dy = sc.arrY[index] - fy;
    const length = sc.ell[index];
    const t = length > 1e-9 ? at / length : 0;
    out.px = fx + dx * t;
    out.py = fy + dy * t;
    const len2 = dx * dx + dy * dy;
    if (len2 > 1e-12) {
      const len = Math.sqrt(len2);
      out.tx = dx / len;
      out.ty = dy / len;
    } else {
      out.tx = 1;
      out.ty = 0;
    }
    out.curvature = 0;
    out.viaA = index;
    out.viaB = (index + 1) % n;
  };

  const visit = (isArc: boolean, index: number, length: number): boolean => {
    if (local <= length) {
      fill(isArc, index, local);
      return true;
    }
    lastIsArc = isArc;
    lastIndex = index;
    lastLocal = local;
    local -= length;
    return false;
  };

  if (closed) {
    for (let v = 0; v < n; v++) {
      if (sc.r[v] > 0 && visit(true, v, sc.r[v] * sc.arcWrap[v])) return;
      if (visit(false, v, sc.ell[v])) return;
    }
  } else {
    for (let p = 0; p < pairs; p++) {
      if (visit(false, p, sc.ell[p])) return;
      const v = p + 1;
      if (belt_has_arc(sc, v, n, closed) && visit(true, v, sc.r[v] * sc.arcWrap[v]))
        return;
    }
  }
  fill(lastIsArc, lastIndex, lastLocal);
}

/** Load via centres/radii/senses from `BeltVia` objects (the boxed, cold path). */
export function belt_load_vias(sc: BeltScratch, vias: BeltVia<Space>[]): void {
  for (let i = 0; i < vias.length; i++) {
    sc.cx[i] = vias[i].pos.x;
    sc.cy[i] = vias[i].pos.y;
    sc.r[i] = vias[i].radius;
    sc.ccw[i] = vias[i].direction ? 1 : 0;
  }
}

/**
 * Split a belt into its ordered geometric pieces (tangent segments + gear arcs).
 * `closed` treats the vias as a cycle (closed belt: gears only, wrap gN→g0);
 * otherwise as an open path (loose belt: terminals at both ends carry no arc).
 * Order for closed: arc(v0), seg(v0→v1), arc(v1), … ; for open: seg, arc, seg, …
 *
 * Boxes the scalar core above into objects, for drawing, hit-testing and edition.
 * The solver's hot constraints read the core directly.
 */
export function belt_pieces<S extends Space = "world">(
  vias: BeltVia<S>[],
  closed = false,
  wraps?: number[],
): BeltPiece<S>[] {
  const n = vias.length;
  const sc = belt_shared_scratch(Math.max(n, 1));
  belt_load_vias(sc, vias);
  const pairCount = belt_solve_pairs(sc, n, closed);

  const pieces: BeltPiece<S>[] = [];
  let s = 0;
  const pushArc = (v: number) => {
    if (!belt_solve_arc(sc, v, n, closed, wraps?.[v])) return;
    const wrap = sc.arcWrap[v];
    const length = vias[v].radius * wrap;
    pieces.push({
      kind: "arc",
      length,
      startS: s,
      gearIndex: v,
      center: vias[v].pos,
      radius: vias[v].radius,
      startAngle: sc.arcAngle[v],
      wrap,
      direction: vias[v].direction,
    });
    s += length;
  };
  const pushSeg = (p: number) => {
    const length = sc.ell[p];
    pieces.push({
      kind: "segment",
      length,
      startS: s,
      gearIndexA: p,
      gearIndexB: (p + 1) % n,
      from: new Point2<S>(sc.depX[p], sc.depY[p]),
      to: new Point2<S>(sc.arrX[p], sc.arrY[p]),
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
 * A belt `section` is an index into `belt_pieces(vias, closed)`.
 *
 * The two traversals do not share a parity: an open path starts on a run
 * (`seg, arc, seg…`), a closed one on an arc (`arc, seg, arc…`). Read the
 * helpers below rather than deriving anything from `section` by hand — the
 * closed case also shifts the indices, since it has no start terminal to offset
 * the pulleys.
 */
export function belt_section_is_run(section: number, closed: boolean): boolean {
  return closed ? section % 2 === 1 : section % 2 === 0;
}

/**
 * Where a pulley dropped on run `section` lands in `attachedGearsIDs`.
 * Undefined for an arc section, which no pulley can be inserted into.
 */
export function belt_section_insertion_index(
  section: number,
  closed: boolean,
): number | undefined {
  if (!belt_section_is_run(section, closed)) return undefined;
  return closed ? (section - 1) / 2 + 1 : section / 2;
}

/**
 * Which pulley of `attachedGearsIDs` arc `section` wraps.
 * Undefined for a run section, which wraps none.
 */
export function belt_section_gear_index(
  section: number,
  closed: boolean,
): number | undefined {
  if (belt_section_is_run(section, closed)) return undefined;
  return closed ? section / 2 : (section - 1) / 2;
}

/**
 * Where the two runs adjacent to arc `section` merge once its pulley leaves the
 * belt, expressed in the numbering of the shortened belt (`gearCount` counts the
 * pulleys BEFORE the removal). A closed path wraps around, so the first pulley's
 * arc merges into the last run.
 */
export function belt_merged_run_section(
  section: number,
  closed: boolean,
  gearCount: number,
): number {
  if (!closed) return section - 1;
  const sections = 2 * (gearCount - 1);
  if (sections <= 0) return 0;
  return ((section - 1) % sections + sections) % sections;
}

/**
 * Raw wrap angle (∈ [0, 2π)) of each via on the path, 0 for terminals / vias
 * with no arc. Index-aligned to `vias`.
 */
export function belt_wraps(vias: BeltVia<Space>[], closed = false): number[] {
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
export function belt_arrivals(
  vias: BeltVia<Space>[],
  closed = false,
): number[] {
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
  vias: BeltVia<Space>[],
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
export function nearest_point_on_piece<S extends Space = "world">(
  p: Point2<S>,
  piece: NoInfer<BeltPiece<S>>,
): Point2<S> {
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
  return piece.center.add(Point2.from_polar<S>(piece.radius, angle));
}

/**
 * Project a point onto a belt path: returns the arc-length `s`, the on-belt
 * `point`, and the unit `tangent` there. Uses the clamped nearest point of each
 * piece (so it never lands on a pulley's free side).
 */
export function belt_project<S extends Space = "world">(
  vias: BeltVia<S>[],
  p: NoInfer<Point2<S>>,
  closed = false,
  wraps?: number[],
): { s: number; point: Point2<S>; tangent: Point2<S> } {
  const pieces = belt_pieces(vias, closed, wraps);
  if (pieces.length === 0)
    return { s: 0, point: p, tangent: new Point2<S>(1, 0) };
  let bestDist = Infinity;
  let bestS = 0;
  let bestPoint =
    pieces[0].kind === "arc"
      ? pieces[0].center.add(
          Point2.from_polar<S>(pieces[0].radius, pieces[0].startAngle),
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
export function belt_point_tangent<S extends Space = "world">(
  vias: BeltVia<S>[],
  s: number,
  closed = false,
  wraps?: number[],
): { point: Point2<S>; tangent: Point2<S>; curvature: number } {
  const pieces = belt_pieces(vias, closed, wraps);
  const total = pieces.reduce((a, p) => a + p.length, 0);
  if (pieces.length === 0)
    return {
      point: vias[0]?.pos ?? new Point2<S>(0, 0),
      tangent: new Point2<S>(1, 0),
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
            dir.length_squared() > 1e-12
              ? dir.normalize()
              : new Point2<S>(1, 0),
          curvature: 0,
        };
      }
      const sign = piece.direction ? -1 : 1;
      const angle = piece.startAngle + (sign * local) / piece.radius;
      return {
        point: piece.center.add(Point2.from_polar<S>(piece.radius, angle)),
        tangent: Point2.from_polar<S>(sign, angle).perp(),
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
    point: last.center.add(Point2.from_polar<S>(last.radius, last.startS)),
    tangent: Point2.from_polar<S>(
      last.direction ? -1 : 1,
      last.startAngle,
    ).perp(),
    curvature: 0,
  };
}
