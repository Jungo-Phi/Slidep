import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { Link } from "../../../types";
import { PBD_kinematic_solver } from "../kinematics/PBD_kinematic_solver";

/**
 * `MinDistanceToSegment` is `MinDistance`'s counterpart for a point against a segment
 * (extremities included) rather than another point — the primitive collisions are built on
 * (see plan `swift-bouncing-kitten`).
 */

const P = (x: number, y: number) => new Point2(x, y);
const SWEEPS = 200;

/** A point pulled (via HandleGrab) from `from` toward `pullTo`, against a fixed segment
 *  from (0,0) to (100,0), with or without the contact link. `side` is `+1` for the segment's
 *  `(0,1)` normal side (where every `from` below is), matching what `collision_links` would
 *  read off `from`. Returns where the point ends up. */
function pull_against_segment(
  offset: number | undefined,
  from: Point2,
  pullTo: Point2,
  side: number = 1,
): Point2 {
  const positions = new Map([
    ["segStart", P(0, 0)],
    ["segEnd", P(100, 0)],
    ["node", from],
  ]);
  const links: Link[] = [
    { type: "HandleGrab", ddl: 1, grabbedKey: "node", value: pullTo },
  ];
  if (offset !== undefined)
    links.unshift({
      type: "MinDistanceToSegment",
      ddl: 0,
      key1: "segStart",
      key2: "segEnd",
      key3: "node",
      offset,
      side,
    });
  PBD_kinematic_solver(
    positions,
    new Map(),
    new Map([
      ["segStart", 0],
      ["segEnd", 0],
      ["node", 1],
    ]),
    new Map(),
    links,
    SWEEPS,
    undefined,
    undefined,
    false,
    "constraints",
  );
  return positions.get("node")!;
}

describe("MinDistanceToSegment", () => {
  it("laisse un point hors de portée intact", () => {
    const stopped = pull_against_segment(5, P(50, 20), P(50, 15));
    expect(stopped.distance_to(P(50, 15))).toBeLessThan(0.5);
  });

  it("arrête un point tiré dans la bande de contact à `offset` du segment", () => {
    const stopped = pull_against_segment(5, P(50, 20), P(50, 2));
    expect(stopped.y).toBeCloseTo(5, 1);
  });

  it("bloque même un saut d'un seul coup qui traverserait toute la bande", () => {
    // `side` est fixé une fois pour toutes (lu sur `from`, comme le ferait
    // `collision_links`), donc la porte reste signée même si une seule correction de grab
    // envoie le point loin de l'autre côté — contrairement à une porte non signée
    // (`distance >= offset`), qui lirait ce point comme "arrivé, dégagé".
    const stopped = pull_against_segment(5, P(50, 20), P(50, -200));
    expect(stopped.y).toBeCloseTo(5, 0);
  });

  it("sans la contrainte, le point atteint sa cible", () => {
    const reached = pull_against_segment(undefined, P(50, 20), P(50, 2));
    expect(reached.distance_to(P(50, 2))).toBeLessThan(0.5);
  });

  it("respecte les extrémités : au-delà, rien ne bloque", () => {
    // Tiré vers un point aligné avec le segment mais hors de son étendue (x=150) :
    // le pied de perpendiculaire clampe à l'extrémité (100,0), à plus de 50 de distance —
    // hors de portée d'un offset de 5, donc rien ne bloque le trajet.
    const passed = pull_against_segment(5, P(150, 20), P(150, 2));
    expect(passed.distance_to(P(150, 2))).toBeLessThan(0.5);
  });
});
