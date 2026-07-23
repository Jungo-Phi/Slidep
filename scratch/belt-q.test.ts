import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import fixtureJson from "../test-mechanisms/Core XY modifié.slidep?raw";
import { Point2 } from "../src/types/point2";
import { Link, Mechanism } from "../src/types";
import { load_mechanism } from "../src/utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
} from "../src/components/solver/kinematic-simulation";
import { belt_pieces, BeltVia } from "../src/utils/belt-path";

/**
 * THROWAWAY validation harness for the "q model" design note. Measures only:
 * nothing in src/ is touched. Dumps every measured Δh vector to scratch/data.json,
 * where scratch/q_system.py does the linear algebra.
 */

const f = (x: number, n = 4) => x.toFixed(n);
const P = (x: number, y: number) => new Point2(x, y);
const TAU = 2 * Math.PI;

// ── The belt state the q model reads ────────────────────────────────────────
// Conventions, all read from the codebase, never guessed:
//   ε = direction ? −1 : 1                      (constraint-functions.ts:1521, 1696)
//   arc.startAngle = ARRIVAL rim angle          (belt-path.ts:91, belt_arrivals doc)
//   departure rim angle = arrival + ε·wrap      (belt-path.ts:356-357, angle = start + sign·local/r)
//   wrap ≥ 0, |·| of the sweep                  (belt-path.ts:19-22)
//   s increases along the traversal order       (belt-path.ts:99-124)
// A pulley's material advance in belt-px is q = r·ε·θ (same r·ε as BeltPin, :1521).
// The two rim angles, in belt-px in the LAB frame:
//   v = r·ε·(arrival)      (belt coordinate of the arrival/touch-down point)
//   u = r·ε·(departure) = v + r·wrap   (belt coordinate of the departure point)
// so the contact arc is exactly u − v.

type ViaSpec = { pos: Point2; radius: number; direction: boolean };

type BeltState = {
  segs: { a: number; b: number; len: number }[];
  /** per via: null for a terminal (r = 0, no arc) */
  arc: ({ arrival: number; wrap: number; r: number; eps: number } | null)[];
  total: number;
};

const readState = (vias: ViaSpec[], closed: boolean): BeltState => {
  const pieces = belt_pieces(vias as BeltVia[], closed);
  const arc: BeltState["arc"] = vias.map(() => null);
  const segs: BeltState["segs"] = [];
  let total = 0;
  for (const p of pieces) {
    total += p.length;
    if (p.kind === "segment") segs.push({ a: p.gearIndexA, b: p.gearIndexB, len: p.length });
    else
      arc[p.gearIndex] = {
        arrival: p.startAngle,
        wrap: p.wrap,
        r: p.radius,
        eps: p.direction ? -1 : 1,
      };
  }
  return { segs, arc, total };
};

/** Unwrap `cur`'s arrival angles onto the branch nearest `ref`'s (the raw atan2
 *  seam would inject 2πr of phantom belt — same fix as psiArr, :1198-1206). */
const unwrapped = (cur: BeltState, ref: BeltState): number[] =>
  cur.arc.map((a, i) => {
    if (!a) return 0;
    const r0 = ref.arc[i];
    if (!r0) return a.arrival;
    let d = a.arrival - r0.arrival;
    while (d > Math.PI) d -= TAU;
    while (d <= -Math.PI) d += TAU;
    return r0.arrival + d;
  });

/** u and v (belt-px coordinates of the departure / arrival points) per via. */
const uv = (st: BeltState, arrivals: number[]) => {
  const u: number[] = [];
  const v: number[] = [];
  st.arc.forEach((a, i) => {
    if (!a) {
      u.push(0);
      v.push(0);
      return;
    }
    v.push(a.r * a.eps * arrivals[i]);
    u.push(a.r * a.eps * arrivals[i] + a.r * a.wrap);
  });
  return { u, v };
};

/**
 * Per-segment material balance between two states. For segment k: a → b,
 *     h_k = ℓ_k + u_a − v_b        and       q_a − q_b = Δh_k.
 * Also returns the naive segment-only right-hand side Δℓ_k, for comparison.
 */
