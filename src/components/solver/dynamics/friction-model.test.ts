import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../../../types/element";
import {
  CompiledFriction,
  compile_frictions,
  friction_power,
  resolve_friction_forces,
} from "./friction-model";

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const DT = 1e-3;

/** Every coefficient here is injected, never read off `DEFAULT`: what is under test is the law, not the value the app ships. */
const resolve = (
  compiled: CompiledFriction[],
  {
    positions = {},
    velocities = {},
    angleVelocities = {},
    posMasses = {},
    angleMasses = {},
    dt = DT,
  }: {
    positions?: Record<string, [number, number]>;
    velocities?: Record<string, [number, number]>;
    angleVelocities?: Record<string, number>;
    /** Real masses in kg — inverted here, so a test reads in the unit it thinks in. 0 anchors. */
    posMasses?: Record<string, number>;
    angleMasses?: Record<string, number>;
    dt?: number;
  },
) =>
  resolve_friction_forces(
    compiled,
    dt,
    new Map(Object.entries(positions).map(([k, [x, y]]) => [k, new Point2(x, y)])),
    new Map(Object.entries(velocities).map(([k, [x, y]]) => [k, new Point2(x, y)])),
    new Map(Object.entries(angleVelocities)),
    new Map(Object.entries(posMasses).map(([k, m]) => [k, m > 0 ? 1 / m : 0])),
    new Map(Object.entries(angleMasses).map(([k, j]) => [k, j > 0 ? 1 / j : 0])),
  );

const sum_forces = (forces: Map<string, Point2>): Point2 =>
  [...forces.values()].reduce((acc, f) => acc.add(f), new Point2(0, 0));

const slide: CompiledFriction = {
  kind: "slide",
  damping: 0.5,
  nodeKey: "node",
  railStartKey: "start",
  railEndKey: "end",
};

const HORIZONTAL_RAIL: { positions: Record<string, [number, number]> } = {
  positions: { node: [1, 0], start: [0, 0], end: [2, 0] },
};

describe("frottement de glissement", () => {
  it("s'oppose au glissement en proportion de sa vitesse", () => {
    const { forces } = resolve([slide], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [3, 0] },
      posMasses: { node: 1, start: 0, end: 0 },
    });
    // b·v = 0.5 × 3, against the motion.
    expect(forces.get("node")!.x).toBeCloseTo(-1.5, 12);
    expect(forces.get("node")!.y).toBeCloseTo(0, 12);
  });

  it("ignore la vitesse transversale au rail", () => {
    const { forces } = resolve([slide], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [0, 3] },
      posMasses: { node: 1, start: 0, end: 0 },
    });
    expect(forces.size).toBe(0);
  });

  it("mesure la vitesse RELATIVE : un rail qui suit le patin ne frotte pas", () => {
    const { forces } = resolve([slide], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [3, 0], start: [3, 0], end: [3, 0] },
      posMasses: { node: 1, start: 1, end: 1 },
    });
    expect(forces.size).toBe(0);
  });

  it("rend au rail ce qu'il prend au patin", () => {
    const { forces } = resolve([slide], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [3, 0] },
      posMasses: { node: 1, start: 1, end: 1 },
    });
    // The slider sits mid-span, so each rail end takes half the reaction.
    expect(forces.get("start")!.x).toBeCloseTo(-forces.get("node")!.x / 2, 12);
    expect(forces.get("end")!.x).toBeCloseTo(-forces.get("node")!.x / 2, 12);
    expect(sum_forces(forces).length()).toBeLessThan(1e-12);
  });

  it("ne dépasse jamais l'arrêt, si grand que soit le coefficient", () => {
    const mass = 1;
    const velocity = 3;
    const { forces } = resolve([{ ...slide, damping: 1e9 }], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [velocity, 0] },
      posMasses: { node: mass, start: 0, end: 0 },
    });
    // Δv = F·dt/m lands exactly on zero rather than shooting past it into a growing oscillation.
    expect((forces.get("node")!.x * DT) / mass).toBeCloseTo(-velocity, 9);
  });

  it("ne frotte pas quand ni le patin ni le rail ne peuvent bouger", () => {
    const { forces } = resolve([slide], {
      ...HORIZONTAL_RAIL,
      velocities: { node: [3, 0] },
      posMasses: { node: 0, start: 0, end: 0 },
    });
    expect(forces.size).toBe(0);
  });
});

/** A beam arm of length 1 turning about a grounded joint, spun counter-clockwise. */
const hinge: CompiledFriction = {
  kind: "hinge",
  damping: 0.5,
  pivotKey: "pivot",
  rotor: { kind: "arm", armKey: "arm" },
};

const GROUNDED_ARM: {
  positions: Record<string, [number, number]>;
  velocities: Record<string, [number, number]>;
  posMasses: Record<string, number>;
} = {
  positions: { pivot: [0, 0], arm: [1, 0] },
  velocities: { arm: [0, 2] }, // ω = +2 rad/s
  posMasses: { pivot: 0, arm: 1 },
};

