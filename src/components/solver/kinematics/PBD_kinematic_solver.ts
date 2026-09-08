import { Link, Point2 } from "../../../types";
import { ConstraintResidual, LinkReaction } from "../../../types/runtime-state";
import {
  applyAngleConstraint,
  applyBeamFollowsAngleConstraint,
  applyBeltFollowsTangentConstraint,
  applyBeltJunctionConstraint,
  applyBeltLengthConstraint,
  applyBeltPinConstraint,
  applyCoaxialAngleConstraint,
  applyDistanceConstraint,
  applyMinDistanceConstraint,
  applyPointLineContactConstraint,
  applyPointSegmentContactConstraint,
  applyDistanceToLineConstraint,
  applyEqualLengthConstraint,
  applyFixedOnSegmentConstraint,
  applyGearMeshAngleConstraint,
  applyGearMeshingConstraint,
  applyGearPerimeterPinConstraint,
  applyGearRatioConstraint,
  applyHandleGrabConstraint,
  applyHorizontalConstraint,
  applyKeepOrientationConstraint,
  applyMotorAngleConstraint,
  applyMotorBeamConstraint,
  applyNormalConstraint,
  applyParallelConstraint,
  applySlideOnSegmentConstraint,
  applyVerticalConstraint,
} from "./constraint-functions";
import { solver_trace } from "./solver-trace";
import { applyBeltSegmentNoSlip } from "../experimental/belt-noslip-q";
import {
  applyBeltLoopClosure,
  applyBeltSubChainAggregate,
} from "../experimental/belt-aggregate";
import {
  MIN_EXTENT_M,
  SolveNodes,
  nodes_extent,
  solveNodesFromMaps,
  writePositionsBack,
  writeScalarsBack,
  writeVelocitiesBack,
} from "../nodes";
import { LinkSlots, resolve_slots } from "./link-slots";
import { reversed_sweep_order } from "./sweep-order";

export type SolverMaps = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  radii: Map<string, number>;
  radMasses: Map<string, number>;
  angles: Map<string, number>;
  /** Constraints left unsatisfied (only filled when collectDiagnostics is set). */
  unsatisfied?: ConstraintResidual[];
  /**
   * The mechanism's own scale this solve measured (see `nodes_extent`), floored at `MIN_EXTENT_M`.
   * A caller stepping frame after frame can hand this back in as next frame's estimate wherever an extent-relative tolerance is needed before the solve has run — `collision-detection.ts`'s `CONTACT_EPS_RATIO`, `simulation-engine.ts`'s `beltContact.detachRatio`/`reattachRatio` — rather than paying for a second bbox pass.
   */
  extent: number;
};

/**
 * What turns a solve into a dynamics step: predict a position under an external acceleration before the constraint sweep, then read the frame's velocity back from how far the sweep ended up moving that prediction — the XPBD trick that makes a constraint correction show up as a velocity change (a contact/constraint force) rather than vanishing between frames.
 *
 * A separate object rather than three more positional params on an already ten-parameter function, and because `velocities`/`angleVelocities` are in/out: warm-started from here, overwritten with the frame's result.
 */
export type DynamicsInput = {
  dt: number;
  /** World-space acceleration applied to every free (w > 0) node this frame, before the
   * constraint sweep — gravity today; more forces (loads, springs) join later. */
  gx: number;
  gy: number;
  velocities: Map<string, Point2>;
  angleVelocities: Map<string, number>;
  /** Populates `nodes.wAngle` — see its doc on `SimNodes`. Omitted, every angle gets 1, same
   * as every other caller of `solveNodesFromMaps`. */
  angleMasses?: Map<string, number>;
  /** World-space force (N), per position key, folded into the predict step's acceleration on
   * top of `gx`/`gy` — see `Nodes.fx`/`fy`.
   * Omitted, no node carries one. */
  forces?: Map<string, Point2>;
  /** Torque (N·m), per angle key — see `SimNodes.torque`. Omitted, no angle carries one. */
  torques?: Map<string, number>;
  /**
   * Output: an array to fill with each constraint's own reaction, one entry per solver key it touches with a non-zero contribution — see `LinkReaction`.
   * Its presence is the whole opt-in: omitted, `PBD_solve` skips the bookkeeping entirely (an extra before/after read per link per sweep), the same optionality `collectDiagnostics` already has for `unsatisfied`.
   * Provide an empty array to collect.
   */
  reactions?: LinkReaction[];
};

/**
 * Above this fraction of the mechanism's own extent (see `nodes_extent`) a constraint is reported as unsatisfied, and severity is expressed against it. **One** threshold for every family: residuals reach it already converted to the length they are worth (see `residual_scale`), so an angle and a distance are finally the same kind of number.
 *
 * Relative rather than a flat millimetre so a µm-scale mechanism and a km-scale one are each judged against their own size, not one fixed abroad. 1e-3 is a millimetre reinterpreted as a ratio at the roughly metre-scale mechanisms it was originally tuned on.
 *
 * This is the threshold the USER is warned at.
 * Moving it changes what the diagnostics panel reports, not how hard a solver works — a solver target is a multiple of it, never it.
 */
const DIAGNOSTIC_TOLERANCE_RATIO = 0.001;