const deltaH = (ref: BeltState, cur: BeltState) => {
  const aRef = ref.arc.map((a) => (a ? a.arrival : 0));
  const aCur = unwrapped(cur, ref);
  const r = uv(ref, aRef);
  const c = uv(cur, aCur);
  return ref.segs.map((s, k) => {
    const dLen = cur.segs[k].len - s.len;
    const dU = c.u[s.a] - r.u[s.a];
    const dV = c.v[s.b] - r.v[s.b];
    const dArcA = ref.arc[s.a] ? cur.arc[s.a]!.r * (cur.arc[s.a]!.wrap - ref.arc[s.a]!.wrap) : 0;
    return { a: s.a, b: s.b, dLen, dU, dV, dArcA, dH: dLen + dU - dV };
  });
};

const rigid = (vias: ViaSpec[], about: Point2, alpha: number, t: Point2): ViaSpec[] =>
  vias.map((v) => ({
    ...v,
    pos: about.add(v.pos.sub(about).rotate(alpha)).add(t),
  }));

// ────────────────────────────────────────────────────────────────────────────
// Hand-built geometries. Radii, centres and wrap senses are explicit.
// OPEN: terminal S → 3 pulleys (mixed senses) → terminal E.
const OPEN: ViaSpec[] = [
  { pos: P(-260, 40), radius: 0, direction: false },
  { pos: P(-120, -30), radius: 50, direction: false },
  { pos: P(140, 20), radius: 30, direction: true },
  { pos: P(10, 160), radius: 20, direction: false },
  { pos: P(180, 220), radius: 0, direction: false },
];
// CLOSED: 3 pulleys, unequal radii, mixed senses (a crossed belt).
const CLOSED: ViaSpec[] = [
  { pos: P(-130, 0), radius: 45, direction: false },
  { pos: P(60, -110), radius: 25, direction: true },
  { pos: P(90, 95), radius: 35, direction: false },
];
const LOG: string[] = [];
const log = (s = "") => LOG.push(s);
afterAll(() => writeFileSync("scratch/report.md", LOG.join("\n")));

const dump: Record<string, unknown> = {};

