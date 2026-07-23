import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../types";
import {
  applyAngleConstraint,
  applyBeamFollowsAngleConstraint,
  applyCoaxialAngleConstraint,
  applyDistanceConstraint,
  applyDistanceToLineConstraint,
  applyEqualLengthConstraint,
  applyFixedOnSegmentConstraint,
  applyGearMeshAngleConstraint,
  applyGearMeshingConstraint,
  applyGearPerimeterPinConstraint,
  applyGearRatioConstraint,
  applyHandleGrabConstraint,
  applyHorizontalConstraint,
  applyKeepOrientationConstraint,
  applyMotorAngleConstraint,
  applyMotorBeamConstraint,
  applyNormalConstraint,
  applyParallelConstraint,
  applySlideOnSegmentConstraint,
  applyVerticalConstraint,
} from "./constraint-functions";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { collect_solver_trace } from "./solver-trace";

/**
 * Convergence properties every constraint must hold on its own, away from the
 * solver's other links. Each scenario starts violated; the assertions below are
 * then run over all of them.
 *
 * Belt constraints are deliberately absent: they are being reworked, and
 * pinning their current behaviour here would only manufacture failures to
 * update. See doc/contrainte-angle.md.
 */

interface State {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  radii: Map<string, number>;
  radMasses: Map<string, number>;
  angles: Map<string, number>;
}

interface Scenario {
  name: string;
  /** Fresh violated state — rebuilt for every assertion. */
  make: () => State;
  /** Applies the constraint once; returns the residual it saw on entry. */
  apply: (state: State) => number;
  /** Position keys pinned to mobility 0: they must never move. */
  anchored?: string[];
  /** Segments whose length the constraint has no business changing. */
  rigid?: [string, string][];
  /** Largest length drift the constraint may legitimately cause, given the
   *  residual it started from. Defaults to 0.5 % — a rotation about a fixed
   *  point is exact and drifts none. */
  rigidBound?: (initialResidual: number, length: number) => number;
  /** Soft or transient by design: exempt from the one-pass assertion. */
  soft?: boolean;
  /** Residual considered converged (constraint's own unit). */
  tolerance?: number;
}

const P = (x: number, y: number) => new Point2(x, y);
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Length drift allowed to an angular projection. Correcting an angle by `C`
 * moves the free end perpendicular to its segment by `L·C`, so the segment
 * measures `L·√(1+C²)` afterwards — second order in `C`, and absorbed by the
 * Distance constraint on the next sweep. A correction that were NOT
 * perpendicular would drift at first order and blow this bound away.
 */
const PERPENDICULAR_DRIFT = (residual: number, length: number) =>
  length * (Math.sqrt(1 + residual * residual) - 1) * 1.1;

/** Builds a state from positions (with their mobilities) alone. */
function nodes(entries: [string, Point2, number][]): State {
  return {
    positions: new Map(entries.map(([k, p]) => [k, p])),
    posMasses: new Map(entries.map(([k, , m]) => [k, m])),
    radii: new Map(),
    radMasses: new Map(),
    angles: new Map(),
  };
}

/** Two segments sharing an anchored hub: seg1 fixed, seg2 free to swing. */
function twoSegments(angle2: number): State {
  return nodes([
    ["s1", P(0, 0), 0],
    ["e1", P(200, 0), 0],
    ["s2", P(0, 0), 0],
    ["e2", P(200 * Math.cos(angle2), 200 * Math.sin(angle2)), 1],
  ]);
}

