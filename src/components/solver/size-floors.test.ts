import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type { Link } from "../../types";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";

/**
 * Ce que deviennent l'engrènement et la longueur d'une barre quand on pousse au-delà de
 * ce que la borne autorise.
 *
 * Les planchers sont injectés, jamais lus de l'app : ce qui est vérifié ici est le partage
 * de la correction entre la grandeur planchée et le reste, pas la valeur des bornes.
 */

const P = (x: number, y: number) => new Point2(x, y);
const SWEEPS = 300;

/** Le solve sort sur un résidu, pas sur l'exactitude : « engrené » se lit à cette marge. */
const MESHED = 0.01;
const meshed = ({ rA, rB, span }: { rA: number; rB: number; span: number }) =>
  Math.abs(span - (rA + rB));

/** Deux engrenages tangents, le premier ancré, le second tiré vers lui jusqu'à `pullTo`. */
function push_together(radiusFloor: number, pullTo: number) {
  const positions = new Map([
    ["a", P(0, 0)],
    ["b", P(300, 0)],
  ]);
  const radii = new Map([
    ["a", 100],
    ["b", 200],
  ]);
  const links: Link[] = [
    {
      type: "GearMeshing",
      ddl: 1,
      key1: "a",
      key2: "b",
      radKey1: "a",
      radKey2: "b",
    },
    { type: "HandleGrab", ddl: 1, grabbedKey: "b", value: P(pullTo, 0) },
  ];
  const solved = PBD_kinematic_solver(
    positions,
    radii,
    new Map([
      ["a", 0],
      ["b", 1],
    ]),
    new Map([
      ["a", 1],
      ["b", 1],
    ]),
    links,
    SWEEPS,
    undefined,
    undefined,
    false,
    "constraints",
    radiusFloor,
  );
  return {
    rA: solved.radii.get("a")!,
    rB: solved.radii.get("b")!,
    span: solved.positions.get("a")!.distance_to(solved.positions.get("b")!),
  };
}

describe("le plancher de rayon", () => {
  const FLOOR = 60;

  it("arrête les centres au lieu d'écraser les rayons", () => {
    const solved = push_together(FLOOR, 5);
    expect(solved.rA).toBeGreaterThanOrEqual(FLOOR);
    expect(solved.rB).toBeGreaterThanOrEqual(FLOOR);
    // Les deux rayons au plancher, l'engrènement veut exactement leur somme : la
    // correction que les rayons refusent est passée aux positions, qui s'arrêtent là
    // au lieu de suivre la prise jusqu'à 5.
    expect(meshed(solved)).toBeLessThan(MESHED);
    expect(solved.span).toBeGreaterThan(2 * FLOOR - MESHED);
  });

  it("sans lui, les rayons encaissent tout", () => {
    const solved = push_together(0, 5);
    expect(solved.rA).toBeLessThan(FLOOR);
    expect(solved.rB).toBeLessThan(FLOOR);
    expect(meshed(solved)).toBeLessThan(MESHED);
  });

  it("laisse regrandir un rayon dès qu'il y a la place", () => {
    // Tiré vers l'extérieur : le plancher est unilatéral, il ne retient rien.
    const solved = push_together(FLOOR, 600);
    expect(solved.rA).toBeGreaterThan(100);
    expect(solved.rB).toBeGreaterThan(200);
    expect(meshed(solved)).toBeLessThan(MESHED);
  });

  it("ne repousse pas un engrenage déjà sous le plancher", () => {
    const positions = new Map([["g", P(0, 0)]]);
    const radii = new Map([["g", 4]]);
    const solved = PBD_kinematic_solver(
      positions,
      radii,
      new Map([["g", 1]]),
      new Map([["g", 1]]),
      [{ type: "Radius", ddl: 1, key1: "g", radius: 4 }],
      SWEEPS,
      undefined,
      undefined,
      false,
      "constraints",
      FLOOR,
    );
    expect(solved.radii.get("g")).toBeCloseTo(4);
  });
});

/**
 * Une barre entre deux nœuds, le premier ancré, le second tiré vers `pullTo`.
 * `minLength` à `undefined` : la même barre sans plancher, pour comparer.
 */
function squeeze_bar(minLength: number | undefined, pullTo: number) {
  const positions = new Map([
    ["s", P(0, 0)],
    ["e", P(300, 0)],
  ]);
  const links: Link[] = [
    { type: "HandleGrab", ddl: 1, grabbedKey: "e", value: P(pullTo, 0) },
  ];
  if (minLength !== undefined)
    links.unshift({
      type: "MinDistance",
      ddl: 0,
      key1: "s",
      key2: "e",
      distance: minLength,
    });
  PBD_kinematic_solver(
    positions,
    new Map(),
    new Map([
      ["s", 0],
      ["e", 1],
    ]),
    new Map(),
    links,
    SWEEPS,
    undefined,
    undefined,
    false,
    "constraints",
  );
  return positions.get("s")!.distance_to(positions.get("e")!);
}

describe("le plancher de longueur", () => {
  const FLOOR = 80;

  it("arrête la barre au lieu de la laisser se replier", () => {
    expect(squeeze_bar(undefined, 5)).toBeLessThan(FLOOR);
    expect(squeeze_bar(FLOOR, 5)).toBeGreaterThan(FLOOR - MESHED);
  });

  // Une `Distance` ramènerait aussi la barre à 80 : elle tire dans les deux sens. Une
  // inégalité inactive ne fait rien du tout, et « rien » se lit au bit près.
  it("ne dit rien tant qu'elle est plus longue", () => {
    expect(squeeze_bar(FLOOR, 200)).toBe(squeeze_bar(undefined, 200));
  });
});
