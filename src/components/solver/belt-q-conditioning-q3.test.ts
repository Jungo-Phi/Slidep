import { describe, it } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { sort_links } from "./utils";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import {
  buildBeltSegmentNoSlipLinks,
  BeltNoSlipSpec,
} from "./experimental/belt-noslip-q";
import {
  makeClosedBelt,
  closedBeltLengthLink,
  BeltRig,
} from "./experimental/belt-q-bench";

/**
 * Q3 — the closed belt's circular (uniform-q travel) mode, with BeltPin's
 * position→angle piloting GONE (the q-model has no BeltPin). (a) nothing drives
 * it → does the travel stay put over 500 sweeps? (b) one motor → is the travel
 * fixed by that single source? (c) list the loop from 3 different start vias →
 * is the final motion identical? (the direct control of the factor-31 bug).
 */

const f = (x: number, n = 6) => x.toFixed(n);

function specOf(rig: BeltRig): BeltNoSlipSpec {
  return {
    gearPosKeys: rig.gearPosKeys,
    gearAngleKeys: rig.gearAngleKeys,
    radii: rig.radii,
    directions: rig.directions,
    closed: true,
    writePositions: false,
  };
}

/** Mean uniform-travel component q̄ = mean_k r_k·ε_k·θ_k over the belt. */
function meanTravel(rig: BeltRig, angles: Map<string, number>): number {
  let s = 0;
  for (let i = 0; i < rig.gearPosKeys.length; i++) {
    const eps = rig.directions[i] ? -1 : 1;
    s += rig.radii[i] * eps * (angles.get(rig.gearAngleKeys[i]) ?? 0);
  }
  return s / rig.gearPosKeys.length;
}

