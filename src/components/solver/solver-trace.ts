import { Link } from "../../types";

/**
 * Debug tracing of the PBD solve, off by default.
 *
 * The solver is a Gauss-Seidel sweep: every link is applied in turn, each one
 * reading what the previous ones left. A residual measured at the end of a
 * solve says which constraints are unhappy, never which one pushed against
 * which — that only shows in what each individual application moves. This is
 * the hook that exposes it.
 *
 * Usage: wrap the run in `collect_solver_trace`, or call `set_solver_trace`
 * directly for a long-running capture. Enabling it copies the position map
 * before every link application, so expect the solve to be far slower.
 */

/** What one constraint application did. */
export interface SolverTraceEvent {
  /** Gauss-Seidel sweep number, from 0. */
  iteration: number;
  /** Index of the link in the solver's list — its position in the sweep. */
  index: number;
  link: Link;
  /** Error the constraint reported, in its own unit (px, rad or ratio). */
  residual: number;
  /** Nodes this application moved, in px. */
  moves: { key: string; distance: number }[];
  /** Rotation nodes this application turned, in rad (gears, belt phases). */
  angleMoves: { key: string; delta: number }[];
}

export type SolverTrace = (event: SolverTraceEvent) => void;

let activeTrace: SolverTrace | null = null;

/** Installs a trace, or removes it with `null`. */
export function set_solver_trace(trace: SolverTrace | null): void {
  activeTrace = trace;
}

/** The installed trace, read once per solve — never per link. */
export function solver_trace(): SolverTrace | null {
  return activeTrace;
}

/**
 * Runs `body` with tracing on and returns everything the solver did, restoring
 * the previous trace afterwards (including when `body` throws).
 */
export function collect_solver_trace(body: () => void): SolverTraceEvent[] {
  const events: SolverTraceEvent[] = [];
  const previous = activeTrace;
  activeTrace = (event) => events.push(event);
  try {
    body();
  } finally {
    activeTrace = previous;
  }
  return events;
}

/** Total distance each link moved the mechanism, worst first — who is pushing
 *  hardest, once the solve should have settled. `from` skips the early sweeps,
 *  where every link legitimately moves a lot. */
export function trace_by_link(
  events: SolverTraceEvent[],
  from = 0,
): { index: number; link: Link; applications: number; moved: number }[] {
  const byIndex = new Map<
    number,
    { index: number; link: Link; applications: number; moved: number }
  >();
  for (const event of events) {
    if (event.iteration < from) continue;
    const entry = byIndex.get(event.index) ?? {
      index: event.index,
      link: event.link,
      applications: 0,
      moved: 0,
    };
    entry.applications += 1;
    for (const move of event.moves) entry.moved += move.distance;
    byIndex.set(event.index, entry);
  }
  return [...byIndex.values()].sort((a, b) => b.moved - a.moved);
}
