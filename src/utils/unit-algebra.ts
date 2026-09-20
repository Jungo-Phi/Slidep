/**
 * Decomposes a unit symbol nobody wrote down — "T/m³", "mg/cm³", "N/mm²" — into the base dimensions it is built from, so a field can accept any spelling that is dimensionally what it holds instead of only the ones its `QuantityKind` happens to list.
 *
 * Backs `parse_quantity` up rather than replacing its lists: a kind's own `units` are tried first, so a convention no algebra can see ("min⁻¹" meaning revolutions per minute, the revolution left implicit) keeps the reading its list gives it.
 */

/** The ASCII digit (or "-") each superscript character in a unit symbol like "g/m²" or "s⁻¹" stands for — the far side of the fold applied to a typed exponent, superscript or caret alike, so every spelling of one converges on the same plain digits. */
export const SUPERSCRIPT_TO_ASCII: Record<string, string> = {
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
 * Exponents of the four base dimensions every quantity here is built from: mass, length, time, angle.
 * The angle is one of them, unorthodox as that is for a ratio of two lengths: without it an angle and a percentage would both be dimensionless, and a field holding one would take the other — 45° read as 0.785 of something.
 */
export type Dimension = readonly [m: number, l: number, t: number, a: number];

const SCALAR: Dimension = [0, 0, 0, 0];
const KILOGRAM: Dimension = [1, 0, 0, 0];
const METRE: Dimension = [0, 1, 0, 0];
const SECOND: Dimension = [0, 0, 1, 0];
const RADIAN: Dimension = [0, 0, 0, 1];
const NEWTON: Dimension = [1, 1, -2, 0];

/**
 * Every unit symbol that is not a prefixed form of another one: one of it is worth `factor * 10 ** exp` in SI.
 * The power of ten is held apart from the factor, and applied once at the very end, so a product of prefixed units lands on exactly the value its decade says it should — "mg/cm³" is one kg/m³ and not a double's width under it, which is what lets a field see a unit retyped over an equal value for the non-edit it is.
 */
const ATOMS: Record<string, { factor: number; exp: number; dim: Dimension }> = {
  // Mass is prefixed on the gram, the unit an app storing kilograms still displays in — "kg" already carries a prefix, and stacking a second one would print "mkg" where "g" belongs.
  g: { factor: 1, exp: -3, dim: KILOGRAM },
  t: { factor: 1, exp: 3, dim: KILOGRAM },
  // The tonne as this app spells it, alongside the SI's own lowercase.
  T: { factor: 1, exp: 3, dim: KILOGRAM },
  m: { factor: 1, exp: 0, dim: METRE },
  // The litre, a volume that is not spelled as a length cubed.
  L: { factor: 1, exp: -3, dim: [0, 3, 0, 0] },
  s: { factor: 1, exp: 0, dim: SECOND },
  min: { factor: 60, exp: 0, dim: SECOND },
  h: { factor: 3600, exp: 0, dim: SECOND },
  N: { factor: 1, exp: 0, dim: NEWTON },
  Pa: { factor: 1, exp: 0, dim: [1, -1, -2, 0] },
  J: { factor: 1, exp: 0, dim: [1, 2, -2, 0] },
  W: { factor: 1, exp: 0, dim: [1, 2, -3, 0] },
  rad: { factor: 1, exp: 0, dim: RADIAN },
  deg: { factor: Math.PI / 180, exp: 0, dim: RADIAN },
  "°": { factor: Math.PI / 180, exp: 0, dim: RADIAN },
  // One revolution, in the three spellings the app's languages give it.
  tr: { factor: 2 * Math.PI, exp: 0, dim: RADIAN },
  rev: { factor: 2 * Math.PI, exp: 0, dim: RADIAN },
  U: { factor: 2 * Math.PI, exp: 0, dim: RADIAN },
  "%": { factor: 1, exp: -2, dim: SCALAR },
};

/**
 * Every prefix a unit may be typed with.
 * Wider than the `SI_PREFIXES` ladder `display_unit` picks from, which only steps by three decades: nobody wants to read a length printed in decimetres, but plenty of people type one.
 */
const PREFIXES: { symbol: string; exp: number }[] = [
  { symbol: "n", exp: -9 },
  { symbol: "µ", exp: -6 },
  { symbol: "m", exp: -3 },
  { symbol: "c", exp: -2 },
  { symbol: "d", exp: -1 },
  { symbol: "da", exp: 1 },
  { symbol: "h", exp: 2 },
  { symbol: "k", exp: 3 },
  { symbol: "M", exp: 6 },
  { symbol: "G", exp: 9 },
];

/**
 * Folds a typed symbol toward the one spelling the tables below are written in, so a plain keyboard reaches the same match a copy-pasted symbol would.
 * The middle dot survives as a separator here, unlike in `parse_quantity`'s own comparison where it is dropped: a product of atoms is what this reads.
 */
function normalise(symbol: string): string {
  return symbol
    .replace(/[uμ]/g, "µ")
    .replace(/\^(-?[0-9]+)/g, "$1")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => SUPERSCRIPT_TO_ASCII[c])
    .replace(/\*/g, "·")
    .replace(/\s+/g, "");
}

