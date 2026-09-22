import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { position_keys_of } from "../kinematics/link-slots";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";

/**
 * The equilibrium of a mechanism, written as a linear system — see docs/plan-efforts-interieurs.md phase 10.
 *
 * Unknowns are the interface torsors: what each beam and each gear applies onto each node it touches, plus what the frame applies at each support, plus the scalar a gear pair passes between themselves.
 * Equations are Newton's two laws, three per body, with the inertia carried as a d'Alembert term from the frame's own accelerations.
 *
 * **Nothing here reads a solver reaction.** The two defects that make those unreadable — a weld's `Angle` link claimed by both beams it joins, and the over-constrained endpoint node — are properties of how XPBD credits its corrections, and this model never asks.
 * It reads the converged geometry, the CONTINUUM mass of each beam (`μL` at mid-span, `mL²/12` about it, not the solver's three lumps), and the accelerations the frame recorded.
 */

/** Which joints pass a couple. A `join` is a rigid fixture and a `slider` turns with its own
 * rail, so both do; a `pivot`, a `slidep` and a bare point `mass` cannot.
 * Read from the element the user drew rather than from the compiled links, because the link set encodes this same fact ambiguously — a `KeepOrientation`'s two ends are interchangeable labels, which is what makes `weldKeyOf` unable to place a weld structurally. */
const RIGID_NODE_TYPES = new Set(["join", "slider"]);

/**
 * Link types the assembly accounts for.
 * Anything else — a belt strand, a contact — applies a force at its nodes that this model has no term for, and its nodes get an unknown external torsor instead of a silent omission (see `StaticsInterface.foreign`).
 */
const MODELLED_LINK_TYPES = new Set([
  "Coincidence",
  "Distance",
  "FixedOnSegment",
  "SlideOnSegment",
  "Angle",
  "KeepOrientation",
  // The gear family, once a gear is a body: its rim pins, its mesh, the couple two gears on one axle pass, and the weld that makes a hub turn with it.
  // Each is an action the assembly now has a term for — see `StaticsGear`.
  "GearPerimeterPin",
  "GearMeshAngle",
  "CoaxialAngle",
  "BeamFollowsAngle",
  // The belt family, once a belt is a run of two-force members — see `StaticsBelt`.
  // Every one of these is a way of writing the same inextensible path, and the strand tensions are what that path pulls with.
  // `BeltFollowsTangent` is deliberately NOT here: a beam welded to the belt asks a strand to carry a couple, which needs a bending stiffness the model does not have.
  "BeltLength",
  "BeltSegmentNoSlip",
  "BeltSubChainAggregate",
  "BeltLoopClosure",
  "BeltJunction",
  "BeltPin",
  // Dropped from the sweep in dynamic mode and applied as real forces, so they arrive through `externalForceAt` rather than as constraints.
  "Spring",
  "MotorBeam",
  "MotorAngle",
]);

/** One unknown torsor: what `beamID` or `gearID` applies onto the node at `nodeKey`, at abscissa `s` along the beam.
 * Both are absent for a support or for an unmodelled element's action, which the frame (or a belt) applies onto that node from outside. */
export interface StaticsInterface {
  beamID?: ID;
  /** The gear applying this torsor — at its own axle, or at a node pinned on its rim. */
  gearID?: ID;
  nodeKey: string;
  /** 0 at the beam's start, its length at the end, in between for a node on its span. */
  s: number;
  /** Column of each component in the unknown vector; `-1` for a component this joint cannot
   * pass (a hinge's couple). */
  columns: { fx: number; fy: number; m: number };
  /** Whether this torsor stands for something the model does not describe — a support is a
   * legitimate unknown, a belt's pull is a hole. */
  foreign: boolean;
}

export interface StaticsBody {
  /** A beam, a gear, or a node.
   * All get three rows; a node's moment row reads `Σ couples = 0`, a point having no rotational inertia to balance. */
  kind: "beam" | "gear" | "node";
  beamID?: ID;
  gearID?: ID;
  nodeKey?: string;
  /** Index of this body's first row. Three consecutive: Fx, Fy, then the moment. */
  row: number;
}

