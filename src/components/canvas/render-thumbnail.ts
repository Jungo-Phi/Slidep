import { COLORS } from "../../constants/rendering-specs";
import { Mechanism, ZERO } from "../../types";
import { fit_viewport_to_bounds, mechanism_bounds } from "../../utils";
import { draw_mechanism } from "./draw-mechanism";

/** Framing for an empty mechanism, or one whose anchors all sit at the same point. */
const DEFAULT_ZOOM = 1;

const CANVAS_STATE = { type: "Selecting" } as const;
const HOVERED_PART = { type: "Void", position: ZERO } as const;

/**
 * Dessine la miniature du mécanisme dans un contexte déjà dimensionné.
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
  width: number,
  height: number,
): void => {
  // Contraintes telles qu'on les voit en édition hors survol : cotations et
  // rapports d'engrenage, sans les badges géométriques.
  /*
  const visibleConstraints = compute_visible_constraints(
    mechanism.constraintElements,
    "edition",
    "elements",
    new Map(),
    CANVAS_STATE,
  );
  */
  const visibleConstraints = new Map();

  const bounds = mechanism_bounds(
    mechanism.mechanicalElements,
    mechanism.constraintElements.filter((c) => visibleConstraints.has(c.id)),
  );
  const viewport = fit_viewport_to_bounds(bounds, width, height, {
    defaultZoom: DEFAULT_ZOOM,
  });

  // Axes du monde, en coordonnées écran comme dans le rendu principal. Ils
  // sortent du cadre si le mécanisme est loin de l'origine : c'est voulu.
  ctx.strokeStyle = COLORS.GRID_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(viewport.pan.x, 0);
  ctx.lineTo(viewport.pan.x, height);
  ctx.moveTo(0, viewport.pan.y);
  ctx.lineTo(width, viewport.pan.y);
  ctx.stroke();

  draw_mechanism(ctx, {
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
