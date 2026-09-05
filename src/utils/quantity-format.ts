/**
 * Formatting and parsing for numbers that carry a physical unit, shared by every input that
 * edits one — the properties panel's `NumberInput` and the canvas's `OnCanvasValueEditor`.
 *
 * A value is always stored and passed around in SI (metres, radians, newtons, kilograms…).
 * Display and parsing convert at the edge, the same way `viewport.ts` is the only place
 * screen and world coordinates cross.
 */

import { t } from "../i18n";

/** What a plain number is read in: itself, unlabelled. */
const RAW_UNIT: QuantityUnit = { symbol: "", factor: 1 };

const SI_PREFIXES: { exp: number; symbol: string }[] = [
  { exp: -9, symbol: "n" },
  { exp: -6, symbol: "µ" },
  { exp: -3, symbol: "m" },
  { exp: 0, symbol: "" },
  { exp: 3, symbol: "k" },
  { exp: 6, symbol: "M" },
  { exp: 9, symbol: "G" },
];

/** A unit a quantity may be entered in: `valueSI = mantissa * factor`. */
export interface QuantityUnit {
  symbol: string;
  factor: number;
}

export interface QuantityKind {
  /**
   * Fixed: always shown and, absent an explicit unit in the input, always read in `units[0]`
   * — length and angle, whose values live in one narrow, human-familiar range regardless of
   * mechanism size.
   *
   * Adaptive: display picks whichever SI prefix on `baseUnit` keeps the mantissa in
   * [1, 1000) — force, stiffness, mass… whose values can land anywhere across many decades
   * depending on the mechanism, so no single fixed unit stays readable throughout.
   */
  adaptive: boolean;
  /** Tried in listed order for a typed unit — longest/most specific symbols first, so "mm"
   *  matches before a bare "m" would. `units[0]` is what a bare number (no unit typed) means,
   *  and what a fixed kind always displays in. Ignored (beyond `[0]`) by an adaptive kind,
   *  which generates its own ladder from `units[0].symbol` as the SI base unit. */
  units: QuantityUnit[];
  /** Where an adaptive kind's prefix ladder earns a name of its own rather than going on
   *  stacking SI prefixes on the same base symbol — mass does, at the tonne: 1e6 g (the "Mg"
   *  slot) reads "T", 1e9 g ("Gg") reads "kT". From `exp` up, `display_unit` restarts the
   *  ladder on `symbol` instead of `units[0].symbol`. */
  renamedFrom?: { exp: number; symbol: string };
  /** For a compound base unit (force times length — "N·m"), the suffix a submultiple decade
   *  prefixes instead of the whole symbol: a small moment reads "N·mm", never "mN·m" — the
   *  physical convention prefixes the length factor down, never the force factor. Multiples
   *  still prefix the whole symbol as usual ("kN·m"), so this only changes negative `exp`. */
  submultipleOnSuffix?: string;
}

export const LENGTH: QuantityKind = {
  adaptive: false,
  units: [
    { symbol: "mm", factor: 1e-3 },
    { symbol: "m", factor: 1 },
    { symbol: "cm", factor: 1e-2 },
    { symbol: "km", factor: 1e3 },
    { symbol: "µm", factor: 1e-6 },
  ],
};

export const ANGLE: QuantityKind = {
  adaptive: false,
  // "deg" first: what a field displays and, typed bare, what it reads — easier to type and
  // read than "°" (no dead key, no ambiguity with a stray degree sign), which still parses.
  units: [
    { symbol: "deg", factor: Math.PI / 180 },
    { symbol: "°", factor: Math.PI / 180 },
    { symbol: "rad", factor: 1 },
  ],
};

/** `SnapSettings.angleStep` is the one stored field left that holds degrees directly rather
 *  than SI radians — a snap-corridor setting, not a mechanism measurement, and internally
 *  consistent wherever it's read, so it hasn't followed the rest. Convert at its one display
 *  boundary (`SettingsMenu`) with these; a live, degree-native computation feeding a
 *  radian-storing field (angle placement, its on-canvas preview) also crosses through them. */
export const deg_to_rad = (deg: number): number => (deg * Math.PI) / 180;
export const rad_to_deg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * `angleRad` folded into [0, 2π) — a compass heading, not a signed turn. `Point2.angle()`
 * answers `atan2`'s own [-π, π], which a direction field displays as its positive equivalent
 * instead: showing 315° rather than -45° for a field meant to read as an orientation.
 */
