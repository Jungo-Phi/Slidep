import { describe, expect, it } from "vitest";
import pince from "../../../../test-mechanisms/Pince.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { apply_actions } from "../../mechanism/apply-actions";
import { compute_constraint_violations } from "../../../utils/validate-mechanism";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import {
  BeamElement,
  ConstraintElement,
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import { Action } from "../../../types/actions";
import { MaterialDef, ProfileDef } from "../../../types/material";

/**
 * A value typed in the side panel is a hard constraint: it holds exactly, and what the rest of the sketch cannot follow is reported as violated.
 * Everything else answers to it as to a drag: when the sketch can follow, typing a value lands where dragging to it does; when it cannot, what gives way is next to the value.
 */

const P = (x: number, y: number) => new Point2(x, y);
/** A UUID-shaped id for a hand-built element: the violation messages name elements from their id. */
const U = (name: string) =>
  `00000000-0000-0000-0000-${[...name].map((c) => c.charCodeAt(0).toString(16)).join("").padStart(12, "0")}`;
const MATERIAL_ID = "material" as ID;
const PROFILE_ID = "profile" as ID;

function beam(id: string, start: Point2, end: Point2, extra: Partial<BeamElement> = {}): BeamElement {
  return {
    type: "beam",
    id: U(id) as ID,
    probes: [],
    overlays: {},
    positionStart: start,
    positionEnd: end,
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
    ...extra,
  };
}

function pivot(id: string, position: Point2, extra: Partial<PivotElement> = {}): PivotElement {
  return {
    type: "pivot",
    id: U(id) as ID,
    probes: [],
    overlays: {},
    position,
    isGrounded: false,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
    rotationalFriction: 0,
    ...extra,
  };
}

function mechanism(elements: MechanicalElement[], constraints: ConstraintElement[] = []): Mechanism {
  const materials: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 }];
  const profiles: ProfileDef[] = [{ id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }];
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: constraints,
    loads: [],
    materials,
    profiles,
    history: [],
    future: [],
  };
}

/** The node at `id` moved to `to`, typed in the panel or dragged there. */
const move_node = (m: Mechanism, id: string, to: Point2, committed: boolean): Action => {
  const el = m.mechanicalElements.find((e) => e.id === id) as { position: Point2 };
  return { type: "MoveNode", id: id as ID, newPosition: to, oldPosition: el.position, committed };
};

const element = (m: Mechanism, id: string) => m.mechanicalElements.find((e) => e.id === id)!;
const position = (m: Mechanism, id: string) => (element(m, id) as { position: Point2 }).position;

/** Every position and radius of `a` within `tolerance` of `b`'s. */
function expect_same_geometry(a: Mechanism, b: Mechanism, tolerance: number) {
  for (const el of a.mechanicalElements) {
    const other = element(b, el.id);
    if ("position" in el)
      expect(el.position.distance_to((other as { position: Point2 }).position)).toBeLessThan(tolerance);
    else if ("positionStart" in el && "positionStart" in other) {
      expect(el.positionStart.distance_to(other.positionStart)).toBeLessThan(tolerance);
      expect(el.positionEnd.distance_to(other.positionEnd)).toBeLessThan(tolerance);
    }
    if (el.type === "gear") expect(Math.abs(el.radius - (other as GearElement).radius)).toBeLessThan(tolerance);
  }
}

const violations = (m: Mechanism) => compute_constraint_violations(m) ?? [];

describe("valeur saisie au panneau — atteignable : comme un glisser", () => {
  const pinceMechanism = load_mechanism(JSON.parse(pince)).mechanism;
  // The two gears of the bottom pair and their axles: every one of them meshed with a grounded gear and carrying a node on its rim.
  const bottom = pinceMechanism.mechanicalElements.filter(
    (el) =>
      (el.type === "gear" && el.meshedGearsIDs.length > 0) ||
      (el.type === "pivot" && el.fixedGearsIDs.some((g) => (element(pinceMechanism, g) as GearElement).meshedGearsIDs.length > 0)),
  );

  it("Pince : le choix porte sur la paire du bas", () => {
    expect(bottom.length).toBe(4);
  });

  for (const el of bottom)
    it(`Pince : saisir la position de ${el.type} ${el.id.slice(0, 4)} garde la tangence, comme le glisser`, () => {
      const to = position(pinceMechanism, el.id).add(P(0.05, 0));
      const typed = apply_actions(pinceMechanism, [move_node(pinceMechanism, el.id, to, true)]);
      const dragged = apply_actions(pinceMechanism, [move_node(pinceMechanism, el.id, to, false)]);
      expect(position(typed, el.id).distance_to(to)).toBeLessThan(1e-9);
      expect(violations(typed)).toEqual([]);
      // Within a millimetre: where the rim nodes settle along their rim is a compromise of preferences, which the two solves weigh a little differently.
      expect_same_geometry(typed, dragged, 1e-3);
    });

  it("un nœud saisi sur le corps d'une poutre : la poutre se translate plutôt que de tourner, comme au glisser", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: [U("N") as ID] }),
      pivot("N", P(25, 0), { rotatingEdgesIDs: [U("B") as ID] }),
    ]);
    const typed = apply_actions(m, [move_node(m, U("N"), P(25, 10), true)]);
    const dragged = apply_actions(m, [move_node(m, U("N"), P(25, 10), false)]);
    expect(position(typed, U("N")).distance_to(P(25, 10))).toBeLessThan(1e-9);
    expect_same_geometry(typed, dragged, 1e-6);
  });

  it("un nœud saisi sur la jante d'un engrenage : même résultat qu'au glisser", () => {
    const rim = pinceMechanism.mechanicalElements.find(
      (el) => el.type === "gear" && el.fixedNodesBodyIDs.length > 0,
    ) as GearElement;
    const nodeID = rim.fixedNodesBodyIDs[0];
    // Turned 10° about the gear's centre: a place on the rim, which a drag reaches too.
    const at = position(pinceMechanism, nodeID).sub(rim.position);
    const to = rim.position.add(at.rotate(Math.PI / 18));
    const typed = apply_actions(pinceMechanism, [move_node(pinceMechanism, nodeID, to, true)]);
    const dragged = apply_actions(pinceMechanism, [move_node(pinceMechanism, nodeID, to, false)]);
    expect(position(typed, nodeID).distance_to(to)).toBeLessThan(1e-9);
    expect(violations(typed)).toEqual([]);
    expect_same_geometry(typed, dragged, 1e-3);
  });
});

