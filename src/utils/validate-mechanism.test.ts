import { describe, expect, it } from "vitest";
import {
  compute_constraint_violations,
  validate_mechanism,
  ValidationErrorCode,
} from "./validate-mechanism";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  GearElement,
  ID,
  LoadElement,
  MaterialDef,
  MechanicalElement,
  PivotElement,
  ProfileDef,
} from "../types";
import { get_belt_path, measure_belt_length } from "./belt-geom";
import { belt_project } from "./belt-path";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;

const PIVOT_ID = id("p1");
const BEAM_ID = id("b1");
const AXLE_ID = id("p2");
const GEAR_ID = id("g1");
const GEAR2_ID = id("g2");
const MATERIAL_ID = id("m1");
const PROFILE_ID = id("pr1");
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
  loads: LoadElement[] = [],
  materials: MaterialDef[] = MATERIALS,
  profiles: ProfileDef[] = PROFILES,
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },

    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements,
    loads,
    materials,
    profiles,
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
    position: new Point2(0, 0),
    isGrounded: false,
    rotatingEdgesIDs: [BEAM_ID],
    fixedGearsIDs: [],
    rotationalFriction: 0,
    ...over,
  };
}

function beam(over: Partial<BeamElement> = {}): BeamElement {
  return {
    type: "beam",
    id: BEAM_ID,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(10, 0),
    fixedNodeStartID: PIVOT_ID,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
    ...over,
  };
}

function gear(over: Partial<GearElement> = {}): GearElement {
  return {
    type: "gear",
    id: GEAR_ID,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    angle: 0,
    radius: 10,
    parentAxleID: AXLE_ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
    surfaceMass: 1,
    ...over,
  };
}

/** A pivot carrying a beam, connected both ways. */
function valid_pair(): MechanicalElement[] {
  return [pivot(), beam()];
}

/**
 * A coherent closed belt: two pulleys on their own axles, both terminals held by one junction, every link reciprocal.
 * Override the belt to break one half of the closure equivalence.
 */
function closed_belt_mechanism(over: Partial<BeltElement> = {}): Mechanism {
  const [beltID, joinID, ax2, gear2] = ["blt", "j1", "p3", "g2"].map(id);
  return mechanism([
    pivot({ id: AXLE_ID, rotatingEdgesIDs: [], fixedGearsIDs: [GEAR_ID] }),
    gear({ attachedBeltID: beltID }),
    pivot({ id: ax2, rotatingEdgesIDs: [], fixedGearsIDs: [gear2] }),
    gear({ id: gear2, parentAxleID: ax2, attachedBeltID: beltID }),
    {
      type: "join",
      id: joinID,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [beltID],
    },
    {
      type: "belt",
      id: beltID,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(0, 0),
      fixedNodeStartID: joinID,
      fixedNodeEndID: joinID,
      attachedGearsIDs: [
        { id: GEAR_ID, clockwise: false },
        { id: gear2, clockwise: false },
      ],
      closed: true,
      ...over,
    },
  ]);
}

