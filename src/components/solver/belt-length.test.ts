import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { rewire_belt_mesh } from "./kinematic-simulation";
import {
  applyBeltEndTravelConstraint,
  applyBeltLengthConstraint,
  applyBeltFollowsTangentConstraint,
  applyBeltJunctionConstraint,
  applyBeltMeshAngleConstraint,
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

describe("BeltMeshAngle constraint (rotation transmission)", () => {
  // The constraint is symmetric (both angle nodes move). To read the transmission
  // ratio we emulate a motor holding the driver g1 fixed each iteration.
  const drive = (
    r1: number,
    r2: number,
    dir1: boolean,
    dir2: boolean,
    driven: number,
  ): number => {
    const angles = new Map<string, number>([
      ["g1", driven],
      ["g2", 0],
    ]);
    for (let i = 0; i < 50; i++) {
      angles.set("g1", driven);
      applyBeltMeshAngleConstraint(angles, "g1", "g2", r1, r2, 0, 0, dir1, dir2);
    }
    return angles.get("g2")!;
  };

  it("makes an open belt (same wrap sense) spin both pulleys the same way", () => {
    // Equal radii, same sense → equal rotation.
    expect(drive(40, 40, false, false, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("scales rotation by the radius ratio", () => {
    // r1·Δθ1 = r2·Δθ2 → Δθ2 = Δθ1 · r1/r2 = 1.0 · 20/40 = 0.5
    expect(drive(20, 40, false, false, 1.0)).toBeCloseTo(0.5, 6);
  });

  it("reverses the far pulley for a crossed belt (opposite wrap sense)", () => {
    expect(drive(40, 40, false, true, 0.5)).toBeCloseTo(-0.5, 6);
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

describe("BeltEndTravel constraint (loose belt ends travel)", () => {
  const g = P(0, 0);
  const r = 40;
  const dir = false;
  const T0 = P(-200, 0);
  const rEps = r * (dir ? -1 : 1); // 40
  const sign = -1; // start terminal
  const tangentPoint = (Tpos: Point2) =>
    g.add(Point2.circles_link(g, r, dir, Tpos, 0, false).start);
  const lfree0 = T0.distance_to(tangentPoint(T0));

  it("the terminal follows a (softly-driven) pulley", () => {
    const positions = new Map<string, Point2>([["T", T0.clone()], ["g", g.clone()]]);
    const posMasses = new Map<string, number>([["T", 1], ["g", 0]]);
    const angles = new Map<string, number>([["g", 0]]);
    const dth = 0.1;
    for (let i = 0; i < 400; i++) {
      // Soft motor pulling θ → dth (as MotorAngle does), competing with travel.
      const a = angles.get("g")!;
      angles.set("g", a + (dth - a) * 0.5);
      applyBeltEndTravelConstraint(
        positions, posMasses, angles, "T", "g", r, dir, "g", rEps, sign, lfree0, 0,
      );
    }
    // The motor reached its target and the free end followed to the matching
    // free length lfree0 + sign·rEps·θ = lfree0 − 4.
    expect(angles.get("g")!).toBeCloseTo(dth, 2);
    const Tf = positions.get("T")!;
    expect(Tf.distance_to(tangentPoint(Tf))).toBeCloseTo(lfree0 + sign * rEps * dth, 0);
    expect(Tf.distance_to(T0)).toBeGreaterThan(1);
  });

  it("is symmetric: pulling a free end turns the pulley", () => {
    // Hold the end pulled 4px toward the pulley; the pulley must rotate.
    const held = P(-196, 0);
    const positions = new Map<string, Point2>([["T", held.clone()], ["g", g.clone()]]);
    const posMasses = new Map<string, number>([["T", 1], ["g", 0]]);
    const angles = new Map<string, number>([["g", 0]]);
    for (let i = 0; i < 120; i++) {
      positions.set("T", held.clone()); // grabbed
      applyBeltEndTravelConstraint(
        positions, posMasses, angles, "T", "g", r, dir, "g", rEps, sign, lfree0, 0,
      );
    }
    expect(angles.get("g")!).toBeGreaterThan(0.02); // pulley turned
  });
});

describe("belt mesh rewire on disconnect (3e)", () => {
  it("re-links the transmission across a disconnected pulley", () => {
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
    const oldMesh = (a: string, b: string): Link => ({
      type: "BeltMeshAngle",
      ddl: 1,
      angleKey1: a,
      angleKey2: b,
      r1: 30,
      r2: 30,
      theta1_0: 0,
      theta2_0: 0,
      dir1: false,
      dir2: false,
      owner: "belt-1-1-1-1" as any,
    });
    const unrelated: Link = { type: "Radius", ddl: 1, key1: "x", radius: 5 };
    const links = [oldMesh("g0", "g1"), oldMesh("g1", "g2"), unrelated];
    const angles = new Map<string, number>([["g0", 1], ["g1", 2], ["g2", 3]]);

    const out = rewire_belt_mesh(links, [belt], angles);
    const mesh = out.filter((l) => l.type === "BeltMeshAngle") as Extract<
      Link,
      { type: "BeltMeshAngle" }
    >[];
    // Exactly one mesh link now, directly coupling the surviving pulleys g0↔g2…
    expect(mesh.length).toBe(1);
    expect([mesh[0].angleKey1, mesh[0].angleKey2].sort()).toEqual(["g0", "g2"]);
    // …with reference angles baked from the current state (1 and 3).
    expect(mesh[0].theta1_0).toBe(1);
    expect(mesh[0].theta2_0).toBe(3);
    // Unrelated links are preserved.
    expect(out.includes(unrelated)).toBe(true);
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
      applyBeltLengthConstraint(
        positions, anchored, "s", "e",
        ["gA", "gB"], [40, 40], [false, false],
        0 /* target */, true /* closed */, undefined, wraps,
      );
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