/**
 * What one unit of a link's residual is worth in metres.
 *
 * An angle is not a length, and a fixed angular threshold is not comparable to a fixed distance one: 0.01 rad is 4 mm at the end of a 0.4 m arm and 0.1 mm on a 10 mm pinion.
 * So an angular residual is converted to **the arc it sweeps**, through the link's own geometry — the longer of the two edges an angle holds apart, a motor's crank, the radius of a gear that carries nothing but an angle.
 * `GearRatio` answers a dimensionless ratio, which times the second radius is the metres the first one is off by.
 *
 * Everything else already answers in metres — including `GearMeshAngle`, whose residual is an arc length, which is the precedent this generalises.
 *
 * **Incomplete in simulation**: there the radii live in the links, not in the nodes, so a link carrying nothing but an angle finds no lever and falls back to 1 — its residual stays an angle.
 * Closing that needs an angle → radius map built where the model is compiled.
 */
function residual_scale(
  link: Link,
  slot: LinkSlots,
  nodes: SolveNodes,
  angleLever: Float64Array,
): number {
  const span = (a: number, b: number) =>
    Math.hypot(nodes.x[a] - nodes.x[b], nodes.y[a] - nodes.y[b]);
  let lever: number;
  switch (link.type) {
    case "Angle":
    case "Parallel":
    case "Normal":
      // The worst displacement the angular error causes, so the longer edge.
      lever = Math.max(
        span(slot.pos[0], slot.pos[1]),
        span(slot.pos[2], slot.pos[3]),
      );
      break;
    case "MotorBeam":
      lever = span(slot.pos[0], slot.pos[1]);
      break;
    case "MotorAngle":
      lever = angleLever[slot.ang[0]];
      break;
    case "CoaxialAngle":
      lever = Math.max(angleLever[slot.ang[0]], angleLever[slot.ang[1]]);
      break;
    case "GearRatio":
      lever = nodes.radius[slot.rad[1]];
      break;
    default:
      return 1;
  }
  // A missing slot leaves the lever undefined, and a degenerate one leaves it at zero.
  // Either would silently erase the residual, so the raw one is the safer answer.
  return Number.isFinite(lever) && lever > 0 ? lever : 1;
}

/* ── Early exit on the motion still to come ──────────────────────────────────
 *
 * A sweep does not reach a fixed point: it creeps, decaying geometrically at a rate that sits around 0.98 on a mechanism the size of a Core XY. That is not a defect but the spectral radius of Gauss-Seidel on a chain — measured on a bare `Distance` chain with no belt at all, r goes 0.957 / 0.990 / 0.996 for 8 / 16 / 32 links, i.e. r ≈ 1 − c/N². So "nothing moved this sweep" never becomes true, and a raw displacement threshold cannot tell a mechanism that has arrived from one that is crawling.
 *
 * What is bounded instead is the SUM of what is left: with a per-sweep decay rate r, Σ moved·rⁿ = moved·r/(1−r).
 * Measuring r over a window rather than between two consecutive sweeps keeps it from being read off noise.
 */

/** Sweeps over which the decay rate is estimated. */
const RATE_WINDOW = 8;
/**
 * Sweeps left after the grab lets go before an exit may be considered, so what it stretched has relaxed.
 * Unmeasured — inherited from the 24 that used to be a flat floor over 20 grab sweeps.
 */
const GRAB_RELEASE_SWEEPS = 4;

/**
 * Below this fraction of the mechanism's own extent (see `nodes_extent`) still left to move, finishing the sweeps buys nothing visible.
 *
 * Relative for the same reason as `DIAGNOSTIC_TOLERANCE_RATIO`: a flat metric bound meant a µm-scale mechanism could never accumulate enough drift to matter (this exit would never sharpen anything) while a km-scale one would drift for real before crossing it. 1e-6 is a thousandth of a millimetre reinterpreted as a ratio, at the roughly metre-scale mechanisms it was tuned on: not a hundredth, since the per-frame bound is respected either way but each frame warm-starts from the previous one, so what it gives up ACCUMULATES. At 1e-2 the drift grows without settling (1.48 mm over 200 frames on `Core XY modifié`); at 1e-3 (of a ~1 m extent, i.e. what is now 1e-6 relative) it plateaus (5e-2 mm, the same at 60 and at 200 frames) while keeping the whole of the gain that is actually free — `Poulie bloqueuse`, blocked, goes from 300 sweeps to 109 with a drift of exactly zero.
 */
const REMAINING_RATIO = 1e-6;
/**
 * Same bound in angle, but left absolute rather than following `REMAINING_RATIO`: the length an angular error is worth is itself `angle × lever`, and at the whole-mechanism scale the lever is approximately the extent — so a relative bound derived the same way would be `(REMAINING_RATIO × extent) / extent`, which is `REMAINING_RATIO` again.
 * The extent cancels out, so there is nothing to multiply here.
 */
const REMAINING_RAD = 1e-6;

/**
 * How the solver decides it has done enough.
 *
 * `motion` — stop when nothing will move enough to matter.
 * Right in simulation: the frame hands back to a display that is waiting, and the next one resumes from here, so what is given up is caught up.
 * A mechanism that is blocked stops and reports its blockage, which is the honest answer.
 *
 * `constraints` — stop when nothing is violated.
 * Right in edition, where there is no next frame: the solve IS the drawing, and it stays on screen until the next gesture.
 * A mechanism can stop moving while still being wrong, and that would freeze a false figure.
 * Slower is acceptable here; approximate is not.
 */
export type ExitCriterion = "motion" | "constraints";

/**
 * How far past its reporting threshold the worst constraint may sit for a `constraints` solve to call itself done.
 * A hundredth of `DIAGNOSTIC_TOLERANCE_RATIO` — at the roughly metre-scale mechanisms it was tuned on, 0.01 mm — an order of magnitude finer than the 0.1 the editors round their values to, which is what makes that rounding trustworthy.
 */
