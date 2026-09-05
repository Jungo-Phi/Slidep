import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AppMode,
  Link,
  Mechanism,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_RUNTIME_STATE,
  SimulationConfig,
  Point2,
  is_simulating,
} from "../../../types";
import {
  ConstraintResidual,
  DynamicSnapshot,
  EMPTY_NEGLIGIBILITY_POOL,
  KinematicSnapshot,
  RuntimeState,
} from "../../../types/runtime-state";
import { CanvasState } from "../../../types/canvas-state";
import { LiveFrame } from "../../canvas/MechanicalCanvas";
import { OverlayArrow, OverlayMoment } from "../../canvas/drawing/drawing-functions";
import { is_node_element, overlay_shown } from "../../../utils/element-queries";
import {
  MAX_RECORDING_TIME,
  RECORD_DT,
  RETAIN_DT,
  recording_full,
  SimGrab,
  apply_dynamic_snapshot_to_mechanism,
  apply_parameter_snapshot_to_mechanism,
  apply_snapshot_to_mechanism,
  dynamic_snapshot_at,
  parameter_snapshot_at,
  snapshot_at,
  snapshot_index_at,
} from "../dynamics/simulation-engine";
import { RecorderClient } from "./recorder-client";
import { RecorderMode } from "./recorder-protocol";
import {
  set_sim_clock as setRuntimeState,
  sim_clock,
  useSimClock,
} from "../dynamics/sim-clock";
import {
  EMPTY_TRAJECTORY_CACHE,
  TrajectoryCache,
  element_reactions,
  element_velocity,
  extend_probe_trajectories,
  trajectories_at,
} from "./probe-series";
import { PROBE_ELEMENT_COLORS } from "../../properties-panel/components/ProbeChart";
import {
  CohesionField,
  compute_cohesion_field,
  EMPTY_STRESS_SCALE_CACHE,
  extend_stress_scale,
  shear_admissible_stress,
  StressScaleCache,
} from "./cohesion-field";
import { GRAVITY } from "../../../constants/physics-specs";
import { NEGLIGIBLE_STRESS_FRACTION } from "../../../constants/physics-display-specs";
import { extend_negligibility_pool, is_negligible } from "./negligibility-pool";
import { beam_strength } from "../../../utils/section-properties";

/** How often the simulation clock reaches React. Text and controls, not motion. */
const CLOCK_MIRROR_MS = 100;
/**
 * How fast the cursor's rate estimate follows the producer. Low on purpose: the answer to
 * "we cannot keep up" is to go slower, evenly, and a rate that tracked every frame's
 * arrivals would just be the stutter it is meant to remove. At 0.1 a change of regime is
 * absorbed over about ten frames.
 */
const CURSOR_RATE_ALPHA = 0.1;

/**
 * How far ahead of the cursor the worker is aimed, in simulated seconds.
 *
 * Two frames of it, deliberately. `reached` always describes the target of the PREVIOUS
 * frame — a worker answers between frames, not inside one — so aiming at where the cursor is
 * going leaves the cap sitting exactly on it: it binds on some frames and not others, and
 * the cursor advances in fits, which is visible as the mechanism speeding up and slowing
 * down. One frame of lead cancels the staleness, the second puts the cap comfortably out of
 * the way.
 *
 * Never less than two recorded steps, though, and that floor is what makes low speeds
 * watchable: a lead counted in frames shrinks with the playback speed while the recording
 * grid does not. Once it falls under a step — below ×1/3 on a 60 Hz screen — the cursor
 * spends part of its time past the newest snapshot, where `snapshot_at` holds the last one
 * rather than interpolating, and the motion steps at the recording rate instead of the
 * display's.
 *
 * It costs nothing — the worker stops at its target — beyond recording slightly past what
 * is displayed, which pausing truncates.
 */
const worker_lead = (simDt: number): number =>
  Math.max(2 * simDt, 2 * RETAIN_DT);

/**
 * Floors for the beam-fill lenses' own shared scales (see `NEGLIGIBLE_STRESS_FRACTION`'s own
 * doc): `NEGLIGIBLE_STRESS_FRACTION` of the LOWEST admissible reference among the mechanism's
 * own beams — `Re` for `normal`/`bending`, `τ_adm` for `shear` (its own comparison basis,
 * `shear_admissible_stress(Re)`, not `Re` directly — a beam's shear reading is judged against
 * ITS OWN admissible shear, so the floor tracks the same reference the ratio itself does). The
 * lowest across beams, not an average or the first found, so the floor never hides a real
 * reading for whichever material has the least room to begin with. `0` (a no-op against
 * `Math.max`) when no beam resolves a material/profile, same "nothing to scale yet" case
 * `StressScaleCache` itself falls back to.
 */
function negligible_stress_floors(mechanism: Mechanism): { stress: number; shear: number } {
  let minRe = Infinity;
  let minTauAdm = Infinity;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "beam") continue;
    const strength = beam_strength(el.materialID, el.profileID, mechanism.materials, mechanism.profiles);
    if (!strength) continue;
    minRe = Math.min(minRe, strength.Re);
    minTauAdm = Math.min(minTauAdm, shear_admissible_stress(strength.Re));
  }
  return {
    stress: Number.isFinite(minRe) ? minRe * NEGLIGIBLE_STRESS_FRACTION : 0,
    shear: Number.isFinite(minTauAdm) ? minTauAdm * NEGLIGIBLE_STRESS_FRACTION : 0,
  };
}

export type SimulationLimitReason = "time" | "memory";