const SCENARIOS: Scenario[] = [
  {
    name: "Distance",
    make: () =>
      nodes([
        ["a", P(0, 0), 0],
        ["b", P(100, 0), 1],
      ]),
    apply: (s) =>
      applyDistanceConstraint(s.positions, s.posMasses, "a", "b", 150),
    anchored: ["a"],
  },
  {
    name: "DistanceToLine",
    make: () =>
      nodes([
        ["start", P(0, 0), 0],
        ["end", P(200, 0), 0],
        ["node", P(100, 30), 1],
      ]),
    apply: (s) =>
      applyDistanceToLineConstraint(
        s.positions,
        s.posMasses,
        "start",
        "end",
        "node",
        50,
      ),
    anchored: ["start", "end"],
    rigid: [["start", "end"]],
  },
  {
    name: "SlideOnSegment",
    make: () =>
      nodes([
        ["start", P(0, 0), 0],
        ["end", P(200, 0), 0],
        ["node", P(100, 30), 1],
      ]),
    apply: (s) =>
      applySlideOnSegmentConstraint(
        s.positions,
        s.posMasses,
        "start",
        "end",
        "node",
      ),
    anchored: ["start", "end"],
    rigid: [["start", "end"]],
  },
  {
    name: "FixedOnSegment",
    make: () =>
      nodes([
        ["start", P(0, 0), 0],
        ["end", P(200, 0), 0],
        ["node", P(50, 30), 1],
      ]),
    apply: (s) =>
      applyFixedOnSegmentConstraint(
        s.positions,
        s.posMasses,
        "start",
        "end",
        "node",
        0.5,
      ),
    anchored: ["start", "end"],
    rigid: [["start", "end"]],
  },
  {
    name: "EqualLength",
    make: () =>
      nodes([
        ["s1", P(0, 0), 0],
        ["e1", P(100, 0), 0],
        ["s2", P(0, 100), 1],
        ["e2", P(160, 100), 1],
      ]),
    apply: (s) =>
      applyEqualLengthConstraint(
        s.positions,
        s.posMasses,
        "s1",
        "e1",
        "s2",
        "e2",
      ),
    anchored: ["s1", "e1"],
  },
  {
    name: "Angle",
    make: () => twoSegments(deg(70)),
    apply: (s) =>
      applyAngleConstraint(
        s.positions,
        s.posMasses,
        "s1",
        "e1",
        "s2",
        "e2",
        false,
        false,
        false,
        Math.PI / 2,
      ),
    anchored: ["s1", "e1", "s2"],
    rigid: [
      ["s1", "e1"],
      ["s2", "e2"],
    ],
    rigidBound: PERPENDICULAR_DRIFT,
    tolerance: 1e-3,
  },
  {
    name: "Parallel",
    make: () =>
      nodes([
        ["s1", P(0, 0), 0],
        ["e1", P(200, 0), 0],
        ["s2", P(0, 100), 0],
        ["e2", P(200 * Math.cos(deg(20)), 100 + 200 * Math.sin(deg(20))), 1],
      ]),
    apply: (s) =>
      applyParallelConstraint(s.positions, s.posMasses, "s1", "e1", "s2", "e2"),
    anchored: ["s1", "e1", "s2"],
    rigid: [["s2", "e2"]],
    rigidBound: PERPENDICULAR_DRIFT,
    tolerance: 1e-3,
  },
  {
    name: "Normal",
    make: () => twoSegments(deg(70)),
    apply: (s) =>
      applyNormalConstraint(s.positions, s.posMasses, "s1", "e1", "s2", "e2"),
    anchored: ["s1", "e1", "s2"],
    rigid: [["s2", "e2"]],
    rigidBound: PERPENDICULAR_DRIFT,
    tolerance: 1e-3,
  },
  {
    name: "KeepOrientation",
    make: () =>
      nodes([
        ["start", P(0, 0), 0],
        ["end", P(200 * Math.cos(deg(20)), 200 * Math.sin(deg(20))), 1],
      ]),
    apply: (s) =>
      applyKeepOrientationConstraint(
        s.positions,
        s.posMasses,
        "start",
        "end",
        P(1, 0),
      ),
    anchored: ["start"],
  },
  {
    name: "Horizontal",
    make: () =>
      nodes([
        ["a", P(0, 0), 0],
        ["b", P(100, 40), 1],
      ]),
    apply: (s) => applyHorizontalConstraint(s.positions, s.posMasses, "a", "b"),
    anchored: ["a"],
  },
  {
    name: "Vertical",
    make: () =>
      nodes([
        ["a", P(0, 0), 0],
        ["b", P(40, 100), 1],
      ]),
    apply: (s) => applyVerticalConstraint(s.positions, s.posMasses, "a", "b"),
    anchored: ["a"],
  },
  {
    name: "GearMeshing",
    make: () => {
      const state = nodes([
        ["g1", P(0, 0), 0],
        ["g2", P(150, 0), 1],
      ]);
      state.radii = new Map([
        ["r1", 50],
        ["r2", 60],
      ]);
      // Rayons figés : seule la distance entre centres peut corriger.
      state.radMasses = new Map([
        ["r1", 0],
        ["r2", 0],
      ]);
      return state;
    },
    apply: (s) =>
      applyGearMeshingConstraint(
        s.positions,
        s.posMasses,
        s.radii,
        s.radMasses,
        "g1",
        "g2",
        "r1",
        "r2",
      ),
    anchored: ["g1"],
  },
  {
    name: "GearRatio",
    make: () => {
      const state = nodes([]);
      state.radii = new Map([
        ["g1", 100],
        ["g2", 50],
      ]);
      state.radMasses = new Map([
        ["g1", 1],
        ["g2", 1],
      ]);
      return state;
    },
    apply: (s) =>
      applyGearRatioConstraint(s.radii, s.radMasses, "g1", "g2", 1.5),
    tolerance: 1e-3,
  },
  {
    name: "MotorBeam",
    make: () =>
      nodes([
        ["pivot", P(0, 0), 0],
        ["driven", P(100, 0), 1],
      ]),
    apply: (s) =>
      applyMotorBeamConstraint(
        s.positions,
        s.posMasses,
        "pivot",
        "driven",
        Math.PI / 2,
      ),
    anchored: ["pivot"],
    rigid: [["pivot", "driven"]],
    tolerance: 1e-3,
  },
  {
    name: "MotorAngle",
    make: () => {
      const state = nodes([]);
      state.angles = new Map([["gear", 0]]);
      return state;
    },
    apply: (s) => applyMotorAngleConstraint(s.angles, "gear", 1),
    tolerance: 1e-3,
  },
  {
    name: "GearMeshAngle",
    make: () => {
      const state = nodes([]);
      state.angles = new Map([
        ["g1", 0.1],
        ["g2", 0],
      ]);
      return state;
    },
    apply: (s) =>
      applyGearMeshAngleConstraint(s.angles, "g1", "g2", 50, 50, 0, 0, 0, 0),
    tolerance: 1e-3,
  },
  {
    name: "GearPerimeterPin",
    make: () => {
      const state = nodes([
        ["center", P(0, 0), 0],
        ["node", P(120, 20), 1],
      ]);
      state.angles = new Map([["gear", 0]]);
      return state;
    },
    apply: (s) =>
      applyGearPerimeterPinConstraint(
        s.positions,
        s.posMasses,
        s.angles,
        "node",
        "center",
        "gear",
        100,
        0,
      ),
    anchored: ["center"],
    tolerance: 1e-2,
  },
  {
    name: "BeamFollowsAngle",
    make: () => {
      const state = nodes([
        ["pivot", P(0, 0), 0],
        ["driven", P(100, 0), 1],
      ]);
      state.angles = new Map([["gear", Math.PI / 2]]);
      return state;
    },
    apply: (s) =>
      applyBeamFollowsAngleConstraint(
        s.positions,
        s.posMasses,
        s.angles,
        "pivot",
        "driven",
        "gear",
        0,
      ),
    anchored: ["pivot"],
    rigid: [["pivot", "driven"]],
    tolerance: 1e-2,
  },
  {
    name: "CoaxialAngle",
    make: () => {
      const state = nodes([]);
      state.angles = new Map([
        ["a", 0.3],
        ["b", 0],
      ]);
      return state;
    },
    apply: (s) => applyCoaxialAngleConstraint(s.angles, "a", "b", 0),
    tolerance: 1e-3,
  },
  {
    name: "Radius",
    make: () => {
      const state = nodes([]);
      state.radii = new Map([["g", 120]]);
      state.radMasses = new Map([["g", 1]]);
      return state;
    },
    // Radius n'a pas de fonction dédiée : il est appliqué dans le solveur. On
    // passe donc par lui, et la trace debug rend le résidu de l'application.
    apply: (s) => {
      const links: Link[] = [{ type: "Radius", ddl: 1, key1: "g", radius: 80 }];
      const events = collect_solver_trace(() =>
        PBD_kinematic_solver(
          s.positions,
          s.radii,
          s.posMasses,
          s.radMasses,
          links,
          1,
        ),
      );
      return events[0].residual;
    },
    tolerance: 1e-3,
  },
  {
    name: "HandleGrab",
    make: () =>
      nodes([
        ["grabbed", P(0, 0), 1],
        ["anchor", P(500, 500), 0],
      ]),
    apply: (s) =>
      applyHandleGrabConstraint(
        s.positions,
        s.radii,
        s.posMasses,
        "grabbed",
        P(100, 0),
      ),
    anchored: ["anchor"],
    // Tire vers la cible par petits pas bornés (maxAmplitude) : jamais en une passe.
    soft: true,
  },
  {
    name: "Spring",
    make: () =>
      nodes([
        ["a", P(0, 0), 0],
        ["b", P(100, 0), 1],
      ]),
    // Le solveur applique les ressorts via Distance, avec une raideur douce.
    apply: (s) =>
      applyDistanceConstraint(s.positions, s.posMasses, "a", "b", 150, 0.3),
    anchored: ["a"],
    soft: true,
  },
];

