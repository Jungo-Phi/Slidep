import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import poulieJson from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import { Link, Point2 } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import { belt_arc_sweep, belt_pieces, BeltVia } from "../../utils/belt-path";
import { compile_simulation_model } from "./kinematic-simulation";
import { viasFrom } from "./experimental/belt-noslip-q";

/**
 * Where the time of one belt-constraint application goes, on the real geometries of the
 * dossier. Five variants of the SAME computation, alternated in one process (never two
 * runs compared), so the split between arithmetic and boxing is readable:
 *
 *   pieces        what a constraint does today, minus the via rebuild
 *   vias+pieces   what it really does per application (vias reboxed from raw coords)
 *   tangents      the tangent solves alone, no piece objects
 *   scalar        the same numbers, computed into preallocated Float64Arrays
 *   scalar×2      the two pairs a strand actually needs, scalar
 */

const REPS = 7;
const ITERS = 20_000;

type Geometry = { name: string; vias: BeltVia[]; closed: boolean };

/** The belts of a mechanism, as the solver sees them at rest. */
function geometries(name: string, json: string): Geometry[] {
  const model = compile_simulation_model(
    load_mechanism(JSON.parse(json)).mechanism,
  );
  const out: Geometry[] = [];
  model.links.forEach((link: Link, i) => {
    if (link.type !== "BeltLength") return;
    const vias = viasFrom(model.nodes.positions, link);
    if (vias) out.push({ name: `${name} #${i}`, vias, closed: link.closed });
  });
  return out;
}

/** Scratch buffers, sized once — the shape the optimised core would use. */
function workspace(n: number) {
  return {
    cx: new Float64Array(n),
    cy: new Float64Array(n),
    r: new Float64Array(n),
    dir: new Uint8Array(n),
    depX: new Float64Array(n),
    depY: new Float64Array(n),
    arrX: new Float64Array(n),
    arrY: new Float64Array(n),
    ell: new Float64Array(n),
    startAngle: new Float64Array(n),
    wrap: new Float64Array(n),
  };
}

type Workspace = ReturnType<typeof workspace>;

/** Load the via centres into the workspace, as reading `nodes.x/y` would. */
function loadVias(w: Workspace, vias: BeltVia[]): void {
  for (let i = 0; i < vias.length; i++) {
    w.cx[i] = vias[i].pos.x;
    w.cy[i] = vias[i].pos.y;
    w.r[i] = vias[i].radius;
    w.dir[i] = vias[i].clockwise ? 1 : 0;
  }
}

/**
 * One tangent pair, scalar: transcribed from `Point2.circles_link` term for term, then
 * the strand length. Writes departure on `a` and arrival on `b`.
 */
function tangentPair(w: Workspace, a: number, b: number, p: number): void {
  const dx = w.cx[b] - w.cx[a];
  const dy = w.cy[b] - w.cy[a];
  const d = Math.sqrt(dx * dx + dy * dy);
  const d1 = w.dir[a] === 1;
  const d2 = w.dir[b] === 1;
  let sx: number, sy: number, ex: number, ey: number;
  const gap = d1 === d2 ? w.r[a] - w.r[b] : w.r[b] + w.r[a];
  if (d < (d1 === d2 ? Math.abs(gap) : gap)) {
    const inv = 1 / d;
    sx = dx * inv * w.r[a];
    sy = dy * inv * w.r[a];
    ex = dx * inv * -w.r[b];
    ey = dy * inv * -w.r[b];
  } else {
    const alpha = Math.asin(gap / d);
    const ang = Math.atan2(dy, dx) + alpha * (d1 ? -1 : 1) + Math.PI / 2;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const ka = w.r[a] * (d1 ? 1 : -1);
    const kb = w.r[b] * (d2 ? 1 : -1);
    sx = nx * ka;
    sy = ny * ka;
    ex = nx * kb;
    ey = ny * kb;
  }
  w.depX[p] = w.cx[a] + sx;
  w.depY[p] = w.cy[a] + sy;
  w.arrX[p] = w.cx[b] + ex;
  w.arrY[p] = w.cy[b] + ey;
  const lx = w.arrX[p] - w.depX[p];
  const ly = w.arrY[p] - w.depY[p];
  w.ell[p] = Math.sqrt(lx * lx + ly * ly);
}

/** Arc of via `v`: arrival angle and wrap, from the pairs bracketing it. */
function arcOfVia(w: Workspace, v: number, pIn: number, pOut: number): void {
  const sa = Math.atan2(w.arrY[pIn] - w.cy[v], w.arrX[pIn] - w.cx[v]);
  const ea = Math.atan2(w.depY[pOut] - w.cy[v], w.depX[pOut] - w.cx[v]);
  w.startAngle[v] = sa;
  w.wrap[v] = belt_arc_sweep(sa, ea, w.dir[v] === 1);
}