/**
 * The `RuntimeState` fields whose shape follows `appMode` — `simulationSnapshots` is a
 * `KinematicSnapshot[]` or a `DynamicSnapshot[]` depending on which, and code that reads both
 * together (`analysedMechanism`) trusts `appMode` to say which shape is in there.
 *
 * `appMode` is plain React state and updates on its own render; `runtimeState` is a throttled
 * mirror of the sim clock (see `sim-clock.ts`) and can still hold the PREVIOUS mode's
 * snapshots for a render or more after `appMode` has already flipped. Anywhere `appMode` is
 * set outside this hook's own effect below, this patch must be applied in the same
 * synchronous update — not left for the effect to catch up on its own render — or that gap is
 * exactly the window where a stale snapshot array gets decoded with the new mode's shape.
 */
export function simulationResetPatch(
  mode: AppMode,
  mechanism: Mechanism,
): Pick<
  RuntimeState,
  "time" | "simulationSnapshots" | "parameterSnapshots" | "scrubbed" | "negligibilityPool"
> {
  return {
    time: 0,
    simulationSnapshots: [],
    parameterSnapshots:
      mode !== "edition"
        ? [
            {
              t: 0,
              mechanicalElements: mechanism.mechanicalElements,
              loads: mechanism.loads,
            },
          ]
        : [],
    scrubbed: false,
    // Dynamic mode is the only one that ever grows this pool (see the recording loop
    // below) — every other mode leaves it untouched, so without this it keeps whatever a
    // previous dynamic run left behind for the entire lifetime of the new mode, judging
    // unrelated readings negligible against a scale that has nothing to do with them.
    negligibilityPool: EMPTY_NEGLIGIBILITY_POOL,
  };
}

/**
 * `Recorder`/the worker only know two `RecorderMode`s. `"static"` is still `disabled` in
 * `PlaybackControls` — it has no recording loop of its own yet — so it is not distinguished
 * here; falling back to `"kinematic"` is a harmless default for a mode nobody can reach.
 */
const recorder_mode = (mode: AppMode): RecorderMode =>
  mode === "dynamic" ? "dynamic" : "kinematic";

export type UseSimulationPlaybackArgs = {
  mechanism: Mechanism;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  setCanvasState: (
    update: CanvasState | ((prev: CanvasState) => CanvasState),
  ) => void;
  /** Dynamic mode only: whether the predict step integrates gravity. Read every render
   *  through a ref, like `mechanism`/`appMode` — see the class doc below. */
  gravity: boolean;
  /** Both modes: whether the next steps detect and resist collisions. Same reasoning as
   *  `gravity` — read every render through a ref. */
  collisions: boolean;
  /** Both modes: whether the next steps detect and resist the floor. Gated independently
   *  from `collisions` — same reasoning otherwise. */
  floor: boolean;
  /** Called when the recording hits `MAX_RECORDING_TIME` or the snapshot memory cap. */
  onRecordingLimitReached: (reason: SimulationLimitReason, maxTime: number) => void;
};

/**
 * Everything needed to drive and observe a simulation — kinematic or dynamic — the recording
 * worker, the RAF loop that steps it, and the handlers Space/Escape/grab feed into it.
 *
 * `mechanism`/`appMode` are read through a ref (`simulationRef`) rather than closed over, so
 * the RAF effect can stay mounted once for the app's lifetime instead of re-subscribing on
 * every render.
 */
