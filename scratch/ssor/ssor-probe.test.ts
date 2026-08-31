import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import poulieJson from "../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import huygensJson from "../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../../src/types";
import { KinematicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "../../src/components/solver/simulation-engine";
import { snapshot_angle } from "../../src/components/solver/snapshot";

const deg = (r: number) => (r * 180) / Math.PI;

function rotated(json: string, by: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || !el.closed) continue;
    const n = el.attachedGearsIDs.length;
    const k = by % n;
    const rot = <T>(a: T[]) => [...a.slice(k), ...a.slice(0, k)];
    el.attachedGearsIDs = rot(el.attachedGearsIDs);
    if (el.gearWraps) el.gearWraps = rot(el.gearWraps);
    if (el.disconnectedGearIndices)
      el.disconnectedGearIndices = el.disconnectedGearIndices.map(
        (i) => (i - k + n) % n,
      );
  }
  return mechanism;
}

function unpowered(mechanism: Mechanism): Mechanism {
  for (const el of mechanism.mechanicalElements)
    if ("motor" in el) delete (el as { motor?: unknown }).motor;
  return mechanism;
}

/** Gear angles sampled at each of `marks`, plus cumulative travel at the same marks. */
function spunSeries(
  mechanism: Mechanism,
  marks: number[],
  spin: string,
): { angles: Map<string, number>; travel: number }[] {
  const model = compile_simulation_model(mechanism);
  const gear = mechanism.mechanicalElements.find((e) => e.id === spin);
  let prev: KinematicSnapshot | null = null;
  const travel = new Map<string, number>();
  const out: { angles: Map<string, number>; travel: number }[] = [];
  const frames = Math.max(...marks);
  for (let i = 0; i < frames; i++) {
    const grab =
      gear && gear.type === "gear"
        ? {
            gearID: gear.id,
            angleOffset: 0,
            radius: gear.radius,
            target: gear.position.add(
              new Point2(
                gear.radius * Math.cos((i + 1) / 20),
                gear.radius * Math.sin((i + 1) / 20),
              ),
            ),
          }
        : undefined;
    const s = step_simulation(model, i / 60, prev, 1 / 60, grab);
    if (prev)
      s.layout.angleKeys.forEach((key, k) => {
        travel.set(
          key,
          (travel.get(key) ?? 0) + Math.abs(s.angles[k] - prev!.angles[k]),
        );
      });
    prev = s;
    if (marks.includes(i + 1)) {
      const angles = new Map<string, number>();
      for (const el of mechanism.mechanicalElements)
        if (el.type === "gear") angles.set(el.id, snapshot_angle(s, el.id) ?? NaN);
      out.push({
        angles,
        travel: Math.max(...[...travel.values()].map((a) => Math.abs(deg(a)))),
      });
    }
  }
  return out;
}

function maxGap(a: Map<string, number>, b: Map<string, number>): number {
  let worst = 0;
  for (const [id, angle] of a)
    worst = Math.max(worst, Math.abs(deg(angle - (b.get(id) ?? NaN))));
  return worst;
}

const MARKS = [30, 60, 120, 240, 360, 480];

describe("SSOR probe", () => {
  for (const [name, json] of [
    ["Huygens", huygensJson],
    ["Poulie bloqueuse", poulieJson],
  ] as const) {
    it(`${name}`, () => {
      const belt = rotated(json, 0).mechanicalElements.find(
        (e) => e.type === "belt",
      );
      if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");
      const driven = belt.attachedGearsIDs[0].id;
      const ref = spunSeries(unpowered(rotated(json, 0)), [...MARKS], driven);
      const alt = spunSeries(unpowered(rotated(json, 1)), [...MARKS], driven);
      const rows = MARKS.map((m, i) => ({
        frames: m,
        travel: +ref[i].travel.toFixed(2),
        gap: +maxGap(ref[i].angles, alt[i].angles).toFixed(4),
        ratio: +(maxGap(ref[i].angles, alt[i].angles) / ref[i].travel).toFixed(5),
      }));
      const lines = [`### ${name} — SSOR=${process.env.SLIDEP_SSOR ?? "off"}`];
      for (const r of rows)
        lines.push(
          `frames=${r.frames}\ttravel=${r.travel}\tgap=${r.gap}\tratio=${r.ratio}`,
        );
      appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
    }, 300_000);
  }
});
