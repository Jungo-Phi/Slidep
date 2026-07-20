import { describe, expect, it } from "vitest";
import { validate_mechanism, ValidationErrorCode } from "./validate-mechanism";
import { DEFAULT_METADATA, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import {
  BeamElement,
  ConstraintElement,
  GearElement,
  ID,
  LoadElement,
  MechanicalElement,
  PivotElement,
} from "../types";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const PIVOT_ID = id("p1");
const BEAM_ID = id("b1");
const AXLE_ID = id("p2");
const GEAR_ID = id("g1");
const GEAR2_ID = id("g2");

function mechanism(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
  loads: LoadElement[] = [],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements,
    loads,
    history: [],
    future: [],
  };
}

function pivot(over: Partial<PivotElement> = {}): PivotElement {
  return {
    type: "pivot",
    id: PIVOT_ID,
    probes: [],
    overlays: {},
    position: P(0, 0),
    isGrounded: false,
    rotatingEdgesIDs: [BEAM_ID],
    fixedGearsIDs: [],
    ...over,
  };
}

function beam(over: Partial<BeamElement> = {}): BeamElement {
  return {
    type: "beam",
    id: BEAM_ID,
    probes: [],
    overlays: {},
    positionStart: P(0, 0),
    positionEnd: P(10, 0),
    fixedNodeStartID: PIVOT_ID,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    ...over,
  };
}

function gear(over: Partial<GearElement> = {}): GearElement {
  return {
    type: "gear",
    id: GEAR_ID,
    probes: [],
    overlays: {},
    position: P(0, 0),
    angle: 0,
    radius: 10,
    parentAxleID: AXLE_ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
    ...over,
  };
}

/** A pivot carrying a beam, connected both ways. */
function valid_pair(): MechanicalElement[] {
  return [pivot(), beam()];
}

function codes(mech: Mechanism): ValidationErrorCode[] {
  return (validate_mechanism(mech) ?? []).map((e) => e.code);
}

describe("validate_mechanism — mécanisme sain", () => {
  it("un pivot et un beam correctement liés ne produisent aucune erreur", () => {
    expect(validate_mechanism(mechanism(valid_pair()))).toBeNull();
  });

  it("un pivot portant un engrenage ne produit aucune erreur", () => {
    const axle = pivot({
      id: AXLE_ID,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [GEAR_ID],
    });
    expect(validate_mechanism(mechanism([axle, gear()]))).toBeNull();
  });
});

