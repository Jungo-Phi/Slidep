import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { position_keys_of } from "../kinematics/link-slots";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";

/**
 * The equilibrium of a mechanism, written as a linear system — see
 * docs/plan-efforts-interieurs.md phase 10.
 *
 * Unknowns are the interface torsors: what each beam applies onto each node it touches, plus
 * what the frame applies at each support. Equations are Newton's two laws, three per body,
 * with the inertia carried as a d'Alembert term from the frame's own accelerations.
 *
 * **Nothing here reads a solver reaction.** The two defects that make those unreadable — a
 * weld's `Angle` link claimed by both beams it joins, and the over-constrained endpoint node —
 * are properties of how XPBD credits its corrections, and this model never asks. It reads the
 * converged geometry, the CONTINUUM mass of each beam (`μL` at mid-span, `mL²/12` about it,
 * not the solver's three lumps), and the accelerations the frame recorded.
 */

/** Which joints pass a couple. A `join` is a rigid fixture and a `slider` turns with its own
 *  rail, so both do; a `pivot`, a `slidep` and a bare point `mass` cannot. Read from the
 *  element the user drew rather than from the compiled links, because the link set encodes
 *  this same fact ambiguously — a `KeepOrientation`'s two ends are interchangeable labels,
 *  which is what makes `weldKeyOf` unable to place a weld structurally. */
const RIGID_NODE_TYPES = new Set(["join", "slider"]);

/**
 * Link types the assembly accounts for. Anything else — a belt strand, a gear mesh, a contact
 * — applies a force at its nodes that this model has no term for, and its nodes get an
 * unknown external torsor instead of a silent omission (see `StaticsInterface.foreign`).
 */
const MODELLED_LINK_TYPES = new Set([
  "Coincidence",
  "Distance",
  "FixedOnSegment",
  "SlideOnSegment",
  "Angle",
  "KeepOrientation",
  // Dropped from the sweep in dynamic mode and applied as real forces, so they arrive through
  // `externalForceAt` rather than as constraints.
  "Spring",
  "MotorBeam",
  "MotorAngle",
]);

/** One unknown torsor: what `beamID` applies onto the node at `nodeKey`, at abscissa `s`
 *  along the beam. `beamID` is absent for a support or for an unmodelled element's action,
 *  which the frame (or a belt, or a gear) applies onto that node from outside. */
export interface StaticsInterface {
  beamID?: ID;
  nodeKey: string;
  /** 0 at the beam's start, its length at the end, in between for a node on its span. */
  s: number;
  /** Column of each component in the unknown vector; `-1` for a component this joint cannot
   *  pass (a hinge's couple). */
  columns: { fx: number; fy: number; m: number };
  /** Whether this torsor stands for something the model does not describe — a support is a
   *  legitimate unknown, a belt's pull is a hole. */
  foreign: boolean;
}

export interface StaticsBody {
  /** A beam, or a node. Both get three rows; a node's moment row reads `Σ couples = 0`,
   *  a point having no rotational inertia to balance. */
  kind: "beam" | "node";
  beamID?: ID;
  nodeKey?: string;
  /** Index of this body's first row. Three consecutive: Fx, Fy, then the moment. */
  row: number;
}

export interface StaticsSystem {
  interfaces: StaticsInterface[];
  bodies: StaticsBody[];
  rows: number;
  columns: number;
}

/** Everything the assembly reads about one frame. Accessors rather than a snapshot: the keys
 *  are FUSED ones, which no snapshot layout indexes — the same reason `CohesionBalance` is
 *  shaped this way. */
export interface StaticsFrame {
  gravity: Point2;
  positionOf: (key: string) => Point2 | undefined;
  velocityOf: (key: string) => Point2;
  accelerationOf: (key: string) => Point2;
  /** Loads, spring/damper and motor forces at a node — never gravity, which is added here. */
  externalForceAt: (key: string) => Point2;
  /** Mass lumped at a node MINUS the beams' own endpoint shares: what genuinely belongs to
   *  the node, a `mass` element's own value and nothing else. */
  nodeMassAt: (key: string) => number;
  /** A beam's continuum mass, `μL`. */
  beamMass: (beamID: ID) => number;
  /**
   * The distributed load a beam carries, as a density in N/m: its value at the start and its
   * slope per metre along the span. Affine because that is what a `distributed-force` is, and
   * kept as a density rather than a resultant because the flexibility integrals need the
   * field itself — the resultant and its moment follow from it, never the other way round.
   */
  distributedDensityOn: (beamID: ID) => { at0: Point2; slope: Point2 };
  /** `EA` and `EI` of a beam's section. Absent while a material or profile reference dangles;
   *  the flexibility then has nothing to say about that member. */
  beamStiffness: (beamID: ID) => { EA: number; EI: number } | undefined;
}

/** Which nodes carry only links this model accounts for. */
function covered_keys(links: Link[]): Set<string> {
  const seen = new Set<string>();
  const foreign = new Set<string>();
  for (const link of links)
    for (const key of position_keys_of(link)) {
      seen.add(key);
      if (!MODELLED_LINK_TYPES.has(link.type)) foreign.add(key);
    }
  for (const key of foreign) seen.delete(key);
  return seen;
}

/** Whether a fused key holds a node the user drew as a rigid fixture. A fused key comma-joins
 *  the parts that coincide there, node ids among beam endpoint keys. */
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
 * Structural only — no frame state is read, so the layout can be built once per compiled model
 * and reused for every frame, which is what keeps a per-frame solve affordable.
 */
export function build_statics_system(
  specs: BeamCohesionSpec[],
  links: Link[],
  elements: MechanicalElement[],
  isAnchored: (key: string) => boolean,
): StaticsSystem {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const covered = covered_keys(links);
  const interfaces: StaticsInterface[] = [];
  const bodies: StaticsBody[] = [];
  let columns = 0;

  const claim = (rigid: boolean) => {
    const fx = columns++;
    const fy = columns++;
    const m = rigid ? columns++ : -1;
    return { fx, fy, m };
  };

  const nodeKeys = new Set<string>();
  for (const spec of specs) {
    // A beam's own midpoint is internal to it — it exists only to carry rotational inertia,
    // which this model takes from `mL²/12` directly, so it is not a node here.
    for (const key of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)])
      if (key !== spec.midKey) nodeKeys.add(key);
  }

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
        columns: claim(is_rigid_node(end.key, byId)),
        foreign: false,
      });
    for (const attached of spec.attachedNodes)
      interfaces.push({
        beamID: spec.beamID,
        nodeKey: attached.nodeKey,
        // Filled per frame: a slider's abscissa moves, and the layout is state-free.
        s: Number.NaN,
        columns: claim(is_rigid_node(attached.nodeKey, byId)),
        foreign: false,
      });
  }

  for (const key of nodeKeys) {
    // A support is an unknown the model owns; an unmodelled neighbour's pull is one it does
    // not, and the two are told apart by `foreign` so a caller can refuse to report the
    // second as an answer.
    const unmodelled = !covered.has(key);
    if (isAnchored(key) || unmodelled)
      interfaces.push({
        nodeKey: key,
        s: Number.NaN,
        columns: claim(unmodelled || is_rigid_node(key, byId)),
        foreign: unmodelled,
      });
  }

  let row = 0;
  for (const spec of specs) bodies.push({ kind: "beam", beamID: spec.beamID, row: (row += 3) - 3 });
  for (const key of nodeKeys) bodies.push({ kind: "node", nodeKey: key, row: (row += 3) - 3 });

  return { interfaces, bodies, rows: row, columns };
}
