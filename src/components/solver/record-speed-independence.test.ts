import { describe, it, expect } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  MAX_RECORDING_TIME,
  RECORD_DT,
  max_recording_time,
  recording_full,
} from "./kinematic-simulation";
import { Recorder } from "./recorder";
import { snapshot_layout } from "./snapshot";

/**
 * The recording is the same at every playback speed — the promise the fixed `RECORD_DT`
 * makes. Speed decides how fast the cursor asks for instants, never which instants get
 * solved, so a mechanism recorded at ×10 must be the one recorded at ×1, snapshot for
 * snapshot.
 */

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

/** Records `wanted` snapshots, driven like the worker: one moving target per frame. */
function record(json: string, speed: number, wanted: number): KinematicSnapshot[] {
  const recorder = new Recorder();
  recorder.load(loadFixture(json), null);
  const all: KinematicSnapshot[] = [];
  let target = 0;
  // Bounded so a recorder that stops producing fails on the length assertion rather than
  // spinning here.
  for (let frame = 0; frame < 10_000 && all.length < wanted; frame++) {
    target += (speed * 1) / 60;
    for (let slice = 0; slice < 50; slice++) {
      if ((recorder.frontier() ?? -Infinity) >= target) break;
      const { snapshots, solved } = recorder.advance(target);
      if (solved === 0) break;
      all.push(...snapshots);
    }
  }
  return all.slice(0, wanted);
}

const FRAMES = 600;

describe("une tranche rend compte de sa progression", () => {
  it("même quand elle ne retient aucun instant", () => {
    const recorder = new Recorder();
    recorder.load(loadFixture(vilbrequin), null);
    // A zero budget stops after one step — the check follows it, so exactly one is solved.
    const first = recorder.advance(10, 0);
    expect(first.solved).toBe(1);
    expect(first.snapshots).toHaveLength(1);

    const second = recorder.advance(10, 0);
    // One instant in two is kept, so this one lands on a step that is not: the batch is
    // empty and only `solved` and `reached` say that anything happened. Read as nothing
    // happening, the cursor concludes the producer has stopped, slows down, asks for less,
    // and the recording winds itself to a standstill.
    expect(second.snapshots).toHaveLength(0);
    expect(second.solved).toBe(1);
    expect(second.reached).toBeGreaterThan(first.reached);
  });
});

describe("la fin d'un enregistrement se reconnaît", () => {
  it("tolère la dérive de l'accumulation, qu'un `>=` nu manquerait", () => {
    // A recorded instant is a running sum of RECORD_DT: replayed here as the recorder
    // builds it, the last one lands just SHORT of the round number it stands for. Compared
    // exactly, the end of the recording is never reached and the playback never stops.
    let t = 0;
    while (t + RECORD_DT <= MAX_RECORDING_TIME) t += RECORD_DT;
    expect(t).not.toBe(MAX_RECORDING_TIME);
    expect(t).toBeCloseTo(MAX_RECORDING_TIME, 9);
    expect(recording_full(t, MAX_RECORDING_TIME)).toBe(true);

    // And it is not so tolerant that it fires a step early.
    expect(recording_full(t - RECORD_DT, MAX_RECORDING_TIME)).toBe(false);
    expect(recording_full(0, MAX_RECORDING_TIME)).toBe(false);
  });
});

describe("la durée enregistrable se règle sur la mémoire", () => {
  const layout_of = (nodes: number) =>
    snapshot_layout(
      Array.from({ length: nodes }, (_, i) => `n${i}`),
      [],
    );

  const time_of = (nodes: number) => max_recording_time(layout_of(nodes));

  /** The smallest mechanism the budget binds on before the ceiling does. Searched rather
   *  than written down, so the test says nothing about what the budget happens to be. */
  const bound_by_memory = () => {
    let nodes = 64;
    while (time_of(nodes) === MAX_RECORDING_TIME) nodes *= 2;
    return nodes;
  };

  it("laisse le plafond à un mécanisme que la mémoire porte", () => {
    expect(time_of(1)).toBe(MAX_RECORDING_TIME);
  });

  it("raccourcit un mécanisme lourd, par minutes entières", () => {
    const nodes = bound_by_memory();
    expect(time_of(nodes)).toBeLessThan(MAX_RECORDING_TIME);
    expect(time_of(nodes) % 60).toBe(0);
  });

  // A million keys is what the floor has to be shown on, and laying them out
  // costs real time: the default budget is not meant for it, and this asserts a
  // returned duration, never how fast it was reached.
  it(
    "ne descend jamais sous la minute, quitte à dépasser le budget",
    () => {
      expect(time_of(1_000_000)).toBe(60);
    },
    30_000,
  );

  it("ne récompense jamais un mécanisme plus lourd", () => {
    let previous = Infinity;
    for (let nodes = 1; nodes <= 1_000_000; nodes *= 4) {
      const time = time_of(nodes);
      expect(time).toBeLessThanOrEqual(previous);
      previous = time;
    }
  });
});

describe("l'enregistrement ne dépend pas de la vitesse de lecture", () => {
  for (const [name, json] of [
    ["Poulie bloqueuse", poulie],
    ["Core XY - 2 moteurs", coreXY2],
  ] as [string, string][]) {
    it(`${name} : ×1 et ×10 produisent la même trajectoire`, () => {
      const slow = record(json, 1, FRAMES);
      const fast = record(json, 10, FRAMES);

      expect(slow).toHaveLength(FRAMES);
      expect(fast).toHaveLength(FRAMES);

      let worstPosition = 0;
      let worstAngle = 0;
      let worstT = 0;
      for (let i = 0; i < FRAMES; i++) {
        worstT = Math.max(worstT, Math.abs(slow[i].t - fast[i].t));
        // Both recordings run the same model, so slot k is the same key on both sides.
        // Compared with `>` rather than `Math.max`, which a slot holding NaN would poison.
        for (let k = 0; k < slow[i].layout.keys.length; k++) {
          const d = Math.hypot(
            slow[i].positions[2 * k] - fast[i].positions[2 * k],
            slow[i].positions[2 * k + 1] - fast[i].positions[2 * k + 1],
          );
          if (d > worstPosition) worstPosition = d;
        }
        for (let k = 0; k < slow[i].layout.angleKeys.length; k++) {
          const d = Math.abs(slow[i].angles[k] - fast[i].angles[k]);
          if (d > worstAngle) worstAngle = d;
        }
      }
      console.log(
        `  ${name} : Δt ${worstT.toExponential(2)} s, ` +
          `Δposition ${worstPosition.toExponential(2)} px, Δangle ${worstAngle.toExponential(2)} rad`,
      );
      // The states must match to the bit. The instants only match to rounding: the two
      // speeds batch the steps differently, so the running sum of `RECORD_DT` restarts
      // from a snapshot at different points.
      expect(worstT).toBeLessThan(1e-9);
      expect(worstPosition).toBe(0);
      expect(worstAngle).toBe(0);
    }, 300_000);
  }
});