export function wrap_angle_rad(angleRad: number): number {
  const tau = 2 * Math.PI;
  return ((angleRad % tau) + tau) % tau;
}

const adaptive = (baseSymbol: string, baseFactor: number = 1): QuantityKind => ({
  adaptive: true,
  units: [{ symbol: baseSymbol, factor: baseFactor }],
});

export const FORCE = adaptive("N");
export const LINEAR_VELOCITY = adaptive("m/s");
export const POWER = adaptive("W");
export const ENERGY = adaptive("J");
export const MOMENT: QuantityKind = {
  ...adaptive("N·m"),
  submultipleOnSuffix: "m",
};
export const STIFFNESS = adaptive("N/m");
/** N·s/m reduces to kg/s — a mass per time, same family as `MASS` rather than `STIFFNESS`.
 *  Prefixed on the gram like `MASS`, for the same reason: "kg" already carries "kilo". */
export const DAMPING: QuantityKind = adaptive("g/s", 1e-3);
/** A distributed load's intensity — same unit as `STIFFNESS`, kept distinct so a caller
 *  names what the field actually is. */
export const LOAD_INTENSITY = adaptive("N/m");
/** Prefixed on the gram, not the kilogram `valueSI` is actually stored in — "kg" already
 *  carries the "kilo" prefix, so prefixing it further would print "mkg" where "g" belongs.
 *  Past 1e6 g the ladder earns the tonne's own name instead of stacking further prefixes on
 *  "g" — see `renamedFrom`. */
export const MASS: QuantityKind = {
  ...adaptive("g", 1e-3),
  renamedFrom: { exp: 6, symbol: "T" },
};
export const LINEAR_MASS: QuantityKind = {
  ...adaptive("g/m", 1e-3),
  renamedFrom: { exp: 6, symbol: "T/m" },
};
export const SURFACE_MASS: QuantityKind = {
  ...adaptive("g/m²", 1e-3),
  renamedFrom: { exp: 6, symbol: "T/m²" },
};

/** A rotational inertia (SI kg·m²), prefixed on the gram like `MASS` for the same reason. No
 *  `submultipleOnSuffix`: prefixing the "m²" down a decade would scale it by 1e-6, not 1e-3. */
export const INERTIA: QuantityKind = {
  ...adaptive("g·m²", 1e-3),
  renamedFrom: { exp: 6, symbol: "T·m²" },
};
export const STRESS = adaptive("Pa");
/** Fixed, not adaptive: material densities span a narrow range (~0.9 to ~20 g/cm³) that stays
 *  readable in one unit, unlike `MASS` or `FORCE` which can land anywhere across many decades.
 *  `valueSI` is stored in kg/m³; "kg/m³" itself still parses as an alternate typed unit. */
export const DENSITY: QuantityKind = {
  adaptive: false,
  units: [
    { symbol: "g/cm³", factor: 1000 },
    { symbol: "kg/m³", factor: 1 },
  ],
};

/**
 * A motor's speed — the one quantity whose unit symbol is localised (`unit_rpm`): "tr/min",
 * "rpm", "U/min" depending on language, unlike every SI symbol elsewhere, which is the same
 * word in all four. A function, not a constant, so it re-reads the current language on every
 * call rather than freezing whichever was active at module load. Every language's spelling
 * still parses regardless of which is active, the same way `ANGLE` accepts "rad" typed over
 * its own default "deg".
 */
const PER_MINUTE = (2 * Math.PI) / 60;
const PER_SECOND = 2 * Math.PI;

export const ANGULAR_VELOCITY = (): QuantityKind => ({
  adaptive: false,
  units: [
    { symbol: t("unit_rpm"), factor: PER_MINUTE },
    // Revolutions per minute: French, English, German spellings, plus the physicist's
    // "min⁻¹" (a revolution is implicit — the unit only names the time it's counted
    // over), in both its typeable ("min-1") and true-superscript form.
    { symbol: "tr/min", factor: PER_MINUTE },
    { symbol: "rpm", factor: PER_MINUTE },
    { symbol: "U/min", factor: PER_MINUTE },
    { symbol: "min-1", factor: PER_MINUTE },
    { symbol: "min⁻¹", factor: PER_MINUTE },
    // The same family, per second instead of per minute.
    { symbol: "tr/s", factor: PER_SECOND },
    { symbol: "rev/s", factor: PER_SECOND },
    { symbol: "U/s", factor: PER_SECOND },
    { symbol: "s-1", factor: PER_SECOND },
    { symbol: "s⁻¹", factor: PER_SECOND },
    { symbol: "rad/s", factor: 1 },
  ],
});

