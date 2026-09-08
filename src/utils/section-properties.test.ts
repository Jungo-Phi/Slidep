import { describe, expect, it } from "vitest";
import {
  beam_strength,
  max_fiber_stress,
  max_shear_stress,
  section_properties,
  validate_profile_shape,
} from "./section-properties";
import { MaterialDef, ProfileDef } from "../types/material";
import { ID } from "../types/element";

const MATERIAL_ID = "00000000-0000-0000-0000-000000000001" as ID;
const PROFILE_ID = "00000000-0000-0000-0000-000000000002" as ID;
const MISSING_ID = "00000000-0000-0000-0000-000000000099" as ID;

describe("section_properties", () => {
  it("rect: A = b·h, I = b·h³/12, v = h/2, Q = b·h²/8, b unchanged", () => {
    const { A, I, v, Q, b } = section_properties({ kind: "rect", b: 0.02, h: 0.01 });
    expect(A).toBeCloseTo(0.0002, 10);
    expect(I).toBeCloseTo((0.02 * 0.01 ** 3) / 12, 12);
    expect(v).toBeCloseTo(0.005, 10);
    expect(Q).toBeCloseTo((0.02 * 0.01 ** 2) / 8, 12);
    expect(b).toBeCloseTo(0.02, 10);
  });

  it("rect: swapping b and h changes I — flexion is about the out-of-plane axis, h in-plane", () => {
    const upright = section_properties({ kind: "rect", b: 0.01, h: 0.03 });
    const flat = section_properties({ kind: "rect", b: 0.03, h: 0.01 });
    expect(upright.A).toBeCloseTo(flat.A, 10); // same area either way
    expect(upright.I).toBeGreaterThan(flat.I * 5); // but not the same stiffness — h is the resisting cote
  });

  it("round: A = πd²/4, I = πd⁴/64, v = d/2, Q = (2/3)·r³, b = d", () => {
    const { A, I, v, Q, b } = section_properties({ kind: "round", d: 0.016 });
    expect(A).toBeCloseTo((Math.PI * 0.016 ** 2) / 4, 10);
    expect(I).toBeCloseTo((Math.PI * 0.016 ** 4) / 64, 14);
    expect(v).toBeCloseTo(0.008, 10);
    expect(Q).toBeCloseTo((2 / 3) * 0.008 ** 3, 14);
    expect(b).toBeCloseTo(0.016, 10);
  });

  it("box: full rectangle minus the inner hollow — b at the neutral axis is the two side walls", () => {
    const shape = { kind: "box" as const, b: 0.03, h: 0.02, e: 0.002 };
    const { A, I, v, Q, b } = section_properties(shape);
    const bi = 0.03 - 2 * 0.002;
    const hi = 0.02 - 2 * 0.002;
    expect(A).toBeCloseTo(0.03 * 0.02 - bi * hi, 10);
    expect(I).toBeCloseTo((0.03 * 0.02 ** 3 - bi * hi ** 3) / 12, 12);
    expect(v).toBeCloseTo(0.01, 10);
    expect(Q).toBeCloseTo((0.03 * 0.02 ** 2 - bi * hi ** 2) / 8, 12);
    expect(b).toBeCloseTo(2 * 0.002, 10);
  });

  it("tube: full disk minus the inner hollow — b at the neutral axis is the two wall thicknesses", () => {
    const shape = { kind: "tube" as const, d: 0.02, e: 0.002 };
    const { A, I, v, Q, b } = section_properties(shape);
    const di = 0.02 - 2 * 0.002;
    expect(A).toBeCloseTo((Math.PI * (0.02 ** 2 - di ** 2)) / 4, 10);
    expect(I).toBeCloseTo((Math.PI * (0.02 ** 4 - di ** 4)) / 64, 14);
    expect(v).toBeCloseTo(0.01, 10);
    expect(Q).toBeCloseTo((2 / 3) * (0.01 ** 3 - (di / 2) ** 3), 14);
    expect(b).toBeCloseTo(2 * 0.002, 10);
  });

  it("I: full rectangle minus the two web-height side cutouts — b at the neutral axis is the web", () => {
    const shape = { kind: "I" as const, b: 0.055, h: 0.1, tw: 0.0041, tf: 0.0057 };
    const { A, I, v, Q, b } = section_properties(shape);
    const hi = 0.1 - 2 * 0.0057;
    expect(A).toBeCloseTo(0.055 * 0.1 - (0.055 - 0.0041) * hi, 10);
    expect(I).toBeCloseTo((0.055 * 0.1 ** 3 - (0.055 - 0.0041) * hi ** 3) / 12, 10);
    expect(v).toBeCloseTo(0.05, 10);
    const expectedQ = 0.055 * 0.0057 * (0.05 - 0.0057 / 2) + (0.0041 * hi ** 2) / 8;
    expect(Q).toBeCloseTo(expectedQ, 12);
    expect(b).toBeCloseTo(0.0041, 10);
  });

  it("never returns a negative I for any valid shape", () => {
    const shapes = [
      { kind: "rect" as const, b: 0.02, h: 0.02 },
      { kind: "round" as const, d: 0.02 },
      { kind: "box" as const, b: 0.02, h: 0.02, e: 0.001 },
      { kind: "tube" as const, d: 0.02, e: 0.001 },
      { kind: "I" as const, b: 0.02, h: 0.02, tw: 0.002, tf: 0.002 },
    ];
    for (const shape of shapes) expect(section_properties(shape).I).toBeGreaterThan(0);
  });
});

