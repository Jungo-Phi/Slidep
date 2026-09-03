import { describe, it } from "vitest";
import { appendFileSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { Link, Mechanism } from "../../src/types";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { compile_simulation_model } from "../../src/components/solver/dynamics/simulation-engine";

/**
 * What a beam-as-rigid-body model would cost on the gallery, counted on paper — see
 * docs/poutre-corps-rigide-dynamique.md, "le comptage sur la galerie réelle". Four columns per
 * mechanism: unknowns and constraint rows, current model and body model, kinematic and
 * dynamic.
 *
 * Modelling assumptions for the body column, all conservative in the SAME direction
 * (they favour the body model, so a bad result is a real one):
 *  - one beam = one body = 3 unknowns; its own internal links (any link whose keys are a
 *    subset of its two endpoints) and its dynamic midpoint disappear;
 *  - a node welded onto a beam by a `FixedOnSegment` is absorbed into that body: its own
 *    unknowns and that link's rows both go;
 *  - a node where k beams meet stops being an unknown and becomes pin joints instead:
 *    2·(k−1) rows if it is free, 2·k if it is grounded (each beam pinned to the frame);
 *  - everything else — sliders, gears, belts, masses not on a beam — is left exactly as it
 *    is, rows and unknowns alike.
 */

const OUT = "scratch/beam-body/out.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join("") + "\n", "utf8");

const keysOf = (link: Link): string[] => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(link as Record<string, unknown>))
    if (typeof v === "string" && k.toLowerCase().includes("key")) out.push(v);
  return out;
};

function count(mech: Mechanism) {
  const model = compile_simulation_model(mech);
  const free = (key: string) => (model.nodes.posMasses.get(key) ?? 1) > 0;

  const freePos = [...model.nodes.positions.keys()].filter(free);
  const freeAngles = [...model.nodes.angles.keys()];
  const links = model.links.filter((l) => l.ddl > 0);

  const kinUnknowns = 2 * freePos.length + freeAngles.length;
  const kinRows = links.reduce((s, l) => s + l.ddl, 0);

  const beams = model.dynamicMasses.beamMidpoints;
  const dynUnknowns = kinUnknowns + 2 * beams.length; // one midpoint per beam
  const dynRows = kinRows + 2 * beams.length; // its FixedOnSegment, ddl 2

  // ── The body model ──
  const ends = new Map<string, number>(); // endpoint key → how many beams meet there
  for (const b of beams)
    for (const key of [b.startKey, b.endKey]) ends.set(key, (ends.get(key) ?? 0) + 1);

  let bodyUnknowns = 3 * beams.length;
  let bodyRows = 0;

  // Nodes that are not beam endpoints keep their own unknowns.
  for (const key of freePos) if (!ends.has(key)) bodyUnknowns += 2;
  bodyUnknowns += freeAngles.length;

  // Joints where beams meet.
  for (const [key, k] of ends) bodyRows += free(key) ? 2 * (k - 1) : 2 * k;

  const internal = new Set<Link>();
  for (const b of beams) {
    const pair = new Set([b.startKey, b.endKey]);
    for (const link of links) {
      const keys = keysOf(link);
      if (keys.length > 0 && keys.every((k) => pair.has(k))) internal.add(link);
    }
  }
  // A node welded onto a beam is absorbed into it: link gone, node gone.
  let welded = 0;
  for (const link of links) {
    if (link.type !== "FixedOnSegment") continue;
    const onBeam = beams.some(
      (b) =>
        (b.startKey === link.key1 && b.endKey === link.key2) ||
        (b.startKey === link.key2 && b.endKey === link.key1),
    );
    if (!onBeam) continue;
    internal.add(link);
    if (free(link.key3)) {
      welded++;
      bodyUnknowns -= 2;
    }
  }
  for (const link of links) if (!internal.has(link)) bodyRows += link.ddl;

  return {
    beams: beams.length,
    welded,
    freePos: freePos.length,
    freeAngles: freeAngles.length,
    endpointNodes: ends.size,
    kinUnknowns,
    kinRows,
    dynUnknowns,
    dynRows,
    bodyUnknowns,
    bodyRows,
  };
}

describe("poutre = corps rigide", () => {
  it("ce que ça coûte sur la galerie", () => {
    writeFileSync(OUT, "", "utf8");
    say(
      "mécanisme".padEnd(34),
      "poutres".padStart(8),
      "cin. ddl/lignes".padStart(18),
      "dyn. ddl/lignes".padStart(18),
      "corps ddl/lignes".padStart(18),
      "  (pos/ang/nœuds-bout/soudés)",
    );
    for (const file of readdirSync("test-mechanisms").filter((f) => f.endsWith(".slidep"))) {
      const mech = load_mechanism(
        JSON.parse(readFileSync(`test-mechanisms/${file}`, "utf8")),
      ).mechanism;
      const c = count(mech);
      say(
        file.replace(".slidep", "").padEnd(34),
        String(c.beams).padStart(8),
        `${c.kinUnknowns}/${c.kinRows}`.padStart(18),
        `${c.dynUnknowns}/${c.dynRows}`.padStart(18),
        `${c.bodyUnknowns}/${c.bodyRows}`.padStart(18),
        `  (${c.freePos}/${c.freeAngles}/${c.endpointNodes}/${c.welded})`,
      );
    }
  }, 900_000);
});
