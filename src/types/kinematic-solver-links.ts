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
  | {
      type: "GearMeshing";
      ddl: 1;
      key1: string;
      key2: string;
      radKey1: string;
      radKey2: string;
    }
  | { type: "GearRatio"; ddl: 1; key1: string; key2: string; ratio: number }
  // Gradient wrt a centre = −(sum of adjacent tangent units). Simulation-only.
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
      // wrap angle per pulley
      wraps?: number[];
      disconnected?: boolean[];
    }
  // Tight-belt junction (geometric-solver)
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
  // BeltPhaseGear), and pulling it off the belt snaps it back. Radii + refs baked.
  | {
      type: "BeltPin";
      ddl: 2;
      nodeKey: string;
      gearPosKeys: string[];
      radii: number[];
      directions: boolean[];
      refIndex: number;
      refAngleKey: string;
      s0: number;
      thetaRef0: number;
      // Continuous wrap per pulley (copied from the belt's BeltLength link)
      // so the junction travels around wound pulleys (>2π).
      // Undefined until the first sim frame.
      wraps?: number[];
    }
  // Belt free ends (simulation, loose belts): ONE link per belt governing BOTH terminal endpoints together.
  // The belt is inextensible, so the total drawn length is held at `length` (this pins the SUM of the two free runs).
  // the shared travel φ drives their DIFFERENTIAL, so one run winds in as the other feeds out.
  // When a run is exhausted its terminal winds onto its pulley and orbits with θ (start on gearPosKeys[0], end on gearPosKeys[last]),
  // the loop stays length-correct and the motor never blocks. Bidirectional: dragging a free end advances φ.
  | {
      type: "BeltFreeEnds";
      ddl: 2;
      startKey: string;
      endKey: string;
      gearPosKeys: string[];
      gearAngleKeys: string[];
      radii: number[];
      directions: boolean[];
      phaseKey: string; // belt travel φ `${beltId}:phi`
      length: number; // L0, total inextensible belt length
      diff0: number; // initial (fsStart − fsEnd), the differential reference
      // A terminal already pinned on its pulley perimeter (winch: a join with a
      // GearPerimeterPin) is driven EXTERNALLY — this link must not position it,
      // only read it (its growing wound arc pulls the free end in). Baked at parse.
      startExternal?: boolean;
      endExternal?: boolean;
      // Sim state: baked gear-relative angle of a terminal wound onto its pulley,
      // undefined while the run is free.
      startWind?: number;
      endWind?: number;
      // Sim state: continuous (unwrapped) wrap per pulley, copied each frame from
      // the belt's BeltLength link, so a wound terminal's arc grows smoothly past
      // 2π (no 0/2π seam jump that would snap the free end).
      wraps?: number[];
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
