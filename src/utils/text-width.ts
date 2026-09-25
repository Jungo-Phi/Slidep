/**
 * Width of a text in Arial, computed rather than measured: it needs no canvas, so geometry that decides where a label sits (and what a click on it hits) agrees with the draw call to the pixel, whatever the environment.
 */

/** Advance width of each character, in ems — the digits, the letters and the symbols a formatted quantity is built from. */
const ADVANCE: Record<string, number> = {
  " ": 0.278,
  " ": 0.278,
  " ": 0.278,
  ".": 0.278,
  ",": 0.278,
  "/": 0.278,
  "-": 0.333,
  "·": 0.333,
  "²": 0.333,
  "°": 0.4,
  "=": 0.584,
  "+": 0.584,
  "−": 0.584,
  "%": 0.889,
  µ: 0.576,
  μ: 0.576,
  a: 0.556,
  b: 0.556,
  c: 0.5,
  d: 0.556,
  e: 0.556,
  f: 0.278,
  g: 0.556,
  h: 0.556,
  i: 0.222,
  j: 0.222,
  k: 0.5,
  l: 0.222,
  m: 0.833,
  n: 0.556,
  o: 0.556,
  p: 0.556,
  q: 0.556,
  r: 0.333,
  s: 0.5,
  t: 0.278,
  u: 0.556,
  v: 0.5,
  w: 0.722,
  x: 0.5,
  y: 0.5,
  z: 0.5,
  A: 0.667,
  B: 0.667,
  C: 0.722,
  D: 0.722,
  E: 0.667,
  F: 0.611,
  G: 0.778,
  H: 0.722,
  I: 0.278,
  J: 0.5,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  Q: 0.778,
  R: 0.722,
  S: 0.667,
  T: 0.611,
  U: 0.722,
  V: 0.667,
  W: 0.944,
  X: 0.667,
  Y: 0.667,
  Z: 0.611,
};

/** What a digit, and anything the table does not list, is counted at. */
const ADVANCE_DEFAULT = 0.556;

/** Width in px of `text` set in Arial at `fontSize` px. Regular weight: a bold text runs a few per cent wider. */
export function arial_text_width(text: string, fontSize: number): number {
  return (
    fontSize *
    [...text].reduce((sum, c) => sum + (ADVANCE[c] ?? ADVANCE_DEFAULT), 0)
  );
}
