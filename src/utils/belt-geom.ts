import { get_mechanical_element_from_id } from "../components/mechanism/connect-actions";
import { BeltElement, GearElement, ID, MechanicalElement, Point2 } from "../types";
import { BeltVia, belt_pieces, belt_wraps } from "./belt-path";

/**
 * Build the ordered via-points of a belt (start terminal → gears → end terminal) from the mechanism, resolving each attached gear.
 * Shared by the length measurement and the geometric solver's belt-length constraint.
 *
 * Pulleys the belt has lost contact with in simulation are left out: the belt runs straight past them, and its route is what everything downstream — the length, the hover, a dimension's leader — has to be read against.
 */
export function get_belt_vias(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): BeltVia[] {
  const dropped = new Set(belt.disconnectedGearIndices ?? []);
  const gears: BeltVia[] = belt.attachedGearsIDs.flatMap(
    ({ id, clockwise }, i) => {
      if (dropped.has(i)) return [];
      const gear = get_mechanical_element_from_id(
        id,
        mechanicalElements,
      ) as GearElement;
      return [{ pos: gear.position, radius: gear.radius, clockwise }];
    },
  );
  return [
    { pos: belt.positionStart, radius: 0, clockwise: false },
    ...gears,
    { pos: belt.positionEnd, radius: 0, clockwise: false },
  ];
}

/**
 * The belt as it will be once pulley `index` is off it.
 * Interpret a section index against this rather than the stored belt whenever a gesture carries a pending removal, since dropping a pulley renumbers the sections.
 *
 * `closed` is deliberately left untouched: whether the shortened belt still loops is settled at commit time, and flipping it here would renumber the sections a second time mid-gesture.
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
 * The via chain a belt's geometry is actually read from: a closed belt is the pulley cycle (no terminals — the junction rides on the loop), a loose one the terminal-to-terminal chain.
 * Feed the pair straight to `belt_pieces`.
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

/**
 * Where one strand of `belt` runs in the pose `mechanicalElements` holds: the tangent from the pulley `fromGear` to the pulley `toGear`, an absent gear standing for the terminal at that end.
 * `undefined` when either pulley is not on the belt.
 */
export function belt_strand_on_pose(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
  fromGear: ID | undefined,
  toGear: ID | undefined,
): { from: Point2; to: Point2 } | undefined {
  const via = (gearID: ID | undefined, terminal: Point2): BeltVia | undefined => {
    if (gearID === undefined) return { pos: terminal, radius: 0, clockwise: false };
    const attached = belt.attachedGearsIDs.find(({ id }) => id === gearID);
    const gear = mechanicalElements.find((el) => el.id === gearID);
    if (!attached || gear?.type !== "gear") return undefined;
    return { pos: gear.position, radius: gear.radius, clockwise: attached.clockwise };
  };
  const from = via(fromGear, belt.positionStart);
  const to = via(toGear, belt.positionEnd);
  if (!from || !to) return undefined;
  const segment = belt_pieces([from, to]).find((piece) => piece.kind === "segment");
  return segment && { from: segment.from, to: segment.to };
}

export function get_gear_angles(
  positionStart: Point2,
  positionEnd: Point2,
  attachedGears: {
    gear: GearElement;
    clockwise: boolean;
  }[],
): {
  center: Point2;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}[] {
  const gearAngles: {
    center: Point2;
    radius: number;
    startAngle: number;
    endAngle: number;
    clockwise: boolean;
  }[] = [];

  let lastPos = positionStart;

  if (attachedGears.length > 0) {
    lastPos = Point2.circles_link(
      positionStart,
      0,
      false,
      attachedGears[0].gear.position,
      attachedGears[0].gear.radius,
      attachedGears[0].clockwise,
    ).end;
  }

  for (let i = 0; i < attachedGears.length - 1; i++) {
    const { start, end } = Point2.circles_link(
      attachedGears[i].gear.position,
      attachedGears[i].gear.radius,
      attachedGears[i].clockwise,
      attachedGears[i + 1].gear.position,
      attachedGears[i + 1].gear.radius,
      attachedGears[i + 1].clockwise,
    );
    gearAngles.push({
      center: attachedGears[i].gear.position,
      radius: attachedGears[i].gear.radius,
      startAngle: lastPos.angle(),
      endAngle: start.angle(),
      clockwise: attachedGears[i].clockwise,
    });
    lastPos = end;
  }

  if (attachedGears.length > 0) {
    const { start } = Point2.circles_link(
      attachedGears[attachedGears.length - 1].gear.position,
      attachedGears[attachedGears.length - 1].gear.radius,
      attachedGears[attachedGears.length - 1].clockwise,
      positionEnd,
      0,
      false,
    );
    gearAngles.push({
      center: attachedGears[attachedGears.length - 1].gear.position,
      radius: attachedGears[attachedGears.length - 1].gear.radius,
      startAngle: lastPos.angle(),
      endAngle: start.angle(),
      clockwise: attachedGears[attachedGears.length - 1].clockwise,
    });
  }
  return gearAngles;
}