describe("Q3 — circular mode without the BeltPin pilot", () => {
  it("(a) no driver: no spontaneous travel over 500 sweeps", () => {
    const rig = makeClosedBelt(5);
    const belt = closedBeltLengthLink(rig);
    const qLinks = buildBeltSegmentNoSlipLinks(rig.positions, rig.angles, specOf(rig));
    const links = sort_links([belt, ...qLinks], rig.posMasses);
    const angles = new Map(rig.angles);
    PBD_kinematic_solver(
      rig.positions,
      new Map(),
      rig.posMasses,
      new Map(),
      links,
      500,
      1e-12,
      angles,
    );
    let maxTheta = 0;
    for (const k of rig.gearAngleKeys)
      maxTheta = Math.max(maxTheta, Math.abs(angles.get(k) ?? 0));
    console.log("\n=== Q3(a) rest, no driver, 500 sweeps ===");
    console.log(`max|θ| = ${maxTheta.toExponential(3)} rad, travel q̄ = ${meanTravel(rig, angles).toExponential(3)}`);
  });

  it("(b) one motor fixes the travel", () => {
    const rig = makeClosedBelt(5);
    const belt = closedBeltLengthLink(rig);
    const qLinks = buildBeltSegmentNoSlipLinks(rig.positions, rig.angles, specOf(rig));
    const target = 0.3;
    const motor: Link = {
      type: "MotorAngle",
      ddl: 1,
      angleKey: "g0",
      omega: 0,
      targetAngle: target,
    };
    const links = sort_links([belt, motor, ...qLinks], rig.posMasses);
    const angles = new Map(rig.angles);
    PBD_kinematic_solver(
      rig.positions,
      new Map(),
      rig.posMasses,
      new Map(),
      links,
      500,
      1e-12,
      angles,
    );
    // Rest geometry (motor turns g0, nothing moves centres) → Δh ≡ 0 → q uniform.
    const q0 = rig.radii[0] * (rig.directions[0] ? -1 : 1) * (angles.get("g0") ?? 0);
    console.log("\n=== Q3(b) motor on g0 → target 0.3 rad ===");
    console.log(`θ(g0) = ${f(angles.get("g0") ?? 0)} (target ${target})`);
    console.log("pulley | θ | q=r·ε·θ (should all equal q0)");
    for (let i = 0; i < rig.gearPosKeys.length; i++) {
      const eps = rig.directions[i] ? -1 : 1;
      const th = angles.get(rig.gearAngleKeys[i]) ?? 0;
      console.log(`  g${i} | ${f(th)} | ${f(rig.radii[i] * eps * th)}`);
    }
    console.log(`q0 = ${f(q0)}, travel q̄ = ${f(meanTravel(rig, angles))}`);
  });

  it("(control) a frozen pulley blocks the travel (q enforces no-slip)", () => {
    // Closed belt at rest (Δh ≡ 0 ⇒ uniform q). Freeze g2 with an ANCHORED
    // GearPerimeterPin, then a motor on g0 demands q≠0. Uniform q with q(g2)=0
    // ⇒ q≡0 ⇒ the motor must be blocked. This validates the q-apply's blocking.
    const rig = makeClosedBelt(5, { anchored: [2] }); // g2 centre on the frame
    const belt = closedBeltLengthLink(rig);
    const qLinks = buildBeltSegmentNoSlipLinks(rig.positions, rig.angles, specOf(rig));
    // Perimeter node on g2, anchored at angle 0 → θ(g2) frozen.
    const c2 = rig.positions.get("g2")!;
    rig.positions.set("pin2", new Point2(c2.x + rig.radii[2], c2.y));
    rig.posMasses.set("pin2", 0);
    const pin: Link = {
      type: "GearPerimeterPin",
      ddl: 2,
      nodeKey: "pin2",
      centerKey: "g2",
      angleKey: "g2",
      radius: rig.radii[2],
      offset: 0,
    };
    const motor: Link = {
      type: "MotorAngle",
      ddl: 1,
      angleKey: "g0",
      omega: 0,
      targetAngle: 0.3,
    };
    const links = sort_links([belt, pin, motor, ...qLinks], rig.posMasses);
    const angles = new Map(rig.angles);
    PBD_kinematic_solver(rig.positions, new Map(), rig.posMasses, new Map(), links, 500, 1e-12, angles);
    console.log("\n=== Q3(control) frozen g2 + motor on g0 (target 0.3) ===");
    console.log(`θ(g0) = ${f(angles.get("g0") ?? 0)}  (blocked ⇒ ≪ 0.3)`);
    console.log(`θ(g2) = ${f(angles.get("g2") ?? 0)}  (frozen ⇒ ≈ 0)`);
  });

  it("(c) listing-start invariance (the factor-31 control)", () => {
    console.log("\n=== Q3(c) same mechanism, loop listed from 3 start vias ===");
    // Anchor g0, displace g1: a determinate perturbation. A driver (motor on g0)
    // fixes the travel so the comparison is well-posed.
    const buildRig = () => {
      const rig = makeClosedBelt(5, { anchored: [0] });
      const p = rig.positions.get("g1")!;
      // (perturbation applied AFTER baking, inside runShift)
      return { rig, restG1: p.clone() };
    };

    const runShift = (shift: number): Map<string, number> => {
      const rig = makeClosedBelt(5, { anchored: [0] });
      // Rotate the listing: which via is index 0 moves, the mechanism does not.
      const rot = <T,>(a: T[]) => [...a.slice(shift), ...a.slice(0, shift)];
      const listed: BeltRig = {
        ...rig,
        gearPosKeys: rot(rig.gearPosKeys),
        gearAngleKeys: rot(rig.gearAngleKeys),
        radii: rot(rig.radii),
        directions: rot(rig.directions),
      };
      const belt = closedBeltLengthLink(listed);
      const qLinks = buildBeltSegmentNoSlipLinks(rig.positions, rig.angles, specOf(listed));
      const motor: Link = {
        type: "MotorAngle",
        ddl: 1,
        angleKey: "g0",
        omega: 0,
        targetAngle: 0.3,
      };
      // Perturb g1 AFTER baking h0/length.
      const p = rig.positions.get("g1")!;
      rig.positions.set("g1", new Point2(p.x + 5, p.y));
      const links = sort_links([belt, motor, ...qLinks], rig.posMasses);
      const angles = new Map(rig.angles);
      PBD_kinematic_solver(
        rig.positions,
        new Map(),
        rig.posMasses,
        new Map(),
        links,
        400,
        1e-12,
        angles,
      );
      return angles;
    };

    void buildRig;
    const a0 = runShift(0);
    const a1 = runShift(1);
    const a2 = runShift(2);
    const keys = ["g0", "g1", "g2", "g3", "g4"];
    console.log("pulley | θ(start0) | θ(start1) | θ(start2)");
    let maxSpread = 0;
    for (const k of keys) {
      const v = [a0.get(k) ?? 0, a1.get(k) ?? 0, a2.get(k) ?? 0];
      maxSpread = Math.max(maxSpread, Math.max(...v) - Math.min(...v));
      console.log(`  ${k} | ${f(v[0])} | ${f(v[1])} | ${f(v[2])}`);
    }
    console.log(`max spread across listings = ${maxSpread.toExponential(3)} rad`);
  });
});
