import { describe, it } from "vitest";
import fixtureJson from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
  SimulationModel,
} from "./kinematic-simulation";
import { sort_links } from "./utils";
import { collect_solver_trace } from "./solver-trace";
import { buildBeltSegmentNoSlipLinks } from "./experimental/belt-noslip-q";

/**
 * Q4 — the real "Core XY modifié" with the belt φ replaced by the segment
 * no-slip q-chain (option 1). Traces the worst residual per link TYPE over the
 * late sweeps and compares to the documented baseline (worst residual 1630 with
 * the Angle locks, 1.9 without — doc/contrainte-angle.md, motor cold-start).
 */

const CARRIAGE = "4771336b-875c-4970-945f-f131754bd813";
const f = (x: number, n = 2) => x.toFixed(n);

const loadFixture = () => load_mechanism(JSON.parse(fixtureJson)).mechanism;

const isBelt = (t: string) =>
  t === "BeltLength" ||
  t === "BeltPhaseGear" ||
  t === "BeltSegmentNoSlip" ||
  t === "BeltPin";

/** Swap each belt's φ machinery (BeltPhaseGear + BeltLength.phaseKey) for the
 *  q-chain, baked at rest. BeltLength keeps only its length role. */
function toQModel(model: SimulationModel): void {
  const belts = model.links.filter(
    (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
  );
  const qLinks: Link[] = [];
  for (const belt of belts) {
    qLinks.push(
      ...buildBeltSegmentNoSlipLinks(model.nodes.positions, model.nodes.angles, {
        gearPosKeys: belt.gearPosKeys,
        gearAngleKeys: belt.gearAngleKeys,
        radii: belt.radii,
        directions: belt.directions,
        closed: belt.closed,
        startKey: belt.startKey,
        endKey: belt.endKey,
        owner: belt.owner,
        writePositions: false, // option 1 (Q2 verdict)
      }),
    );
    belt.phaseKey = undefined; // neutralise simFeed → BeltLength becomes length-only
  }
  model.links = model.links.filter((l) => l.type !== "BeltPhaseGear");
  model.links.push(...qLinks);
  model.links = sort_links(model.links, model.nodes.posMasses);
}

function startPos(model: SimulationModel): Point2 {
  return model.nodes.positions.get(model.keyMap.get(CARRIAGE) ?? CARRIAGE)!.clone();
}

/** Worst residual per link type over sweeps ≥ `from` of the frame produced by
 *  `runFrame` (which mutates prev*). */
function traceWorst(runFrame: () => void, from = 250): Map<string, number> {
  const worst = new Map<string, number>();
  const events = collect_solver_trace(runFrame);
  for (const e of events) {
    if (e.iteration < from) continue;
    worst.set(e.link.type, Math.max(worst.get(e.link.type) ?? 0, e.residual));
  }
  return worst;
}

const report = (label: string, worst: Map<string, number>) => {
  const rows = [...worst.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n--- ${label} ---`);
  for (const [type, r] of rows)
    console.log(`  ${type.padEnd(18)} ${f(r)}${isBelt(type) ? "  ← belt" : ""}`);
  const beltWorst = Math.max(0, ...rows.filter(([t]) => isBelt(t)).map(([, r]) => r));
  console.log(
    `  overall worst = ${f(rows.length ? rows[0][1] : 0)} | belt worst = ${f(beltWorst)}`,
  );
};

/** Run `frames` frames; trace only the last. `drop` removes link types; `grab`
 *  supplies a per-frame carriage target (else the motor drives alone). */
function drive(
  model: SimulationModel,
  frames: number,
  drop: Link["type"][],
  target?: (i: number) => Point2,
): Map<string, number> {
  if (drop.length) model.links = model.links.filter((l) => !drop.includes(l.type));
  let prevP: Map<string, Point2> | null = null;
  let prevA: Map<string, number> | null = null;
  let worst = new Map<string, number>();
  for (let i = 0; i < frames; i++) {
    const runFrame = () => {
      const snap = step_simulation(
        model,
        i / 60,
        prevP,
        prevA,
        1 / 60,
        target ? { key: CARRIAGE, target: target(i) } : undefined,
      );
      prevP = snap.positions;
      prevA = snap.angles;
    };
    if (i === frames - 1) worst = traceWorst(runFrame);
    else runFrame();
  }
  return worst;
}

/** Carriage displacement achieved after driving `frames` frames toward `target`. */
function followTest(
  model: SimulationModel,
  frames: number,
  targetOf: (start: Point2, i: number) => Point2,
): { start: Point2; end: Point2; beltWorstLast: number } {
  const start = startPos(model);
  let prevP: Map<string, Point2> | null = null;
  let prevA: Map<string, number> | null = null;
  let end = start;
  for (let i = 0; i < frames; i++) {
    const snap = step_simulation(model, i / 60, prevP, prevA, 1 / 60, {
      key: CARRIAGE,
      target: targetOf(start, i),
    });
    prevP = snap.positions;
    prevA = snap.angles;
    end = snap.positions.get(model.keyMap.get(CARRIAGE) ?? CARRIAGE)!.clone();
  }
  return { start, end, beltWorstLast: 0 };
}

describe("Q4 — Core XY: q-model vs baseline", () => {
  it(
    "(C) carriage follow — montée (should block) vs translation (should pass)",
    () => {
      const up = (s: Point2, i: number) =>
        new Point2(s.x, s.y - (100 * (i + 1)) / 30);
      const side = (s: Point2, i: number) =>
        new Point2(s.x - (100 * (i + 1)) / 30, s.y);
      const run = (
        label: string,
        makeQ: boolean,
        targetOf: (s: Point2, i: number) => Point2,
      ) => {
        const m = compile_simulation_model(loadFixture());
        if (makeQ) toQModel(m);
        const r = followTest(m, 30, targetOf);
        const dx = r.end.x - r.start.x;
        const dy = r.end.y - r.start.y;
        console.log(
          `  ${label.padEnd(22)} Δ=(${f(dx, 1)}, ${f(dy, 1)}) |Δ|=${f(Math.hypot(dx, dy), 1)} / 100 target`,
        );
      };
      console.log("\n=== Q4(C) carriage follow (target 100px) ===");
      console.log("MONTÉE (needs flux through the BLOCKED pulley → should be resisted):");
      run("φ model montée", false, up);
      run("q-model montée", true, up);
      console.log("TRANSLATION (uniform flux → should pass):");
      run("φ model translation", false, side);
      run("q-model translation", true, side);
    },
    120_000,
  );

  it(
    "(D) q-link sanity: rest residual ≈ 0, and montée-response per sweep",
    () => {
      const m = compile_simulation_model(loadFixture());
      const s = startPos(m);
      toQModel(m);
      // Rest, no grab: q-links should sit at ~0 (h = h0).
      let prevP: Map<string, Point2> | null = null;
      let prevA: Map<string, number> | null = null;
      const restWorst = traceWorst(() => {
        const snap = step_simulation(m, 0, prevP, prevA, 1 / 60);
        prevP = snap.positions;
        prevA = snap.angles;
      }, 0);
      console.log(
        `\n=== Q4(D) rest q-belt worst = ${f(restWorst.get("BeltSegmentNoSlip") ?? 0, 4)} (should be ≈0) ===`,
      );
      // Small montée (10px up over 5 frames), then trace the q-belt residual per
      // sweep on frame 6 to see if it converges or plateaus.
      for (let i = 0; i < 5; i++) {
        const snap = step_simulation(m, i / 60, prevP, prevA, 1 / 60, {
          key: CARRIAGE,
          target: new Point2(s.x, s.y - 2 * (i + 1)),
        });
        prevP = snap.positions;
        prevA = snap.angles;
      }
      const events = collect_solver_trace(() => {
        const snap = step_simulation(m, 5 / 60, prevP, prevA, 1 / 60, {
          key: CARRIAGE,
          target: new Point2(s.x, s.y - 10),
        });
        prevP = snap.positions;
        prevA = snap.angles;
      });
      const perSweep = new Map<number, number>();
      for (const e of events)
        if (e.link.type === "BeltSegmentNoSlip")
          perSweep.set(e.iteration, Math.max(perSweep.get(e.iteration) ?? 0, e.residual));
      console.log("q-belt worst residual by sweep (montée 10px):");
      for (const it of [0, 10, 50, 100, 200, 299])
        console.log(`  sweep ${it}: ${f(perSweep.get(it) ?? 0, 3)}`);
    },
    120_000,
  );

  it(
    "(A) anchor the documented baseline (motor cold-start)",
    () => {
      const withAngle = compile_simulation_model(loadFixture());
      report("φ model, motor, WITH Angle", drive(withAngle, 40, []));
      const noAngle = compile_simulation_model(loadFixture());
      report("φ model, motor, NO Angle", drive(noAngle, 40, ["Angle"]));
    },
    120_000,
  );

  it(
    "(B) montée then translation grab: φ vs q-model",
    () => {
      // Montée (y − 100) over 30 frames, then translation (x − 100) over 30.
      const path = (start: Point2) => (i: number): Point2 =>
        i < 30
          ? new Point2(start.x, start.y - (100 * (i + 1)) / 30)
          : new Point2(start.x - (100 * (i - 29)) / 30, start.y - 100);

      const base = compile_simulation_model(loadFixture());
      report("φ model + grab, WITH Angle", drive(base, 60, [], path(startPos(base))));

      const q = compile_simulation_model(loadFixture());
      const qs = startPos(q);
      toQModel(q);
      report("q-model + grab, WITH Angle", drive(q, 60, [], path(qs)));

      const qN = compile_simulation_model(loadFixture());
      const qns = startPos(qN);
      toQModel(qN);
      report("q-model + grab, NO Angle", drive(qN, 60, ["Angle"], path(qns)));
    },
    120_000,
  );
});
