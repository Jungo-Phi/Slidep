import { describe, expect, it } from "vitest";
import {
  ANGLE,
  ANGULAR_VELOCITY,
  FORCE,
  LENGTH,
  MASS,
  MOMENT,
  SURFACE_MASS,
  default_unit,
  deg_to_rad,
  display_unit,
  format_mantissa,
  format_quantity,
  parse_quantity,
  rad_to_deg,
} from "./quantity-format";

describe("format_quantity — fixed kinds", () => {
  it("shows a length in millimetres, whatever the mechanism's own scale", () => {
    expect(format_quantity(0.04, LENGTH, 0)).toBe("40 mm");
    expect(format_quantity(1.5, LENGTH, 0)).toBe("1500 mm");
    expect(format_quantity(0.001, LENGTH, 0)).toBe("1 mm");
  });

  it("shows an angle in degrees", () => {
    expect(format_quantity(Math.PI, ANGLE, 0)).toBe("180 deg");
    expect(format_quantity(Math.PI / 2, ANGLE, 0)).toBe("90 deg");
  });
});

describe("format_quantity — adaptive kinds", () => {
  it("picks the SI prefix keeping the mantissa in [1, 1000)", () => {
    expect(format_quantity(5, FORCE, 0)).toBe("5 N");
    expect(format_quantity(150_000, FORCE, 0)).toBe("150 kN");
    expect(format_quantity(0.5, FORCE, 0)).toBe("500 mN");
  });

  it("lands exactly on a decade boundary in the coarser bucket", () => {
    expect(format_quantity(999, FORCE, 0)).toBe("999 N");
    expect(format_quantity(1000, FORCE, 0)).toBe("1 kN");
    expect(format_quantity(1_000_000, FORCE, 0)).toBe("1 MN");
  });

  it("floors and caps the ladder rather than inventing a further prefix", () => {
    expect(format_quantity(1e-15, FORCE, 9)).toBe("0.000001 nN");
    expect(format_quantity(1e15, FORCE, 0)).toBe("1000000 GN");
  });

  it("shows zero in the base unit, not an arbitrary prefix", () => {
    expect(format_quantity(0, FORCE, 0)).toBe("0 N");
  });
});

describe("format_quantity — MOMENT's compound unit", () => {
  it("prefixes the whole symbol for a multiple, like any other adaptive kind", () => {
    expect(format_quantity(1500, MOMENT, 1)).toBe("1.5 kN·m");
    expect(format_quantity(2_500_000, MOMENT, 1)).toBe("2.5 MN·m");
  });

  it("prefixes the length factor, not the whole symbol, for a submultiple", () => {
    expect(format_quantity(0.001, MOMENT, 0)).toBe("1 N·mm");
    expect(format_quantity(0.0000015, MOMENT, 1)).toBe("1.5 N·µm");
  });

  it("doesn't flip the whole unit for a value a ULP off a bucket edge", () => {
    // A value a live solver recomputes every frame routinely lands a hair off an exact
    // power like 1 N·m instead of bit-exact on it — the bucket choice must not care.
    expect(format_quantity(0.9999999999999999, MOMENT, 0)).toBe("1 N·m");
    expect(format_quantity(1.0000000000000002, MOMENT, 0)).toBe("1 N·m");
  });
});

