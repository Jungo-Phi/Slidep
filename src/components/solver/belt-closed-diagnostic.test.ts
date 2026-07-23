import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { belt_pieces, belt_project, BeltVia } from "../../utils/belt-path";
import { applyBeltLengthConstraint } from "./constraint-functions";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { collect_solver_trace } from "./solver-trace";

/**
 * Diagnostic harness for the CLOSED belt: is BeltLength's analytic gradient
 * (−sum of adjacent tangent units) the true ∂L/∂centre? Measures only — it never
 * touches a constraint. Run with `-t "belt closed diagnostic"` and read stdout.
 */

const P = (x: number, y: number) => new Point2(x, y);

type Case = {
  name: string;
  keys: string[];
  centres: Point2[];
  radii: number[];
  directions: boolean[];
  masses: number[];
};

const CASES: Case[] = [
  {
    name: "A — 2 pulleys, equal radii, both centres free",
    keys: ["gA", "gB"],
    centres: [P(-100, 0), P(100, 0)],
    radii: [40, 40],
    directions: [false, false],
    masses: [1, 1],
  },
  {
    name: "B — 2 pulleys, equal radii, gA anchored",
    keys: ["gA", "gB"],
    centres: [P(-100, 0), P(100, 0)],
    radii: [40, 40],
    directions: [false, false],
    masses: [0, 1],
  },
  {
    name: "C — 3 pulleys, unequal radii, gA anchored",
    keys: ["gA", "gB", "gC"],
    centres: [P(-120, -30), P(140, 20), P(10, 160)],
    radii: [50, 30, 20],
    directions: [false, false, false],
    masses: [0, 1, 1],
  },
  {
    name: "D — 2 pulleys, unequal radii, oblique (asymmetric)",
    keys: ["gA", "gB"],
    centres: [P(-73, -41), P(118, 87)],
    radii: [55, 22],
    directions: [false, false],
    masses: [1, 1],
  },
  {
    name: "E — 3 pulleys, unequal radii, mixed wrap senses",
    keys: ["gA", "gB", "gC"],
    centres: [P(-130, 0), P(60, -110), P(90, 95)],
    radii: [45, 25, 35],
    directions: [false, true, false],
    masses: [1, 1, 1],
  },
];

const positionsOf = (c: Case) =>
  new Map<string, Point2>(c.keys.map((k, i) => [k, c.centres[i].clone()]));

const massesOf = (c: Case) =>
  new Map<string, number>(c.keys.map((k, i) => [k, c.masses[i]]));

const viasOf = (c: Case, positions: Map<string, Point2>): BeltVia[] =>
  c.keys.map((k, i) => ({
    pos: positions.get(k)!,
    radius: c.radii[i],
    direction: c.directions[i],
  }));

/** Total closed-loop length, through the exact chain the constraint uses. */
const loopLength = (c: Case, positions: Map<string, Point2>): number =>
  belt_pieces(viasOf(c, positions), true).reduce((a, p) => a + p.length, 0);

/**
 * ∂L/∂centre as the constraint builds it (constraint-functions.ts:1129-1154,
 * closed branch): every straight run A→B adds −û to A and +û to B; arcs add
 * nothing (envelope theorem). Transcribed, not called — the accumulator is
 * inlined in the constraint.
 */
const analyticGrad = (
  c: Case,
  positions: Map<string, Point2>,
): Map<string, Point2> => {
  const grad = new Map<string, Point2>(c.keys.map((k) => [k, P(0, 0)]));
  const add = (k: string, g: Point2) => grad.set(k, grad.get(k)!.add(g));
  for (const piece of belt_pieces(viasOf(c, positions), true)) {
    if (piece.kind !== "segment") continue;
    const d = piece.to.sub(piece.from);
    if (d.length_squared() < 1e-12) continue;
    const u = d.normalize();
    add(c.keys[piece.gearIndexA], u.mul(-1));
    add(c.keys[piece.gearIndexB], u);
  }
  return grad;
};

/** Central-difference ∂L/∂centre, one axis at a time. */
const numericGrad = (
  c: Case,
  positions: Map<string, Point2>,
  eps: number,
): Map<string, Point2> => {
  const grad = new Map<string, Point2>();
  for (const key of c.keys) {
    const base = positions.get(key)!;
    const at = (dx: number, dy: number) => {
      const p = new Map(positions);
      p.set(key, P(base.x + dx, base.y + dy));
      return loopLength(c, p);
    };
    grad.set(
      key,
      P(
        (at(eps, 0) - at(-eps, 0)) / (2 * eps),
        (at(0, eps) - at(0, -eps)) / (2 * eps),
      ),
    );
  }
  return grad;
};