/** The unit a fixed kind always displays in, or an adaptive kind's SI base unit. */
export function default_unit(kind: QuantityKind): QuantityUnit {
  return kind.units[0];
}

/**
 * `valueSI` split into a mantissa and the unit it is worth showing in: `units[0]` for a
 * fixed kind, or whichever SI-prefixed unit of an adaptive one keeps the mantissa in
 * [1, 1000) — the same bucket `format_graduation` picks a ruler label from, generalised to
 * any base unit instead of just length.
 */
export function display_unit(
  valueSI: number,
  kind: QuantityKind,
): QuantityUnit {
  const base = default_unit(kind);
  if (!kind.adaptive) return base;
  // In units of `base`, not of `valueSI` — the two coincide everywhere but `MASS`, whose
  // base (the gram) isn't the unit `valueSI` is actually stored in (the kilogram).
  const magnitude = Math.abs(valueSI) / base.factor;
  // A diverging solver can feed a NaN/Infinity value through here — fall back to the base
  // unit rather than let an unbucketable exponent reach the `SI_PREFIXES.find` below.
  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return { symbol: base.symbol, factor: base.factor };
  }
  // Rounded before the bucket is picked, not for the mantissa itself: `floor` is
  // discontinuous exactly at a bucket edge, so a magnitude landing a single ULP under a
  // round one (1 N·m read back as 0.9999999999999999, say — routine for a value a live
  // solver recomputes every frame) would otherwise flip the whole unit rather than just its
  // last displayed digit. Nine significant digits is far below any precision a caller ever
  // displays and far above the noise floor of an iterative double-precision solver, so a
  // genuinely different value is never affected — only a bucket edge is.
  const roundedMagnitude = Number(magnitude.toPrecision(9));
  const exp = Math.max(
    SI_PREFIXES[0].exp,
    Math.min(
      SI_PREFIXES[SI_PREFIXES.length - 1].exp,
      Math.floor(Math.log10(roundedMagnitude) / 3) * 3,
    ),
  );
  const rename = kind.renamedFrom;
  if (rename && exp >= rename.exp) {
    const prefix = SI_PREFIXES.find((p) => p.exp === exp - rename.exp)!;
    return {
      symbol: `${prefix.symbol}${rename.symbol}`,
      factor: 10 ** exp * base.factor,
    };
  }
  const prefix = SI_PREFIXES.find((p) => p.exp === exp)!;
  if (exp < 0 && kind.submultipleOnSuffix) {
    const stem = base.symbol.slice(0, -kind.submultipleOnSuffix.length);
    return {
      symbol: `${stem}${prefix.symbol}${kind.submultipleOnSuffix}`,
      factor: 10 ** exp * base.factor,
    };
  }
  return { symbol: `${prefix.symbol}${base.symbol}`, factor: 10 ** exp * base.factor };
}

/** `valueSI` as a mantissa in `unit`, rounded to `precision` decimal places. */
export function to_mantissa(
  valueSI: number,
  unit: QuantityUnit,
  precision: number,
): number {
  const scaled = valueSI / unit.factor;
  return Math.round(scaled * 10 ** precision) / 10 ** precision;
}

/**
 * `valueSI` formatted for display: the mantissa in whichever unit `kind` shows it in, the
 * unit's symbol after a space.
 */
export function format_quantity(
  valueSI: number,
  kind: QuantityKind,
  precision = 2,
): string {
  const unit = display_unit(valueSI, kind);
  return `${to_mantissa(valueSI, unit, precision)} ${unit.symbol}`;
}

/**
 * Whether two SI values are indistinguishable in a field showing `kind` at `precision` — the
 * only sense in which several elements can be said to agree on a value.
 *
 * Comparing the doubles instead answers a question nobody asked: a solver leaves two lengths it
 * was told to make equal differing in their last bits, and a field would then have to claim they
 * are mixed while showing the same number for each of them.
 */
export function same_shown_value(
  a: number,
  b: number,
  kind?: QuantityKind,
  precision = 1,
): boolean {
  const unitA = kind ? display_unit(a, kind) : RAW_UNIT;
  const unitB = kind ? display_unit(b, kind) : RAW_UNIT;
  return (
    unitA.symbol === unitB.symbol &&
    to_mantissa(a, unitA, precision) === to_mantissa(b, unitB, precision)
  );
}

