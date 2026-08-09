import { Link, Point2 } from "../../types";
import { ConstraintResidual } from "../../types/runtime-state";
import {
  applyAngleConstraint,
  applyBeamFollowsAngleConstraint,
  applyBeltFollowsTangentConstraint,
  applyBeltJunctionConstraint,
  applyBeltLengthConstraint,
  applyBeltPinConstraint,
  applyCoaxialAngleConstraint,
  applyDistanceConstraint,
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
import { applyBeltSegmentNoSlip } from "./experimental/belt-noslip-q";
import { applyBeltSubChainAggregate } from "./experimental/belt-aggregate";
import {
  SolveNodes,
  solveNodesFromMaps,
  writePositionsBack,
  writeScalarsBack,
} from "./nodes";
import { LinkSlots, resolve_slots } from "./link-slots";

export type SolverMaps = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  radii: Map<string, number>;
  radMasses: Map<string, number>;
  angles: Map<string, number>;
  /** Constraints left unsatisfied (only filled when collectDiagnostics is set). */
  unsatisfied?: ConstraintResidual[];
};

/**
 * Above this residual a constraint is reported as unsatisfied, and severity is expressed
 * against it. One millimetre, and **one** threshold for every family: residuals reach it
 * already converted to the length they are worth (see `residual_scale`), so an angle and a
 * distance are finally the same kind of number.
 *
 * This is the threshold the USER is warned at. Moving it changes what the diagnostics panel
 * reports, not how hard a solver works — a solver target is a multiple of it, never it.
 */
const DIAGNOSTIC_TOLERANCE_MM = 1;

/**
 * What one unit of a link's residual is worth in millimetres.
 *
 * An angle is not a length, and a fixed angular threshold is not comparable to a fixed
 * distance one: 0.01 rad is 4 mm at the end of a 400 mm arm and 0.1 mm on a 10 mm pinion.
 * So an angular residual is converted to **the arc it sweeps**, through the link's own
 * geometry — the longer of the two edges an angle holds apart, a motor's crank, the radius
 * of a gear that carries nothing but an angle. `GearRatio` answers a dimensionless ratio,
 * which times the second radius is the millimetres the first one is off by.
 *
 * Everything else already answers in millimetres — including `GearMeshAngle`, whose
 * residual is an arc length, which is the precedent this generalises.
 *
 * **Incomplete in simulation**: there the radii live in the links, not in the nodes, so a
 * link carrying nothing but an angle finds no lever and falls back to 1 — its residual stays
 * an angle. Closing that needs an angle → radius map built where the model is compiled.
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
 * A sweep does not reach a fixed point: it creeps, decaying geometrically at a rate that
 * sits around 0.98 on a mechanism the size of a Core XY. That is not a defect but the
 * spectral radius of Gauss-Seidel on a chain — measured on a bare `Distance` chain with no
 * belt at all, r goes 0.957 / 0.990 / 0.996 for 8 / 16 / 32 links, i.e. r ≈ 1 − c/N².
 * So "nothing moved this sweep" never becomes true, and a raw displacement threshold
 * cannot tell a mechanism that has arrived from one that is crawling.
 *
 * What is bounded instead is the SUM of what is left: with a per-sweep decay rate r,
 * Σ moved·rⁿ = moved·r/(1−r). Measuring r over a window rather than between two
 * consecutive sweeps keeps it from being read off noise.
 */

/** Sweeps over which the decay rate is estimated. */
const RATE_WINDOW = 8;
/**
 * Sweeps left after the grab lets go before an exit may be considered, so what it
 * stretched has relaxed. Unmeasured — inherited from the 24 that used to be a flat
 * floor over 20 grab sweeps.
 */
const GRAB_RELEASE_SWEEPS = 4;

/**
 * Below this much motion left to come, finishing the sweeps buys nothing visible.
 *
 * A thousandth of a millimetre, not a hundredth: the per-frame bound is respected either
 * way, but each frame warm-starts from the previous one, so what it gives up ACCUMULATES.
 * At 1e-2 the drift grows without settling (1.48 mm over 200 frames on `Core XY modifié`);
 * at 1e-3 it plateaus (5e-2 mm, the same at 60 and at 200 frames) while keeping the whole
 * of the gain that is actually free — `Poulie bloqueuse`, blocked, goes from 300 sweeps to
 * 109 with a drift of exactly zero.
 */
const REMAINING_MM = 1e-3;
/** Same bound in angle: 1e-6 rad moves a point on a 400 mm rim by 4e-4 mm. */
const REMAINING_RAD = 1e-6;

/**
 * How the solver decides it has done enough.
 *
 * `motion` — stop when nothing will move enough to matter. Right in simulation: the frame
 * hands back to a display that is waiting, and the next one resumes from here, so what is
 * given up is caught up. A mechanism that is blocked stops and reports its blockage, which
 * is the honest answer.
 *
 * `constraints` — stop when nothing is violated. Right in edition, where there is no next
 * frame: the solve IS the drawing, and it stays on screen until the next gesture. A
 * mechanism can stop moving while still being wrong, and that would freeze a false figure.
 * Slower is acceptable here; approximate is not.
 */