export interface StaticsSystem {
  interfaces: StaticsInterface[];
  /**
   * One extra row per rail joint on a beam's span, reading `x̂·F = 0` on its interface: a rail guides the beam across, never along — until it reaches the beam's end, whose stop does push along (the row then reads `0 = 0`).
   * Written as an equation rather than by dropping a column because the beam's axis moves while the layout does not.
   */
  slides: { face: number; beamID: ID; row: number }[];
  couplings: StaticsCoupling[];
  bodies: StaticsBody[];
  /** The gears carried as bodies, in the order their rows were laid out. */
  gears: StaticsGear[];
  /** The belts carried as runs of two-force members. */
  belts: StaticsBelt[];
  rows: number;
  columns: number;
}

/**
 * A gear as the assembly carries it: a rigid disc that TRANSMITS, with no internal field of its own to report — a designer asks a gear whether it passes the load on, never what the stress inside the disc is.
 * Resolved at compile time like `StaticsBeam`, none of it moving.
 */
export interface StaticsGear {
  id: ID;
  /** Fused key of its centre, which the assembly also carries as a node. */
  centreKey: string;
  /** Pitch radius, in the length space the positions live in. */
  radius: number;
  /** The disc the dynamics carries, so the two can never disagree: `mₛπr²` kg, and about its centre the inertia its angle is actually weighed with — `½mr²`, or the floor a disc with no surface mass is given. */
  mass: number;
  inertia: number;
}

/**
 * One unknown shared by two gear bodies and no node at all.
 *
 * A single scalar each, because the geometry fixes everything else: a mesh passes a force along the common tangent, whose direction the line of centres gives and whose magnitude alone is unknown; two gears on one axle pass a couple.
 * Both come straight out of the constraint they stand for — `GearMeshAngle` corrects `r₁θ₁ + r₂θ₂`, so its multiplier acts on the two gears with arms `r₁` and `r₂` and the SAME sign, which is what external meshing means.
 */
/**
 * A belt as the assembly carries it: one tension per tangent strand, and nothing else.
 *
 * A strand is a two-force member — Slidep gives a belt no mass — so its tension is constant along it and its line of action is the tangent itself.
 * The wrap arcs need no unknown of their own: a tangent point sits at `r` from the centre and square to the strand, so one strand's moment about its pulley is `±r·T`, and the two strands of a pulley already sum to the `r(T₁ − T₂)` it transmits. The distributed pressure under the arc never has to be written.
 * Nothing here is unilateral either: a Slidep strand takes compression, so `T` is signed and the system stays linear.
 */
export interface StaticsBelt {
  beltID: ID;
  /** Vias in path order, an open belt's two terminals included with radius 0. */
  viaKeys: string[];
  /** The gear at each via, absent at a terminal. */
  viaGears: (ID | undefined)[];
  radii: number[];
  clockwise: boolean[];
  closed: boolean;
  /** The tension of the strand leaving via `p`: `n` columns on a closed belt, `n − 1` on an open one. */
  columns: number[];
  /** The belt's own `BeltLength`, read each frame for its `disconnected` flags — the link is where this codebase keeps a belt's live contact state, and a pulley the belt has left must receive nothing. */
  length: Extract<Link, { type: "BeltLength" }>;
}

export interface StaticsCoupling {
  kind: "mesh" | "coaxial";
  gearA: ID;
  gearB: ID;
  /** Pitch radii, the arms a mesh force works on. Both zero on a coaxial couple, which has no arm. */
  radiusA: number;
  radiusB: number;
  column: number;
}

/** Everything the assembly reads about one frame. Accessors rather than a snapshot: the keys
 * are FUSED ones, which no snapshot layout indexes — the same reason `CohesionBalance` is shaped this way. */
