import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  Mechanism,
} from "../../../types/mechanism";
import type {
  BeamElement,
  ID,
  PivotElement,
  SpringElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  apply_parameter_snapshot_to_mechanism,
  parameter_snapshot,
} from "./simulation-engine";

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const PIVOT_ID = id();
const LATE_PIVOT_ID = id();
const BEAM_ID = id();
const MATERIAL_ID = id();
const LATE_MATERIAL_ID = id();
const DELETED_MATERIAL_ID = id();
const PROFILE_ID = id();
const SPRING_ID = id();

const pivot = (
  pid: ID,
  position: Point2,
  rotationalFriction: number,
): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position,
  isGrounded: true,
  rotatingEdgesIDs: [BEAM_ID],
  fixedGearsIDs: [],
  rotationalFriction,
});

const beam = (materialID: ID): BeamElement => ({
  type: "beam",
  id: BEAM_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  fixedNodeStartID: PIVOT_ID,
  fixedNodeEndID: PIVOT_ID,
  fixedNodesBodyIDs: [],
  materialID,
  profileID: PROFILE_ID,
});

const spring = (restLength?: number): SpringElement => ({
  type: "spring",
  id: SPRING_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  stiffness: 100,
  ...(restLength !== undefined ? { restLength } : {}),
});

const material = (
  mid: ID,
  name: string,
  Re: number,
  rho: number,
): MaterialDef => ({ id: mid, name, E: 1, Re, rho });

const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "profile", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(parts: Partial<Mechanism>): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    materials: [],
    profiles: PROFILES,
    history: [],
    future: [],
    ...parts,
  };
}

describe("apply_parameter_snapshot_to_mechanism", () => {
  // The mechanism as it stood when the snapshot was taken, then as it stands after several edits made later in the run.
  const before = mechanism({
    simulation: { ...DEFAULT_SIMULATION, gravity: true },
    mechanicalElements: [pivot(PIVOT_ID, new Point2(0, 0), 0.1), beam(MATERIAL_ID)],
    materials: [
      material(MATERIAL_ID, "steel", 10, 1),
      material(DELETED_MATERIAL_ID, "gone", 30, 3),
    ],
  });
  const after = mechanism({
    simulation: { ...DEFAULT_SIMULATION, gravity: false },
    mechanicalElements: [
      pivot(PIVOT_ID, new Point2(5, 5), 0.5),
      beam(LATE_MATERIAL_ID),
      pivot(LATE_PIVOT_ID, new Point2(9, 9), 0.7),
    ],
    materials: [
      material(MATERIAL_ID, "steel (renamed)", 20, 2),
      material(LATE_MATERIAL_ID, "late", 40, 4),
    ],
  });
  const shown = apply_parameter_snapshot_to_mechanism(
    after,
    parameter_snapshot(2, before),
  );
  const element = (eid: ID) =>
    shown.mechanicalElements.find((el) => el.id === eid);

  it("shows the element parameters in effect at that instant", () => {
    expect((element(PIVOT_ID) as PivotElement).rotationalFriction).toBe(0.1);
    expect((element(BEAM_ID) as BeamElement).materialID).toBe(MATERIAL_ID);
  });

  it("leaves the geometry and elements added since as they are", () => {
    expect((element(PIVOT_ID) as PivotElement).position).toEqual(
      new Point2(5, 5),
    );
    expect((element(LATE_PIVOT_ID) as PivotElement).rotationalFriction).toBe(
      0.7,
    );
  });

  it("shows the catalogue as it stood, keeping what only reads the run current", () => {
    const steel = shown.materials.find((m) => m.id === MATERIAL_ID);
    expect(steel?.rho).toBe(1);
    expect(steel?.Re).toBe(20);
    expect(steel?.name).toBe("steel (renamed)");
    expect(shown.materials.some((m) => m.id === DELETED_MATERIAL_ID)).toBe(true);
  });

  it("shows the simulation settings in effect at that instant", () => {
    expect(shown.simulation.gravity).toBe(true);
  });
});

/**
 * Entering simulation freezes a spring's natural length on the drawn copy, whether or not the user ever typed one.
 * The parameter snapshot passes over that copy afterwards, so it has to tell a rest length it carries from one it has nothing to say about — the drawing recounts its coils on every frame if the latter overwrites the frozen one.
 */
describe("a spring's rest length through the parameter snapshot", () => {
  const shownRestLength = (recorded?: number, frozen?: number) => {
    const shown = apply_parameter_snapshot_to_mechanism(
      mechanism({ mechanicalElements: [spring(frozen)] }),
      parameter_snapshot(
        2,
        mechanism({ mechanicalElements: [spring(recorded)] }),
      ),
    );
    return (shown.mechanicalElements[0] as SpringElement).restLength;
  };

  it("keeps the frozen one when no rest length was ever typed", () => {
    expect(shownRestLength(undefined, 0.4)).toBe(0.4);
  });

  it("shows the recorded one when the run carries it", () => {
    expect(shownRestLength(0.7, 0.4)).toBe(0.7);
  });
});
