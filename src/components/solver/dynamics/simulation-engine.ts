import { ID, Link, Mechanism, MechanicalElement, Point2, KinNodes } from "../../../types";
import { ZERO } from "../../../types/point2";
import { DEFAULT } from "../../../constants/physics-specs";
import {
  BeltVia,
  belt_arrivals,
  belt_pieces,
  belt_project,
  belt_wraps,
} from "../../../utils/belt-path";
import {
  ConstraintResidual,
  DynamicSnapshot,
  EnergySample,
  KinematicSnapshot,
  LinkReaction,
  MotorPowerSample,
  ParameterSnapshot,
  SimulationSnapshot,
  SnapshotLayout,
} from "../../../types/runtime-state";
import {
  belt_q_links,
  get_links_simulation,
  get_sim_nodes,
  mark_passive_belt_pins,
  rebuild_belt_q_links,
} from "../kinematics/parsing";
import { DynamicsInput, PBD_kinematic_solver, SolverMaps } from "../kinematics/PBD_kinematic_solver";
import { POSITION_KEY_FIELDS } from "../kinematics/link-slots";
import { beam_linear_mass, beam_strength } from "../../../utils/section-properties";
import { gear_inertia, gear_mass } from "../../../utils/gear-mass";
import { DynamicMassModel, compute_dynamic_mass_model } from "./mass-model";
import { BeamCohesionSpec, build_beam_cohesion_specs } from "./beam-cohesion";
import { StaticsSystem, build_statics_system } from "../statics/equilibrium-model";
import { solve_statics } from "../statics/equilibrium-solve";
import { build_flexibility } from "../statics/flexibility";
import { beam_cohesion_from_statics } from "../statics/publish";
import { compute_balance_sample } from "../statics/equilibrium-solve";
import { BEAM_END_MASS_FRACTION } from "./mass-model";
import { StaticsBeam, statics_frame } from "../statics/statics-frame";
import { CompiledLoad, compile_loads, resolve_load_forces } from "./load-model";
import {
  CompiledSpringDamper,
  compile_springs_dampers,
  resolve_spring_damper_forces,
} from "./spring-damper-model";
import { CompiledMotor, compile_motors, resolve_motor_torques } from "./motor-model";
import {
  CompiledFriction,
  compile_frictions,
  friction_power,
  resolve_friction_forces,
} from "./friction-model";
import {
  CollisionCandidates,
  FLOOR_ANCHOR_KEY,
  build_collision_candidates,
} from "./collision-candidates";
import { floor_anchor_and_normal } from "../../../utils/floor-geometry";
import { collision_links, prune_initial_penetrations } from "./collision-detection";
import { apply_collision_restitution } from "./collision-restitution";
import { MIN_EXTENT_M, positions_extent } from "../nodes";
import {
  BeltShape,
  GRAB_BRIDGE_KEY,
  GRAB_KEYS,
  GRAB_PERIMETER_KEY,
  angles_length,
  make_snapshot_layout,
  snapshot_angle,
  snapshot_belt_arrivals,
  snapshot_belt_detached,
  snapshot_belt_wraps,
  snapshot_point,
} from "../snapshot";
import { sort_links } from "../utils";

/**
 * The step every recorded instant is spaced by, whatever the playback speed and whatever the machine.
 * Speed is a target while recording and a promise on replay; it never buys itself a coarser step, so the same mechanism records the same trajectory everywhere.
 */
const RECORD_DT = 1 / 120; // 120 fps of simulated time

/**
 * Solved instants per instant kept.
 * The solver's step is a fidelity requirement — the disconnection defect of chantier 5 does not even exist at 1/60 — but the display interpolates and draws at 60 Hz, so keeping every step doubles what a session retains for a resolution nothing reads back.
 */
const RETAIN_EVERY = 2;

/** Spacing of the RECORDED instants: what everything downstream of the recorder sees. */
export const RETAIN_DT = RECORD_DT * RETAIN_EVERY;

/** Whether the instant `t` is one of those kept. */
export function is_retained(t: number): boolean {
  return Math.round(t / RECORD_DT) % RETAIN_EVERY === 0;
}

/** Longest a recording may run, in simulated seconds — no mechanism goes past it, however cheap its instants are. */
export const MAX_RECORDING_TIME = 600;

/**
 * Memory one recording may hold, in bytes.
 *
 * What actually bounds a session: an instant costs 1.67 ko on `Core XY - 2 moteurs` (55 nodes) and ten times that on a mechanism ten times its size, so a duration fixed for everyone is either short for the small ones or fatal for the big ones.
 * The budget is what a tab keeps comfortably alongside the canvas and the undo history.
 */
const RECORDING_MEMORY_BUDGET = 200 * 1024 * 1024;

/** What an instant costs beyond its numbers: two typed arrays with their buffers, the snapshot object, and its slot in the recording.
 * Around 15 % on a small mechanism. */
const SNAPSHOT_OVERHEAD_BYTES = 256;

/** Bytes one retained instant of this layout costs. */
function snapshot_bytes(layout: SnapshotLayout): number {
  return (
    8 * (2 * layout.keys.length + angles_length(layout)) +
    SNAPSHOT_OVERHEAD_BYTES
  );
}

/**
 * How long a recording of this layout may run, in simulated seconds: whatever the memory budget buys, capped at `MAX_RECORDING_TIME`.
 *
 * Whole minutes, because it is a number the user is told; and never under one, because a mechanism heavy enough to exhaust the budget in seconds is still worth simulating — that floor is the one case where the budget is knowingly overrun.
 */
export function max_recording_time(layout: SnapshotLayout): number {
  const affordable =
    (RECORDING_MEMORY_BUDGET / snapshot_bytes(layout)) * RETAIN_DT;
  return Math.max(
    60,
    Math.min(MAX_RECORDING_TIME, Math.floor(affordable / 60) * 60),
  );
}

/**
 * Whether a recording that has got to `t` has run its full length, `maxTime`.
 *
 * Half a step of tolerance, and it is not decorative: a recorded instant is a running sum of `RECORD_DT`, so the last one lands short of the round number it stands for.
 * Compared with a bare `>=`, the end of the recording is never reached.
 */
export function recording_full(t: number, maxTime: number): boolean {
  return t >= maxTime - RECORD_DT / 2;
}

/**
 * Wall-clock milliseconds the recording loop may spend inside one displayed frame.
 * Under a 16.7 ms frame, so the display keeps its own time; a step that outlasts it on its own still runs to completion, since a partial step is not a state.
 */
export const FRAME_BUDGET_MS = 8;

/**
 * Gauss-Seidel sweeps per simulated frame.
 * Measured (chantier 3 of `plan-ralentissement`): raising it buys a smaller drift slope and nothing the user can see — no constraint is left violated at 200 — while costing real time in proportion.
 * Edition has its own cap and its own exit; the two are not the same number and must not be made one.
 */
const SIMULATION_SWEEPS = 200;

/**
 * How long a motor takes to reach its commanded speed from a standing start, instead of snapping to it on the first frame.
 *
 * A motor's per-frame target is always exactly one frame's worth of commanded rotation ahead (see `expected` below) — never a backlog — so this is not about the motor asking for too much.
 * It is the kinematic sweep itself: with no velocity carried between frames (unlike dynamics), each frame's 200 Gauss-Seidel sweeps have to close that frame's whole gap on their own, and a slow-converging chain (a long belt, say) cannot always do it in one frame.
 * The shortfall then carries into the next, and drains only gradually — a transient a tolerance relative to a mechanism's own (possibly sub-metre) extent does not always cover.
 *
 * A linear ramp does not shrink this transient so much as postpone it: the lag it leaves behind tracks the commanded speed at the time, wherever the ramp is, so a short ramp mostly moves the peak later rather than lowering it (measured on `Poulie bloqueuse`, the slowest- converging reference mechanism: 0.68 mm at 0.3 s, 0.56 mm at 0.45 s, 0 at 0.5 s — the last frames of the ramp give the chain just enough consecutive time at near-full speed to fully drain what built up). 0.5 s is that measured floor, not a round number picked for looks.
 */
const MOTOR_STARTUP_RAMP_S = 0.5;

/** `0` at a standing start, `1` from `MOTOR_STARTUP_RAMP_S` on — see its own doc. */
function motor_ramp(t: number): number {
  return t >= MOTOR_STARTUP_RAMP_S ? 1 : t / MOTOR_STARTUP_RAMP_S;
}

/**
 * The belt's contact band, as a ratio of the mechanism's own extent (see `nodes_extent`/`positions_extent`) of wrapped arc: a pulley is let go below `detachRatio · extent` and taken back above `reattachRatio · extent`.
 * Ratios rather than flat lengths for the same reason `collision-detection.ts`'s `CONTACT_EPS_RATIO` is — a flat millimetre would drown a µm-scale mechanism and do nothing on a km-scale one.
 *
 * `detachArc` (`detachRatio · extent`) is NOT zero, and that is the whole point.
 * The last sliver of wrap before zero is a degenerate band — the no-slip on a pulley the belt barely grazes goes erratic — so waiting for exactly zero means letting the mechanism strain against a pulley that has stopped holding anything, then releasing it all at once.
 * Measured on `Déconnexion courroie` (extent ≈ 902, so `detachRatio` swept at 0/5.5e-4/1.1e-3/2.2e-3/ 5.5e-3/1.1e-2 mirrors the historical 0/0.5/1/2/5/10 px sweep): the transition frame lurches **26.1 px** at zero and **1.2 px** at 0.5, and grows again beyond (3.7 px at 2, 18.4 px at 10 — there the pulley still carried belt and dropping it is a real geometric change).
 *
 * The gap between the two is the hysteresis, and it exists for one reason: every flip rebuilds the belt's no-slip links, which resets the `q` origin of the WHOLE belt.
 *
 * Mutable so a bench can sweep it in one process — production never writes it.
 */
export const beltContact = {
  detachRatio: 5e-4, // 0.5 mm at the ~1 m extent this was tuned at
  reattachRatio: 1e-3, // 1 mm at the ~1 m extent this was tuned at
  rebuildQLinks: true,
};

/** A motor is reported blocked when, over the frame, the driven element advanced by less than this fraction of its commanded increment ω·dt. */
const MOTOR_BLOCK_FRACTION = 0.5;

/** Per-frame motor check: where the driver was before the solve and how far it was asked to move, so we can compare against what it actually achieved. */
type MotorCheck = {
  owner: ID;
  type: "MotorBeam" | "MotorAngle";
  cur: number; // angle before the solve (rad)
  expected: number; // commanded increment ω·dt (rad)
  pivotKey?: string;
  drivenKey?: string;
  angleKey?: string;
};

/**
 * Compiled, frozen simulation model.
 * Built once when entering simulation and reused every frame: only the latest positions/angles are fed back in, the masses and links never change until we return to edition.
 */