export interface StaticsFrame {
  gravity: Point2;
  positionOf: (key: string) => Point2 | undefined;
  velocityOf: (key: string) => Point2;
  accelerationOf: (key: string) => Point2;
  /** Loads, spring/damper and joint friction forces at a node — never gravity, which is added here, nor a motor's, which is a reaction. */
  externalForceAt: (key: string) => Point2;
  /** Mass lumped at a node MINUS the beams' own endpoint shares: what genuinely belongs to
   * the node, a `mass` element's own value and nothing else. */
  nodeMassAt: (key: string) => number;
  /** A beam's continuum mass, `μL`. */
  beamMass: (beamID: ID) => number;
  /**
   * The distributed load a beam carries, as a density in N/m: its value at the start and its slope per metre along the span.
   * Affine because that is what a `distributed-force` is, and kept as a density rather than a resultant because the flexibility integrals need the field itself — the resultant and its moment follow from it, never the other way round.
   */
  distributedDensityOn: (beamID: ID) => { at0: Point2; slope: Point2 };
  /** A gear's own angular acceleration (rad/s²), for the `I·α` its moment row balances. */
  gearAngularAcceleration: (gearID: ID) => number;
  /** Known torques on a gear's own angle (N·m, counter-clockwise), a joint's friction among them — never a motor's, which the assembly solves for as a reaction. */
  externalTorqueOn: (gearID: ID) => number;
  /** `EA` and `EI` of a beam's section. Absent while a material or profile reference dangles;
   * the flexibility then has nothing to say about that member. */
  beamStiffness: (beamID: ID) => { EA: number; EI: number } | undefined;
}

/** The gear family, whose links speak for a body rather than for themselves — see `accounted_for`. */
const GEAR_LINK_TYPES = new Set([
  "GearPerimeterPin",
  "GearMeshAngle",
  "CoaxialAngle",
  "BeamFollowsAngle",
]);

/** The belt family, whose links likewise speak for a body rather than for themselves. */
const BELT_LINK_TYPES = new Set([
  "BeltLength",
  "BeltSegmentNoSlip",
  "BeltSubChainAggregate",
  "BeltLoopClosure",
  "BeltJunction",
  "BeltPin",
  "BeltFollowsTangent",
]);

/** Which belt a belt-family link belongs to. Every one of them is filed under its belt, as `beltID` or as `owner`. */
function belt_of(link: Link): ID | undefined {
  const l = link as unknown as { beltID?: ID; owner?: ID };
  return l.beltID ?? l.owner;
}

/**
 * Whether the assembly has a term for what this link does — per link, not per type.
 *
 * A gear- or belt-family link is only accounted for by the BODY it belongs to, so it counts for nothing when that body was left out: a rim pin whose disc has no equilibrium row, or a strand law whose belt has no tension, is a force nobody balances — the one thing worse than an admitted unknown.
 */
function accounted_for(
  link: Link,
  uncarried: StaticsGear[],
  carriedBelts: Set<ID>,
): boolean {
  if (!MODELLED_LINK_TYPES.has(link.type)) return false;
  if (BELT_LINK_TYPES.has(link.type)) {
    const belt = belt_of(link);
    return belt !== undefined && carriedBelts.has(belt);
  }
  if (!GEAR_LINK_TYPES.has(link.type)) return true;
  return uncarried.every((gear) => !link_touches_gear(link, gear.id));
}

/** Which nodes carry only links this model accounts for.
 * `owned` are the keys a carried body speaks for whatever the links say — a gear's axle and rim, a belt's vias — which that body's own equations balance by construction. */
function covered_keys(
  links: Link[],
  uncarried: StaticsGear[],
  carriedBelts: Set<ID>,
  owned: Iterable<string>,
): Set<string> {
  const seen = new Set<string>(owned);
  const foreign = new Set<string>();
  for (const link of links)
    for (const key of position_keys_of(link)) {
      seen.add(key);
      if (!accounted_for(link, uncarried, carriedBelts)) foreign.add(key);
    }
  for (const key of foreign) seen.delete(key);
  return seen;
}

/** Whether `key` names `id`, a fused key comma-joining the parts that coincide there. */
const key_names = (key: string, id: ID): boolean =>
  key === id || key.split(",").includes(id);

/**
 * Whether a link has anything to do with this gear, by any of its keys.
 *
 * Deliberately a scan over the link's own strings rather than a list of the fields that can hold a gear: the failure mode of a field list is silent and one-directional — forget one and a gear looks fully accounted for while an action on it is missing, which is a WRONG equation rather than an admitted unknown.
 * A false positive only leaves a gear out.
 */
