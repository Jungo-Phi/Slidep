import { get_mechanical_element_from_id } from "../components/mechanism/connect-actions";
import { BeltElement, GearElement, MechanicalElement, Point2 } from "../types";
import { BeltVia, belt_pieces } from "./belt-path";

/**
 * Build the ordered via-points of a belt (start terminal → gears → end
 * terminal) from the mechanism, resolving each attached gear. Shared by the
 * length measurement and the geometric solver's belt-length constraint.
 */
export function get_belt_vias(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): BeltVia[] {
  const gears: BeltVia[] = belt.attachedGearsIDs.map(({ id, direction }) => {
    const gear = get_mechanical_element_from_id(
      id,
      mechanicalElements,
    ) as GearElement;
    return { pos: gear.position, radius: gear.radius, direction };
  });
  return [
    { pos: belt.positionStart, radius: 0, direction: false },
    ...gears,
    { pos: belt.positionEnd, radius: 0, direction: false },
  ];
}

/**
 * The belt as it will be once pulley `index` is off it. Interpret a section
 * index against this rather than the stored belt whenever a gesture carries a
 * pending removal, since dropping a pulley renumbers the sections.
 *
 * `closed` is deliberately left untouched: whether the shortened belt still
 * loops is settled at commit time, and flipping it here would renumber the
 * sections a second time mid-gesture.
 */
export function belt_without_gear(
  belt: BeltElement,
  index: number,
): BeltElement {
  return {
    ...belt,
    attachedGearsIDs: belt.attachedGearsIDs.filter((_, i) => i !== index),
    disconnectedGearIndices: belt.disconnectedGearIndices?.flatMap((i) =>
      i === index ? [] : [i > index ? i - 1 : i],
    ),
    gearWraps: belt.gearWraps?.filter((_, i) => i !== index),
  };
}

/**
 * The via chain a belt's geometry is actually read from: a closed belt is the
 * pulley cycle (no terminals — the junction rides on the loop), a loose one the
 * terminal-to-terminal chain. Feed the pair straight to `belt_pieces`.
 */
export function get_belt_path(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): { vias: BeltVia[]; closed: boolean } {
  const vias = get_belt_vias(belt, mechanicalElements);
  return belt.closed
    ? { vias: vias.slice(1, -1), closed: true }
    : { vias, closed: false };
}

export function get_gear_angles(
  positionStart: Point2,
  positionEnd: Point2,
  attachedGears: {
    gear: GearElement;
    direction: boolean;
  }[],
): {
  center: Point2;
  radius: number;
  startAngle: number;
  endAngle: number;
  direction: boolean;
}[] {
  const gearAngles: {
    center: Point2;
    radius: number;
    startAngle: number;
    endAngle: number;
    direction: boolean;
  }[] = [];

  let lastPos = positionStart;

  if (attachedGears.length > 0) {
    lastPos = Point2.circles_link(
      positionStart,
      0,
      false,
      attachedGears[0].gear.position,
      attachedGears[0].gear.radius,
      attachedGears[0].direction,
    ).end;
  }

  for (let i = 0; i < attachedGears.length - 1; i++) {
    const { start, end } = Point2.circles_link(
      attachedGears[i].gear.position,
      attachedGears[i].gear.radius,
      attachedGears[i].direction,
      attachedGears[i + 1].gear.position,
      attachedGears[i + 1].gear.radius,
      attachedGears[i + 1].direction,
    );
    gearAngles.push({
      center: attachedGears[i].gear.position,
      radius: attachedGears[i].gear.radius,
      startAngle: lastPos.angle(),
      endAngle: start.angle(),
      direction: attachedGears[i].direction,
    });
    lastPos = end;
  }

  if (attachedGears.length > 0) {
    const { start } = Point2.circles_link(
      attachedGears[attachedGears.length - 1].gear.position,
      attachedGears[attachedGears.length - 1].gear.radius,
      attachedGears[attachedGears.length - 1].direction,
      positionEnd,
      0,
      false,
    );
    gearAngles.push({
      center: attachedGears[attachedGears.length - 1].gear.position,
      radius: attachedGears[attachedGears.length - 1].gear.radius,
      startAngle: lastPos.angle(),
      endAngle: start.angle(),
      direction: attachedGears[attachedGears.length - 1].direction,
    });
  }
  return gearAngles;
}

/**
 * Mesure la longueur mécanique d'une courroie : segments droits tangents + arcs
 * d'enroulement, au rayon brut (le `+BELT_WIDTH/2` du dessin est cosmétique).
 * Une courroie **tendue** est une boucle fermée sur ses poulies ; une courroie
 * libre est une chaîne ouverte entre ses extrémités.
 */
export function measure_belt_length(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): number {
  // Open chain: a terminal resting on its pulley's rim needs no special case — its
  // tangent run is simply of length 0 and the arc already reaches it.
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  return belt_pieces(vias, closed).reduce((acc, p) => acc + p.length, 0);
}

/**
 * Which gesture brought the gear and the belt together, which decides where they
 * touch and so which way the belt winds.
 *
 * `gear-onto-belt` — the gear is pressed against the section where it lies, so
 * the belt bulges towards the gear and wraps its far side.
 * `belt-onto-gear` — the belt is pulled to the rim point under the cursor, the
 * near side, and wraps the other way round.
 */
export type BeltGearApproach = "gear-onto-belt" | "belt-onto-gear";

/**
 * Which way a belt winds around a gear inserted in one of its straight sections.
 *
 * Always the gear's *centre* — a point on its rim answers a different question
 * and lands on either side of the section depending on where the cursor came
 * from. The gear may not exist yet, hence a position rather than the element.
 */
export function belt_wrap_direction(
  gearCenter: Point2,
  belt: BeltElement,
  section: number,
  mechanicalElements: MechanicalElement[],
  approach: BeltGearApproach,
): boolean {
  const left = is_on_left_side_of_belt(
    gearCenter,
    belt,
    section,
    mechanicalElements,
  );
  return approach === "gear-onto-belt" ? left : !left;
}

/**
 * Which way a belt winds around `gear` when it ARRIVES at the rim point
 * `contact`, coming from `from` — the previous via of the route.
 */
export function belt_wrap_arriving(
  gear: GearElement,
  from: Point2,
  contact: Point2,
): boolean {
  return gear.position.sub(from).perp().dot(contact.sub(gear.position)) > 0;
}

/**
 * Which way it winds when it LEAVES the rim point `contact` towards `to` — the
 * next via of the route. Travelling the other way round winds the other way.
 */
export function belt_wrap_leaving(
  gear: GearElement,
  contact: Point2,
  to: Point2,
): boolean {
  return gear.position.sub(contact).perp().dot(to.sub(gear.position)) > 0;
}

/** Is a point on the left side of a belt section. Reach it through belt_wrap_direction. */
function is_on_left_side_of_belt(
  position: Point2,
  belt: BeltElement,
  section: number,
  mechanicalElements: MechanicalElement[],
): boolean {
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  const piece = belt_pieces(vias, closed)[section];
  if (!piece || piece.kind !== "segment") return false;
  return position.is_on_left_side_of_line(piece.from, piece.to);
}