export type SimulationModel = {
  /** Initial positions/angles + frozen masses (fused keys for coincident points). */
  nodes: KinNodes;
  /** Links: already fused (Coincidence), FixedOnSegment, and sorted. */
  links: Link[];
  /** Maps an original solver key to its fused key (for grab translation). */
  keyMap: Map<string, string>;
  /** Slot layout every snapshot of this model shares. */
  layout: SnapshotLayout;
  /** How a solved state is written into those slots. */
  fill: SnapshotFill;
  /**
   * Radius of each gear, by id.
   * Not a solver input — simulation solves no radius — but the lever arm that turns an angular shortfall into the arc it failed to sweep, so a diagnostic can be stated in metres like every other one.
   */
  gearRadii: Map<ID, number>;
  /** Real masses, read only by `step_dynamic_simulation` — see `DynamicMassModel`. */
  dynamicMasses: DynamicMassModel;
  /** User loads resolved to solver keys, read only by `step_dynamic_simulation` — see `CompiledLoad`. */
  compiledLoads: CompiledLoad[];
  /** Springs and dampers, real-force form — read only by `step_dynamic_simulation`, which also drops their kinematic `Spring` LINK from the sweep (see `CompiledSpringDamper`). */
  compiledSpringDampers: CompiledSpringDamper[];
  /** Motors, torque-limited form — read only by `step_dynamic_simulation`, which also drops their kinematic `MotorBeam`/`MotorAngle` LINKs from the sweep (see `CompiledMotor`). */
  compiledMotors: CompiledMotor[];
  /** Frictional pivots/sliders, viscous form — read only by `step_dynamic_simulation` (see `CompiledFriction`). */
  compiledFrictions: CompiledFriction[];
  /** Pairs collision detection may test each frame — see `build_collision_candidates`. */
  collisionCandidates: CollisionCandidates;
  /** The floor's unit normal, baked in from `mechanism.simulation.floor.angle` at compile time — fixed for the run, like the anchor node itself (see `FLOOR_ANCHOR_KEY`).
   * Read by `collision_links` regardless of whether the floor is currently enabled, the same way `collisionCandidates.pointFloor`/`circleFloor` are always built. */
  floorNormal: Point2;
  /**
   * The mechanism's own scale (see `positions_extent`/`nodes_extent`), as of the last solved frame — the rest pose before the first.
   * Mutated after every `step_simulation`/ `step_dynamic_simulation` call from that frame's `PBD_kinematic_solver` result, and read before the NEXT frame's solve by whatever needs an extent-relative tolerance ahead of it (`collision_links`, `update_belt_disconnects`) — a frame's lag on a quantity that never moves fast is cheaper than a second bbox pass over `positions`.
   */
  extent: number;
  /** Each beam's own cohesion-torsor spec, read only by `step_dynamic_simulation` — see `BeamCohesionSpec`. */
  beamCohesionSpecs: BeamCohesionSpec[];
  /** The equilibrium system whose solution IS each beam's cohesion torsor — see docs/plan-efforts-interieurs.md phase 10.
   * Its layout depends only on the mechanism's topology, never on a pose, so it is assembled once here and refilled every frame. */
  staticsSystem: StaticsSystem;
  /** Material and profile per beam, for the statics pass's masses and stiffnesses. */
  staticsBeams: StaticsBeam[];
};

/** Which snapshot slots each solver node writes to: a fused key feeds one slot per key it fuses, and `firstParts` is the key a warm start reads its previous position from. */
type SnapshotFill = {
  keys: string[];
  firstParts: string[];
  /** `slots[start[i] … start[i + 1]]` are the slots of `keys[i]`. */
  start: Int32Array;
  slots: Int32Array;
};

/** The junction links a belt topology change rewrites in place. */
type JunctionLink = Extract<Link, { type: "BeltPin" | "BeltFollowsTangent" }>;

/**
 * What a belt topology change rewrites in a compiled model: the link list, whose no-slip links are rebuilt against the new loop, and the junction references baked into it.
 *
 * Handed to `step_simulation`'s `onRewire` BEFORE the change, since the junction links are rewritten in place and there is no reading them back afterwards.
 * Restoring it is what makes a rewind land on the state the recording actually had, rather than on one re-baked from the geometry — `h⁰` is measured, not derived, so the two are not the same.
 */
export type RewireState = {
  links: Link[];
  pins: {
    link: JunctionLink;
    refIndex: number;
    refAngleKey: string;
    s0: number;
    thetaRef0: number;
  }[];
};

function capture_rewire_state(model: SimulationModel): RewireState {
  const pins: RewireState["pins"] = [];
  for (const link of model.links)
    if (link.type === "BeltPin" || link.type === "BeltFollowsTangent")
      pins.push({
        link,
        refIndex: link.refIndex,
        refAngleKey: link.refAngleKey,
        s0: link.s0,
        thetaRef0: link.thetaRef0,
      });
  return { links: model.links, pins };
}

/** Put a captured `RewireState` back on the model it came from. */
export function restore_rewire_state(
  model: SimulationModel,
  state: RewireState,
): void {
  model.links = state.links;
  for (const pin of state.pins) {
    pin.link.refIndex = pin.refIndex;
    pin.link.refAngleKey = pin.refAngleKey;
    pin.link.s0 = pin.s0;
    pin.link.thetaRef0 = pin.thetaRef0;
  }
}

/** A grab during simulation: a node/endpoint key, an edge body at ratio t, or a gear tooth (rotate the gear so the perimeter point at `angleOffset` follows). */
export type SimGrab =
  | { key: string; target: Point2 }
  | { edgeID: string; t: number; target: Point2 }
  | { gearID: string; angleOffset: number; radius: number; target: Point2 }
  // Grab an arbitrary point of a closed belt: a transient BeltPin (baked at grab start) rides the loop at the grabbed arc-length; pulling it rotates the belt.
  | { beltPin: Extract<Link, { type: "BeltPin" }>; target: Point2 };

function wrap_angle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Per-frame belt-contact update (mutates the BeltLength link's sim state): tracks each still-connected pulley's continuous (unwrapped) wrap angle and, once the arc it wraps falls under `beltContact.detachRatio · extent`, marks the pulley disconnected.
 * The belt then runs straight past it (BeltLength skips it; the geometry of the remaining pulleys uses the reduced loop/chain), until `reattach_belt_pulleys` finds it back on the belt.
 *
 * Returns whether the belt's topology changed this frame, which is what the caller re-bakes the junction references and the no-slip links on.
 */
export function update_belt_disconnects(
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
  extent: number,
): boolean {
  const n = link.gearPosKeys.length;
  if (!link.disconnected) link.disconnected = new Array(n).fill(false);
  let newlyDisconnected = false;

  const activeIdx: number[] = [];
  const vias: BeltVia[] = [];
  if (!link.closed) {
    const s = positions.get(link.startKey);
    if (!s) return false;
    vias.push({ pos: s, radius: 0, clockwise: false });
  }
  for (let i = 0; i < n; i++) {
    if (link.disconnected[i]) continue;
    const pos = positions.get(link.gearPosKeys[i]);
    if (!pos) return false;
    activeIdx.push(i);
    vias.push({ pos, radius: link.radii[i], clockwise: link.directions[i] });
  }
  if (!link.closed) {
    const e = positions.get(link.endKey);
    if (!e) return false;
    vias.push({ pos: e, radius: 0, clockwise: false });
  }

  const raw = belt_wraps(vias, link.closed);
  const rawArr = belt_arrivals(vias, link.closed);
  const offset = link.closed ? 0 : 1; // via index of the first pulley
  const seeding = !link.wraps;
  if (!link.wraps) link.wraps = new Array(n).fill(0);
  if (!link.arrivals) link.arrivals = new Array(n).fill(0);
  const TAU = 2 * Math.PI;
  // Unwrap a raw angle onto the branch continuous with its previous value.
  const unwrap = (rawA: number, prev: number) => {
    let delta = rawA - (((prev % TAU) + TAU) % TAU);
    while (delta > Math.PI) delta -= TAU;
    while (delta <= -Math.PI) delta += TAU;
    return prev + delta;
  };
  // A pulley whose continuous wrap reaches 0 has lost belt contact (the belt straightens past it) and detaches.
  // A CLOSED belt keeps its last pulley (a gearless loop is degenerate); a LOOSE belt may shed even its last pulley → an inert free segment.
  activeIdx.forEach((gi, k) => {
    const rawW = raw[offset + k];
    if (seeding) {
      link.wraps![gi] = rawW; // first frame: seed, never disconnect
      link.arrivals![gi] = rawArr[offset + k];
      return;
    }
    // Continuous (unwrapped) wrap = 2π·turns + fractional: a wound end coils past 2π (winch) and unwinds smoothly back through the seam.
    const cont = unwrap(rawW, link.wraps![gi]);
    link.wraps![gi] = cont;
    // The ARRIVAL rim angle, likewise unwrapped.
    // BeltLength's no-slip differential is written in the pulley's frame (fs ± r·ψ), which needs ψ on a continuous branch — a raw atan2 would jump 2π at the ±π seam and inject 2πr of phantom belt.
    link.arrivals![gi] = unwrap(rawArr[offset + k], link.arrivals![gi]);
    if (
      cont * link.radii[gi] <= beltContact.detachRatio * (extent || MIN_EXTENT_M) &&
      !link.disconnected![gi] &&
      (!link.closed || activeIdx.length > 1)
    ) {
      link.disconnected![gi] = true;
      newlyDisconnected = true;
    }
  });
  return newlyDisconnected || reattach_belt_pulleys(link, positions, extent);
}

/**
 * Belt contact REGAINED: a detached pulley the belt has come back onto.
 * Tested by putting the pulley back into the via list and reading the arc it would then wrap — the exact mirror of the detachment test, which is why the two agree at the tangency.
 *
 * Two guards, and neither is optional:
 * - the pulley's centre must project INSIDE the strand it would join, not past one of its ends (same condition the canvas uses to decide a pulley can be dropped on a run) — otherwise a pulley that has drifted off sideways reads as touching;
 * - the arc must exceed `beltContact.reattachRatio · extent`.
 * Detachment stays at exactly zero, which is the geometric truth; only the way back waits.
 * Measured on `Déconnexion courroie`, the belt straightens ACROSS the pulley it just dropped and would re-take it on the very next frame, forever — and every flip resets the whole belt's `q` origin, which is what would make the no-slip blind.
 */
function reattach_belt_pulleys(
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
  extent: number,
): boolean {
  if (!link.disconnected?.some(Boolean)) return false;
  let reattached = false;
  for (let gi = 0; gi < link.gearPosKeys.length; gi++) {
    if (!link.disconnected[gi]) continue;
    const vias: BeltVia[] = [];
    let index = -1;
    let ok = true;
    for (let i = 0; i < link.gearPosKeys.length; i++) {
      if (link.disconnected[i] && i !== gi) continue;
      const pos = positions.get(link.gearPosKeys[i]);
      if (!pos) {
        ok = false;
        break;
      }
      if (i === gi) index = vias.length;
      vias.push({ pos, radius: link.radii[i], clockwise: link.directions[i] });
    }
    if (!ok || index < 0 || vias.length < 2) continue;

    const centre = vias[index].pos;
    const onRun = belt_pieces(
      vias.filter((_, v) => v !== index),
      link.closed,
    ).some(
      (p) =>
        p.kind === "segment" &&
        centre.distance2segment(p.from, p.to) <=
          centre.distance2line(p.from, p.to),
    );
    if (!onRun) continue;

    const piece = belt_pieces(vias, link.closed).find(
      (p) => p.kind === "arc" && p.gearIndex === index,
    );
    if (!piece || piece.kind !== "arc") continue;
    // The raw sweep lives in [0, 2π) and cannot say which side of zero it is on: a pulley the belt misses by 0.027 rad reads 6.2558, i.e. 2π − 0.027, and would be taken back wrapped the LONG way round — measured, +409 px of belt out of nowhere.
    // A pulley coming back into contact always starts from a hair of wrap, so the short side is the only readable one.
    if (piece.wrap >= Math.PI) continue;
    if (piece.length < beltContact.reattachRatio * (extent || MIN_EXTENT_M)) continue;

    // Back on the belt: its continuous state is stale by the whole detachment, so re-seed it from the raw geometry exactly as the first frame does.
    link.disconnected[gi] = false;
    if (link.wraps) link.wraps[gi] = belt_wraps(vias, link.closed)[index];
    if (link.arrivals)
      link.arrivals[gi] = belt_arrivals(vias, link.closed)[index];
    reattached = true;
  }
  return reattached;
}

/**
 * Re-bake the closed-belt junction constraints (BeltPin + BeltFollowsTangent) of belts that just lost a pulley.
 * The junction rides the loop at s = s0 + rε·(θ − θ0); s0 is an arc-length on the loop, so when a pulley disconnects the loop shrinks, s0's meaning shifts, and the junction would JUMP. Fix (mirrors how rewire_belt_mesh re-bakes the mesh θ0): re-project the junction onto the REDUCED loop for a fresh s0 and reset θ0 to the current reference angle (so s = s0 at this frame → no jump).
 * If the reference pulley itself disconnected (its θ has stopped being coupled to φ), re-elect the first still-connected pulley.
 * Called once per disconnect event; permanent for the run (reset on recompile).
 */
export function rebake_belt_pin_refs(
  links: Link[],
  belts: Extract<Link, { type: "BeltLength" }>[],
  positions: Map<string, Point2>,
  angles: Map<string, number>,
): void {
  for (const belt of belts) {
    if (belt.owner === undefined) continue;
    const disconnected = belt.disconnected;
    // Reduced loop (still-connected pulleys) + active-via → original-gear map.
    const vias: BeltVia[] = [];
    const viaToGear: number[] = [];
    for (let i = 0; i < belt.gearPosKeys.length; i++) {
      if (disconnected?.[i]) continue;
      const pos = positions.get(belt.gearPosKeys[i]);
      if (!pos) continue;
      vias.push({ pos, radius: belt.radii[i], clockwise: belt.directions[i] });
      viaToGear.push(i);
    }
    if (vias.length < 2) continue;
    const activeWraps = belt.wraps
      ? viaToGear.map((g) => belt.wraps![g] ?? 0)
      : undefined;
    for (const link of links) {
      if (
        (link.type !== "BeltPin" && link.type !== "BeltFollowsTangent") ||
        link.beltID !== belt.owner
      )
        continue;
      // Re-elect a reference if the current one just disconnected.
      if (disconnected?.[link.refIndex]) {
        const newRef = viaToGear[0];
        link.refIndex = newRef;
        link.refAngleKey = link.gearAngleKeys[newRef];
      }
      const theta = angles.get(link.refAngleKey);
      if (theta === undefined) continue;
      const J =
        link.type === "BeltPin"
          ? positions.get(link.nodeKey)
          : positions.get(link.pivotKey);
      if (!J) continue;
      // BeltPin's arc-length parametrization includes winding (wraps); BeltFollowsTangent's does not — match each constraint's own usage.
      const projWraps = link.type === "BeltPin" ? activeWraps : undefined;
      link.thetaRef0 = theta;
      link.s0 = belt_project(vias, J, true, projWraps).s;
    }
  }
}

/**
 * Put every belt's per-frame state — which pulleys it is on, and the continuous wrap and arrival angles it tracks them by — back from `snapshot`.
 *
 * Returns the belts that come back with a pulley off, whose baked topology therefore has to be looked at: `rewire_belts` for a model just compiled, the recorder's own journal for a rewind, which can put back the exact state instead of measuring a new one.
 */
export function restore_belt_state(
  model: SimulationModel,
  snapshot: KinematicSnapshot,
): Extract<Link, { type: "BeltLength" }>[] {
  const detachedBelts: Extract<Link, { type: "BeltLength" }>[] = [];
  for (const link of model.links) {
    if (link.type !== "BeltLength" || link.owner === undefined) continue;
    const detached = snapshot_belt_detached(snapshot, link.owner);
    // Unknown to this snapshot: a belt the edit has just added, which starts fresh.
    if (detached === undefined) continue;
    const dropped = new Set(detached);
    link.disconnected = link.gearPosKeys.map((_, i) => dropped.has(i));
    link.wraps = snapshot_belt_wraps(snapshot, link.owner) ?? link.wraps;
    link.arrivals =
      snapshot_belt_arrivals(snapshot, link.owner) ?? link.arrivals;
    if (dropped.size > 0) detachedBelts.push(link);
  }
  return detachedBelts;
}

/**
 * Hand each belt's disconnected mask to the junction links that ride its loop.
 *
 * `rebake_belt_pin_refs` measures `s0` as an arc-length on the REDUCED loop, so whatever reads that `s0` back has to walk the same loop.
 * Left without the mask, `BeltPin` walks the whole one and lands the junction wherever the two disagree — a violated constraint at the model's own rest state, which the mobility probe then reports as a mode.
 */
function share_belt_disconnections(
  links: Link[],
  belts: Extract<Link, { type: "BeltLength" }>[],
): void {
  const byBelt = new Map<ID, boolean[]>();
  for (const belt of belts)
    if (belt.owner !== undefined && belt.disconnected)
      byBelt.set(belt.owner, belt.disconnected);
  for (const link of links)
    if (link.type === "BeltPin" || link.type === "BeltFollowsTangent") {
      const mask = byBelt.get(link.beltID);
      if (mask) link.disconnected = mask;
    }
}

/**
 * Re-bake what a belt's topology decides — junction references and no-slip links — against the state the model currently holds.
 *
 * For a model compiled from a mechanism: the compile reads the belt's whole pulley list, so everything baked on it describes a loop the belt may have left long ago.
 * `h⁰` is measured rather than derived, so this lands on the geometry it is given and not on whatever the recording had accumulated — close, but not the same state.
 */
export function rewire_belts(
  model: SimulationModel,
  belts: Extract<Link, { type: "BeltLength" }>[],
): void {
  if (belts.length === 0) return;
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);
  share_belt_disconnections(model.links, belts);
  rebake_belt_pin_refs(model.links, belts, positions, angles);
  for (const belt of belts)
    model.links = sort_links(
      rebuild_belt_q_links(model.links, belt, positions, angles),
      model.nodes.posMasses,
    );
}

