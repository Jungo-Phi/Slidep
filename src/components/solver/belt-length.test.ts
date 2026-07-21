import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import {
  rewire_belt_mesh,
  update_belt_disconnects,
} from "./kinematic-simulation";
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
  BeltVia,
} from "../../utils/belt-path";

const P = (x: number, y: number) => new Point2(x, y);

describe("BeltLength constraint (simulation)", () => {
  it("conserves a closed belt's closed-loop length (and pulls the far pulley)", () => {
    const positions = new Map<string, Point2>([
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["gA", 1],
      ["gB", 1],
    ]);
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
    expect(solved.positions.get("gA")!.distance_to(P(-100, 0))).toBeGreaterThan(
      5,
    );
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
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    const dth = 0.1;
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    // Drive the reference pulley (held each iteration, like a motor).
    for (let i = 0; i < 80; i++) {
      angles.set("gA", dth);
      applyBeltPinConstraint(
        positions,
        posMasses,
        angles,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
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
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 0],
      ["gB", 0],
    ]);
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 80; i++) {
      positions.set("J", dragged.clone()); // grabbed
      applyBeltPinConstraint(
        positions,
        posMasses,
        angles,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
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
    const posMasses = new Map<string, number>([
      ["J", 1],
      ["gA", 1],
      ["gB", 1],
    ]);
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 200; i++) {
      positions.set("J", held.clone()); // grabbed
      applyBeltPinConstraint(
        positions,
        posMasses,
        angles,
        "J",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
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
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 80; i++) {
      angles.set("gA", 0);
      applyBeltFollowsTangentConstraint(
        positions,
        posMasses,
        angles,
        "piv",
        "end",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
        0,
      );
    }
    const beam = positions.get("end")!.sub(positions.get("piv")!);
    expect(Math.abs(angDiff(beam.angle(), tangentAngle(s0)))).toBeLessThan(
      1e-3,
    );
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
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 80; i++)
      applyBeltFollowsTangentConstraint(
        positions,
        posMasses,
        angles,
        "piv",
        "end",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
        0,
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
    const angles = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
    for (let i = 0; i < 120; i++)
      applyBeltFollowsTangentConstraint(
        positions,
        posMasses,
        angles,
        "piv",
        "end",
        ["gA", "gB"],
        [40, 40],
        [false, false],
        0,
        "gA",
        s0,
        0,
        0,
      );
    // The pivot moved off its start (asymmetric code left it at the origin)…
    expect(positions.get("piv")!.distance_to(P(0, 0))).toBeGreaterThan(1);
    // …and the constraint converged (beam aligned to the — now advanced — tangent).
    const beam = positions.get("end")!.sub(positions.get("piv")!);
    expect(
      Math.abs(
        angDiff(beam.angle(), tangentAngle(angles.get("gA")! * 40 + s0)),
      ),
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
    expect(solved.positions.get("gC")!.distance_to(P(120, 0))).toBeGreaterThan(
      2,
    );
  });
});

describe("BeltLength — gearless belt holds its length (point 1)", () => {
  it("pins the end-to-end distance to L0 (beam-like) with no active gears", () => {
    // Loose belt, no gears (or all detached): still inextensible → holds its length.
    const positions = new Map<string, Point2>([
      ["start", P(-50, 0)],
      ["end", P(50, 0)],
    ]);
    const posMasses = new Map<string, number>([
      ["start", 0],
      ["end", 1],
    ]); // start anchored
    const link: Link = {
      type: "BeltLength",
      ddl: 1,
      startKey: "start",
      endKey: "end",
      gearPosKeys: [],
      gearAngleKeys: [],
      radii: [],
      directions: [],
      length: 100,
      closed: false,
    };
    const links: Link[] = [
      link,
      { type: "HandleGrab", ddl: 1, grabbedKey: "end", value: P(300, 0) }, // yank the end far
    ];
    const solved = PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      links,
      300,
    );
    // The end can't run away: the belt holds its length like a beam.
    expect(
      solved.positions.get("start")!.distance_to(solved.positions.get("end")!),
    ).toBeCloseTo(100, 1);
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
    const kept = out.filter((l) => l.type === "BeltPhaseGear") as Extract<
      Link,
      { type: "BeltPhaseGear" }
    >[];
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
    ["s", P(-35, 80)],
    ["e", P(35, 80)],
    ["g0", P(0, 600)],
    ["g1", P(0, 0)],
  ]);
  const mkBelt = (closed: boolean): Extract<Link, { type: "BeltLength" }> => ({
    type: "BeltLength",
    ddl: 1,
    startKey: "s",
    endKey: "e",
    gearPosKeys: ["g0", "g1"],
    gearAngleKeys: ["g0", "g1"],
    radii: [30, 30],
    directions: [false, true],
    length: 100,
    closed,
    disconnected: [true, false],
    wraps: [0, 0.05],
    owner: "belt-x" as any,
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

describe("a terminal touching its pulley keeps its tangent run", () => {
  // Loose belt: far start terminal → gear (r=40) → end terminal ON the rim.
  const vias: BeltVia[] = [
    { pos: P(-300, 0), radius: 0, direction: false },
    { pos: P(0, 0), radius: 40, direction: false },
    { pos: P(0, 40), radius: 0, direction: false },
  ];

  it("still emits the end run, degenerate (length 0), instead of dropping it", () => {
    // The run is what carries the gear tangent point Ptan — and Ptan is what the
    // length constraint reads uE (hence the no-slip C_diff) from. Dropping the run
    // at contact silently switched no-slip OFF for BOTH ends.
    const endRun = belt_pieces(vias, false).find(
      (p) => p.kind === "segment" && p.gearIndexB === 2,
    );
    expect(endRun).toBeDefined();
    expect(endRun!.length).toBeCloseTo(0, 9);
  });

  it("puts that run's tangent point on the terminal itself", () => {
    const endRun = belt_pieces(vias, false).find(
      (p) => p.kind === "segment" && p.gearIndexB === 2,
    )!;
    if (endRun.kind !== "segment") throw new Error("segment expected");
    expect(endRun.from.distance_to(P(0, 40))).toBeCloseTo(0, 9);
  });
});

describe("no-slip survives an end resting on its pulley", () => {
  it("still drives the belt travel φ (C_diff), instead of going slack", () => {
    const positions = new Map<string, Point2>([
      ["s", P(-300, 0)],
      ["g", P(0, 0)],
      ["e", P(0, 40)], // end terminal exactly on the rim
    ]);
    const masses = new Map<string, number>([
      ["s", 1],
      ["g", 0], // grounded pulley: only the free end and φ can move
      ["e", 1],
    ]);
    const angles = new Map<string, number>([["b:phi", 0]]);
    const drawn = belt_pieces(
      [
        { pos: P(-300, 0), radius: 0, direction: false },
        { pos: P(0, 0), radius: 40, direction: false },
        { pos: P(0, 40), radius: 0, direction: false },
      ],
      false,
    ).reduce((a, p) => a + p.length, 0);

    applyBeltLengthConstraint(positions, masses, angles, {
      type: "BeltLength",
      ddl: 1,
      startKey: "s",
      endKey: "e",
      gearPosKeys: ["g"],
      gearAngleKeys: ["g"],
      radii: [40],
      directions: [false],
      length: drawn, // C_sum ≈ 0 → isolates the differential
      closed: false,
      phaseKey: "b:phi",
      diff0: 0, // ⇒ C_diff = fsStart − fsEnd ≠ 0, so φ MUST move
    });

    expect(angles.get("b:phi")).not.toBeCloseTo(0, 6);
  });
});

describe("winch: a JOINed end is not a free strand", () => {
  // Loose belt: free start terminal → gear → end terminal JOINed onto the rim.
  const run = (endWound: boolean) => {
    const positions = new Map<string, Point2>([
      ["s", P(-300, 0)],
      ["g", P(0, 0)],
      ["e", P(0, 40)], // on the rim
    ]);
    const masses = new Map<string, number>([
      ["s", 1],
      ["g", 0],
      ["e", 1],
    ]);
    const angles = new Map<string, number>([["b:phi", 0]]);
    for (let i = 0; i < 6; i++)
      applyBeltLengthConstraint(positions, masses, angles, {
        type: "BeltLength",
        ddl: 1,
        startKey: "s",
        endKey: "e",
        gearPosKeys: ["g"],
        gearAngleKeys: ["g"],
        radii: [40],
        directions: [false],
        length: 1000, // belt longer than drawn → the constraint pays strand out
        closed: false,
        phaseKey: "b:phi",
        diff0: 0,
        endWound,
      });
    return positions.get("e")!.distance_to(P(0, 0)) - 40;
  };

  it("never drags the pinned terminal off its rim", () => {
    // Its GearPerimeterPin owns it; the belt feeds through the ARC, not a strand.
    // Treating it as free tugged it tangentially every iteration — and since a
    // tangent step off a circle is a SECANT, the radius crept up until the winch
    // fought its own pin and stalled the motor.
    expect(Math.abs(run(true))).toBeLessThan(1e-9);
  });

  it("(and would, if it were mistaken for a free end)", () => {
    expect(Math.abs(run(false))).toBeGreaterThan(1); // the drift, reproduced
  });
});

describe("a free end reeled through its pulley's tangency point", () => {
  // The differential must be written in h = fs ∓ r·sign·ψ (the end's belt arc-length in
  // the pulley's frame), NOT in the free-strand length fs. fs is a V about the tangency
  // point (fs = |t|, and its radial derivative is d/fs → ∞), so a correction that
  // overshoots the vertex makes fs GROW: the feedback sign flips and the end whips around
  // the rim, spinning up the wrap and inventing r·2π of belt. h is monotone, unit-gradient
  // and uncapped, so the same reeling just unwraps the pulley — the physics.
  const reel = (diff0: number) => {
    const positions = new Map<string, Point2>([
      ["s", P(-300, 0)],
      ["g", P(0, 0)],
      ["e", P(-6, Math.sqrt(40 * 40 + 6 * 6))], // 6px of strand left
    ]);
    const masses = new Map<string, number>([
      ["s", 1],
      ["g", 0], // anchored drum
      ["e", 1],
    ]);
    const vias = (): BeltVia[] => [
      { pos: positions.get("s")!, radius: 0, direction: false },
      { pos: positions.get("g")!, radius: 40, direction: false },
      { pos: positions.get("e")!, radius: 0, direction: false },
    ];
    const L0 = belt_pieces(vias(), false).reduce((a, p) => a + p.length, 0);
    const angles = new Map<string, number>([["b:phi", 0]]);
    for (let i = 0; i < 30; i++)
      applyBeltLengthConstraint(positions, masses, angles, {
        type: "BeltLength",
        ddl: 1,
        startKey: "s",
        endKey: "e",
        gearPosKeys: ["g"],
        gearAngleKeys: ["g"],
        radii: [40],
        directions: [false],
        length: L0,
        closed: false,
        phaseKey: "b:phi",
        diff0, // drives the end hard, straight through the tangency point
      });
    const e = positions.get("e")!;
    return {
      d: e.distance_to(positions.get("g")!),
      L: belt_pieces(vias(), false).reduce((a, p) => a + p.length, 0),
      L0,
    };
  };

  it("never runs away around the rim, and conserves the belt's length", () => {
    for (const diff0 of [-500, 500]) {
      const r = reel(diff0);
      expect(r.d).toBeGreaterThanOrEqual(40 - 1e-9); // never inside the rim
      expect(r.d).toBeLessThan(1000); // never ejected: the old bug flew off in ONE step
      expect(r.L).toBeCloseTo(r.L0, 1); // no phantom belt invented
    }
  });

  it("settles instead of oscillating", () => {
    const a = reel(-500);
    const b = reel(-500);
    expect(a.d).toBeCloseTo(b.d, 6); // deterministic fixed point, not a limit cycle
  });
});

describe("BeltLength counts wound turns (continuous wrap)", () => {
  it("adds r·2π of length per extra wound turn", () => {
    // Closed 2-gear loop, everything anchored → the function returns |length−0|.
    const positions = new Map<string, Point2>([
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
    const anchored = new Map<string, number>([
      ["gA", 0],
      ["gB", 0],
    ]);
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

describe("BeltLength resizes pulleys in edition (radii as DOFs)", () => {
  // Closed 2-gear loop, centres 200 apart, r=40 each: L0 = 2·200 + 2·(40·π).
  const makeLink = (length: number): Extract<Link, { type: "BeltLength" }> => ({
    type: "BeltLength",
    ddl: 1,
    startKey: "s",
    endKey: "e",
    gearPosKeys: ["gA", "gB"],
    gearAngleKeys: ["gA", "gB"],
    radii: [40, 40], // unused by the projection (it reads the radii map)
    directions: [false, false],
    length,
    closed: true,
    radKeys: ["gA", "gB"],
  });
  const centres = () =>
    new Map<string, Point2>([
      ["gA", P(-100, 0)],
      ["gB", P(100, 0)],
    ]);
  const anchored = new Map<string, number>([
    ["gA", 0],
    ["gB", 0],
  ]);
  const freeRadii = () =>
    [
      new Map<string, number>([
        ["gA", 40],
        ["gB", 40],
      ]),
      new Map<string, number>([
        ["gA", 1],
        ["gB", 1],
      ]),
    ] as const;

  it("shrinks the pulleys to meet a shorter dimension (centres anchored)", () => {
    const positions = centres();
    const [radii, radMasses] = freeRadii();
    const target = 620; // < L0 ≈ 651.3 → radii shrink (arc sum 220 → r sum ≈ 70)
    const link = makeLink(target);
    let err = Infinity;
    for (let i = 0; i < 300; i++)
      err = applyBeltLengthConstraint(
        positions,
        anchored,
        new Map(),
        link,
        1,
        radii,
        radMasses,
      );
    expect(err).toBeLessThan(0.1);
    expect(radii.get("gA")!).toBeLessThan(40);
    expect(radii.get("gA")! + radii.get("gB")!).toBeCloseTo(220 / Math.PI, 1);
  });

  it("never drives a radius below MIN_GEAR_RADIUS", () => {
    const positions = centres();
    const [radii, radMasses] = freeRadii();
    const link = makeLink(400); // impossibly short: would need zero-radius pulleys
    for (let i = 0; i < 300; i++)
      applyBeltLengthConstraint(
        positions,
        anchored,
        new Map(),
        link,
        1,
        radii,
        radMasses,
      );
    expect(radii.get("gA")!).toBeGreaterThanOrEqual(30);
    expect(radii.get("gB")!).toBeGreaterThanOrEqual(30);
  });

  it("leaves radii untouched without radKeys (simulation)", () => {
    const positions = centres();
    const [radii, radMasses] = freeRadii();
    const link = makeLink(620);
    delete link.radKeys;
    for (let i = 0; i < 50; i++)
      applyBeltLengthConstraint(
        positions,
        anchored,
        new Map(),
        link,
        1,
        radii,
        radMasses,
      );
    expect(radii.get("gA")!).toBe(40);
    expect(radii.get("gB")!).toBe(40);
  });
});