/** A loose belt over two pulleys of radius 10, centred at (0,0) and (100,0). */
function open_belt_mechanism(start: Point2, end: Point2): Mechanism {
  const [beltID, ax2, gear2] = ["blt", "p3", "g2"].map(id);
  return mechanism([
    pivot({ id: AXLE_ID, rotatingEdgesIDs: [], fixedGearsIDs: [GEAR_ID] }),
    gear({ attachedBeltID: beltID }),
    pivot({
      id: ax2,
      position: new Point2(100, 0),
      rotatingEdgesIDs: [],
      fixedGearsIDs: [gear2],
    }),
    gear({
      id: gear2,
      position: new Point2(100, 0),
      parentAxleID: ax2,
      attachedBeltID: beltID,
    }),
    {
      type: "belt",
      id: beltID,
      probes: [],
      overlays: {},
      positionStart: start,
      positionEnd: end,
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      attachedGearsIDs: [
        { id: GEAR_ID, clockwise: false },
        { id: gear2, clockwise: false },
      ],
      closed: false,
    },
  ]);
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

describe("validate_mechanism — fermeture des courroies", () => {
  it("une courroie fermée cohérente ne produit aucune erreur", () => {
    expect(validate_mechanism(closed_belt_mechanism())).toBeNull();
  });

  it("BELT_CLOSURE_MISMATCH : fermée mais une seule poulie", () => {
    const mech = closed_belt_mechanism({
      attachedGearsIDs: [{ id: GEAR_ID, clockwise: false }],
    });
    expect(codes(mech)).toContain("BELT_CLOSURE_MISMATCH");
  });

  it("BELT_CLOSURE_MISMATCH : fermée mais les extrémités sur deux nœuds", () => {
    const mech = closed_belt_mechanism({ fixedNodeEndID: undefined });
    expect(codes(mech)).toContain("BELT_CLOSURE_MISMATCH");
  });

  // The converse: both ends on one junction DO make a loop.
  it("BELT_CLOSURE_MISMATCH : boucle réelle mais drapeau ouvert", () => {
    const mech = closed_belt_mechanism({ closed: false });
    expect(codes(mech)).toContain("BELT_CLOSURE_MISMATCH");
  });

  it("LOADED_BELT_JUNCTION : la jonction est ancrée au sol", () => {
    const mech = closed_belt_mechanism();
    const join = mech.mechanicalElements.find((el) => el.id === id("j1"))!;
    if ("isGrounded" in join) join.isGrounded = true;
    expect(codes(mech)).toContain("LOADED_BELT_JUNCTION");
  });

  it("BELTS_JOINED : un nœud tient les extrémités de deux courroies", () => {
    const [joinID, otherID] = ["j1", "blt2"].map(id);
    const mech = closed_belt_mechanism();
    const join = mech.mechanicalElements.find((el) => el.id === joinID)!;
    if ("fixedEdgesIDs" in join)
      join.fixedEdgesIDs = [...join.fixedEdgesIDs, otherID];
    mech.mechanicalElements.push({
      type: "belt",
      id: otherID,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(50, 0),
      fixedNodeStartID: joinID,
      fixedNodeEndID: undefined,
      attachedGearsIDs: [],
      closed: false,
    });
    expect(codes(mech)).toContain("BELTS_JOINED");
  });

  it("une courroie ouverte sans jonction ne produit aucune erreur", () => {
    const mech = closed_belt_mechanism({
      closed: false,
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
    });
    expect(codes(mech)).not.toContain("BELT_CLOSURE_MISMATCH");
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

  it("GEAR_ROLE_CONFLICT : un engrenage est à la fois fixé et libre sur son axe", () => {
    const axle = pivot({
      id: AXLE_ID,
      rotatingEdgesIDs: [GEAR_ID],
      fixedGearsIDs: [GEAR_ID],
    });
    const g1 = gear();
    expect(codes(mechanism([axle, g1]))).toContain("GEAR_ROLE_CONFLICT");
  });

  it("GROUNDED_MASS : une masse est ancrée au sol", () => {
    const mass: MechanicalElement = {
      type: "mass",
      id: id("m1"),
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [],
      mass: 1,
    };
    expect(codes(mechanism([mass]))).toContain("GROUNDED_MASS");
  });

  it("CONTRADICTORY_MOTOR : moteur au sol avec un parentBeamID", () => {
    const mech = mechanism([
      pivot({ isGrounded: true, motor: { parentBeamID: BEAM_ID, speed: 10, torque: 1 } }),
      beam(),
    ]);
    expect(codes(mech)).toContain("CONTRADICTORY_MOTOR");
  });

  it("PARENT_BEAM_CONFLICT : un slider a le même beam en parentBeamID et fixedEdgesIDs", () => {
    const SLIDER_ID = id("s1");
    const slider: MechanicalElement = {
      type: "slider",
      id: SLIDER_ID,
      probes: [],
      overlays: {},
      position: new Point2(5, 0),
      isGrounded: false,
      parentBeamID: BEAM_ID,
      fixedEdgesIDs: [BEAM_ID],
      slidingFriction: 0,
    };
    const mech = mechanism([
      slider,
      beam({ fixedNodeStartID: undefined, fixedNodesBodyIDs: [SLIDER_ID] }),
    ]);
    expect(codes(mech)).toContain("PARENT_BEAM_CONFLICT");
  });
});

describe("validate_mechanism — contraintes", () => {
  it("signale une contrainte dont la cible n'existe pas", () => {
    const constraint: ConstraintElement = {
      type: "dimension-radius",
      id: id("c1"),
      position: new Point2(0, 0),
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
      position: new Point2(0, 0),
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
      position: new Point2(0, 0),
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
      vector: new Point2(0, -1),
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
      direction: new Point2(0, -1),
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

describe("compute_constraint_violations — extrémité de courroie dans sa poulie", () => {
  const messages = (mech: Mechanism) =>
    (compute_constraint_violations(mech) ?? []).map((v) => v.message);

  it("signale un bout enfoncé dans la poulie qu'il enroule", () => {
    const mech = open_belt_mechanism(new Point2(3, 0), new Point2(100, 10));
    const violation = (compute_constraint_violations(mech) ?? []).find((v) =>
      v.message.startsWith("Début"),
    );
    expect(violation).toBeDefined();
    expect(violation!.error).toBeCloseTo(7);
    expect(violation!.unit).toBe("m");
  });

  // A wound end rests exactly on the rim: the tangent run is of length 0, which is legitimate and must not be reported.
  it("accepte un bout posé sur la jante", () => {
    const mech = open_belt_mechanism(new Point2(0, -10), new Point2(100, 10));
    expect(messages(mech)).toEqual([]);
  });

  it("ne regarde que la poulie adjacente au bout", () => {
    // Inside the FAR pulley, which the start terminal does not wrap.
    const mech = open_belt_mechanism(new Point2(97, 0), new Point2(100, 10));
    expect(messages(mech)).toEqual([]);
  });
});

/**
 * At the scale mechanisms are drawn at — metres, gears of a few centimetres — where the old fixed 0.5 "px" threshold read every error as nothing.
 * Two meshed gears of radius 0.125 on axles 0.25 apart, a join on the rim of the first.
 */
describe("compute_constraint_violations — à l'échelle du mètre", () => {
  const RIM_ID = id("j1");
  const R = 0.125;
  const meshed = (over: { gap?: number; rim?: Point2 } = {}) => {
    const x2 = 2 * R + (over.gap ?? 0);
    return mechanism([
      pivot({ id: AXLE_ID, rotatingEdgesIDs: [], fixedGearsIDs: [GEAR_ID] }),
      gear({ radius: R, meshedGearsIDs: [GEAR2_ID], fixedNodesBodyIDs: [RIM_ID] }),
      pivot({
        id: id("p3"),
        position: new Point2(x2, 0),
        rotatingEdgesIDs: [],
        fixedGearsIDs: [GEAR2_ID],
      }),
      gear({
        id: GEAR2_ID,
        position: new Point2(x2, 0),
        radius: R,
        parentAxleID: id("p3"),
        meshedGearsIDs: [GEAR_ID],
      }),
      {
        type: "join",
        id: RIM_ID,
        probes: [],
        overlays: {},
        position: over.rim ?? new Point2(0, R),
        isGrounded: false,
        fixedEdgesIDs: [GEAR_ID],
      },
    ]);
  };
  const messages = (mech: Mechanism) =>
    (compute_constraint_violations(mech) ?? []).map((v) => v.message);

  it("un mécanisme juste ne signale rien", () => {
    expect(messages(meshed())).toEqual([]);
  });

  it("ne signale pas un écart sous le dixième de pixel", () => {
    expect(messages(meshed({ gap: 1e-6, rim: new Point2(0, R + 1e-6) }))).toEqual([]);
  });

  it("signale des engrenages engrenés qui ne sont plus tangents", () => {
    const violations = compute_constraint_violations(meshed({ gap: 0.05 })) ?? [];
    const tangency = violations.find((v) => v.message.startsWith("Tangence"));
    expect(tangency).toBeDefined();
    expect(tangency!.error).toBeCloseTo(0.05);
    expect(tangency!.unit).toBe("m");
    // Shown in the panel's length unit, not in raw metres.
    expect(tangency!.message).toContain("50 mm");
  });

  it("signale un nœud qui a quitté la jante de son engrenage", () => {
    const violations =
      compute_constraint_violations(meshed({ rim: new Point2(0, R + 0.01) })) ?? [];
    const rim = violations.find((v) => v.message.includes("jante"));
    expect(rim).toBeDefined();
    expect(rim!.elementID).toBe(GEAR_ID);
    expect(rim!.error).toBeCloseTo(0.01);
  });

  it("le seuil suit la taille du dessin", () => {
    // The same drawing a thousand times smaller: the same relative error is still seen.
    const tiny = meshed({ gap: 0.05 });
    for (const el of tiny.mechanicalElements) {
      if ("position" in el) el.position = el.position.mul(1e-3);
      if (el.type === "gear") el.radius *= 1e-3;
    }
    expect(messages(tiny).some((m) => m.startsWith("Tangence"))).toBe(true);
  });
});

describe("compute_constraint_violations — courroies", () => {
  const BELT_ID = id("blt");
  const JOIN_ID = id("j1");
  /** The closed belt of `closed_belt_mechanism`, its second pulley moved 100 away from the first, its junction at `junction`. */
  const closed_belt = (junction: Point2, constraints: ConstraintElement[] = []) => {
    const mech = closed_belt_mechanism();
    for (const el of mech.mechanicalElements) {
      if (el.id === id("p3") || el.id === GEAR2_ID)
        (el as { position: Point2 }).position = new Point2(100, 0);
      if (el.id === JOIN_ID) (el as { position: Point2 }).position = junction;
      if (el.type === "belt") {
        el.positionStart = junction;
        el.positionEnd = junction;
      }
    }
    mech.constraintElements = constraints;
    return mech;
  };
  const belt_of = (mech: Mechanism) =>
    mech.mechanicalElements.find((el) => el.id === BELT_ID) as BeltElement;
  const on_loop = (p: Point2) => {
    const mech = closed_belt(p);
    const { vias, closed } = get_belt_path(belt_of(mech), mech.mechanicalElements);
    return belt_project(vias, p, closed).point;
  };
  const messages = (mech: Mechanism) =>
    (compute_constraint_violations(mech) ?? []).map((v) => v.message);

  it("accepte une jonction posée sur la boucle", () => {
    expect(messages(closed_belt(on_loop(new Point2(50, 30))))).toEqual([]);
  });

  it("signale une jonction qui a quitté la boucle", () => {
    const violations = compute_constraint_violations(closed_belt(new Point2(50, 30))) ?? [];
    const junction = violations.find((v) => v.message.startsWith("Jonction"));
    expect(junction).toBeDefined();
    expect(junction!.elementID).toBe(BELT_ID);
    expect(junction!.error).toBeCloseTo(20);
  });

  it("signale une longueur de courroie cotée qui n'est plus tenue", () => {
    const junction = on_loop(new Point2(50, 30));
    const plain = closed_belt(junction);
    const length = measure_belt_length(belt_of(plain), plain.mechanicalElements);
    const dimension = (value: number): ConstraintElement => ({
      type: "dimension-belt",
      id: id("d1"),
      position: new Point2(0, 0),
      beltID: BELT_ID,
      value,
    });
    expect(messages(closed_belt(junction, [dimension(length)]))).toEqual([]);
    const violations =
      compute_constraint_violations(closed_belt(junction, [dimension(length + 5)])) ?? [];
    expect(violations.map((v) => v.elementID)).toContain(id("d1"));
  });
});
