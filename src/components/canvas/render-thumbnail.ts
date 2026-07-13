import { COLORS } from "../../constants/rendering-specs";
import { Mechanism, Point2, ZERO } from "../../types";
import { mechanism_bounds } from "../../utils";
import { drawMechanicalCanvas as draw_mechanical_canvas } from "./draw-canvas";
import { compute_visible_constraints } from "./utils";

/** Côté (px) par défaut de la miniature carrée. */
export const THUMBNAIL_SIZE = 512;

/** Marge autour du mécanisme, en fraction du côté de la miniature. */
const MARGIN_RATIO = 0.1;

/**
 * Marge en unités monde absorbant l'encombrement des glyphes (bâti, moteur,
 * texte de cote…) que la boîte englobante du modèle ignore.
 */
const GLYPH_MARGIN = 30;

/** Un mécanisme minuscule (un seul pivot) ne doit pas remplir tout le cadre. */
const MAX_ZOOM = 2;

/**
 * Dessine la miniature carrée du mécanisme dans un contexte déjà dimensionné.
 *
 * Ce n'est pas une photo du canvas visible : on redessine le mécanisme seul,
 * dans un état d'interaction neutre (rien de sélectionné, survolé, ni en cours
 * de placement) et avec un cadrage ajusté à son contenu. La miniature ne dépend
 * donc que du modèle — pas de ce que l'utilisateur avait à l'écran.
 *
 * Elle n'est pas stockée : la galerie la redessine à l'ouverture, ce qui la rend
 * gratuite à la sauvegarde et toujours au thème courant.
 */
export const draw_thumbnail = (
  ctx: CanvasRenderingContext2D,
  mechanism: Mechanism,
  size: number = THUMBNAIL_SIZE,
): void => {
  ctx.save();
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, size, size);

  // État neutre : is_selected / is_hovered / is_erase_hovered renvoient tous
  // false, et le dessin propre à l'état ne produit rien pour "Selecting".
  const canvasState = { type: "Selecting" } as const;
  const hoveredPart = { type: "Void", position: ZERO } as const;

  // Contraintes telles qu'on les voit en édition hors survol : cotations et
  // rapports d'engrenage, sans les badges géométriques.
  const visibleConstraints = compute_visible_constraints(
    mechanism.constraintElements,
    "edition",
    "elements",
    new Map(),
    canvasState,
  );

  const { zoom, pan } = fit_viewport(mechanism, visibleConstraints, size);

  // Axes du monde, en coordonnées écran comme dans le rendu principal. Ils
  // sortent du cadre si le mécanisme est loin de l'origine : c'est voulu.
  ctx.strokeStyle = COLORS.GRID_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pan.x, 0);
  ctx.lineTo(pan.x, size);
  ctx.moveTo(0, pan.y);
  ctx.lineTo(size, pan.y);
  ctx.stroke();

  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);

  draw_mechanical_canvas(
    ctx,
    hoveredPart,
    canvasState,
    mechanism.mechanicalElements,
    mechanism.constraintElements,
    mechanism.loads,
    visibleConstraints,
  );

  ctx.restore();
};

/** Zoom et pan cadrant le contenu dessiné dans un carré de `size` px. */
function fit_viewport(
  mechanism: Mechanism,
  visibleConstraints: Map<string, number>,
  size: number,
): { zoom: number; pan: Point2 } {
  const bounds = mechanism_bounds(
    mechanism.mechanicalElements,
    mechanism.constraintElements.filter((c) => visibleConstraints.has(c.id)),
    mechanism.loads,
  );
  const center = new Point2(size / 2, size / 2);
  if (!bounds) return { zoom: 1, pan: center };

  const width = bounds.max.x - bounds.min.x + 2 * GLYPH_MARGIN;
  const height = bounds.max.y - bounds.min.y + 2 * GLYPH_MARGIN;
  const inner = size * (1 - 2 * MARGIN_RATIO);
  const zoom = Math.min(MAX_ZOOM, inner / width, inner / height);

  const contentCenter = bounds.min.lerp(bounds.max, 0.5);
  return { zoom, pan: center.sub(contentCenter.mul(zoom)) };
}
