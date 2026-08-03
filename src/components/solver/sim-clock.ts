import { useEffect, useReducer } from "react";
import { DEFAULT_RUNTIME_STATE, RuntimeState } from "../../types/runtime-state";

/**
 * The simulation clock, held outside React.
 *
 * `time` and `kinematicSnapshots` change on every recorded frame, and nobody *decides* them. Carrying them in a state the whole tree depends on asked React to
 * reconcile the application sixty times a second — measured at 42 ms per render in a
 * production build, for a canvas that draws in 2 ms. They live here instead; React only
 * mirrors them, at a rate that suits reading numbers rather than moving a mechanism.
 *
 * Read it with {@link useSimClock} to re-render on change, or {@link sim_clock} for the
 * authoritative value — the recording loop needs the latter, since a mirror one frame late
 * would make the clock drift by whatever the mirror skipped.
 *
 * Writing goes through {@link set_sim_clock}, whose signature is React's on purpose: every
 * `setRuntimeState(prev => …)` call site keeps working unchanged.
 */

/** Fields a user just asked for: they must reach the screen on this frame, not the next. */
const INTENT = [
  "isPlaying",
  "speed",
  "scrubbed",
  "current",
  "history",
] as const satisfies readonly (keyof RuntimeState)[];

type Listener = (urgent: boolean) => void;

let state: RuntimeState = DEFAULT_RUNTIME_STATE;
const listeners = new Set<Listener>();

/** The authoritative runtime state, always current. */
export function sim_clock(): RuntimeState {
  return state;
}

export function set_sim_clock(
  update: RuntimeState | ((prev: RuntimeState) => RuntimeState),
): void {
  const next = typeof update === "function" ? update(state) : update;
  if (next === state) return;
  const urgent = INTENT.some((key) => next[key] !== state[key]);
  state = next;
  for (const listener of listeners) listener(urgent);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mirrors the clock into the calling component, which re-renders at most every
 * `minIntervalMs` on frame-driven change — and always at once on a change of intent.
 *
 * Call it as low in the tree as the value is actually read: the whole point is that the
 * component which re-renders is a leaf, not the application.
 */
export function useSimClock(minIntervalMs: number): RuntimeState {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      last = performance.now();
      bump();
    };
    const unsubscribe = subscribe((urgent) => {
      if (urgent) {
        if (timer !== null) clearTimeout(timer);
        flush();
        return;
      }
      // A pending timer already carries this change: the mirror reads the store when it
      // renders, so there is nothing per-change to keep.
      if (timer !== null) return;
      const due = minIntervalMs - (performance.now() - last);
      if (due <= 0) flush();
      else timer = setTimeout(flush, due);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [minIntervalMs]);
  return state;
}