/** Position-bearing key fields are rewritten on coincidence fusion; angle key fields (angleKey…) are left untouched — angles live in a separate map. */
function rewrite_position_keys(link: Link, from: (k: string) => string): void {
  const l = link as Record<string, unknown>;
  for (const f of POSITION_KEY_FIELDS) {
    if (typeof l[f] === "string") l[f] = from(l[f] as string);
  }
  // BeltLength's wrapped-pulley centres live in an array.
  if (Array.isArray(l.gearPosKeys))
    l.gearPosKeys = (l.gearPosKeys as string[]).map(from);
}

/**
 * Compile the frozen simulation model from a mechanism (called on entering simulation).
 * Parses sim nodes + links, fuses coincidence links, sorts.
 *
 * `dynamicRigidity` (default off, see `get_links_simulation`): pass true only for a model that will actually run `step_dynamic_simulation` — kinematic mode and the mobility/redundancy analysis model want the plain anchor instead.
 */
export function compile_simulation_model(
  mechanism: Mechanism,
  dynamicRigidity: boolean = false,
  /**
   * Inject the floor's fixed anchor node, so `MinDistanceToLine` links have something to hold against.
   * Off by default: the DOF/mobility/redundancy analysis (`build_analysis_model` and everything built on it) shares this same compile, and an extra always-anchored node with no `MechanicalElement` behind it would read as a phantom zero-mobility chain — `Recorder.load()`, the only caller that actually steps a simulation, is the one that turns it on.
   */
  includeFloor: boolean = false,
): SimulationModel {
  const nodes = get_sim_nodes(mechanism.mechanicalElements);
  let links = get_links_simulation(
    mechanism.mechanicalElements,
    nodes,
    mechanism.materials,
    mechanism.profiles,
    dynamicRigidity,
  );
  const keyMap = new Map<string, string>();

  // The floor's anchor: a fixed node with no backing `MechanicalElement`, injected once (unlike the transient `GRAB_BRIDGE_KEY`) — `positions`/`posMasses` are copied forward every frame, so this persists automatically.
  // `invMass = 0` regardless of `.enabled`: the live flag gates its USE (see `collision_links`), never its presence.
  const { anchor: floorAnchor, normal: floorNormal } = floor_anchor_and_normal(
    mechanism.simulation.floor,
  );
  if (includeFloor) {
    nodes.positions.set(FLOOR_ANCHOR_KEY, floorAnchor);
    nodes.posMasses.set(FLOOR_ANCHOR_KEY, 0);
  }

  // ── Fuse coincidence links (guarantees coincident points stay together) ──
  links.forEach((lc) => {
    if (lc.type !== "Coincidence") return;
    const k1 = lc.key1;
    const k2 = lc.key2;
    const k_new = [k1, k2].join(",");

    const remap = (k: string) => (k === k1 || k === k2 ? k_new : k);
    links.forEach((link) => rewrite_position_keys(link, remap));

    const p1 = nodes.positions.get(k1);
    const p2 = nodes.positions.get(k2);
    nodes.positions.set(
      k_new,
      p1 && p2 ? p1.lerp(p2, 0.5) : (p1 ?? p2 ?? new Point2(0, 0)),
    );
    nodes.positions.delete(k1);
    nodes.positions.delete(k2);
    nodes.posMasses.set(
      k_new,
      Math.min(nodes.posMasses.get(k1) ?? 1, nodes.posMasses.get(k2) ?? 1),
    );
    nodes.posMasses.delete(k1);
    nodes.posMasses.delete(k2);

    // Record key → fused key, keys already fused among them, mapping forward.
    keyMap.set(k1, k_new);
    keyMap.set(k2, k_new);
    keyMap.forEach((v, k) => {
      if (v === k1 || v === k2) keyMap.set(k, k_new);
    });
  });
  links = links.filter((link) => link.type !== "Coincidence");

  // ── Belt no-slip, on the fused geometry and the complete link list ──
  mark_passive_belt_pins(nodes, links);
  links.push(...belt_q_links(nodes, links));

  // ── Sort links (anchored nodes first for better convergence) ──
  links = sort_links(links, nodes.posMasses);

  const gearRadii = new Map<ID, number>();
  for (const element of mechanism.mechanicalElements)
    if (element.type === "gear") gearRadii.set(element.id, element.radius);

  const dynamicMasses = compute_dynamic_mass_model(
    mechanism,
    keyMap,
    nodes.posMasses,
    new Set(
      links
        .filter((link) => link.type === "BeltPin" && link.passive)
        .map((link) => (link as Link & { type: "BeltPin" }).nodeKey),
    ),
    links,
    RECORD_DT / DYNAMIC_SUBSTEPS,
  );
  const compiledLoads = compile_loads(mechanism, keyMap);
  const compiledSpringDampers = compile_springs_dampers(mechanism, keyMap);
  const compiledMotors = compile_motors(links, mechanism.mechanicalElements);
  const compiledFrictions = compile_frictions(mechanism, keyMap);
  // The rest pose's own scale, seeded once here and kept current frame to frame after — see `SimulationModel.extent`.
  const extent = positions_extent(nodes.positions) || MIN_EXTENT_M;
  // Pairs already touching in the drawn (rest) configuration — a direct junction structural exclusion missed — are dropped for the whole run rather than fought from frame one.
  const collisionCandidates = prune_initial_penetrations(
    build_collision_candidates(mechanism, keyMap),
    nodes.positions,
    extent,
    floorNormal,
  );

  // ── Snapshot slots: one per ORIGINAL key, so a fused node writes to each of its parts ──
  const fusedKeys = [...nodes.positions.keys()];
  const snapshotKeys: string[] = [];
  const firstParts: string[] = [];
  const start = new Int32Array(fusedKeys.length + 1);
  const slotList: number[] = [];
  fusedKeys.forEach((fused, i) => {
    start[i] = slotList.length;
    const parts = fused.split(",");
    firstParts.push(parts[0]);
    for (const part of parts) {
      slotList.push(snapshotKeys.length);
      snapshotKeys.push(part);
    }
  });
  start[fusedKeys.length] = slotList.length;

  // Each belt's pulley count, fixed for the recording: a detachment raises a flag, it never shortens `gearPosKeys`.
  const belts: BeltShape[] = [];
  for (const link of links)
    if (link.type === "BeltLength" && link.owner !== undefined)
      belts.push({ id: link.owner, pulleys: link.gearPosKeys.length });

  const beamCohesionSpecs = build_beam_cohesion_specs(mechanism, links, (beamID) => {
    const beam = mechanism.mechanicalElements.find((e) => e.id === beamID);
    if (!beam || beam.type !== "beam") return 0;
    return (
      beam_linear_mass(
        beam.materialID,
        beam.profileID,
        mechanism.materials,
        mechanism.profiles,
      ) * beam.positionStart.distance_to(beam.positionEnd)
    );
  });

  return {
    nodes,
    links,
    keyMap,
    gearRadii,
    dynamicMasses,
    compiledLoads,
    compiledSpringDampers,
    compiledMotors,
    compiledFrictions,
    collisionCandidates,
    floorNormal,
    extent,
    layout: make_snapshot_layout(snapshotKeys, [...nodes.angles.keys()], belts),
    fill: {
      keys: fusedKeys,
      firstParts,
      start,
      slots: Int32Array.from(slotList),
    },
    beamCohesionSpecs,
    staticsSystem: build_statics_system(
      beamCohesionSpecs,
      mechanism.mechanicalElements.flatMap((e) =>
        e.type === "gear"
          ? [
              {
                id: e.id,
                centreKey: keyMap.get(e.id) ?? e.id,
                radius: e.radius,
                mass: gear_mass(e.surfaceMass, e.radius),
                inertia: gear_inertia(e.surfaceMass, e.radius),
              },
            ]
          : [],
      ),
      links,
      mechanism.mechanicalElements,
      (key) => (dynamicMasses.posMasses.get(key) ?? 1) <= 0,
    ),
    staticsBeams: mechanism.mechanicalElements.flatMap((e) => {
      if (e.type !== "beam") return [];
      const strength = beam_strength(
        e.materialID,
        e.profileID,
        mechanism.materials,
        mechanism.profiles,
      );
      const E = mechanism.materials.find((m) => m.id === e.materialID)?.E ?? 0;
      return [
        {
          id: e.id,
          linearMass: beam_linear_mass(
            e.materialID,
            e.profileID,
            mechanism.materials,
            mechanism.profiles,
          ),
          EA: strength ? E * strength.section.A : 0,
          EI: strength ? E * strength.section.I : 0,
        },
      ];
    }),
  };
}

