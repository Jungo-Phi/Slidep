import {
  BeamElement,
  ConstraintElement,
  DamperElement,
  EdgeElement,
  GearElement,
  GeomNodes,
  ID,
  Link,
  MechanicalElement,
  Point2,
  SimNodes,
  SpringElement,
} from "../../types";

const COLLINEAR_AREA_EPS = 1; // px² — below this a triangulation chord is degenerate

/**
 * Map a spring element's physical stiffness (>0, default 1) to a per-iteration
 * PBD relaxation factor in (0, 1). Monotonic: stiffer → closer to 1 (less yield),
 * softer → closer to 0. This is NOT a physical k — in this quasi-static solver a
 * per-iteration factor saturates over the iteration count, so it only sets how
 * readily the spring yields to rigid constraints, not a true relative stiffness
 * (that needs the future dynamic XPBD mode). Capped below 1 to stay softer than
 * rigid constraints (stiffness 1.0).
 */
function spring_relaxation_factor(stiffness: number): number {
  const k = Math.max(stiffness, 0);
  return Math.min(k / (k + 1), 0.0002);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nodes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nodes for the geometric solver (edition): positions + gear radii (variables).
 * Keys are bare ("${id}") for nodes/bodies, "${id}:start"/"${id}:end" for edges.
 */
export function get_geom_nodes(
  mechanicalElements: MechanicalElement[],
): GeomNodes {
  const positions = new Map<string, Point2>();
  const radii = new Map<string, number>();
  const posMasses = new Map<string, number>();
  const radMasses = new Map<string, number>();

  mechanicalElements.forEach((element) => {
    if ("position" in element) {
      positions.set(element.id, element.position);
      if ("isGrounded" in element) {
        posMasses.set(element.id, element.isGrounded ? 0 : 1);
      } else {
        posMasses.set(element.id, 1);
      }
      if ("radius" in element) {
        radii.set(element.id, element.radius);
        radMasses.set(element.id, 1);
      }
    } else {
      positions.set(`${element.id}:start`, element.positionStart);
      positions.set(`${element.id}:end`, element.positionEnd);
      posMasses.set(`${element.id}:start`, 1);
      posMasses.set(`${element.id}:end`, 1);
    }
  });

  // Nodes fixed to a gear perimeter get a virtual zero radius so a GearMeshing
  // bridge (added in get_links_geometric) can pin them at |node − centre| =
  // gear.radius while the gear radius stays a free DOF. radMass 0 keeps that
  // virtual radius constant.
  mechanicalElements.forEach((element) => {
    if (element.type !== "gear") return;
    element.fixedNodesBodyIDs.forEach((nodeId) => {
      if (positions.has(nodeId) && !radii.has(nodeId)) {
        radii.set(nodeId, 0);
        radMasses.set(nodeId, 0);
      }
    });
  });
  return { positions, radii, posMasses, radMasses };
}

/**
 * Nodes for the kinematic simulation: positions + gear angles.
 * Radii are constants in simulation (baked into links), not variables here.
 */
export function get_sim_nodes(
  mechanicalElements: MechanicalElement[],
): SimNodes {
  const positions = new Map<string, Point2>();
  const posMasses = new Map<string, number>();
  const angles = new Map<string, number>();

  mechanicalElements.forEach((element) => {
    if ("position" in element) {
      positions.set(element.id, element.position);
      if ("isGrounded" in element) {
        posMasses.set(element.id, element.isGrounded ? 0 : 1);
      } else {
        posMasses.set(element.id, 1);
      }
      if (element.type === "gear") {
        angles.set(element.id, element.angle);
      }
    } else {
      positions.set(`${element.id}:start`, element.positionStart);
      positions.set(`${element.id}:end`, element.positionEnd);
      posMasses.set(`${element.id}:start`, 1);
      posMasses.set(`${element.id}:end`, 1);
    }
  });
  return { positions, posMasses, angles };
}

/**
 * Returns parsed positions of constraint anchors / key: bare "${constraintID}"
 */
export function get_constraint_nodes(
  constraintElements: ConstraintElement[],
): Map<string, Point2> {
  const positions = new Map<string, Point2>();
  constraintElements.forEach((constraint) => {
    positions.set(constraint.id, constraint.position);
  });
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometric-solver links (edition)
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Parse a `ConstraintElement` to `Link` for the geometric solver to use
 */
export function constraint_to_link(element: ConstraintElement): Link {
  switch (element.type) {
    case "dimension-edge":
      return {
        type: "Distance",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        distance: element.value,
      };
    case "dimension-node-to-node":
      return {
        type: "Distance",
        ddl: 1,
        key1: element.startNodeID,
        key2: element.endNodeID,
        distance: element.value,
      };
    case "dimension-edge-to-node":
      return {
        type: "DistanceToLine",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        key3: element.nodeID,
        distance: element.value,
      };
    case "dimension-angle":
      return {
        type: "Angle",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
        flipStart: element.flipStart,
        flipEnd: element.flipEnd,
        couterClockwise: element.couterClockwise,
        angle_rad: (element.value * Math.PI) / 180,
      };
    case "dimension-radius":
      return {
        type: "Radius",
        ddl: 1,
        key1: element.gearID,
        radius: element.value,
      };
    case "horizontal-align-edge":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "horizontal-align-nodes":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: element.startNodeID,
        key2: element.endNodeID,
      };
    case "vertical-align-edge":
      return {
        type: "Vertical",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "vertical-align-nodes":
      return {
        type: "Vertical",
        ddl: 1,
        key1: element.startNodeID,
        key2: element.endNodeID,
      };
    case "normal":
      return {
        type: "Normal",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "parallel":
      return {
        type: "Parallel",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "equal":
      return {
        type: "EqualLength",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "gear-ratio":
      return {
        type: "GearRatio",
        ddl: 1,
        key1: element.startGearID,
        key2: element.endGearID,
        ratio: element.value,
      };
  }
}

/*
 * Parse elements + user constraints into links for the geometric solver (edition).
 * User constraints/dimensions apply; edge lengths and radii are NOT constrained;
 * body nodes are SlideOnSegment (free to slide along beams).
 */
export function get_links_geometric(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): Link[] {
  const links: Link[] = [];
  constraintElements.forEach((constraint) => {
    links.push(constraint_to_link(constraint));
  });

  mechanicalElements.forEach((element) => {
    if ("positionStart" in element) {
      if (element.fixedNodeStartID) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.fixedNodeStartID,
          key2: `${element.id}:start`,
        });
      }
      if (element.fixedNodeEndID) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.fixedNodeEndID,
          key2: `${element.id}:end`,
        });
      }
      if (element.type === "beam") {
        element.fixedNodesBodyIDs.forEach((nodeId) => {
          links.push({
            type: "SlideOnSegment",
            ddl: 1,
            key1: `${element.id}:start`,
            key2: `${element.id}:end`,
            key3: nodeId,
          });
        });
      }
    }
    if (element.type === "gear") {
      element.meshedGearsIDs.forEach((meshedId) => {
        if (
          links.filter(
            (link) =>
              link.type === "GearMeshing" &&
              link.key2 === element.id &&
              link.key1 === meshedId,
          ).length === 0
        ) {
          links.push({
            type: "GearMeshing",
            ddl: 1,
            key1: element.id,
            key2: meshedId,
            radKey1: element.id,
            radKey2: meshedId,
          });
        }
      });
      // Nodes pinned to the perimeter stay at |node − centre| = radius. The node
      // acts as a zero-radius bridge (see get_geom_nodes), so the meshing keeps
      // it on the perimeter as the radius or the centre moves.
      element.fixedNodesBodyIDs.forEach((nodeId) => {
        links.push({
          type: "GearMeshing",
          ddl: 1,
          key1: element.id,
          key2: nodeId,
          radKey1: element.id,
          radKey2: nodeId,
        });
      });
    }
    if (element.type === "pivot" || element.type === "slidep") {
      element.fixedGearsIDs.forEach((gearId) => {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.id,
          key2: gearId,
        });
      });
    }
  });
  return links;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation links
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse elements into links for the kinematic simulation.
 *
 * Differences vs the geometric solver:
 *  - user constraints/dimensions do NOT apply (they are editing aids);
 *  - edge lengths and gear radii are CONSTRAINED to their current value;
 *  - body nodes are FixedOnSegment (joins/masses) — frozen ratio — while
 *    sliders/slideps stay SlideOnSegment;
 *  - rigidity: non-grounded hubs use triangulation; grounded hubs anchor the
 *    connected beams' endpoints (welded to ground) — see add_rigidity_links;
 *  - gear angle constraints (coaxial + epicyclic meshing) are added;
 *  - motors add a constraint (they do not pin a position).
 *
 * `nodes` is mutated to anchor grounded hubs (posMasses set to 0). Keys are
 * pre-fusion; compile_simulation_model rewrites them when fusing Coincidence links.
 */