describe("frottement de pivot", () => {
  it("freine la rotation en proportion de sa vitesse angulaire", () => {
    const { forces } = resolve([hinge], GROUNDED_ARM);
    // τ = b·ω = 0.5 × 2, delivered across an arm of 1 m, so 1 N against the arm's motion.
    expect(forces.get("arm")!.y).toBeCloseTo(-1, 12);
    expect(forces.get("arm")!.x).toBeCloseTo(0, 12);
  });

  it("mesure la rotation RELATIVE au corps qui porte le joint", () => {
    // Both arms swing the same way at the same rate: the joint itself never turns.
    const { forces } = resolve(
      [{ ...hinge, housing: { kind: "arm", armKey: "housing" } }],
      {
        positions: { pivot: [0, 0], arm: [1, 0], housing: [2, 0] },
        velocities: { arm: [0, 2], housing: [0, 4] },
        posMasses: { pivot: 1, arm: 1, housing: 1 },
      },
    );
    expect(forces.size).toBe(0);
  });

  it("applique le couple de réaction sur le corps porteur", () => {
    const { forces } = resolve(
      [{ ...hinge, housing: { kind: "arm", armKey: "housing" } }],
      {
        positions: { pivot: [0, 0], arm: [1, 0], housing: [-1, 0] },
        velocities: { arm: [0, 2] },
        posMasses: { pivot: 1, arm: 1, housing: 1 },
      },
    );
    expect(sum_forces(forces).length()).toBeLessThan(1e-12);
  });

  it("pose son couple sur le ddl d'angle d'un engrenage", () => {
    const { forces, torques } = resolve(
      [{ ...hinge, rotor: { kind: "angle", angleKey: "gear" } }],
      {
        positions: { pivot: [0, 0] },
        angleVelocities: { gear: 2 },
        posMasses: { pivot: 0 },
        angleMasses: { gear: 1 },
      },
    );
    expect(torques.get("gear")).toBeCloseTo(-1, 12);
    expect(forces.size).toBe(0);
  });

  it("ne dépasse jamais l'arrêt, si grand que soit le coefficient", () => {
    const { torques } = resolve(
      [{ ...hinge, damping: 1e9, rotor: { kind: "angle", angleKey: "gear" } }],
      {
        positions: { pivot: [0, 0] },
        angleVelocities: { gear: 2 },
        posMasses: { pivot: 0 },
        angleMasses: { gear: 0.5 },
      },
    );
    expect((torques.get("gear")! * DT) / 0.5).toBeCloseTo(-2, 9);
  });
});

describe("puissance dissipée", () => {
  it("vaut b·v² pour un patin, toujours positive", () => {
    const power = friction_power(
      [slide],
      new Map([
        ["node", new Point2(1, 0)],
        ["start", new Point2(0, 0)],
        ["end", new Point2(2, 0)],
      ]),
      new Map([["node", new Point2(-3, 0)]]),
      new Map(),
    );
    expect(power).toBeCloseTo(0.5 * 9, 12);
  });

  it("vaut b·ω² pour un pivot", () => {
    const power = friction_power(
      [hinge],
      new Map([
        ["pivot", new Point2(0, 0)],
        ["arm", new Point2(1, 0)],
      ]),
      new Map([["arm", new Point2(0, 2)]]),
      new Map(),
    );
    expect(power).toBeCloseTo(0.5 * 4, 12);
  });
});

// ── Compilation ──────────────────────────────────────────────────────────────

function beam(from: Point2, to: Point2, startNode?: ID): BeamElement {
  return {
    type: "beam",
    id: id(),
    probes: [],
    overlays: {},
    positionStart: from,
    positionEnd: to,
    fixedNodeStartID: startNode,
    fixedNodesBodyIDs: [],
    materialID: undefined,
    profileID: undefined,
  } as unknown as BeamElement;
}

function pivot(rotating: ID[], grounded: boolean, friction: number): PivotElement {
  return {
    type: "pivot",
    id: id(),
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: grounded,
    rotatingEdgesIDs: rotating,
    fixedGearsIDs: [],
    rotationalFriction: friction,
  };
}

const mechanism = (mechanicalElements: MechanicalElement[]): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2(0, 0) },
  simulation: DEFAULT_SIMULATION,
  mechanicalElements,
  constraintElements: [],
  loads: [],
  materials: [],
  profiles: [],
  history: [],
  future: [],
});

/** Two beams hinged on one pivot, the pivot's own id patched into both beams' start. */
function two_bar(grounded: boolean, friction: number) {
  const p = pivot([], grounded, friction);
  const a = beam(new Point2(0, 0), new Point2(1, 0), p.id);
  const b = beam(new Point2(0, 0), new Point2(0, 1), p.id);
  p.rotatingEdgesIDs = [a.id, b.id];
  return { pivot: p, elements: [p, a, b] };
}

describe("compilation", () => {
  it("ignore un joint sans frottement, pour ne rien coûter par sous-pas", () => {
    expect(compile_frictions(mechanism(two_bar(true, 0).elements), new Map())).toEqual([]);
  });

  it("fait frotter chaque barre contre le sol quand le pivot y est fixé", () => {
    const compiled = compile_frictions(
      mechanism(two_bar(true, 0.5).elements),
      new Map(),
    );
    expect(compiled).toHaveLength(2);
    expect(compiled.every((f) => f.kind === "hinge" && f.housing === undefined)).toBe(true);
  });

  it("fait frotter la seconde barre contre la première quand le pivot est libre", () => {
    const compiled = compile_frictions(
      mechanism(two_bar(false, 0.5).elements),
      new Map(),
    );
    // One bearing, not two: the joint's own rotation is the pair's relative one.
    expect(compiled).toHaveLength(1);
    expect(compiled[0].kind === "hinge" && compiled[0].housing).toBeDefined();
  });

  it("ne compile rien pour un pivot libre qui ne porte qu'une barre", () => {
    const p = pivot([], false, 0.5);
    const a = beam(new Point2(0, 0), new Point2(1, 0), p.id);
    p.rotatingEdgesIDs = [a.id];
    expect(compile_frictions(mechanism([p, a]), new Map())).toEqual([]);
  });
});
