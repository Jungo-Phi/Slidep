import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import type { BeamElement, ID, JoinElement } from "../../src/types/element";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../src/types/mechanism";
import type { MaterialDef, ProfileDef } from "../../src/types/material";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";

/**
 * A cantilever under its OWN WEIGHT and nothing else — the one case where the midpoint
 * actually carries the mass it exists for (2/3 of it), and where the truth is analytic:
 * a uniform beam of mass m held at one end reads m·g at the support and m·g·L/2 as moment.
 *
 * Gravity-free probes could drop the midpoint to isolate it; here that would delete two
 * thirds of the beam's weight, so the comparison is against the truth instead.
 */
const OUT = "scratch/beam-body/self-weight-out.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n", "utf8");

let n = 0;
const id = (): ID => `sw${++n}` as ID;
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "t", E: 1, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "t", shape: { kind: "rect", b: 1, h: 1 } },
];
const G = 9.81;

function run(alternate: boolean, length: number) {
  const JOIN = id();
  const BEAM = id();
  const join = {
    type: "join",
    id: JOIN,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    fixedEdgesIDs: [BEAM],
  } as unknown as JoinElement;
  const beam = {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(length, 0),
    fixedNodeStartID: JOIN,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  } as unknown as BeamElement;
  const mech: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [join, beam],
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
  process.env.SLIDEP_NO_SSOR = alternate ? "" : "1";
  const model = compile_simulation_model(mech, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 40; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -G));
  const c = snapshot!.beamCohesion?.find((b) => b.beamID === BEAM);
  const tip = snapshot!.layout.index.get(`${BEAM}:end`);
  const sag = tip === undefined ? NaN : snapshot!.positions[2 * tip + 1];
  const rs = (snapshot!.reactions ?? []).filter((r) => r.kind === "force");
  const detail = rs
    .map((r) => `${r.type}@${r.key.slice(-6)}${r.atAnchor ? "*" : ""}=${(r as { fy: number }).fy.toFixed(3)}`)
    .join(" ");
  return { c, sag, n: rs.length, detail };
}

describe("cantilever sous son propre poids", () => {
  it("la lecture d'effort contre la vérité analytique", () => {
    writeFileSync(OUT, "", "utf8");
    for (const length of [1, 3]) {
      const m = length;
      say(`\n── poutre de ${length} m, masse ${m} kg — vérité: start.fy = ${(-m * G).toFixed(4)}, start.m = ${(m * G * length / 2).toFixed(4)}`);
      for (const alternate of [true, false]) {
        const { c, sag, n: nr, detail } = run(alternate, length);
        if (!c) {
          say(`  alternance=${alternate ? "ON " : "OFF"}  pas de cohésion`);
          continue;
        }
        const efy = c.start.fy - -m * G;
        const em = c.start.m - (m * G * length) / 2;
        say(
          `  alternance=${alternate ? "ON " : "OFF"}  start.fy=${c.start.fy.toFixed(4)} (écart ${efy.toFixed(4)}, ${((100 * efy) / (m * G)).toFixed(2)} %)` +
            `  start.m=${c.start.m.toFixed(4)} (${((100 * em) / ((m * G * length) / 2)).toFixed(2)} %)  flèche=${sag.toExponential(2)}`,
        );
        say(`      ${nr} réactions: ${detail}`);
      }
    }
  }, 300_000);
});
