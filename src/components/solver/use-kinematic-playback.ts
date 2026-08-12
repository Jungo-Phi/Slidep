import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AppMode,
  Link,
  Mechanism,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_RUNTIME_STATE,
  SimulationConfig,
  Point2,
} from "../../types";
import { RuntimeState } from "../../types/runtime-state";
import { LiveFrame } from "../canvas/MechanicalCanvas";
import {
  MAX_RECORDING_TIME,
  RECORD_DT,
  RETAIN_DT,
  recording_full,
  SimGrab,
  apply_snapshot_to_mechanism,
  snapshot_at,
  snapshot_index_at,
} from "./kinematic-simulation";
import { RecorderClient } from "./recorder-client";
import {
  set_sim_clock as setRuntimeState,
  sim_clock,
  useSimClock,
} from "./sim-clock";
import {
  EMPTY_TRAJECTORY_CACHE,
  TrajectoryCache,
  extend_probe_trajectories,
  trajectories_at,
} from "./probe-series";
import { PROBE_ELEMENT_COLORS } from "../properties-panel/components/ProbeChart";

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

export type SimulationLimitReason = "time" | "memory";

export type UseKinematicPlaybackArgs = {
  mechanism: Mechanism;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  setCanvasState: (state: { type: "Selecting" }) => void;
  /** Called when the recording hits `MAX_RECORDING_TIME` or the snapshot memory cap. */
  onRecordingLimitReached: (reason: SimulationLimitReason, maxTime: number) => void;
};

/**
 * Everything needed to drive and observe the kinematic simulation: the recording worker, the
 * RAF loop that steps it, and the handlers Space/Escape/grab feed into it.
 *
 * `mechanism`/`appMode` are read through a ref (`kinematicRef`) rather than closed over, so
 * the RAF effect can stay mounted once for the app's lifetime instead of re-subscribing on
 * every render.
 */
