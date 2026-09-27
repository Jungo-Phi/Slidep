// Throwaway: how many seconds of CPU one simulated second of Pendulum clock costs, through the recorder the worker runs.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import clock from "../test-mechanisms/Pendulum clock.slidep?raw";
import { load_mechanism } from "../src/utils/load-mechanism";
import { Recorder } from "../src/components/solver/recording/recorder";

describe("real-time ratio", () => {
  it("pendulum clock", () => {
    const out: string[] = [];
    for (let rep = 0; rep < 3; rep++) {
      const recorder = new Recorder();
      recorder.load("dynamic", load_mechanism(JSON.parse(clock)).mechanism, null);
      const SIM = 0.5;
      const t0 = performance.now();
      let reached = 0;
      while (reached < SIM - 1e-9) reached = recorder.advance(SIM, 1e9).reached;
      const ms = performance.now() - t0;
      out.push(`run ${rep}: ${SIM} s simulated in ${(ms / 1000).toFixed(1)} s → ${(ms / 1000 / SIM).toFixed(1)}× slower than real time`);
    }
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/realtime-ratio.txt", out.join("\n"));
  }, 3_600_000);
});