/** The whole belt, scalar. */
function scalarAll(w: Workspace, n: number, closed: boolean): number {
  const pairs = closed ? n : n - 1;
  for (let p = 0; p < pairs; p++) tangentPair(w, p, (p + 1) % n, p);
  let acc = 0;
  for (let v = 0; v < n; v++) {
    if (w.r[v] <= 0) continue;
    const pIn = (v - 1 + pairs) % pairs;
    if (!closed && (v === 0 || v === n - 1)) continue;
    arcOfVia(w, v, pIn, v);
    acc += w.wrap[v];
  }
  for (let p = 0; p < pairs; p++) acc += w.ell[p];
  return acc;
}

/** Only what one strand needs: its own pair and the one before it. */
function scalarStrand(
  w: Workspace,
  n: number,
  closed: boolean,
  seg: number,
): number {
  const pairs = closed ? n : n - 1;
  const prev = (seg - 1 + pairs) % pairs;
  tangentPair(w, prev, (prev + 1) % n, prev);
  tangentPair(w, seg, (seg + 1) % n, seg);
  const a = seg;
  if (w.r[a] > 0) arcOfVia(w, a, prev, seg);
  return w.ell[seg] + w.wrap[a] + w.startAngle[a];
}

/** Rebuild the via objects from raw coordinates, as `viasFromSlots` does per application. */
function reboxVias(w: Workspace, n: number): BeltVia[] {
  const vias: BeltVia[] = [];
  for (let i = 0; i < n; i++)
    vias.push({
      pos: new Point2(w.cx[i], w.cy[i]),
      radius: w.r[i],
      clockwise: w.dir[i] === 1,
    });
  return vias;
}

function timed(iters: number, body: (i: number) => number): number {
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < iters; i++) sink += body(i);
  const dt = performance.now() - t0;
  if (!Number.isFinite(sink)) throw new Error("sink");
  return dt;
}

describe("géométrie de courroie — où passe le temps", () => {
  it("répartition par variante", () => {
    const geoms = [
      ...geometries("Core XY", coreXY2),
      ...geometries("Poulie bloqueuse", poulieJson),
    ];

    const rows: string[] = [];
    for (const g of geoms) {
      const n = g.vias.length;
      const w = workspace(n);
      loadVias(w, g.vias);
      const variants: [string, (i: number) => number][] = [
        [
          "pieces",
          () => belt_pieces(g.vias, g.closed).reduce((a, p) => a + p.length, 0),
        ],
        [
          "vias+pieces",
          () =>
            belt_pieces(reboxVias(w, n), g.closed).reduce(
              (a, p) => a + p.length,
              0,
            ),
        ],
        [
          "tangents",
          () => {
            const pairs = g.closed ? n : n - 1;
            let acc = 0;
            for (let p = 0; p < pairs; p++) {
              const a = g.vias[p];
              const b = g.vias[(p + 1) % n];
              const { start, end } = Point2.circles_link(
                a.pos,
                a.radius,
                a.clockwise,
                b.pos,
                b.radius,
                b.clockwise,
              );
              acc += a.pos.add(start).distance_to(b.pos.add(end));
            }
            return acc;
          },
        ],
        ["scalar", () => scalarAll(w, n, g.closed)],
        [
          "scalar×2",
          (i) => scalarStrand(w, n, g.closed, i % (g.closed ? n : n - 1)),
        ],
      ];

      const best = new Map<string, number>();
      for (let rep = 0; rep < REPS; rep++)
        for (const [name, body] of variants) {
          const dt = timed(ITERS, body);
          const prev = best.get(name);
          if (prev === undefined || dt < prev) best.set(name, dt);
        }

      const ns = (dt: number) => (dt * 1e6) / ITERS;
      const ref = ns(best.get("vias+pieces")!);
      rows.push(
        `  | ${g.name} (${n} vias, ${g.closed ? "fermée" : "ouverte"}) | ` +
          variants
            .map(([name]) => {
              const v = ns(best.get(name)!);
              return `${v.toFixed(0)} ns (${(ref / v).toFixed(1)}×)`;
            })
            .join(" | ") +
          " |",
      );
    }

    console.log(
      "\n  | géométrie | " +
        "pieces | vias+pieces | tangents | scalar | scalar×2 |",
    );
    console.log("  |---|---|---|---|---|---|");
    for (const row of rows) console.log(row);
    console.log(
      "\n  (× = gain par rapport à `vias+pieces`, ce que fait une application aujourd'hui)",
    );
  }, 300_000);
});