describe("valeur saisie au panneau — inatteignable : tenue, et la violation reste locale", () => {
  /**
   * G (grounded) ─ B, dimensioned at 100 ─ F ─ C ─ H ─ D ─ K: a chain whose near end cannot reach (0, 300).
   * Typed there, B's end holds the value and B's dimension is what breaks; the far side does not move.
   */
  const chain = () =>
    mechanism(
      [
        pivot("G", P(0, 0), { isGrounded: true, rotatingEdgesIDs: [U("B") as ID] }),
        beam("B", P(0, 0), P(100, 0), { fixedNodeStartID: U("G") as ID, fixedNodeEndID: U("F") as ID }),
        pivot("F", P(100, 0), { rotatingEdgesIDs: [U("B") as ID, U("C") as ID] }),
        beam("C", P(100, 0), P(200, 0), { fixedNodeStartID: U("F") as ID, fixedNodeEndID: U("H") as ID }),
        pivot("H", P(200, 0), { rotatingEdgesIDs: [U("C") as ID, U("D") as ID] }),
        beam("D", P(200, 0), P(300, 0), { fixedNodeStartID: U("H") as ID, fixedNodeEndID: U("K") as ID }),
        pivot("K", P(300, 0), { rotatingEdgesIDs: [U("D") as ID] }),
      ],
      [{ type: "dimension-edge", id: U("dim") as ID, position: P(50, 10), edgeID: U("B") as ID, value: 100 } as ConstraintElement],
    );

  it("la valeur saisie est tenue exactement, la cote cassée est signalée", () => {
    const m = chain();
    const typed = apply_actions(m, [move_node(m, U("F"), P(0, 300), true)]);
    expect(position(typed, U("F")).distance_to(P(0, 300))).toBeLessThan(1e-9);
    expect(position(typed, U("G")).distance_to(P(0, 0))).toBeLessThan(1e-9);
    expect(violations(typed).map((v) => v.elementID)).toContain(U("dim"));
  });

  it("ce qui est loin de la valeur saisie ne bouge pas", () => {
    const m = chain();
    const typed = apply_actions(m, [move_node(m, U("F"), P(0, 300), true)]);
    expect(position(typed, U("H")).distance_to(P(200, 0))).toBeLessThan(1e-9);
    expect(position(typed, U("K")).distance_to(P(300, 0))).toBeLessThan(1e-9);
  });

  it("Pince : un rayon saisi sur un engrenage ancré est tenu, rapport et tangence cassés sont signalés, le reste ne bouge pas", () => {
    const m = load_mechanism(JSON.parse(pince)).mechanism;
    const gear = m.mechanicalElements.find(
      (el) => el.type === "gear" && el.meshedGearsIDs.length > 0,
    ) as GearElement;
    const radius = gear.radius * 1.2;
    const typed = apply_actions(m, [
      {
        type: "ChangeGearRadius",
        id: gear.id,
        newRadius: radius,
        oldRadius: gear.radius,
        target: gear.position.add(P(radius, 0)),
        committed: true,
      },
    ]);
    expect((element(typed, gear.id) as GearElement).radius).toBeCloseTo(radius, 12);
    const broken = violations(typed);
    expect(broken.map((v) => v.message).some((msg) => msg.startsWith("Tangence"))).toBe(true);
    // Nothing gives way beyond what touches the typed radius: neither the gear it meshes with, nor the node on that gear's rim — which solving the whole sketch would nudge, to share out a violation no move can mend.
    const other = element(m, gear.meshedGearsIDs[0]) as GearElement;
    expect((element(typed, other.id) as GearElement).radius).toBe(other.radius);
    for (const nodeID of other.fixedNodesBodyIDs)
      expect(position(typed, nodeID).distance_to(position(m, nodeID))).toBeLessThan(1e-9);
    // The upper gear, alone on its axle, has nothing to do with it.
    const upper = m.mechanicalElements.find(
      (el) => el.type === "gear" && el.meshedGearsIDs.length === 0,
    ) as GearElement;
    expect(position(typed, upper.id).distance_to(upper.position)).toBeLessThan(1e-9);
  });
});
