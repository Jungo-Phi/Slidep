import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import {
  belt_pieces,
  belt_point_tangent,
  belt_project,
  BeltVia,
} from "../../utils/belt-path";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { collect_solver_trace } from "./solver-trace";

/**
 * Diagnostic harness for the closed belt's transmission chain: BeltPin (the only
 * positions → angles bridge) and the BeltPhaseGear relay behind it. Measures
 * only — no constraint is modified. Run with `--disable-console-intercept`.
 */

const P = (x: number, y: number) => new Point2(x, y);
const f = (x: number, n = 6) => x.toFixed(n);

// ── Geometry shared by both parts: 3 unequal pulleys, deliberately asymmetric ──
const KEYS = ["gA", "gB", "gC"];
const RADII = [50, 30, 20];
const DIRECTIONS = [false, false, false];
const CENTRES = [P(-120, -30), P(140, 20), P(10, 160)];

const centresMap = () =>
  new Map<string, Point2>(KEYS.map((k, i) => [k, CENTRES[i].clone()]));

const viasOf = (positions: Map<string, Point2>): BeltVia[] =>
  KEYS.map((k, i) => ({
    pos: positions.get(k)!,
    radius: RADII[i],
    direction: DIRECTIONS[i],
  }));

/** Same physical loop, listed from a different via — the parametrization origin
 *  moves, the mechanism does not. */
const viasRotated = (
  positions: Map<string, Point2>,
  shift: number,
): BeltVia[] => {
  const v = viasOf(positions);
  return [...v.slice(shift), ...v.slice(0, shift)];
};

const loopLength = (positions: Map<string, Point2>) =>
  belt_pieces(viasOf(positions), true).reduce((a, p) => a + p.length, 0);

/** ε for the reference pulley: r·(dir ? −1 : 1), the belt-px per radian. */
const rEpsOf = (i: number) => RADII[i] * (DIRECTIONS[i] ? -1 : 1);

/**
 * BeltPin's TANGENTIAL residual, exactly as the constraint forms it
 * (constraint-functions.ts:1524-1538): C_T = (J − P(s))·T(s) with
 * s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0).
 */
const tangentialResidual = (
  positions: Map<string, Point2>,
  J: Point2,
  thetaRef: number,
  refIndex: number,
  s0: number,
  thetaRef0: number,
): number => {
  const vias = viasOf(positions);
  const s = s0 + rEpsOf(refIndex) * (thetaRef - thetaRef0);
  const { point, tangent } = belt_point_tangent(vias, s, true);
  return J.sub(point).dot(tangent);
};

