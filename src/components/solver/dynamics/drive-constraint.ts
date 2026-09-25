import { SimNodes } from "../nodes";

/**
 * A torque-limited motor, as the dynamics sweep solves it: a velocity constraint whose multiplier is capped at the motor's torque.
 *
 * Solved inside the sweep rather than applied as a force beforehand, so the motor meets the inertia of the whole mechanism it drives — a crank feels the 200 kg its rod pushes — instead of an estimate of it.
 * Below its limit the motor holds its commanded speed exactly; at its limit it supplies that torque and no more, and the speed falls out of the rest of the solve.
 *
 * `torque` and `saturated` are outputs: what the motor applied onto its driven body over the substep, N·m, counter-clockwise positive, and whether that was its whole limit.
 */
export type Drive = (
  | {
      kind: "beam";
      pivotKey: string;
      drivenKey: string;
      /** The free end of the beam it turns against, when mounted on one rather than on the ground. */
      anchorKey?: string;
    }
  | {
      kind: "angle";
      angleKey: string;
      /** The beam it turns against, by its pivot and free end, when mounted on one. */
      anchorPivotKey?: string;
      anchorKey?: string;
    }
) & {
  /** Commanded speed relative to what it turns against, rad/s, counter-clockwise positive. */
  omega: number;
  /** N·m. */
  torqueLimit: number;
  torque: number;
  saturated: boolean;
};

const ABSENT = -1;

/** An arm from one position slot to another: the lever a constraint on its angle pushes through. */
interface Arm {
  pivot: number;
  tip: number;
  /** The arm's direction at the start of the substep, which its rotation is measured from. */
  x0: number;
  y0: number;
}

/** One drive resolved against a solve's slots, with its accumulated multiplier. */
interface ResolvedDrive {
  drive: Drive;
  driven: Arm | undefined;
  angle: number;
  angle0: number;
  anchor: Arm | undefined;
  lambda: number;
  /** `torqueLimit · dt²`, the bound on `lambda`. */
  bound: number;
  /** Commanded rotation over the substep. */
  step: number;
  /** What a radian of gap is worth in metres: the driven arm's length.
   * 1 for a gear, whose radius lives in its links rather than in the solve's nodes. */
  lever: number;
}

/**
 * Rotation of an arm since the start of the substep.
 * Read against its starting direction rather than as an absolute angle, so it never wraps: a substep turns an arm far less than half a turn.
 */
function arm_rotation(nodes: SimNodes, arm: Arm): number {
  const dx = nodes.x[arm.tip] - nodes.x[arm.pivot];
  const dy = nodes.y[arm.tip] - nodes.y[arm.pivot];
  return Math.atan2(arm.x0 * dy - arm.y0 * dx, arm.x0 * dx + arm.y0 * dy);
}

function resolve_arm(nodes: SimNodes, pivotKey: string, tipKey: string): Arm | undefined {
  const pivot = nodes.index.get(pivotKey) ?? ABSENT;
  const tip = nodes.index.get(tipKey) ?? ABSENT;
  if (pivot === ABSENT || tip === ABSENT) return undefined;
  const x0 = nodes.x[tip] - nodes.x[pivot];
  const y0 = nodes.y[tip] - nodes.y[pivot];
  if (x0 * x0 + y0 * y0 < 1e-24) return undefined;
  return { pivot, tip, x0, y0 };
}

/**
 * Bind each drive to this solve's slots, from the positions the substep starts at.
 * Call before the predict step moves anything: the commanded rotation is measured from there.
 */
export function resolve_drives(nodes: SimNodes, drives: Drive[], dt: number): ResolvedDrive[] {
  const resolved: ResolvedDrive[] = [];
  for (const drive of drives) {
    drive.torque = 0;
    drive.saturated = false;
    const anchor =
      drive.kind === "beam"
        ? drive.anchorKey !== undefined
          ? resolve_arm(nodes, drive.pivotKey, drive.anchorKey)
          : undefined
        : drive.anchorPivotKey !== undefined && drive.anchorKey !== undefined
          ? resolve_arm(nodes, drive.anchorPivotKey, drive.anchorKey)
          : undefined;
    const driven =
      drive.kind === "beam" ? resolve_arm(nodes, drive.pivotKey, drive.drivenKey) : undefined;
    const angle = drive.kind === "angle" ? (nodes.angleIndex.get(drive.angleKey) ?? ABSENT) : ABSENT;
    if (drive.kind === "beam" ? !driven : angle === ABSENT) continue;
    const lever = driven ? Math.hypot(driven.x0, driven.y0) : 1;
    resolved.push({
      drive,
      driven,
      angle,
      angle0: angle === ABSENT ? 0 : nodes.angle[angle],
      anchor,
      lambda: 0,
      bound: Math.max(0, drive.torqueLimit) * dt * dt,
      step: drive.omega * dt,
      lever,
    });
  }
  return resolved;
}

