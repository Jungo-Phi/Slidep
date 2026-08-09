/** The languages the app speaks, in the order the language menu lists them. */
export const LANGUAGES = ["de", "en", "es", "fr"] as const;

export type Lang = (typeof LANGUAGES)[number];

/** Each language named in itself, as the language menu shows it. */
export const LANGUAGE_LABELS: Record<Lang, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
};

export const is_lang = (value: unknown): value is Lang =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** The first browser language the app speaks, English otherwise. */
export function detect_language(): Lang {
  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of preferred) {
    const base = tag.split("-")[0].toLowerCase();
    if (is_lang(base)) return base;
  }
  return "en";
}