export function useKinematicPlayback({
  mechanism,
  appMode,
  setAppMode,
  setCanvasState,
  onRecordingLimitReached,
}: UseKinematicPlaybackArgs) {
  const runtimeState = useSimClock(CLOCK_MIRROR_MS);

  const mechanismRef = useRef(mechanism);
  mechanismRef.current = mechanism;

  // The runtime state is NOT mirrored here: `sim_clock()` is authoritative and always
  // current, whereas this ref would only ever hold what the last render happened to see.
  const kinematicRef = useRef({ mechanism, appMode });
  kinematicRef.current = { mechanism, appMode };
  /** What the canvas draws, republished every frame. */
  const liveFrameRef = useRef<LiveFrame | null>(null);
  const trajectoryCacheRef = useRef<TrajectoryCache>(EMPTY_TRAJECTORY_CACHE);
  const kinematicLastWallTime = useRef<number | null>(null);
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

  // Reset kinematic state on every mode change (fresh start each time)
  useEffect(() => {
    kinematicLastWallTime.current = null;
    if (appMode !== "edition") {
      simStartHistoryLengthRef.current = mechanismRef.current.history.length;
      // Compile the frozen simulation model from the current mechanism.
      recorder().load(mechanismRef.current, null);
    }
    // Capture the flag synchronously: the setRuntimeState updater below runs
    // later, after this line has already reset the ref to false.
    const shouldAutoPlay = appMode !== "edition" && autoPlayOnEnterRef.current;
    autoPlayOnEnterRef.current = false;
    setRuntimeState((prev) => ({
      ...prev,
      isPlaying: shouldAutoPlay,
      time: 0,
      kinematicSnapshots: [],
      scrubbed: false,
    }));
  }, [appMode]);

  // Recompile the simulation model + truncate future snapshots whenever the
  // mechanism is edited during simulation. Re-bake references from the current
  // simulated state (apply the last snapshot first) so motor angle and gear
  // rotations stay continuous across the edit.
  useEffect(() => {
    const probeOnly = probeOnlyEditRef.current;
    probeOnlyEditRef.current = false;
    if (kinematicRef.current.appMode === "edition") return;
    // Probe-config edits don't affect the simulated motion: keep the model
    // and the already-recorded snapshots.
    if (probeOnly) return;
    const rs = sim_clock();
    const snaps = rs.kinematicSnapshots;
    const baseSnap =
      snaps.length > 0 ? snaps[snapshot_index_at(snaps, rs.time)] : null;
    const baseMech = baseSnap
      ? apply_snapshot_to_mechanism(mechanism, baseSnap)
      : mechanism;
    recorder().load(baseMech, baseSnap);
    setRuntimeState((prev) => ({
      ...prev,
      kinematicSnapshots: prev.kinematicSnapshots.filter((s) => s.t <= rs.time),
    }));
    // Depend on geometry/topology only, not the whole mechanism: a viewport
    // (pan/zoom) change keeps these array refs identical, so it no longer
    // recompiles the simulation model nor truncates the snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanism.mechanicalElements, mechanism.constraintElements, mechanism.loads]);

  // RAF loop: records kinematic snapshots while playing in kinematic mode
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
    let shownSnaps: RuntimeState["kinematicSnapshots"] | null = null;
    let shownMechanism: Mechanism | null = null;
    let shownHeld = false;
    let shownExtending = false;
    const publish = (mode: AppMode) => {
      if (mode !== "kinematic") {
        liveFrameRef.current = null;
        trajectoryCacheRef.current = EMPTY_TRAJECTORY_CACHE;
        shownSnaps = null;
        return;
      }
      const { mechanism: mech } = kinematicRef.current;
      const rs = sim_clock();
      const held = grabbingRef.current;
      // Pausing changes what the trajectories show without moving the clock, so it has to be
      // part of what makes a frame stale — otherwise the faded segment appears only at the
      // next scrub.
      const extending = rs.isPlaying && !rs.scrubbed;
      if (
        rs.time === shownTime &&
        rs.kinematicSnapshots === shownSnaps &&
        mech === shownMechanism &&
        held === shownHeld &&
        extending === shownExtending
      )
        return;
      shownTime = rs.time;
      shownSnaps = rs.kinematicSnapshots;
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
      const snaps = rs.kinematicSnapshots;
      const snapshot =
        held && snaps.length > 0
          ? snaps[snaps.length - 1]
          : snapshot_at(snaps, rs.time);
      if (!snapshot) {
        liveFrameRef.current = null;
        return;
      }
      // The cache is only ever extended by the new snapshots: rebuilding whole trajectories
      // every frame costs the square of the recorded duration.
      trajectoryCacheRef.current = extend_probe_trajectories(
        trajectoryCacheRef.current,
        mech.mechanicalElements,
        rs.kinematicSnapshots,
      );
      liveFrameRef.current = {
        mechanism: apply_snapshot_to_mechanism(mech, snapshot),
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
      publish(kinematicRef.current.appMode);
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
      const snapshots = rs.kinematicSnapshots;
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
        kinematicSnapshots: kept,
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
      const snapshots = rs.kinematicSnapshots;
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
      const { appMode: mode } = kinematicRef.current;
      const rs = sim_clock();

      if (mode !== "kinematic" || !rs.isPlaying) {
        kinematicLastWallTime.current = null;
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
          if (!replayingRef.current && !rs.scrubbed && mode === "kinematic")
            discardUnshown();
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

      const lastWallTime = kinematicLastWallTime.current;
      kinematicLastWallTime.current = wallTime;

      if (lastWallTime === null) return;

      const realDt = Math.min((wallTime - lastWallTime) / 1000, 0.1);
      const simDt = realDt * rs.speed;

      // Replay: history exists ahead of the cursor → just walk it, solving nothing.
      if (replayingRef.current) {
        setRuntimeState((prev) => {
          const prevFrontier =
            prev.kinematicSnapshots.length > 0
              ? prev.kinematicSnapshots[prev.kinematicSnapshots.length - 1].t
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
            prev.kinematicSnapshots.length > 0
              ? prev.kinematicSnapshots[prev.kinematicSnapshots.length - 1].t
              : -RECORD_DT;
          const uniqueSnaps = newSnaps.filter((s) => s.t > prevFrontier);
          return {
            ...prev,
            // Landing the cursor ON the end, as the replay branch does: stopping it where it
            // happened to be would leave the last recorded instants unseen.
            time: exhausted && reached !== null ? reached : newTime,
            ...(exhausted ? { isPlaying: false } : {}),
            kinematicSnapshots:
              uniqueSnaps.length > 0
                ? [...prev.kinematicSnapshots, ...uniqueSnaps]
                : prev.kinematicSnapshots,
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
  }, []); // intentionally runs once; all state accessed via kinematicRef

  const handleSpaceKey = useCallback(
    (lastSimulationMode: AppMode) => {
      if (appMode === "edition") {
        // Arm auto-play so the mode-change effect starts the simulation instead
        // of resetting isPlaying to false right after we set it.
        autoPlayOnEnterRef.current = true;
        setAppMode(lastSimulationMode);
        // Entering simulation restarts from a clean canvas, just like Space does in the canvas handler.
        setCanvasState({ type: "Selecting" });
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
      recorder().load(mechanismRef.current, null);
      setRuntimeState((prev) => ({
        ...prev,
        time: 0,
        isPlaying: false,
        current: null,
        history: [],
        kinematicSnapshots: [],
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
      if (kinematicRef.current.appMode === "edition") return;
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
    if (kinematicRef.current.appMode !== "edition")
      recorder().load(mechanismRef.current, null);
    setRuntimeState((prev) => ({
      ...prev,
      time: 0,
      isPlaying: false,
      current: null,
      history: [],
      kinematicSnapshots: [],
    }));
  }, []);

  /** The snapshot under the cursor, for what React displays — the violated constraints. What
   *  the canvas draws does NOT come from here: it is published to `liveFrameRef` every frame,
   *  whereas this follows the mirror. */
  const currentKinematicSnapshot =
    appMode === "kinematic"
      ? snapshot_at(runtimeState.kinematicSnapshots, runtimeState.time)
      : null;

  // A grab is a live intervention on the mechanism, so it only has a meaning where the
  // recording is being extended. Somewhere the user scrubbed to, playback re-reads what
  // exists and never consults the grab, so the canvas must not offer one.
  const canSimulationGrab = appMode === "kinematic" && !runtimeState.scrubbed;

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
    kinematicSnapshots: timelineSnaps,
    current: timelineCurrent,
    time: timelineTime,
    isPlaying: timelinePlaying,
    scrubbed: timelineScrubbed,
  } = runtimeState;
  const timeline = useMemo(() => {
    const frontier =
      appMode === "kinematic" && timelineSnaps.length > 0
        ? timelineSnaps[timelineSnaps.length - 1].t
        : timelineCurrent
          ? timelineCurrent.timestamp
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
  }, [appMode, timelineSnaps, timelineCurrent, timelineTime, timelinePlaying, timelineScrubbed]);

  return {
    runtimeState,
    liveFrameRef,
    timelineTrackRef,
    timeline,
    currentKinematicSnapshot,
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
    kinematicRef,
    autoPlayOnEnterRef,
    simStartHistoryLengthRef,
    probeOnlyEditRef,
  };
}
