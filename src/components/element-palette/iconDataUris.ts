/**
 * Central registry of palette icon data URIs.
 *
 * Each SVG under assets/icons/palette is imported as a raw string and inlined
 * as a `data:image/svg+xml,...` URI. The bytes therefore ship inside the JS
 * bundle: no separate network request in dev or prod, and icons render
 * instantly (no loading flash, no placeholder needed). The returned string is
 * a stable, reusable URL usable both by `<img src>` and canvas `drawImage`.
 *
 * The SVGs were authored in the classic hues — a navy stroke on a cream ground —
 * which vanish on a dark canvas. So for any theme that asks for it, the source
 * hues are substituted for that theme's before the URI is built. Results are
 * cached per theme: the substitution runs once per icon per theme, not per draw.
 */
import { ICON_COLORS } from "../../constants/rendering-specs";
import { CanvasPalette } from "../../constants/mui-theme";

const rawIcons = import.meta.glob("../../assets/icons/palette/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Map from icon basename (without extension) → raw SVG source. */
const RAW: Record<string, string> = {};
for (const [path, raw] of Object.entries(rawIcons)) {
  RAW[path.split("/").pop()!.replace(/\.svg$/, "")] = raw;
}

/**
 * The color literals baked into the source SVGs, and the palette role each one
 * plays. A literal absent from this map (a grey, the probe cyan) is left alone:
 * it reads on any background.
 */
const SOURCE_HUES: Record<string, keyof CanvasPalette> = {
  "rgb(0,29,89)": "ELEMENT_STROKE",
  "#001d59": "ELEMENT_STROKE",
  "#193a6c": "ELEMENT_STROKE",
  "#000": "ELEMENT_STROKE",
  black: "ELEMENT_STROKE",
  "rgb(219,80,0)": "ACCENT",
  "#db5000": "ACCENT",
  "rgb(183,226,255)": "FILL_BODY",
  "rgb(255,190,128)": "FILL_NODE",
  "#ffbe80": "FILL_NODE",
  "rgb(255,237,198)": "BACKGROUND",
  white: "BACKGROUND",
};

// Colours appear in the sources as `rgb()`, as hex, and — in a few icons — as
// the bare keywords `black` / `white`. Miss the keywords and those icons quietly
// keep their classic colours, which is how the ground and motor icons stayed
// navy on a dark canvas. Only whole words match, so an id can never be mangled.
const COLOR_LITERAL =
  /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:black|white)\b/g;

const recolor = (svg: string, palette: CanvasPalette): string =>
  svg.replace(COLOR_LITERAL, (literal) => {
    const key = SOURCE_HUES[literal.toLowerCase().replace(/\s+/g, "")];
    const replacement = key && palette[key];
    return typeof replacement === "string" ? replacement : literal;
  });

const toDataUri = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

const cache = new Map<string, Record<string, string>>();

const icons_for = (palette: CanvasPalette): Record<string, string> => {
  // The palette's own stroke identifies it well enough to key the cache: no two
  // themes draw elements in the same color.
  const key = palette.RECOLOR_ICONS ? palette.ELEMENT_STROKE : "source";
  let built = cache.get(key);
  if (!built) {
    built = {};
    for (const [name, raw] of Object.entries(RAW)) {
      built[name] = toDataUri(
        palette.RECOLOR_ICONS ? recolor(raw, palette) : raw,
      );
    }
    cache.set(key, built);
  }
  return built;
};

/**
 * Data URI for a palette icon, by basename (e.g. `icon("beam")`), in the active
 * theme's colors. Call it at render/draw time — a module-level constant built
 * from it would freeze on whichever theme was active at import.
 *
 * Reads `ICON_COLORS`, not `COLORS`: during a theme fade the latter holds an
 * intermediate palette, which would key a fresh set of URIs on every frame.
 */
export const icon = (name: string): string => {
  const uri = icons_for(ICON_COLORS)[name];
  if (!uri) throw new Error(`Unknown palette icon: ${name}`);
  return uri;
};
