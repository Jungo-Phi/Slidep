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
  // ── Belt links (simulation) ──────────────────────────────────────────────
  // Inextensible belt: total geometric length (tangent runs + gear wraps) held
  // at `length`. One global scalar constraint per belt — moving a pulley
  // redistributes the whole loop to conserve length (belt transmission).
  // `startKey`/`endKey` are the belt's terminal endpoints (fused to their anchor
  // node); `gearPosKeys`/`radii`/`directions` describe the wrapped pulleys in
  // path order (radii baked: fixed in simulation). Gradient wrt a centre =
  // −(sum of adjacent tangent units). Simulation-only.
  | {
      type: "BeltLength";
      ddl: 1;
      startKey: string;
      endKey: string;
      gearPosKeys: string[];
      // Bare gear ids (angle nodes — NOT fused), index-aligned to gearPosKeys,
      // used to rebuild the mesh chain when a pulley disconnects.
      gearAngleKeys: string[];
      radii: number[];
      directions: boolean[];
      length: number;
      // Tight belt → the closed gear cycle (start/end terminals unused); loose
      // belt → open chain between the anchored terminals.
      closed: boolean;
      // Simulation state (mutated per frame, reset on recompile): continuous
      // wrap angle per pulley and whether it has lost contact (irreversible for
      // the run). A disconnected pulley is skipped — the belt runs straight past.
      wraps?: number[];
      disconnected?: boolean[];
    }
  // Tight-belt junction: the join node `nodeKey` (fused start==end) lies on the
  // belt outline — the nearest piece (segment or arc) of the CLOSED gear cycle —
  // so the loop stays continuous anywhere the junction travels. Radii baked.
  // Symmetric: J and the piece's bounding gear centre(s) move. Both solvers.
  // (Arc tangency is structural here, so no "virtual duplicate gear" is needed.)
  | {
      type: "BeltJunction";
      ddl: 1;
      nodeKey: string;
      gearPosKeys: string[];
      radii: number[];
      directions: boolean[];
    }
  // Belt pin (simulation): the attached node `nodeKey` rides the tight belt at
  // arc-length s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0) — i.e. it travels as the
  // belt rotates (θ_ref = reference pulley angle, ε = dir?1:−1). Bidirectional:
  // dragging the node along the belt advances θ_ref (which turns every pulley via
  // BeltMeshAngle), and pulling it off the belt snaps it back. Radii + refs baked.
  | {
      type: "BeltPin";
      ddl: 2;
      nodeKey: string;
      gearPosKeys: string[];
      radii: number[];
      directions: boolean[];
      refIndex: number;
      // Reference pulley's angle node (bare gear id — NOT fused, unlike the
      // position keys, since angles live in their own map).
      refAngleKey: string;
      s0: number;
      thetaRef0: number;
      // Continuous wrap per pulley (copied each frame from the belt's BeltLength
      // link) so the junction travels around wound pulleys (>2π), not only the
      // fractional arc. Undefined until the first sim frame.
      wraps?: number[];
    }
  // Belt end travel (simulation, loose belts): a terminal end rides its tangent
  // to the adjacent pulley as the belt travels — the free length to the pulley's
  // tangent point tracks `lfree0 + sign·r·ε·(θ − θ0)` (sign −1 at the start end,
  // +1 at the end end). Bidirectional: pulling a free end turns the pulley; an
  // anchored end blocks the travel (and thus the rotation). Baked geometry.
  | {
      type: "BeltEndTravel";
      ddl: 1;
      nodeKey: string;
      gearPosKey: string;
      radius: number;
      direction: boolean;
      refAngleKey: string; // adjacent pulley angle (bare gear id)
      rEps: number; // radius · (direction ? −1 : 1)
      sign: number; // −1 start terminal, +1 end terminal
      lfree0: number;
      thetaRef0: number;
    }
  // Belt follows tangent (simulation): a beam welded to the belt junction keeps
  // its orientation aligned with the belt tangent at the junction — angle(driven
  // − pivot) = tangentAngle(s) + offset, s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0).
  // Bidirectional, weighted by the local curvature: on an arc, rotating the beam
  // advances the belt; on a straight run the tangent is fixed so the beam just
  // tracks it. Baked geometry.
  | {
      type: "BeltFollowsTangent";
      ddl: 1;
      pivotKey: string;
      drivenKey: string;
      gearPosKeys: string[];
      radii: number[];
      directions: boolean[];
      refIndex: number;
      refAngleKey: string; // bare gear id (angle node, not fused)
      s0: number;
      thetaRef0: number;
      offset: number;
    }
  // Belt rotation transmission (angle space): two consecutive wrapped gears keep
  // equal belt surface speed rᵢ·Δθᵢ·εᵢ = rⱼ·Δθⱼ·εⱼ, εₖ = dirₖ?1:−1 (open belt
  // → same sense, crossed → opposite). Like GearMeshAngle but "same surface".
  // Corrects angle nodes only; radii + reference angles baked. Simulation-only.
  | {
      type: "BeltMeshAngle";
      ddl: 1;
      angleKey1: string;
      angleKey2: string;
      r1: number;
      r2: number;
      theta1_0: number;
      theta2_0: number;
      dir1: boolean;
      dir2: boolean;
    }
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
