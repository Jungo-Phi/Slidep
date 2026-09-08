/**
 * What the ruler holds, and what it reads.
 *
 * Everything here names elements rather than points, so a reading follows the mechanism as it moves — a ruler laid between two pivots goes on measuring them while a simulation runs.
 * An end laid on empty space keeps a point of its own, and stays where it was put.
 */

import type { ID } from "./element";
import type { WorldPoint } from "./mechanism";

export type MeasureAnchor =
  | { kind: "free"; position: WorldPoint }
  | { kind: "node"; nodeID: ID }
  /** A gear is held by its rim, not by a point of it: which point that is, only the opposite
   * end can say — the nearest one.
   * Its centre is reached through its axle, which is a node like any other, so nothing here has to choose between the two. */
  | { kind: "gear"; gearID: ID }
  | { kind: "edge-end"; edgeID: ID; part: "start" | "end" }
  /** A point along an edge's body, at `t` of its start→end span. */
  | { kind: "edge-point"; edgeID: ID; t: number };

/**
 * The three things a ruler can read.
 *
 * A distance spans two ends.
 * An angle is not a span at all — it has a vertex, one of four quadrants, and an arc — so it holds the bars themselves rather than two points.
 * A radius belongs to one gear alone.
 * Which of the three a gesture produces is settled by its second click, as the dimensioning tool settles its own kind.
 */
export type Measure =
  | { kind: "distance"; start: MeasureAnchor; end: MeasureAnchor }
  | {
      kind: "angle";
      startEdgeID: ID;
      endEdgeID: ID;
      /** Which way each bar is read from the vertex: the quadrant the two clicks picked out.
       * Settled once, at the second click — recomputing it as the bars swing would let the reading jump to the opposite angle mid-simulation. */
      flipStart: boolean;
      flipEnd: boolean;
      /** How far from the vertex the arc is drawn, in world units, so it keeps its size as the bars move. */
      radius: number;
    }
  | { kind: "radius"; gearID: ID };

/** A reading, in SI. A distance also reports its components and its own direction, counter-clockwise from the +x axis in ]-π, π]. */
export type MeasureReadout =
  | { kind: "distance"; distance: number; dx: number; dy: number; angle: number }
  | { kind: "angle"; angle: number }
  | { kind: "radius"; radius: number };
