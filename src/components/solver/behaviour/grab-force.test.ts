import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  Mechanism,
} from "../../../types/mechanism";
import type {
  BeamElement,
  GearElement,
  ID,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  SimGrab,
  compile_simulation_model,
  dynamic_snapshot_at,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { GRAB_BRIDGE_KEY, snapshot_angle, snapshot_point } from "../snapshot";
import { compute_energy_balance } from "../analysis/energy-balance";
import { compute_force_balance } from "../analysis/force-balance";

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
}

/** Every frame of `frames` steps with no gravity and `grab` held for each. */
function grab_run(
  model: ReturnType<typeof compile_simulation_model>,
  grab: SimGrab,
  frames: number,
): DynamicSnapshot[] {
  const run: DynamicSnapshot[] = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, 0),
      grab,
    );
    run.push(snapshot);
  }
  return run;
}

/** Step `frames` frames with no gravity and `grab` held for every one. */
function grab_frames(
  model: ReturnType<typeof compile_simulation_model>,
  grab: SimGrab,
  frames: number,
): DynamicSnapshot {
  const run = grab_run(model, grab, frames);
  return run[run.length - 1];
}

describe("grab dynamique = force (plus une contrainte de position)", () => {
  it("un nœud libre saisi est tiré vers la cible", () => {
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    };
    const model = compile_simulation_model(mechanism([mass]));
    const snapshot = grab_frames(model, { key: MASS, target: new Point2(100, 0) }, 5);
    const p = snapshot_point(snapshot, MASS)!;
    expect(p.x).toBeGreaterThan(0);
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
    // The pull is recorded as a spring, its foot the grabbed point as it stands now (to within the last substep's travel).
    expect(snapshot.grab).toBeDefined();
    expect(snapshot.grab!.x).toBeCloseTo(p.x, 4);
    expect(snapshot.grab!.y).toBeCloseTo(p.y, 4);
    expect(Math.hypot(snapshot.grab!.fx, snapshot.grab!.fy)).toBeGreaterThan(0);
  });

  it("un nœud ancré ne bouge pas quand on le saisit", () => {
    const ANCHOR = id();
    const pivot: PivotElement = {
      type: "pivot",
      id: ANCHOR,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [],
      rotationalFriction: 0,
    };
    const model = compile_simulation_model(mechanism([pivot]));
    const snapshot = grab_frames(
      model,
      { key: ANCHOR, target: new Point2(100, 0) },
      5,
    );
    const p = snapshot_point(snapshot, ANCHOR)!;
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it("un grab de corps tire la poutre entière vers la cible", () => {
    const BEAM = id();
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(10, 0),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const model = compile_simulation_model(mechanism([beam]));
    const snapshot = grab_frames(
      model,
      { edgeID: BEAM, t: 0.5, target: new Point2(5, 100) },
      5,
    );
    const start = snapshot_point(snapshot, `${BEAM}:start`)!;
    const end = snapshot_point(snapshot, `${BEAM}:end`)!;
    expect(start.y).toBeGreaterThan(0);
    expect(end.y).toBeGreaterThan(0);
    // A body grab at the midpoint pulls both ends together (a translation, not a swing).
    expect(Math.abs(start.y - end.y)).toBeLessThan(1e-6);
  });

  it("un grab de dent fait tourner le gear", () => {
    const GEAR = id();
    const AXLE = id();
    const axle: PivotElement = {
      type: "pivot",
      id: AXLE,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [GEAR],
      rotationalFriction: 0,
    };
    const gear: GearElement = {
      type: "gear",
      id: GEAR,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      angle: 0,
      radius: 10,
      parentAxleID: AXLE,
      fixedNodesBodyIDs: [],
      meshedGearsIDs: [],
      surfaceMass: 1,
    };
    // A bystander pivot gives the mechanism an extent of its own: the spring stretches in proportion to it, and an axle alone has none.
    const bystander: PivotElement = {
      ...axle,
      id: id(),
      position: new Point2(30, 0),
      fixedGearsIDs: [],
    };
    const model = compile_simulation_model(mechanism([axle, gear, bystander]));
    // Grab the rim point at angle 0 and pull it straight up: the gear must rotate (+90°), as fast as a spring of that strength turns a gear this heavy — hence the second of simulated time.
    const snapshot = grab_frames(
      model,
      { gearID: GEAR, angleOffset: 0, radius: 10, target: new Point2(10, 100) },
      120,
    );
    const angle = snapshot_angle(snapshot, GEAR)!;
    expect(Number.isFinite(angle)).toBe(true);
    expect(angle).toBeGreaterThan(0.1);
  });

  it("la flèche rejouée entre deux instants suit la pose interpolée", () => {
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    };
    const model = compile_simulation_model(mechanism([mass]));
    const run = grab_run(model, { key: MASS, target: new Point2(100, 0) }, 6);
    const [a, b] = [run[3], run[4]];
    const halfway = dynamic_snapshot_at(run, (a.t + b.t) / 2)!;
    expect(halfway.grab).toBeDefined();
    expect(halfway.grab!.x).toBeCloseTo((a.grab!.x + b.grab!.x) / 2, 9);
    expect(halfway.grab!.fx).toBeCloseTo((a.grab!.fx + b.grab!.fx) / 2, 6);
  });

  it("le travail cumulé du grab est l'énergie cinétique gagnée", () => {
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    };
    const model = compile_simulation_model(mechanism([mass]));
    const run = grab_run(model, { key: MASS, target: new Point2(100, 0) }, 6);
    // Pulled from rest, the grab can only give energy.
    expect(run[0].energy!.grabWork).toBeGreaterThan(0);
    // No gravity, no other action: the work given since the first frame is the kinetic energy gained since it.
    const series = compute_energy_balance(run);
    const last = series.t.length - 1;
    expect(
      Math.abs(series.kinetic[last] - series.kinetic[0] - series.grabWork[last]),
    ).toBeLessThan(0.02 * Math.abs(series.grabWork[last]));
  });

  describe("jamais de valeur non finie dans ce qui est publié", () => {
    const MASS = id();
    const free_mass = (): MassElement => ({
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    });
    /** The mass's own slots: the reserved grab slots read NaN by design, so the whole arrays cannot be scanned. */
    const finite_mass = (snapshot: DynamicSnapshot) => {
      const slot = snapshot.layout.index.get(MASS)!;
      return [
        snapshot.positions[2 * slot],
        snapshot.positions[2 * slot + 1],
        snapshot.velocities[2 * slot],
        snapshot.velocities[2 * slot + 1],
      ].every(Number.isFinite);
    };

    it("une cible non finie n'applique aucune force", () => {
      const model = compile_simulation_model(mechanism([free_mass()]));
      const snapshot = grab_frames(model, { key: MASS, target: new Point2(NaN, 0) }, 3);
      expect(finite_mass(snapshot)).toBe(true);
      expect(snapshot.grab).toBeUndefined();
    });

    it("le ressort a une limite : un curseur plus loin ne tire pas plus fort", () => {
    const BEAM = id();
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(10, 0),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    // The first frame of a fresh grab: everything but the cursor's distance is the same from one pull to the next.
    const pull = (distance: number) => {
      const model = compile_simulation_model(mechanism([beam]));
      const { grab } = grab_frames(
        model,
        { edgeID: BEAM, t: 0.5, target: new Point2(5, distance) },
        1,
      );
      return {
        force: Math.hypot(grab!.fx, grab!.fy),
        stretch: Math.hypot(grab!.tx - grab!.x, grab!.ty - grab!.y),
      };
    };
    const near = pull(0.001);
    const far = pull(1e3);
    const farthest = pull(1e9);
    expect(far.force).toBeGreaterThan(near.force);
    // Past the limit the spring stops where it is, and so does what it pulls with.
    expect(farthest.force).toBeCloseTo(far.force, 6);
    expect(farthest.stretch).toBeCloseTo(far.stretch, 6);
    expect(far.stretch).toBeLessThan(1e3);
  });

  it("un pas irrésoluble, même sans grab, fige la frame précédente", () => {
      const model = compile_simulation_model(mechanism([free_mass()]));
      const grab = { key: MASS, target: new Point2(1, 0) };
      const step = (i: number, prev: DynamicSnapshot | null, gravity: Point2) =>
        step_dynamic_simulation(model, i * RECORD_DT, prev, RECORD_DT, gravity, grab);
      let snapshot = step(0, null, new Point2(0, 0));
      for (let i = 1; i < 3; i++) snapshot = step(i, snapshot, new Point2(0, 0));
      const before = snapshot_point(snapshot, MASS)!;
      const broken = step(3, snapshot, new Point2(NaN, 0));
      expect(finite_mass(broken)).toBe(true);
      expect(snapshot_point(broken, MASS)!.x).toBe(before.x);
      // The recording carries on from there.
      expect(finite_mass(step(4, broken, new Point2(0, 0)))).toBe(true);
    });

    it("le ressort reste stable même sur un sous-pas unique", () => {
      const model = compile_simulation_model(mechanism([free_mass()]));
      let snapshot: DynamicSnapshot | null = null;
      // A single substep per frame is far too coarse for the spring as it is: it has to soften itself, or it runs away until it overflows.
      for (let i = 0; i < 400; i++) {
        snapshot = step_dynamic_simulation(
          model,
          i * RECORD_DT,
          snapshot,
          RECORD_DT,
          new Point2(0, 0),
          { key: MASS, target: new Point2(1, 0) },
          undefined,
          true,
          false,
          false,
          1,
        );
        expect(finite_mass(snapshot)).toBe(true);
      }
      expect(Math.abs(snapshot_point(snapshot!, MASS)!.x)).toBeLessThan(1);
      expect(snapshot!.grab).toBeDefined();
    });
  });

  it("le bilan des forces compte le grab, sans quoi ΣF − m·a ne se ferme pas", () => {
    const BEAM = id();
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(10, 0),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const scene = mechanism([beam]);
    const model = compile_simulation_model(scene);
    const snapshot = grab_frames(
      model,
      { edgeID: BEAM, t: 0.5, target: new Point2(5, 1) },
      2,
    );
    const balance = compute_force_balance(scene, snapshot, new Point2(0, 0))!;
    const grab = balance.actions.find((action) => action.kind === "grab")!;
    expect(grab.elementID).toBe(BEAM);
    // The pull is the only action on a free beam without gravity, so once itemised the balance closes: what is left over is a small share of it.
    const pull = Math.hypot(grab.force.x, grab.force.y);
    expect(pull).toBeGreaterThan(0);
    expect(Math.hypot(balance.gap.x, balance.gap.y)).toBeLessThan(1e-3 * pull);
    expect(Math.abs(balance.gapMoment)).toBeLessThan(1e-3 * pull);
  });

  it("le point saisi est enregistré dans le slot de grab", () => {
    const BEAM = id();
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(10, 0),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const model = compile_simulation_model(mechanism([beam]));
    const target = new Point2(5, 100);
    const snapshot = grab_frames(model, { edgeID: BEAM, t: 0.5, target }, 1);
    const recorded = snapshot_point(snapshot, GRAB_BRIDGE_KEY);
    expect(recorded?.x).toBeCloseTo(target.x, 9);
    expect(recorded?.y).toBeCloseTo(target.y, 9);
  });
});
