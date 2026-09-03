import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import type {
  BeamElement,
  ForceElement,
  ID,
  JoinElement,
  MassElement,
} from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../src/types/mechanism";
import type { MaterialDef, ProfileDef } from "../../src/types/material";

/**
 * Is the beam's virtual midpoint what makes the cantilever reaction read −101.14 instead of
 * −100? The case is `beam-cohesion.test.ts`'s `it.fails` one, and it carries NO gravity, so the
 * rotational inertia the midpoint exists to reproduce has nothing to act on here — dropping it
 * changes what the solver reads, not what the mechanism does.
 *
 * If the reading goes to −100, the midpoint's `FixedOnSegment` is the competing path to blame
 * and removing it is worth building. If it does not, the culprit is `Distance`+`KeepOrientation`
 * and a first step that only drops the midpoint will not close this test.
 */
const OUT = "scratch/beam-body/midpoint-out.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n", "utf8");

const TIP_LOAD = 100;
let n = 0;
const id = (): ID => `e${++n}` as ID;

const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function build() {
  const JOIN = id();
  const BEAM = id();
  const MASS = id();
  const join: JoinElement = {
    type: "join",
    id: JOIN,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    fixedEdgesIDs: [BEAM],
  } as JoinElement;
  const beam: BeamElement = {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(1, 0),
    fixedNodeStartID: JOIN,
    fixedNodesBodyIDs: [MASS],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  } as unknown as BeamElement;
  const mass: MassElement = {
    type: "mass",
    id: MASS,
    probes: [],
    overlays: {},
    position: new Point2(0.5, 0),
    isGrounded: false,
    fixedEdgesIDs: [],
    mass: 1,
  } as MassElement;
  const force: ForceElement = {
    type: "force",
    id: id(),
    targetID: MASS,
    vector: new Point2(0, -TIP_LOAD),
    frame: "world",
  } as ForceElement;
  const mech: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [join, beam, mass],
    constraintElements: [],
    loads: [force],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
  return { mech, BEAM };
}

function read(dropMidpoint: boolean, alternate: boolean) {
  const { mech, BEAM } = build();
  process.env.SLIDEP_NO_SSOR = alternate ? "" : "1";
  const model = compile_simulation_model(mech, true);
  const midpoints = model.dynamicMasses.beamMidpoints.length;
  if (dropMidpoint) model.dynamicMasses.beamMidpoints = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 30; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
  const c = snapshot!.beamCohesion?.find((b) => b.beamID === BEAM);
  return { midpoints, c };
}

describe("le nœud milieu est-il le coupable ?", () => {
  it("cantilever chargé à mi-portée, avec et sans nœud milieu", () => {
    writeFileSync(OUT, "", "utf8");
    for (const alternate of [true, false])
    for (const drop of [false, true]) {
      const { midpoints, c } = read(drop, alternate);
      say(
        `alternance=${alternate ? "ON " : "OFF"}  ${drop ? "SANS nœud milieu" : "AVEC nœud milieu"} (compilés: ${midpoints})`,
      );
      if (!c) {
        say("  pas de cohésion lue");
        continue;
      }
      say(`  start.fy = ${c.start.fy.toFixed(6)}   (vérité: -100)`);
      say(`  start.m  = ${c.start.m.toFixed(6)}   (vérité: 50)`);
      say(`  end.fy   = ${c.end.fy.toFixed(6)}   (vérité: 0)`);
      say(`  end.m    = ${c.end.m.toFixed(6)}   (vérité: 0)`);
    }
  }, 300_000);
});

/** `reaction-forces.test.ts`'s cantilever: tip load, no gravity, no attached mass — the case
 *  whose tolerance was widened to 1 % of the load for the alternating sweep order's "taxe". */
function cantilever(dropMidpoint: boolean, alternate: boolean) {
  const JOIN = id();
  const BEAM = id();
  const join: JoinElement = {
    type: "join",
    id: JOIN,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    fixedEdgesIDs: [BEAM],
  } as JoinElement;
  const beam: BeamElement = {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(1, 0),
    fixedNodeStartID: JOIN,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  } as unknown as BeamElement;
  const force: ForceElement = {
    type: "force",
    id: id(),
    targetID: BEAM,
    anchor: "end",
    vector: new Point2(0, -100),
    frame: "world",
  } as ForceElement;
  const mech: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [join, beam],
    constraintElements: [],
    loads: [force],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
  process.env.SLIDEP_NO_SSOR = alternate ? "" : "1";
  const model = compile_simulation_model(mech, true);
  if (dropMidpoint) model.dynamicMasses.beamMidpoints = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 30; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
  return { c: snapshot!.beamCohesion?.find((b) => b.beamID === BEAM) };
}

describe("la taxe de 0.571496 est-elle le nœud milieu ou l'alternance ?", () => {
  it("cantilever de reaction-forces, 2x2", () => {
    for (const alternate of [true, false])
      for (const drop of [false, true]) {
        const { c } = cantilever(drop, alternate);
        say(
          `alternance=${alternate ? "ON " : "OFF"} nœud milieu=${drop ? "NON" : "OUI"}` +
            `  start.fy=${c!.start.fy.toFixed(6)} (vérité -100)` +
            `  end.fy=${c!.end.fy.toFixed(6)} (vérité 0)` +
            `  start.m=${c!.start.m.toFixed(6)} (vérité 100)`,
        );
      }
  }, 300_000);
});
