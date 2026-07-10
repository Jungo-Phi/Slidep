/**
 * Central registry of palette icon data URIs.
 *
 * Each SVG under assets/icons/palette is imported as a raw string and inlined
 * as a `data:image/svg+xml,...` URI. The bytes therefore ship inside the JS
 * bundle: no separate network request in dev or prod, and icons render
 * instantly (no loading flash, no placeholder needed). The returned string is
 * a stable, reusable URL usable both by `<img src>` and canvas `drawImage`.
 */
const rawIcons = import.meta.glob("../../assets/icons/palette/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const toDataUri = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Map from icon basename (without extension) → data URI. */
const PALETTE_ICONS: Record<string, string> = {};
for (const [path, raw] of Object.entries(rawIcons)) {
  const name = path.split("/").pop()!.replace(/\.svg$/, "");
  PALETTE_ICONS[name] = toDataUri(raw);
}

/** Data URI for a palette icon, by basename (e.g. `icon("beam")`). */
export const icon = (name: string): string => {
  const uri = PALETTE_ICONS[name];
  if (!uri) throw new Error(`Unknown palette icon: ${name}`);
  return uri;
};
