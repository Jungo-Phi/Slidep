import { ID, UnionElement } from "../types";

/**
 * Formate un UUID pour le rendre lisible.
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
 * Génère un code lisible de 4 lettres (ex: "Talo", "Mira", "Beno").
 * Exclut Q, W, X, Y, Z pour une lisibilité maximale.
 * Empêche les fins de mots dures (ex: "kp", "tz", "gd").
 */
export function legible_id(id: ID): string {
  const parts = id.toLowerCase().match(/[0-9a-f]+/g);
  if (!parts || parts.length < 5) {
    throw new Error("ID invalide");
  }

  // 1. Alphabets "Propres" (21 lettres)
  // Voyelles classiques (5)
  const voyelles = "aeiou";
  // Consonnes standards (16) : on enlève q, w, x, y, z
  const consonnes = "bcdfghjklmnpqrstv";
  // Consonnes de fin autorisées (6) : uniquement les liquides/nasales/sifflantes douces (l, m, n, r, s, v)
  // On exclut les occlusives (b, d, g, k, p, t) et les frottantes dures (f) en position finale après une consonne.
  const consonnes_finales = "lmnrsv";

  // 2. Définition des structures (Le "Plan")
  // On évite les structures qui finissent par 2 consonnes dures.
  const structures = [
    // Structures classiques (60% des cas)
    { pattern: "CVCV", map: [consonnes, voyelles, consonnes, voyelles] }, // Talo
    {
      pattern: "VCVC",
      map: [voyelles, consonnes, voyelles, consonnes_finales],
    }, // Arno (fin douce garantie)
    { pattern: "CVCV2", map: [consonnes, voyelles, consonnes, voyelles] }, // Redondance pour pondérer

    // Structures avec diphtongues (20% des cas)
    {
      pattern: "CVVC",
      map: [consonnes, voyelles, voyelles, consonnes_finales],
    }, // Loic, Maud
    {
      pattern: "VCCV",
      map: [voyelles, consonnes, consonnes_finales, voyelles],
    }, // Elsa, Olaf (la 3ème est douce)

    // Structures terminant par consonne unique (20% des cas)
    {
      pattern: "CVCf",
      map: [consonnes, voyelles, consonnes, consonnes_finales],
    }, // Talm, Berc
  ];

  // 3. Sélection de la structure (basée sur la 1ère section)
  const selector = parseInt(parts[0].substring(0, 8), 16);
  const structureIndex = selector % structures.length;
  const currentStructure = structures[structureIndex];

  // 4. Génération des 4 lettres (sections 2 à 5)
  const result: string[] = [];

  for (let i = 0; i < 4; i++) {
    const charSet = currentStructure.map[i];
    const hexSegment = parts[i + 1].substring(0, 4);
    const num = parseInt(hexSegment, 16);

    let char = charSet[num % charSet.length];

    // Majuscule en tête
    if (i === 0) {
      char = char.toUpperCase();
    }

    result.push(char);
  }

  return result.join("");
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
