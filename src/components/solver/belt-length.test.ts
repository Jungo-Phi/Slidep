import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { rewire_belt_mesh, update_belt_disconnects } from "./kinematic-simulation";
import {
  applyBeltLengthConstraint,
  applyBeltFollowsTangentConstraint,
  applyBeltJunctionConstraint,
  applyBeltPhaseGearConstraint,
  applyBeltPinConstraint,
} from "./constraint-functions";
import {
  advance_continuous_wraps,
  belt_pieces,
  belt_point_tangent,
  belt_project,
  belt_wraps,
  compute_belt_path,
  BeltVia,
} from "../../utils/belt-path";

const P = (x: number, y: number) => new Point2(x, y);

/** Rebuild the belt via-list from solver positions to measure the length. */
function beltLength(
  positions: Map<string, Point2>,
  radii: number[],
): number {
  const vias: BeltVia[] = [
    { pos: positions.get("start")!, radius: 0, direction: false },
    { pos: positions.get("gearA")!, radius: radii[0], direction: false },
    { pos: positions.get("gearB")!, radius: radii[1], direction: false },
    { pos: positions.get("end")!, radius: 0, direction: false },
  ];
  return compute_belt_path(vias).length;
}

describe("BeltLength constraint (simulation)", () => {
  it("conserves total belt length when a pulley is dragged (and pulls the far pulley)", () => {
    const radii = [40, 40];
    const positions = new Map<string, Point2>([
      ["start", P(-200, 120)],
      ["gearA", P(-100, 0)],
      ["gearB", P(100, 0)],
      ["end", P(200, 120)],
    ]);
    // Terminals anchored, gears free to translate.
    const posMasses = new Map<string, number>([
      ["start", 0],
      ["gearA", 1],
      ["gearB", 1],
      ["end", 0],
    ]);

    const L0 = beltLength(positions, radii);
    const gearBStart = positions.get("gearB")!.clone();

    const links: Link[] = [
      {
        type: "BeltLength",
        ddl: 1,
        startKey: "start",
        endKey: "end",
        gearPosKeys: ["gearA", "gearB"],
        gearAngleKeys: ["gearA", "gearB"],
        radii,
        directions: [false, false],
        length: L0,
        closed: false,
      },
      { type: "HandleGrab", ddl: 1, grabbedKey: "gearA", value: P(-320, 0) },
    ];

    const solved = PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      links,
      300,
    );

    expect(beltLength(solved.positions, radii)).toBeCloseTo(L0, 2);
    expect(
      solved.positions.get("gearA")!.distance_to(P(-100, 0)),
    ).toBeGreaterThan(5);
    // Transmission: the far pulley was pulled along, not left in place.
    expect(
      solved.positions.get("gearB")!.distance_to(gearBStart),
    ).toBeGreaterThan(5);
  });

  it("conserves a tight belt's closed-loop length (and pulls the far pulley)", () => {
    const positions = new Map<string, Point2>([
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([["gA", 1], ["gB", 1]]);
    const loopLen = (pos: Map<string, Point2>) =>
      belt_pieces(
        [
          { pos: pos.get("gA")!, radius: 40, direction: false },
          { pos: pos.get("gB")!, radius: 40, direction: false },
        ],
        true,
      ).reduce((a, p) => a + p.length, 0);
    const L0 = loopLen(positions);
    const gBStart = positions.get("gB")!.clone();

    const links: Link[] = [
      {
        type: "BeltLength",
        ddl: 1,
        startKey: "s",
        endKey: "e",
        gearPosKeys: ["gA", "gB"],
        gearAngleKeys: ["gA", "gB"],
        radii: [40, 40],
        directions: [false, false],
        length: L0,
        closed: true,
      },
      { type: "HandleGrab", ddl: 1, grabbedKey: "gA", value: P(-260, 0) },
    ];
    const solved = PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      links,
      300,
    );
    expect(loopLen(solved.positions)).toBeCloseTo(L0, 1);
    expect(solved.positions.get("gA")!.distance_to(P(-100, 0))).toBeGreaterThan(5);
    expect(solved.positions.get("gB")!.distance_to(gBStart)).toBeGreaterThan(5);
  });
});

