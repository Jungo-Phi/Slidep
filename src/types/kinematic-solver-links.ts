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
export type KinNodes = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  angles: Map<string, number>;
};

/** Kinds of (non oriented) connections between points. */
export type Link = {
  /** Element this constraint belongs to, for diagnostics and canvas
   *  selection. Optional: purely internal links (Coincidence, grab) leave it
   *  unset and are never surfaced as "unsatisfied constraints". */
  owner?: ID;
} & (
  | { type: "Coincidence"; ddl: 2; key1: string; key2: string }
  | {
      type: "Distance";
      ddl: 1;
      key1: string;
      key2: string;
      distance: number;
      // Which way coincident points should part. Ignored as soon as they are
      // apart, since the axis between them is then the real one.
      preferredAxis?: Point2;
    }
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
  | {
      type: "GearMeshing";
      ddl: 1;
      key1: string;
      key2: string;
      radKey1: string;
      radKey2: string;
    }
  // Gear ratio (edition): r1/r2 = ratio. key1/key2 are the gear CENTRE keys (they
  // participate in the position graph and are subject to Coincidence fusion, e.g.
  // a gear fused with its axle); radKey1/radKey2 are the RADIUS-map keys (bare gear
  // ids, never fused) — like GearMeshing, the radii must be read from unfused keys.
  | {
      type: "GearRatio";
      ddl: 1;
      key1: string;
      key2: string;
      radKey1: string;
      radKey2: string;
      ratio: number;
    }
  // Inextensible belt, ONE link per belt, both solvers' simulation path. Holds the
  // total drawn length at `length`; gradient wrt a pulley centre = −(sum of adjacent
  // tangent units). For a CLOSED belt that is all it does. For an OPEN
  // (loose) belt it ALSO governs the two terminal endpoints: the length pins the SUM
  // of their free runs while the shared travel φ drives their DIFFERENTIAL (one run
  // winds in as the other feeds out), and an exhausted run winds onto its pulley and
  // orbits with θ (start on gearPosKeys[0], end on gearPosKeys[last]) so the motor
  // never blocks. Bidirectional: dragging a free end advances φ.
  | {
      type: "BeltLength";
      ddl: 1;
      startKey: string;
      endKey: string;
      gearPosKeys: string[];
      gearAngleKeys: string[];
      radii: number[];
      directions: boolean[];
      length: number;
      closed: boolean;
      // Edition only: the pulleys' RADIUS-map keys (bare gear ids, never fused), same
      // order as `radii`. When present the length constraint also treats the radii as
      // DOFs (∂L/∂r = wrap), so a length dimension resizes the pulleys. Absent in the
      // simulation, where radii are baked.
      radKeys?: string[];
      // Continuous (unwrapped) wrap per pulley, tracked each frame; whole turns feed
      // the length so winding past 2π stays smooth. disconnected = lost contact.
      wraps?: number[];
      // Continuous (unwrapped) ARRIVAL rim angle per pulley — the angle the belt touches
      // down at. The no-slip differential is written in the pulley's frame (fs ± r·ψ), so
      // it needs ψ on a continuous branch. Tracked each frame alongside `wraps`.
      arrivals?: number[];
      disconnected?: boolean[];
      // ── Open-belt terminal handling (unused when closed) ──
      // The two terminals are just FREE ends: the length moves them (each along its belt
      // tangent) and the no-slip differential couples them to the belt travel φ. They do
      // NOT grip/wind — winding is done by attaching a terminal to a gear with a JOIN
      // (its GearPerimeterPin carries it around).
      phaseKey?: string; // belt travel φ `${beltId}:phi`
      diff0?: number; // initial (fsStart − fsEnd), the differential reference, over the FREE ends only
      // A terminal JOINED to its adjacent pulley (winch). Static: the join exists in the
      // mechanism or it does not — never a runtime state. Such an end has no tangent
      // strand: it pays the belt out through that pulley's ARC, and the length constraint
      // must neither move it (its GearPerimeterPin owns it) nor charge φ for it.
      startWound?: boolean;
      endWound?: boolean;
    }
  // Closed-belt junction (geometric-solver)
  | {
      type: "BeltJunction";
      ddl: 1;
      nodeKey: string;
      gearPosKeys: string[];
      radii: number[];
      // Bare (never-fused) gear ids, same order as `radii`, for reading the LIVE radius
      // from the radii map when a length dimension resizes the pulleys in edition.
      radKeys: string[];
      directions: boolean[];
    }
  // Belt pin (simulation): the attached node `nodeKey` rides the belt at
  // arc-length s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0) — i.e. it travels as the
  // belt rotates (θ_ref = reference pulley angle, ε = dir?1:−1). Bidirectional:
  // dragging the node along the belt advances θ_ref (which turns every pulley via
  // BeltPhaseGear), and pulling it off the belt snaps it back. Radii + refs baked.
  // A closed belt is a closed pulley loop; a loose belt is the open path
  // start-terminal → pulleys → end-terminal (`closed:false` + startKey/endKey).
  | {
      type: "BeltPin";
      ddl: 2;
      beltID: ID; // owning belt (owner is the belt too, kept for uniform lookup)
      nodeKey: string;
      gearPosKeys: string[];
      gearAngleKeys: string[]; // bare gear ids, for reference re-election on disconnect
      radii: number[];
      directions: boolean[];
      refIndex: number;
      refAngleKey: string;
      s0: number;
      thetaRef0: number;
      // Open (loose) belt: rides the open path with r=0 terminals. Absent/true =
      // closed loop (its junction).
      closed?: boolean;
      startKey?: string;
      endKey?: string;
      // Continuous wrap per pulley (copied from the belt's BeltLength link)
      // so the junction travels around wound pulleys (>2π).
      // Undefined until the first sim frame.
      wraps?: number[];
      // Pulleys that lost contact mid-sim (copied from BeltLength). The junction
      // rides the REDUCED loop (disconnected gears skipped); s0/thetaRef0/refIndex
      // are re-baked at the disconnect event so it doesn't jump.
      disconnected?: boolean[];
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
      beltID: ID; // owning belt (owner is the welded beam, so the belt is named here)
      pivotKey: string;
      drivenKey: string;
      gearPosKeys: string[];
      gearAngleKeys: string[]; // bare gear ids, for reference re-election on disconnect
      radii: number[];
      directions: boolean[];
      refIndex: number;
      refAngleKey: string; // bare gear id (angle node, not fused)
      s0: number;
      thetaRef0: number;
      offset: number;
      // Pulleys that lost contact mid-sim (copied from BeltLength). The tangent is
      // read from the REDUCED loop; s0/thetaRef0/refIndex re-baked at disconnect.
      disconnected?: boolean[];
    }
  // Belt no-slip (simulation): a wrapped pulley's rotation is tied to the belt's
  // shared travel φ (a per-belt scalar in the angles map): r·ε·(θ − θ0) = φ,
  // ε = dir?−1:1. Every pulley on the belt couples to the SAME φ, so they all
  // transmit through it AND the belt ends / junction couple to the same φ. Corrects the angle node and φ.
  | {
      type: "BeltPhaseGear";
      ddl: 1;
      angleKey: string; // gear id (bare)
      phaseKey: string; // belt travel scalar `${beltId}:phi` (bare)
      r: number;
      eps: number; // dir ? −1 : 1
      theta0: number;
    }
  | {
      type: "MotorBeam";
      ddl: 1;
      pivotKey: string;
      drivenKey: string;
      omega: number;
      targetAngle: number;
    }
  | {
      type: "MotorAngle";
      ddl: 1;
      angleKey: string;
      omega: number;
      targetAngle: number;
    }
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
  | {
      type: "CoaxialAngle";
      ddl: 1;
      angleKey1: string;
      angleKey2: string;
      offset: number;
    }
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
  | {
      type: "BeamFollowsAngle";
      ddl: 1;
      pivotKey: string;
      drivenKey: string;
      angleKey: string;
      offset: number;
    }
  // EXPERIMENTAL (belt "q" model, behind USE_Q_MODEL). One instance per tangent
  // segment a→b of a belt: no-slip q_a − q_b = Δh, q_k = r_k·ε_k·θ_k. Replaces the
  // single shared φ of BeltPhaseGear by a per-segment chain. Never emitted by the
  // parser — only the measurement bench builds these. See experimental/belt-noslip-q.ts.
  | {
      type: "BeltSegmentNoSlip";
      ddl: 1;
      // Pulley a (departure side) and b (arrival side) of the tangent strand.
      // A terminal end has angleKey undefined (q = 0) and posKey the terminal node.
      angleKeyA?: string;
      angleKeyB?: string;
      posKeyA: string;
      posKeyB: string;
      rEpsA: number; // r_a·ε_a  (0 for a terminal)
      rEpsB: number; // r_b·ε_b  (0 for a terminal)
      theta0A: number;
      theta0B: number;
      h0: number; // baked h at rest
      // The whole ordered belt geometry, shared by every segment of the belt, so
      // each instance can recompute h (ℓ + u_a − v_b) from the live positions.
      gearPosKeys: string[];
      radii: number[];
      directions: boolean[];
      closed: boolean;
      startKey?: string;
      endKey?: string;
      segIndex: number; // which tangent piece of belt_pieces(vias, closed) this is
      // Continuous arrival-angle unwrapping reference, per via, updated in place.
      arrivals?: number[];
      // If true the constraint also writes posKeyA/posKeyB along the strand tangent
      // (option 2); false = angles only (option 1).
      writePositions: boolean;
    }
  | { type: "HandleGrab"; ddl: 1; grabbedKey: string; value: Point2 | number }
  | {
      type: "Spring";
      ddl: 0;
      key1: string;
      key2: string;
      restLength: number;
      stiffness: number;
    }
);
