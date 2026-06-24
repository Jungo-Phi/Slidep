import { get_mechanical_element_from_id } from "../components/mechanism/connect-actions";
import { BeltElement, GearElement, MechanicalElement, Point2 } from "../types";

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
  let gearAngles: {
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
 * Is a point is on the left side of a belt section, used to determine the direction of a gear
 */
export function is_on_left_side_of_belt(
  position: Point2,
  belt: BeltElement,
  section: number,
  mechanicalElements: MechanicalElement[],
): boolean {
  const attachedGears: { gear: GearElement; direction: boolean }[] =
    belt.attachedGearsIDs.map(({ id, direction }) => {
      return {
        gear: get_mechanical_element_from_id(
          id,
          mechanicalElements,
        ) as GearElement,
        direction,
      };
    });
  let gearAngles = get_gear_angles(
    belt.positionStart,
    belt.positionEnd,
    attachedGears,
  );
  // arc sections
  gearAngles.unshift({
    center: belt.positionStart,
    radius: 0,
    startAngle: 0,
    endAngle: 0,
    direction: false,
  });
  gearAngles.push({
    center: belt.positionEnd,
    radius: 0,
    startAngle: 0,
    endAngle: 0,
    direction: false,
  });
  const { center: c1, radius: r1, endAngle } = gearAngles[section / 2];
  const { center: c2, radius: r2, startAngle } = gearAngles[section / 2 + 1];
  const start = c1.add(Point2.from_polar(r1, endAngle));
  const end = c2.add(Point2.from_polar(r2, startAngle));
  return position.is_on_left_side_of_line(start, end);
}
