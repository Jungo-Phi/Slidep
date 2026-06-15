import { ID, UnionElement } from "../types";

/**
 * Formate l'id d'un élément pour le rendre lisible.
 */
export function legible_id(id: ID): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return id
    .split("-")
    .map((sb) => alphabet[parseInt(sb, 16) % 26])
    .map((char, i) => (i ? char : char.toUpperCase()))
    .join("")
    .substring(0, 3);
}

/**
 * Formate l'id d'un élément pour afficher un nom lisible.
 */
export function shown_element_name(element: UnionElement | undefined): string {
  if (!element) return "Not found";
  if (element.name) return element.name;

  let name: string = element.type;
  if (name.includes("dimension")) name = "dimension";
  if (name.includes("horizontal")) name = "horizontal";
  if (name.includes("vertical")) name = "vertical";

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
    element.type === "spring"
      ? " " + legible_id(element.id)
      : "")
  );
}

/**
 * Helper to convert a decimal value to a ratio string (e.g., 0.5 -> "1:2")
 */
export function value_to_ratio_parts(
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

export function format_date(timestamp: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