export function get_links_simulation(
  mechanicalElements: MechanicalElement[],
  nodes: SimNodes,
): Link[] {
  const links: Link[] = [];
  const byId = new Map<ID, MechanicalElement>();
  mechanicalElements.forEach((el) => byId.set(el.id, el));

  // Track pairs that already have a Distance/length constraint, to avoid
  // redundant chords in trusses.
  const distancePairs = new Set<string>();
  const addDistancePair = (a: string, b: string) => {
    distancePairs.add(`${a}|${b}`);
    distancePairs.add(`${b}|${a}`);
  };
  const hasDistancePair = (a: string, b: string) =>
    distancePairs.has(`${a}|${b}`);

  // ── Coincidences, beam lengths, on-segment ───────────────────────────────
  mechanicalElements.forEach((element) => {
    if ("positionStart" in element) {
      if (element.fixedNodeStartID)
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.fixedNodeStartID,
          key2: `${element.id}:start`,
        });
      if (element.fixedNodeEndID)
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.fixedNodeEndID,
          key2: `${element.id}:end`,
        });

      if (element.type === "beam") {
        // Rigid length
        const k1 = `${element.id}:start`;
        const k2 = `${element.id}:end`;
        links.push({
          type: "Distance",
          ddl: 1,
          key1: k1,
          key2: k2,
          distance: element.positionEnd.distance_to(element.positionStart),
          owner: element.id,
        });
        addDistancePair(k1, k2);

        // Body nodes: joins/masses are frozen on the beam (FixedOnSegment),
        // sliders/slideps keep sliding (SlideOnSegment).
        element.fixedNodesBodyIDs.forEach((nodeId) => {
          const node = byId.get(nodeId);
          if (!node || !("position" in node)) return;
          const t = node.position.parameter_on_segment(
            element.positionStart,
            element.positionEnd,
          );
          // Only sliders/slideps slide, and only along their OWN rail
          // (parentBeam). A slider welded to any other beam's body — or a
          // join/mass — is frozen at its ratio (FixedOnSegment); grounded ones
          // are additionally anchored in add_rigidity_links.
          const slides =
            (node.type === "slider" || node.type === "slidep") &&
            node.parentBeamID === element.id;
          links.push(
            slides
              ? {
                  type: "SlideOnSegment",
                  ddl: 1,
                  key1: k1,
                  key2: k2,
                  key3: nodeId,
                  owner: nodeId,
                }
              : {
                  type: "FixedOnSegment",
                  ddl: 2,
                  key1: k1,
                  key2: k2,
                  key3: nodeId,
                  t,
                  owner: nodeId,
                },
          );
        });
      } else if (element.type === "spring") {
        // Springs take NO rigid length constraint: a compliant Spring softly
        // pulls the two endpoints toward their rest length (the current drawn
        // length at sim start). Only meaningful where the mechanism leaves a
        // free DOF for it to resolve. NOT added to distancePairs — it does not
        // triangulate.
        links.push({
          type: "Spring",
          ddl: 0,
          key1: `${element.id}:start`,
          key2: `${element.id}:end`,
          restLength: element.positionEnd.distance_to(element.positionStart),
          stiffness: spring_relaxation_factor(element.stiffness),
          owner: element.id,
        });
      }
      // Dampers add no link in the kinematic (quasi-static) solver: a damper is
      // a velocity-dependent force with no meaning without dynamics. They will
      // be handled by the future dynamic XPBD mode.
    }

    // Gear axle coincidence (gear center on its pivot/slidep axle)
    if (element.type === "pivot" || element.type === "slidep") {
      element.fixedGearsIDs.forEach((gearId) =>
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: element.id,
          key2: gearId,
        }),
      );
    }
  });

  // ── Gear meshing: fixed centre distance + epicyclic angle relation ────────
  const meshSeen = new Set<string>();
  mechanicalElements.forEach((element) => {
    if (element.type !== "gear") return;
    const g1 = element as GearElement;
    g1.meshedGearsIDs.forEach((meshedId) => {
      const g2 = byId.get(meshedId);
      if (!g2 || g2.type !== "gear") return;
      // De-duplicate the unordered pair (lists may be asymmetric)
      const pairKey = [g1.id, g2.id].sort().join("|");
      if (meshSeen.has(pairKey)) return;
      meshSeen.add(pairKey);

      if (!hasDistancePair(g1.id, g2.id)) {
        addDistancePair(g1.id, g2.id);
        links.push({
          type: "Distance",
          ddl: 1,
          key1: g1.id,
          key2: g2.id,
          distance: g1.radius + g2.radius,
          owner: g1.id,
        });
      }
      links.push({
        type: "GearMeshAngle",
        ddl: 1,
        angleKey1: g1.id,
        angleKey2: g2.id,
        posKey1: g1.id,
        posKey2: g2.id,
        r1: g1.radius,
        r2: g2.radius,
        theta1_0: g1.angle,
        theta2_0: g2.angle,
        alpha0: g2.position.sub(g1.position).angle(),
        alpha: g2.position.sub(g1.position).angle(),
        owner: g1.id,
      });
    });
  });

  // ── Co-axial gears: same rotation (constant offset) ──────────────────────
  const coAxle = new Map<ID, GearElement[]>();
  mechanicalElements.forEach((el) => {
    if (el.type !== "gear") return;
    const list = coAxle.get(el.parentAxleID) ?? [];
    list.push(el);
    coAxle.set(el.parentAxleID, list);
  });
  coAxle.forEach((gears) => {
    for (let i = 1; i < gears.length; i++) {
      links.push({
        type: "CoaxialAngle",
        ddl: 1,
        angleKey1: gears[0].id,
        angleKey2: gears[i].id,
        offset: gears[0].angle - gears[i].angle,
        owner: gears[i].id,
      });
    }
  });

  // ── Nodes fixed to a gear perimeter (gear → linkage) ─────────────────────
  // The node orbits with the gear (GearPerimeterPin). If it is a join, its
  // attached beams rotate rigidly with the gear (BeamFollowsAngle); a pivot is a
  // free hinge on the orbiting point.
  mechanicalElements.forEach((element) => {
    if (element.type !== "gear") return;
    const gear = element as GearElement;
    gear.fixedNodesBodyIDs.forEach((nodeId) => {
      const node = byId.get(nodeId);
      if (!node || !("position" in node)) return;
      links.push({
        type: "GearPerimeterPin",
        ddl: 2,
        nodeKey: nodeId,
        centerKey: gear.id,
        angleKey: gear.id,
        radius: gear.radius,
        offset: node.position.sub(gear.position).angle() - gear.angle,
        owner: nodeId,
      });
      // Rigid hubs (join/slider/mass — those with fixedEdgesIDs) make their
      // welded beams rotate with the gear. Pivot/slidep are free hinges.
      if (
        !("fixedEdgesIDs" in node) ||
        !("parentBeamID" in node && node.parentBeamID)
      )
        return;
      mechanicalElements.forEach((el) => {
        if (el.type !== "beam") return;
        const b = el as BeamElement;
        let drivenKey: string;
        let dir: Point2;
        if (b.fixedNodeStartID === nodeId) {
          drivenKey = `${b.id}:end`;
          dir = b.positionEnd.sub(b.positionStart);
        } else {
          drivenKey = `${b.id}:start`;
          dir = b.positionStart.sub(b.positionEnd);
        }
        if (dir.length_squared() < 1e-12) return;
        links.push({
          type: "BeamFollowsAngle",
          ddl: 1,
          pivotKey: nodeId,
          drivenKey,
          angleKey: gear.id,
          offset: dir.angle() - gear.angle,
          owner: b.id,
        });
      });
    });
  });

  // ── Rigidity (joins / masses / sliders) ──────────────────────────────────
  mechanicalElements.forEach((node) => {
    if (node.type !== "join" && node.type !== "slider" && node.type !== "mass")
      return;
    add_rigidity_links(node, mechanicalElements, links, nodes, {
      addDistancePair,
      hasDistancePair,
    });
  });

  // ── Motors ───────────────────────────────────────────────────────────────
  mechanicalElements.forEach((element) => {
    if (element.type !== "pivot" || !element.motor) return;
    // Only grounded motors (parentBeamID === undefined) for now.
    if (element.motor.parentBeamID !== undefined) return;
    const omega = element.motor.speed * ((2 * Math.PI) / 60); // rad/s

    // Drive each rotating beam's orientation about the pivot.
    element.rotatingEdgesIDs.forEach((beamId) => {
      const beam = byId.get(beamId);
      if (!beam || !("positionStart" in beam)) return;
      let pivotKey: string;
      let drivenKey: string;
      let dir: Point2;
      if (beam.fixedNodeStartID === element.id) {
        pivotKey = `${beamId}:start`;
        drivenKey = `${beamId}:end`;
        dir = beam.positionEnd.sub(beam.positionStart);
      } else if (beam.fixedNodeEndID === element.id) {
        pivotKey = `${beamId}:end`;
        drivenKey = `${beamId}:start`;
        dir = beam.positionStart.sub(beam.positionEnd);
      } else {
        // The motor pivot sits on the beam between its endpoints (a body node).
        // Drive the farthest endpoint about the pivot — the longer arm gives
        // better angular conditioning.
        const pivotPos = element.position;
        pivotKey = element.id;
        const toStart = beam.positionStart.sub(pivotPos);
        const toEnd = beam.positionEnd.sub(pivotPos);
        if (toEnd.length_squared() >= toStart.length_squared()) {
          drivenKey = `${beamId}:end`;
          dir = toEnd;
        } else {
          drivenKey = `${beamId}:start`;
          dir = toStart;
        }
      }
      if (dir.length_squared() < 1e-12) return;
      links.push({
        type: "MotorBeam",
        ddl: 1,
        pivotKey,
        drivenKey,
        omega,
        targetAngle: dir.angle(),
        owner: element.id,
      });
    });

    // Drive fixed gears' angle nodes.
    element.fixedGearsIDs.forEach((gearId) => {
      const gear = byId.get(gearId);
      if (!gear || gear.type !== "gear") return;
      links.push({
        type: "MotorAngle",
        ddl: 1,
        angleKey: gearId,
        omega,
        targetAngle: gear.angle,
        owner: element.id,
      });
    });
  });

  return links;
}