/**
 * Injects a grab as extra, transient links for this frame only — a bridge node pulled toward the mouse and pinned to whatever it grabbed.
 * Mutates `positions` (the bridge node's own position has nowhere else to live) and returns `model.links` augmented with the pin, or `model.links` itself when there is no grab.
 *
 * Shared by every step function: the interaction is the same whatever produces the rest of the frame.
 * `wrapsByBelt`/`disconnectedByBelt` only matter for the belt-pin case — a caller that never tracks belt state (there is no belt to grab in the first place) passes empty maps.
 */
function grab_links(
  model: SimulationModel,
  grab: SimGrab | undefined,
  positions: Map<string, Point2>,
  wrapsByBelt: Map<ID, number[]>,
  disconnectedByBelt: Map<ID, boolean[]>,
): Link[] {
  if (grab && "edgeID" in grab) {
    // Body grab: pull a bridge node sitting at ratio t along the beam.
    const startKey =
      model.keyMap.get(`${grab.edgeID}:start`) ?? `${grab.edgeID}:start`;
    const endKey =
      model.keyMap.get(`${grab.edgeID}:end`) ?? `${grab.edgeID}:end`;
    positions.set(GRAB_BRIDGE_KEY, new Point2(grab.target.x, grab.target.y));
    return [
      ...model.links,
      {
        type: "FixedOnSegment",
        ddl: 2,
        key1: startKey,
        key2: endKey,
        key3: GRAB_BRIDGE_KEY,
        t: grab.t,
      },
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: GRAB_BRIDGE_KEY,
        value: grab.target,
      },
    ];
  } else if (grab && "gearID" in grab) {
    // Gear-tooth grab: pin a bridge node on the perimeter (fixed angle offset) and pull it to the mouse — the GearPerimeterPin rotates the gear angle.
    positions.set(GRAB_PERIMETER_KEY, new Point2(grab.target.x, grab.target.y));
    return [
      ...model.links,
      {
        type: "GearPerimeterPin",
        ddl: 2,
        nodeKey: GRAB_PERIMETER_KEY,
        centerKey: model.keyMap.get(grab.gearID) ?? grab.gearID,
        angleKey: grab.gearID,
        radius: grab.radius,
        offset: grab.angleOffset,
      },
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: "grab_perimeter",
        value: grab.target,
      },
    ];
  } else if (grab && "beltPin" in grab) {
    // Grab an arbitrary point of a closed belt: place a bridge node at the mouse, pin it to the loop at the grabbed arc-length (BeltPin), and pull it there — the pin advances the belt travel so the loop rotates with the point under the cursor. gearPosKeys were built unfused (grab start) → remap to the fused sim keys; refresh the per-frame wraps/disconnected from the belt.
    const src = grab.beltPin;
    const remap = (k: string) => model.keyMap.get(k) ?? k;
    const pin: Extract<Link, { type: "BeltPin" }> = {
      ...src,
      gearPosKeys: src.gearPosKeys.map(remap),
      startKey: src.startKey ? remap(src.startKey) : undefined,
      endKey: src.endKey ? remap(src.endKey) : undefined,
      wraps: wrapsByBelt.get(src.beltID),
      disconnected: disconnectedByBelt.get(src.beltID),
    };
    positions.set(pin.nodeKey, new Point2(grab.target.x, grab.target.y));
    return [
      ...model.links,
      pin,
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: pin.nodeKey,
        value: grab.target,
      },
    ];
  } else if (grab) {
    // A belt terminal that is dragged into its adjacent gear is pushed back out by the BeltLength constraint's radial non-penetration term (symmetric: it moves the gear too) — no pre-clamp of the grab target needed.
    const grabKey = model.keyMap.get(grab.key) ?? grab.key;
    return [
      ...model.links,
      { type: "HandleGrab", ddl: 1, grabbedKey: grabKey, value: grab.target },
    ];
  }
  return model.links;
}

/**
 * Advance the simulation by one frame.
 *
 * Warm-starts from the previous positions/angles, refreshes the motor targets (target = current real angle + ω·dt — no backlog when blocked) and the continuous line-of-centres angle of gear meshes, then runs PBD on the frozen links.
 * The model's motor/mesh links are updated in place (they are simulation state, not pure values).
 */
export function step_simulation(
  model: SimulationModel,
  t: number,
  /**
   * The frame to warm-start from.
   * Read by key, so it may come from another model — which is what it is after an edit, the snapshot the recording resumes on.
   */
  prev: KinematicSnapshot | null,
  dt: number = RECORD_DT,
  grab?: SimGrab,
  sweeps: number = SIMULATION_SWEEPS,
  /** Off only to measure what the collection itself costs; production reads it. */
  collectDiagnostics: boolean = true,
  /** Called with the model state a belt topology change is about to overwrite, so a caller that may rewind can keep it.
   * Only ever called on the frames that change it. */
  onRewire?: (state: RewireState) => void,
  /** Re-read every frame, like gravity in dynamic mode — no recompile needed to toggle it. */
  collisionsOn: boolean = false,
  /** Same reasoning as `collisionsOn`, gated independently — see `collision_links`. */
  floorOn: boolean = false,
): KinematicSnapshot {
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);

  // ── Warm start (fused keys take the previous position of any of their parts) ──
  if (prev) {
    const { keys: fusedKeys, firstParts } = model.fill;
    const index = prev.layout.index;
    for (let i = 0; i < fusedKeys.length; i++) {
      const slot = index.get(firstParts[i]) ?? index.get(fusedKeys[i]);
      if (slot === undefined) continue;
      const x = prev.positions[2 * slot];
      if (Number.isNaN(x)) continue;
      positions.set(fusedKeys[i], new Point2(x, prev.positions[2 * slot + 1]));
    }
    const angleIndex = prev.layout.angleIndex;
    angles.forEach((_, key) => {
      const slot = angleIndex.get(key);
      if (slot === undefined) return;
      const a = prev.angles[slot];
      if (!Number.isNaN(a)) angles.set(key, a);
    });
  }

  // ── Refresh per-frame motor targets and gear-mesh line-of-centres angle ──
  const motorChecks: MotorCheck[] = [];
  const beltsToRewire: Extract<Link, { type: "BeltLength" }>[] = [];
  const ramp = motor_ramp(t);
  model.links.forEach((link) => {
    if (link.type === "MotorBeam") {
      const pivot = positions.get(link.pivotKey);
      const driven = positions.get(link.drivenKey);
      if (pivot && driven) {
        const cur = driven.sub(pivot).angle();
        // A beam-anchored motor also owes the anchor's own motion this frame, folded in as a one-frame delta on top of `driven`'s ACTUAL current angle — never an independent, ever-advancing target.
        // That keeps it exactly as soft as a grounded motor: it never commands more than one frame's worth of motion ahead of reality, so a blocked/ over-constrained mechanism stalls the motor first rather than forcing through it.
        let anchorDelta = 0;
        if (link.anchorKey !== undefined && link.anchorAngle !== undefined) {
          const anchor = positions.get(link.anchorKey);
          if (anchor) {
            const anchorNow = anchor.sub(pivot).angle();
            anchorDelta = wrap_angle(anchorNow - link.anchorAngle);
            link.anchorAngle = anchorNow;
          }
        }
        const expected = anchorDelta + link.omega * ramp * dt;
        link.targetAngle = cur + expected;
        if (link.owner !== undefined && expected !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorBeam",
            cur,
            expected,
            pivotKey: link.pivotKey,
            drivenKey: link.drivenKey,
          });
      }
    } else if (link.type === "MotorAngle") {
      const cur = angles.get(link.angleKey);
      if (cur !== undefined) {
        // Same anchor-delta idea as `MotorBeam` above, but the reference beam has no angle node: its orientation comes from its two position keys instead.
        let anchorDelta = 0;
        if (
          link.anchorPivotKey !== undefined &&
          link.anchorKey !== undefined &&
          link.anchorAngle !== undefined
        ) {
          const anchorPivot = positions.get(link.anchorPivotKey);
          const anchor = positions.get(link.anchorKey);
          if (anchorPivot && anchor) {
            const anchorNow = anchor.sub(anchorPivot).angle();
            anchorDelta = wrap_angle(anchorNow - link.anchorAngle);
            link.anchorAngle = anchorNow;
          }
        }
        const expected = anchorDelta + link.omega * ramp * dt;
        link.targetAngle = cur + expected;
        if (link.owner !== undefined && expected !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorAngle",
            cur,
            expected,
            angleKey: link.angleKey,
          });
      }
    } else if (link.type === "GearMeshAngle") {
      const p1 = positions.get(link.posKey1);
      const p2 = positions.get(link.posKey2);
      if (p1 && p2) {
        const raw = p2.sub(p1).angle();
        link.alpha = link.alpha + wrap_angle(raw - link.alpha);
      }
    } else if (link.type === "BeltLength") {
      if (update_belt_disconnects(link, positions, model.extent))
        beltsToRewire.push(link);
    }
  });

  // A pulley just left the belt, or came back onto it → re-bake the closed-belt junction refs onto the new loop (its arc-length origin has shifted, and it would otherwise JUMP), then rebuild the belt's no-slip links against the new topology.
  // Both mutate the model, and both are reset on recompile.
  if (beltsToRewire.length > 0) {
    onRewire?.(capture_rewire_state(model));
    rebake_belt_pin_refs(model.links, beltsToRewire, positions, angles);
    // Drop the belt's no-slip links for THIS frame: they describe the belt as it was, so letting them pull against the new topology spoils the very state the rebuild is about to bake against.
    // The frame runs on `BeltLength` alone and the links come back at the end of it — measured, that is what makes the transition frame come out with no violated constraint at all instead of three stuck at 1.3 px forever.
    if (beltContact.rebuildQLinks) {
      const owners = new Set(beltsToRewire.map((b) => b.owner));
      model.links = model.links.filter(
        (l) =>
          !(
            (l.type === "BeltSegmentNoSlip" ||
              l.type === "BeltSubChainAggregate" ||
              l.type === "BeltLoopClosure") &&
            owners.has(l.owner)
          ),
      );
    }
  }

  // Share each belt's sim state — continuous wraps (so a wound pulley >2π is traversed smoothly, not just its fractional arc) and the disconnected mask (so the junction rides the same reduced loop the belt is drawn on) — from its BeltLength link with its BeltPin + BeltFollowsTangent links. gearPosKeys order matches (all built from the belt).
  const wrapsByBelt = new Map<ID, number[]>();
  const arrivalsByBelt = new Map<ID, number[]>();
  const disconnectedByBelt = new Map<ID, boolean[]>();
  for (const link of model.links)
    if (link.type === "BeltLength" && link.owner !== undefined) {
      if (link.wraps) wrapsByBelt.set(link.owner, link.wraps);
      if (link.arrivals) arrivalsByBelt.set(link.owner, link.arrivals);
      if (link.disconnected)
        disconnectedByBelt.set(link.owner, link.disconnected);
    }
  for (const link of model.links) {
    if (link.type === "BeltPin") {
      link.wraps = wrapsByBelt.get(link.beltID);
      link.disconnected = disconnectedByBelt.get(link.beltID);
    } else if (link.type === "BeltFollowsTangent") {
      link.disconnected = disconnectedByBelt.get(link.beltID);
    }
  }

  // ── Grab (transient, this frame only) ──
  const grabbed = grab_links(model, grab, positions, wrapsByBelt, disconnectedByBelt);
  // `grabbed` may alias `model.links` itself (no grab this frame) — spread rather than push, so a collision link never leaks into the frozen model's own list.
  const links =
    collisionsOn || floorOn
      ? [
          ...grabbed,
          ...collision_links(
            model.collisionCandidates,
            positions,
            model.extent,
            collisionsOn,
            floorOn,
            model.floorNormal,
          ),
        ]
      : grabbed;

  // ── PBD solve ──
  const result = PBD_kinematic_solver(
    positions,
    new Map<string, number>(),
    model.nodes.posMasses,
    new Map<string, number>(),
    links,
    sweeps,
    undefined,
    angles,
    collectDiagnostics,
  );
  model.extent = result.extent;

  // ── Belt topology changed this frame → rebuild its no-slip links, AFTER the solve ──
  // The bake has to happen on a state the other constraints agree with.
  // Baking on the warm start, before the solve, freezes into `h⁰` whatever the frame was about to correct: measured on `Déconnexion courroie`, a 26 px lurch on the transition frame and 1.3 px of residual that never went away afterwards.
  if (beltsToRewire.length > 0 && beltContact.rebuildQLinks) {
    for (const belt of beltsToRewire)
      model.links = sort_links(
        rebuild_belt_q_links(
          model.links,
          belt,
          result.positions,
          result.angles,
        ),
        model.nodes.posMasses,
      );
  }

  // ── Into the snapshot's slots, fused keys decoupled back to one slot per original key ──
  const layout = model.layout;
  const { keys: fusedKeys, start, slots } = model.fill;
  const outPositions = new Float64Array(layout.keys.length * 2);
  for (let i = 0; i < fusedKeys.length; i++) {
    const p = result.positions.get(fusedKeys[i]);
    const x = p ? p.x : NaN;
    const y = p ? p.y : NaN;
    for (let s = start[i]; s < start[i + 1]; s++) {
      outPositions[2 * slots[s]] = x;
      outPositions[2 * slots[s] + 1] = y;
    }
  }
  // The reserved grab slots: only the bridge node this frame's own grab added, if any.
  for (const key of GRAB_KEYS) {
    const slot = layout.index.get(key)!;
    const p = result.positions.get(key);
    outPositions[2 * slot] = p ? p.x : NaN;
    outPositions[2 * slot + 1] = p ? p.y : NaN;
  }

  const outAngles = new Float64Array(angles_length(layout));
  for (let i = 0; i < layout.angleKeys.length; i++) {
    const a = result.angles.get(layout.angleKeys[i]);
    outAngles[i] = a === undefined ? NaN : a;
  }
  // Then each belt's per-pulley wrap angles, the pulleys it has lost contact with, and the arrival rim angles.
  // Together they are the belt's whole per-frame state, which is what lets a recording be resumed on any recorded instant.
  layout.belts.forEach((id, r) => {
    const wraps = wrapsByBelt.get(id);
    const arrivals = arrivalsByBelt.get(id);
    const disconnected = disconnectedByBelt.get(id);
    for (let p = layout.beltStart[r]; p < layout.beltStart[r + 1]; p++) {
      const k = p - layout.beltStart[r];
      outAngles[layout.wrapBase + p] = wraps ? wraps[k] : NaN;
      outAngles[layout.detachBase + p] = disconnected?.[k] ? 1 : 0;
      outAngles[layout.arrivalBase + p] = arrivals ? arrivals[k] : NaN;
    }
  });

  // ── Motor-block detection ──
  // The motor's own constraint residual stays tiny when blocked (target = current + ω·dt, no backlog), so a generic residual threshold misses it.
  // Instead compare what the driver actually advanced this frame against its commanded increment: well below it ⇒ blocked.
  const motorBlocks: ConstraintResidual[] = [];
  for (const m of motorChecks) {
    let achieved: number | undefined;
    // How far the driver reaches, so its shortfall can be reported as the arc it failed to sweep rather than as a bare angle — the same scale every other residual is on.
    let lever = 1;
    if (m.type === "MotorBeam") {
      const p = result.positions.get(m.pivotKey!);
      const d = result.positions.get(m.drivenKey!);
      if (p && d) {
        achieved = wrap_angle(d.sub(p).angle() - m.cur);
        lever = d.distance_to(p);
      }
    } else {
      const a = result.angles.get(m.angleKey!);
      if (a !== undefined) {
        achieved = wrap_angle(a - m.cur);
        lever = model.gearRadii.get(m.angleKey as ID) ?? 1;
      }
    }
    if (achieved === undefined) continue;
    if (Math.abs(achieved) < Math.abs(m.expected) * MOTOR_BLOCK_FRACTION)
      motorBlocks.push({
        owner: m.owner,
        type: m.type,
        residual: Math.abs(m.expected - achieved) * lever,
      });
  }

  const unsatisfied = [...motorBlocks, ...(result.unsatisfied ?? [])];

  return {
    t,
    layout,
    positions: outPositions,
    angles: outAngles,
    unsatisfied: unsatisfied.length > 0 ? unsatisfied : undefined,
  };
}

