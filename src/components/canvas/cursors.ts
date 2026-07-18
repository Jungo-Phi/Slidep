/**
 * Custom canvas cursors.
 *
 * The canvas otherwise uses native cursors (`grab`, `grabbing`, `crosshair`),
 * and deliberately keeps them: those express generic affordances — "this can be
 * dragged", "you are dragging", "you are about to point" — and native cursors
 * scale with the user's OS cursor-size setting, which a custom one cannot.
 *
 * A custom cursor is reserved for the other register: the identity of a tool the
 * user armed from the palette. CSS has no eraser cursor, so it has to be drawn.
 *
 * The bodies stay pale with a contrasting outline, like a real system cursor:
 * the outline holds the shape on a light canvas, the fill holds it on a dark
 * one. Only the deletion accent follows the theme — the same one the palette
 * button and the canvas deletion feedback already use, so an armed eraser, its
 * button and the elements it is about to remove all read in one colour.
 */
import { ICON_COLORS } from "../../constants/rendering-specs";
import { CanvasPalette } from "../../constants/mui-theme";
import eraserArrowSvg from "../../assets/icons/cursors/eraser-cursor.svg?raw";
import eraserSoloSvg from "../../assets/icons/cursors/eraser-cursor-solo.svg?raw";

/** The deletion literal baked into the source SVGs, and the role it plays. */
const SOURCE_HUES: Record<string, keyof CanvasPalette> = {
  "#ed5e71": "DELETION_BOX",
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

const cache = new Map<string, { arrow: string; solo: string }>();

/**
 * Two variants, cached per deletion palette. The cache matters: this is read on
 * every render, and re-encoding a whole SVG each time would be wasteful.
 *
 * Reads `ICON_COLORS`, not `COLORS`: during a theme fade the latter holds an
 * intermediate palette, which would key a fresh URI on every frame.
 */
const variants = (): { arrow: string; solo: string } => {
  const palette = ICON_COLORS;
  const key = palette.DELETION_BOX;
  let built = cache.get(key);
  if (!built) {
    built = {
      arrow: build(eraserArrowSvg, 2, 2, palette),
      solo: build(eraserSoloSvg, 5, 9, palette),
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