/**
 * A belt's mechanical length: tangent segments plus wrap arcs, at the bare radius (the drawing's `+BELT_WIDTH/2` is cosmetic).
 * A **tight** belt is a loop closed over its pulleys; a loose one is an open chain between its terminals.
 */
export function measure_belt_length(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): number {
  // Open chain: a terminal resting on its pulley's rim needs no special case — its tangent run is simply of length 0 and the arc already reaches it.
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  const shown = belt_pieces(vias, closed).reduce((acc, p) => acc + p.length, 0);
  // The whole turns a pulley carries are belt too, wound where the drawing coils it.
  return belt.attachedGearsIDs.reduce((acc, { id, turns }) => {
    const gear = mechanicalElements.find((el) => el.id === id);
    return gear?.type === "gear" && turns ? acc + 2 * Math.PI * gear.radius * turns : acc;
  }, shown);
}

/**
 * The wraps a route is drawn with in edition, in its own order: what the geometry shows, plus 2π per whole turn a pulley carries.
 * `held` keeps one pulley to a wrap a drag traced there: the end drawn can lag the one traced by a frame, and a pulley just caught then reads as wrapped by a whole turn, its wrap just under zero — drawn as no wrap at all instead.
 * `undefined` when neither changes anything, the geometry then saying it all.
 */
export function route_wraps(
  start: Point2,
  route: readonly { gear: GearElement; clockwise: boolean; turns?: number }[],
  end: Point2,
  closed: boolean,
  held?: { index: number; traced: number | undefined },
): number[] | undefined {
  if (!route.some(({ turns }) => turns) && held?.traced === undefined) return undefined;
  const pulleys: BeltVia[] = route.map(({ gear, clockwise }) => ({
    pos: gear.position,
    radius: gear.radius,
    clockwise,
  }));
  const vias = closed
    ? pulleys
    : [{ pos: start, radius: 0, clockwise: false }, ...pulleys, { pos: end, radius: 0, clockwise: false }];
  const shown = belt_wraps(vias, closed).slice(closed ? 0 : 1, closed ? undefined : -1);
  if (
    held?.traced !== undefined &&
    held.index >= 0 &&
    held.index < shown.length &&
    Math.abs(shown[held.index] - held.traced) > Math.PI
  )
    shown[held.index] = 0;
  return shown.map((wrap, i) => wrap + 2 * Math.PI * (route[i].turns ?? 0));
}

/**
 * The wrap of each pulley of `belt`, in `attachedGearsIDs` order, its whole turns included: what the geometry shows, plus 2π per turn.
 * `undefined` when no pulley carries any, the geometry then saying it all.
 * Edition's counterpart of the continuous wraps a simulation tracks: both the drawing's coils and the length's own reference read it.
 */
export function belt_wound_wraps(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
): number[] | undefined {
  if (!belt.attachedGearsIDs.some(({ turns }) => turns)) return undefined;
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  if (vias.length !== belt.attachedGearsIDs.length + (closed ? 0 : 2)) return undefined;
  const shown = belt_wraps(vias, closed);
  const first = closed ? 0 : 1;
  return belt.attachedGearsIDs.map(
    ({ turns }, i) => shown[first + i] + 2 * Math.PI * (turns ?? 0),
  );
}

/**
 * Which gesture brought the gear and the belt together, which decides where they touch and so which way the belt winds.
 *
 * `gear-onto-belt` — the gear is pressed against the section where it lies, so the belt bulges towards the gear and wraps its far side.
 * `belt-onto-gear` — the belt is pulled to the rim point under the cursor, the near side, and wraps the other way round.
 */
export type BeltGearApproach = "gear-onto-belt" | "belt-onto-gear";

/**
 * Which way a belt winds around a gear inserted in one of its straight sections.
 *
 * `referencePoint` is the gear's *centre* for `gear-onto-belt` — the gear's own position is what is growing or landing there, the cursor is incidental.
 * For `belt-onto-gear` it is the rim point under the cursor: the belt is being dragged onto a gear that already sits still, so the cursor is what picks which side it wraps.
 * The two only disagree when the gear's rim crosses the belt's line (its centre is closer to the line than its radius) — otherwise every rim point sits on the same side as the centre anyway.
 */
export function belt_wrap_direction(
  referencePoint: Point2,
  belt: BeltElement,
  section: number,
  mechanicalElements: MechanicalElement[],
  approach: BeltGearApproach,
): boolean {
  const left = is_on_left_side_of_belt(
    referencePoint,
    belt,
    section,
    mechanicalElements,
  );
  return approach === "gear-onto-belt" ? left : !left;
}

/**
 * Which way a belt winds around `gear` when it ARRIVES at the rim point `contact`, coming from `from` — the previous via of the route.
 */
export function belt_wrap_arriving(
  gear: GearElement,
  from: Point2,
  contact: Point2,
): boolean {
  return gear.position.sub(from).perp().dot(contact.sub(gear.position)) > 0;
}

/**
 * Which way it winds when it LEAVES the rim point `contact` towards `to` — the next via of the route.
 * Travelling the other way round winds the other way.
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