describe("Q1 — what does the per-segment no-slip conserve?", () => {
  it("global rigid rotation: known truth θ_k = α for every pulley", () => {
    log("\n### Q1.a — rotation rigide globale (vérité connue : θ_k = α)\n");
    log(
      "| montage | α | segment | Δℓ | Δu − Δv | Δh | q_a − q_b (vérité) | résidu loi arcs | résidu loi Δℓ seule |",
    );
    log("|---|---|---|---|---|---|---|---|---|");
    const rows: Record<string, number[]> = { withArc: [], segOnly: [] };
    for (const [name, vias, closed] of [
      ["ouverte", OPEN, false],
      ["fermée", CLOSED, true],
    ] as const) {
      for (const alpha of [0.03, 0.4, -1.1]) {
        const ref = readState(vias, closed);
        const cur = readState(rigid(vias, P(37, -19), alpha, P(0, 0)), closed);
        const dh = deltaH(ref, cur);
        // Truth: every pulley turns by α, terminals feed nothing.
        const q = vias.map((v) => (v.radius > 0 ? v.radius * (v.direction ? -1 : 1) * alpha : 0));
        dh.forEach((d) => {
          const truth = q[d.a] - q[d.b];
          const resArc = truth - d.dH;
          const resSeg = truth - d.dLen;
          rows.withArc.push(Math.abs(resArc));
          rows.segOnly.push(Math.abs(resSeg));
          log(
            `| ${name} | ${alpha} | ${d.a}→${d.b} | ${f(d.dLen, 3)} | ${f(d.dU - d.dV, 3)} | ${f(
              d.dH,
              3,
            )} | ${f(truth, 3)} | ${resArc.toExponential(2)} | **${f(resSeg, 3)}** |`,
          );
        });
      }
    }
    const maxArc = Math.max(...rows.withArc);
    const maxSeg = Math.max(...rows.segOnly);
    log(
      `\nRésidu max — loi AVEC arcs : ${maxArc.toExponential(2)} px ; loi Δℓ seule : ${f(maxSeg, 3)} px.`,
    );
    dump.q1_rigid = { maxArc, maxSeg };
    expect(maxArc).toBeLessThan(1e-9);
  });

  it("global rigid translation, and pure belt travel", () => {
    log("\n### Q1.b — translation rigide (θ = 0) et voyage pur (géométrie figée)\n");
    const ref = readState(CLOSED, true);
    const cur = readState(rigid(CLOSED, P(0, 0), 0, P(-77, 41)), true);
    const dh = deltaH(ref, cur);
    const maxT = Math.max(...dh.map((d) => Math.abs(d.dH)));
    log(
      `- translation de (−77, 41) px, θ = 0 : max |Δh| = ${maxT.toExponential(2)} px ` +
        `(max |Δℓ| = ${Math.max(...dh.map((d) => Math.abs(d.dLen))).toExponential(2)})`,
    );
    // Pure travel: geometry unchanged ⇒ Δh ≡ 0 ⇒ q_a = q_b for every segment.
    log(
      `- voyage pur : géométrie inchangée ⇒ Δh ≡ 0 ⇒ q identiques ⇒ θ_k = δ/(r_k ε_k)`,
    );
    dump.q1_translation = { maxAbsDh: maxT };
    expect(maxT).toBeLessThan(1e-9);
  });

  it("middle pulley translated with θ = 0: what actually changes", () => {
    log("\n### Q1.c — poulie du milieu translatée, θ = 0 partout\n");
    log("| amplitude | segment | Δℓ | Δ(arc de a) | Δu | Δv | Δh |");
    log("|---|---|---|---|---|---|---|");
    const ref = readState(OPEN, false);
    const table: Record<string, unknown>[] = [];
    for (const t of [P(0, 12), P(0, 60), P(-35, 45)]) {
      const moved = OPEN.map((v, i) => (i === 2 ? { ...v, pos: v.pos.add(t) } : v));
      const cur = readState(moved, false);
      const dh = deltaH(ref, cur);
      dh.forEach((d) =>
        log(
          `| (${d.a === 0 ? "" : ""}${t.x}, ${t.y}) | ${d.a}→${d.b} | ${f(d.dLen, 3)} | ${f(
            d.dArcA,
            3,
          )} | ${f(d.dU, 3)} | ${f(d.dV, 3)} | ${f(d.dH, 3)} |`,
        ),
      );
      const sumH = dh.reduce((a, d) => a + d.dH, 0);
      const dL = cur.total - ref.total;
      log(
        `| **somme** | | ${f(dh.reduce((a, d) => a + d.dLen, 0), 3)} | | | | **${f(sumH, 3)}** ` +
          `(ΔL total = ${f(dL, 3)}, écart ${(sumH - dL).toExponential(2)}) |`,
      );
      table.push({
        t: [t.x, t.y],
        dH: dh.map((d) => d.dH),
        dLen: dh.map((d) => d.dLen),
        sumMinusTotal: sumH - dL,
      });
    }
    dump.q1_middle = table;
    expect(table.length).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
const CARRIAGE = "4771336b-875c-4970-945f-f131754bd813";
const GROUNDED_ON_PULLEY = "e8e3059a-bb45-4896-b2d3-7d91152854c0";

const loadFixture = (): Mechanism => load_mechanism(JSON.parse(fixtureJson)).mechanism;
const at = (positions: Map<string, Point2>, key: string) =>
  positions.get(key) ?? positions.get(key.split(",")[0]);

const beltVias = (
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
): { vias: ViaSpec[]; labels: string[] } | null => {
  const vias: ViaSpec[] = [];
  const labels: string[] = [];
  if (!link.closed) {
    const s = at(positions, link.startKey);
    if (!s) return null;
    vias.push({ pos: s, radius: 0, direction: false });
    labels.push("S");
  }
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    if (link.disconnected?.[i]) continue;
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], direction: link.directions[i] });
    labels.push(link.gearPosKeys[i].split(",")[0].slice(0, 8));
  }
  if (!link.closed) {
    const e = at(positions, link.endKey);
    if (!e) return null;
    vias.push({ pos: e, radius: 0, direction: false });
    labels.push("E");
  }
  return { vias, labels };
};

