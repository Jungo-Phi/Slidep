import {
  BeamElement,
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  LoadElement,
  MechanicalElement,
  NodeElement,
  Point2,
} from "../types";
import {
  distributed_display_vectors,
  force_base_position,
  force_display_vector,
  force_world_vector,
} from "./load-geom";

export interface Bounds {
  min: Point2;
  max: Point2;
}

/**
 * Boîte englobante, en coordonnées monde, des ancres du modèle : positions des
 * nœuds, extrémités des arêtes, disque des engrenages, pointes des efforts,
 * étiquettes des contraintes.
 *
 * Approximative par nature : l'encombrement *dessiné* des glyphes (bâti,
 * moteur, texte d'une cote) ne vit que dans les fonctions de dessin. Les
 * appelants compensent par une marge en unités monde — constante quel que soit
 * le zoom, puisque le contexte entier est mis à l'échelle.
 *
 * `undefined` si rien à cadrer.
 */
export function mechanism_bounds(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
  loads: LoadElement[] = [],
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
      include(gear.position, gear.radius);
    } else if ("position" in element) {
      include((element as NodeElement).position);
    } else if ("positionStart" in element) {
      const edge = element as EdgeElement;
      include(edge.positionStart);
      include(edge.positionEnd);
    }
  }

  for (const constraint of constraintElements) include(constraint.position);

  for (const load of loads) {
    switch (load.type) {
      case "force": {
        const base = force_base_position(
          load as ForceElement,
          mechanicalElements,
        );
        if (!base) break;
        include(base);
        include(
          base.add(
            force_display_vector(
              force_world_vector(load as ForceElement, mechanicalElements),
            ),
          ),
        );
        break;
      }
      case "distributed-force": {
        const distributed = load as DistributedForceElement;
        const beam = mechanicalElements.find(
          (e) => e.id === distributed.targetID && e.type === "beam",
        ) as BeamElement | undefined;
        if (!beam) break;
        const { displayStart, displayEnd } = distributed_display_vectors(
          distributed,
          mechanicalElements,
        );
        include(beam.positionStart.add(displayStart));
        include(beam.positionEnd.add(displayEnd));
        break;
      }
      // "moment" : dessiné autour du centre de sa barre, déjà dans la boîte.
    }
  }

  if (!Number.isFinite(minX)) return undefined;
  return { min: new Point2(minX, minY), max: new Point2(maxX, maxY) };
}
