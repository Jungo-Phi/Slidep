import type { Point2 } from "../../../types/point2";
import type { BeltElement, MechanicalElement } from "../../../types/element";
import type { HoveredPart } from "../../../types/hovered-part";
import type { ViewportState } from "../../../types";
import { DIM } from "../../../constants/rendering-specs";
import { INTERACTION_SPECS } from "../../../constants/interaction-specs";
import { belt_pieces } from "../../../utils/belt-path";
import { get_belt_path } from "../../../utils/belt-geom";
import { screen2world_length } from "../../../utils/viewport";

/**
 * The gear the gear tool lays against a belt run when its first step lands on the run: `contact` is where it touches, `rim` a point of its rim, which decides both its size and the side of the run it sits on.
 * Its rim crosses the run by `GEAR_ON_BELT_GROW`, as a gear sized onto a run does, so the belt does wrap it.
 * `undefined` when `contact` names no straight run.
 */
export function gear_on_run(
  contact: Extract<HoveredPart, { type: "BeltBody" }>,
  rim: Point2,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): { center: Point2; radius: number } | undefined {
  const belt = mechanicalElements.find(
    (e): e is BeltElement => e.type === "belt" && e.id === contact.id,
  );
  if (!belt) return undefined;
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  const piece = belt_pieces(vias, closed)[contact.section];
  if (!piece || piece.kind !== "segment") return undefined;
  const run = piece.to.sub(piece.from);
  if (run.length_squared() < 1e-18) return undefined;
  const normal = run.normalize().perp();
  const toRim = rim.sub(contact.position);
  const across = toRim.dot(normal);
  const along = toRim.dot(run.normalize());
  const side = across < 0 ? -1 : 1;
  const grow = screen2world_length(INTERACTION_SPECS.GEAR_ON_BELT_GROW, viewport);
  // The circle through `rim` tangent to the run moved `grow` the other way: pressed back by `grow`, it crosses the run by that much with its rim still on `rim`.
  // Capped where the rim nears the run's own line, where it would grow without bound.
  const reach = Math.abs(across) + grow;
  const distance = Math.hypot(along, reach);
  const radius = Math.max(
    Math.min((distance * distance) / (2 * reach), distance),
    screen2world_length(DIM.MIN_GEAR_RADIUS, viewport),
  );
  return {
    center: contact.position.add(normal.mul(side * (radius - grow))),
    radius,
  };
}
