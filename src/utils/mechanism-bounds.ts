import { DIM } from "../constants/rendering-specs";
import {
  ConstraintElement,
  EdgeElement,
  GearElement,
  MechanicalElement,
  NodeElement,
  Point2,
} from "../types";

export interface Bounds {
  min: Point2;
  max: Point2;
}

/**
 * Boîte englobante, en coordonnées monde, des ancres du modèle : positions des
 * nœuds, extrémités des arêtes, disque des engrenages (dents comprises),
 * étiquettes des contraintes.
 *
 * Approximative par nature : l'encombrement *dessiné* des glyphes (bâti,
 * moteur, texte d'une cote) ne vit que dans les fonctions de dessin et n'est
 * pas repris ici.
 *
 * Les charges en sont exclues : elles sont dessinées à taille écran fixe, donc
 * leur encombrement en unités monde dépend du zoom qu'on cherche justement à
 * déduire de cette boîte.
 *
 * `undefined` si rien à cadrer.
 */
export function mechanism_bounds(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
): Bounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (p: Point2, radius: number = 0) => {
    minX = Math.min(minX, p.x - radius);
    minY = Math.min(minY, p.y - radius);
    maxX = Math.max(maxX, p.x + radius);
    maxY = Math.max(maxY, p.y + radius);
  };

  for (const element of mechanicalElements) {
    if (element.type === "gear") {
      const gear = element as GearElement;
      include(gear.position, gear.radius + DIM.GEAR_TEETH_SIZE);
    } else if ("position" in element) {
      include((element as NodeElement).position);
    } else if ("positionStart" in element) {
      const edge = element as EdgeElement;
      include(edge.positionStart);
      include(edge.positionEnd);
    }
  }

  for (const constraint of constraintElements) include(constraint.position);

  if (!Number.isFinite(minX)) return undefined;
  return { min: new Point2(minX, minY), max: new Point2(maxX, maxY) };
}