/**
 * CEILING on the Gauss-Seidel sweeps a dynamic SUBSTEP may run — not a fixed count: dynamics now exits early on the same converged-residual/decayed-motion criteria `PBD_solve` already uses for edition and kinematic simulation, so a substep almost always stops well short of this.
 * What the ceiling has to cover is the substep that DOESN'T converge quickly — a heavy mass hinged onto a comparatively massless member (an extreme mass ratio slows Gauss-Seidel's own convergence rate, regardless of how small the substep's predicted displacement is) — so it is sized like `SIMULATION_SWEEPS`, the same ceiling kinematic mode already trusts for its own worst case, rather than the far smaller budget a well-behaved substep would need on its own.
 */
const DYNAMIC_SWEEPS = 200;

/**
 * Physical substeps per recorded frame — see docs/plan-efforts-interieurs.md's reaction-leak finding.
 * `PBD_kinematic_solver` reads a link's reaction off the impulse accumulated across one call's whole Gauss-Seidel sweep; that reading is only axial (for a pure `Distance` link) to first order in how far the predict step displaced a point relative to that link's own length — correct once the displacement is small, measurably NOT once it isn't (a short, light member under a comparatively large load can move a non-negligible fraction of its own length in one predict step).
 * More sweeps of the SAME single step never closes this — the position converges either way, only the reaction reading does not — but a smaller `dt` does, proportionally to its square, because it shrinks the predict displacement itself.
 *
 * 16 closes a deliberately adversarial 2-bar repro (short members, no self-weight, a load large enough to move the joint ~5% of a member's length per step) from a ~7% spurious shear/bending reading down to numerical noise, and brings a real multi-member mechanism (`Treillis.slidep`) within ~10% of the value 128 substeps converges to — 32 gets closer still, but the jump from 32 to 128 barely moves it further, so 32 is already near the true fixed point; 16 trades a bit of that last stretch for half the cost.
 * `DYNAMIC_SWEEPS` is left unchanged (not divided down) on purpose: shrinking it to hold the total sweep budget roughly constant looked promising in the same measurement, but every OTHER scenario this solver handles (collisions, longer chains, more DOF) needs its own convergence check before that trade is safe to make — a follow-up, not this one.
 *
 * Position/velocity carry over between substeps like any other warm start; only the LAST substep's reactions and `unsatisfied` diagnostics are kept, since earlier ones read an intermediate, not-yet-converged state.
 */
const DYNAMIC_SUBSTEPS = 16;

/**
 * Advance a DYNAMIC-mode frame: gravity (today; any other force joins later) integrated in the predict step, XPBD velocity read back from the whole displacement, everything else the same rigid-constraint sweep `step_simulation` runs — split into `substeps` physical substeps (see `DYNAMIC_SUBSTEPS`), each running the full body below in turn.
 *
 * Deliberately narrower than `step_simulation` for now: no motor-target refresh — a motor's `targetAngle` stays wherever the model was compiled with, the plan's step 5 ("imposed torque versus imposed position") is what decides how a motor belongs in a force-driven step in the first place.
 * Everything else `step_simulation` does once per frame before its own solve — gear-mesh angle unwrap, belt disconnect/reattach tracking, junction re-baking, belt state sharing — runs here too, but once per SUBSTEP rather than once per frame: both the unwrapped `GearMeshAngle.alpha` and the belt's tracked wrap feed a constraint that runs every sweep of the solve about to happen, and holding either at its value from the START of the frame across all `DYNAMIC_SUBSTEPS` substeps measurably reintroduces the very listing-order sensitivity this bookkeeping exists to remove — negligible for a slow kinematic frame, enough to blow up a chaotic pendulum train within 60 frames of free fall (see `docs/courroie-dynamique.md`).
 * Only the no-slip links' REBUILD (after a disconnect/reattach) is deferred to once, after the last substep, against the state the frame's own solve agrees with — same reasoning as `step_simulation`'s own post-solve rebuild.
 * Grab is kept: it is core interaction, not a load, and costs nothing extra to support (`grab_links` is shared with `step_simulation`).
 */
