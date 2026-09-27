import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../../types";
import { solveNodesFromMaps } from "../nodes";
import { resolve_slots } from "../kinematics/link-slots";
import { DIRECT_LINK_TYPES, Rows, evaluate_rows } from "./direct-rows";

/** One link of every handled type, over points A–D, gear angles g1/g2. */
const LINKS: Link[] = [
  { type: "Distance", ddl: 1, key1: "A", key2: "B", distance: 0.3, compliance: 1e-6 },
  { type: "FixedOnSegment", ddl: 2, key1: "A", key2: "B", key3: "C", t: 0.3 },
  { type: "FixedOnSegment", ddl: 2, key1: "A", key2: "B", key3: "C", t: 0.7, normalOffset: 0.05 },
  { type: "SlideOnSegment", ddl: 1, key1: "A", key2: "B", key3: "C" },
  { type: "SlideOnSegment", ddl: 1, key1: "A", key2: "B", key3: "C", normalOffset: 0.05 },
  { type: "SlideOnSegment", ddl: 1, key1: "A", key2: "B", key3: "D" },
  { type: "KeepOrientation", ddl: 1, key1: "A", key2: "C", direction: new Point2(1, 2) },
  {
    type: "Angle", ddl: 1, key1: "A", key2: "B", key3: "C", key4: "D",
    flipStart: true, flipEnd: false, couterClockwise: true, angle_rad: 0.4,
  },
  { type: "GearPerimeterPin", ddl: 2, nodeKey: "C", centerKey: "A", angleKey: "g1", radius: 0.2, offset: 0.1 },
  { type: "BeamFollowsAngle", ddl: 1, pivotKey: "B", drivenKey: "D", angleKey: "g2", offset: -0.3 },
  {
    type: "GearMeshAngle", ddl: 1, angleKey1: "g1", angleKey2: "g2", posKey1: "A", posKey2: "B",
    r1: 0.1, r2: 0.25, theta1_0: 0.2, theta2_0: -0.1, alpha0: 0.3, alpha: 0.5,
  },
  { type: "CoaxialAngle", ddl: 1, angleKey1: "g1", angleKey2: "g2", offset: 0.2 },
];

function nodes_at(seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const positions = new Map(["A", "B", "C", "D"].map((k) => [k, new Point2(rand(), rand())]));
  // D sits past B along A→B, so the second slider meets its end stop.
  const a = positions.get("A")!;
  const b = positions.get("B")!;
  positions.set("D", b.add(b.sub(a).mul(0.4)).add(new Point2(0.01, -0.02)));
  const masses = new Map([...positions.keys()].map((k) => [k, 1]));
  const angles = new Map([["g1", rand()], ["g2", rand()]]);
  return solveNodesFromMaps(positions, masses, angles, new Map(), new Map());
}

describe("direct rows", () => {
  it("covers every handled type", () => {
    for (const type of DIRECT_LINK_TYPES) expect(LINKS.some((l) => l.type === type)).toBe(true);
  });

  it("gives every row its exact gradient", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const nodes = nodes_at(seed);
      const slots = resolve_slots(LINKS, nodes);
      const handled = new Uint8Array(LINKS.length).fill(1);
      const rows = new Rows();
      evaluate_rows(nodes, LINKS, slots, handled, 1e4, rows);
      expect(rows.count).toBeGreaterThan(LINKS.length);

      const unknowns = 2 * nodes.count + nodes.angle.length;
      const get = (v: number) => (v < 2 * nodes.count ? (v % 2 ? nodes.y : nodes.x)[v >> 1] : nodes.angle[v - 2 * nodes.count]);
      const set = (v: number, value: number) => {
        if (v < 2 * nodes.count) (v % 2 ? nodes.y : nodes.x)[v >> 1] = value;
        else nodes.angle[v - 2 * nodes.count] = value;
      };
      const h = 1e-7;
      const probe = new Rows();
      for (let r = 0; r < rows.count; r++) {
        for (let v = 0; v < unknowns; v++) {
          const x0 = get(v);
          set(v, x0 + h);
          evaluate_rows(nodes, LINKS, slots, handled, 1e4, probe);
          const plus = probe.value[r];
          set(v, x0 - h);
          evaluate_rows(nodes, LINKS, slots, handled, 1e4, probe);
          const minus = probe.value[r];
          set(v, x0);
          let analytic = 0;
          for (let j = 0; j < rows.width[r]; j++) if (rows.vars[r * 8 + j] === v) analytic += rows.grads[r * 8 + j];
          expect(
            Math.abs((plus - minus) / (2 * h) - analytic),
            `${LINKS[rows.link[r]].type}, row ${r}, unknown ${v}`,
          ).toBeLessThan(1e-5 * Math.max(1, Math.abs(analytic)));
        }
      }
    }
  });
});
