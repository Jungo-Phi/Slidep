import { describe, expect, it } from "vitest";
import { DEFAULT } from "../constants/physics-specs";
import { DEFAULT_SIMULATION } from "../types";
import {
  CURRENT_FORMAT_VERSION,
  MIGRATION_STEPS,
  migrate_document,
} from "./migrate-mechanism";

/** A document reduced to what the migration chain touches. */
const doc = (extra: Record<string, unknown> = {}) => ({
  metadata: { name: "test" },
  mechanicalElements: [],
  constraintElements: [],
  loads: [],
  history: [["a"]],
  future: [["b"]],
  ...extra,
});

describe("the migration chain", () => {
  it("ends at the current version", () => {
    const last = MIGRATION_STEPS[MIGRATION_STEPS.length - 1];
    expect(last ? last.to : 1).toBe(CURRENT_FORMAT_VERSION);
  });

  it("is contiguous and ascending", () => {
    // A step numbered `to` converts from `to - 1`: a gap would leave documents of the skipped version with no path forward.
    MIGRATION_STEPS.forEach((step, i) => expect(step.to).toBe(i + 2));
  });
});

describe("migrate_document", () => {
  // A missing field means the document predates it, so it owes every step.
  // Read as the current version instead, it would skip them all and keep its old shape under a new version number.
  it("treats a document with no formatVersion as version 1", () => {
    const result = migrate_document(
      doc({ mechanicalElements: [{ type: "belt", id: "b", tight: true }] }),
    );
    expect(result.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(result.mechanicalElements[0]).toMatchObject({ closed: true });
  });

  it("keeps undo history when no step has to run", () => {
    const result = migrate_document(
      doc({ formatVersion: CURRENT_FORMAT_VERSION }),
    );
    expect(result.history).toEqual([["a"]]);
  });

  it("stamps the current version on a document that already carries one", () => {
    expect(migrate_document(doc({ formatVersion: 1 })).formatVersion).toBe(
      CURRENT_FORMAT_VERSION,
    );
  });

  it("renames a belt's tension flag", () => {
    const result = migrate_document(
      doc({
        formatVersion: 1,
        mechanicalElements: [
          { type: "belt", id: "b1", tight: false },
          { type: "beam", id: "m1", tight: true },
        ],
      }),
    );
    const [belt, beam] = result.mechanicalElements as unknown as Record<
      string,
      unknown
    >[];
    expect(belt).toMatchObject({ closed: false });
    expect("tight" in belt).toBe(false);
    // Only belts carry the flag: a like-named field elsewhere is not ours.
    expect(beam).toMatchObject({ tight: true });
  });

  // Called directly rather than through `migrate_document`, for the same reason as the undo-stack tests further down: a document this old also crosses the v5 step, which drops the stack for an unrelated reason and would leave nothing here to assert on.
  it("renames the flag in the undo stack too", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 2)!;
    const result = step.apply(
      doc({
        formatVersion: 1,
        history: [
          [
            { type: "TightenBelt", id: "b1", tightened: true },
            { type: "MoveNode", id: "n1" },
          ],
        ],
        future: [
          [
            {
              type: "UpdatePositionsToValidState",
              masterActionType: "TightenBelt",
            },
            {
              type: "CreateElement",
              element: { type: "belt", id: "b2", tight: true },
            },
          ],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        { type: "CloseBelt", id: "b1", closed: true },
        { type: "MoveNode", id: "n1" },
      ],
    ]);
    expect(result.future).toEqual([
      [
        { type: "UpdatePositionsToValidState", masterActionType: "CloseBelt" },
        {
          type: "CreateElement",
          element: { type: "belt", id: "b2", closed: true },
        },
      ],
    ]);
  });

  it("fills in mass and friction absent from elements saved before they existed", () => {
    const result = migrate_document(
      doc({
        formatVersion: 2,
        mechanicalElements: [
          { type: "pivot", id: "p1" },
          { type: "slider", id: "s1" },
          { type: "slidep", id: "sp1" },
          { type: "gear", id: "g1" },
          { type: "beam", id: "b1" },
        ],
      }),
    );
    expect(result.mechanicalElements).toMatchObject([
      { rotationalFriction: DEFAULT.ROTATIONAL_FRICTION },
      { slidingFriction: DEFAULT.SLIDING_FRICTION },
      {
        slidingFriction: DEFAULT.SLIDING_FRICTION,
        rotationalFriction: DEFAULT.ROTATIONAL_FRICTION,
      },
      { surfaceMass: DEFAULT.SURFACE_MASS },
      {},
    ]);
    // The beam's own `linearMass` (filled in by this very step) is itself replaced by the v9 step further down the chain — see "assigns the default material/profile couple to every beam" below.
    expect(result.mechanicalElements[4]).not.toHaveProperty("linearMass");
    expect(result.mechanicalElements[4]).toHaveProperty("materialID");
    expect(result.mechanicalElements[4]).toHaveProperty("profileID");
  });

  // Called directly rather than through `migrate_document`: a document this old also crosses the v5 step, which drops the stack for an unrelated reason (see below) and would leave nothing here to assert on.
  it("fills in the same defaults for an element carried by the undo stack", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 3)!;
    const result = step.apply(
      doc({
        formatVersion: 2,
        history: [
          [{ type: "CreateElement", element: { type: "gear", id: "g1" } }],
        ],
        future: [
          [{ type: "DeleteElement", element: { type: "beam", id: "b1" } }],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        {
          type: "CreateElement",
          element: { type: "gear", id: "g1", surfaceMass: DEFAULT.SURFACE_MASS },
        },
      ],
    ]);
    expect(result.future).toEqual([
      [
        {
          type: "DeleteElement",
          element: { type: "beam", id: "b1", linearMass: DEFAULT.LINEAR_MASS },
        },
      ],
    ]);
  });

  it("fills in a motor's torque limit, absent from motors saved before it existed", () => {
    const result = migrate_document(
      doc({
        formatVersion: 3,
        mechanicalElements: [
          { type: "pivot", id: "p1", motor: { speed: 10 } },
          { type: "pivot", id: "p2" },
        ],
      }),
    );
    expect(result.mechanicalElements).toMatchObject([
      // Also rescaled tr/min → rad/s on the way to the current version — not what this test is about, but unavoidable since it migrates from v3 all the way up.
      { motor: { speed: (10 * 2 * Math.PI) / 60, torque: DEFAULT.MOTOR_TORQUE } },
      {},
    ]);
    // A motorless pivot gets no `motor` field conjured up.
    expect("motor" in (result.mechanicalElements[1] as object)).toBe(false);
  });

  it("does not override a motor torque already present", () => {
    const result = migrate_document(
      doc({
        formatVersion: 3,
        mechanicalElements: [
          { type: "pivot", id: "p1", motor: { speed: 10, torque: 42 } },
        ],
      }),
    );
    expect(result.mechanicalElements[0]).toMatchObject({
      motor: { torque: 42 },
    });
  });

  // Called directly rather than through `migrate_document`, for the same reason as above.
  it("fills in the motor default for a pivot carried by the undo stack", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 4)!;
    const result = step.apply(
      doc({
        formatVersion: 3,
        history: [
          [
            {
              type: "CreateElement",
              element: { type: "pivot", id: "p1", motor: { speed: 10 } },
            },
          ],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        {
          type: "CreateElement",
          element: {
            type: "pivot",
            id: "p1",
            motor: { speed: 10, torque: DEFAULT.MOTOR_TORQUE },
          },
        },
      ],
    ]);
  });

  // Called directly rather than through `migrate_document`, for the same reason as above.
  it("fills in the motor default for a bare MotorConfig carried by SetMotorConfig", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 4)!;
    const result = step.apply(
      doc({
        formatVersion: 3,
        history: [
          [
            {
              type: "SetMotorConfig",
              id: "p1",
              newConfig: { speed: 10 },
              oldConfig: undefined,
            },
          ],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        {
          type: "SetMotorConfig",
          id: "p1",
          newConfig: { speed: 10, torque: DEFAULT.MOTOR_TORQUE },
          oldConfig: undefined,
        },
      ],
    ]);
  });

  it("rescales stored distances from the old millimetre-flavoured convention to metres", () => {
    const result = migrate_document(
      doc({
        formatVersion: 4,
        mechanicalElements: [
          { type: "pivot", id: "p1", position: { x: 1000, y: -2000 } },
          {
            type: "beam",
            id: "b1",
            positionStart: { x: 0, y: 0 },
            positionEnd: { x: 400, y: 0 },
          },
          { type: "gear", id: "g1", radius: 40 },
          { type: "spring", id: "s1", restLength: 100 },
        ],
        constraintElements: [
          {
            type: "dimension-edge",
            id: "d1",
            position: { x: 10, y: 10 },
            value: 400,
          },
          { type: "dimension-angle", id: "d2", position: { x: 0, y: 0 }, value: 1.2 },
          { type: "gear-ratio", id: "d3", position: { x: 0, y: 0 }, value: 2.5 },
        ],
        viewport: { scale: 2, pan: { x: 100, y: 50 } },
      }),
    );
    expect(result.mechanicalElements).toMatchObject([
      { position: { x: 1, y: -2 } },
      { positionStart: { x: 0, y: 0 }, positionEnd: { x: 0.4, y: 0 } },
      { radius: 0.04 },
      { restLength: 0.1 },
    ]);
    expect(result.constraintElements).toMatchObject([
      { position: { x: 0.01, y: 0.01 }, value: 0.4 },
      // Not a length, so untouched by this step — but also rescaled degrees → radians on the way to the current version by the v7 step below.
      { value: 1.2 * (Math.PI / 180) },
      // A gear ratio is dimensionless: untouched by either step.
      { value: 2.5 },
    ]);
    // The viewport's scale grows by the same factor a distance shrinks by, so the same screen position still shows the same view.
    expect(result.viewport).toMatchObject({ scale: 2000, pan: { x: 100, y: 50 } });
  });

  it("drops the undo stack when rescaling, rather than guess at every action's shape", () => {
    const result = migrate_document(
      doc({
        formatVersion: 4,
        history: [[{ type: "MoveNode", id: "n1" }]],
        future: [[{ type: "MoveNode", id: "n1" }]],
      }),
    );
    expect(result.history).toEqual([]);
    expect(result.future).toEqual([]);
  });

  it("rescales a motor's speed from tr/min to rad/s", () => {
    const result = migrate_document(
      doc({
        formatVersion: 5,
        mechanicalElements: [
          { type: "pivot", id: "p1", motor: { speed: 60, torque: 1 } },
        ],
      }),
    );
    expect(result.mechanicalElements).toMatchObject([
      { motor: { speed: 2 * Math.PI, torque: 1 } },
    ]);
  });

  // Called directly rather than through `migrate_document`, for the same reason as the torque-default step above: `SetMotorConfig` carries a `MotorConfig` outside any element.
  it("rescales a motor's speed carried by SetMotorConfig", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 6)!;
    const result = step.apply(
      doc({
        formatVersion: 5,
        history: [
          [
            {
              type: "SetMotorConfig",
              id: "p1",
              newConfig: { speed: 60, torque: 1 },
              oldConfig: undefined,
            },
          ],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        {
          type: "SetMotorConfig",
          id: "p1",
          newConfig: { speed: 2 * Math.PI, torque: 1 },
          oldConfig: undefined,
        },
      ],
    ]);
  });

  it("rescales a dimension-angle's value from degrees to radians", () => {
    const result = migrate_document(
      doc({
        formatVersion: 6,
        constraintElements: [
          { type: "dimension-angle", id: "d1", value: 90 },
          { type: "dimension-radius", id: "d2", value: 40 },
        ],
      }),
    );
    expect(result.constraintElements).toMatchObject([
      { value: Math.PI / 2 },
      { value: 40 },
    ]);
  });

  it("drops the undo stack when rescaling a dimension-angle, rather than guess which action carried one", () => {
    const result = migrate_document(
      doc({
        formatVersion: 6,
        history: [
          [{ type: "ChangeDimensionEdgeValue", id: "d1", newValue: 90, oldValue: 0 }],
        ],
        future: [[{ type: "ChangeDimensionEdgeValue", id: "d1", newValue: 90, oldValue: 0 }]],
      }),
    );
    expect(result.history).toEqual([]);
    expect(result.future).toEqual([]);
  });

  it("defaults gravity/collisions/floor for a document saved before they existed", () => {
    const result = migrate_document(doc({ formatVersion: 7 }));
    expect(result.simulation).toEqual(DEFAULT_SIMULATION);
  });

  it("leaves an existing simulation setting untouched", () => {
    const simulation = {
      gravity: false,
      collisions: true,
      floor: { enabled: true, height: 3, angle: 0.5 },
    };
    const result = migrate_document(doc({ formatVersion: 7, simulation }));
    expect(result.simulation).toEqual({
      ...simulation,
      beamStressLens: "none",
      supportReactions: false,
    });
  });

  it("defaults the beam-fill lens for a document saved before it existed", () => {
    const simulation = {
      gravity: true,
      collisions: false,
      floor: { enabled: false, height: 0, angle: 0 },
    };
    const result = migrate_document(doc({ formatVersion: 11, simulation }));
    expect(result.simulation).toEqual({
      ...simulation,
      beamStressLens: "none",
      supportReactions: false,
    });
  });

  it("defaults the support-reaction calque for a document saved before it existed", () => {
    const simulation = {
      gravity: true,
      collisions: false,
      floor: { enabled: false, height: 0, angle: 0 },
      beamStressLens: "bending",
    };
    const result = migrate_document(doc({ formatVersion: 12, simulation }));
    expect(result.simulation).toEqual({
      ...simulation,
      supportReactions: false,
    });
  });

  it("assigns the default material/profile couple to every beam, even one that already carried a linearMass", () => {
    const result = migrate_document(
      doc({
        formatVersion: 8,
        mechanicalElements: [
          { type: "beam", id: "b1", linearMass: 42 },
          { type: "beam", id: "b2", linearMass: 1 },
        ],
      }),
    );
    // The couple itself, plus the catalogue the v9 → v10 step seeds alongside it.
    expect(result.materials.length).toBeGreaterThan(1);
    expect(result.profiles).toHaveLength(1);
    const [material] = result.materials as unknown as { id: string }[];
    const [profile] = result.profiles as unknown as { id: string }[];
    expect(result.mechanicalElements).toEqual([
      {
        type: "beam",
        id: "b1",
        materialID: material.id,
        profileID: profile.id,
      },
      {
        type: "beam",
        id: "b2",
        materialID: material.id,
        profileID: profile.id,
      },
    ]);
  });

  it("carries the same couple into the undo stack, and turns a stored ChangeLinearMass into a no-op", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 9)!;
    const result = step.apply(
      doc({
        formatVersion: 8,
        history: [
          [
            {
              type: "CreateElement",
              element: { type: "beam", id: "b1", linearMass: 1 },
            },
          ],
          [{ type: "ChangeLinearMass", id: "b1", delta: 5 }],
        ],
        future: [
          [{ type: "DeleteElement", element: { type: "beam", id: "b2", linearMass: 1 } }],
        ],
      }),
    );
    const [material] = result.materials as unknown as { id: string }[];
    const [profile] = result.profiles as unknown as { id: string }[];
    expect(result.history).toEqual([
      [
        {
          type: "CreateElement",
          element: { type: "beam", id: "b1", materialID: material.id, profileID: profile.id },
        },
      ],
      [{ type: "Blank" }],
    ]);
    expect(result.future).toEqual([
      [
        {
          type: "DeleteElement",
          element: { type: "beam", id: "b2", materialID: material.id, profileID: profile.id },
        },
      ],
    ]);
  });

  it("seeds the catalogue alongside an existing material", () => {
    const step = MIGRATION_STEPS.find((s) => s.to === 10)!;
    const result = step.apply(
      doc({
        formatVersion: 9,
        materials: [{ id: "m1", name: "Custom", E: 1, Re: 1, rho: 1 }],
      }),
    );
    const materials = result.materials as unknown as { id: string }[];
    expect(materials[0]).toEqual({ id: "m1", name: "Custom", E: 1, Re: 1, rho: 1 });
    expect(materials.length).toBeGreaterThan(1);
  });

  it("refuses a document from a newer format", () => {
    expect(() =>
      migrate_document(doc({ formatVersion: CURRENT_FORMAT_VERSION + 1 })),
    ).toThrow();
  });

  it("refuses what is not a document at all", () => {
    expect(() => migrate_document(null)).toThrow();
    expect(() => migrate_document([])).toThrow();
    expect(() => migrate_document("{}")).toThrow();
  });

  it("leaves the source untouched", () => {
    const source = doc();
    migrate_document(source);
    expect("formatVersion" in source).toBe(false);
  });
});