export function step_dynamic_simulation(
  model: SimulationModel,
  t: number,
  /** The frame to warm-start from — position, angle AND velocity. */
  prev: DynamicSnapshot | null,
  dt: number = RECORD_DT,
  /** World-space acceleration applied every frame — `Point2(0, 0)` for gravity off. */
  gravity: Point2,
  grab?: SimGrab,
  sweeps: number = DYNAMIC_SWEEPS,
  collectDiagnostics: boolean = true,
  /** Re-read every frame, like `gravity` above — no recompile needed to toggle it. */
  collisionsOn: boolean = false,
  /** Same reasoning as `collisionsOn`, gated independently — see `collision_links`. */
  floorOn: boolean = false,
  /**
   * See `DYNAMIC_SUBSTEPS`.
   * Exposed for tests that need to isolate its effect.
   */
  substeps: number = DYNAMIC_SUBSTEPS,
): DynamicSnapshot {
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);
  const velocities = new Map<string, Point2>();
  const angleVelocities = new Map<string, number>();

  // ── Warm start (position/angle as `step_simulation`; velocity the same way) ──
  if (prev) {
    const { keys: fusedKeys, firstParts } = model.fill;
    const index = prev.layout.index;
    for (let i = 0; i < fusedKeys.length; i++) {
      const slot = index.get(firstParts[i]) ?? index.get(fusedKeys[i]);
      if (slot === undefined) continue;
      const x = prev.positions[2 * slot];
      if (!Number.isNaN(x))
        positions.set(fusedKeys[i], new Point2(x, prev.positions[2 * slot + 1]));
      const vx = prev.velocities[2 * slot];
      if (!Number.isNaN(vx))
        velocities.set(fusedKeys[i], new Point2(vx, prev.velocities[2 * slot + 1]));
    }
    const angleIndex = prev.layout.angleIndex;
    angles.forEach((_, key) => {
      const slot = angleIndex.get(key);
      if (slot === undefined) return;
      const a = prev.angles[slot];
      if (!Number.isNaN(a)) angles.set(key, a);
      const va = prev.angleVelocities[slot];
      if (!Number.isNaN(va)) angleVelocities.set(key, va);
    });
  }

  // Belts a disconnect/reattach touched this frame, across every substep it happened in — their no-slip links are rebuilt once, after the LAST substep (see below).
  const beltsToRewire = new Set<Extract<Link, { type: "BeltLength" }>>();
  const wrapsByBelt = new Map<ID, number[]>();
  const arrivalsByBelt = new Map<ID, number[]>();
  const disconnectedByBelt = new Map<ID, boolean[]>();

  // Whole-frame d'Alembert acceleration (phase 2) reads the velocity change across ALL substeps, never one alone — captured once, before the first, against `dt` (not `subDt`) below.
  const velocitiesBeforeSolve = new Map(velocities);
  // What an anchored node has to restate as a force to reach the reaction fallback below — its OWN weight, the beams' and gears' endpoint shares taken back out.
  // Those shares are the solver's way of carrying a body's mass, not the node's: the body reports its whole `μL` through its own torsor (`statics-frame.ts`'s `nodeMassAt` draws the same line), so restating them here would have the ground hold a beam's end twice.
  const groundedWeights = new Map<string, Point2>();
  {
    const lumps = new Map<string, number>();
    for (const spec of model.beamCohesionSpecs)
      for (const key of [spec.k0, spec.k1])
        lumps.set(key, (lumps.get(key) ?? 0) + spec.mass * BEAM_END_MASS_FRACTION);
    for (const gear of model.staticsSystem.gears)
      lumps.set(gear.centreKey, (lumps.get(gear.centreKey) ?? 0) + gear.mass);
    for (const [key, mass] of model.dynamicMasses.groundedMasses) {
      const own = Math.max(0, mass - (lumps.get(key) ?? 0));
      if (own > 0) groundedWeights.set(key, gravity.mul(own));
    }
  }
  const angleVelocitiesBeforeSolve = new Map(angleVelocities);
  const subDt = dt / substeps;
  let reactions: LinkReaction[] | undefined;
  let motorPower: MotorPowerSample[] = [];
  let result: SolverMaps | undefined;

  for (let sub = 0; sub < substeps; sub++) {
    const isLastSubstep = sub === substeps - 1;

    // ── Gear-mesh angle unwrap + belt-contact bookkeeping — EVERY substep, not once per
    // frame.
    // Both feed `applyGearMeshAngleConstraint`/`applyBeltLengthConstraint` on every sweep of the solve about to run; measured directly (`docs/courroie-dynamique.md`): measuring them once at frame start and holding that hint stale across all `DYNAMIC_SUBSTEPS` substeps injects a small, listing-order-dependent bias into the belt-length constraint whenever the mechanism moves fast within the frame (free fall, not a slow motor-driven kinematic step) — negligible on its own, but enough for a chaotic pendulum train to blow up within 60 frames.
    // The disconnect/reattach EVENT itself stays rare regardless of how often it is tested for, so testing it this often costs nothing beyond the same trig `step_simulation` already pays once per (unsubstepped) frame, `substeps` times over.
    model.links.forEach((link) => {
      if (link.type === "GearMeshAngle") {
        const p1 = positions.get(link.posKey1);
        const p2 = positions.get(link.posKey2);
        if (p1 && p2) {
          const raw = p2.sub(p1).angle();
          link.alpha = link.alpha + wrap_angle(raw - link.alpha);
        }
      } else if (link.type === "BeltLength") {
        if (update_belt_disconnects(link, positions, model.extent))
          beltsToRewire.add(link);
      }
    });

    // A pulley just left the belt, or came back onto it → re-bake the closed-belt junction refs onto the new loop, then drop the belt's no-slip links for the rest of the frame (rebuilt after the last substep, against the state the frame's own solve agrees with — see the matching comment in `step_simulation`).
    // Re-baking again on a later substep that flips the SAME belt again is harmless: it re-elects/re-projects onto whatever the loop looks like now, which is exactly what a fresh flip needs anyway.
    if (beltsToRewire.size > 0) {
      const rewiring = [...beltsToRewire];
      rebake_belt_pin_refs(model.links, rewiring, positions, angles);
      if (beltContact.rebuildQLinks) {
        const owners = new Set(rewiring.map((b) => b.owner));
        model.links = model.links.filter(
          (l) =>
            !(
              (l.type === "BeltSegmentNoSlip" ||
                l.type === "BeltSubChainAggregate" ||
                l.type === "BeltLoopClosure") &&
              owners.has(l.owner)
            ),
        );
      }
    }

    // Share each belt's sim state (continuous wraps + disconnected mask) with its junction links, same as `step_simulation` — see that block's comment for why the mask is needed.
    // `arrivalsByBelt` is not shared to any link (no junction reads it mid-solve), only kept for the snapshot written at the end of the frame.
    wrapsByBelt.clear();
    arrivalsByBelt.clear();
    disconnectedByBelt.clear();
    for (const link of model.links)
      if (link.type === "BeltLength" && link.owner !== undefined) {
        if (link.wraps) wrapsByBelt.set(link.owner, link.wraps);
        if (link.arrivals) arrivalsByBelt.set(link.owner, link.arrivals);
        if (link.disconnected) disconnectedByBelt.set(link.owner, link.disconnected);
      }
    for (const link of model.links) {
      if (link.type === "BeltPin") {
        link.wraps = wrapsByBelt.get(link.beltID);
        link.disconnected = disconnectedByBelt.get(link.beltID);
      } else if (link.type === "BeltFollowsTangent") {
        link.disconnected = disconnectedByBelt.get(link.beltID);
      }
    }

    // ── Beam midpoints (dynamics-only, every substep) ── a virtual mass, not a real
    // element: pinned onto the live segment so the beam's own rotational inertia comes out right — see `DynamicMassModel.beamMidpoints`.
    // Position is recomputed from THIS substep's start/end regardless of any warm start, since it is fully determined by them (`t = 0.5`, never a free DOF) — but velocity DOES need seeding: left at 0, the predict step leaves the midpoint sitting at last substep's spot while `start`/`end` predict onward under their own warm-started velocity, so `FixedOnSegment` spends the whole sweep dragging it back into place — pulling `end` backwards right along with it, since the projection corrects both ends of a violated constraint.
    // Seeding it at the segment's own linear interpolation of `start`/`end`'s velocity — exactly what a rigid rod's midpoint velocity actually is — starts the constraint already near-satisfied, so nothing gets eaten.
    const midLinks: Link[] = [];
    for (const { midKey, startKey, endKey } of model.dynamicMasses.beamMidpoints) {
      const s = positions.get(startKey);
      const e = positions.get(endKey);
      if (!s || !e) continue;
      positions.set(midKey, s.lerp(e, 0.5));
      const vs = velocities.get(startKey) ?? ZERO;
      const ve = velocities.get(endKey) ?? ZERO;
      velocities.set(midKey, vs.lerp(ve, 0.5));
      midLinks.push({
        type: "FixedOnSegment",
        ddl: 2,
        key1: startKey,
        key2: endKey,
        key3: midKey,
        t: 0.5,
      });
    }

    // ── Grab (transient, this substep only) ── belt maps refreshed just above, this
    // substep.
    // The kinematic `Spring`/`MotorBeam`/`MotorAngle` links are dropped here: dynamic mode pulls them out of the sweep and applies real forces/torques below instead (see `spring-damper-model.ts`, `motor-model.ts`) — left in, they would double up, once as a soft position constraint and once as an actual force.
    const links: Link[] = grab_links(
      model,
      grab,
      positions,
      wrapsByBelt,
      disconnectedByBelt,
    ).filter(
      (link) =>
        link.type !== "Spring" &&
        link.type !== "MotorBeam" &&
        link.type !== "MotorAngle",
    );
    links.push(...midLinks);
    if (collisionsOn || floorOn)
      links.push(
        ...collision_links(
          model.collisionCandidates,
          positions,
          model.extent,
          collisionsOn,
          floorOn,
          model.floorNormal,
        ),
      );

    // ── User loads, spring/damper and motor forces, resolved against THIS substep's live
    // positions and pre-predict velocities — all three follow the mechanism as it moves. ──
    const { forces, torques } = resolve_load_forces(model.compiledLoads, positions);
    const merge_forces = (extra: Map<string, Point2>) => {
      for (const [key, f] of extra) forces.set(key, (forces.get(key) ?? ZERO).add(f));
    };
    merge_forces(resolve_spring_damper_forces(model.compiledSpringDampers, positions, velocities));
    const motorContribution = resolve_motor_torques(
      model.compiledMotors,
      subDt,
      positions,
      velocities,
      angleVelocities,
      model.dynamicMasses.posMasses,
      model.dynamicMasses.angleMasses,
    );
    merge_forces(motorContribution.forces);
    for (const [key, t] of motorContribution.torques)
      torques.set(key, (torques.get(key) ?? 0) + t);
    const frictionContribution = resolve_friction_forces(
      model.compiledFrictions,
      subDt,
      positions,
      velocities,
      angleVelocities,
      model.dynamicMasses.posMasses,
      model.dynamicMasses.angleMasses,
    );
    merge_forces(frictionContribution.forces);
    for (const [key, t] of frictionContribution.torques)
      torques.set(key, (torques.get(key) ?? 0) + t);
    // Cheap (one entry per motor) unlike `reactions`, so kept on every substep rather than gated behind `collectDiagnostics` — the last substep's values are what the frame ends on.
    motorPower = motorContribution.power;

    // An anchored node never feels the predict step's acceleration (it cannot move regardless of `gx/gy` — see `PBD_kinematic_solver`), so its own weight has to be restated as an ordinary force to reach the anchored-dof reaction fallback — see `groundedWeights` above for what "its own" leaves out.
    // A free node needs none of this: its weight already comes out mass-independent, exactly like real gravity.
    merge_forces(groundedWeights);

    // ── XPBD solve ── `velocities`/`angleVelocities` are mutated in place with the
    // result.
    // Snapshot the incoming velocity first: restitution below needs both what the substep started with and what the plain (inelastic) solve produced, to know how much bounce to add back.
    const subVelocitiesBeforeSolve = new Map(velocities);
    // Diagnostics (reactions, unsatisfied) only collected on the LAST substep — an earlier one reads an intermediate, not-yet-converged state (see `DYNAMIC_SUBSTEPS`), and collecting them costs a per-link bookkeeping step across the whole sweep a caller measuring pure solver performance skips.
    const stepReactions: LinkReaction[] | undefined =
      isLastSubstep && collectDiagnostics ? [] : undefined;
    const dynamics: DynamicsInput = {
      dt: subDt,
      gx: gravity.x,
      gy: gravity.y,
      velocities,
      angleVelocities,
      forces,
      torques,
      angleMasses: model.dynamicMasses.angleMasses,
      reactions: stepReactions,
    };
    result = PBD_kinematic_solver(
      positions,
      new Map<string, number>(),
      model.dynamicMasses.posMasses,
      new Map<string, number>(),
      links,
      sweeps,
      undefined,
      angles,
      isLastSubstep && collectDiagnostics,
      // A dynamics step exits on the same residual as any other: `sweeps` is its ceiling, not its count.
      "motion",
      0,
      dynamics,
    );
    model.extent = result.extent;
    reactions = stepReactions;

    // ── Restitution: bounce whatever collision constraints actually resolved this
    // substep, instead of leaving them at the plain solve's inelastic (velocity ≈ 0) response.
    // Reads THIS substep's freshly solved extent, unlike `collision_links` above (which needed an estimate before the solve had run) — already the accurate answer,
    // so no lag to spend. ──
    if (collisionsOn || floorOn)
      apply_collision_restitution(
        model.collisionCandidates,
        result.positions,
        model.dynamicMasses.posMasses,
        subVelocitiesBeforeSolve,
        velocities,
        DEFAULT.RESTITUTION,
        result.extent,
        collisionsOn,
        floorOn,
        model.floorNormal,
      );
  }

  // `substeps` is always >= 1, so the loop above ran at least once.
  const finalResult = result!;

  // ── Belt topology changed this frame → rebuild its no-slip links, AFTER every substep has
  // run — same reasoning as `step_simulation`: baking against the warm start instead would freeze in whatever the frame's own solve was about to correct.
  if (beltsToRewire.size > 0 && beltContact.rebuildQLinks) {
    for (const belt of beltsToRewire)
      model.links = sort_links(
        rebuild_belt_q_links(
          model.links,
          belt,
          finalResult.positions,
          finalResult.angles,
        ),
        model.dynamicMasses.posMasses,
      );
  }

  const energy = compute_energy_sample(
    model,
    finalResult.positions,
    velocities,
    angleVelocities,
    gravity,
  );

  // ── Into the snapshot's slots, fused keys decoupled back to one slot per original key ──
  const layout = model.layout;
  const { keys: fusedKeys, start, slots } = model.fill;
  const outPositions = new Float64Array(layout.keys.length * 2);
  const outVelocities = new Float64Array(layout.keys.length * 2);
  const outAccelerations = new Float64Array(layout.keys.length * 2);
  for (let i = 0; i < fusedKeys.length; i++) {
    const p = finalResult.positions.get(fusedKeys[i]);
    const v = velocities.get(fusedKeys[i]);
    const x = p ? p.x : NaN;
    const y = p ? p.y : NaN;
    const vx = v ? v.x : NaN;
    const vy = v ? v.y : NaN;
    // For d'Alembert (see docs/plan-efforts-interieurs.md phase 2): the frame's whole velocity change, straight from the two maps the solve itself produced — never a finite difference across recorded (decimated, interpolated) snapshots.
    // Missing on either side reads as 0 (at rest), not NaN: an anchored dof simply never gets a `velocities` entry, and a dof with no prior frame to warm-start from started at rest.
    const vBefore = velocitiesBeforeSolve.get(fusedKeys[i]) ?? ZERO;
    const vAfter = velocities.get(fusedKeys[i]) ?? ZERO;
    // `dt = 0` is the re-projection step (see `Recorder.advance`'s first instant): no time elapsed to divide by, and both velocities are 0 there regardless.
    const ax = dt > 0 ? (vAfter.x - vBefore.x) / dt : 0;
    const ay = dt > 0 ? (vAfter.y - vBefore.y) / dt : 0;
    for (let s = start[i]; s < start[i + 1]; s++) {
      outPositions[2 * slots[s]] = x;
      outPositions[2 * slots[s] + 1] = y;
      outVelocities[2 * slots[s]] = vx;
      outVelocities[2 * slots[s] + 1] = vy;
      outAccelerations[2 * slots[s]] = ax;
      outAccelerations[2 * slots[s] + 1] = ay;
    }
  }
  // The reserved grab slots: only the bridge node this frame's own grab added, if any — and never a velocity, since a grab bridge does not exist across frames to warm-start one.
  for (const key of GRAB_KEYS) {
    const slot = layout.index.get(key)!;
    const p = finalResult.positions.get(key);
    outPositions[2 * slot] = p ? p.x : NaN;
    outPositions[2 * slot + 1] = p ? p.y : NaN;
    outVelocities[2 * slot] = NaN;
    outVelocities[2 * slot + 1] = NaN;
    outAccelerations[2 * slot] = NaN;
    outAccelerations[2 * slot + 1] = NaN;
  }

  const outAngles = new Float64Array(angles_length(layout));
  const outAngleVelocities = new Float64Array(layout.angleKeys.length);
  const outAngleAccelerations = new Float64Array(layout.angleKeys.length);
  for (let i = 0; i < layout.angleKeys.length; i++) {
    const key = layout.angleKeys[i];
    const a = finalResult.angles.get(key);
    outAngles[i] = a === undefined ? NaN : a;
    const v = angleVelocities.get(key);
    outAngleVelocities[i] = v === undefined ? NaN : v;
    outAngleAccelerations[i] =
      dt > 0 ? ((v ?? 0) - (angleVelocitiesBeforeSolve.get(key) ?? 0)) / dt : 0;
  }
  // Then each belt's per-pulley wrap/detach/arrival block, exactly as `step_simulation` writes it — the last substep's `wrapsByBelt`/`arrivalsByBelt`/`disconnectedByBelt` are this frame's converged belt state, kept up to date every substep above.
  layout.belts.forEach((id, r) => {
    const wraps = wrapsByBelt.get(id);
    const arrivals = arrivalsByBelt.get(id);
    const disconnected = disconnectedByBelt.get(id);
    for (let p = layout.beltStart[r]; p < layout.beltStart[r + 1]; p++) {
      const k = p - layout.beltStart[r];
      outAngles[layout.wrapBase + p] = wraps ? wraps[k] : NaN;
      outAngles[layout.detachBase + p] = disconnected?.[k] ? 1 : 0;
      outAngles[layout.arrivalBase + p] = arrivals ? arrivals[k] : NaN;
    }
  });

  // Loads resolved once more against the CONVERGED positions — the balance reads the state the frame ended on, not the one each substep started from.
  // Only the point forces matter here: a beam carrying a distributed load is not balanced (see `BeamCohesionSpec`).
  //
  // Springs and dampers join them because they are forces, not links, in dynamic mode.
  // A spring at least leaves a `Spring` link behind, which `farEndFree` sees; a DAMPER leaves nothing at all, so without this a beam damped at its free end balances as though nothing were there.
  // Motors need no such treatment: their own link names the driven key, which disqualifies the balance before it is ever read.
  const frameLoads = resolve_load_forces(model.compiledLoads, finalResult.positions);


  const frameExternalForces = frameLoads.forces;
  for (const [key, f] of resolve_spring_damper_forces(
    model.compiledSpringDampers,
    finalResult.positions,
    velocities,
  ))
    frameExternalForces.set(key, (frameExternalForces.get(key) ?? ZERO).add(f));

  // ── Each beam's cohesion torsor, SOLVED rather than read off the sweep ──
  //
  // See docs/plan-efforts-interieurs.md phase 10.
  // Nothing below asks the solver what its own corrections meant: the two defects that made that unanswerable — a weld's `Angle` link claimed by both beams it joins, and the over-constrained endpoint node — are properties of how XPBD credits itself, and equilibrium does not care.
  // What this reads is the converged geometry, the beams' continuum masses and this frame's accelerations.
  const staticsFrame = statics_frame({
    gravity,
    positionOf: (key) => finalResult.positions.get(key),
    velocityOf: (key) => velocities.get(key) ?? ZERO,
    // The same whole-frame d'Alembert term `outAccelerations` carries, read by fused key rather than by snapshot slot — a fused key is not always a layout key.
    accelerationOf: (key) => {
      if (dt <= 0) return ZERO;
      const before = velocitiesBeforeSolve.get(key) ?? ZERO;
      const after = velocities.get(key) ?? ZERO;
      return after.sub(before).mul(1 / dt);
    },
    externalForceAt: (key) => frameExternalForces.get(key) ?? ZERO,
    distributedShareAt: (key) => frameLoads.distributed.get(key) ?? ZERO,
    // The angular twin of `accelerationOf`, read across the whole frame's solve for the same reason.
    angularAccelerationOf: (gearID) => {
      if (dt <= 0) return 0;
      const before = angleVelocitiesBeforeSolve.get(gearID) ?? 0;
      const after = angleVelocities.get(gearID) ?? 0;
      return (after - before) / dt;
    },
    masses: model.dynamicMasses,
    gears: model.staticsSystem.gears,
    specs: model.beamCohesionSpecs,
    loads: model.compiledLoads,
    beams: model.staticsBeams,
  });
  // Always, unlike the cohesion below: one pass over the same bodies, with no solve of its own to pay for.
  const balance = compute_balance_sample(
    model.staticsSystem,
    model.beamCohesionSpecs,
    staticsFrame,
  );
  const beam_cohesion = collectDiagnostics
    ? beam_cohesion_from_statics(
        model.beamCohesionSpecs,
        staticsFrame,
        solve_statics(
          model.staticsSystem,
          model.beamCohesionSpecs,
          staticsFrame,
          build_flexibility(model.staticsSystem, model.beamCohesionSpecs, staticsFrame),
        ),
      )
    : undefined;

  return {
    t,
    layout,
    positions: outPositions,
    angles: outAngles,
    velocities: outVelocities,
    accelerations: outAccelerations,
    angleVelocities: outAngleVelocities,
    angleAccelerations: outAngleAccelerations,
    unsatisfied: finalResult.unsatisfied,
    reactions,
    motorPower,
    energy,
    balance,
    beamCohesion: collectDiagnostics ? beam_cohesion : undefined,
  };
}

