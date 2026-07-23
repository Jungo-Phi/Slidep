import { describe, it } from "vitest";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { sort_links } from "./utils";
import {
  buildBeltSegmentNoSlipLinks,
  BeltNoSlipSpec,
} from "./experimental/belt-noslip-q";
import {
  makeClosedBelt,
  makeOpenBelt,
  closedBeltLengthLink,
  openBeltLengthLink,
  residualPerSweep,
  sweepsToConverge,
  dofConcurrency,
  traceSolve,
} from "./experimental/belt-q-bench";

/**
 * Q2 — DOFs written by the segment no-slip: option 1 (angles only) vs option 2
 * (angles + centres along the strand tangent). Same cases as Q1 plus an open
 * belt with terminals. Measures sweeps-to-converge for each option AND the
 * concurrency with BeltLength on shared position DOFs.
 */

const isQ = (l: Link) => l.type === "BeltSegmentNoSlip";

describe("Q2 — angles only vs angles + positions", () => {
  it("closed belts 3/5/8: option 1 vs option 2", () => {
    console.log("\n=== Q2 closed: one centre +5px ===");
    console.log("N | opt1 sweeps | opt2 sweeps | opt2 shared-sweeps | keys");
    for (const n of [3, 5, 8]) {
      const measure = (writePositions: boolean) => {
        const rig = makeClosedBelt(n);
        const belt = closedBeltLengthLink(rig);
        const spec: BeltNoSlipSpec = {
          gearPosKeys: rig.gearPosKeys,
          gearAngleKeys: rig.gearAngleKeys,
          radii: rig.radii,
          directions: rig.directions,
          closed: true,
          writePositions,
        };
        const qLinks = buildBeltSegmentNoSlipLinks(
          rig.positions,
          rig.angles,
          spec,
        );
        const moved = n >> 1;
        const p = rig.positions.get(`g${moved}`)!;
        rig.positions.set(`g${moved}`, new Point2(p.x + 5, p.y));
        const links = sort_links([belt, ...qLinks], rig.posMasses);
        const events = traceSolve(
          rig.positions,
          new Map(),
          rig.posMasses,
          links,
          rig.angles,
          200,
        );
        return {
          sweeps: sweepsToConverge(residualPerSweep(events, isQ)),
          conc: dofConcurrency(events),
        };
      };
      const o1 = measure(false);
      const o2 = measure(true);
      console.log(
        `${n} | ${o1.sweeps} | ${o2.sweeps} | ${o2.conc.sharedSweeps} | ${o2.conc.keys.length} keys`,
      );
    }
  });

  it("open belt (terminals): option 1 vs option 2 + concurrency", () => {
    console.log("\n=== Q2 open: N pulleys + 2 terminals, one centre +5px ===");
    console.log("N | opt1 sweeps | opt2 sweeps | opt1 shared | opt2 shared");
    for (const n of [3, 5, 8]) {
      const measure = (writePositions: boolean) => {
        const rig = makeOpenBelt(n);
        const belt = openBeltLengthLink(rig, rig.startKey, rig.endKey);
        const spec: BeltNoSlipSpec = {
          gearPosKeys: rig.gearPosKeys,
          gearAngleKeys: rig.gearAngleKeys,
          radii: rig.radii,
          directions: rig.directions,
          closed: false,
          startKey: rig.startKey,
          endKey: rig.endKey,
          writePositions,
        };
        const qLinks = buildBeltSegmentNoSlipLinks(
          rig.positions,
          rig.angles,
          spec,
        );
        const moved = n >> 1;
        const p = rig.positions.get(`g${moved}`)!;
        rig.positions.set(`g${moved}`, new Point2(p.x, p.y + 5));
        const links = sort_links([belt, ...qLinks], rig.posMasses);
        const events = traceSolve(
          rig.positions,
          new Map(),
          rig.posMasses,
          links,
          rig.angles,
          300,
        );
        return {
          sweeps: sweepsToConverge(residualPerSweep(events, isQ)),
          conc: dofConcurrency(events),
        };
      };
      const o1 = measure(false);
      const o2 = measure(true);
      console.log(
        `${n} | ${o1.sweeps} | ${o2.sweeps} | ${o1.conc.sharedSweeps} | ${o2.conc.sharedSweeps} (${o2.conc.keys.length} keys)`,
      );
    }
  });
});
