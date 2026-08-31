import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../src/types/mechanism";
import type { BeamElement, ForceElement, ID, JoinElement, MassElement } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/simulation-engine";
import { element_reactions } from "../../src/components/solver/probe-series";

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS = [{ id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1, readOnly: false }];
const PROFILES = [{ id: PROFILE_ID, name: "test", shape: { kind: "rect" as const, b: 1, h: 1 } }];

function mechanism(mechanicalElements: Mechanism["mechanicalElements"], loads: ForceElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
}

/** reaction-forces.test.ts's "réaction d'appui d'un cantilever" scenario. */
function cantileverJoinMoment(): { join: JoinElement; beam: BeamElement; mech: Mechanism } {
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
  };
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
  };
  const force: ForceElement = {
    type: "force",
    id: id(),
    targetID: BEAM,
    anchor: "end",
    vector: new Point2(0, -100),
    frame: "world",
  };
  return { join, beam, mech: mechanism([join, beam], [force]) };
}

/** beam-cohesion.test.ts's "masse en cours de portée" scenario. */
function cantileverMidSpanMass(): { join: JoinElement; beam: BeamElement; mech: Mechanism } {
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
  };
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
  };
  const mass: MassElement = {
    type: "mass",
    id: MASS,
    probes: [],
    overlays: {},
    position: new Point2(0.5, 0),
    isGrounded: false,
    fixedEdgesIDs: [],
    mass: 1,
  };
  const force: ForceElement = {
    type: "force",
    id: id(),
    targetID: MASS,
    vector: new Point2(0, -100),
    frame: "world",
  };
  return { join, beam, mech: mechanism([join, beam, mass], [force]) };
}

describe("SSOR reaction-tax probe", () => {
  it("cantilever — encastrement (reaction-forces.test.ts)", () => {
    const { join, beam, mech } = cantileverJoinMoment();
    const model = compile_simulation_model(mech, true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
    const [atJoin] = element_reactions(join, snapshot!);
    const atBeamEnd = element_reactions(beam, snapshot!).find((r) => !r.atAnchor)!;
    const lines = [
      `### cantilever-join — SSOR=${process.env.SLIDEP_SSOR ?? "off"}`,
      `join.fx=${atJoin.vector.x.toFixed(6)} (expect 0)`,
      `join.fy=${atJoin.vector.y.toFixed(6)} (expect 100)`,
      `join.moment=${atJoin.moment.toFixed(6)} (expect 100)`,
      `beamEnd.fy=${atBeamEnd.vector.y.toFixed(6)} (expect 100)`,
      `beamEnd.moment=${atBeamEnd.moment.toFixed(6)} (expect 100)`,
    ];
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 60_000);

  it("cantilever — masse mi-portée (beam-cohesion.test.ts)", () => {
    const { mech, beam } = cantileverMidSpanMass();
    const model = compile_simulation_model(mech, true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
    const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === beam.id)!;
    const lines = [
      `### cantilever-midspan — SSOR=${process.env.SLIDEP_SSOR ?? "off"}`,
      `start.fy=${cohesion.start.fy.toFixed(6)} (expect -100)`,
      `start.m=${cohesion.start.m.toFixed(6)} (expect 50)`,
      `end.fy=${cohesion.end.fy.toFixed(6)} (expect 0)`,
      `end.m=${cohesion.end.m.toFixed(6)} (expect 0)`,
    ];
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 60_000);
});