/**
 * This frame's whole-mechanism energy balance (`EnergySample`) — reads the SAME fused-key maps `step_dynamic_simulation` just solved with (`model.dynamicMasses`, `model.compiledSpringDampers`), rather than rebuilding a mass model from the raw mechanism: the masses/positions/velocities a frame's own solve used are exactly what its energy balance has to be measured against.
 * Anchored dofs (`posMasses` reading 0, same test the solver itself uses) are skipped entirely, kinetic and potential alike — immobile, so their absence only shifts `potentialGravity` by a constant the balance never looks at (it only ever compares a CHANGE against this recording's own first frame).
 */
function compute_energy_sample(
  model: SimulationModel,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
  gravity: Point2,
): EnergySample {
  let kinetic = 0;
  let potentialGravity = 0;
  for (const [key, invMass] of model.dynamicMasses.posMasses) {
    if (invMass <= 0) continue;
    if (model.dynamicMasses.phantomKeys.has(key)) continue; // a floor the solve needs, not a mass this balance may count
    const mass = 1 / invMass;
    const v = velocities.get(key);
    if (v) kinetic += 0.5 * mass * (v.x * v.x + v.y * v.y);
    const p = positions.get(key);
    if (p) potentialGravity -= mass * (p.x * gravity.x + p.y * gravity.y);
  }
  for (const [key, invInertia] of model.dynamicMasses.angleMasses) {
    if (invInertia <= 0) continue;
    const w = angleVelocities.get(key) ?? 0;
    kinetic += 0.5 * (w * w) / invInertia;
  }

  let potentialSpring = 0;
  let damperPower = 0;
  for (const sd of model.compiledSpringDampers) {
    const start = positions.get(sd.startKey);
    const end = positions.get(sd.endKey);
    if (!start || !end) continue;
    const delta = end.sub(start);
    const length = delta.length();
    if (sd.kind === "spring") {
      const stretch = length - sd.restLength;
      potentialSpring += 0.5 * sd.stiffness * stretch * stretch;
    } else if (length > 1e-9) {
      const axis = delta.mul(1 / length);
      const relV = (velocities.get(sd.endKey) ?? ZERO)
        .sub(velocities.get(sd.startKey) ?? ZERO)
        .dot(axis);
      damperPower += sd.damping * relV * relV;
    }
  }

  return {
    kinetic,
    potentialGravity,
    potentialSpring,
    damperPower,
    frictionPower: friction_power(
      model.compiledFrictions,
      positions,
      velocities,
      angleVelocities,
    ),
  };
}

/**
 * The snapshot to draw at time `t`, interpolated between the two it falls between.
 *
 * Recording runs at a fixed `RECORD_DT` whatever the playback speed, so below ×1 the same snapshot would otherwise be drawn several times in a row and the motion reads as stepping.
 * Interpolating decouples smoothness from the recording rate, at no solver cost.
 *
 * Two states that each satisfy the constraints do not average into one that does — a beam gets marginally shorter across the interpolation.
 * The error is second-order in the step and measured in `snapshot-interpolation.test.ts`; it is not a solve, only a drawing.
 *
 * Topology is never interpolated: across a frame where a pulley leaves or rejoins a belt, the earlier snapshot is held rather than drawing a half-detached belt.
 */
export function snapshot_at(
  snapshots: KinematicSnapshot[],
  t: number,
): KinematicSnapshot | null {
  if (snapshots.length === 0) return null;
  const i = snapshot_index_at(snapshots, t);
  if (i >= snapshots.length - 1) return snapshots[snapshots.length - 1];
  const a = snapshots[i];
  const b = snapshots[i + 1];
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  if (u <= 0) return a;
  // Slot i means one thing on each side of an edit, so two layouts never average.
  if (a.layout !== b.layout) return a;
  if (!same_belt_topology(a, b)) return a;

  const positions = new Float64Array(a.positions.length);
  for (let i = 0; i < positions.length; i++)
    positions[i] = a.positions[i] + (b.positions[i] - a.positions[i]) * u;
  // Belt wraps are continuous like the angles and share their array, so they interpolate in the same pass.
  // The contact flags do too, harmlessly: the topology check above is what guarantees they are equal on both sides, so they come out unchanged.
  const angles = new Float64Array(a.angles.length);
  for (let i = 0; i < angles.length; i++)
    angles[i] = a.angles[i] + (b.angles[i] - a.angles[i]) * u;
  return {
    t,
    layout: a.layout,
    positions,
    angles,
    // Diagnostics belong to a state the solver actually produced.
    unsatisfied: a.unsatisfied,
  };
}