describe("parse_quantity — fixed kinds", () => {
  it("reads a bare number in the fallback unit", () => {
    expect(parse_quantity("40", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.04,
      9,
    );
  });

  it("reads an explicit unit regardless of the fallback", () => {
    expect(parse_quantity("1.5m", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      1.5,
      9,
    );
    expect(parse_quantity("3cm", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.03,
      9,
    );
    expect(parse_quantity("2km", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      2000,
      9,
    );
  });

  it("tolerates a space between the number and the unit", () => {
    expect(parse_quantity("12 mm", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.012,
      9,
    );
  });

  it("rejects an unrecognised unit rather than guessing", () => {
    expect(parse_quantity("40xyz", LENGTH, default_unit(LENGTH))).toBeNull();
    expect(parse_quantity("40MM", LENGTH, default_unit(LENGTH))).toBeNull();
  });

  it("rejects unreadable text", () => {
    expect(parse_quantity("", LENGTH, default_unit(LENGTH))).toBeNull();
    expect(parse_quantity("abc", LENGTH, default_unit(LENGTH))).toBeNull();
  });

  it("still reads the degree sign, even though it no longer displays it", () => {
    expect(parse_quantity("45°", ANGLE, default_unit(ANGLE))).toBeCloseTo(
      Math.PI / 4,
      9,
    );
  });
});

describe("format_mantissa", () => {
  it("drops the unit a fixed kind would otherwise show", () => {
    expect(format_mantissa(0.04, LENGTH, 0)).toBe("40");
  });

  it("still adapts an adaptive kind's mantissa to its own prefix, just unlabelled", () => {
    expect(format_mantissa(150_000, FORCE, 0)).toBe("150");
  });
});

describe("deg_to_rad / rad_to_deg", () => {
  it("round-trip", () => {
    expect(rad_to_deg(deg_to_rad(45))).toBeCloseTo(45, 9);
    expect(deg_to_rad(180)).toBeCloseTo(Math.PI, 9);
  });
});

describe("parse_quantity — adaptive kinds", () => {
  it("reads a bare number in the field's own currently-displayed unit", () => {
    // A field showing 150 kN: typing "200" means 200 kN, not 200 N.
    const kN = { symbol: "kN", factor: 1000 };
    expect(parse_quantity("200", FORCE, kN)).toBeCloseTo(200_000, 6);
  });

  it("reads an explicit SI-prefixed unit regardless of the fallback", () => {
    expect(parse_quantity("150kN", FORCE, default_unit(FORCE))).toBeCloseTo(
      150_000,
      6,
    );
    expect(parse_quantity("0.5MN", FORCE, default_unit(FORCE))).toBeCloseTo(
      500_000,
      6,
    );
    expect(parse_quantity("3N", FORCE, default_unit(FORCE))).toBeCloseTo(3, 6);
  });
});

describe("format_quantity — mass's tonne renaming", () => {
  it("prefixes on the gram below the tonne", () => {
    expect(format_quantity(1, MASS, 0)).toBe("1 kg");
    expect(format_quantity(0.0005, MASS, 0)).toBe("500 mg");
  });

  it("earns the tonne's own name instead of stacking further gram prefixes", () => {
    expect(format_quantity(1000, MASS, 0)).toBe("1 T"); // 1000 kg, the "Mg" slot
    expect(format_quantity(1_000_000, MASS, 0)).toBe("1 kT"); // 1e6 kg, the "Gg" slot
  });
});

describe("parse_quantity — loosened unit spellings", () => {
  it("reads a compound unit's middle dot typed as '*' or left out", () => {
    expect(parse_quantity("5N*m", MOMENT, default_unit(MOMENT))).toBeCloseTo(
      5,
      9,
    );
    expect(parse_quantity("5Nm", MOMENT, default_unit(MOMENT))).toBeCloseTo(
      5,
      9,
    );
    expect(parse_quantity("5kNm", MOMENT, default_unit(MOMENT))).toBeCloseTo(
      5000,
      9,
    );
  });

  it("reads a submultiple moment typed as the length factor's prefix ('N·mm')", () => {
    expect(parse_quantity("5N*mm", MOMENT, default_unit(MOMENT))).toBeCloseTo(
      0.005,
      9,
    );
    expect(parse_quantity("5Nmm", MOMENT, default_unit(MOMENT))).toBeCloseTo(
      0.005,
      9,
    );
  });

  it("reads an exponent typed as a caret, a bare digit, or the superscript itself", () => {
    // "m^2" and the bare "m2" both mean the same as "m²" — the exponent on "m", not "m"
    // times 2.
    expect(
      parse_quantity("5g/m^2", SURFACE_MASS, default_unit(SURFACE_MASS)),
    ).toBeCloseTo(5e-3, 9);
    expect(
      parse_quantity("5g/m2", SURFACE_MASS, default_unit(SURFACE_MASS)),
    ).toBeCloseTo(5e-3, 9);
    // "s^-1" means the same as "s⁻¹" — per second — not "s" times "-1".
    expect(
      parse_quantity(
        "5s^-1",
        ANGULAR_VELOCITY(),
        default_unit(ANGULAR_VELOCITY()),
      ),
    ).toBeCloseTo(5 * 2 * Math.PI, 9);
  });

  it("does not read a caret as standing in for a compound unit's middle dot", () => {
    // Unlike "*", "^" is a power, not a multiplication — "N^m" is not "N·m".
    expect(parse_quantity("5N^m", MOMENT, default_unit(MOMENT))).toBeNull();
  });

  it("reads the micro prefix typed as 'u' or the Greek 'μ'", () => {
    expect(parse_quantity("5uN", FORCE, default_unit(FORCE))).toBeCloseTo(
      5e-6,
      12,
    );
    expect(parse_quantity("5μN", FORCE, default_unit(FORCE))).toBeCloseTo(
      5e-6,
      12,
    );
  });

  it("reads a tonne typed as 'T' or 'kT'", () => {
    expect(parse_quantity("2T", MASS, default_unit(MASS))).toBeCloseTo(
      2000,
      9,
    );
    expect(parse_quantity("3kT", MASS, default_unit(MASS))).toBeCloseTo(
      3_000_000,
      9,
    );
  });

  it("still rejects an unrecognised unit", () => {
    expect(parse_quantity("5xyz", MOMENT, default_unit(MOMENT))).toBeNull();
  });
});

describe("round-trip", () => {
  it("formatting then parsing a value back lands within its own rounding", () => {
    for (const valueSI of [0.04, 1.5, 12_345, 0.0007]) {
      const unit = display_unit(valueSI, FORCE);
      const text = format_quantity(valueSI, FORCE, 4);
      const parsed = parse_quantity(text, FORCE, unit);
      expect(parsed).toBeCloseTo(valueSI, 3);
    }
  });
});