/** The longest atom, prefixed or bare, that `text` starts with at `at`.
 * Longest rather than first: "mm" is a millimetre, not a metre trailed by a stray "m", while "min" is a minute and not a milli-anything. */
function longest_atom(
  text: string,
  at: number,
): { factor: number; exp: number; dim: Dimension; length: number } | null {
  let best: { factor: number; exp: number; dim: Dimension; length: number } | null =
    null;
  for (const [symbol, atom] of Object.entries(ATOMS)) {
    if (text.startsWith(symbol, at) && (best === null || symbol.length > best.length))
      best = { ...atom, length: symbol.length };
    for (const prefix of PREFIXES) {
      const spelled = `${prefix.symbol}${symbol}`;
      if (text.startsWith(spelled, at) && (best === null || spelled.length > best.length))
        best = {
          factor: atom.factor,
          exp: atom.exp + prefix.exp,
          dim: atom.dim,
          length: spelled.length,
        };
    }
  }
  return best;
}

/** One side of a division: atoms either joined by a middle dot or simply run together ("N·m", "Nmm"), each optionally raised to a power.
 * An empty side stands for 1, so "1/s" typed as "/s" is read rather than refused. */
function parse_group(text: string): {
  factor: number;
  exp: number;
  dim: [number, number, number, number];
} | null {
  let factor = 1;
  let exp = 0;
  const dim: [number, number, number, number] = [0, 0, 0, 0];
  let at = 0;
  while (at < text.length) {
    if (text[at] === "·") {
      at += 1;
      continue;
    }
    const atom = longest_atom(text, at);
    if (atom === null) return null;
    at += atom.length;
    const exponent = text.slice(at).match(/^-?[0-9]+/);
    const power = exponent ? parseInt(exponent[0], 10) : 1;
    if (exponent) at += exponent[0].length;
    factor *= atom.factor ** power;
    exp += atom.exp * power;
    for (let i = 0; i < 4; i += 1) dim[i] += atom.dim[i] * power;
  }
  return { factor, exp, dim };
}

/**
 * `symbol` read as a product of prefixed atoms, divided by everything past each "/": what one of it is worth in SI, and the dimension it carries.
 * `null` when any part of it is not a unit this knows.
 */
export function parse_unit_symbol(
  symbol: string,
): { factor: number; dim: Dimension } | null {
  const [numerator, ...denominators] = normalise(symbol).split("/");
  const head = parse_group(numerator);
  if (head === null) return null;
  let factor = head.factor;
  let exp = head.exp;
  const dim = head.dim;
  for (const text of denominators) {
    const group = parse_group(text);
    if (group === null) return null;
    factor /= group.factor;
    exp -= group.exp;
    for (let i = 0; i < 4; i += 1) dim[i] -= group.dim[i];
  }
  return { factor: factor * 10 ** exp, dim };
}

/** Whether two symbols measure the same thing, the only ground on which one may be typed where the other is expected. */
export function same_dimension(a: Dimension, b: Dimension): boolean {
  return a.every((exp, i) => exp === b[i]);
}