/** Outward spoke of a rigid hub: a beam endpoint moving rigidly with the node. */
type Spoke = {
  beam: BeamElement;
  key: string; // solver key of the free end
  pos: Point2; // position of the free end
  flip: boolean; // true if the welded end is the beam's END (free end is start)
};

/** Variable-length spoke: a spring/damper welded to the hub by one endpoint.
 *  Its length is free, so its orientation (not its endpoint distance) is locked. */
type VarSpoke = {
  edge: SpringElement | DamperElement;
  flip: boolean; // true if the welded end is the edge's END (free end is start)
};

/**
 * Add rigidity links / anchors for a join / mass / slider hub.
 *
 * Strategy (validated with the user):
 *  - **Non-grounded** join/mass: Distance triangulation between welded beam
 *    endpoints (reusing already-constrained pairs; degenerate chords fall back
 *    to an Angle constraint) → relative angles are preserved.
 *  - **Grounded** join/mass (welded to ground): anchor (mass 0) the free
 *    endpoints of connected beams — endpoint beams' free end, body beams' both
 *    ends. Fully fixes them; no triangulation/orientation lock needed.
 *  - **Slider**: translates but does not rotate. Non-grounded → Angle between
 *    the rail (body beam) and each attached beam. Grounded → the rail slides
 *    through the fixed point (SlideOnSegment + KeepOrientation) and the attached
 *    beams are anchored.
 */
