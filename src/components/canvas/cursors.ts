/**
 * Custom canvas cursors.
 *
 * The canvas otherwise uses native cursors (`grab`, `grabbing`, `crosshair`),
 * and deliberately keeps them: those express generic affordances — "this can be
 * dragged", "you are dragging", "you are about to point" — and native cursors
 * scale with the user's OS cursor-size setting, which a custom one cannot.
 *
 * A custom cursor is reserved for the other register: identity — which tool is
 * armed, which mode the app is in. CSS has neither an eraser nor a simulation
 * cursor, so both have to be drawn.
 *
 * The bodies stay pale with a contrasting outline, like a real system cursor:
 * the outline holds the shape on a light canvas, the fill holds it on a dark
 * one. Only the accent follows the theme — the same one the palette button uses,
 * so an armed eraser and the elements it is about to remove, or a simulation and
 * its lit palette button, each read in one colour.
 */
import { ICON_COLORS } from "../../constants/rendering-specs";
import { CanvasPalette } from "../../constants/mui-theme";
import eraserArrowSvg from "../../assets/icons/cursors/eraser-cursor.svg?raw";
import eraserSoloSvg from "../../assets/icons/cursors/eraser-cursor-solo.svg?raw";
import simSvg from "../../assets/icons/cursors/sim-cursor.svg?raw";

/** The accent literals baked into the source SVGs, and the role each plays. */
const SOURCE_HUES: Record<string, keyof CanvasPalette> = {
  "#ed5e71": "DELETION_BOX",
  "#d7530b": "ACCENT",
};

const recolor = (svg: string, palette: CanvasPalette): string =>
  svg.replace(/#[0-9a-fA-F]{6}\b/g, (literal) => {
    const key = SOURCE_HUES[literal.toLowerCase()];
    const replacement = key && palette[key];
    return typeof replacement === "string" ? replacement : literal;
  });

// 32x32 is the ceiling Firefox accepts for a custom cursor; past it the
// declaration is dropped and the fallback applies.
const build = (
  svg: string,
  hotspotX: number,
  hotspotY: number,
  palette: CanvasPalette,
): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    recolor(svg, palette),
  )}") ${hotspotX} ${hotspotY}, default`;

type Variants = { arrow: string; solo: string; sim: string };

const cache = new Map<string, Variants>();

/**
 * Every variant, cached per accent pair. The cache matters: this is read on
 * every render, and re-encoding a whole SVG each time would be wasteful.
 *
 * Reads `ICON_COLORS`, not `COLORS`: during a theme fade the latter holds an
 * intermediate palette, which would key a fresh URI on every frame.
 */
const variants = (): Variants => {
  const palette = ICON_COLORS;
  const key = `${palette.DELETION_BOX}|${palette.ACCENT}`;
  let built = cache.get(key);
  if (!built) {
    built = {
      arrow: build(eraserArrowSvg, 2, 2, palette),
      solo: build(eraserSoloSvg, 5, 9, palette),
      sim: build(simSvg, 18, 15, palette),
    };
    cache.set(key, built);
  }
  return built;
};

/**
 * `cursor` value for the eraser modes, in the active theme's deletion hues. Call
 * it at render time — a module-level constant would freeze on whichever theme
 * was active at import.
 *
 * `arrow` is the standard pointer carrying an eraser badge, in the OS idiom for
 * a qualified pointer (copy, alias), hotspot on the arrow tip. `solo` is the
 * eraser on its own, hotspot on the middle of the rubber's leading edge — the
 * point the drawing claims will do the erasing. Swap the returned key to
 * compare the two.
 */
export const eraser_cursor = (): string => variants().solo;

/**
 * `cursor` value for a canvas in simulation, in the active theme's accent.
 *
 * It says which mode the app is in, nothing more: the native `grab` still marks
 * what can be dragged, and outranks this one wherever it applies. Hotspot on the
 * tallest fingertip, the pointing-hand convention.
 */
export const simulation_cursor = (): string => variants().sim;
