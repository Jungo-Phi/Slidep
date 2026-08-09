import { COLORS } from "../../constants/rendering-specs";
import {
  Mechanism,
  Point2,
  ScreenPoint,
  ViewportState,
  ZERO,
} from "../../types";
import { mechanism_bounds, world2screen_vec } from "../../utils";
import { draw_mechanical_canvas } from "./draw-canvas";
import { compute_visible_constraints } from "./utils";

const RATIO_MARGIN = 0.05;
const FIXED_MARGIN = 20;
const MAX_ZOOM = 2;

const CANVAS_STATE = { type: "Selecting" } as const;
const HOVERED_PART = { type: "Void", position: ZERO } as const;

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
  size: number,
): void => {
  // Contraintes telles qu'on les voit en édition hors survol : cotations et
  // rapports d'engrenage, sans les badges géométriques.
  const visibleConstraints = compute_visible_constraints(
    mechanism.constraintElements,
    "edition",
    "elements",
    new Map(),
    CANVAS_STATE,
  );

  const viewport = fit_viewport(mechanism, visibleConstraints, size);

  // Axes du monde, en coordonnées écran comme dans le rendu principal. Ils
  // sortent du cadre si le mécanisme est loin de l'origine : c'est voulu.
  ctx.strokeStyle = COLORS.GRID_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(viewport.pan.x, 0);
  ctx.lineTo(viewport.pan.x, size);
  ctx.moveTo(0, viewport.pan.y);
  ctx.lineTo(size, viewport.pan.y);
  ctx.stroke();

  draw_mechanical_canvas(ctx, {
    viewport,
    hoveredPart: HOVERED_PART,
    state: CANVAS_STATE,
    mechanicalElements: mechanism.mechanicalElements,
    constraintElements: mechanism.constraintElements,
    loads: mechanism.loads,
    visibleConstraints,
    hideConstraints: true,
    hideProbes: true,
  });
};

/** Zoom et pan cadrant le contenu dessiné dans un carré de `size` px. */
function fit_viewport(
  mechanism: Mechanism,
  visibleConstraints: Map<string, number>,
  size: number,
): ViewportState {
  const bounds = mechanism_bounds(
    mechanism.mechanicalElements,
    mechanism.constraintElements.filter((c) => visibleConstraints.has(c.id)),
  );
  const center: ScreenPoint = new Point2(size / 2, size / 2);
  if (!bounds) return { scale: 1, pan: center };

  const width = bounds.max.x - bounds.min.x + 2 * FIXED_MARGIN;
  const height = bounds.max.y - bounds.min.y + 2 * FIXED_MARGIN;
  const inner = size * (1 - 2 * RATIO_MARGIN);
  const scale = Math.min(MAX_ZOOM, inner / width, inner / height);

  // The pan that lands the content's centre on the canvas centre. `world2screen`
  // flips y on the way, so what has to be cancelled is the flipped offset.
  const contentCenter = bounds.min.lerp(bounds.max, 0.5);
  return {
    scale,
    pan: center.sub(world2screen_vec(contentCenter, { scale, pan: ZERO })),
  };
}