function link_touches_gear(link: Link, id: ID): boolean {
  for (const value of Object.values(link as unknown as Record<string, unknown>)) {
    if (typeof value === "string" && key_names(value, id)) return true;
    if (Array.isArray(value))
      for (const entry of value)
        if (typeof entry === "string" && key_names(entry, id)) return true;
  }
  return false;
}

/** Each belt's path, read off its own `BeltLength` — the one link that already carries the whole ordered geometry, terminals included. */
function belt_paths(links: Link[]): Omit<StaticsBelt, "columns">[] {
  return links.flatMap((link) => {
    if (link.type !== "BeltLength") return [];
    const beltID = belt_of(link);
    if (beltID === undefined) return [];
    // An open belt's two free ends are vias of radius 0, exactly as the parser builds them: one strand each, no arc, and the tension reaches them as a plain force.
    const gears = link.gearAngleKeys.map((key) => key as ID);
    return [
      {
        beltID,
        viaKeys: link.closed
          ? [...link.gearPosKeys]
          : [link.startKey, ...link.gearPosKeys, link.endKey],
        viaGears: link.closed
          ? (gears as (ID | undefined)[])
          : [undefined, ...gears, undefined],
        radii: link.closed ? [...link.radii] : [0, ...link.radii, 0],
        clockwise: link.closed
          ? [...link.directions]
          : [false, ...link.directions, false],
        closed: link.closed,
        length: link,
      },
    ];
  });
}

/**
 * The gears the assembly can carry as bodies: those whose every action it has a term for.
 *
 * A pulley a belt still pulls on is left out ENTIRELY, back to the unknown external torsor at its nodes.
 * A body whose equation omits a strand's pull is not an unknown — it is a wrong equation, and least squares spreads its error across every other body in the mechanism rather than leaving it where it belongs.
 * Coupled gears stand or fall together for the same reason: a mesh whose other side is missing is a moment the carried gear cannot balance.
 */
function carried_bodies(
  gears: StaticsGear[],
  paths: Omit<StaticsBelt, "columns">[],
  links: Link[],
): { gears: StaticsGear[]; belts: Omit<StaticsBelt, "columns">[] } {
  let keptGears = gears;
  let keptBelts = paths;
  for (;;) {
    const gearIDs = new Set(keptGears.map((g) => g.id));
    const uncarried = gears.filter((gear) => !gearIDs.has(gear.id));

    // A belt goes out when a pulley it runs over is not a body, or when a link on it asks for something this model cannot write — a beam welded to a strand asking it to carry a couple.
    const belts = keptBelts.filter(
      (belt) =>
        belt.viaGears.every((id) => id === undefined || gearIDs.has(id)) &&
        links.every(
          (link) =>
            !BELT_LINK_TYPES.has(link.type) ||
            belt_of(link) !== belt.beltID ||
            MODELLED_LINK_TYPES.has(link.type),
        ),
    );
    const nextBeltIDs = new Set(belts.map((b) => b.beltID));
    // A gear goes out when any link on it is unaccounted for, coupled gears falling together: a mesh whose other side is missing is a moment the carried one cannot balance.
    const nextGears = keptGears.filter(
      (gear) =>
        links.every(
          (link) =>
            accounted_for(link, uncarried, nextBeltIDs) || !link_touches_gear(link, gear.id),
        ) &&
        links.every((link) => {
          if (link.type !== "GearMeshAngle" && link.type !== "CoaxialAngle") return true;
          if (link.angleKey1 !== gear.id && link.angleKey2 !== gear.id) return true;
          return gearIDs.has(link.angleKey1 as ID) && gearIDs.has(link.angleKey2 as ID);
        }),
    );
    if (nextGears.length === keptGears.length && belts.length === keptBelts.length)
      return { gears: nextGears, belts };
    keptGears = nextGears;
    keptBelts = belts;
  }
}

/** Whether a fused key holds a node the user drew as a rigid fixture. A fused key comma-joins
 * the parts that coincide there, node ids among beam endpoint keys. */
function is_rigid_node(key: string, byId: Map<ID, MechanicalElement>): boolean {
  for (const part of key.split(",")) {
    const element = byId.get(part.replace(/:(start|end|mid)$/, "") as ID);
    if (element && RIGID_NODE_TYPES.has(element.type)) return true;
  }
  return false;
}