export function useSimulationPlayback({
  mechanism,
  appMode,
  setAppMode,
  setCanvasState,
  gravity,
  collisions,
  floor,
  onRecordingLimitReached,
}: UseSimulationPlaybackArgs) {
  const runtimeState = useSimClock(CLOCK_MIRROR_MS);

  const mechanismRef = useRef(mechanism);
  mechanismRef.current = mechanism;

  // The runtime state is NOT mirrored here: `sim_clock()` is authoritative and always
  // current, whereas this ref would only ever hold what the last render happened to see.
  const simulationRef = useRef({ mechanism, appMode });
  simulationRef.current = { mechanism, appMode };
  const gravityRef = useRef(gravity);
  gravityRef.current = gravity;
  const collisionsRef = useRef(collisions);
  collisionsRef.current = collisions;
  const floorRef = useRef(floor);
  floorRef.current = floor;
  /** What the canvas draws, republished every frame. */
  const liveFrameRef = useRef<LiveFrame | null>(null);
  const trajectoryCacheRef = useRef<TrajectoryCache>(EMPTY_TRAJECTORY_CACHE);
  const stressScaleCacheRef = useRef<StressScaleCache>(EMPTY_STRESS_SCALE_CACHE);
  const lastWallTimeRef = useRef<number | null>(null);
  /** Simulated seconds per real second the producer sustains, low-passed. */
  const cursorRateRef = useRef<number>(1);
  /** Where the recording ended when it last MOVED, to read that rate from. */
  const prevReachedRef = useRef<number | null>(null);
  /**
   * Wall-clock elapsed since then, which is the interval the next rate is measured over.
   *
   * A frame the worker sent nothing on is not a frame it produced nothing on — it posts only
   * when it has a recorded instant to hand over, and it keeps one solved step in two. Read
   * frame by frame, those silent frames sample a rate of zero, the cursor slows, the target
   * it drives advances less, the worker produces less still: the estimate collapses to a
   * standstill in well under a second. Waiting instead of concluding is what breaks that loop.
   */
  const waitedForReachedRef = useRef<number>(0);
  const autoPlayOnEnterRef = useRef<boolean>(false);
  const simStartHistoryLengthRef = useRef<number>(0);
  /** Set by a caller (e.g. a probe-only edit) right before the mechanism updates, so the
   *  recompile effect below can skip a recompile that would otherwise discard snapshots. */
  const probeOnlyEditRef = useRef<boolean>(false);
  /** Set by a caller right before the mechanism updates when the edit only changed load
   *  values (magnitude, direction…), never their target or count — the recompile effect
   *  below then swaps `compiledLoads` in place (`Recorder.setLoads`) instead of recompiling
   *  the whole model, which a continuous drag would otherwise do dozens of times a second. */
  const loadValueOnlyEditRef = useRef<boolean>(false);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  /**
   * The recording worker: it owns the compiled model and everything measured about it, and
   * produces snapshots on its own thread.
   *
   * Created when the app mounts and rebuilt after a dispose, never in a `useRef`
   * initialiser: that argument is evaluated on EVERY render, so it would spawn a worker per
   * render — and StrictMode's mount/unmount/mount would leave the ref pointing at a
   * terminated one.
   */
  const recorderRef = useRef<RecorderClient | null>(null);
  const recorder = () => (recorderRef.current ??= new RecorderClient());
  /** Whether the worker was last told to record, so pausing is signalled once. */
  const recordingRef = useRef<boolean>(false);
  /**
   * Whether playback is re-reading a recording that already extends past the cursor,
   * rather than extending it.
   *
   * Decided ONCE when playback starts, never re-inferred per frame: the frontier
   * legitimately runs ahead of the cursor while recording — by a step, by the worker's
   * lead, by a message's latency — so any per-frame comparison eventually reads a live
   * recording as a replay, and the replay path pauses itself on reaching an end that
   * recording does not have.
   */
  const replayingRef = useRef<boolean>(false);
  /**
   * Whether the user is holding a part of the mechanism.
   *
   * What the canvas draws and hit-tests is then the newest computed instant rather than the
   * one under the cursor — see `publish`. The clock is left alone: it is the drawing that
   * has to be where the grab is being solved, not the playback that has to run to it.
   */
  const grabbingRef = useRef<boolean>(false);

  const onRecordingLimitReachedRef = useRef(onRecordingLimitReached);
  onRecordingLimitReachedRef.current = onRecordingLimitReached;

  const exitToEdition = useCallback(() => {
    setAppMode("edition");
    setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
  }, [setAppMode]);

  const pauseSimulation = useCallback(() => {
    setRuntimeState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  /** Repartir sur des réglages de simulation neufs (vitesse, gravité, collisions,
   *  lecture/temps, snapshots…) lorsqu'on change de mécanisme. */
  const resetSimulationState = useCallback(
    (setSimulationConfig: (config: SimulationConfig) => void) => {
      setAppMode("edition");
      setRuntimeState(DEFAULT_RUNTIME_STATE);
      setSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    },
    [setAppMode],
  );

  // Reset simulation state on every mode change (fresh start each time)
  useEffect(() => {
    lastWallTimeRef.current = null;
    if (appMode !== "edition") {
      simStartHistoryLengthRef.current = mechanismRef.current.history.length;
      // Compile the frozen simulation model from the current mechanism.
      recorder().load(recorder_mode(appMode), mechanismRef.current, null);
      recorder().setGravity(gravityRef.current);
      recorder().setCollisions(collisionsRef.current);
      recorder().setFloor(floorRef.current);
      // Ask for frame 0 right away, without waiting for play: `advance` below picks it up
      // as soon as the worker answers, so the first frame's reactions are there to read
      // (elements panel, measures) even while the simulation sits paused.
      recorder().target(0);
    }
    // Capture the flag synchronously: the setRuntimeState updater below runs
    // later, after this line has already reset the ref to false.
    const shouldAutoPlay = appMode !== "edition" && autoPlayOnEnterRef.current;
    autoPlayOnEnterRef.current = false;
    setRuntimeState((prev) => ({
      ...prev,
      ...simulationResetPatch(appMode, mechanismRef.current),
      isPlaying: shouldAutoPlay,
    }));
  }, [appMode]);

  // Dynamic mode only: toggling the gravity Chip mid-run changes what the NEXT steps
  // integrate, without recompiling — a reload would lose belt/motor state for nothing, and
  // gravity is not part of what makes a frame's positions valid or not the way geometry is.
  useEffect(() => {
    if (is_simulating(appMode)) recorder().setGravity(gravity);
  }, [appMode, gravity]);

  // Same reasoning, both modes: toggling collisions mid-run changes what the NEXT steps
  // detect, without recompiling or losing belt/motor state.
  useEffect(() => {
    if (is_simulating(appMode)) recorder().setCollisions(collisions);
  }, [appMode, collisions]);

  // Same reasoning, gated independently from collisions: a mechanism may want the floor
  // without general element collisions, or vice versa.
  useEffect(() => {
    if (is_simulating(appMode)) recorder().setFloor(floor);
  }, [appMode, floor]);

  // Recompile the simulation model + truncate future snapshots whenever the
  // mechanism is edited during simulation. Re-bake references from the current
  // simulated state (apply the last snapshot first) so motor angle and gear
  // rotations stay continuous across the edit.
  useEffect(() => {
    const probeOnly = probeOnlyEditRef.current;
    probeOnlyEditRef.current = false;
    const loadValueOnly = loadValueOnlyEditRef.current;
    loadValueOnlyEditRef.current = false;
    const mode = simulationRef.current.appMode;
    if (mode === "edition") return;
    // Probe-config edits don't affect the simulated motion: keep the model
    // and the already-recorded snapshots.
    if (probeOnly) return;
    const rs = sim_clock();
    // Snapshots ahead of the cursor were solved under the old values, whichever kind of edit
    // this is — this bookkeeping is about what stays valid, not about the model itself.
    const truncate = () =>
      setRuntimeState((prev) => ({
        ...prev,
        simulationSnapshots: prev.simulationSnapshots.filter((s) => s.t <= rs.time),
        // Strict `<`, not `<=`: an edit made without the clock having moved since the last one
        // (two edits at the same instant, including the very first at t=0) replaces that
        // entry instead of leaving a duplicate a lookup could resolve to either side of.
        parameterSnapshots: [
          ...prev.parameterSnapshots.filter((s) => s.t < rs.time),
          {
            t: rs.time,
            mechanicalElements: mechanism.mechanicalElements,
            loads: mechanism.loads,
          },
        ],
      }));
    // A load's values changed but not its target/count: swap them into the already-compiled
    // model instead of recompiling it — the whole point being that a continuous drag can call
    // this many times a second, unlike every other edit here.
    if (loadValueOnly) {
      recorder().setLoads(mechanism.loads);
      truncate();
      return;
    }
    const snaps = rs.simulationSnapshots;
    const baseSnap =
      snaps.length > 0 ? snaps[snapshot_index_at(snaps, rs.time)] : null;
    // Cast: `baseSnap`'s concrete shape follows `mode`, same invariant `Recorder` relies on.
    const baseMech =
      baseSnap == null
        ? mechanism
        : mode === "kinematic"
          ? apply_snapshot_to_mechanism(mechanism, baseSnap as KinematicSnapshot)
          : apply_dynamic_snapshot_to_mechanism(mechanism, baseSnap as DynamicSnapshot);
    recorder().load(recorder_mode(mode), baseMech, baseSnap);
    truncate();
    // Depend on geometry/topology only, not the whole mechanism: a viewport
    // (pan/zoom) change keeps these array refs identical, so it no longer
    // recompiles the simulation model nor truncates the snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanism.mechanicalElements, mechanism.constraintElements, mechanism.loads]);

  // RAF loop: records simulation snapshots while playing in kinematic or dynamic mode
  useEffect(() => {
    let rafId: number;
    // Spawned here rather than on first use: fetching and parsing the worker chunk is
    // otherwise paid at the exact moment simulation starts, where it reads as a freeze.
    recorder();

    /**
     * Rebuilds what the canvas draws, from the clock rather than from a render.
     *
     * Runs on every frame, paused included: scrubbing moves the cursor without React
     * necessarily re-rendering. It returns at once when nothing it reads has moved, so a
     * paused simulation costs a few comparisons.
     */
    let shownTime = NaN;
    let shownSnaps: RuntimeState["simulationSnapshots"] | null = null;
    let shownMechanism: Mechanism | null = null;
    let shownHeld = false;
    let shownExtending = false;
    const publish = (mode: AppMode) => {
      if (!is_simulating(mode)) {
        liveFrameRef.current = null;
        trajectoryCacheRef.current = EMPTY_TRAJECTORY_CACHE;
        stressScaleCacheRef.current = EMPTY_STRESS_SCALE_CACHE;
        shownSnaps = null;
        return;
      }
      const { mechanism: mech } = simulationRef.current;
      const rs = sim_clock();
      const held = grabbingRef.current;
      // Pausing changes what the trajectories show without moving the clock, so it has to be
      // part of what makes a frame stale — otherwise the faded segment appears only at the
      // next scrub.
      const extending = rs.isPlaying && !rs.scrubbed;
      if (
        rs.time === shownTime &&
        rs.simulationSnapshots === shownSnaps &&
        mech === shownMechanism &&
        held === shownHeld &&
        extending === shownExtending
      )
        return;
      shownTime = rs.time;
      shownSnaps = rs.simulationSnapshots;
      shownMechanism = mech;
      shownHeld = held;
      shownExtending = extending;

      // Held: the newest computed instant, not the one under the cursor.
      //
      // The cursor deliberately trails the frontier — the worker is aimed a `worker_lead`
      // ahead of it — while the solver applies the grab AT the frontier. So
      // the grabbed part gets drawn where it was rather than where the mouse just pulled it,
      // and the drag reads as offset by exactly that trail.
      //
      // Only the drawing moves. The clock stays on its own rate: pinning IT to the frontier
      // makes the playback speed depend on how many frames a message takes to come back
      // (`t_{n+1} = reached` reads a frontier one frame stale, so the clock advances the
      // worker's lead every OTHER frame) — measured as a mechanism running visibly fast.
      const snaps = rs.simulationSnapshots;
      const snapshot =
        held && snaps.length > 0
          ? snaps[snaps.length - 1]
          : mode === "kinematic"
            ? snapshot_at(snaps as KinematicSnapshot[], rs.time)
            : dynamic_snapshot_at(snaps as DynamicSnapshot[], rs.time);
      if (!snapshot) {
        liveFrameRef.current = null;
        return;
      }
      // The cache is only ever extended by the new snapshots: rebuilding whole trajectories
      // every frame costs the square of the recorded duration.
      trajectoryCacheRef.current = extend_probe_trajectories(
        trajectoryCacheRef.current,
        mech.mechanicalElements,
        rs.simulationSnapshots,
      );
      // Same instant as `snapshot`, not `rs.time`: a held grab draws the newest computed
      // frame rather than the one under the cursor, and the motor/load values shown must
      // match whichever instant that is.
      const paramSnapshot = parameter_snapshot_at(rs.parameterSnapshots, snapshot.t);
      const geometryMechanism =
        mode === "kinematic"
          ? apply_snapshot_to_mechanism(mech, snapshot as KinematicSnapshot)
          : apply_dynamic_snapshot_to_mechanism(mech, snapshot as DynamicSnapshot);
      // Velocity/reaction arrows: dynamic mode only, one per element with the matching
      // overlay on, read at the same instant everything else here draws. Velocity only
      // means something at a sampled point (node/gear); reactions resolve for those AND
      // edges, one per endpoint — `element_reactions` returns however many apply, each
      // optionally carrying a moment too (a rigid weld's force-couple, reduced).
      const overlayArrows: OverlayArrow[] = [];
      const overlayMoments: OverlayMoment[] = [];
      // The N/T/Mf field, every beam, dynamic mode only — no overlay flag gates it (see
      // `LiveFrame.cohesionFields`'s own doc): phase 5bis's panel diagrams show it for
      // whichever beam is selected, not a persistent per-element setting.
      const cohesionFields: CohesionField[] = [];
      // Floors for `normal`/`bending`/`shear`'s own scales (see `negligible_stress_floors`'s
      // doc) — 0 (a no-op) outside dynamic mode, where there is nothing to scale in the first
      // place.
      let negligibleStress = 0;
      let negligibleShear = 0;
      if (mode === "dynamic") {
        const dynSnap = snapshot as DynamicSnapshot;
        const gravity = gravityRef.current ? GRAVITY : new Point2(0, 0);
        ({ stress: negligibleStress, shear: negligibleShear } = negligible_stress_floors(mech));
        // The beam-fill lenses' shared scales, extended with whatever got recorded since the
        // last frame (never rebuilt) — docs/plan-efforts-interieurs.md phase 9. Scans the FULL
        // recording, not just `dynSnap`, so each scale reflects the worst value ever seen
        // rather than rescaling to whichever instant is currently displayed.
        stressScaleCacheRef.current = extend_stress_scale(
          stressScaleCacheRef.current,
          mech.mechanicalElements,
          mech.loads,
          rs.simulationSnapshots as DynamicSnapshot[],
          gravity,
          mech.materials,
          mech.profiles,
        );
        const pool = rs.negligibilityPool;
        for (const el of geometryMechanism.mechanicalElements) {
          if ("position" in el && overlay_shown(el, "velocity")) {
            const v = element_velocity(el, dynSnap);
            // A residual velocity next to nothing else moving is noise, not motion — see
            // negligibility-pool.ts. Hidden rather than drawn tiny: a clamped-to-minimum
            // arrow would still read as "something moves here".
            if (v && !is_negligible(v.length(), pool.linearVelocity))
              overlayArrows.push({ at: el.position, vector: v, kind: "velocity" });
          }
          // `is_node_element`, not just the flag: `available_overlays` no longer offers
          // "force" on an edge (a beam's own two arrows were a false "one force per member"
          // summary), but a mechanism saved before that change can still carry a stale
          // `true` there.
          if (overlay_shown(el, "force") && is_node_element(el)) {
            for (const r of element_reactions(el, dynSnap)) {
              const kind = r.atAnchor ? "reaction-support" : "reaction-internal";
              if (!is_negligible(r.vector.length(), pool.force))
                overlayArrows.push({ at: r.at, vector: r.vector, kind });
              // `r.moment` is the solver's raw CCW-positive convention; `draw_moment`
              // (and every other moment on screen) reads the data model's clockwise-
              // positive one instead — negate once, here, same flip `load-model.ts`
              // applies for a user-authored `MomentElement`.
              if (
                r.moment !== undefined &&
                !is_negligible(r.moment, pool.moment)
              )
                overlayMoments.push({ at: r.at, torque: -r.moment, kind });
            }
          }
          if (el.type === "beam") {
            const cohesion = dynSnap.beamCohesion?.find((c) => c.beamID === el.id);
            if (cohesion) {
              const field = compute_cohesion_field(
                el,
                mech.materials,
                mech.profiles,
                cohesion,
                mech.loads,
                dynSnap,
                gravity,
              );
              if (field) cohesionFields.push(field);
            }
          }
        }
      }
      liveFrameRef.current = {
        mechanism: paramSnapshot
          ? apply_parameter_snapshot_to_mechanism(geometryMechanism, paramSnapshot)
          : geometryMechanism,
        overlayArrows,
        overlayMoments,
        cohesionFields,
        stressScale: stressScaleCacheRef.current.maxStress,
        normalStressScale: Math.max(stressScaleCacheRef.current.maxNormal, negligibleStress),
        bendingStressScale: Math.max(stressScaleCacheRef.current.maxBending, negligibleStress),
        shearStressScale: Math.max(stressScaleCacheRef.current.maxShear, negligibleShear),
        // Headed at the instant actually DRAWN, which a held grab moves off the cursor:
        // a trail stopping short of the mechanism it belongs to is the same offset again.
        trajectories: trajectories_at(trajectoryCacheRef.current, snapshot.t).map(
          (traj, i) => ({
            points: traj.points,
            headCount: traj.headCount,
            // Read from the intent, not from a comparison of times — the same rule the
            // timeline head follows. While recording, the frontier runs ahead of the cursor
            // by the worker's lead and by whatever it is behind, so the faded segment would
            // show the producer's progress rather than the motion to come.
            visibleCount: extending ? traj.headCount : traj.points.length,
            color: PROBE_ELEMENT_COLORS[i % PROBE_ELEMENT_COLORS.length],
          }),
        ),
      };
    };

    const step = (wallTime: number) => {
      advance(wallTime);
      publish(simulationRef.current.appMode);
      paintPlayhead();
      rafId = requestAnimationFrame(step);
    };

    /**
     * Drops what was recorded past the cursor, and rewinds the worker with it.
     *
     * The worker is deliberately aimed ahead of the cursor, so a pause always leaves frames
     * that were computed and never shown. Keeping them puts the head short of the end of the
     * timeline it is itself the end of, which reads as the cursor slipping backwards at the
     * moment of the pause.
     *
     * Truncating on this side alone would leave a HOLE: the worker sleeps while its own
     * frontier is past the target, so it would never recompute the span that was dropped.
     * Rewinding it to the last kept snapshot is what closes the hole, and the epoch it bumps
     * is what discards the snapshots still in flight.
     *
     * A rewind and not a reload: the mechanism has not changed, so recompiling it would
     * throw away everything the run had accumulated on the model — belt contact above all,
     * which is what made a paused simulation diverge from an uninterrupted one.
     */
    const discardUnshown = () => {
      const rs = sim_clock();
      const snapshots = rs.simulationSnapshots;
      if (snapshots.length === 0) return;
      const keep = snapshot_index_at(snapshots, rs.time);
      if (keep >= snapshots.length - 1) return;
      const kept = snapshots.slice(0, keep + 1);
      const base = kept[kept.length - 1];
      setRuntimeState((prev) => ({
        ...prev,
        // Onto the instant that is kept, not between two: the head has to land exactly on
        // the end of the recording rather than a fraction of a step short of it.
        time: base.t,
        simulationSnapshots: kept,
      }));
      recorder().rewind(base);
    };

    /**
     * The timeline head, written straight to the DOM.
     *
     * It is a measure, not an intention, so it must not wait for the mirror: at 10 Hz the
     * head steps ten times a second across a mechanism that moves sixty. Invisible while
     * recording, where the head is pinned to the right by construction — which is exactly
     * why this was thought unnecessary — and plainly visible on replay.
     *
     * One custom property on the track rather than a ref per element: the dot is a
     * `Tooltip` child, and that already owns its ref.
     */
    let paintedPlayhead = "";
    const paintPlayhead = () => {
      const track = timelineTrackRef.current;
      if (!track) {
        // Gone with the timeline. Forget what was painted, or coming back to a cursor that
        // happens to sit at the same place would skip the write and leave the head at 0 %.
        paintedPlayhead = "";
        return;
      }
      const rs = sim_clock();
      const snapshots = rs.simulationSnapshots;
      const frontier = snapshots.length > 0 ? snapshots[snapshots.length - 1].t : 0;
      const pct =
        rs.isPlaying && !rs.scrubbed
          ? 100
          : frontier > 0
            ? Math.min(100, (rs.time / frontier) * 100)
            : 0;
      const next = `${pct.toFixed(2)}%`;
      if (next === paintedPlayhead) return;
      paintedPlayhead = next;
      track.style.setProperty("--playhead", next);
    };

    const advance = (wallTime: number) => {
      const { appMode: mode, mechanism: mech } = simulationRef.current;
      const rs = sim_clock();

      if (!is_simulating(mode) || !rs.isPlaying) {
        lastWallTimeRef.current = null;
        // Tell the worker once, not every frame: left running it would keep recording
        // towards the last target it was given, well past the pause.
        if (recordingRef.current) {
          recordingRef.current = false;
          recorder().stop();
          // Three conditions, and each one guards a different way of losing frames on
          // purpose: pausing a REPLAY must not delete what is being replayed; a SCRUB also
          // clears `isPlaying`, and truncating there would delete everything past the point
          // just jumped to; and LEAVING simulation is about to reset the recording anyway,
          // so reloading the worker first is pure waste.
          if (!replayingRef.current && !rs.scrubbed && is_simulating(mode))
            discardUnshown();
        }
        // Paused before ever playing: `target(0)` was posted the moment this mode was
        // entered (see the `[appMode]` effect), so pick up frame 0 as soon as the worker
        // answers — the panel and overlays must not wait for Play to show real reactions.
        // Self-terminating: once merged, `simulationSnapshots` is no longer empty and this
        // is skipped on every later tick.
        if (is_simulating(mode) && rs.simulationSnapshots.length === 0) {
          const { snapshots: newSnaps } = recorder().drain();
          if (newSnaps.length > 0)
            setRuntimeState((prev) => {
              const simulationSnapshots = [...prev.simulationSnapshots, ...newSnaps];
              return {
                ...prev,
                simulationSnapshots,
                negligibilityPool:
                  mode === "dynamic"
                    ? extend_negligibility_pool(
                        prev.negligibilityPool,
                        mech.mechanicalElements,
                        mech.constraintElements,
                        simulationSnapshots as DynamicSnapshot[],
                      )
                    : prev.negligibilityPool,
              };
            });
        }
        return;
      }
      if (!recordingRef.current) {
        recordingRef.current = true;
        // Decided from the intent that put the cursor there, not from where the cursor
        // sits: the frontier moves while recording, the flag does not.
        replayingRef.current = rs.scrubbed;
        // Start optimistic, and forget what was observed in another regime: a rate measured
        // before a pause, a scrub or a speed change says nothing about this one.
        cursorRateRef.current = rs.speed;
        prevReachedRef.current = null;
        waitedForReachedRef.current = 0;
      }

      const lastWallTime = lastWallTimeRef.current;
      lastWallTimeRef.current = wallTime;

      if (lastWallTime === null) return;

      const realDt = Math.min((wallTime - lastWallTime) / 1000, 0.1);
      const simDt = realDt * rs.speed;

      // Replay: history exists ahead of the cursor → just walk it, solving nothing.
      if (replayingRef.current) {
        setRuntimeState((prev) => {
          const prevFrontier =
            prev.simulationSnapshots.length > 0
              ? prev.simulationSnapshots[prev.simulationSnapshots.length - 1].t
              : 0;
          const nextTime = prev.time + simDt;
          // Reaching the end of what was recorded stops playback — the recording is not
          // resumed from here, since the frontier is where the mechanism was left.
          if (nextTime >= prevFrontier) {
            replayingRef.current = false;
            // Caught up with the recording: no longer somewhere the user put us, so
            // playing again extends instead of replaying.
            return { ...prev, time: prevFrontier, isPlaying: false, scrubbed: false };
          }
          return { ...prev, time: nextTime };
        });
      } else {
        // Create mode. The solving happens in the worker; this frame only says where
        // the clock is headed and collects whatever came back. Nothing is awaited, so
        // the display never blocks on the solver however heavy the mechanism.
        const requestedTime = rs.time + simDt;
        recorder().target(requestedTime + worker_lead(simDt));
        const { snapshots: newSnaps, reached } = recorder().drain();

        // The cursor runs at the rate the producer SUSTAINS, not at the one that happened
        // to arrive this frame. Both reach the same place — falling behind costs time
        // either way — but at an even pace rather than in fits, which is the only part of
        // it the eye can see.
        //
        // Still capped by the frontier plus a step: past that the cursor would read a time
        // no snapshot covers, and the timeline would claim progress that was never
        // computed. Before the first snapshot comes back there is no frontier, so it waits.
        let newTime = rs.time;
        if (reached !== null) {
          const previousReached = prevReachedRef.current;
          waitedForReachedRef.current += realDt;
          if (previousReached === null) {
            prevReachedRef.current = reached;
            waitedForReachedRef.current = 0;
          } else if (reached > previousReached && waitedForReachedRef.current > 0) {
            // Measured over however long the news took to come, not over this frame.
            cursorRateRef.current =
              (1 - CURSOR_RATE_ALPHA) * cursorRateRef.current +
              CURSOR_RATE_ALPHA *
                Math.min(
                  (reached - previousReached) / waitedForReachedRef.current,
                  rs.speed,
                );
            prevReachedRef.current = reached;
            waitedForReachedRef.current = 0;
          }
          newTime = Math.min(
            rs.time + realDt * cursorRateRef.current,
            // A speed the user just chose applies now, not once the estimate has caught up.
            requestedTime,
            reached + RECORD_DT,
          );
        }
        // The recording has run its full length: the solver will produce nothing more, so
        // playing on would freeze the mechanism without saying why. Stop, and say it.
        //
        // No need to check that the cursor has caught up — this branch only runs while
        // EXTENDING the recording, a cursor left behind being the replay branch's business.
        // Checking it would in fact never fire: the cursor advances at the rate the producer
        // sustains, which decays to zero as soon as the recording stops growing, so it comes
        // to rest short of the end rather than on it.
        const maxTime = recorder().maxTime();
        const exhausted = reached !== null && recording_full(reached, maxTime);
        if (exhausted)
          onRecordingLimitReachedRef.current(
            maxTime >= MAX_RECORDING_TIME ? "time" : "memory",
            maxTime,
          );

        setRuntimeState((prev) => {
          const prevFrontier =
            prev.simulationSnapshots.length > 0
              ? prev.simulationSnapshots[prev.simulationSnapshots.length - 1].t
              : -RECORD_DT;
          const uniqueSnaps = newSnaps.filter((s) => s.t > prevFrontier);
          const simulationSnapshots =
            uniqueSnaps.length > 0
              ? [...prev.simulationSnapshots, ...uniqueSnaps]
              : prev.simulationSnapshots;
          return {
            ...prev,
            // Landing the cursor ON the end, as the replay branch does: stopping it where it
            // happened to be would leave the last recorded instants unseen.
            time: exhausted && reached !== null ? reached : newTime,
            ...(exhausted ? { isPlaying: false } : {}),
            simulationSnapshots,
            // Dynamic mode only — reactions/velocities don't exist on a kinematic
            // snapshot, same gating as the overlay arrows built below.
            negligibilityPool:
              mode === "dynamic"
                ? extend_negligibility_pool(
                    prev.negligibilityPool,
                    mech.mechanicalElements,
                    mech.constraintElements,
                    simulationSnapshots as DynamicSnapshot[],
                  )
                : prev.negligibilityPool,
          };
        });
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      // Cleared, not just terminated: the next mount must build a live one. React runs
      // every cleanup before every effect, so the `load` that follows recreates it.
      recorderRef.current?.dispose();
      recorderRef.current = null;
      recordingRef.current = false;
    };
  }, []); // intentionally runs once; all state accessed via simulationRef

  const handleSpaceKey = useCallback(
    (lastSimulationMode: AppMode) => {
      if (appMode === "edition") {
        // Arm auto-play so the mode-change effect starts the simulation instead
        // of resetting isPlaying to false right after we set it.
        autoPlayOnEnterRef.current = true;
        setAppMode(lastSimulationMode);
        // Entering simulation abandons any in-progress tool/gesture, like Space does in the
        // canvas handler — but a settled selection carries over, it isn't a gesture to
        // abandon. Nor is the ruler: it reads the mechanism without touching it, and watching
        // a reading run is the whole point of having laid it down before pressing play.
        setCanvasState((prev) =>
          prev.type === "SelectedElement" ||
          prev.type === "SelectedMultiple" ||
          prev.type === "Measuring" ||
          prev.type === "MeasuringFrom" ||
          prev.type === "Measured"
            ? prev
            : { type: "Selecting" },
        );
      } else {
        setRuntimeState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      }
    },
    [appMode, setAppMode, setCanvasState],
  );

  // Escape while the simulation is running behaves like the "Réinitialiser"
  // button (reset to t=0 and stop); otherwise it exits to edition mode.
  const handleEscapeKey = useCallback(() => {
    if (appMode !== "edition" && sim_clock().isPlaying) {
      recorder().load(recorder_mode(appMode), mechanismRef.current, null);
      recorder().setGravity(gravityRef.current);
      recorder().setCollisions(collisionsRef.current);
      recorder().setFloor(floorRef.current);
      setRuntimeState((prev) => ({
        ...prev,
        time: 0,
        isPlaying: false,
        current: null,
        history: [],
        simulationSnapshots: [],
        parameterSnapshots: [
          {
            t: 0,
            mechanicalElements: mechanismRef.current.mechanicalElements,
            loads: mechanismRef.current.loads,
          },
        ],
        scrubbed: false,
      }));
    } else {
      exitToEdition();
    }
  }, [appMode, exitToEdition]);

  const handleSimulationGrab = useCallback(
    (
      key: string,
      target: Point2,
      bodyRatio?: number,
      gearPerimeter?: { gearID: string; angleOffset: number; radius: number },
      beltPin?: Extract<Link, { type: "BeltPin" }>,
    ) => {
      // Feed the grab into the recorder, which is what pulls on it while stepping
      const grab: SimGrab = beltPin
        ? { beltPin, target }
        : gearPerimeter
          ? {
              gearID: gearPerimeter.gearID,
              angleOffset: gearPerimeter.angleOffset,
              radius: gearPerimeter.radius,
              target,
            }
          : bodyRatio !== undefined
            ? { edgeID: key, t: bodyRatio, target }
            : { key, target };
      if (simulationRef.current.appMode === "edition") return;
      grabbingRef.current = true;
      recorder().setGrab(grab);
      // Start playback if paused: the grab only reaches the solver through the
      // recording loop, which needs to be running.
      if (!sim_clock().isPlaying) {
        setRuntimeState((prev) => ({ ...prev, isPlaying: true }));
      }
    },
    [],
  );

  const handleSimulationGrabEnd = useCallback(() => {
    grabbingRef.current = false;
    recorder().setGrab(null);
  }, []);

  const resetToStart = useCallback(() => {
    // Recompile from the initial geometry
    if (simulationRef.current.appMode !== "edition") {
      recorder().load(
        recorder_mode(simulationRef.current.appMode),
        mechanismRef.current,
        null,
      );
      recorder().setGravity(gravityRef.current);
      recorder().setCollisions(collisionsRef.current);
      recorder().setFloor(floorRef.current);
    }
    setRuntimeState((prev) => ({
      ...prev,
      time: 0,
      isPlaying: false,
      current: null,
      history: [],
      simulationSnapshots: [],
      parameterSnapshots: [
        {
          t: 0,
          mechanicalElements: mechanismRef.current.mechanicalElements,
          loads: mechanismRef.current.loads,
        },
      ],
    }));
  }, []);

  /** The violated constraints of the snapshot under the cursor, for what React displays.
   *  What the canvas draws does NOT come from here: it is published to `liveFrameRef` every
   *  frame, whereas this follows the mirror. Generic over the mode: `unsatisfied` is a base
   *  `SimulationSnapshot` field, so this needs no concrete subtype. */
  const currentUnsatisfied: ConstraintResidual[] =
    is_simulating(appMode) && runtimeState.simulationSnapshots.length > 0
      ? (runtimeState.simulationSnapshots[
          snapshot_index_at(runtimeState.simulationSnapshots, runtimeState.time)
        ]?.unsatisfied ?? [])
      : [];

  // A grab is a live intervention on the mechanism, so it only has a meaning where the
  // recording is being extended. Somewhere the user scrubbed to, playback re-reads what
  // exists and never consults the grab, so the canvas must not offer one.
  const canSimulationGrab = is_simulating(appMode) && !runtimeState.scrubbed;

  // ── État de la timeline, partagé par la top-bar et le rail ──
  //
  // `frontier` est le temps le plus avancé déjà calculé. Le curseur en deçà =
  // relecture ; au niveau de la frontière et en lecture = enregistrement.
  //
  // Le rail est toujours à l'échelle de la frontière : en enregistrement, on
  // est par définition au bout du temps connu, donc la tête reste collée à
  // droite. On la force à 100 % au lieu de calculer `time / frontier` — les
  // deux avancent ensemble mais pas au même rythme (le temps est continu, les
  // snapshots arrivent par pas de RECORD_DT), et cet écart d'arrondi est
  // exactement ce qui faisait vibrer la tête d'une image à l'autre.
  //
  // La POSITION de la tête ne passe pas par ici : elle change à chaque image et
  // sortirait au rythme du miroir, soit dix fois par seconde pour un canvas qui
  // en fait soixante. Elle est écrite par la boucle RAF dans `--playhead`.
  const {
    simulationSnapshots: timelineSnaps,
    time: timelineTime,
    isPlaying: timelinePlaying,
    scrubbed: timelineScrubbed,
  } = runtimeState;
  const timeline = useMemo(() => {
    const frontier =
      is_simulating(appMode) && timelineSnaps.length > 0
        ? timelineSnaps[timelineSnaps.length - 1].t
        : 0;
    // Read from the intent, not from a comparison of times: the frontier deliberately
    // runs ahead of the cursor while recording, by an amount that varies from frame to
    // frame (the worker produces in bursts). Comparing them makes the head flicker
    // between its two appearances at the rhythm of that burstiness.
    const recording = timelinePlaying && !timelineScrubbed;
    return {
      // The total the label announces — the cursor's own time while recording, not the
      // frontier. The frontier deliberately runs ahead of the cursor by the worker's lead,
      // and pausing deletes exactly that overshoot, so counting it announces a duration the
      // user is about to see disappear. It also contradicts the head, which is pinned to the
      // end of the rail by construction while recording.
      duration: recording ? timelineTime : frontier,
      recording,
      atStart: timelineTime <= 0,
      atEnd: recording || (frontier > 0 && timelineTime >= frontier - RETAIN_DT / 2),
      hasRecording: frontier > 0 || timelineSnaps.length > 0,
    };
  }, [appMode, timelineSnaps, timelineTime, timelinePlaying, timelineScrubbed]);

  return {
    runtimeState,
    liveFrameRef,
    timelineTrackRef,
    timeline,
    currentUnsatisfied,
    canSimulationGrab,
    handleSpaceKey,
    handleEscapeKey,
    handleSimulationGrab,
    handleSimulationGrabEnd,
    resetToStart,
    exitToEdition,
    pauseSimulation,
    resetSimulationState,
    /** For callers (undo/redo, applyActions) that need to reason about whether an edit
     *  reaches back before the simulation started, or should be treated as observation-only. */
    simulationRef,
    autoPlayOnEnterRef,
    simStartHistoryLengthRef,
    probeOnlyEditRef,
    loadValueOnlyEditRef,
  };
}
