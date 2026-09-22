import { get_language, Lang } from "../i18n";
import { ID, UnionElement } from "../types";
import { is_nameable } from "./element-queries";

/**
 * Turns a UUID into something readable.
 */
/*
export function legible_id(id: ID): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return id
    .split("-")
    .map((sb) => alphabet[parseInt(sb, 16) % 26])
    .map((char, i) => (i ? char : char.toUpperCase()))
    .join("")
    .substring(0, 3);
}
*/

/**
 * A pronounceable four-letter code derived from an ID (e.g. "Talo", "Mira", "Beno"), stable for a given ID.
 *
 * W, X, Y and Z are left out, and a consonant pair never closes the word on a hard sound such as "kp" or "gd".
 */
export function legible_id(id: ID): string {
  const parts = id.toLowerCase().match(/[0-9a-f]+/g);
  if (!parts || parts.length < 5) {
    throw new Error("ID invalide");
  }

  const voyelles = "aeiou";
  const consonnes = "bcdfghjklmnpqrstv";
  // Soft sounds only (liquids, nasals, soft sibilants): stops and hard fricatives read badly at the end of a word.
  const consonnes_finales = "lmnrsv";

  // Picked with equal odds, so a pattern listed twice weighs double.
  const structures = [
    { pattern: "CVCV", map: [consonnes, voyelles, consonnes, voyelles] }, // Talo
    {
      pattern: "VCVC",
      map: [voyelles, consonnes, voyelles, consonnes_finales],
    }, // Aris
    { pattern: "CVCV2", map: [consonnes, voyelles, consonnes, voyelles] },

    {
      pattern: "CVVC",
      map: [consonnes, voyelles, voyelles, consonnes_finales],
    }, // Loin
    {
      pattern: "VCCV",
      map: [voyelles, consonnes, consonnes_finales, voyelles],
    }, // Elsa

    {
      pattern: "CVCf",
      map: [consonnes, voyelles, consonnes, consonnes_finales],
    }, // Talm
  ];

  // The first section of the ID picks the pattern, the next four pick the letters.
  const selector = parseInt(parts[0].substring(0, 8), 16);
  const structureIndex = selector % structures.length;
  const currentStructure = structures[structureIndex];

  const result: string[] = [];

  for (let i = 0; i < 4; i++) {
    const charSet = currentStructure.map[i];
    const hexSegment = parts[i + 1].substring(0, 4);
    const num = parseInt(hexSegment, 16);

    let char = charSet[num % charSet.length];

    if (i === 0) {
      char = char.toUpperCase();
    }

    result.push(char);
  }

  return result.join("");
}

/**
 * The name shown for an element: its own name if it has one, otherwise its type followed by a code derived from its ID.
 */
export function shown_element_name(element: UnionElement | undefined): string {
  if (!element) return "Not found";
  if (is_nameable(element) && element.name) return element.name;

  let name: string = element.type;
  if (element.type === "pivot" && element.motor) name = "motor";
  if (name.includes("dimension")) name = "dimension";
  if (name.includes("horizontal")) name = "horizontal";
  if (name.includes("vertical")) name = "vertical";
  if (name === "distributed-force") name = "dist-force";

  return (
    name.charAt(0).toUpperCase() +
    name.slice(1) +
    (element.type === "beam" ||
    element.type === "belt" ||
    element.type === "damper" ||
    element.type === "gear" ||
    element.type === "join" ||
    element.type === "mass" ||
    element.type === "pivot" ||
    element.type === "slidep" ||
    element.type === "slider" ||
    element.type === "spring" ||
    element.type === "force" ||
    element.type === "distributed-force" ||
    element.type === "moment"
      ? " " + legible_id(element.id)
      : "")
  );
}

/**
 * Helper to convert a decimal value to a ratio string (e.g., 0.5 -> "1:2")
 */
export function value2ratio(
  value: number,
  limit: number = 100,
): [string, string] {
  if (value === 0) return ["0", "1"];
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-4) {
      return [n.toString(), d.toString()];
    }
  }
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-3) {
      return [n.toString(), d.toString()];
    }
  }
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(value * d);
    if (Math.abs(value - n / d) < 1.0e-2) {
      return [n.toString(), d.toString()];
    }
  }
  return ["1", "1"];
}

/**
 * A simulated time, for display: `45.34s` under the minute, `2m53.4s` past it.
 *
 * Truncated rather than rounded, so the label never shows an instant the recording has not got to — and never reads `60.00s` for something the next hundredth calls `1m00.0s`.
 * The text never gets narrower as the time grows, which is what lets the timeline size its label on the longest time it can show.
 */
export function format_sim_time(seconds: number): string {
  // The epsilon keeps a binary representation just below a hundredth, such as 0.29 * 100 = 28.999…, from being truncated a hundredth short.
  const hundredths = Math.max(0, Math.floor(seconds * 100 + 1e-6));
  if (hundredths < 6000) return `${(hundredths / 100).toFixed(2)}s`;
  const tenths = Math.floor(hundredths / 10);
  const whole = Math.floor(tenths / 10);
  const s = whole % 60;
  return `${Math.floor(whole / 60)}m${s.toString().padStart(2, "0")}.${tenths % 10}s`;
}

// `Intl.DateTimeFormat` construction resolves locale data and is costly enough that building one per call shows up when many dates format in a row (e.g. one gallery card each).
// Cached per language instead — there are only a handful of them.
const dateFormatters = new Map<Lang, Intl.DateTimeFormat>();
const date_formatter = (lang: Lang): Intl.DateTimeFormat => {
  let formatter = dateFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateFormatters.set(lang, formatter);
  }
  return formatter;
};

export function format_date(timestamp: number): string {
  return date_formatter(get_language()).format(new Date(timestamp));
}
