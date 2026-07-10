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
  // Inextensible belt, ONE link per belt, both solvers' simulation path. Holds the
  // total drawn length at `length`; gradient wrt a pulley centre = −(sum of adjacent
  // tangent units). For a CLOSED (tight) belt that is all it does. For an OPEN
  // (loose) belt it ALSO governs the two terminal endpoints: the length pins the SUM
  // of their free runs while the shared travel φ drives their DIFFERENTIAL (one run
  // winds in as the other feeds out), and an exhausted run winds onto its pulley and
  // orbits with θ (start on gearPosKeys[0], end on gearPosKeys[last]) so the motor
  // never blocks. Bidirectional: dragging a free end advances φ. (This absorbed the
  // former separate BeltFreeEnds link.)
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
      // Continuous (unwrapped) wrap per pulley, tracked each frame; whole turns feed
      // the length so winding past 2π stays smooth. disconnected = lost contact.
      wraps?: number[];
      disconnected?: boolean[];
      // ── Open-belt terminal handling (unused when closed) ──
      phaseKey?: string; // belt travel φ `${beltId}:phi`
      diff0?: number; // initial (fsStart − fsEnd), the differential reference
      // A terminal already pinned on its pulley perimeter (winch: a join with a
      // GearPerimeterPin) is driven EXTERNALLY — this link must not position it,
      // only read it (its growing wound arc pulls the free end in). Baked at parse.
      startExternal?: boolean;
      endExternal?: boolean;
      // Sim state: baked gear-relative angle of a terminal wound onto its pulley
      // (undefined while free), plus the belt travel φ at the moment it wound on —
      // the wound/unwound decision is driven off φ (how far the belt has fed since),
      // not the terminal's illusory tangent stub near the rim.
      startWind?: number;
      endWind?: number;
      startWindPhi?: number;
      endWindPhi?: number;
      // Transient (per-frame): which terminal of THIS belt is currently grabbed.
      // The length constraint drives φ to unwind the OPPOSITE (wound) end only when
      // the user pulls a FREE terminal — that pull must be able to peel the belt off
      // the far pulley. A motor turns the pulley directly (no φ coupling needed), and
      // grabbing the wound end itself just detaches it (DETACH_TOL), so neither uses
      // this path.
      grabbedTerminal?: "start" | "end";
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