export type ExitCriterion = "motion" | "constraints";

/**
 * How far past its reporting threshold the worst constraint may sit for a `constraints`
 * solve to call itself done. A hundredth of the threshold, so 0.01 mm and 1e-4 rad — an
 * order of magnitude finer than the 0.1 the editors round their values to, which is what
 * makes that rounding trustworthy.
 */
const CONSTRAINT_EXIT_SEVERITY = 0.01;

/**
 * How hard, how far and for how long a grab pulls.
 *
 * The pull is a RAMP, not a schedule of the whole solve: it runs for `nbGrabIterations`
 * sweeps and then lets go, leaving the rest of the budget to relax whatever it stretched.
 * Pulling all the way through would settle the sketch at a compromise where the grab is
 * still pulling, i.e. leave it permanently stretched.
 *
 * There is no absolute cap on one sweep's correction, and that is the point: `grabStiffness`
 * already bounds it to half the remaining gap, which is soft in the way that matters — the
 * grab yields to the constraints — without being slow. An absolute cap made the pull slow
 * instead: at 10 mm a sweep the grabbed point could not travel more than ~60 mm per solve,
 * so a cursor moving faster simply outran it and stayed behind (chantier 4 ter measured a
 * 2798 mm lag at 150 mm/frame, against 2.4 mm without the cap, for the same deformation of
 * zero and the same sweep count).
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
 * The sum runs to infinity even though only `nbIterations − i` sweeps remain. Truncating
 * it there is the tighter bound and was measured: it fires 1 to 13 sweeps earlier on four
 * of nine mechanisms, nothing at all on the other five, and moves the result by 1.7e-3 px
 * on Jansen. Not worth changing what the solver computes.
 */
function remaining_motion(now: number, windowAgo: number): number {
  if (now === 0) return 0;
  if (!(windowAgo > now)) return Infinity;
  const rate = Math.pow(now / windowAgo, 1 / RATE_WINDOW);
  return (now * rate) / (1 - rate);
}


/**
 * How far past the reporting threshold the worst-off constraint sits. `0` when nothing is
 * reported, `2` when something is twice as violated as it takes to be listed.
 *
 * Dimensionless, and now honestly so: every residual reaches this list already expressed as
 * a length, so there is one threshold to divide by rather than one per family.
 */
export function constraint_severity(
  unsatisfied: ConstraintResidual[] | undefined,
): number {
  let worst = 0;
  for (const u of unsatisfied ?? []) {
    const s = u.residual / DIAGNOSTIC_TOLERANCE_MM;
    if (s > worst) worst = s;
  }
  return worst;
}

/*
 * PBD (Position Based Dynamics) solver shared by the geometric solver (edition)
 * and the kinematic simulation. Geometric links use positions/radii; simulation
 * links additionally use the angle maps.
 *
 * Map-shaped entry point: marshals into indexed storage, solves, and writes the results
 * back into the caller's own maps.
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
): SolverMaps {
  const nodes = solveNodesFromMaps(
    positions,
    posMasses,
    angles,
    radii,
    radMasses,
  );
  const unsatisfied = PBD_solve(
    nodes,
    links,
    nbIterations,
    epsilon,
    collectDiagnostics,
    exitOn,
  );
  writePositionsBack(nodes, positions);
  writeScalarsBack(nodes.angleIndex, nodes.angle, angles);
  writeScalarsBack(nodes.radIndex, nodes.radius, radii);
  return { positions, radii, posMasses, radMasses, angles, unsatisfied };
}

/**
 * The solve itself, on indexed storage: mutates `nodes` in place and returns the
 * unsatisfied-constraint list when diagnostics are collected.
 */