const CONSTRAINT_EXIT_SEVERITY = 0.01;

/**
 * How hard, how far and for how long a grab pulls.
 *
 * The pull is a RAMP, not a schedule of the whole solve: it runs for `nbGrabIterations` sweeps and then lets go, leaving the rest of the budget to relax whatever it stretched.
 * Pulling all the way through would settle the sketch at a compromise where the grab is still pulling, i.e. leave it permanently stretched.
 *
 * There is no absolute cap on one sweep's correction, and that is the point: `grabStiffness` already bounds it to half the remaining gap, which is soft in the way that matters — the grab yields to the constraints — without being slow.
 * An absolute cap made the pull slow instead: at 10 mm a sweep the grabbed point could not travel more than ~60 mm per solve, so a cursor moving faster simply outran it and stayed behind (chantier 4 ter measured a 2798 mm lag at 150 mm/frame, against 2.4 mm without the cap, for the same deformation of zero and the same sweep count).
 */
const GRAB = {
  nbGrabIterations: 5,
  grabStiffness: 0.5,
  maxGrabAmplitude: Infinity,
};

/**
 * Total motion still to come if the current per-sweep decay holds, in the unit of `now`.
 * `Infinity` when it is not decaying — nothing can be bounded, so nothing is cut short.
 *
 * The sum runs to infinity even though only `nbIterations − i` sweeps remain.
 * Truncating it there is the tighter bound and was measured: it fires 1 to 13 sweeps earlier on four of nine mechanisms, nothing at all on the other five, and moves the result by 1.7e-3 px on Jansen.
 * Not worth changing what the solver computes.
 */
function remaining_motion(now: number, windowAgo: number): number {
  if (now === 0) return 0;
  if (!(windowAgo > now)) return Infinity;
  const rate = Math.pow(now / windowAgo, 1 / RATE_WINDOW);
  return (now * rate) / (1 - rate);
}


/**
 * How far past the reporting threshold the worst-off constraint sits.
 * `0` when nothing is reported, `2` when something is twice as violated as it takes to be listed.
 *
 * Dimensionless, and now honestly so: every residual reaches this list already expressed as a length, so there is one threshold to divide by rather than one per family.
 * `extent` is the mechanism's own scale (see `nodes_extent`), the same one the residuals were reported against.
 */
export function constraint_severity(
  unsatisfied: ConstraintResidual[] | undefined,
  extent: number,
): number {
  const tolerance = DIAGNOSTIC_TOLERANCE_RATIO * (extent || MIN_EXTENT_M);
  let worst = 0;
  for (const u of unsatisfied ?? []) {
    const s = u.residual / tolerance;
    if (s > worst) worst = s;
  }
  return worst;
}

/*
 * PBD (Position Based Dynamics) solver shared by the geometric solver (edition) and the kinematic simulation.
 * Geometric links use positions/radii; simulation links additionally use the angle maps.
 *
 * Map-shaped entry point: marshals into indexed storage, solves, and writes the results back into the caller's own maps.
 */
export function PBD_kinematic_solver(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  radMasses: Map<string, number>,
  links: Link[],
  nbIterations: number,
  epsilon: number = 0.000_001,
  angles: Map<string, number> = new Map(),
  collectDiagnostics: boolean = false,
  exitOn: ExitCriterion = "motion",
  /** Smallest radius this solve may shrink a gear to, in world units — see `solveNodesFromMaps`. */
  radiusFloor: number = 0,
  dynamics?: DynamicsInput,
): SolverMaps {
  const nodes = solveNodesFromMaps(
    positions,
    posMasses,
    angles,
    radii,
    radMasses,
    radiusFloor,
    dynamics?.velocities,
    dynamics?.angleVelocities,
    dynamics?.angleMasses,
    dynamics?.forces,
    dynamics?.torques,
  );
  const unsatisfied = PBD_solve(
    nodes,
    links,
    nbIterations,
    epsilon,
    collectDiagnostics,
    exitOn,
    dynamics && {
      dt: dynamics.dt,
      gx: dynamics.gx,
      gy: dynamics.gy,
      reactions: dynamics.reactions,
    },
  );
  writePositionsBack(nodes, positions);
  writeScalarsBack(nodes.angleIndex, nodes.angle, angles);
  writeScalarsBack(nodes.radIndex, nodes.radius, radii);
  if (dynamics) {
    writeVelocitiesBack(nodes, dynamics.velocities);
    writeScalarsBack(nodes.angleIndex, nodes.vAngle, dynamics.angleVelocities);
  }
  const extent = nodes_extent(nodes) || MIN_EXTENT_M;
  return { positions, radii, posMasses, radMasses, angles, unsatisfied, extent };
}

/**
 * The solve itself, on indexed storage: mutates `nodes` in place and returns the unsatisfied-constraint list when diagnostics are collected.
 */