/**
 * `snapshot_at`'s dynamic-mode counterpart: same interpolation of position/angle, plus velocity, and the same belt-topology guard, dynamic mode tracking belt contact too (see `same_belt_topology`).
 * Kept separate rather than folded into one generic function: the two snapshot kinds differ in exactly the extra fields this interpolates (velocity, acceleration…), and forcing them through a shared body would cost more in indirection than the ~20 duplicated lines below are worth.
 * `snapshot_index_at` is the part that IS shared, being purely a search over `.t`.
 */
export function dynamic_snapshot_at(
  snapshots: DynamicSnapshot[],
  t: number,
): DynamicSnapshot | null {
  if (snapshots.length === 0) return null;
  const i = snapshot_index_at(snapshots, t);
  if (i >= snapshots.length - 1) return snapshots[snapshots.length - 1];
  const a = snapshots[i];
  const b = snapshots[i + 1];
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  if (u <= 0) return a;
  // Slot i means one thing on each side of an edit, so two layouts never average.
  if (a.layout !== b.layout) return a;
  if (!same_belt_topology(a, b)) return a;

  const lerp = (from: Float64Array, to: Float64Array) => {
    const out = new Float64Array(from.length);
    for (let i = 0; i < out.length; i++) out[i] = from[i] + (to[i] - from[i]) * u;
    return out;
  };
  return {
    t,
    layout: a.layout,
    positions: lerp(a.positions, b.positions),
    angles: lerp(a.angles, b.angles),
    velocities: lerp(a.velocities, b.velocities),
    accelerations: lerp(a.accelerations, b.accelerations),
    angleVelocities: lerp(a.angleVelocities, b.angleVelocities),
    angleAccelerations: lerp(a.angleAccelerations, b.angleAccelerations),
    // Diagnostics belong to a state the solver actually produced.
    unsatisfied: a.unsatisfied,
    reactions: a.reactions,
    motorPower: a.motorPower,
    energy: a.energy,
    balance: a.balance,
    beamCohesion: a.beamCohesion,
  };
}

/**
 * Does a cursor placed at `t` sit at the live end of the recording, rather than behind it?
 *
 * This compares times, which the recording loop must never do: while recording, the frontier runs ahead of the cursor by an amount that varies frame to frame.
 * It is sound **here and only here** — it answers at the instant the user drops the cursor, playback stopped and the frontier still.
 *
 * Generic over `SimulationSnapshot`: it only ever reads `.t`, so it serves a kinematic or a dynamic recording alike.
 */
export function at_recording_end<S extends SimulationSnapshot>(
  snapshots: S[],
  t: number,
): boolean {
  if (snapshots.length === 0) return true;
  return t >= snapshots[snapshots.length - 1].t - RETAIN_DT / 2;
}

/**
 * Index of the last snapshot recorded at or before `t`, by binary search rather than by dividing the time axis — the search is correct whether or not the spacing is uniform, and nothing downstream then has to be revisited if it ever stops being.
 * Clamped to the array.
 *
 * Generic like `at_recording_end`, for the same reason.
 */
export function snapshot_index_at<S extends SimulationSnapshot>(
  snapshots: S[],
  t: number,
): number {
  let lo = 0;
  let hi = snapshots.length - 1;
  if (hi < 0 || t <= snapshots[0].t) return 0;
  if (t >= snapshots[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The parameter snapshot in effect at `t`: the last edit made at or before it.
 * A recording always carries at least the `t: 0` entry seeded when it started, so this only returns `null` outside a simulation (an empty log).
 */
export function parameter_snapshot_at(
  snapshots: ParameterSnapshot[],
  t: number,
): ParameterSnapshot | null {
  if (snapshots.length === 0) return null;
  let lo = 0;
  let hi = snapshots.length - 1;
  if (t <= snapshots[0].t) return snapshots[0];
  if (t >= snapshots[hi].t) return snapshots[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return snapshots[lo];
}

/**
 * Same pulleys detached on both sides.
 * Only sound on one layout, where the flags of a given pulley are the same slot on both sides.
 * Generic over `SimulationSnapshot`: both concrete subtypes carry the same detach block (see `SnapshotLayout`). */
function same_belt_topology<S extends SimulationSnapshot>(a: S, b: S): boolean {
  // The flag block alone.
  // The arrival angles that follow it are continuous like the wraps, so comparing them would find every pair of instants different and never interpolate.
  for (let i = a.layout.detachBase; i < a.layout.arrivalBase; i++)
    if (a.angles[i] !== b.angles[i]) return false;
  return true;
}

/**
 * Apply a snapshot's positions/angles/belt-contact to a mechanism copy for rendering.
 * Does NOT modify the original mechanism (editing state).
 * Radii are unchanged in simulation, so gears keep their edit-time radius.
 *
 * Generic over `SimulationSnapshot`: kinematic and dynamic snapshots carry the same wrap/detach/arrival belt block (see `SnapshotLayout`), so one body reads either kind — `apply_snapshot_to_mechanism`/`apply_dynamic_snapshot_to_mechanism` below are thin, concretely-typed wrappers a caller picks between on `AppMode`, without a runtime branch.
 */
function apply_snapshot_fields<S extends SimulationSnapshot>(
  mechanism: Mechanism,
  snapshot: S,
): Mechanism {
  const newElements = mechanism.mechanicalElements.map((el) => {
    if ("position" in el) {
      const pos = snapshot_point(snapshot, el.id);
      if (!pos) return el;
      if (el.type === "gear") {
        const ang = snapshot_angle(snapshot, el.id);
        return {
          ...el,
          position: pos,
          ...(ang !== undefined ? { angle: ang } : {}),
        };
      }
      return { ...el, position: pos };
    } else {
      const start = snapshot_point(snapshot, `${el.id}:start`);
      const end = snapshot_point(snapshot, `${el.id}:end`);
      // Springs/dampers: freeze the natural (rest) length — the user's typed value for a spring, else the edit-time positions — so the drawing keeps a fixed coil/piston count while the simulated length stretches or compresses.
      const restLength =
        el.type === "spring" || el.type === "damper"
          ? (el.restLength ?? el.positionStart.distance_to(el.positionEnd))
          : undefined;
      const disconnectedGearIndices =
        el.type === "belt"
          ? snapshot_belt_detached(snapshot, el.id)
          : undefined;
      const gearWraps =
        el.type === "belt" ? snapshot_belt_wraps(snapshot, el.id) : undefined;
      return {
        ...el,
        ...(start ? { positionStart: start } : {}),
        ...(end ? { positionEnd: end } : {}),
        ...(restLength !== undefined ? { restLength } : {}),
        ...(disconnectedGearIndices !== undefined
          ? { disconnectedGearIndices }
          : {}),
        ...(gearWraps !== undefined ? { gearWraps } : {}),
      };
    }
  });

  return { ...mechanism, mechanicalElements: newElements };
}

/** `apply_snapshot_fields`, typed to a kinematic recording. */
export function apply_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: KinematicSnapshot,
): Mechanism {
  return apply_snapshot_fields(mechanism, snapshot);
}

/** `apply_snapshot_fields`, typed to a dynamic recording. */
export function apply_dynamic_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: DynamicSnapshot,
): Mechanism {
  return apply_snapshot_fields(mechanism, snapshot);
}

/** The parameters in effect from `t` onward: `mechanism`'s own, as it stands when this is called. */
export function parameter_snapshot(
  t: number,
  mechanism: Mechanism,
): ParameterSnapshot {
  return {
    t,
    mechanicalElements: mechanism.mechanicalElements,
    loads: mechanism.loads,
    materials: mechanism.materials,
    profiles: mechanism.profiles,
    gravity: mechanism.simulation.gravity,
    collisions: mechanism.simulation.collisions,
    floor: mechanism.simulation.floor,
  };
}

/** `element` carrying the parameter values `shown` had, and nothing else of it. */
function with_shown_parameters(
  element: MechanicalElement,
  shown: MechanicalElement,
): MechanicalElement {
  switch (element.type) {
    case "slider":
      return shown.type === "slider"
        ? { ...element, slidingFriction: shown.slidingFriction }
        : element;
    case "pivot":
      return shown.type === "pivot"
        ? {
            ...element,
            motor: shown.motor,
            rotationalFriction: shown.rotationalFriction,
          }
        : element;
    case "slidep":
      return shown.type === "slidep"
        ? {
            ...element,
            slidingFriction: shown.slidingFriction,
            rotationalFriction: shown.rotationalFriction,
          }
        : element;
    case "mass":
      return shown.type === "mass" ? { ...element, mass: shown.mass } : element;
    case "gear":
      return shown.type === "gear"
        ? { ...element, surfaceMass: shown.surfaceMass }
        : element;
    case "beam":
      return shown.type === "beam"
        ? {
            ...element,
            materialID: shown.materialID,
            profileID: shown.profileID,
          }
        : element;
    case "spring":
      return shown.type === "spring"
        ? {
            ...element,
            stiffness: shown.stiffness,
            restLength: shown.restLength,
          }
        : element;
    case "damper":
      return shown.type === "damper"
        ? { ...element, damping: shown.damping, restLength: shown.restLength }
        : element;
    default:
      return element;
  }
}

/**
 * Apply a parameter snapshot to a mechanism copy for rendering — every value the simulation reads, as in effect at that instant rather than as last edited.
 * Geometry is untouched, so this composes after `apply_snapshot_to_mechanism` without undoing it.
 * What only changes how a run is read (names, overlays, a material's `Re`) keeps its current value: it is not part of the recorded past.
 */
export function apply_parameter_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: ParameterSnapshot,
): Mechanism {
  const shownByID = new Map(
    snapshot.mechanicalElements.map((el) => [el.id, el]),
  );
  const loadByID = new Map(snapshot.loads.map((load) => [load.id, load]));

  const newElements = mechanism.mechanicalElements.map((el) => {
    const shown = shownByID.get(el.id);
    return shown ? with_shown_parameters(el, shown) : el;
  });

  // The catalogue as it stood, entries deleted since included: a beam at that instant may still name one.
  const currentMaterials = new Map(mechanism.materials.map((m) => [m.id, m]));
  const materials = snapshot.materials.map((shown) => {
    const current = currentMaterials.get(shown.id);
    return current ? { ...shown, name: current.name, Re: current.Re } : shown;
  });
  const currentProfiles = new Map(mechanism.profiles.map((p) => [p.id, p]));
  const profiles = snapshot.profiles.map((shown) => {
    const current = currentProfiles.get(shown.id);
    return current ? { ...shown, name: current.name } : shown;
  });

  const newLoads = mechanism.loads.map((load) => {
    const shown = loadByID.get(load.id);
    if (!shown) return load;
    if (load.type === "force" && shown.type === "force")
      return { ...load, vector: shown.vector, frame: shown.frame };
    if (load.type === "distributed-force" && shown.type === "distributed-force")
      return {
        ...load,
        direction: shown.direction,
        magnitudeStart: shown.magnitudeStart,
        magnitudeEnd: shown.magnitudeEnd,
        frame: shown.frame,
      };
    if (load.type === "moment" && shown.type === "moment")
      return { ...load, value: shown.value };
    return load;
  });

  return {
    ...mechanism,
    mechanicalElements: newElements,
    loads: newLoads,
    materials,
    profiles,
    simulation: {
      ...mechanism.simulation,
      gravity: snapshot.gravity,
      collisions: snapshot.collisions,
      floor: snapshot.floor,
    },
  };
}

export { RECORD_DT };
