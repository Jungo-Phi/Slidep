import { ID } from "./element";
import { Point2 } from "./point2";

/** Nodes for the geometric solver (edition): positions + gear radii (variables). */
export type GeomNodes = {
  positions: Map<string, Point2>;
  radii: Map<string, number>;
  posMasses: Map<string, number>;
  radMasses: Map<string, number>;
};

/** Nodes for the kinematic simulation: positions + gear angles.
 *  Radii are constants in simulation (baked into the links), not variables.
 *  Angles are never anchored, so they carry no mass map. */
export type SimNodes = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  angles: Map<string, number>;
};

/** Kinds of (non oriented) connections between points. */
export type Link = {
  /** User element this constraint belongs to, for diagnostics and canvas
   *  selection. Optional: purely internal links (Coincidence, grab) leave it
   *  unset and are never surfaced as "unsatisfied constraints". */
  owner?: ID;
} & (
  | { type: "Coincidence"; ddl: 2; key1: string; key2: string }
  | { type: "Distance"; ddl: 1; key1: string; key2: string; distance: number }
  | {
      type: "DistanceToLine";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      distance: number;
    }
  | { type: "SlideOnSegment"; ddl: 1; key1: string; key2: string; key3: string }
  | {
      type: "FixedOnSegment";
      ddl: 2;
      key1: string;
      key2: string;
      key3: string;
      t: number;
    }
  | {
      type: "KeepOrientation";
      ddl: 1;
      key1: string;
      key2: string;
      direction: Point2;
    }
  | {
      type: "Angle";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
      flipStart: boolean;
      flipEnd: boolean;
      couterClockwise: boolean;
      angle_rad: number;
    }
  | { type: "Radius"; ddl: 1; key1: string; radius: number }
  | { type: "Horizontal"; ddl: 1; key1: string; key2: string }
  | { type: "Vertical"; ddl: 1; key1: string; key2: string }
  | {
      type: "Normal";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "Parallel";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "EqualLength";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | { type: "GearMeshing"; ddl: 1; key1: string; key2: string; radKey1: string; radKey2: string }
  | { type: "GearRatio"; ddl: 1; key1: string; key2: string; ratio: number }
  // ── Simulation-only links ────────────────────────────────────────────────
  // Motor driving a beam orientation: rotates `drivenKey` around `pivotKey`
  // toward `targetAngle` (absolute world angle of pivot→driven). `targetAngle`
  // is recomputed each frame = current angle + omega·dt (no backlog when blocked).
  | {
      type: "MotorBeam";
      ddl: 1;
      pivotKey: string;
      drivenKey: string;
      omega: number;
      targetAngle: number;
    }
  // Motor driving a gear angle node toward `targetAngle` (scalar).
  | { type: "MotorAngle"; ddl: 1; angleKey: string; omega: number; targetAngle: number }
  // Epicyclic gear meshing in angle space, frozen at sim start:
  // r1·((θ1−θ1₀) − (α−α₀)) = −r2·((θ2−θ2₀) − (α−α₀)), α = angle(p2 − p1).
  // Corrects angle nodes only. `alpha` is the continuous (unwrapped) line-of-centres
  // angle, recomputed from positions each frame by step_simulation; `alpha0` is its
  // frozen reference at sim start.
  | {
      type: "GearMeshAngle";
      ddl: 1;
      angleKey1: string;
      angleKey2: string;
      posKey1: string;
      posKey2: string;
      r1: number;
      r2: number;
      theta1_0: number;
      theta2_0: number;
      alpha0: number;
      alpha: number;
    }
  // Co-axial gears: θ1 − θ2 = offset (same rotation, constant offset).
  | { type: "CoaxialAngle"; ddl: 1; angleKey1: string; angleKey2: string; offset: number }
  // A node (join/pivot) fixed to a gear perimeter: N = centre + radius·u(θ + offset).
  // Bidirectional coupling between the node position and the gear angle node.
  | {
      type: "GearPerimeterPin";
      ddl: 2;
      nodeKey: string;
      centerKey: string;
      angleKey: string;
      radius: number;
      offset: number;
    }
  // A beam attached to a gear-fixed join: its orientation follows the gear angle
  // (rotate `drivenKey` around `pivotKey` so angle(driven−pivot) = θ + offset).
  | {
      type: "BeamFollowsAngle";
      ddl: 1;
      pivotKey: string;
      drivenKey: string;
      angleKey: string;
      offset: number;
    }
  | { type: "HandleGrab"; ddl: 1; grabbedKey: string; value: Point2 | number }
  // Compliant spring: soft attraction of key1↔key2 toward `restLength`.
  // Removes NO degree of freedom (ddl 0): it only biases a free DOF toward the
  // rest length, it never rigidly fixes the distance. `stiffness` is a per-
  // iteration relaxation factor in [0,1) — a *relative* softness, not a physical
  // k (this is a quasi-static solver: no mass, no inertia, no real force). Its
  // residual is intentionally excluded from the solver's convergence error.
  | {
      type: "Spring";
      ddl: 0;
      key1: string;
      key2: string;
      restLength: number;
      stiffness: number;
    }
);