/** Grab the carriage along `dir`, BeltLength dropped so it actually follows. */
const grab = (dir: Point2, dist: number) => {
  const model = compile_simulation_model(loadFixture());
  const belts = model.links.filter(
    (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
  );
  model.links = model.links.filter(
    (l) => l.type !== "MotorAngle" && l.type !== "BeltLength",
  );
  const key = model.keyMap.get(CARRIAGE) ?? CARRIAGE;
  const start = model.nodes.positions.get(key)!.clone();
  const path: Point2[] = [];
  for (let i = 0; i < 5; i++) path.push(start.clone());
  for (let d = 2; d <= dist; d += 2) path.push(start.add(dir.mul(d)));

  let prevP: Map<string, Point2> | null = null;
  let prevA: Map<string, number> | null = null;
  let refP: Map<string, Point2> | null = null;
  let lastP: Map<string, Point2> | null = null;
  let refC = start;
  let lastC = start;
  for (let i = 0; i < path.length; i++) {
    const snap = step_simulation(model, i / 60, prevP, prevA, 1 / 60, {
      key: CARRIAGE,
      target: path[i],
    });
    prevP = snap.positions;
    prevA = snap.angles;
    if (i === 4) {
      refP = snap.positions;
      refC = at(snap.positions, key)!.clone();
    }
    lastP = snap.positions;
    lastC = at(snap.positions, key)!.clone();
  }
  return { belts, refP: refP!, lastP: lastP!, move: lastC.sub(refC) };
};

describe("Q2/B — Core XY, measured per-segment Δh", () => {
  it("identifies which pulley the grounded join freezes", () => {
    const model = compile_simulation_model(loadFixture());
    log("\n### Core XY — quelle poulie le nœud ancré immobilise-t-il ?\n");
    const short = (s: string) => s.split(",")[0].slice(0, 8);
    for (const l of model.links) {
      const fields = Object.entries(l).filter(
        ([, v]) => typeof v === "string" && v.includes(GROUNDED_ON_PULLEY.slice(0, 8)),
      );
      if (fields.length === 0) continue;
      log(
        `- ${l.type} : ${Object.entries(l)
          .filter(([k, v]) => typeof v === "string" && k.toLowerCase().includes("key"))
          .map(([k, v]) => `${k} = ${short(v as string)}`)
          .join(", ")}`,
      );
    }
    const belts = model.links.filter(
      (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
    );
    belts.forEach((b) =>
      log(
        `- courroie ${b.owner?.slice(0, 8)} : poulies ${b.gearPosKeys
          .map((k) => short(k))
          .join(", ")}`,
      ),
    );
    expect(belts.length).toBe(2);
  });

  it("measures Δh per segment for an x grab and a y grab", () => {
    const out: Record<string, unknown> = {};
    for (const [axis, dir, dist] of [
      ["x", P(-1, 0), 120],
      ["y", P(0, -1), 120],
      ["x12", P(-1, 0), 12],
      ["y12", P(0, -1), 12],
    ] as const) {
      const g = grab(dir, dist);
      log(
        `\n### Core XY — saisie ${axis} (BeltLength retirée), déplacement réel (${f(
          g.move.x,
          1,
        )}, ${f(g.move.y, 1)}) px\n`,
      );
      const belts: Record<string, unknown>[] = [];
      for (const belt of g.belts) {
        const a = beltVias(belt, g.refP);
        const b = beltVias(belt, g.lastP);
        if (!a || !b) continue;
        const ref = readState(a.vias, belt.closed);
        const cur = readState(b.vias, belt.closed);
        const dh = deltaH(ref, cur);
        log(`**Courroie ${belt.owner?.slice(0, 8)}**\n`);
        log("| segment | Δℓ | Δu − Δv | Δh |");
        log("|---|---|---|---|");
        dh.forEach((d) =>
          log(
            `| ${a.labels[d.a]}→${a.labels[d.b]} | ${f(d.dLen, 2)} | ${f(
              d.dU - d.dV,
              2,
            )} | ${f(d.dH, 2)} |`,
          ),
        );
        log(
          `\nΣΔh = ${f(dh.reduce((s, d) => s + d.dH, 0), 3)} px, ΔL total = ${f(
            cur.total - ref.total,
            3,
          )} px.\n`,
        );
        belts.push({
          owner: belt.owner?.slice(0, 8),
          labels: a.labels,
          radii: belt.radii,
          directions: belt.directions,
          segs: dh.map((d) => ({ a: d.a, b: d.b, dH: d.dH, dLen: d.dLen })),
          dTotal: cur.total - ref.total,
        });
      }
      out[axis] = { move: [g.move.x, g.move.y], belts };
    }
    dump.corexy = out;
    writeFileSync("scratch/data.json", JSON.stringify(dump, null, 1));
    expect(Object.keys(out).length).toBe(4);
  });
});
