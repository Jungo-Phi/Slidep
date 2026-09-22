import { describe, expect, it } from "vitest";
import coreXY2 from "../../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import decon from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import jansen from "../../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../../test-mechanisms/Vilbrequin.slidep?raw";
import { ID } from "../../../types";
import { KinematicSnapshot, SnapshotLayout } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import { dead_points, motors_blocked_at } from "./dead-points";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "../dynamics/simulation-engine";

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
 * Written by hand rather than simulated: that flag IS what this module reads, and a real mechanism cannot be asked to jam on cue.
 */
function recording(blocked: boolean[]): KinematicSnapshot[] {
  return blocked.map((stuck, i) => ({
    t: i * RECORD_DT,
    layout: LAYOUT,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    ...(stuck ? { stalledMotors: [MOTOR] } : {}),
    // A motor's own constraint left unconverged is a solve that ran short, not a stall.
    unsatisfied: [{ owner: MOTOR, type: "MotorAngle", residual: 1 }],
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
    // Each timed at the frame that carries the change — the start of the block, not the frame it becomes certain on; the first free frame, not the last blocked one.
    expect(found[0].t).toBeCloseTo(snapshots[50].t, 9);
    expect(found[1].t).toBeCloseTo(snapshots[80].t, 9);
  });

  it("un blocage qui dure jusqu'au bout n'a pas de sortie", () => {
    // Nothing came out of it: a release mark would announce an escape the recording does not show.
    const found = dead_points(recording([...free(20), ...stuck(30)]));
    expect(found.map((p) => p.kind)).toEqual(["blocked"]);
  });

  it("une frame isolée n'est ni un blocage ni une sortie", () => {
    // The number of frames required is injected: it is a setting, not a fact.
    // A release exists only for a reported block, or an isolated frame turned away at the door would come back in through the back one.
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
    // The same requirement as the belt marks: the rail is written as the recording grows, and a mark that jumps reads as a defect.
    const full = recording([...free(30), ...stuck(10), ...free(90)]);
    const early = dead_points(full.slice(0, 60));
    expect(dead_points(full).slice(0, early.length)).toEqual(early);
  });

  it("ne dépend que de ce que la simulation a enregistré", () => {
    // The verdict is dated: it belongs to the settings the frame was recorded under.
    // Recomputing it here — yesterday's motion divided by today's commanded rate — would flip the whole past at once the moment a motor is reversed mid-run, and would file a block at t = 0.
    const snapshots = recording([...free(40), ...stuck(20), ...free(40)]);
    const before = dead_points(snapshots);
    // Nothing of the mechanism enters the computation, so there is no setting to go stale.
    expect(dead_points(structuredClone(snapshots))).toEqual(before);
    expect(before).toHaveLength(2);
  });
});

/** The frames a timeline mark says the motor is blocked on, read back from `dead_points`. */
function marked_blocked(snapshots: KinematicSnapshot[], minBlockedFrames: number): boolean[] {
  const marks = dead_points(snapshots, { minBlockedFrames });
  const lit = snapshots.map(() => false);
  for (const start of marks.filter((m) => m.kind === "blocked")) {
    const end = marks.find((m) => m.kind === "released" && m.t > start.t);
    for (let i = 0; i < snapshots.length; i++)
      if (snapshots[i].t >= start.t && (!end || snapshots[i].t < end.t)) lit[i] = true;
  }
  return lit;
}

/** Whether the witness is lit at each frame of `snapshots`. */
const witness = (snapshots: KinematicSnapshot[], minBlockedFrames: number): boolean[] =>
  snapshots.map((_, i) => motors_blocked_at(snapshots, i, { minBlockedFrames }).has(MOTOR));

describe("motors_blocked_at", () => {
  it("un blocage trop court pour être marqué n'allume rien", () => {
    expect(witness(recording([...free(3), true, ...free(3)]), 2).some(Boolean)).toBe(false);
  });

  it("le témoin couvre le blocage entier, sa première image comprise", () => {
    // The frame a rail mark points at is the one the block began on: landing there must show it lit, which is what looking ahead buys.
    expect(witness(recording([false, true, true, true, false, false]), 2)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("le seuil est injecté : à une image, le témoin s'allume immédiatement", () => {
    expect(witness(recording([false, true, false]), 1)).toEqual([false, true, false]);
  });

  it("la contrainte du moteur laissée non convergée n'est pas un blocage", () => {
    // `recording` leaves the motor's own constraint unsatisfied on every frame, as a sweep that ran short does.
    const snapshots = recording(free(4));
    expect(witness(snapshots, 2)).toEqual([false, false, false, false]);
    expect(dead_points(snapshots)).toEqual([]);
  });

  it("hors de l'enregistrement, personne n'est bloqué", () => {
    const snapshots = recording(stuck(3));
    expect(motors_blocked_at(snapshots, -1).size).toBe(0);
    expect(motors_blocked_at(snapshots, 3).size).toBe(0);
    expect(motors_blocked_at([], 0).size).toBe(0);
  });

  it("le témoin s'allume exactement sur les images que le rail marque", () => {
    // The property the whole thing is for: clicking a mark lands on a frame the panel and the canvas agree is blocked.
    const snapshots = recording([...free(2), ...stuck(5), ...free(3), ...stuck(4), false]);
    for (const minBlockedFrames of [1, 2, 3])
      expect(witness(snapshots, minBlockedFrames)).toEqual(
        marked_blocked(snapshots, minBlockedFrames),
      );
  });

  it("à la frontière, un blocage encore trop court n'allume rien", () => {
    // The frames ahead do not exist yet while recording, so a run that has not earned its mark lights nothing — which is what keeps the witness from flickering.
    expect(witness(recording([...free(3), true]), 2).some(Boolean)).toBe(false);
    expect(witness(recording([...free(3), true, true]), 2).slice(3)).toEqual([true, true]);
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
    // The detector's real risk is the false positive: a mark on every healthy mechanism would make the rail unreadable and the function useless.
    for (const json of [vilbrequin, jansen, decon, doubleSlider, coreXY2])
      expect(dead_points(record(json, 300))).toEqual([]);
  }, 60_000);

  it("Poulie bloqueuse cale, ce que son nom annonce", () => {
    const found = dead_points(record(poulie, 300));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].t).toBeGreaterThan(0);
  }, 60_000);
});