export function PBD_solve(
  nodes: SolveNodes,
  links: Link[],
  nbIterations: number,
  epsilon: number = 0.000_001,
  collectDiagnostics: boolean = false,
  exitOn: ExitCriterion = "motion",
): ConstraintResidual[] | undefined {
  const slots = resolve_slots(links, nodes);

  // stop grab after `nbGrabIterations` to not stretch the mechanism
  const { nbGrabIterations, grabStiffness, maxGrabAmplitude } = GRAB;

  // The grab is the only reason the early exit has a floor at all: a frame must not
  // exit while it is still pulling, nor before what it stretched has relaxed. A frame
  // with no grab owes it nothing — and there, the floor is not needed either, since
  // `remaining_motion` returns Infinity until the decay window has filled.
  const minSweepsBeforeExit = links.some((l) => l.type === "HandleGrab")
    ? nbGrabIterations + GRAB_RELEASE_SWEEPS
    : 0;

  // Motors are soft drivers: they must yield to hard geometric constraints
  // (grounding, FixedOnSegment, Distance…) rather than fight them at equal
  // strength. With stiffness < 1 a free motor still converges fully to its
  // target over the iterations, but an over-constrained one (e.g. a grounded
  // body node pinning the driven beam) loses the tug-of-war and is reported
  // blocked instead of tearing the node off the beam.
  const motorStiffness = 0.5;

  // Per-link residual of the last executed iteration (for diagnostics). Springs
  // (soft by design) and grabs (transient) are never recorded here.
  const residuals = collectDiagnostics
    ? new Array<number>(links.length).fill(0)
    : null;

  // Read once: a trace cannot be installed in the middle of a solve, and this
  // must not cost a lookup per link.
  const trace = solver_trace();
  // Preallocated so an active trace costs an array copy per link, not a map clone.
  const traceX = trace ? new Float64Array(nodes.x.length) : null;
  const traceY = trace ? new Float64Array(nodes.y.length) : null;
  const traceA = trace ? new Float64Array(nodes.angle.length) : null;

  // Previous sweep's state, for the motion measured below. A `Float64Array` copy of a few
  // hundred doubles costs ~0.5 % of a frame, which is why this is a snapshot and not an
  // accumulation threaded through every constraint.
  const prevX = new Float64Array(nodes.x.length);
  const prevY = new Float64Array(nodes.y.length);
  const prevA = new Float64Array(nodes.angle.length);
  // Per-sweep motion of the last RATE_WINDOW sweeps, as a ring, for the decay rate.
  const movedRing = new Float64Array(RATE_WINDOW);
  const turnedRing = new Float64Array(RATE_WINDOW);

  // Radius of the gear each angle belongs to, so a link that carries nothing but an angle
  // still knows what its error is worth in millimetres. Angles and radii are keyed alike
  // (both by element id), which is what makes the lookup possible. Read once: the radius is
  // a degree of freedom, but as a scale for reporting its initial value is enough.
  const angleLever = new Float64Array(nodes.angle.length);
  for (let a = 0; a < nodes.angle.length; a++) {
    const r = nodes.radIndex.get(nodes.angleKeys[a]);
    angleLever[a] = r !== undefined ? nodes.radius[r] : 1;
  }

  // Worst residual of the sweep against the reporting threshold. Only tracked when
  // something reads it.
  const trackSeverity = exitOn === "constraints";
  let maxSeverity = 0;

  let maxError: number = 0;
  for (let i = 0; i < nbIterations; i++) {
    maxError = 0;
    maxSeverity = 0;
    prevX.set(nodes.x);
    prevY.set(nodes.y);
    prevA.set(nodes.angle);

    links.forEach((link, idx) => {
      const s = slots[idx];
      if (traceX && traceY && traceA) {
        traceX.set(nodes.x);
        traceY.set(nodes.y);
        traceA.set(nodes.angle);
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
          // Soft pull toward restLength. Deliberately NOT folded into maxError:
          // a compliant spring fighting a rigid constraint never reaches zero
          // residual, which would defeat the `maxError < epsilon` early-out.
          // Rigid constraints alone define convergence; the spring just biases
          // any remaining free DOF toward its rest length. Never reported.
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

      // Spring is soft by design → excluded from convergence; everything else
      // (incl. the grab while active) drives maxError. Deliberately the RAW residual: this
      // exit fires below any physical scale in either unit, so it means "nothing moved at
      // all" and has nothing to do with what is worth reporting.
      if (link.type !== "Spring") maxError = Math.max(maxError, err);
      if (report) {
        // `report` and not `owner`: a link with no owner is invisible to the diagnostics
        // panel, but it still has to hold for the figure to be right.
        const residual = err * residual_scale(link, s, nodes, angleLever);
        if (trackSeverity) {
          const severity = residual / DIAGNOSTIC_TOLERANCE_MM;
          if (severity > maxSeverity) maxSeverity = severity;
        }
        if (residuals) residuals[idx] = residual;
      }
    });

    // ── What this sweep actually moved ────────────────────────────────────────
    // Angles are measured alongside positions, never instead of them: the coupling
    // angle → position runs through later links, so the first sweeps of a frame can be
    // dead in positions (1e-14 px) while a gear turns by 1e-2 rad. A positional-only
    // criterion exits there and loses the whole frame.
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

    if (maxError < epsilon) break;

    if (i < minSweepsBeforeExit) continue;

    if (exitOn === "constraints") {
      if (maxSeverity < CONSTRAINT_EXIT_SEVERITY) break;
    } else if (
      remaining_motion(moved, movedBefore) < REMAINING_MM &&
      remaining_motion(turned, turnedBefore) < REMAINING_RAD
    )
      break;
  }

  // Build the unsatisfied-constraint list from the last iteration's residuals.
  // Converged links sit below their family's tolerance and are dropped; a
  // blocked mechanism leaves the violated links above it.
  if (!residuals) return undefined;
  const unsatisfied: ConstraintResidual[] = [];
  links.forEach((link, idx) => {
    const residual = residuals[idx];
    if (residual > DIAGNOSTIC_TOLERANCE_MM && link.owner !== undefined)
      unsatisfied.push({ owner: link.owner, type: link.type, residual });
  });
  return unsatisfied;
}
