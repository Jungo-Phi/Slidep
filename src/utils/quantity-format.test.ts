import { describe, expect, it } from "vitest";
import {
  ANGLE,
  ANGULAR_DAMPING,
  ANGULAR_VELOCITY,
  FORCE,
  LENGTH,
  MASS,
  MOMENT,
  SURFACE_MASS,
  DAMPING,
  DENSITY,
  INERTIA,
  PERCENT,
  STRESS,
  default_unit,
  deg_to_rad,
  kind_dimension,
  filter_quantity_input,
  is_entry_in_progress,
  display_unit,
  format_mantissa,
  format_quantity,
  parse_quantity,
  rad_to_deg,
  same_shown_value,
} from "./quantity-format";
import type { QuantityKind } from "./quantity-format";
import { parse_unit_symbol, same_dimension } from "./unit-algebra";

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
    // A value a live solver recomputes every frame routinely lands a hair off an exact power like 1 N·m instead of bit-exact on it — the bucket choice must not care.
    expect(format_quantity(0.9999999999999999, MOMENT, 0)).toBe("1 N·m");
    expect(format_quantity(1.0000000000000002, MOMENT, 0)).toBe("1 N·m");
  });

  it("prefixes the length factor mid-symbol too, where it is not the last one", () => {
    expect(format_quantity(0.001, ANGULAR_DAMPING, 0)).toBe("1 N·mm·s");
    expect(format_quantity(0.0000015, ANGULAR_DAMPING, 1)).toBe("1.5 N·µm·s");
    expect(format_quantity(1500, ANGULAR_DAMPING, 1)).toBe("1.5 kN·m·s");
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

  it("reads the length factor's prefix mid-symbol too ('N·mm·s')", () => {
    expect(
      parse_quantity("5N*mm*s", ANGULAR_DAMPING, default_unit(ANGULAR_DAMPING)),
    ).toBeCloseTo(0.005, 9);
  });

  it("reads an exponent typed as a caret, a bare digit, or the superscript itself", () => {
    // "m^2" and the bare "m2" both mean the same as "m²" — the exponent on "m", not "m" times 2.
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

describe("same_shown_value", () => {
  it("holds two values a solver left differing below the shown digit to be the same", () => {
    expect(same_shown_value(0.5, 0.5 + 1e-9, LENGTH)).toBe(true);
  });

  it("tells apart two values the field would show differently", () => {
    expect(same_shown_value(0.5, 0.5001, LENGTH)).toBe(false);
  });

  it("reads the precision it is given, not the value's own digits", () => {
    expect(same_shown_value(0.12, 0.1234, undefined, 1)).toBe(true);
    expect(same_shown_value(0.12, 0.1234, undefined, 3)).toBe(false);
  });

  it("separates two values an adaptive kind would not even show in the same unit", () => {
    expect(same_shown_value(0.9999, 1.0001, FORCE, 0)).toBe(false);
  });
});

describe("parse_quantity — how a number may be written", () => {
  it("reads a scientific exponent, with or without a unit behind it", () => {
    expect(parse_quantity("1.5e-3", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      1.5e-6,
      12,
    );
    expect(parse_quantity("2e3N", FORCE, default_unit(FORCE))).toBeCloseTo(
      2000,
      6,
    );
  });

  it("reads a decimal point with digits on only one side of it", () => {
    expect(parse_quantity("5.", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.005,
      9,
    );
    expect(parse_quantity(".5", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.0005,
      9,
    );
  });

  it("reads a comma as that decimal point", () => {
    expect(parse_quantity("7,8", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.0078,
      9,
    );
    expect(parse_quantity("1,5 cm", LENGTH, default_unit(LENGTH))).toBeCloseTo(
      0.015,
      9,
    );
  });

  it("still refuses a number it cannot finish reading", () => {
    expect(parse_quantity(".", LENGTH, default_unit(LENGTH))).toBeNull();
    expect(parse_quantity("1e", LENGTH, default_unit(LENGTH))).toBeNull();
  });
});

describe("filter_quantity_input", () => {
  it("drops what no entry could contain", () => {
    expect(filter_quantity_input("12#!mm", { unit: true })).toBe("12mm");
    expect(filter_quantity_input("12mm", {})).toBe("12");
  });

  it("shows a comma back as the decimal point it will be read as", () => {
    expect(filter_quantity_input("7,8", {})).toBe("7.8");
  });

  it("keeps a leading minus only where the field takes one", () => {
    expect(filter_quantity_input("-5", { signed: true })).toBe("-5");
    expect(filter_quantity_input("-5", {})).toBe("5");
  });

  it("keeps a minus that belongs to an exponent rather than to the field", () => {
    expect(filter_quantity_input("5min-1", { unit: true })).toBe("5min-1");
    expect(filter_quantity_input("1e-3", {})).toBe("1e-3");
  });

  it("leaves a single decimal point standing", () => {
    expect(filter_quantity_input("1.2.3", {})).toBe("1.23");
  });
});

describe("is_entry_in_progress", () => {
  it("holds a half-typed number to be unfinished rather than wrong", () => {
    for (const text of ["-", ".", "1e", "1e-"])
      expect(is_entry_in_progress(text)).toBe(true);
  });

  it("does not excuse an entry that is simply unreadable", () => {
    for (const text of ["abc", "5xyz", "1..2"])
      expect(is_entry_in_progress(text)).toBe(false);
  });
});

/** Every kind a field can be bound to, so the consistency check below covers the lot. */
const ALL_KINDS: [string, QuantityKind][] = [
  ["LENGTH", LENGTH],
  ["ANGLE", ANGLE],
  ["PERCENT", PERCENT],
  ["FORCE", FORCE],
  ["MASS", MASS],
  ["MOMENT", MOMENT],
  ["SURFACE_MASS", SURFACE_MASS],
  ["INERTIA", INERTIA],
  ["DAMPING", DAMPING],
  ["ANGULAR_DAMPING", ANGULAR_DAMPING],
  ["STRESS", STRESS],
  ["DENSITY", DENSITY],
  ["ANGULAR_VELOCITY", ANGULAR_VELOCITY()],
];

/** Spellings the algebra is not meant to reach, and why.
 * "rpm" is a word rather than a product of symbols; "min-1" and "s-1" name only the time a revolution is counted over, the revolution itself being implicit, so read literally they carry the wrong dimension. */
const CONVENTIONS = new Set(["rpm", "min-1", "min⁻¹", "s-1", "s⁻¹"]);

describe("unit algebra against the kinds' own tables", () => {
  it("agrees with every factor written by hand", () => {
    for (const [name, kind] of ALL_KINDS) {
      const dimension = kind_dimension(kind);
      expect(dimension, name).not.toBeNull();
      for (const unit of kind.units) {
        if (CONVENTIONS.has(unit.symbol)) continue;
        const parsed = parse_unit_symbol(unit.symbol);
        expect(parsed, `${name} / ${unit.symbol}`).not.toBeNull();
        // To the bit, not merely close: a factor a decade off in its last digits is what makes retyping a value in another unit look like an edit.
        expect(parsed!.factor, `${name} / ${unit.symbol}`).toBe(unit.factor);
        expect(
          same_dimension(parsed!.dim, dimension!),
          `${name} / ${unit.symbol}`,
        ).toBe(true);
      }
    }
  });
});

describe("parse_quantity — a unit the kind never listed", () => {
  it("reads a density however its two halves are prefixed", () => {
    const perM3 = (text: string) =>
      parse_quantity(text, DENSITY, default_unit(DENSITY));
    expect(perM3("1T/m3")).toBeCloseTo(1000, 6);
    expect(perM3("1mg/cm3")).toBeCloseTo(1, 6);
    expect(perM3("1kg/dm3")).toBeCloseTo(1000, 6);
    expect(perM3("1g/L")).toBeCloseTo(1, 6);
  });

  it("reads a stress in the unit a datasheet prints it in", () => {
    expect(parse_quantity("1N/mm2", STRESS, default_unit(STRESS))).toBeCloseTo(
      1e6,
      0,
    );
  });

  it("reads a damping through the equivalence its own base unit rests on", () => {
    expect(parse_quantity("3N*s/m", DAMPING, default_unit(DAMPING))).toBeCloseTo(
      3,
      6,
    );
  });

  it("reads the tonne as the SI spells it, next to the app's own", () => {
    expect(parse_quantity("2t", MASS, default_unit(MASS))).toBeCloseTo(2000, 6);
    expect(parse_quantity("2T", MASS, default_unit(MASS))).toBeCloseTo(2000, 6);
  });

  it("reads a prefix too fine for the display ladder to ever print", () => {
    expect(parse_quantity("5dm", LENGTH, default_unit(LENGTH))).toBeCloseTo(0.5, 9);
    expect(parse_quantity("5daN", FORCE, default_unit(FORCE))).toBeCloseTo(50, 6);
  });

  it("reads an inertia written the way it is stored", () => {
    expect(parse_quantity("4kg*m2", INERTIA, default_unit(INERTIA))).toBeCloseTo(
      4,
      6,
    );
  });

  it("refuses a unit that measures something else", () => {
    expect(parse_quantity("5m", FORCE, default_unit(FORCE))).toBeNull();
    expect(parse_quantity("5kg", LENGTH, default_unit(LENGTH))).toBeNull();
  });

  it("keeps an angle out of a field holding a bare fraction", () => {
    expect(parse_quantity("45deg", PERCENT, default_unit(PERCENT))).toBeNull();
  });

  it("leaves a conventional spelling the reading its own kind gives it", () => {
    expect(
      parse_quantity("60min-1", ANGULAR_VELOCITY(), default_unit(ANGULAR_VELOCITY())),
    ).toBeCloseTo(2 * Math.PI, 9);
  });
});

describe("a value retyped in another unit", () => {
  it("lands on the very double the first spelling did", () => {
    const d = default_unit(DENSITY);
    for (const [a, b] of [
      ["15 g/cm3", "15 T/m^3"],
      ["20 kg/m3", "20 mg/cm3"],
      ["2.7 g/cm3", "2.7 kg/dm3"],
      ["1 kg/m3", "1 g/L"],
    ])
      expect(parse_quantity(a, DENSITY, d), `${a} vs ${b}`).toBe(
        parse_quantity(b, DENSITY, d),
      );
  });
});
