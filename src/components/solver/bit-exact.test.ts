/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — temporary scaffolding: it reads and writes its fixture through node's
// `fs`, and the project has no `@types/node`. Goes away with the file.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import coreXYMod from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import slider from "../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "./kinematic-simulation";
import { get_geom_nodes, get_links_geometric } from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { sort_links } from "./utils";

/**
 * TEMPORARY — the acceptance criterion of the belt-geometry work (`docs/belt-kinematic-
 * solver/plan-implementation.md`, chantier 4): the optimisation only changes how the belt
 * geometry is computed, never what it computes, so every mechanism must end on
 * bit-identical numbers. Delete this file and its fixture once that chantier is done.
 *
 * `CAPTURE=1 npx vitest run src/components/solver/bit-exact.test.ts` rewrites the fixture.
 * Recapture ONLY when a change is meant to move the numbers, and say so — the whole value
 * of this file is that nothing quietly drifts under it.
 */

const FIXTURE = resolve(__dirname, "__fixtures__/bit-exact-reference.json");

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Core XY modifié", coreXYMod],
  ["Core XY", coreXY],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Test slider", slider],
  ["Vilbrequin", vilbrequin],
];

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

/** Sorted [key, …values] rows: the comparison is about the numbers, not about map order. */
type Rows = [string, ...number[]][];

const positionRows = (m: Map<string, Point2>): Rows =>
  [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, p]) => [k, p.x, p.y]);

const scalarRows = (m: Map<string, number>): Rows =>
  [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, v]);

/** First free node, in map order: a deterministic grab victim without naming ids. */
function firstFreeKey(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
): string | undefined {
  for (const key of positions.keys()) if ((posMasses.get(key) ?? 1) === 1) return key;
  return undefined;
}

function runSimulation(json: string, frames: number, withGrab: boolean) {
  const model = compile_simulation_model(loadFixture(json));
  const grabKey = withGrab
    ? firstFreeKey(model.nodes.positions, model.nodes.posMasses)
    : undefined;
  const from = grabKey ? model.nodes.positions.get(grabKey)!.clone() : undefined;
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    const target =
      from && new Point2(from.x + (37 * (i + 1)) / frames, from.y - (23 * (i + 1)) / frames);
    const s = step_simulation(
      model,
      i / 60,
      positions,
      angles,
      1 / 60,
      target && grabKey ? { key: grabKey, target } : undefined,
    );
    positions = s.positions;
    angles = s.angles;
  }
  return { positions: positionRows(positions!), angles: scalarRows(angles!) };
}

/**
 * Edition path, driven straight at the solver: geometric links carry the radius DOFs
 * (`Radius`, `GearRatio`, `GearMeshing`, `BeltLength.radKeys`) that the simulation never
 * exercises. A `HandleGrab` on one free node stands in for the drag.
 */
function runGeometric(json: string) {
  const mechanism = loadFixture(json);
  const nodes = get_geom_nodes(mechanism.mechanicalElements);
  const links = get_links_geometric(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
  );
  const grabKey = firstFreeKey(nodes.positions, nodes.posMasses);
  const all: Link[] = grabKey
    ? [
        ...links,
        {
          type: "HandleGrab",
          ddl: 1,
          grabbedKey: grabKey,
          value: nodes.positions.get(grabKey)!.add(new Point2(37, -23)),
        },
      ]
    : links;
  const solved = PBD_kinematic_solver(
    new Map(nodes.positions),
    new Map(nodes.radii),
    nodes.posMasses,
    nodes.radMasses,
    sort_links(all, nodes.posMasses),
    300,
  );
  return {
    positions: positionRows(solved.positions),
    radii: scalarRows(solved.radii),
  };
}

function capture() {
  const out: Record<string, unknown> = {};
  for (const [name, json] of MECHANISMS) {
    out[`${name} / sim`] = runSimulation(json, 60, false);
    out[`${name} / sim+grab`] = runSimulation(json, 30, true);
    out[`${name} / geom`] = runGeometric(json);
  }
  return out;
}

describe("écart à la référence", () => {
  it("les 9 mécanismes rendent les mêmes nombres, au bit près", () => {
    const actual = capture();
    if (process.env.CAPTURE || !existsSync(FIXTURE)) {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 1));
      console.log(`référence écrite : ${FIXTURE}`);
      return;
    }
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8"));
    // Matched by KEY, not by index, so that a change in how nodes are ordered or named is
    // not read as a change in what the solver computes.
    const perScenario: [string, number][] = [];
    for (const scenario of Object.keys(expected)) {
      const a = actual[scenario] as Record<string, [string, ...number[]][]>;
      const b = expected[scenario] as Record<string, [string, ...number[]][]>;
      let scenarioWorst = 0;
      for (const family of Object.keys(b)) {
        const mine = new Map(a[family].map(([k, ...v]) => [k, v]));
        for (const [key, ...values] of b[family]) {
          const actualValues = mine.get(key);
          if (actualValues === undefined) continue;
          values.forEach((v, j) => {
            const drift = Math.abs(actualValues[j] - v);
            if (drift > scenarioWorst) scenarioWorst = drift;
          });
        }
      }
      perScenario.push([scenario, scenarioWorst]);
    }
    const worst = Math.max(...perScenario.map(([, d]) => d));
    console.log("\n  | scénario | pire écart à la référence |");
    console.log("  |---|---|");
    for (const [scenario, d] of perScenario.sort((x, y) => y[1] - x[1]))
      console.log(`  | ${scenario} | ${d.toExponential(2)} |`);
    console.log(`\n  pire écart : ${worst.toExponential(3)}`);

    // Bit-identical, not "close": the point is to catch a rewrite that computes the same
    // geometry a different way and drifts by a last-place digit.
    expect(worst).toBe(0);
  }, 300_000);
});