describe("BeltJunction constraint (closed cycle)", () => {
  it("pulls the junction onto the nearest tangent run of the belt loop", () => {
    // Two equal pulleys on the x-axis: the closed belt has external tangents at
    // y = ±40. J just above the top one → snaps onto y = 40.
    const positions = new Map<string, Point2>([
      ["J", P(0, 20)],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 0],
      ["gB", 0],
    ]);

    let residual = 0;
    for (let i = 0; i < 50; i++)
      residual = applyBeltJunctionConstraint(
        positions,
        posMasses,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
      );
    expect(residual).toBeLessThan(1e-6);
    expect(Math.abs(positions.get("J")!.y)).toBeCloseTo(40, 3);
    expect(positions.get("gA")!.equals(P(-100, 0))).toBe(true);
    expect(positions.get("gB")!.equals(P(100, 0))).toBe(true);
  });

  it("snaps the junction onto a gear arc when that is the nearest piece", () => {
    // J past the outer edge of gA (well beyond both tangent runs) → nearest
    // piece is gA's arc: |J − gA| = 40.
    const positions = new Map<string, Point2>([
      ["J", P(-150, 0)],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    let residual = 0;
    for (let i = 0; i < 50; i++)
      residual = applyBeltJunctionConstraint(
        positions,
        posMasses,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
      );
    expect(residual).toBeLessThan(1e-6);
    expect(positions.get("J")!.distance_to(P(-100, 0))).toBeCloseTo(40, 3);
  });

  it("does not snap the junction onto a pulley's free (non-contact) side", () => {
    // J on gA's circle but on the side facing gB (never wrapped by the belt).
    // It must snap to a real contact run (a tangent at y = ±40), not stay put.
    const positions = new Map<string, Point2>([
      ["J", P(-60, 0)],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 80; i++)
      applyBeltJunctionConstraint(
        positions,
        posMasses,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
      );
    expect(Math.abs(positions.get("J")!.y)).toBeCloseTo(40, 3);
  });

  it("is symmetric: a free gear also moves toward the junction", () => {
    const positions = new Map<string, Point2>([
      ["J", P(0, 20)],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 1],
      ["gB", 1],
    ]);
    for (let i = 0; i < 100; i++)
      applyBeltJunctionConstraint(
        positions,
        posMasses,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
      );
    expect(positions.get("gA")!.distance_to(P(-100, 0))).toBeGreaterThan(1e-3);
    expect(positions.get("gB")!.distance_to(P(100, 0))).toBeGreaterThan(1e-3);
  });
});

describe("BeltPhaseGear constraint (no-slip transmission via shared φ)", () => {
  // Two pulleys coupled to the same belt travel φ. Drive g1 (held each iter, like
  // a motor); read how g2 follows through φ.
  const drive = (
    r1: number,
    r2: number,
    eps1: number,
    eps2: number,
    driven: number,
  ): number => {
    const angles = new Map<string, number>([
      ["g1", driven],
      ["g2", 0],
      ["phi", 0],
    ]);
    for (let i = 0; i < 200; i++) {
      angles.set("g1", driven);
      applyBeltPhaseGearConstraint(angles, "g1", "phi", r1, eps1, 0);
      applyBeltPhaseGearConstraint(angles, "g2", "phi", r2, eps2, 0);
    }
    return angles.get("g2")!;
  };

  it("spins both pulleys the same way (same sense, equal radii)", () => {
    expect(drive(40, 40, 1, 1, 0.5)).toBeCloseTo(0.5, 4);
  });

  it("scales rotation by the radius ratio", () => {
    // r1·ε1·θ1 = r2·ε2·θ2 → θ2 = θ1·r1/r2 = 1.0·20/40 = 0.5
    expect(drive(20, 40, 1, 1, 1.0)).toBeCloseTo(0.5, 4);
  });

  it("reverses the far pulley for a crossed belt (opposite sense)", () => {
    expect(drive(40, 40, 1, -1, 0.5)).toBeCloseTo(-0.5, 4);
  });
});

describe("belt_point_tangent (parametrization)", () => {
  // Closed belt around two equal pulleys: arcs (π·40) + two tangents (200).
  const vias: BeltVia[] = [
    { pos: P(-100, 0), radius: 40, direction: false },
    { pos: P(100, 0), radius: 40, direction: false },
  ];
  const L = belt_pieces(vias, true).reduce((a, p) => a + p.length, 0);

  it("returns a unit tangent matching finite differences", () => {
    const h = 0.01;
    // Sample the middle of each of the 4 pieces (avoid boundaries).
    for (const s of [L * 0.1, L * 0.35, L * 0.6, L * 0.85]) {
      const a = belt_point_tangent(vias, s, true);
      expect(a.tangent.length()).toBeCloseTo(1, 6);
      const b = belt_point_tangent(vias, s + h, true);
      const fd = b.point.sub(a.point).mul(1 / h);
      expect(fd.x).toBeCloseTo(a.tangent.x, 2);
      expect(fd.y).toBeCloseTo(a.tangent.y, 2);
    }
  });

  it("wraps and closes the loop", () => {
    const a = belt_point_tangent(vias, 0, true);
    const b = belt_point_tangent(vias, L, true);
    expect(a.point.distance_to(b.point)).toBeLessThan(1e-6);
  });
});

describe("BeltPin constraint (junction travels with the belt)", () => {
  const vias: BeltVia[] = [
    { pos: P(-100, 0), radius: 40, direction: false },
    { pos: P(100, 0), radius: 40, direction: false },
  ];
  const rEps = 40 * 1; // radius · (dir false → +1) for the reference gear
  const s0 = belt_project(vias, P(0, 40), true).s; // junction starts on top run
  const J0 = belt_point_tangent(vias, s0, true).point;

  it("moves the junction along the loop as the reference pulley turns", () => {
    const positions = new Map<string, Point2>([
      ["J", J0.clone()],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([["J", 1], ["gA", 0], ["gB", 0]]);
    const dth = 0.1;
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    // Drive the reference pulley (held each iteration, like a motor).
    for (let i = 0; i < 80; i++) {
      angles.set("gA", dth);
      applyBeltPinConstraint(
        positions, posMasses, angles,
        "J", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0,
      );
    }
    const expected = belt_point_tangent(vias, s0 + rEps * dth, true).point;
    expect(positions.get("J")!.distance_to(expected)).toBeLessThan(0.5);
    expect(positions.get("J")!.distance_to(J0)).toBeGreaterThan(1); // it moved
  });

  it("is symmetric: dragging the junction along the belt turns the pulley", () => {
    // Hold the junction 10px forward along the (horizontal) top run.
    const T = belt_point_tangent(vias, s0, true).tangent;
    const dragged = J0.add(T.mul(10));
    const positions = new Map<string, Point2>([
      ["J", dragged.clone()],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([["J", 1], ["gA", 0], ["gB", 0]]);
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    for (let i = 0; i < 80; i++) {
      positions.set("J", dragged.clone()); // grabbed
      applyBeltPinConstraint(
        positions, posMasses, angles,
        "J", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0,
      );
    }
    // Belt advanced by 10 arc-length → θ_ref = 10 / rEps = +0.25 rad.
    expect(angles.get("gA")!).toBeCloseTo(10 / rEps, 2);
  });

  it("is symmetric: dragging the junction off the belt drags the pulleys", () => {
    // Hold J 20px above the top run; the free pulleys must rise so the belt
    // reaches it (top external tangent sits at gear.y + 40 → gears → y ≈ 20).
    const held = P(0, 60);
    const positions = new Map<string, Point2>([
      ["J", held.clone()],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([["J", 1], ["gA", 1], ["gB", 1]]);
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    for (let i = 0; i < 200; i++) {
      positions.set("J", held.clone()); // grabbed
      applyBeltPinConstraint(
        positions, posMasses, angles,
        "J", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0,
      );
    }
    expect(positions.get("gA")!.y).toBeGreaterThan(10); // pulled up toward J
    expect(positions.get("gB")!.y).toBeGreaterThan(10);
  });
});

describe("belt_project", () => {
  const vias: BeltVia[] = [
    { pos: P(-100, 0), radius: 40, direction: false },
    { pos: P(100, 0), radius: 40, direction: false },
  ];
  it("returns an on-belt point matching belt_point_tangent at s", () => {
    for (const q of [P(0, 60), P(-130, 30), P(0, -50)]) {
      const { s, point } = belt_project(vias, q, true);
      const at = belt_point_tangent(vias, s, true).point;
      expect(point.distance_to(at)).toBeLessThan(1e-6);
    }
  });
});

describe("BeltFollowsTangent constraint (welded beam orientation)", () => {
  const vias: BeltVia[] = [
    { pos: P(-100, 0), radius: 40, direction: false },
    { pos: P(100, 0), radius: 40, direction: false },
  ];
  const s0 = 62.8; // mid gA arc (curvature ≠ 0)
  const tangentAngle = (s: number) =>
    belt_point_tangent(vias, s, true).tangent.angle();

  const angDiff = (a: number, b: number) => {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  };

  it("aligns the beam with the belt tangent at the junction", () => {
    const positions = new Map<string, Point2>([
      ["piv", P(0, 0)],
      ["end", P(50, 0)],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["piv", 0],
      ["end", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    for (let i = 0; i < 80; i++) {
      angles.set("gA", 0);
      applyBeltFollowsTangentConstraint(
        positions, posMasses, angles,
        "piv", "end", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0, 0,
      );
    }
    const beam = positions.get("end")!.sub(positions.get("piv")!);
    expect(Math.abs(angDiff(beam.angle(), tangentAngle(s0)))).toBeLessThan(1e-3);
  });

  it("is symmetric on an arc: rotating the beam advances the belt", () => {
    // Hold the beam 0.2 rad past the tangent; the pulley angle must move so the
    // tangent catches up. Curvature·rEps = (1/40)·(+40) = +1 → Δθ = +0.2.
    const a = tangentAngle(s0) + 0.2;
    const positions = new Map<string, Point2>([
      ["piv", P(0, 0)],
      ["end", P(50 * Math.cos(a), 50 * Math.sin(a))],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["piv", 0],
      ["end", 0],
      ["gA", 0],
      ["gB", 0],
    ]);
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    for (let i = 0; i < 80; i++)
      applyBeltFollowsTangentConstraint(
        positions, posMasses, angles,
        "piv", "end", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0, 0,
      );
    expect(angles.get("gA")!).toBeCloseTo(0.2, 2);
  });

  it("is symmetric: a FREE pivot (junction) moves too, it is not held fixed", () => {
    // Beam held off the tangent with BOTH ends free (mass 1). The old asymmetric
    // constraint rotated only `end` about a fixed `piv`; the symmetric one turns
    // the beam about its centre, so the pivot (junction) moves as well — the
    // motion BeltPin then converts into belt travel when driving the far end.
    const a = tangentAngle(s0) + 0.3;
    const positions = new Map<string, Point2>([
      ["piv", P(0, 0)],
      ["end", P(50 * Math.cos(a), 50 * Math.sin(a))],
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["piv", 1],
      ["end", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    const angles = new Map<string, number>([["gA", 0], ["gB", 0]]);
    for (let i = 0; i < 120; i++)
      applyBeltFollowsTangentConstraint(
        positions, posMasses, angles,
        "piv", "end", ["gA", "gB"], [40, 40], [false, false], 0, "gA", s0, 0, 0,
      );
    // The pivot moved off its start (asymmetric code left it at the origin)…
    expect(positions.get("piv")!.distance_to(P(0, 0))).toBeGreaterThan(1);
    // …and the constraint converged (beam aligned to the — now advanced — tangent).
    const beam = positions.get("end")!.sub(positions.get("piv")!);
    expect(
      Math.abs(angDiff(beam.angle(), tangentAngle(angles.get("gA")! * 40 + s0))),
    ).toBeLessThan(1e-2);
  });
});

describe("continuous wrap tracking (mid-sim disconnect signal)", () => {
  // Open belt, middle pulley wrapped; slide it down through the g0–g2 line so
  // its wrap shrinks to 0 and past. Terminals (ends) carry no arc.
  const mk = (y: number): BeltVia[] => [
    { pos: P(-100, 0), radius: 30, direction: false },
    { pos: P(0, y), radius: 30, direction: false },
    { pos: P(100, 0), radius: 30, direction: false },
  ];

  it("goes negative when a pulley loses contact (no 2π jump)", () => {
    // Middle pulley pokes up from below (small wrap); raise it through the
    // g0–g2 line → contact vanishes at 0 and goes negative beyond.
    let wraps = advance_continuous_wraps(mk(-20), undefined); // seed low
    for (let y = -20; y <= 10; y += 1)
      wraps = advance_continuous_wraps(mk(y), wraps);
    // Continuous wrap dropped below 0 (contact lost)…
    expect(wraps[1]).toBeLessThan(0);
    // …whereas the RAW wrap has spuriously wrapped around to a large value.
    expect(belt_wraps(mk(10))[1]).toBeGreaterThan(Math.PI);
  });

  it("seeds with the raw wrap on the first frame", () => {
    const seeded = advance_continuous_wraps(mk(-20), undefined);
    expect(seeded).toEqual(belt_wraps(mk(-20)));
  });

  it("BeltLength skips a disconnected pulley (belt runs straight past it)", () => {
    // Middle pulley gB disconnected → belt goes start→gA→gC→end directly.
    const positions = new Map<string, Point2>([
      ["start", P(-250, 0)],
      ["gA", P(-120, 0)],
      ["gB", P(0, 80)],
      ["gC", P(120, 0)],
      ["end", P(250, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["start", 0],
      ["gA", 1],
      ["gB", 1],
      ["gC", 1],
      ["end", 0],
    ]);
    const reduced: BeltVia[] = [
      { pos: P(-250, 0), radius: 0, direction: false },
      { pos: P(-120, 0), radius: 30, direction: false },
      { pos: P(120, 0), radius: 30, direction: false },
      { pos: P(250, 0), radius: 0, direction: false },
    ];
    const L0 = belt_pieces(reduced, false).reduce((a, p) => a + p.length, 0);
    const gBStart = positions.get("gB")!.clone();
    const links: Link[] = [
      {
        type: "BeltLength",
        ddl: 1,
        startKey: "start",
        endKey: "end",
        gearPosKeys: ["gA", "gB", "gC"],
        gearAngleKeys: ["gA", "gB", "gC"],
        radii: [30, 30, 30],
        directions: [false, false, false],
        length: L0,
        closed: false,
        disconnected: [false, true, false],
      },
      { type: "HandleGrab", ddl: 1, grabbedKey: "gA", value: P(-200, 0) },
    ];
    const solved = PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      links,
      300,
    );
    // Disconnected gB untouched by the belt; connected gC pulled by the belt.
    expect(solved.positions.get("gB")!.distance_to(gBStart)).toBeLessThan(1e-6);
    expect(solved.positions.get("gC")!.distance_to(P(120, 0))).toBeGreaterThan(2);
  });
});

describe("BeltLength constraint — loose belt terminals ↔ φ", () => {
  const r = 40;
  const dir = false;
  const c = P(0, 0);
  // "n" belt: start bottom-left, over the top of the gear, end bottom-right.
  const start0 = P(-120, -120);
  const end0 = P(120, -120);
  const viasOf = (s: Point2, e: Point2): BeltVia[] => [
    { pos: s, radius: 0, direction: false },
    { pos: c, radius: r, direction: dir },
    { pos: e, radius: 0, direction: false },
  ];
  const path0 = compute_belt_path(viasOf(start0, end0));
  const L0 = path0.length;
  const diff0 =
    start0.distance_to(path0.inPoints[0]) - end0.distance_to(path0.outPoints[1]);
  const mkLink = (): Extract<Link, { type: "BeltLength" }> => ({
    type: "BeltLength",
    ddl: 1,
    startKey: "start",
    endKey: "end",
    gearPosKeys: ["g"],
    gearAngleKeys: ["g"],
    radii: [r],
    directions: [dir],
    length: L0,
    closed: false,
    phaseKey: "phi",
    diff0,
  });
  const setup = () => ({
    positions: new Map<string, Point2>([
      ["g", c.clone()], ["start", start0.clone()], ["end", end0.clone()],
    ]),
    posMasses: new Map<string, number>([["g", 0], ["start", 1], ["end", 1]]),
    angles: new Map<string, number>([["g", 0], ["phi", 0]]),
  });
  const measure = (positions: Map<string, Point2>) =>
    compute_belt_path(viasOf(positions.get("start")!, positions.get("end")!)).length;

  it("conserves the total length as a motor drives φ (both directions)", () => {
    for (const omega of [0.02, -0.02]) {
      const { positions, posMasses, angles } = setup();
      const link = mkLink();
      for (let f = 0; f < 100; f++) {
        const theta = angles.get("g")! + omega;
        for (let it = 0; it < 200; it++) {
          angles.set("g", theta); // motor pins θ
          applyBeltPhaseGearConstraint(angles, "g", "phi", r, dir ? -1 : 1, 0);
          applyBeltLengthConstraint(positions, posMasses, angles, link);
        }
      }
      expect(measure(positions)).toBeCloseTo(L0, 0); // length held
      expect(Math.abs(angles.get("phi")!)).toBeGreaterThan(50); // motor ran freely
    }
  });

  it("is bidirectional: dragging a free end advances φ", () => {
    const { positions, posMasses, angles } = setup();
    const link = mkLink();
    const held = P(-70, -70); // start dragged toward the gear
    for (let it = 0; it < 400; it++) {
      positions.set("start", held.clone()); // grabbed
      applyBeltLengthConstraint(positions, posMasses, angles, link);
    }
    expect(Math.abs(angles.get("phi")!)).toBeGreaterThan(5); // pulley turned
  });

  it("winds a terminal onto its pulley when exhausted (orbits, no block)", () => {
    // Short belt so the start run exhausts quickly; the motor keeps turning.
    const s = P(-60, -30);
    const e = P(60, -30);
    const vias = viasOf(s, e);
    const pth = compute_belt_path(vias);
    const link: Extract<Link, { type: "BeltLength" }> = {
      ...mkLink(),
      length: pth.length,
      diff0: s.distance_to(pth.inPoints[0]) - e.distance_to(pth.outPoints[1]),
    };
    const positions = new Map<string, Point2>([["g", c.clone()], ["start", s.clone()], ["end", e.clone()]]);
    const posMasses = new Map<string, number>([["g", 0], ["start", 1], ["end", 1]]);
    const angles = new Map<string, number>([["g", 0], ["phi", 0]]);
    let phiAtStall = 0;
    for (let f = 0; f < 150; f++) {
      const theta = angles.get("g")! + 0.02;
      for (let it = 0; it < 200; it++) {
        angles.set("g", theta);
        applyBeltPhaseGearConstraint(angles, "g", "phi", r, dir ? -1 : 1, 0);
        applyBeltLengthConstraint(positions, posMasses, angles, link);
      }
      if (f === 80) phiAtStall = angles.get("phi")!;
    }
    expect(link.startWind).not.toBeUndefined(); // wound on
    expect(angles.get("phi")! - phiAtStall).toBeGreaterThan(30); // still turning, no block
    expect(positions.get("start")!.distance_to(c)).toBeCloseTo(r, 2); // orbiting the rim
    expect(measure(positions)).toBeCloseTo(pth.length, 0); // length held while wound
  });

});

describe("BeltLength — pull a free end: reel-in → wind → unwind → detach", () => {
  // Single-pulley loose belt. Faithful per-frame sim (mirrors step_simulation's belt
  // handling): update_belt_disconnects, mark the grabbed terminal, then PBD solve.
  const r = 40;
  const c = P(0, 0);
  const viasOf = (s: Point2, e: Point2): BeltVia[] => [
    { pos: s, radius: 0, direction: false },
    { pos: c, radius: r, direction: false },
    { pos: e, radius: 0, direction: false },
  ];
  const mkLink = (
    s0: Point2,
    e0: Point2,
    wound?: { end?: boolean },
  ): Extract<Link, { type: "BeltLength" }> => {
    const path = compute_belt_path(viasOf(s0, e0));
    const link: Extract<Link, { type: "BeltLength" }> = {
      type: "BeltLength", ddl: 1, startKey: "start", endKey: "end",
      gearPosKeys: ["g"], gearAngleKeys: ["g"], radii: [r], directions: [false],
      length: path.length, closed: false, phaseKey: "phi",
      diff0:
        s0.distance_to(path.inPoints[0]) - e0.distance_to(path.outPoints[1]),
      owner: "belt-x" as never,
    };
    if (wound?.end) {
      link.endWind = e0.sub(c).angle();
    }
    return link;
  };
  const runPull = (opts: {
    start0: Point2;
    end0: Point2;
    startMass: number;
    endMass: number;
    grab: "start" | "end";
    target: (f: number) => Point2;
    frames: number;
    wound?: { end?: boolean };
  }) => {
    const link = mkLink(opts.start0, opts.end0, opts.wound);
    const positions = new Map<string, Point2>([
      ["g", c.clone()], ["start", opts.start0.clone()], ["end", opts.end0.clone()],
    ]);
    const posMasses = new Map<string, number>([
      ["g", 0], ["start", opts.startMass], ["end", opts.endMass],
    ]);
    const angles = new Map<string, number>([["g", 0], ["phi", 0]]);
    for (let f = 0; f < opts.frames; f++) {
      update_belt_disconnects(link, positions);
      link.grabbedTerminal = opts.grab;
      const links: Link[] = [
        { type: "BeltPhaseGear", ddl: 1, angleKey: "g", phaseKey: "phi", r, eps: 1, theta0: 0 },
        link,
        { type: "HandleGrab", ddl: 1, grabbedKey: opts.grab, value: opts.target(f) },
      ];
      PBD_kinematic_solver(positions, new Map(), posMasses, new Map(), links, 300, undefined, angles);
    }
    return { link, positions, angles };
  };

  it("does not block: pulling start reels the far end in, winds it, then unwinds and detaches", () => {
    // "n" belt, both ends free; drag start far down-left, well past full unwind.
    const { link, angles } = runPull({
      start0: P(-120, -120), end0: P(120, -120),
      startMass: 1, endMass: 1, grab: "start",
      target: (f) => {
        const t = Math.min(1, f / 220);
        return P(-120 - 700 * t, -120 - 700 * t);
      },
      frames: 240,
    });
    // The wound end fully unwound → pulley detached (belt peeled off), and φ advanced
    // freely the whole time (never blocked).
    expect(link.disconnected?.[0]).toBe(true);
    expect(Math.abs(angles.get("phi")!)).toBeGreaterThan(200);
  });

  it("grabbing a WOUND end and pulling it radially off detaches it without spinning the pulley", () => {
    // start anchored far left (tension), end pre-wound on the rim at the bottom.
    const { link, angles } = runPull({
      start0: P(-300, 0), end0: P(0, -40),
      startMass: 0, endMass: 1, grab: "end",
      target: (f) => P(0, -40 - 200 * Math.min(1, f / 100)),
      frames: 140,
      wound: { end: true },
    });
    expect(link.disconnected?.[0]).toBe(true); // peeled off and detached
    expect(Math.abs(angles.get("g")!)).toBeLessThan(Math.PI); // no runaway spin
  });

  it("rotating a wound end tangentially turns the gear and conserves length (point 2)", () => {
    // start free up-left (a real free run), end wound on the rim; drag the end
    // tangentially around the rim — it must turn the gear, hold length, feed the start.
    const start0 = P(-260, 60);
    const end0 = P(0, -40);
    const L0 = compute_belt_path(viasOf(start0, end0)).length;
    const { link, positions, angles } = runPull({
      start0, end0, startMass: 1, endMass: 1, grab: "end",
      target: (f) => c.add(Point2.from_polar(r, -Math.PI / 2 + (f / 120) * 2.5)),
      frames: 120,
      wound: { end: true },
    });
    const measure = belt_pieces(
      viasOf(positions.get("start")!, positions.get("end")!),
      false,
      link.wraps ? [0, link.wraps[0], 0] : undefined,
    ).reduce((a, p) => a + p.length, 0);
    expect(Math.abs(angles.get("g")!)).toBeGreaterThan(1.5); // the gear turned with the drag
    expect(link.endWind).not.toBeUndefined(); // stayed wound (no spurious unwind)
    expect(measure).toBeCloseTo(L0, 0); // length conserved
    // the free start fed in as the belt travelled
    expect(positions.get("start")!.distance_to(c)).toBeLessThan(start0.distance_to(c) - 20);
  });
});

describe("BeltLength — gearless belt holds its length (point 1)", () => {
  it("pins the end-to-end distance to L0 (beam-like) with no active gears", () => {
    // Loose belt, no gears (or all detached): still inextensible → holds its length.
    const positions = new Map<string, Point2>([["start", P(-50, 0)], ["end", P(50, 0)]]);
    const posMasses = new Map<string, number>([["start", 0], ["end", 1]]); // start anchored
    const link: Link = {
      type: "BeltLength", ddl: 1, startKey: "start", endKey: "end",
      gearPosKeys: [], gearAngleKeys: [], radii: [], directions: [],
      length: 100, closed: false,
    };
    const links: Link[] = [
      link,
      { type: "HandleGrab", ddl: 1, grabbedKey: "end", value: P(300, 0) }, // yank the end far
    ];
    const solved = PBD_kinematic_solver(positions, new Map(), posMasses, new Map(), links, 300);
    // The end can't run away: the belt holds its length like a beam.
    expect(
      solved.positions.get("start")!.distance_to(solved.positions.get("end")!),
    ).toBeCloseTo(100, 1);
  });
});

describe("BeltLength — general winding (bare capstan, winch, launch)", () => {
  // Faithful per-frame sim (mirrors step_simulation): single gear at origin, end
  // wound on the rim, free start pushed toward the gear so the end winds.
  const r = 40;
  const c = P(0, 0);
  const viasOf = (s: Point2, e: Point2): BeltVia[] => [
    { pos: s, radius: 0, direction: false },
    { pos: c, radius: r, direction: false },
    { pos: e, radius: 0, direction: false },
  ];
  const measure = (link: Extract<Link, { type: "BeltLength" }>, pos: Map<string, Point2>) =>
    belt_pieces(
      viasOf(pos.get("start")!, pos.get("end")!),
      false,
      link.wraps ? [0, link.wraps[0], 0] : undefined,
    ).reduce((a, p) => a + p.length, 0);

  const mkLink = (start0: Point2, end0: Point2, external?: boolean): Extract<Link, { type: "BeltLength" }> => {
    const path = compute_belt_path(viasOf(start0, end0));
    return {
      type: "BeltLength", ddl: 1, startKey: "start", endKey: "end",
      gearPosKeys: ["g"], gearAngleKeys: ["g"], radii: [r], directions: [false],
      length: path.length, closed: false, phaseKey: "phi", diff0: 0,
      ...(external ? { endExternal: true } : { endWind: end0.sub(c).angle() }),
      owner: "belt-x" as never,
    };
  };

  it("BARE: pushing the free end in winds PAST 2π smoothly (capstan, no blowup)", () => {
    const start0 = P(-360, 0), end0 = P(0, -40);
    const link = mkLink(start0, end0);
    const positions = new Map<string, Point2>([["g", c.clone()], ["start", start0.clone()], ["end", end0.clone()]]);
    const posMasses = new Map<string, number>([["g", 0], ["start", 1], ["end", 1]]);
    const angles = new Map<string, number>([["g", 0], ["phi", 0]]);
    const L0 = link.length;
    for (let f = 0; f < 220; f++) {
      update_belt_disconnects(link, positions);
      link.grabbedTerminal = "start";
      const target = P(-360 + (-42 - -360) * Math.min(1, f / 200), 0);
      const links: Link[] = [
        { type: "BeltPhaseGear", ddl: 1, angleKey: "g", phaseKey: "phi", r, eps: 1, theta0: 0 },
        link,
        { type: "HandleGrab", ddl: 1, grabbedKey: "start", value: target },
      ];
      PBD_kinematic_solver(positions, new Map(), posMasses, new Map(), links, 300, undefined, angles);
    }
    expect(link.wraps![0]).toBeGreaterThan(2 * Math.PI); // wound more than a full turn
    expect(Math.abs(angles.get("g")!)).toBeLessThan(4 * Math.PI); // θ bounded (no runaway)
    expect(measure(link, positions)).toBeCloseTo(L0, 0); // length conserved
  });

  it("WINCH (join): pushing the free end in turns the gear, does not block", () => {
    const start0 = P(-360, 0), end0 = P(0, -40);
    const link = mkLink(start0, end0, true); // endExternal (join)
    const positions = new Map<string, Point2>([["g", c.clone()], ["start", start0.clone()], ["end", end0.clone()]]);
    const posMasses = new Map<string, number>([["g", 0], ["start", 1], ["end", 1]]);
    const angles = new Map<string, number>([["g", 0], ["phi", 0]]);
    const offset = end0.sub(c).angle();
    for (let f = 0; f < 200; f++) {
      update_belt_disconnects(link, positions);
      link.grabbedTerminal = "start";
      const target = P(-360 + (-46 - -360) * Math.min(1, f / 180), 0);
      const links: Link[] = [
        { type: "BeltPhaseGear", ddl: 1, angleKey: "g", phaseKey: "phi", r, eps: 1, theta0: 0 },
        { type: "GearPerimeterPin", ddl: 2, nodeKey: "end", centerKey: "g", angleKey: "g", radius: r, offset },
        link,
        { type: "HandleGrab", ddl: 1, grabbedKey: "start", value: target },
      ];
      PBD_kinematic_solver(positions, new Map(), posMasses, new Map(), links, 300, undefined, angles);
    }
    expect(Math.abs(angles.get("g")!)).toBeGreaterThan(2); // the gear turned (didn't block)
  });

  it("LAUNCH: an unanchored gear with a wound end stays put (no drift)", () => {
    const start0 = P(-220, 0), end0 = P(0, -40); // end already on the rim (as get_sim_nodes seeds it)
    const link = mkLink(start0, end0);
    const positions = new Map<string, Point2>([["g", c.clone()], ["start", start0.clone()], ["end", end0.clone()]]);
    const posMasses = new Map<string, number>([["g", 1], ["start", 1], ["end", 1]]); // gear FREE
    const angles = new Map<string, number>([["g", 0], ["phi", 0]]);
    for (let f = 0; f < 40; f++) {
      update_belt_disconnects(link, positions);
      const links: Link[] = [
        { type: "BeltPhaseGear", ddl: 1, angleKey: "g", phaseKey: "phi", r, eps: 1, theta0: 0 },
        link,
      ];
      PBD_kinematic_solver(positions, new Map(), posMasses, new Map(), links, 300, undefined, angles);
    }
    expect(positions.get("g")!.distance_to(c)).toBeLessThan(1); // no launch drift
  });
});

describe("belt phase rewire on disconnect (3e)", () => {
  it("drops the disconnected pulley's coupling; the rest stay on shared φ", () => {
    const belt: Extract<Link, { type: "BeltLength" }> = {
      type: "BeltLength",
      ddl: 1,
      startKey: "s",
      endKey: "e",
      gearPosKeys: ["g0", "g1", "g2"],
      gearAngleKeys: ["g0", "g1", "g2"],
      radii: [30, 30, 30],
      directions: [false, false, false],
      length: 100,
      closed: false,
      disconnected: [false, true, false], // middle pulley lost contact
      owner: "belt-1-1-1-1" as any,
    };
    const phase = (g: string): Link => ({
      type: "BeltPhaseGear",
      ddl: 1,
      angleKey: g,
      phaseKey: "belt-1-1-1-1:phi",
      r: 30,
      eps: 1,
      theta0: 0,
      owner: "belt-1-1-1-1" as any,
    });
    const unrelated: Link = { type: "Radius", ddl: 1, key1: "x", radius: 5 };
    const links = [phase("g0"), phase("g1"), phase("g2"), unrelated];

    const out = rewire_belt_mesh(links, [belt]);
    const kept = out.filter(
      (l) => l.type === "BeltPhaseGear",
    ) as Extract<Link, { type: "BeltPhaseGear" }>[];
    // g0 and g2 keep their coupling to φ (transmission continues); g1 dropped.
    expect(kept.map((l) => l.angleKey).sort()).toEqual(["g0", "g2"]);
    expect(out.includes(unrelated)).toBe(true);
  });
});

describe("loose belt sheds its last pulley → inert (user-decided)", () => {
  // s and e sit close together above g1, which now wraps the long way (raw wrap
  // ≈ 4.67 rad > π): from the seeded 0.05 the continuous wrap has crossed the 0/2π
  // seam to ≤ 0 → contact lost. g0 is already disconnected, so g1 is the LAST one.
  const positions = new Map<string, Point2>([
    ["s", P(-35, 80)], ["e", P(35, 80)], ["g0", P(0, 600)], ["g1", P(0, 0)],
  ]);
  const mkBelt = (closed: boolean): Extract<Link, { type: "BeltLength" }> => ({
    type: "BeltLength", ddl: 1, startKey: "s", endKey: "e",
    gearPosKeys: ["g0", "g1"], gearAngleKeys: ["g0", "g1"],
    radii: [30, 30], directions: [false, true], length: 100, closed,
    disconnected: [true, false], wraps: [0, 0.05], owner: "belt-x" as any,
  });

  it("disconnects even the LAST active pulley (loose → inert segment)", () => {
    const belt = mkBelt(false);
    const newly = update_belt_disconnects(belt, positions);
    expect(belt.disconnected).toEqual([true, true]); // last pulley shed
    expect(newly).toBe(true);
  });
});

describe("winch geometry (Option A: end on a gear)", () => {
  // Belt: far start terminal → gear at origin → end pinned ON the gear rim.
  const mk = (endAngle: number): BeltVia[] => [
    { pos: P(-300, 0), radius: 0, direction: false },
    { pos: P(0, 0), radius: 40, direction: false },
    {
      pos: P(40 * Math.cos(endAngle), 40 * Math.sin(endAngle)),
      radius: 0,
      direction: false,
    },
  ];

  it("gives the terminal gear a real arc to the end point", () => {
    // The last gear (index 1) now wraps (non-degenerate), unlike a plain terminal.
    expect(belt_wraps(mk(0))[1]).toBeGreaterThan(0);
  });

  it("winds past 2π as the end orbits the gear", () => {
    let wraps = advance_continuous_wraps(mk(0), undefined);
    for (let a = 0; a <= 8 * Math.PI; a += 0.1)
      wraps = advance_continuous_wraps(mk(-a), wraps); // end orbits several turns
    expect(Math.abs(wraps[1])).toBeGreaterThan(2 * Math.PI);
  });
});

describe("BeltLength counts wound turns (continuous wrap)", () => {
  it("adds r·2π of length per extra wound turn", () => {
    // Closed 2-gear loop, everything anchored → the function returns |length−0|.
    const positions = new Map<string, Point2>([
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const anchored = new Map<string, number>([["gA", 0], ["gB", 0]]);
    const len = (wraps: number[]) =>
      applyBeltLengthConstraint(positions, anchored, new Map(), {
        type: "BeltLength",
        ddl: 1,
        startKey: "s",
        endKey: "e",
        gearPosKeys: ["gA", "gB"],
        gearAngleKeys: ["gA", "gB"],
        radii: [40, 40],
        directions: [false, false],
        length: 0,
        closed: true,
        wraps,
      });
    const base = len([Math.PI, Math.PI]);
    const woundOnce = len([Math.PI + 2 * Math.PI, Math.PI]); // gA wound +1 turn
    expect(woundOnce - base).toBeCloseTo(40 * 2 * Math.PI, 3);
  });
});

describe("junction travels around a wound pulley (belt_pieces wraps)", () => {
  const vias: BeltVia[] = [
    { pos: P(-100, 0), radius: 40, direction: false },
    { pos: P(100, 0), radius: 40, direction: false },
  ];

  it("sizes the wound gear's arc from the continuous wrap (r·|wrap|)", () => {
    const arcA = belt_pieces(vias, true, [5 * Math.PI, Math.PI]).find(
      (p) => p.kind === "arc" && p.gearIndex === 0,
    )!;
    expect(arcA.length).toBeCloseTo(40 * 5 * Math.PI, 3); // 2.5 turns wound
  });

  it("keeps a point deep in the wound arc on that pulley's circle", () => {
    const wraps = [5 * Math.PI, Math.PI];
    const pieces = belt_pieces(vias, true, wraps);
    // First piece is gA's (now large) arc; sample its middle.
    const s = pieces[0].startS + pieces[0].length / 2;
    const pt = belt_point_tangent(vias, s, true, wraps).point;
    expect(pt.distance_to(P(-100, 0))).toBeCloseTo(40, 3);
  });
});