describe("validate_profile_shape", () => {
  it("accepts sane cotes", () => {
    expect(validate_profile_shape({ kind: "rect", b: 0.02, h: 0.02 })).toBe(true);
    expect(validate_profile_shape({ kind: "round", d: 0.02 })).toBe(true);
    expect(validate_profile_shape({ kind: "box", b: 0.02, h: 0.02, e: 0.002 })).toBe(true);
    expect(validate_profile_shape({ kind: "tube", d: 0.02, e: 0.002 })).toBe(true);
    expect(
      validate_profile_shape({ kind: "I", b: 0.02, h: 0.02, tw: 0.002, tf: 0.002 }),
    ).toBe(true);
  });

  it("rejects a negative or zero cote", () => {
    expect(validate_profile_shape({ kind: "rect", b: -0.02, h: 0.02 })).toBe(false);
    expect(validate_profile_shape({ kind: "rect", b: 0, h: 0.02 })).toBe(false);
    expect(validate_profile_shape({ kind: "round", d: 0 })).toBe(false);
  });

  it("rejects a wall thickness at or past the half-cote it is cut from", () => {
    // e == h/2 collapses the inner rectangle to nothing; e > h/2 would invert it.
    expect(validate_profile_shape({ kind: "box", b: 0.02, h: 0.02, e: 0.01 })).toBe(false);
    expect(validate_profile_shape({ kind: "box", b: 0.02, h: 0.02, e: 0.011 })).toBe(false);
    expect(validate_profile_shape({ kind: "tube", d: 0.02, e: 0.01 })).toBe(false);
    expect(
      validate_profile_shape({ kind: "I", b: 0.02, h: 0.02, tw: 0.002, tf: 0.01 }),
    ).toBe(false);
    expect(
      validate_profile_shape({ kind: "I", b: 0.02, h: 0.02, tw: 0.02, tf: 0.002 }),
    ).toBe(false);
  });
});

describe("max_fiber_stress", () => {
  const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });

  it("pure traction (Mf = 0): |σ| = |N|/A", () => {
    expect(max_fiber_stress(1000, 0, section)).toBeCloseTo(1000 / section.A, 6);
    expect(max_fiber_stress(-1000, 0, section)).toBeCloseTo(1000 / section.A, 6);
  });

  it("pure bending (N = 0): |σ| = |Mf|·v/I", () => {
    expect(max_fiber_stress(0, 50, section)).toBeCloseTo((50 * section.v) / section.I, 6);
    expect(max_fiber_stress(0, -50, section)).toBeCloseTo((50 * section.v) / section.I, 6);
  });

  it("combines by adding magnitudes — the worse of the two fibres, whatever the signs", () => {
    // σ(±v) = N/A ± Mf·v/I; the worse fibre's magnitude is always |N/A| + |Mf|·v/I, regardless of which sign combination is fed in (max(|a+b|,|a−b|) = |a|+|b|).
    const expected = 1000 / section.A + (50 * section.v) / section.I;
    expect(max_fiber_stress(1000, 50, section)).toBeCloseTo(expected, 6);
    expect(max_fiber_stress(1000, -50, section)).toBeCloseTo(expected, 6);
    expect(max_fiber_stress(-1000, 50, section)).toBeCloseTo(expected, 6);
    expect(max_fiber_stress(-1000, -50, section)).toBeCloseTo(expected, 6);
  });
});

describe("max_shear_stress", () => {
  it("rect: τ_max = 1.5·T/A — the classic factor for a rectangular section", () => {
    const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });
    expect(max_shear_stress(1000, section)).toBeCloseTo(1.5 * (1000 / section.A), 6);
  });

  it("round: τ_max = 4·T/(3·A) — the classic factor for a solid circular section", () => {
    const section = section_properties({ kind: "round", d: 0.016 });
    expect(max_shear_stress(1000, section)).toBeCloseTo((4 / 3) * (1000 / section.A), 6);
  });

  it("sign of T does not matter — τ_max is a magnitude", () => {
    const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });
    expect(max_shear_stress(-1000, section)).toBeCloseTo(max_shear_stress(1000, section), 10);
  });
});

describe("beam_strength", () => {
  const material: MaterialDef = {
    id: MATERIAL_ID,
    name: "Acier",
    E: 210e9,
    Re: 250e6,
    rho: 7850,
  };
  const profile: ProfileDef = {
    id: PROFILE_ID,
    name: "20×20",
    shape: { kind: "rect", b: 0.02, h: 0.02 },
  };

  it("resolves the section and Re from the beam's own material/profile ids", () => {
    const result = beam_strength(MATERIAL_ID, PROFILE_ID, [material], [profile]);
    expect(result?.Re).toBe(250e6);
    expect(result?.section).toEqual(section_properties(profile.shape));
  });

  it("returns undefined for a dangling material or profile id", () => {
    expect(beam_strength(MISSING_ID, PROFILE_ID, [material], [profile])).toBeUndefined();
    expect(beam_strength(MATERIAL_ID, MISSING_ID, [material], [profile])).toBeUndefined();
  });
});