/** Move one slot by `scale` along a gradient, weighted by its inverse mass. */
function push_tangent(nodes: SimNodes, slot: number, tx: number, ty: number, scale: number): void {
  const w = nodes.w[slot];
  nodes.x[slot] += w * tx * scale;
  nodes.y[slot] += w * ty * scale;
}

/** An arm's rotation gradient at its tip, `perp(r̂)/|r|`, from the live positions. */
function tangent(nodes: SimNodes, arm: Arm): [number, number] {
  const dx = nodes.x[arm.tip] - nodes.x[arm.pivot];
  const dy = nodes.y[arm.tip] - nodes.y[arm.pivot];
  const r2 = dx * dx + dy * dy;
  if (r2 < 1e-24) return [0, 0];
  return [-dy / r2, dx / r2];
}

/**
 * One Gauss-Seidel pass over the drives.
 *
 * Each reads `C = (rotation of the driven body − rotation of what it turns against) − ω·dt`; its multiplier accumulates over the sweeps like any XPBD constraint's, clamped to `±torqueLimit·dt²`.
 * The anchor takes the reaction through the same gradient, so a motor mounted on a moving beam pushes that beam back.
 * Returns the largest gap a drive still below its limit started the pass with, in metres at its lever — what the sweep's convergence has to wait for, since a saturated drive has nothing left to close.
 */
export function apply_drives(nodes: SimNodes, drives: ResolvedDrive[]): number {
  let worst = 0;
  for (const d of drives) {
    const own = d.driven ? arm_rotation(nodes, d.driven) : nodes.angle[d.angle] - d.angle0;
    const against = d.anchor ? arm_rotation(nodes, d.anchor) : 0;
    const c = own - against - d.step;
    const saturated = Math.abs(d.lambda) >= d.bound && Math.sign(-c) === Math.sign(d.lambda);
    if (!saturated) worst = Math.max(worst, Math.abs(c) * d.lever);

    const gd = d.driven ? tangent(nodes, d.driven) : undefined;
    const ga = d.anchor ? tangent(nodes, d.anchor) : undefined;
    let wSum = 0;
    if (d.driven && gd) {
      wSum += nodes.w[d.driven.tip] * (gd[0] * gd[0] + gd[1] * gd[1]);
      // The pivot moves under both arms' gradients at once, since it is the root of each.
      const px = -gd[0] + (ga && d.anchor && d.anchor.pivot === d.driven.pivot ? ga[0] : 0);
      const py = -gd[1] + (ga && d.anchor && d.anchor.pivot === d.driven.pivot ? ga[1] : 0);
      wSum += nodes.w[d.driven.pivot] * (px * px + py * py);
    } else wSum += nodes.wAngle[d.angle];
    if (d.anchor && ga) {
      wSum += nodes.w[d.anchor.tip] * (ga[0] * ga[0] + ga[1] * ga[1]);
      if (!d.driven || d.anchor.pivot !== d.driven.pivot)
        wSum += nodes.w[d.anchor.pivot] * (ga[0] * ga[0] + ga[1] * ga[1]);
    }
    if (wSum <= 0) continue;

    const next = Math.max(-d.bound, Math.min(d.bound, d.lambda - c / wSum));
    const dLambda = next - d.lambda;
    d.lambda = next;
    if (dLambda === 0) continue;

    if (d.driven && gd) {
      push_tangent(nodes, d.driven.tip, gd[0], gd[1], dLambda);
      push_tangent(nodes, d.driven.pivot, gd[0], gd[1], -dLambda);
    } else nodes.angle[d.angle] += nodes.wAngle[d.angle] * dLambda;
    if (d.anchor && ga) {
      push_tangent(nodes, d.anchor.tip, ga[0], ga[1], -dLambda);
      push_tangent(nodes, d.anchor.pivot, ga[0], ga[1], dLambda);
    }
  }
  return worst;
}

/** Write each drive's torque back once the sweep is over: its multiplier over `dt²`. */
export function finish_drives(drives: ResolvedDrive[], dt: number): void {
  if (dt <= 0) return;
  for (const d of drives) {
    d.drive.torque = d.lambda / (dt * dt);
    // Exact: the clamp in `apply_drives` writes the bound itself.
    d.drive.saturated = Math.abs(d.lambda) >= d.bound;
  }
}