describe("BeltPin diagnostic — the positions → angles bridge", () => {
  it("checks ∂C_T/∂θ_ref and ∂C_T/∂centre against finite differences", () => {
    const base = centresMap();
    const vias = viasOf(base);
    const refIndex = 0;
    const rEps = rEpsOf(refIndex);

    // Three junction placements: on a tangent run, on an arc, and 6 px OFF the
    // belt (the curvature term only shows when the node is off-curve).
    const onRun = belt_project(vias, P(10, -140), true);
    const onArc = belt_project(vias, P(-175, -30), true);
    const spots: { name: string; s0: number; J: Point2 }[] = [
      { name: "J sur un brin", s0: onRun.s, J: onRun.point.clone() },
      { name: "J sur un arc", s0: onArc.s, J: onArc.point.clone() },
      {
        name: "J à 6 px hors courroie",
        s0: onArc.s,
        J: onArc.point.add(onArc.point.sub(CENTRES[0]).normalize().mul(6)),
      },
    ];

    console.log("\n### BeltPin — gradient de C_T par différences finies\n");
    console.log("Découpage de la boucle (pour situer s) :");
    let acc = 0;
    for (const p of belt_pieces(vias, true)) {
      console.log(
        `- [${f(acc, 2)} → ${f(acc + p.length, 2)}] ${p.kind} ${
          p.kind === "arc"
            ? KEYS[p.gearIndex]
            : `${KEYS[p.gearIndexA]}→${KEYS[p.gearIndexB]}`
        }`,
      );
      acc += p.length;
    }
    for (const s of [onRun, onArc]) console.log(`- s = ${f(s.s, 2)}`);
    console.log(
      `Poulie de référence : gA (r·ε = ${rEps}). ε_θ = 1e-6 rad, ε_c = 0.02 px.\n`,
    );
    console.log(
      "| placement | ∂C_T/∂θ_ref (num) | attendu (−r·ε) | écart rel. |",
    );
    console.log("|---|---|---|---|");
    const thetaEps = 1e-6;
    for (const spot of spots) {
      const at = (dTheta: number) =>
        tangentialResidual(base, spot.J, dTheta, refIndex, spot.s0, 0);
      const num = (at(thetaEps) - at(-thetaEps)) / (2 * thetaEps);
      const rel = Math.abs((num - -rEps) / rEps);
      console.log(
        `| ${spot.name} | ${f(num, 6)} | ${f(-rEps, 6)} | ${rel.toExponential(2)} |`,
      );
    }

    console.log(
      "\n| placement | centre | ∂C_T/∂c (num) | ‖∂C_T/∂c‖ | utilisé par la contrainte |",
    );
    console.log("|---|---|---|---|---|");
    const cEps = 0.02;
    let worstCentre = 0;
    for (const spot of spots) {
      for (let i = 0; i < KEYS.length; i++) {
        const key = KEYS[i];
        const c0 = base.get(key)!;
        const at = (dx: number, dy: number) => {
          const p = new Map(base);
          p.set(key, P(c0.x + dx, c0.y + dy));
          return tangentialResidual(p, spot.J, 0, refIndex, spot.s0, 0);
        };
        const g = P(
          (at(cEps, 0) - at(-cEps, 0)) / (2 * cEps),
          (at(0, cEps) - at(0, -cEps)) / (2 * cEps),
        );
        worstCentre = Math.max(worstCentre, g.length());
        console.log(
          `| ${spot.name} | ${key} | (${f(g.x, 4)}, ${f(g.y, 4)}) | ${f(
            g.length(),
            4,
          )} | 0 (aucune correction) |`,
        );
      }
    }
    console.log(
      `\n‖∂C_T/∂centre‖ max = ${f(worstCentre, 4)} — la contrainte suppose 0.\n`,
    );

    // ── Does the residual depend on where the loop is parametrized from? ──
    // Same geometry, same junction point, the via list rotated. Physically this
    // must change nothing.
    console.log(
      "\n#### Dépendance à l'origine du paramétrage (même géométrie, liste de vias tournée)\n",
    );
    console.log("| origine | centre | ∂C_T/∂c (num) | ‖·‖ |");
    console.log("|---|---|---|---|");
    const J = spots[0].J;
    const gradsByShift: Point2[][] = [];
    for (const shift of [0, 1, 2]) {
      const order = [0, 1, 2].map((i) => (i + shift) % 3);
      const s0 = belt_project(viasRotated(base, shift), J, true).s;
      const resid = (p: Map<string, Point2>) => {
        const v = viasRotated(p, shift);
        const { point, tangent } = belt_point_tangent(v, s0, true);
        return J.sub(point).dot(tangent);
      };
      const grads: Point2[] = [];
      for (let i = 0; i < KEYS.length; i++) {
        const key = KEYS[i];
        const c0 = base.get(key)!;
        const at = (dx: number, dy: number) => {
          const p = new Map(base);
          p.set(key, P(c0.x + dx, c0.y + dy));
          return resid(p);
        };
        const g = P(
          (at(cEps, 0) - at(-cEps, 0)) / (2 * cEps),
          (at(0, cEps) - at(0, -cEps)) / (2 * cEps),
        );
        grads.push(g);
        console.log(
          `| via ${KEYS[order[0]]} | ${key} | (${f(g.x, 4)}, ${f(g.y, 4)}) | ${f(
            g.length(),
            4,
          )} |`,
        );
      }
      gradsByShift.push(grads);
    }
    const spread = Math.max(
      ...KEYS.map((_, i) =>
        Math.max(
          gradsByShift[0][i].sub(gradsByShift[1][i]).length(),
          gradsByShift[0][i].sub(gradsByShift[2][i]).length(),
        ),
      ),
    );
    console.log(
      `\nÉcart max entre origines : ${f(spread, 4)} par px de déplacement de centre.\n`,
    );

    // ON the belt the θ gradient is exact; OFF it, the curvature term is missing.
    const onBeltErr = spots.slice(0, 2).map((spot) => {
      const at = (dTheta: number) =>
        tangentialResidual(base, spot.J, dTheta, refIndex, spot.s0, 0);
      return Math.abs((at(thetaEps) - at(-thetaEps)) / (2 * thetaEps) + rEps);
    });
    expect(Math.max(...onBeltErr)).toBeLessThan(1e-4);
    // Documented findings: the centre gradient is NOT zero, and it depends on
    // where the loop happens to be parametrized from.
    expect(worstCentre).toBeGreaterThan(0.1);
    expect(spread).toBeGreaterThan(0.1);
  });

  it("traces the per-sweep lag of the non-reference pulleys", () => {
    const positions = centresMap();
    const L0 = loopLength(positions);
    const vias = viasOf(positions);
    const J = belt_project(vias, P(10, -140), true);
    positions.set("belt:start", J.point.clone());

    const masses = new Map<string, number>([
      ["gA", 0], // anchored: the reference pulley stays put
      ["gB", 1],
      ["gC", 1],
      ["belt:start", 1],
    ]);
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
      ["gC", 0],
      ["belt:phi", 0],
    ]);

    const links: Link[] = [
      {
        type: "BeltLength",
        ddl: 1,
        startKey: "s",
        endKey: "e",
        gearPosKeys: [...KEYS],
        gearAngleKeys: [...KEYS],
        radii: [...RADII],
        directions: [...DIRECTIONS],
        length: L0,
        closed: true,
      },
      {
        type: "BeltPin",
        ddl: 2,
        beltID: "belt" as never,
        nodeKey: "belt:start",
        gearPosKeys: [...KEYS],
        gearAngleKeys: [...KEYS],
        radii: [...RADII],
        directions: [...DIRECTIONS],
        refIndex: 0,
        refAngleKey: "gA",
        s0: J.s,
        thetaRef0: 0,
        closed: true,
      },
      ...KEYS.map((k, i): Link => ({
        type: "BeltPhaseGear",
        ddl: 1,
        angleKey: k,
        phaseKey: "belt:phi",
        r: RADII[i],
        eps: DIRECTIONS[i] ? -1 : 1,
        theta0: 0,
      })),
      // Drag gC 40 px: the loop deforms, so the belt must travel.
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: "gC",
        value: CENTRES[2].add(P(40, 0)),
      },
    ];

    const SWEEPS = 300; // what step_simulation actually runs
    const events = collect_solver_trace(() =>
      PBD_kinematic_solver(
        positions,
        new Map(),
        masses,
        new Map(),
        links,
        SWEEPS,
        1e-12,
        angles,
      ),
    );

    // Rebuild the angle state at the end of each sweep from the trace deltas.
    const state = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
      ["gC", 0],
      ["belt:phi", 0],
    ]);
    const perSweep: Map<string, number>[] = [];
    let sweep = 0;
    for (const e of events) {
      while (e.iteration > sweep) {
        perSweep.push(new Map(state));
        sweep++;
      }
      for (const a of e.angleMoves)
        state.set(a.key, a.delta + state.get(a.key)!);
    }
    perSweep.push(new Map(state));

    console.log("\n### Retard de propagation (3 poulies, gC tiré de 40 px)\n");
    console.log(
      "r = [50, 30, 20], gA ancrée et poulie de référence. Résidu no-slip d'une poulie : |r·ε·θ − φ| (px).\n",
    );
    console.log(
      "| balayage | θ_gA | θ_gB | θ_gC | φ | no-slip gB | no-slip gC |",
    );
    console.log("|---|---|---|---|---|---|---|");
    const noSlip = (s: Map<string, number>, i: number) =>
      Math.abs(
        RADII[i] * (DIRECTIONS[i] ? -1 : 1) * s.get(KEYS[i])! -
          s.get("belt:phi")!,
      );
    perSweep.forEach((s, i) => {
      // Every sweep early, then log-spaced: the tail is what says whether it settles.
      if (i > 20 && i % 20 !== 0 && i !== perSweep.length - 1) return;
      console.log(
        `| ${i} | ${f(s.get("gA")!, 6)} | ${f(s.get("gB")!, 6)} | ${f(
          s.get("gC")!,
          6,
        )} | ${f(s.get("belt:phi")!, 4)} | ${noSlip(s, 1).toExponential(
          2,
        )} | ${noSlip(s, 2).toExponential(2)} |`,
      );
    });

    const last = perSweep[perSweep.length - 1];
    console.log(
      `\nRapports finaux : θ_gB/θ_gA = ${f(
        last.get("gB")! / last.get("gA")!,
        6,
      )} (attendu r_A/r_B = ${f(RADII[0] / RADII[1], 6)}), θ_gC/θ_gA = ${f(
        last.get("gC")! / last.get("gA")!,
        6,
      )} (attendu ${f(RADII[0] / RADII[2], 6)})\n`,
    );

    // The no-slip residuals must vanish: if they persist, the relay lags.
    expect(noSlip(last, 1)).toBeLessThan(1e-6);
    expect(noSlip(last, 2)).toBeLessThan(1e-6);
  });

  it("solves the SAME mechanism listed from each via and compares the travel", () => {
    // Identical geometry, identical junction point, identical grab. Only the
    // order the belt lists its pulleys in changes — which is where belt_pieces
    // starts measuring arc-length. Physically this must change nothing.
    const solveFrom = (shift: number) => {
      const positions = centresMap();
      const order = [0, 1, 2].map((i) => (i + shift) % 3);
      const keys = order.map((i) => KEYS[i]);
      const radii = order.map((i) => RADII[i]);
      const dirs = order.map((i) => DIRECTIONS[i]);
      const vias = viasRotated(positions, shift);
      const L0 = vias.length
        ? belt_pieces(vias, true).reduce((a, p) => a + p.length, 0)
        : 0;
      const J = belt_project(vias, P(10, -140), true);
      positions.set("belt:start", J.point.clone());
      const masses = new Map<string, number>([
        ["gA", 0],
        ["gB", 1],
        ["gC", 1],
        ["belt:start", 1],
      ]);
      const angles = new Map<string, number>([
        ["gA", 0],
        ["gB", 0],
        ["gC", 0],
        ["belt:phi", 0],
      ]);
      const refIndex = order.indexOf(0); // gA stays the reference pulley
      const links: Link[] = [
        {
          type: "BeltLength",
          ddl: 1,
          startKey: "s",
          endKey: "e",
          gearPosKeys: keys,
          gearAngleKeys: keys,
          radii,
          directions: dirs,
          length: L0,
          closed: true,
        },
        {
          type: "BeltPin",
          ddl: 2,
          beltID: "belt" as never,
          nodeKey: "belt:start",
          gearPosKeys: keys,
          gearAngleKeys: keys,
          radii,
          directions: dirs,
          refIndex,
          refAngleKey: "gA",
          s0: J.s,
          thetaRef0: 0,
          closed: true,
        },
        ...keys.map((k, i): Link => ({
          type: "BeltPhaseGear",
          ddl: 1,
          angleKey: k,
          phaseKey: "belt:phi",
          r: radii[i],
          eps: dirs[i] ? -1 : 1,
          theta0: 0,
        })),
        {
          type: "HandleGrab",
          ddl: 1,
          grabbedKey: "gC",
          value: CENTRES[2].add(P(40, 0)),
        },
      ];
      const out = PBD_kinematic_solver(
        positions,
        new Map(),
        masses,
        new Map(),
        links,
        300,
        1e-12,
        angles,
        true,
      );
      // Worst residual left over the belt links: is this really a solved state?
      const worst = Math.max(
        ...(out.unsatisfied ?? []).map((u) => u.residual),
        0,
      );
      return { angles, worst, positions };
    };

    console.log(
      "\n### Même mécanisme, courroie listée depuis chaque poulie (gC tiré de 40 px)\n",
    );
    console.log(
      "| 1ʳᵉ poulie listée | θ_gA | θ_gB | θ_gC | φ | résidu max restant |",
    );
    console.log("|---|---|---|---|---|---|");
    const results = [0, 1, 2].map((shift) => {
      const { angles: a, worst, positions } = solveFrom(shift);
      console.log(
        `| ${KEYS[shift]} | ${f(a.get("gA")!, 6)} | ${f(a.get("gB")!, 6)} | ${f(
          a.get("gC")!,
          6,
        )} | ${f(a.get("belt:phi")!, 4)} | ${worst.toExponential(2)} |`,
      );
      // Where the free pulleys ended up: same geometry, or a different one?
      console.log(
        `  - gB → (${f(positions.get("gB")!.x, 3)}, ${f(
          positions.get("gB")!.y,
          3,
        )}), J → (${f(positions.get("belt:start")!.x, 3)}, ${f(
          positions.get("belt:start")!.y,
          3,
        )})`,
      );
      return a.get("gA")!;
    });
    const spread = Math.max(...results) - Math.min(...results);
    console.log(
      `\nÉcart sur θ_gA : ${f(spread, 6)} rad (${f(
        (100 * spread) / Math.max(...results.map(Math.abs)),
        1,
      )} % de la rotation).\n`,
    );
    expect(results.length).toBe(3);
  });
});
