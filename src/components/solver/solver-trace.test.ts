import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../types";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import {
  collect_solver_trace,
  set_solver_trace,
  solver_trace,
  trace_by_link,
} from "./solver-trace";

/** Two nodes 100 px apart, asked to be 150 apart: one Distance link to watch. */
function stretched() {
  const positions = new Map<string, Point2>([
    ["a", new Point2(0, 0)],
    ["b", new Point2(100, 0)],
  ]);
  const posMasses = new Map<string, number>([
    ["a", 0],
    ["b", 1],
  ]);
  const links: Link[] = [
    { type: "Distance", ddl: 1, key1: "a", key2: "b", distance: 150 },
  ];
  return { positions, posMasses, links };
}

function solve(nbIterations = 3) {
  const { positions, posMasses, links } = stretched();
  PBD_kinematic_solver(
    positions,
    new Map(),
    posMasses,
    new Map(),
    links,
    nbIterations,
  );
}

describe("solver trace", () => {
  it("est inactive par défaut", () => {
    expect(solver_trace()).toBeNull();
  });

  it("rapporte une application par lien et par itération", () => {
    // Un seul lien, satisfait dès le premier balayage : le solveur en exécute
    // un second, n'y trouve plus rien à corriger, et sort.
    const events = collect_solver_trace(() => solve(3));
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.iteration)).toEqual([0, 1]);
    expect(events[0].link.type).toBe("Distance");
  });

  it("rapporte le noeud déplacé, et lui seul", () => {
    const events = collect_solver_trace(() => solve(1));
    // "a" est ancré (masse 0) : seul "b" bouge, de 50 px.
    expect(events[0].moves).toHaveLength(1);
    expect(events[0].moves[0].key).toBe("b");
    expect(events[0].moves[0].distance).toBeCloseTo(50);
    expect(events[0].residual).toBeCloseTo(50);
  });

  it("agrège par lien, en ignorant les premières itérations", () => {
    const events = collect_solver_trace(() => solve(3));
    const [worst] = trace_by_link(events, 1);
    expect(worst.index).toBe(0);
    expect(worst.applications).toBe(1);
    // Convergé dès la première itération : plus rien ne bouge ensuite.
    expect(worst.moved).toBeCloseTo(0);
  });

  it("se retire même si le corps lève", () => {
    expect(() =>
      collect_solver_trace(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(solver_trace()).toBeNull();
  });

  it("ne trace plus rien une fois retirée", () => {
    const events: unknown[] = [];
    set_solver_trace((e) => events.push(e));
    set_solver_trace(null);
    solve(2);
    expect(events).toHaveLength(0);
  });
});