/**
 * Lay out the unknowns and the equation rows for one mechanism.
 *
 * Structural only — no frame state is read, so the layout can be built once per compiled model and reused for every frame, which is what keeps a per-frame solve affordable.
 */
export function build_statics_system(
  specs: BeamCohesionSpec[],
  gears: StaticsGear[],
  links: Link[],
  elements: MechanicalElement[],
  isAnchored: (key: string) => boolean,
): StaticsSystem {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const bodiesCarried = carried_bodies(gears, belt_paths(links), links);
  const carried = bodiesCarried.gears;
  const carriedIDs = new Set(carried.map((g) => g.id));
  const carriedBelts = new Set(bodiesCarried.belts.map((b) => b.beltID));
  const rimPins = links.filter(
    (link): link is Extract<Link, { type: "GearPerimeterPin" }> =>
      link.type === "GearPerimeterPin" && carriedIDs.has(link.angleKey as ID),
  );
  // A hub welded to the rim turns with the gear, so that pin passes a couple where a bare pivot on the same rim does not.
  // Read from the weld the parser emits rather than from the hub's element type, which `RIGID_NODE_TYPES` answers for beams but not for every shape a hub can take.
  const welded = new Set(
    links.flatMap((link) => (link.type === "BeamFollowsAngle" ? [link.pivotKey] : [])),
  );
  // A motorised axle drives the gear's rotation, so it passes a couple: the motor's torque is a REACTION here, an unknown like any support's, never a value read back from the motor model.
  const driven = new Set(
    links.flatMap((link) => (link.type === "MotorAngle" ? [link.angleKey] : [])),
  );
  // The same holds for a motor turning a beam, and for the body a motor turns against: both pass its couple at the pivot, as `beamID|nodeKey` pairs, while every other body on that pivot stays hinged.
  // Against the ground, it is the support that passes it (`motorSupports`).
  const beamBetween = (a: string, b: string) =>
    specs.find((s) => (s.k0 === a && s.k1 === b) || (s.k0 === b && s.k1 === a));
  const motorCouples = new Set<string>();
  const motorSupports = new Set<string>();
  const coupled = (a: string, b: string, at: string) => {
    const spec = beamBetween(a, b);
    if (spec) motorCouples.add(`${spec.beamID}|${at}`);
  };
  for (const link of links) {
    if (link.type === "MotorBeam") {
      coupled(link.pivotKey, link.drivenKey, link.pivotKey);
      if (link.anchorKey !== undefined) coupled(link.pivotKey, link.anchorKey, link.pivotKey);
      else motorSupports.add(link.pivotKey);
    } else if (
      link.type === "MotorAngle" &&
      link.anchorPivotKey !== undefined &&
      link.anchorKey !== undefined
    )
      coupled(link.anchorPivotKey, link.anchorKey, link.anchorPivotKey);
  }
  const covered = covered_keys(
    links,
    gears.filter((gear) => !carriedIDs.has(gear.id)),
    carriedBelts,
    [
      ...carried.map((gear) => gear.centreKey),
      ...rimPins.map((pin) => pin.nodeKey),
      ...bodiesCarried.belts.flatMap((belt) => belt.viaKeys),
    ],
  );
  const interfaces: StaticsInterface[] = [];
  const slideFaces: { face: number; beamID: ID }[] = [];
  const bodies: StaticsBody[] = [];
  const couplings: StaticsCoupling[] = [];
  let columns = 0;

  const claim = (rigid: boolean) => {
    const fx = columns++;
    const fy = columns++;
    const m = rigid ? columns++ : -1;
    return { fx, fy, m };
  };

  const nodeKeys = new Set<string>();
  for (const spec of specs) {
    // A beam's own midpoint is internal to it — it exists only to carry rotational inertia, which this model takes from `mL²/12` directly, so it is not a node here.
    for (const key of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)])
      if (key !== spec.midKey) nodeKeys.add(key);
  }
  // A gear's own axle is a node even when no beam ever reaches it: it is where the gear hands its load to whatever holds it.
  for (const gear of carried) nodeKeys.add(gear.centreKey);
  for (const pin of rimPins) nodeKeys.add(pin.nodeKey);
  // A belt terminal likewise: it is a point the strand pulls on, and if nothing else holds it its own row is what says the strand pulls with nothing.
  for (const belt of bodiesCarried.belts)
    belt.viaKeys.forEach((key, i) => {
      if (belt.viaGears[i] === undefined) nodeKeys.add(key);
    });

  for (const spec of specs) {
    const ends: { key: string; s: number }[] = [
      { key: spec.k0, s: 0 },
      { key: spec.k1, s: 1 },
    ];
    for (const end of ends)
      interfaces.push({
        beamID: spec.beamID,
        nodeKey: end.key,
        s: end.s,
        columns: claim(
          is_rigid_node(end.key, byId) || motorCouples.has(`${spec.beamID}|${end.key}`),
        ),
        foreign: false,
      });
    for (const attached of spec.attachedNodes) {
      if (attached.slides) slideFaces.push({ face: interfaces.length, beamID: spec.beamID });
      interfaces.push({
        beamID: spec.beamID,
        nodeKey: attached.nodeKey,
        // Filled per frame: a slider's abscissa moves, and the layout is state-free.
        s: Number.NaN,
        columns: claim(is_rigid_node(attached.nodeKey, byId)),
        foreign: false,
      });
    }
  }

  // An axle that passes a couple needs it to reach the ground too: the node between them is a point, and its moment row would otherwise read `motor couple = 0`.
  const drivenAxles = new Set(
    carried.filter((gear) => driven.has(gear.id)).map((gear) => gear.centreKey),
  );
  for (const gear of carried)
    interfaces.push({
      gearID: gear.id,
      nodeKey: gear.centreKey,
      s: Number.NaN,
      columns: claim(driven.has(gear.id) || is_rigid_node(gear.centreKey, byId)),
      foreign: false,
    });
  for (const pin of rimPins)
    interfaces.push({
      gearID: pin.angleKey as ID,
      nodeKey: pin.nodeKey,
      s: Number.NaN,
      columns: claim(welded.has(pin.nodeKey) || is_rigid_node(pin.nodeKey, byId)),
      foreign: false,
    });

  for (const link of links) {
    if (link.type !== "GearMeshAngle" && link.type !== "CoaxialAngle") continue;
    const a = link.angleKey1 as ID;
    const b = link.angleKey2 as ID;
    if (!carriedIDs.has(a) || !carriedIDs.has(b)) continue;
    couplings.push({
      kind: link.type === "GearMeshAngle" ? "mesh" : "coaxial",
      gearA: a,
      gearB: b,
      radiusA: link.type === "GearMeshAngle" ? link.r1 : 0,
      radiusB: link.type === "GearMeshAngle" ? link.r2 : 0,
      column: columns++,
    });
  }

  for (const key of nodeKeys) {
    // A support is an unknown the model owns; an unmodelled neighbour's pull is one it does not, and the two are told apart by `foreign` so a caller can refuse to report the second as an answer.
    const unmodelled = !covered.has(key);
    if (isAnchored(key) || unmodelled)
      interfaces.push({
        nodeKey: key,
        s: Number.NaN,
        columns: claim(
          unmodelled || drivenAxles.has(key) || motorSupports.has(key) || is_rigid_node(key, byId),
        ),
        foreign: unmodelled,
      });
  }

  // One tension per tangent strand, laid out last so the belts own the tail of the unknowns.
  const belts: StaticsBelt[] = bodiesCarried.belts.map((belt) => ({
    ...belt,
    columns: Array.from(
      { length: belt.closed ? belt.viaKeys.length : belt.viaKeys.length - 1 },
      () => columns++,
    ),
  }));

  let row = 0;
  for (const spec of specs) bodies.push({ kind: "beam", beamID: spec.beamID, row: (row += 3) - 3 });
  for (const gear of carried) bodies.push({ kind: "gear", gearID: gear.id, row: (row += 3) - 3 });
  for (const key of nodeKeys) bodies.push({ kind: "node", nodeKey: key, row: (row += 3) - 3 });
  const slides = slideFaces.map((slide) => ({ ...slide, row: row++ }));

  return { interfaces, slides, couplings, bodies, gears: carried, belts, rows: row, columns };
}