describe("validate_mechanism — chaque code d'erreur", () => {
  it("MISSING_REFERENCE : le beam pointe sur un pivot absent", () => {
    expect(codes(mechanism([beam()]))).toContain("MISSING_REFERENCE");
  });

  it("MISSING_BIDIRECTIONAL : le beam ne référence pas le pivot en retour", () => {
    const mech = mechanism([pivot(), beam({ fixedNodeStartID: undefined })]);
    expect(codes(mech)).toContain("MISSING_BIDIRECTIONAL");
  });

  it("WRONG_TYPE : parentAxleID pointe sur un beam", () => {
    const mech = mechanism([beam(), gear({ parentAxleID: BEAM_ID })]);
    expect(codes(mech)).toContain("WRONG_TYPE");
  });

  it("SELF_REFERENCE : un pivot se référence lui-même", () => {
    const mech = mechanism([pivot({ rotatingEdgesIDs: [PIVOT_ID] })]);
    expect(codes(mech)).toContain("SELF_REFERENCE");
  });

  it("DUPLICATE_IN_LIST : le même beam apparaît deux fois", () => {
    const mech = mechanism([
      pivot({ rotatingEdgesIDs: [BEAM_ID, BEAM_ID] }),
      beam(),
    ]);
    expect(codes(mech)).toContain("DUPLICATE_IN_LIST");
  });

  it("DUPLICATE_ID : deux éléments partagent un ID", () => {
    const mech = mechanism([pivot(), pivot(), beam()]);
    expect(codes(mech)).toContain("DUPLICATE_ID");
  });

  it("SAME_AXLE_MESH : deux engrenages du même axe sont engrenés", () => {
    const axle = pivot({
      id: AXLE_ID,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [GEAR_ID, GEAR2_ID],
    });
    const g1 = gear({ meshedGearsIDs: [GEAR2_ID] });
    const g2 = gear({ id: GEAR2_ID, meshedGearsIDs: [GEAR_ID] });
    expect(codes(mechanism([axle, g1, g2]))).toContain("SAME_AXLE_MESH");
  });

  it("GROUNDED_MASS : une masse est ancrée au sol", () => {
    const mass: MechanicalElement = {
      type: "mass",
      id: id("m1"),
      probes: [],
      overlays: {},
      position: P(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [],
      mass: 1,
    };
    expect(codes(mechanism([mass]))).toContain("GROUNDED_MASS");
  });

  it("CONTRADICTORY_MOTOR : moteur au sol avec un parentBeamID", () => {
    const mech = mechanism([
      pivot({ isGrounded: true, motor: { parentBeamID: BEAM_ID, speed: 10 } }),
      beam(),
    ]);
    expect(codes(mech)).toContain("CONTRADICTORY_MOTOR");
  });
});

describe("validate_mechanism — contraintes", () => {
  it("signale une contrainte dont la cible n'existe pas", () => {
    const constraint: ConstraintElement = {
      type: "dimension-radius",
      id: id("c1"),
      position: P(0, 0),
      gearID: id("absent"),
      value: 5,
    };
    expect(codes(mechanism(valid_pair(), [constraint]))).toContain(
      "MISSING_REFERENCE",
    );
  });

  it("signale une contrainte dont la cible est du mauvais type", () => {
    const constraint: ConstraintElement = {
      type: "dimension-radius",
      id: id("c1"),
      position: P(0, 0),
      gearID: BEAM_ID,
      value: 5,
    };
    expect(codes(mechanism(valid_pair(), [constraint]))).toContain(
      "WRONG_TYPE",
    );
  });

  it("signale les deux extrémités identiques d'une contrainte", () => {
    const constraint: ConstraintElement = {
      type: "horizontal-align-nodes",
      id: id("c1"),
      position: P(0, 0),
      startNodeID: PIVOT_ID,
      endNodeID: PIVOT_ID,
    };
    expect(codes(mechanism(valid_pair(), [constraint]))).toContain(
      "SELF_REFERENCE",
    );
  });

  it("signale un dimension-belt dont la courroie n'existe pas", () => {
    const constraint: ConstraintElement = {
      type: "dimension-belt",
      id: id("c1"),
      position: P(0, 0),
      beltID: id("absent"),
      value: 100,
    };
    expect(codes(mechanism(valid_pair(), [constraint]))).toContain(
      "MISSING_REFERENCE",
    );
  });
});

describe("validate_mechanism — charges", () => {
  const force = (over: Partial<LoadElement> = {}): LoadElement =>
    ({
      type: "force",
      id: id("f1"),
      targetID: PIVOT_ID,
      anchor: undefined,
      vector: P(0, -1),
      frame: "world",
      ...over,
    }) as LoadElement;

  it("une charge sur un élément existant ne produit aucune erreur", () => {
    expect(
      validate_mechanism(mechanism(valid_pair(), [], [force()])),
    ).toBeNull();
  });

  it("MISSING_REFERENCE : la force vise un élément absent", () => {
    const mech = mechanism(
      valid_pair(),
      [],
      [force({ targetID: id("absent") })],
    );
    expect(codes(mech)).toContain("MISSING_REFERENCE");
  });

  it("MISSING_REFERENCE : le frame d'une force vise un edge absent", () => {
    const mech = mechanism(
      valid_pair(),
      [],
      [force({ frame: { mode: "edge", edgeID: id("absent") } })],
    );
    expect(codes(mech)).toContain("MISSING_REFERENCE");
  });

  it("WRONG_TYPE : un moment vise un nœud", () => {
    const moment: LoadElement = {
      type: "moment",
      id: id("m1"),
      targetID: PIVOT_ID,
      value: 5,
    };
    expect(codes(mechanism(valid_pair(), [], [moment]))).toContain(
      "WRONG_TYPE",
    );
  });

  it("WRONG_TYPE : une charge répartie vise autre chose qu'un beam", () => {
    const distributed: LoadElement = {
      type: "distributed-force",
      id: id("d1"),
      targetID: PIVOT_ID,
      direction: P(0, -1),
      magnitudeStart: 1,
      magnitudeEnd: 1,
      frame: "world",
    };
    expect(codes(mechanism(valid_pair(), [], [distributed]))).toContain(
      "WRONG_TYPE",
    );
  });

  it("DUPLICATE_ID : une charge partage l'ID d'un élément mécanique", () => {
    const mech = mechanism(valid_pair(), [], [force({ id: BEAM_ID })]);
    expect(codes(mech)).toContain("DUPLICATE_ID");
  });
});
