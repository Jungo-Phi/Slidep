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
import { sweep_probe } from "./sweep-probe";
import { applyBeltSegmentNoSlip } from "./experimental/belt-noslip-q";
import { applyBeltSubChainAggregate } from "./experimental/belt-aggregate";
import {
  SolveNodes,
  solveNodesFromMaps,
  writePositionsBack,
  writeScalarsBack,
} from "./nodes";
import { resolve_slots } from "./link-slots";

export type SolverMaps = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  radii: Map<string, number>;
  radMasses: Map<string, number>;
  angles: Map<string, number>;
  /** Constraints left unsatisfied (only filled when collectDiagnostics is set). */
  unsatisfied?: ConstraintResidual[];
};

/** Above its residual a constraint is reported as unsatisfied. Heuristic: well
 *  above the convergence epsilon, but catches a genuinely violated (e.g.
 *  blocked) constraint. Each family answers in its own unit, so each gets its
 *  own threshold — a single one would read a broken angle lock as satisfied. */
const DIAGNOSTIC_TOLERANCE_PX = 1;
/** ~0.6°: an angle constraint is off well before it reaches a whole radian. */
const DIAGNOSTIC_TOLERANCE_RAD = 0.01;
/** `GearRatio` answers a dimensionless ratio error (r1/r2 − target). */
const DIAGNOSTIC_TOLERANCE_RATIO = 0.01;

/** Constraints whose residual is an angle in radians. Everything else answers
 *  in pixels — including `GearMeshAngle`, whose residual is an arc length. */
const ANGULAR_LINKS: ReadonlySet<Link["type"]> = new Set([
  "Angle",
  "Parallel",
  "Normal",
  "MotorAngle",
  "MotorBeam",
  "CoaxialAngle",
]);

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
 * A thousandth of a pixel, not a hundredth: the per-frame bound is respected either way,
 * but each frame warm-starts from the previous one, so what it gives up ACCUMULATES. At
 * 1e-2 the drift grows without settling (1.48 px over 200 frames on `Core XY modifié`);
 * at 1e-3 it plateaus (5e-2 px, the same at 60 and at 200 frames) while keeping the whole
 * of the gain that is actually free — `Poulie bloqueuse`, blocked, goes from 300 sweeps to
 * 109 with a drift of exactly zero.
 */
let REMAINING_PX = 1e-3;
/** Same bound in angle: 1e-6 rad moves a point on a 400 px rim by 4e-4 px. */
let REMAINING_RAD = 1e-6;

/**
 * Moves the early-exit bounds. `0` disables the exit outright (nothing can be below it),
 * which is how a measurement gets the every-sweep reference to compare against.
 */
export function set_early_exit_bounds(px: number, rad: number): void {
  REMAINING_PX = px;
  REMAINING_RAD = rad;
}

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

function diagnostic_tolerance(type: Link["type"]): number {
  if (type === "GearRatio") return DIAGNOSTIC_TOLERANCE_RATIO;
  return ANGULAR_LINKS.has(type)
    ? DIAGNOSTIC_TOLERANCE_RAD
    : DIAGNOSTIC_TOLERANCE_PX;
}

/**
 * How far past its reporting threshold the worst-off constraint sits, families put on one
 * scale by dividing each residual by its own tolerance. `0` when nothing is reported, `2`
 * when something is twice as violated as it takes to be listed.
 *
 * Dimensionless on purpose: px and rad cannot be compared, but "twice the threshold" can.
 */
export function constraint_severity(
  unsatisfied: ConstraintResidual[] | undefined,
): number {
  let worst = 0;
  for (const u of unsatisfied ?? []) {
    const s = u.residual / diagnostic_tolerance(u.type as Link["type"]);
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
): ConstraintResidual[] | undefined {
  const slots = resolve_slots(links, nodes);

  // stop grab after `nbGrabIterations` to not stretch the mechanism
  const nbGrabIterations = 5;
  const grabStiffness = 0.5;
  const maxGrabAmplitude = 10;

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

  const probe = sweep_probe();
  // Previous sweep's state, for the motion measured below. A `Float64Array` copy of a few
  // hundred doubles costs ~0.5 % of a frame, which is why this is a snapshot and not an
  // accumulation threaded through every constraint.
  const prevX = new Float64Array(nodes.x.length);
  const prevY = new Float64Array(nodes.y.length);
  const prevA = new Float64Array(nodes.angle.length);
  // Per-sweep motion of the last RATE_WINDOW sweeps, as a ring, for the decay rate.
  const movedRing = new Float64Array(RATE_WINDOW);
  const turnedRing = new Float64Array(RATE_WINDOW);

  let maxError: number = 0;
  for (let i = 0; i < nbIterations; i++) {
    maxError = 0;
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
          );
          break;
        case "FixedOnSegment":
          err = applyFixedOnSegmentConstraint(
            nodes,
            s.pos[0],
            s.pos[1],
            s.pos[2],
            link.t,
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
      // (incl. the grab while active) drives maxError.
      if (link.type !== "Spring") maxError = Math.max(maxError, err);
      if (residuals && report) residuals[idx] = err;
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
    if (probe)
      probe({
        sweep: i,
        moved,
        turned,
        maxError,
        shape: {
          x: nodes.x,
          y: nodes.y,
          angle: nodes.angle,
          prevX,
          prevY,
          prevA,
          count: nodes.count,
          keys: nodes.keys,
        },
      });

    const slot = i % RATE_WINDOW;
    const movedBefore = movedRing[slot];
    const turnedBefore = turnedRing[slot];
    movedRing[slot] = moved;
    turnedRing[slot] = turned;

    if (maxError < epsilon) break;

    if (
      i >= minSweepsBeforeExit &&
      remaining_motion(moved, movedBefore) < REMAINING_PX &&
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
    if (residual > diagnostic_tolerance(link.type) && link.owner !== undefined)
      unsatisfied.push({ owner: link.owner, type: link.type, residual });
  });
  return unsatisfied;
}