const beltLink = (
  c: Case,
  length: number,
): Extract<Link, { type: "BeltLength" }> => ({
  type: "BeltLength",
  ddl: 1,
  startKey: "s",
  endKey: "e",
  gearPosKeys: [...c.keys],
  gearAngleKeys: [...c.keys],
  radii: [...c.radii],
  directions: [...c.directions],
  length,
  closed: true,
});

const f = (x: number, n = 6) => x.toFixed(n);

describe("belt closed diagnostic — gradient of BeltLength", () => {
  it("compares the analytic centre gradient against finite differences", () => {
    const EPS = 1e-4 * 200; // 1e-4 · characteristic size (px)
    let worst = 0;
    console.log("\n### Gradient check (closed belt), ε = " + EPS + " px\n");
    console.log(
      "| case | centre | grad_num | grad_analytique | ‖Δ‖ | écart relatif |",
    );
    console.log("|---|---|---|---|---|---|");
    for (const c of CASES) {
      const positions = positionsOf(c);
      const num = numericGrad(c, positions, EPS);
      const ana = analyticGrad(c, positions);
      for (const key of c.keys) {
        const n = num.get(key)!;
        const a = ana.get(key)!;
        const diff = a.sub(n).length();
        const scale = Math.max(n.length(), 1e-12);
        const rel = diff / scale;
        worst = Math.max(worst, rel);
        console.log(
          `| ${c.name.split(" — ")[0]} | ${key} | (${f(n.x)}, ${f(n.y)}) | (${f(
            a.x,
          )}, ${f(a.y)}) | ${diff.toExponential(2)} | ${rel.toExponential(2)} |`,
        );
      }
    }
    console.log(`\nworst relative error = ${worst.toExponential(3)}\n`);
    // Central differences at ε = 0.02 px on a ~200 px mechanism: exact to ~1e-8.
    expect(worst).toBeLessThan(1e-6);
  });

  it("traces convergence from a 5 px perturbation", () => {
    console.log("\n### Convergence traces (perturbation: gB +5 px on x)\n");
    for (const c of CASES) {
      const rest = positionsOf(c);
      const L0 = loopLength(c, rest);
      const positions = positionsOf(c);
      positions.set("gB", positions.get("gB")!.add(P(5, 0)));
      const masses = massesOf(c);
      const link = beltLink(c, L0);

      console.log(`\n**${c.name}** — L0 = ${f(L0, 4)} px\n`);
      console.log(
        "| balayage | \\|C\\| (px) | Σw‖∇‖² | déplacement max (px) |",
      );
      console.log("|---|---|---|---|");
      for (let i = 0; i < 20; i++) {
        // Denominator as the constraint computes it, from the pre-sweep state.
        const grad = analyticGrad(c, positions);
        let denom = 0;
        grad.forEach((g, k) => {
          denom += (masses.get(k) ?? 1) * g.length_squared();
        });
        const before = new Map(
          [...positions].map(([k, p]) => [k, p.clone()] as const),
        );
        const residual = applyBeltLengthConstraint(
          positions,
          masses,
          new Map(),
          link,
        );
        let moved = 0;
        positions.forEach((p, k) => {
          moved = Math.max(moved, p.distance_to(before.get(k)!));
        });
        console.log(
          `| ${i} | ${residual.toExponential(4)} | ${f(denom, 4)} | ${f(
            moved,
            6,
          )} |`,
        );
        if (residual < 1e-12) break;
      }
    }
    expect(true).toBe(true);
  });

  it("lists the DOFs BeltLength and BeltPhaseGear each write", () => {
    // Case A driven by a grab, with the no-slip links the parser emits for every
    // pulley of a belt (parsing.ts:650-674) — closed belts get them too.
    const c = CASES[0];
    const positions = positionsOf(c);
    const L0 = loopLength(c, positions);
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
      ["belt:phi", 0],
    ]);
    const links: Link[] = [
      beltLink(c, L0),
      {
        type: "BeltPhaseGear",
        ddl: 1,
        angleKey: "gA",
        phaseKey: "belt:phi",
        r: 40,
        eps: 1,
        theta0: 0,
      },
      {
        type: "BeltPhaseGear",
        ddl: 1,
        angleKey: "gB",
        phaseKey: "belt:phi",
        r: 40,
        eps: 1,
        theta0: 0,
      },
      { type: "HandleGrab", ddl: 1, grabbedKey: "gA", value: P(-160, 40) },
    ];
    const events = collect_solver_trace(() =>
      PBD_kinematic_solver(
        positions,
        new Map(),
        massesOf(c),
        new Map(),
        links,
        20,
        1e-6,
        angles,
      ),
    );
    const written = new Map<string, Set<string>>();
    for (const e of events) {
      const set = written.get(e.link.type) ?? new Set<string>();
      for (const m of e.moves) set.add(`pos:${m.key}`);
      for (const a of e.angleMoves) set.add(`ang:${a.key}`);
      written.set(e.link.type, set);
    }
    console.log("\n### DOFs written per link type (case A + no-slip)\n");
    written.forEach((set, type) =>
      console.log(`- ${type}: ${[...set].sort().join(", ") || "(none)"}`),
    );
    const belt = written.get("BeltLength") ?? new Set();
    const phase = written.get("BeltPhaseGear") ?? new Set();
    const shared = [...belt].filter((k) => phase.has(k));
    console.log(
      `- shared BeltLength ∩ BeltPhaseGear: ${shared.join(", ") || "(none)"}`,
    );
    expect(shared).toEqual([]);
  });

  it("finds which link turns the pulleys when a centre moves", () => {
    // The FULL closed-belt link set the parser emits: length + BeltPin on the
    // junction node (parsing.ts:331-335 — every closed belt gets one) + one
    // BeltPhaseGear per pulley. Then drag a centre and see what rotates.
    const c = CASES[0];
    const run = (withPin: boolean) => {
      const positions = positionsOf(c);
      const L0 = loopLength(c, positions);
      const vias = viasOf(c, positions);
      const J = P(0, 40); // junction on the top run
      const s0 = belt_project(vias, J, true).s;
      positions.set("belt:start", J.clone());
      const masses = massesOf(c);
      masses.set("belt:start", 1);
      const angles = new Map<string, number>([
        ["gA", 0],
        ["gB", 0],
        ["belt:phi", 0],
      ]);
      const phase = (g: string): Link => ({
        type: "BeltPhaseGear",
        ddl: 1,
        angleKey: g,
        phaseKey: "belt:phi",
        r: 40,
        eps: 1,
        theta0: 0,
      });
      const pin: Link = {
        type: "BeltPin",
        ddl: 2,
        beltID: "belt" as never,
        nodeKey: "belt:start",
        gearPosKeys: [...c.keys],
        gearAngleKeys: [...c.keys],
        radii: [...c.radii],
        directions: [...c.directions],
        refIndex: 0,
        refAngleKey: "gA",
        s0,
        thetaRef0: 0,
        closed: true,
      };
      const links: Link[] = [
        beltLink(c, L0),
        ...(withPin ? [pin] : []),
        phase("gA"),
        phase("gB"),
        // Pull gB away along x: the belt must redistribute, so the loop travels.
        { type: "HandleGrab", ddl: 1, grabbedKey: "gB", value: P(160, 0) },
      ];
      const events = collect_solver_trace(() =>
        PBD_kinematic_solver(
          positions,
          new Map(),
          masses,
          new Map(),
          links,
          200,
          1e-9,
          angles,
        ),
      );
      const byType = new Map<string, number>();
      for (const e of events)
        for (const a of e.angleMoves)
          byType.set(
            `${e.link.type} → ang:${a.key}`,
            (byType.get(`${e.link.type} → ang:${a.key}`) ?? 0) +
              Math.abs(a.delta),
          );
      const written = new Map<string, Set<string>>();
      for (const e of events) {
        const set = written.get(e.link.type) ?? new Set<string>();
        for (const m of e.moves) set.add(`pos:${m.key}`);
        for (const a of e.angleMoves) set.add(`ang:${a.key}`);
        written.set(e.link.type, set);
      }
      return { angles, byType, positions, written };
    };

    console.log(
      "\n### Who turns the pulleys? (case A, gB dragged to x = 160)\n",
    );
    for (const withPin of [false, true]) {
      const r = run(withPin);
      console.log(`\n**BeltPin ${withPin ? "présent" : "absent"}**\n`);
      console.log(
        `- gA = ${f(r.angles.get("gA")!, 6)} rad, gB = ${f(
          r.angles.get("gB")!,
          6,
        )} rad, φ = ${f(r.angles.get("belt:phi")!, 4)} px`,
      );
      console.log("- rotation cumulée écrite par lien :");
      if (r.byType.size === 0) console.log("  - (aucune)");
      r.byType.forEach((v, k) => console.log(`  - ${k}: ${f(v, 6)}`));
      console.log("- DOF écrits par lien :");
      r.written.forEach((set, type) =>
        console.log(`  - ${type}: ${[...set].sort().join(", ")}`),
      );
    }

    // Without the pin nothing rotates; with it, the pulleys turn.
    expect(Math.abs(run(false).angles.get("gA")!)).toBeLessThan(1e-12);
    expect(Math.abs(run(true).angles.get("gA")!)).toBeGreaterThan(1e-3);
  });
});