function add_rigidity_links(
  node: MechanicalElement,
  mechanicalElements: MechanicalElement[],
  links: Link[],
  nodes: SimNodes,
  pairs: {
    addDistancePair: (a: string, b: string) => void;
    hasDistancePair: (a: string, b: string) => boolean;
  },
): void {
  const grounded = "isGrounded" in node && node.isGrounded;
  // When the hub is pinned to a gear perimeter, its welded beams' orientation is
  // driven by the gear (BeamFollowsAngle) — a rail→beam orientation lock would
  // fight it, so the slider skips its rigidity.
  const pinnedToGear = mechanicalElements.some(
    (e) => e.type === "gear" && e.fixedNodesBodyIDs.includes(node.id),
  );
  const nodePos = "position" in node ? node.position : new Point2(0, 0);
  const anchor = (key: string) => nodes.posMasses.set(key, 0);

  /** Lock the relative orientation of two edges welded to the hub (used when a
   *  varying length forbids triangulation). `flip` marks the END as welded. */
  const lockAngle = (
    refEdge: EdgeElement,
    refFlip: boolean,
    varEdge: EdgeElement,
    varFlip: boolean,
  ) => {
    const dRef = refEdge.positionEnd.sub(refEdge.positionStart);
    const dVar = varEdge.positionEnd.sub(varEdge.positionStart);
    if (dRef.length_squared() < 1e-12 || dVar.length_squared() < 1e-12) return;
    const virtRef = refFlip ? dRef.mul(-1) : dRef;
    const virtVar = varFlip ? dVar.mul(-1) : dVar;
    links.push({
      type: "Angle",
      ddl: 1,
      key1: `${refEdge.id}:start`,
      key2: `${refEdge.id}:end`,
      key3: `${varEdge.id}:start`,
      key4: `${varEdge.id}:end`,
      flipStart: refFlip,
      flipEnd: varFlip,
      couterClockwise: false,
      angle_rad: virtRef.angle_to(virtVar),
      owner: node.id,
    });
  };

  /** Keep a spring/damper's world orientation fixed (welded end already anchored
   *  to ground): the free end can only slide along the frozen direction. */
  const keepVarOrientation = (vs: VarSpoke) => {
    const d = vs.edge.positionEnd.sub(vs.edge.positionStart);
    if (d.length_squared() < 1e-12) return;
    links.push({
      type: "KeepOrientation",
      ddl: 1,
      key1: `${vs.edge.id}:start`,
      key2: `${vs.edge.id}:end`,
      direction: d.normalize(),
      owner: node.id,
    });
  };

  // Classify connected edges. Beams are rigid (triangulated / anchored); springs
  // and dampers vary in length, so only their orientation is locked.
  const endpointBeams: Spoke[] = [];
  const bodyBeams: BeamElement[] = [];
  const varSpokes: VarSpoke[] = [];
  mechanicalElements.forEach((el) => {
    if (el.type === "beam") {
      const b = el as BeamElement;
      if (b.fixedNodeStartID === node.id)
        endpointBeams.push({
          beam: b,
          key: `${b.id}:end`,
          pos: b.positionEnd,
          flip: false,
        });
      else if (b.fixedNodeEndID === node.id)
        endpointBeams.push({
          beam: b,
          key: `${b.id}:start`,
          pos: b.positionStart,
          flip: true,
        });
      else if (b.fixedNodesBodyIDs.includes(node.id)) bodyBeams.push(b);
    } else if (el.type === "spring" || el.type === "damper") {
      if (el.fixedNodeStartID === node.id)
        varSpokes.push({ edge: el, flip: false });
      else if (el.fixedNodeEndID === node.id)
        varSpokes.push({ edge: el, flip: true });
    }
  });

  // ── Slider ───────────────────────────────────────────────────────────────
  if (node.type === "slider") {
    if (grounded) {
      // Rail slides through the fixed point but keeps its orientation; attached
      // beams move with the (fixed) slider body → anchor their free ends.
      bodyBeams.forEach((rail) => {
        const dRail = rail.positionEnd.sub(rail.positionStart);
        if (dRail.length_squared() > 1e-12)
          links.push({
            type: "KeepOrientation",
            ddl: 1,
            key1: `${rail.id}:start`,
            key2: `${rail.id}:end`,
            direction: dRail.normalize(),
            owner: node.id,
          });
      });
      endpointBeams.forEach((s) => anchor(s.key));
      // Springs/dampers welded to the (fixed) slider keep their orientation.
      varSpokes.forEach(keepVarOrientation);
      return;
    }
    // Pinned to a gear: beams follow the gear angle (BeamFollowsAngle) — skip the
    // rail→beam orientation lock that would conflict.
    if (pinnedToGear) return;
    // Non-grounded: a slider translates along its rail (parentBeam) without
    // rotating, so every other welded edge keeps a fixed orientation relative to
    // the rail. Welded body beams are additionally frozen on the slider in
    // position (FixedOnSegment, in get_links_simulation).
    const rail =
      bodyBeams.find((b) => b.id === node.parentBeamID) ?? bodyBeams[0];
    if (!rail) return;
    endpointBeams.forEach(({ beam: b, flip }) =>
      lockAngle(rail, false, b, flip),
    );
    varSpokes.forEach((vs) => lockAngle(rail, false, vs.edge, vs.flip));
    bodyBeams.forEach((b) => {
      if (b.id !== rail.id) lockAngle(rail, false, b, false);
    });
    return;
  }

  // ── Join / mass, grounded: anchor everything (welded to ground) ──────────
  if (grounded) {
    endpointBeams.forEach((s) => anchor(s.key));
    bodyBeams.forEach((b) => {
      anchor(`${b.id}:start`);
      anchor(`${b.id}:end`);
    });
    // Springs/dampers: welded end is grounded (via Coincidence fusion); keep the
    // orientation so only the length is free.
    varSpokes.forEach(keepVarOrientation);
    return;
  }

  // ── Join / mass, non-grounded: triangulate the rigid hub ─────────────────
  // One spoke per beam. An endpoint beam contributes its free end. A body beam
  // is already pinned to the hub by its FixedOnSegment link, so only its
  // rotation about the node is left to lock — a single endpoint suffices (we
  // pick the one farther from the node for the better lever arm). Adding both
  // would emit a redundant link and skew get_sim_degrees_of_freedom.
  const spokes: Spoke[] = [...endpointBeams];
  bodyBeams.forEach((b) => {
    const useStart =
      b.positionStart.distance_to(nodePos) >=
      b.positionEnd.distance_to(nodePos);
    spokes.push(
      useStart
        ? { beam: b, key: `${b.id}:start`, pos: b.positionStart, flip: true }
        : { beam: b, key: `${b.id}:end`, pos: b.positionEnd, flip: false },
    );
  });

  // Triangulate the rigid (beam) spokes.
  if (spokes.length >= 2) {
    const ref = spokes[0];
    for (let i = 1; i < spokes.length; i++) {
      const s = spokes[i];
      if (s.beam.id === ref.beam.id) continue; // same beam: length already constrains it
      if (pairs.hasDistancePair(ref.key, s.key)) continue; // truss member already there

      const area = Math.abs(ref.pos.sub(nodePos).cross(s.pos.sub(nodePos)));
      if (area < COLLINEAR_AREA_EPS) {
        // Degenerate triangle → lock the relative angle of the two beams.
        lockAngle(ref.beam, ref.flip, s.beam, s.flip);
      } else {
        pairs.addDistancePair(ref.key, s.key);
        links.push({
          type: "Distance",
          ddl: 1,
          key1: ref.key,
          key2: s.key,
          distance: ref.pos.distance_to(s.pos),
          owner: node.id,
        });
      }
    }
  }

  // Lock variable-length spokes (springs/dampers) to the hub: a varying length
  // forbids triangulation, so we fix each one's orientation instead. Reference =
  // a rigid beam spoke when present; otherwise the first variable spoke (locks
  // the spokes' relative angles, the bundle stays free to rotate as one).
  if (varSpokes.length > 0) {
    if (spokes.length > 0) {
      const r = spokes[0];
      varSpokes.forEach((vs) => lockAngle(r.beam, r.flip, vs.edge, vs.flip));
    } else {
      const r = varSpokes[0];
      for (let i = 1; i < varSpokes.length; i++)
        lockAngle(r.edge, r.flip, varSpokes[i].edge, varSpokes[i].flip);
    }
  }
}