const SWEEPS = 60;

/** Runs the constraint `SWEEPS` times and returns the residual seen each time. */
function residuals(scenario: Scenario): { state: State; series: number[] } {
  const state = scenario.make();
  const series: number[] = [];
  for (let i = 0; i < SWEEPS; i++) series.push(scenario.apply(state));
  return { state, series };
}

function lengths(state: State, rigid: [string, string][]): number[] {
  return rigid.map(([a, b]) =>
    state.positions.get(a)!.distance_to(state.positions.get(b)!),
  );
}

describe.each(SCENARIOS.map((s) => [s.name, s] as const))(
  "%s",
  (_name, scenario) => {
    const tolerance = scenario.tolerance ?? 1e-6;

    it("part d'un état violé", () => {
      const { series } = residuals(scenario);
      expect(series[0]).toBeGreaterThan(tolerance);
    });

    it("converge", () => {
      const { series } = residuals(scenario);
      if (scenario.soft) {
        // Pas de convergence promise : on exige seulement un vrai progrès.
        expect(series[SWEEPS - 1]).toBeLessThan(series[0] * 0.5);
        return;
      }
      expect(series[SWEEPS - 1]).toBeLessThan(tolerance);
    });

    it("ne diverge jamais", () => {
      const { series } = residuals(scenario);
      for (let i = 1; i < series.length; i++)
        expect(series[i]).toBeLessThanOrEqual(series[i - 1] + 1e-6);
    });

    if (!scenario.soft)
      it("corrige l'essentiel en une passe", () => {
        const { series } = residuals(scenario);
        // Une projection PBD à raideur 1 résout la linéarisation d'un coup ; il
        // ne doit rester qu'un reliquat de second ordre.
        expect(series[1]).toBeLessThan(series[0] * 0.2);
      });

    if (scenario.anchored?.length)
      it("ne déplace aucun point ancré", () => {
        const before = scenario.make();
        const pinned = scenario.anchored!.map(
          (key) => [key, before.positions.get(key)!] as const,
        );
        const { state } = residuals(scenario);
        for (const [key, position] of pinned) {
          const after = state.positions.get(key)!;
          expect(after.distance_to(position)).toBeLessThan(1e-9);
        }
      });

    if (scenario.rigid?.length)
      it("ne change pas la longueur des segments rigides", () => {
        const before = lengths(scenario.make(), scenario.rigid!);
        const { state, series } = residuals(scenario);
        const after = lengths(state, scenario.rigid!);
        const bound =
          scenario.rigidBound ??
          ((_r: number, length: number) => length * 0.005);
        after.forEach((length, i) =>
          expect(Math.abs(length - before[i])).toBeLessThan(
            bound(series[0], before[i]),
          ),
        );
      });
  },
);