/**
 * `valueSI`'s mantissa alone, no unit symbol — a permanent on-canvas length dimension, say,
 * where the unit is fixed and known (mm) and showing it on every single label would only be
 * noise. Reserved for a `kind` whose reader already knows the unit without being told; an
 * adaptive kind's unit is informative (it says which decade the value is in) and should keep
 * using `format_quantity` instead.
 */
export function format_mantissa(
  valueSI: number,
  kind: QuantityKind,
  precision = 2,
): string {
  return to_mantissa(valueSI, display_unit(valueSI, kind), precision).toString();
}

/** The ASCII digit (or "-") each superscript character in a unit symbol like "g/m²" or "s⁻¹"
 *  stands for — the far side of the fold `loose` applies to a typed exponent, superscript or
 *  caret alike, so every spelling of one converges on the same plain digits. */
const SUPERSCRIPT_TO_ASCII: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
};

/**
 * Loosens a typed unit toward however the app actually prints it, so a plain keyboard reaches
 * the same match a copy-pasted symbol would: "u" and the Greek "μ" both reach the micro sign
 * "µ" our prefixes use (no collision — no unit symbol otherwise contains a bare "u"), a caret
 * exponent ("^2", "^-1") and the superscript it stands for ("²", "⁻¹") both fold to their
 * plain digits, and "*" stands in for the "·" between two multiplied units ("N*m" reaches
 * "N·m"). A caret is never itself read as that "·" stand-in — a power is not a multiplication,
 * so "N^m" reaches neither "N·m" nor anything else. Applied to both sides of a comparison,
 * never to what gets displayed.
 */
function loose(symbol: string): string {
  return symbol
    .replace(/[uμ]/g, "µ")
    .replace(/\^(-?[0-9]+)/g, "$1")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => SUPERSCRIPT_TO_ASCII[c])
    .replace(/[·*]/g, "");
}

/**
 * Reads free text typed against `kind` back into SI — "12", "12mm", "1.2 cm" all parse
 * against `LENGTH`, the bare form read in `fallbackUnit` (the field's own currently-displayed
 * unit, since that is what an unmarked number means while editing it — never always
 * `units[0]`, or an adaptive field would silently reinterpret "150" typed to overwrite a
 * value it is showing in kN as 150 N). `null` when nothing usable was typed.
 *
 * Unit matching is case-sensitive past `loose`'s leniencies: "MM" or "Mm" fall through to no
 * match, same as an unrecognised word — silently guessing at a typo would risk a value ten
 * decades off whatever the actual intent was.
 */
export function parse_quantity(
  text: string,
  kind: QuantityKind,
  fallbackUnit: QuantityUnit,
): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(-?[0-9]*\.?[0-9]+)\s*(.*)$/);
  if (!match) return null;
  const mantissa = parseFloat(match[1]);
  if (isNaN(mantissa)) return null;
  const typedUnit = match[2].trim();
  if (typedUnit === "") return mantissa * fallbackUnit.factor;

  if (!kind.adaptive) {
    const unit = kind.units.find((u) => loose(u.symbol) === loose(typedUnit));
    return unit ? mantissa * unit.factor : null;
  }
  const base = default_unit(kind);
  if (loose(typedUnit) === loose(base.symbol)) return mantissa * base.factor;
  const prefix = SI_PREFIXES.find(
    (p) => p.symbol !== "" && loose(`${p.symbol}${base.symbol}`) === loose(typedUnit),
  );
  if (prefix) return mantissa * 10 ** prefix.exp * base.factor;

  if (kind.submultipleOnSuffix) {
    const stem = base.symbol.slice(0, -kind.submultipleOnSuffix.length);
    const suffixPrefix = SI_PREFIXES.find(
      (p) =>
        p.exp < 0 &&
        loose(`${stem}${p.symbol}${kind.submultipleOnSuffix}`) === loose(typedUnit),
    );
    if (suffixPrefix) return mantissa * 10 ** suffixPrefix.exp * base.factor;
  }

  const rename = kind.renamedFrom;
  if (!rename) return null;
  if (loose(typedUnit) === loose(rename.symbol))
    return mantissa * 10 ** rename.exp * base.factor;
  const renamedPrefix = SI_PREFIXES.find(
    (p) =>
      p.symbol !== "" &&
      loose(`${p.symbol}${rename.symbol}`) === loose(typedUnit),
  );
  return renamedPrefix
    ? mantissa * 10 ** (renamedPrefix.exp + rename.exp) * base.factor
    : null;
}
