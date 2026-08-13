import { describe, expect, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { ID } from "../../types";
import { KinematicSnapshot, SnapshotLayout } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import { dead_points } from "./dead-points";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";

const MOTOR = "00000000-0000-0000-0000-00000000000p" as ID;

const LAYOUT: SnapshotLayout = {
  keys: [],
  index: new Map(),
  angleKeys: [],
  angleIndex: new Map(),
  belts: [],
  beltIndex: new Map(),
  beltStart: new Int32Array([0]),
  wrapBase: 0,
  detachBase: 0,
  arrivalBase: 0,
};

/**
 * A recording where `blocked[i]` says whether the simulation reported the motor stalled.
 *
 * Written by hand rather than simulated: that flag IS what this module reads, and a real
 * mechanism cannot be asked to jam on cue.
 */
function recording(blocked: boolean[]): KinematicSnapshot[] {
  return blocked.map((stuck, i) => ({
    t: i * RECORD_DT,
    layout: LAYOUT,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    ...(stuck
      ? {
          unsatisfied: [
            { owner: MOTOR, type: "MotorAngle", residual: 1 },
            // A residual of another kind on the same frame must not read as a block.
            { owner: MOTOR, type: "Distance", residual: 2 },
          ],
        }
      : {}),
  }));
}

const free = (n: number) => Array.from({ length: n }, () => false);
const stuck = (n: number) => Array.from({ length: n }, () => true);

describe("dead_points", () => {
  it("un moteur qui tourne librement ne dit rien", () => {
    expect(dead_points(recording(free(200)))).toEqual([]);
  });

  it("nomme le moteur, l'instant où il cale et celui où il repart", () => {
    const snapshots = recording([...free(50), ...stuck(30), ...free(50)]);
    const found = dead_points(snapshots);
    expect(found.map((p) => p.kind)).toEqual(["blocked", "released"]);
    expect(found.every((p) => p.motor === MOTOR)).toBe(true);
    // Chacun daté de la frame qui porte le changement — le début du blocage, pas la
    // frame où il devient certain ; la première frame libre, pas la dernière bloquée.
    expect(found[0].t).toBeCloseTo(snapshots[50].t, 9);
    expect(found[1].t).toBeCloseTo(snapshots[80].t, 9);
  });

  it("un blocage qui dure jusqu'au bout n'a pas de sortie", () => {
    // Rien n'en est sorti : la marque de sortie annoncerait un dégagement que
    // l'enregistrement ne montre pas.
    const found = dead_points(recording([...free(20), ...stuck(30)]));
    expect(found.map((p) => p.kind)).toEqual(["blocked"]);
  });

  it("une frame isolée n'est ni un blocage ni une sortie", () => {
    // Le nombre de frames exigé est injecté : c'est un réglage, pas un fait. La sortie
    // n'existe que pour un blocage rapporté, sinon une frame isolée écartée à l'entrée
    // reviendrait par la porte de derrière.
    const snapshots = recording([...free(20), true, ...free(20)]);
    expect(dead_points(snapshots, { minBlockedFrames: 2 })).toEqual([]);
    expect(
      dead_points(snapshots, { minBlockedFrames: 1 }).map((p) => p.kind),
    ).toEqual(["blocked", "released"]);
  });

  it("un blocage qui revient sur un rythme est rapporté à chaque occurrence", () => {
    const cycle = [...free(40), ...stuck(10)];
    const found = dead_points(
      recording([...cycle, ...cycle, ...cycle, ...cycle, ...free(1)]),
    );
    expect(found.filter((p) => p.kind === "blocked")).toHaveLength(4);
    expect(found.filter((p) => p.kind === "released")).toHaveLength(4);
  });

  it("des blocages irréguliers restent une liste", () => {
    const found = dead_points(
      recording([
        ...free(20),
        ...stuck(10),
        ...free(70),
        ...stuck(10),
        ...free(15),
        ...stuck(10),
        ...free(20),
      ]),
    );
    expect(found.filter((p) => p.kind === "blocked")).toHaveLength(3);
    expect(found.filter((p) => p.kind === "released")).toHaveLength(3);
  });

  it("allonger l'enregistrement ne déplace pas ce qui précède", () => {
    // Même exigence que pour les marques de courroie : le rail s'écrit au fil de
    // l'enregistrement, et une marque qui saute se lit comme un défaut.
    const full = recording([...free(30), ...stuck(10), ...free(90)]);
    const early = dead_points(full.slice(0, 60));
    expect(dead_points(full).slice(0, early.length)).toEqual(early);
  });

  it("ne dépend que de ce que la simulation a enregistré", () => {
    // Le verdict est daté : il appartient aux réglages sous lesquels la frame a été
    // enregistrée. Le recalculer ici — diviser le mouvement d'hier par le régime
    // commandé d'aujourd'hui — faisait basculer tout le passé d'un coup dès qu'on
    // inversait le moteur en cours de simulation, et posait un blocage à t = 0.
    const snapshots = recording([...free(40), ...stuck(20), ...free(40)]);
    const before = dead_points(snapshots);
    // Rien du mécanisme n'entre dans le calcul : il n'y a aucun réglage à périmer.
    expect(dead_points(structuredClone(snapshots))).toEqual(before);
    expect(before).toHaveLength(2);
  });
});

/** `n` recorded frames of a reference mechanism. */
function record(json: string, n: number) {
  const { mechanism } = load_mechanism(JSON.parse(json));
  const model = compile_simulation_model(mechanism);
  const snapshots: KinematicSnapshot[] = [];
  let snapshot: KinematicSnapshot | null = null;
  for (let i = 0; i < n; i++) {
    snapshot = step_simulation(model, i * RECORD_DT, snapshot);
    snapshots.push(snapshot);
  }
  return snapshots;
}

describe("dead_points — mécanismes de référence", () => {
  it("un mécanisme qui tourne rond ne produit aucune marque", () => {
    // Le vrai risque du détecteur est le faux positif : une marque sur chaque
    // mécanisme sain rendrait le rail illisible et la fonction inutile.
    for (const json of [vilbrequin, jansen, decon, doubleSlider, coreXY2])
      expect(dead_points(record(json, 300))).toEqual([]);
  }, 60_000);

  it("Poulie bloqueuse cale, ce que son nom annonce", () => {
    const found = dead_points(record(poulie, 300));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].t).toBeGreaterThan(0);
  }, 60_000);
});
