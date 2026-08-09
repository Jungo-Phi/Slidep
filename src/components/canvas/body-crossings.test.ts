import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type { ID, MechanicalElement, PivotElement } from "../../types/element";
import type { ViewportState } from "../../types";
import { nodes_under_segment } from "./body-crossings";

const P = (x: number, y: number) => new Point2(x, y);
const VIEW: ViewportState = {
  scale: 1,
  pan: new Point2(0, 0).as_space<"screen">(),
};

const pivot = (id: string, position: Point2): PivotElement =>
  ({
    type: "pivot",
    id: id as ID,
    probes: [],
    overlays: {},
    position,
    isGrounded: false,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
    motor: undefined,
  }) as PivotElement;

const ids = (elements: { id: ID }[]) => elements.map((e) => e.id).sort();

describe("nodes_under_segment", () => {
  it("attrape les nœuds alignés sous le corps", () => {
    const mech: MechanicalElement[] = [
      pivot("a", P(200, 0)),
      pivot("b", P(500, 0)),
      pivot("c", P(700, 0)),
    ];
    expect(ids(nodes_under_segment(P(0, 0), P(900, 0), mech, VIEW))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  // The two ends are connected by the gesture's own hovers; a node claimed twice
  // would end up attached to a tip and to the body at once.
  it("laisse les deux bouts aux survols du geste", () => {
    const mech: MechanicalElement[] = [
      pivot("start", P(0, 0)),
      pivot("near-start", P(9, 0)),
      pivot("end", P(900, 0)),
    ];
    expect(nodes_under_segment(P(0, 0), P(900, 0), mech, VIEW)).toEqual([]);
  });

  it("ignore un nœud trop loin de l'axe", () => {
    const mech: MechanicalElement[] = [pivot("off", P(450, 40))];
    expect(nodes_under_segment(P(0, 0), P(900, 0), mech, VIEW)).toEqual([]);
  });

  // The tolerance is a screen distance, so zooming out brings a node that reads
  // as being under the bar back under it.
  it("mesure l'écart à l'écran, pas dans le monde", () => {
    const mech: MechanicalElement[] = [pivot("off", P(450, 40))];
    const zoomedOut: ViewportState = { ...VIEW, scale: 0.2 };
    expect(ids(nodes_under_segment(P(0, 0), P(900, 0), mech, zoomedOut))).toEqual(
      ["off"],
    );
  });

  it("ne rend rien sur une barre trop courte pour avoir un corps", () => {
    const mech: MechanicalElement[] = [pivot("a", P(10, 0))];
    expect(nodes_under_segment(P(0, 0), P(20, 0), mech, VIEW)).toEqual([]);
  });
});