export function PBD_solve(
  nodes: SolveNodes,
  links: Link[],
  nbIterations: number,
  epsilon: number = 0.000_001,
  collectDiagnostics: boolean = false,
  exitOn: ExitCriterion = "motion",
  /** Present only for a dynamics step — see `DynamicsInput`. Everything else (edition,
   * kinematic simulation) leaves this out and gets the plain PBD sweep unchanged. */
  dynamics?: Pick<DynamicsInput, "dt" | "gx" | "gy" | "reactions">,
): ConstraintResidual[] | undefined {
  const slots = resolve_slots(links, nodes);

  // ── Reaction bookkeeping: how much each link moved each of its own dofs, summed over the
  // whole sweep — see the conversion to force/torque after the loop, and `LinkReaction`'s own doc for why.
  // One accumulator array per link (sized to what that link touches, from 2 for a `Distance` to as many as a belt's pulley count) allocated once here, never per sweep — the per-iteration cost is then just a before/after read, not an allocation.
  const collectReactions = dynamics?.reactions !== undefined;
  const reactionAccum = collectReactions
    ? slots.map((s) => ({
        dx: new Float64Array(s.pos.length),
        dy: new Float64Array(s.pos.length),
        dAngle: new Float64Array(s.ang.length),
      }))
    : null;
  // Reused across every link's before-capture, sized to the largest one — not per-link, per-iteration, to keep this at the same allocation cost as the trace mechanism below.
  let reactionScratchX: Float64Array | null = null;
  let reactionScratchY: Float64Array | null = null;
  let reactionScratchA: Float64Array | null = null;
  if (collectReactions) {
    let maxPos = 0;
    let maxAng = 0;
    for (const s of slots) {
      if (s.pos.length > maxPos) maxPos = s.pos.length;
      if (s.ang.length > maxAng) maxAng = s.ang.length;
    }
    reactionScratchX = new Float64Array(maxPos);
    reactionScratchY = new Float64Array(maxPos);
    reactionScratchA = new Float64Array(maxAng);
  }

  // stop grab after `nbGrabIterations` to not stretch the mechanism
  const { nbGrabIterations, grabStiffness, maxGrabAmplitude } = GRAB;

  // The grab is the only reason the early exit has a floor at all: a frame must not exit while it is still pulling, nor before what it stretched has relaxed.
  // A frame with no grab owes it nothing — and there, the floor is not needed either, since `remaining_motion` returns Infinity until the decay window has filled.
  const minSweepsBeforeExit = links.some((l) => l.type === "HandleGrab")
    ? nbGrabIterations + GRAB_RELEASE_SWEEPS
    : 0;

  // Motors are soft drivers: they must yield to hard geometric constraints (grounding, FixedOnSegment, Distance…) rather than fight them at equal strength.
  // With stiffness < 1 a free motor still converges fully to its target over the iterations, but an over-constrained one (e.g. a grounded body node pinning the driven beam) loses the tug-of-war and is reported blocked instead of tearing the node off the beam.
  const motorStiffness = 0.5;

  // Per-link residual of the last executed iteration (for diagnostics).
  // Springs (soft by design) and grabs (transient) are never recorded here.
  const residuals = collectDiagnostics
    ? new Array<number>(links.length).fill(0)
    : null;

  // Read once: a trace cannot be installed in the middle of a solve, and this must not cost a lookup per link.
  const trace = solver_trace();
  // Preallocated so an active trace costs an array copy per link, not a map clone.
  const traceX = trace ? new Float64Array(nodes.x.length) : null;
  const traceY = trace ? new Float64Array(nodes.y.length) : null;
  const traceA = trace ? new Float64Array(nodes.angle.length) : null;

  // Previous sweep's state, for the motion measured below.
  // A `Float64Array` copy of a few hundred doubles costs ~0.5 % of a frame, which is why this is a snapshot and not an accumulation threaded through every constraint.
  const prevX = new Float64Array(nodes.x.length);
  const prevY = new Float64Array(nodes.y.length);
  const prevA = new Float64Array(nodes.angle.length);
  // Per-sweep motion of the last RATE_WINDOW sweeps, as a ring, for the decay rate.
  const movedRing = new Float64Array(RATE_WINDOW);
  const turnedRing = new Float64Array(RATE_WINDOW);

  // Radius of the gear each angle belongs to, so a link that carries nothing but an angle still knows what its error is worth in metres.
  // Angles and radii are keyed alike (both by element id), which is what makes the lookup possible.
  // Read once: the radius is a degree of freedom, but as a scale for reporting its initial value is enough.
  const angleLever = new Float64Array(nodes.angle.length);
  for (let a = 0; a < nodes.angle.length; a++) {
    const r = nodes.radIndex.get(nodes.angleKeys[a]);
    angleLever[a] = r !== undefined ? nodes.radius[r] : 1;
  }

  // The mechanism's own scale, read once before the sweeps move anything — everything below that used to be an absolute length is judged against it instead, so a µm-scale mechanism and a km-scale one are each held to their own precision.
  // One bbox pass, negligible next to the sweeps themselves.
  const extent = nodes_extent(nodes) || MIN_EXTENT_M;
  const diagnosticTolerance = DIAGNOSTIC_TOLERANCE_RATIO * extent;
  const remainingThreshold = REMAINING_RATIO * extent;

  // Worst residual of the sweep against the reporting threshold.
  // Only tracked when something reads it.
  const trackSeverity = exitOn === "constraints";
  let maxSeverity = 0;

  // ── Dynamics: predict, then read the frame's velocity back from the whole sweep ──
  //
  // The predicted position is where the node would land under `vx`/`vy` and the external acceleration alone, with no constraint applied yet — the sweep below then projects it onto the constraints exactly as it always has.
  // What is new is `frameStart`: the position BEFORE prediction, kept so the velocity written back after the sweep is `(solved − frameStart) / dt` rather than `(solved − predicted) / dt`.
  // That difference is the whole of XPBD's trick — a constraint correction shows up as a velocity change (the constraint force) instead of being silently absorbed and forgotten by next frame.
  //
  // Acceleration is `gx/gy` (uniform, mass-independent — gravity) plus `fx/fy · w` (a load, which only accelerates a node in proportion to how light it is).
  // Angles have no gravity-equivalent term, only `torque · wAngle`.
  let frameStartX: Float64Array | null = null;
  let frameStartY: Float64Array | null = null;
  let frameStartA: Float64Array | null = null;
  if (dynamics) {
    frameStartX = nodes.x.slice();
    frameStartY = nodes.y.slice();
    frameStartA = nodes.angle.slice();
    for (let n = 0; n < nodes.count; n++) {
      if (nodes.w[n] === 0) continue; // anchored: gravity does not move it
      const ax = dynamics.gx + nodes.fx[n] * nodes.w[n];
      const ay = dynamics.gy + nodes.fy[n] * nodes.w[n];
      nodes.x[n] += nodes.vx[n] * dynamics.dt + ax * dynamics.dt * dynamics.dt;
      nodes.y[n] += nodes.vy[n] * dynamics.dt + ay * dynamics.dt * dynamics.dt;
    }
    for (let a = 0; a < nodes.angle.length; a++) {
      const aAngle = nodes.torque[a] * nodes.wAngle[a];
      nodes.angle[a] += nodes.vAngle[a] * dynamics.dt + aAngle * dynamics.dt * dynamics.dt;
    }
  }

  // Odd sweeps run the non-redundant chains backwards — see `reversed_sweep_order` for why that is a direct solve there and unsafe elsewhere.
  // Dynamics only: it is the only mode carrying real masses, so the only one where a mass ratio can build a residual at all.
  const reversed = dynamics ? reversed_sweep_order(links, slots, nodes) : null;

  let maxError: number = 0;
  // XPBD multipliers, one per link, accumulated across the sweeps of THIS solve — which is one substep, the interval `α̃ = α/dt²` is written against.
  // Only a dynamics step has a meaningful `dt`, so a kinematic solve leaves every constraint rigid and never touches this.
  // See `Compliance`.
  const lambda = new Float64Array(links.length);
  const invDtSq = dynamics && dynamics.dt > 0 ? 1 / (dynamics.dt * dynamics.dt) : 0;

  for (let i = 0; i < nbIterations; i++) {
    maxError = 0;
    maxSeverity = 0;
    prevX.set(nodes.x);
    prevY.set(nodes.y);
    prevA.set(nodes.angle);

    const sweepOrder = reversed !== null && i % 2 === 1 ? reversed : null;
    for (let step = 0; step < links.length; step++) {
      const idx = sweepOrder === null ? step : sweepOrder[step];
      const link = links[idx];
      const s = slots[idx];
      if (traceX && traceY && traceA) {
        traceX.set(nodes.x);
        traceY.set(nodes.y);
        traceA.set(nodes.angle);
      }
      if (reactionScratchX && reactionScratchY && reactionScratchA) {
        for (let k = 0; k < s.pos.length; k++) {
          const slot = s.pos[k];
          reactionScratchX[k] = slot >= 0 ? nodes.x[slot] : 0;
          reactionScratchY[k] = slot >= 0 ? nodes.y[slot] : 0;
        }
        for (let k = 0; k < s.ang.length; k++) {
          const slot = s.ang[k];
          reactionScratchA[k] = slot >= 0 ? nodes.angle[slot] : 0;
        }
      }
      let err = 0;
      let report = true; // surface in diagnostics
      switch (link.type) {
        case "Distance":
          err = applyDistanceConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.distance,
            1.0,
            link.preferredAxis,
            link.compliance && invDtSq > 0
              ? { alphaTilde: link.compliance * invDtSq, lambda, index: idx }
              : undefined,
          );
          break;
        case "MinDistance":
          err = applyMinDistanceConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.distance,
          );
          break;
        case "MinDistanceToSegment":
          err = applyPointSegmentContactConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            link.offset,
            link.side,
          );
          break;
        case "MinDistanceToLine":
          err = applyPointLineContactConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.normal,
            link.offset,
          );
          break;
        case "DistanceToLine":
          err = applyDistanceToLineConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            link.distance,
          );
          break;
        case "SlideOnSegment":
          err = applySlideOnSegmentConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            1.0,
            link.normalOffset,
          );
          break;
        case "FixedOnSegment":
          err = applyFixedOnSegmentConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            link.t,
            1.0,
            link.normalOffset,
          );
          break;
        case "KeepOrientation":
          err = applyKeepOrientationConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.direction,
          );
          break;
        case "Angle":
          err = applyAngleConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            s.pos[3],
            link.flipStart,
            link.flipEnd,
            link.couterClockwise,
            link.angle_rad,
          );
          break;
        case "Radius": {
          const stiffness = 1.0;
          const ri = s.rad[0];
          const radius = nodes.radius[ri];
          const wRadius = nodes.wRadius[ri];
          const error = radius - link.radius;
          nodes.radius[ri] = radius - error * wRadius * stiffness;
          err = Math.abs(error);
          break;
        }
        case "Horizontal":
          err = applyHorizontalConstraint(nodes, s.pos[0], s.pos[1]);
          break;
        case "Vertical":
          err = applyVerticalConstraint(nodes, s.pos[0], s.pos[1]);
          break;
        case "Normal":
          err = applyNormalConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            s.pos[3],
          );
          break;
        case "Parallel":
          err = applyParallelConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            s.pos[3],
          );
          break;
        case "EqualLength":
          err = applyEqualLengthConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            s.pos[3],
          );
          break;
        case "GearMeshing":
          err = applyGearMeshingConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.rad[0],
            s.rad[1],
          );
          break;
        case "GearRatio":
          err = applyGearRatioConstraint(nodes, s.rad[0], s.rad[1], link.ratio);
          break;
        case "BeltLength":
          err = applyBeltLengthConstraint(nodes, s, link, 1.0);
          break;
        case "BeltJunction":
          err = applyBeltJunctionConstraint(
            nodes,
            s,
            link.radii,
            link.directions,
            1.0,
          );
          break;
        case "BeltPin":
          err = applyBeltPinConstraint(
            nodes,
            s,
            link.radii,
            link.directions,
            link.refIndex,
            link.s0,
            link.thetaRef0,
            link.wraps,
            link.disconnected,
            link.closed ?? true,
            1.0,
            link.passive,
          );
          break;
        case "BeltFollowsTangent":
          err = applyBeltFollowsTangentConstraint(
            nodes,
            s,
            link.radii,
            link.directions,
            link.refIndex,
            link.s0,
            link.thetaRef0,
            link.offset,
            link.disconnected,
          );
          break;
        case "MotorBeam":
          err = applyMotorBeamConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.targetAngle,
            motorStiffness,
          );
          break;
        case "MotorAngle":
          err = applyMotorAngleConstraint(
            nodes,
            s.ang[0],
            link.targetAngle,
            motorStiffness,
          );
          break;
        case "GearMeshAngle":
          err = applyGearMeshAngleConstraint(
            nodes,
            s.ang[0],
            s.ang[1],
            link.r1,
            link.r2,
            link.theta1_0,
            link.theta2_0,
            link.alpha0,
            link.alpha,
          );
          break;
        case "CoaxialAngle":
          err = applyCoaxialAngleConstraint(
            nodes,
            s.ang[0],
            s.ang[1],
            link.offset,
          );
          break;
        case "GearPerimeterPin":
          err = applyGearPerimeterPinConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.ang[0],
            link.radius,
            link.offset,
          );
          break;
        case "BeamFollowsAngle":
          err = applyBeamFollowsAngleConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.ang[0],
            link.offset,
          );
          break;
        case "Spring":
          // Soft pull toward restLength.
          // Deliberately NOT folded into maxError: a compliant spring fighting a rigid constraint never reaches zero residual, which would defeat the `maxError < epsilon` early-out.
          // Rigid constraints alone define convergence; the spring just biases any remaining free DOF toward its rest length.
          // Never reported.
          applyDistanceConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            link.restLength,
            link.stiffness,
          );
          report = false;
          break;
        case "BeltSegmentNoSlip":
          err = applyBeltSegmentNoSlip(nodes, s, link, 1.0);
          break;
        case "BeltSubChainAggregate":
          err = applyBeltSubChainAggregate(nodes, s, link, 1.0);
          break;
        case "BeltLoopClosure":
          err = applyBeltLoopClosure(nodes, s, link, 1.0);
          break;
        case "HandleGrab":
          // Transient interaction, not a constraint to report.
          report = false;
          if (i > nbGrabIterations) break;
          err = applyHandleGrabConstraint(
            nodes,
            nodes.radius,
            s.pos[0],
            s.rad[0],
            link.value,
            grabStiffness,
            maxGrabAmplitude,
          );
          break;
      }

      if (reactionAccum && reactionScratchX && reactionScratchY && reactionScratchA) {
        const acc = reactionAccum[idx];
        for (let k = 0; k < s.pos.length; k++) {
          const slot = s.pos[k];
          if (slot < 0) continue;
          acc.dx[k] += nodes.x[slot] - reactionScratchX[k];
          acc.dy[k] += nodes.y[slot] - reactionScratchY[k];
        }
        for (let k = 0; k < s.ang.length; k++) {
          const slot = s.ang[k];
          if (slot < 0) continue;
          acc.dAngle[k] += nodes.angle[slot] - reactionScratchA[k];
        }
      }

      if (trace && traceX && traceY && traceA) {
        const moves: { key: string; distance: number }[] = [];
        for (let n = 0; n < nodes.count; n++) {
          const distance = Math.sqrt(
            Math.pow(traceX[n] - nodes.x[n], 2) +
              Math.pow(traceY[n] - nodes.y[n], 2),
          );
          if (distance > 0) moves.push({ key: nodes.keys[n], distance });
        }
        const angleMoves: { key: string; delta: number }[] = [];
        for (let n = 0; n < nodes.angle.length; n++)
          if (nodes.angle[n] !== traceA[n])
            angleMoves.push({
              key: nodes.angleKeys[n],
              delta: nodes.angle[n] - traceA[n],
            });
        trace({
          iteration: i,
          index: idx,
          link,
          residual: err,
          moves,
          angleMoves,
        });
      }

      // Spring is soft by design → excluded from convergence; everything else (incl. the grab while active) drives maxError.
      // Deliberately the RAW residual: this exit fires below any physical scale in either unit, so it means "nothing moved at all" and has nothing to do with what is worth reporting.
      if (link.type !== "Spring") maxError = Math.max(maxError, err);
      if (report) {
        // `report` and not `owner`: a link with no owner is invisible to the diagnostics panel, but it still has to hold for the figure to be right.
        const residual = err * residual_scale(link, s, nodes, angleLever);
        if (trackSeverity) {
          const severity = residual / diagnosticTolerance;
          if (severity > maxSeverity) maxSeverity = severity;
        }
        if (residuals) residuals[idx] = residual;
      }
    }

    // ── What this sweep actually moved ────────────────────────────────────────
    // Angles are measured alongside positions, never instead of them: the coupling angle → position runs through later links, so the first sweeps of a frame can be dead in positions (1e-14 px) while a gear turns by 1e-2 rad.
    // A positional-only criterion exits there and loses the whole frame.
    let moved = 0;
    for (let n = 0; n < nodes.count; n++) {
      const dx = nodes.x[n] - prevX[n];
      const dy = nodes.y[n] - prevY[n];
      const d = dx * dx + dy * dy;
      if (d > moved) moved = d;
    }
    moved = Math.sqrt(moved);
    let turned = 0;
    for (let n = 0; n < nodes.angle.length; n++) {
      const d = Math.abs(nodes.angle[n] - prevA[n]);
      if (d > turned) turned = d;
    }
    const slot = i % RATE_WINDOW;
    const movedBefore = movedRing[slot];
    const turnedBefore = turnedRing[slot];
    movedRing[slot] = moved;
    turnedRing[slot] = turned;

    // Within-sweep convergence is the same question dynamics or not: the predict step already fixed this frame's/substep's target once, before the loop started (see `frameStart` above), so what is left is Gauss-Seidel creeping toward THAT fixed point — gravity moving the NEXT frame further has no bearing on whether THIS sweep is still correcting anything.
    // Forcing a dynamics step through its full `nbIterations` regardless of how far it had already converged is what let a heavy mass ratio (a slow-converging chain — `remaining_motion`'s own geometric decay applies just the same) leave a residual proportional to how far short of `nbIterations` it needed, instead of the small one it actually converges to given enough sweeps — see the mass-ratio pivot residual this fixed.
    if (maxError < epsilon) break;

    if (i < minSweepsBeforeExit) continue;

    if (exitOn === "constraints") {
      if (maxSeverity < CONSTRAINT_EXIT_SEVERITY) break;
    } else if (
      remaining_motion(moved, movedBefore) < remainingThreshold &&
      remaining_motion(turned, turnedBefore) < REMAINING_RAD
    )
      break;
  }

  // ── Dynamics: the frame's velocity, from the whole displacement since `frameStart` ──
  // `dt = 0` marks a re-projection step (see `Recorder.advance`'s first instant): no time elapsed, so there is no velocity to derive — dividing by it would give every already-satisfied dof (`Δx = 0`, common on a freshly imported, exactly-constrained mechanism) a `0 × Infinity = NaN` instead of the `0` it actually is.
  if (dynamics && dynamics.dt > 0 && frameStartX && frameStartY && frameStartA) {
    const invDt = 1 / dynamics.dt;
    for (let n = 0; n < nodes.count; n++) {
      if (nodes.w[n] === 0) continue; // anchored: no velocity to speak of
      nodes.vx[n] = (nodes.x[n] - frameStartX[n]) * invDt;
      nodes.vy[n] = (nodes.y[n] - frameStartY[n]) * invDt;
    }
    for (let a = 0; a < nodes.angle.length; a++)
      nodes.vAngle[a] = (nodes.angle[a] - frameStartA[a]) * invDt;
  }

  // ── Dynamics: each link's own reaction, from the displacement it accumulated ──
  //
  // `Δx` summed over the whole sweep is a position-level impulse still divided among whichever dofs it moved; dividing each by that dof's own inverse mass recovers the impulse ITSELF (an inverse-mass-weighted split is exactly how PBD divides one impulse between two bodies), and impulse/dt² is force — the same `α=0` XPBD result the velocity update above already relies on, just not yet summed away into a single number.
  //
  // An ANCHORED dof (w = 0) never moves, so its own impulse cannot be read off its `Δx` — it has to come from Newton's third law instead: a constraint's impulses sum to zero across whatever it touches (it only ever redistributes momentum among its own dofs, never invents any), so the anchor's share is minus the sum of every other dof's. That only resolves cleanly with exactly one anchored dof on the link; with more, the split between them is genuinely indeterminate from this alone, and is left unreported.
  // Same `dt = 0` case as the velocity block above: no reaction is meaningful for a re-projection step, and `invDt2` would be `Infinity`.
  if (
    dynamics?.reactions &&
    dynamics.dt > 0 &&
    reactionAccum &&
    reactionScratchX &&
    reactionScratchA
  ) {
    const reactions = dynamics.reactions;
    const invDt2 = 1 / (dynamics.dt * dynamics.dt);
    const impulseX = new Float64Array(reactionScratchX.length);
    const impulseY = new Float64Array(reactionScratchX.length);
    const impulseA = new Float64Array(reactionScratchA.length);
    links.forEach((link, idx) => {
      const s = slots[idx];
      const acc = reactionAccum[idx];

      // Two of a link's own slots may resolve to the SAME node — a `join` welding one beam onto the next puts it on both segments of their shared `Angle`.
      // Its displacement was accumulated once per slot, so counting both would report and sum the same impulse twice; only its first slot stands for it.
      const repeated = (k: number): boolean => {
        const slot = s.pos[k];
        for (let j = 0; j < k; j++) if (s.pos[j] === slot) return true;
        return false;
      };

      let sumX = 0;
      let sumY = 0;
      let anchoredPos = -1;
      let anchoredPosCount = 0;
      for (let k = 0; k < s.pos.length; k++) {
        const slot = repeated(k) ? -1 : s.pos[k];
        const w = slot >= 0 ? nodes.w[slot] : 0;
        if (slot >= 0 && w > 0) {
          impulseX[k] = acc.dx[k] / w;
          impulseY[k] = acc.dy[k] / w;
          sumX += impulseX[k];
          sumY += impulseY[k];
        } else {
          impulseX[k] = 0;
          impulseY[k] = 0;
          if (slot >= 0) {
            anchoredPos = k;
            anchoredPosCount++;
          }
        }
      }
      if (anchoredPosCount === 1) {
        impulseX[anchoredPos] = -sumX;
        impulseY[anchoredPos] = -sumY;
      }

      let sumA = 0;
      let anchoredAng = -1;
      let anchoredAngCount = 0;
      for (let k = 0; k < s.ang.length; k++) {
        const slot = s.ang[k];
        const w = slot >= 0 ? nodes.wAngle[slot] : 0;
        if (slot >= 0 && w > 0) {
          impulseA[k] = acc.dAngle[k] / w;
          sumA += impulseA[k];
        } else {
          impulseA[k] = 0;
          if (slot >= 0) {
            anchoredAng = k;
            anchoredAngCount++;
          }
        }
      }
      if (anchoredAngCount === 1) impulseA[anchoredAng] = -sumA;

      for (let k = 0; k < s.pos.length; k++) {
        const slot = repeated(k) ? -1 : s.pos[k];
        if (slot < 0) continue;
        const w = nodes.w[slot];
        if (w === 0 && anchoredPosCount !== 1) continue; // indeterminate, see above
        const fx = impulseX[k] * invDt2;
        const fy = impulseY[k] * invDt2;
        if (fx === 0 && fy === 0) continue;
        reactions.push({
          type: link.type,
          owner: link.owner,
          key: nodes.keys[slot],
          atAnchor: w === 0,
          kind: "force",
          fx,
          fy,
          linkIndex: idx,
        });
      }

      // A 2-point link's own reaction always sums to zero across its two ends (Newton's third law, the same property the anchored-dof derivation above relies on) — which makes its moment about ANY point the same regardless of where that point is chosen: a pure couple, exactly the "moment reaction" a rigid, non-rotating weld (`KeepOrientation`) represents, and mechanics-of-materials expects reported at a fixed support alongside the translational reaction.
      // A pure axial link (`Distance`) has its force parallel to the lever arm between its own two points, so this comes out at ~0 there — reported only where it is actually non-zero.
      // Reported at BOTH ends (same value): reference-independence means either is equally "the" moment.
      if (s.pos.length === 2 && s.pos[0] >= 0 && s.pos[1] >= 0) {
        const slotA = s.pos[0];
        const slotB = s.pos[1];
        const dx = nodes.x[slotB] - nodes.x[slotA];
        const dy = nodes.y[slotB] - nodes.y[slotA];
        const fxB = impulseX[1] * invDt2;
        const fyB = impulseY[1] * invDt2;
        const moment = dx * fyB - dy * fxB;
        if (moment !== 0) {
          reactions.push({
            type: link.type,
            owner: link.owner,
            key: nodes.keys[slotA],
            atAnchor: nodes.w[slotA] === 0,
            kind: "torque",
            torque: moment,
            linkIndex: idx,
          });
          reactions.push({
            type: link.type,
            owner: link.owner,
            key: nodes.keys[slotB],
            atAnchor: nodes.w[slotB] === 0,
            kind: "torque",
            torque: moment,
            linkIndex: idx,
          });
        }
      }

      for (let k = 0; k < s.ang.length; k++) {
        const slot = s.ang[k];
        if (slot < 0) continue;
        const w = nodes.wAngle[slot];
        if (w === 0 && anchoredAngCount !== 1) continue;
        const torque = impulseA[k] * invDt2;
        if (torque === 0) continue;
        reactions.push({
          type: link.type,
          owner: link.owner,
          key: nodes.angleKeys[slot],
          atAnchor: w === 0,
          kind: "torque",
          torque,
          linkIndex: idx,
        });
      }
    });

    // ── A directly-applied external force/torque at an anchored dof ── invisible to the
    // link-based bookkeeping above: an anchored dof never moves (predict skips it, w = 0), so there is no displacement to read a force off.
    // But the ground still has to supply exactly it — a lone grounded node carrying a `Force` load and nothing else attached would otherwise report no reaction at all, when the whole load lands there.
    for (let slot = 0; slot < nodes.count; slot++) {
      if (nodes.w[slot] !== 0) continue;
      const fx = nodes.fx[slot];
      const fy = nodes.fy[slot];
      if (fx === 0 && fy === 0) continue;
      reactions.push({
        type: "External",
        key: nodes.keys[slot],
        atAnchor: true,
        kind: "force",
        fx,
        fy,
      });
    }
    for (let slot = 0; slot < nodes.angleKeys.length; slot++) {
      if (nodes.wAngle[slot] !== 0) continue;
      const torque = nodes.torque[slot];
      if (torque === 0) continue;
      reactions.push({
        type: "External",
        key: nodes.angleKeys[slot],
        atAnchor: true,
        kind: "torque",
        torque,
      });
    }
  }

  // Build the unsatisfied-constraint list from the last iteration's residuals.
  // Converged links sit below their family's tolerance and are dropped; a blocked mechanism leaves the violated links above it.
  if (!residuals || !collectDiagnostics) return undefined;
  const unsatisfied: ConstraintResidual[] = [];
  links.forEach((link, idx) => {
    const residual = residuals[idx];
    if (residual > diagnosticTolerance && link.owner !== undefined)
      unsatisfied.push({ owner: link.owner, type: link.type, residual });
  });
  return unsatisfied;
}
