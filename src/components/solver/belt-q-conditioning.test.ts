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
  residualPerSweep,
  sweepsToConverge,
  traceSolve,
  BeltRig,
} from "./experimental/belt-q-bench";

/**
 * Q1 — convergence speed of the segment no-slip CHAIN on a closed belt, and the
 * role of link ordering. One centre nudged 5 px; positions frozen (no
 * BeltLength), option-1 links (angles only). Sweeps to worst residual < 1e-6, in
 * order (a) sort_links and (b) explicitly along the belt.
 */

const isQ = (l: Link) => l.type === "BeltSegmentNoSlip";

function specOf(rig: BeltRig, writePositions = false): BeltNoSlipSpec {
  return {
    gearPosKeys: rig.gearPosKeys,
    gearAngleKeys: rig.gearAngleKeys,
    radii: rig.radii,
    directions: rig.directions,
    closed: true,
    writePositions,
  };
}

describe("Q1 — chain convergence vs ordering", () => {
  it("measures sweeps-to-converge for closed belts of 3, 5, 8 pulleys", () => {
    const sizes = [3, 5, 8];
    console.log("\n=== Q1: closed belt, one centre +5px, option 1 (angles) ===");
    console.log("N | sweeps (a) sort_links | sweeps (b) along-belt");
    for (const n of sizes) {
      const rig = makeClosedBelt(n);
      // Build the length link + q-links at rest (bakes target length & h0)…
      const belt = closedBeltLengthLink(rig);
      const qLinks = buildBeltSegmentNoSlipLinks(
        rig.positions,
        rig.angles,
        specOf(rig),
      );
      // …THEN displace a centre so BeltLength has a length error to correct.
      const moved = n >> 1;
      const p = rig.positions.get(`g${moved}`)!;
      rig.positions.set(`g${moved}`, new Point2(p.x + 5, p.y));

      const runOrder = (ordered: Link[], label: string): number => {
        const positions = new Map(
          [...rig.positions].map(([k, v]) => [k, v.clone()]),
        );
        const angles = new Map(rig.angles);
        const events = traceSolve(
          positions,
          new Map(),
          rig.posMasses,
          ordered,
          angles,
          200,
        );
        const per = residualPerSweep(events, isQ);
        const s = sweepsToConverge(per);
        console.log(
          `   [${label}] N=${n} sweeps=${s} first3=[${per
            .slice(0, 3)
            .map((x) => x.toExponential(1))
            .join(", ")}]`,
        );
        return s;
      };

      const along = [belt, ...qLinks]; // BeltLength then segments 0,1,…,N−1
      const sorted = sort_links(along, rig.posMasses);
      const sa = runOrder(sorted, "a sort_links");
      const sb = runOrder(along, "b along-belt");
      console.log(`${n} | ${sa} | ${sb}`);
    }
  });

  it("isolates pure chain propagation on an OPEN belt (frozen geometry)", () => {
    // Open belt, positions frozen (no BeltLength): Δh ≡ 0, both terminals q = 0,
    // so the unique solution is θ ≡ 0. Perturb the first pulley's angle and watch
    // the correction diffuse down the chain — this is the pure O(1)-vs-O(N)
    // ordering question, with no geometry coupling.
    const sizes = [3, 5, 8];
    console.log("\n=== Q1b: open belt, θ(g0) += 1 rad, frozen geometry ===");
    console.log("N | along-belt | sort_links | reversed");
    for (const n of sizes) {
      const rig = makeOpenBelt(n);
      const qLinks = buildBeltSegmentNoSlipLinks(rig.positions, rig.angles, {
        gearPosKeys: rig.gearPosKeys,
        gearAngleKeys: rig.gearAngleKeys,
        radii: rig.radii,
        directions: rig.directions,
        closed: false,
        startKey: rig.startKey,
        endKey: rig.endKey,
        writePositions: false,
      });

      const run = (ordered: Link[], label: string): number => {
        const positions = new Map(
          [...rig.positions].map(([k, v]) => [k, v.clone()]),
        );
        const angles = new Map(rig.angles);
        angles.set("g0", 1); // perturb the first pulley
        const events = traceSolve(
          positions,
          new Map(),
          rig.posMasses,
          ordered,
          angles,
          200,
        );
        const per = residualPerSweep(events, isQ);
        const s = sweepsToConverge(per);
        console.log(`   [${label}] N=${n} sweeps=${s}`);
        return s;
      };

      // Shuffle before sorting, so sort_links can't just inherit my input order —
      // it must RECONSTRUCT the along-belt order to score O(1).
      const shuffled = [...qLinks].sort(() => Math.random() - 0.5);
      const along = run(qLinks, "along-belt");
      const sorted = run(sort_links(shuffled, rig.posMasses), "sort(shuffled)");
      const reversed = run([...qLinks].reverse(), "reversed");
      console.log(`${n} | ${along} | ${sorted} | ${reversed}`);
    }
  });
});
