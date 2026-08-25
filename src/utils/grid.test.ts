import { describe, expect, it } from "vitest";
import {
  LABEL_PITCH_CEILING_PX,
  LABEL_PITCH_FLOOR_PX,
  graduation_step,
} from "./grid";

describe("graduation_step", () => {
  it("keeps labelled lines within LABEL_PITCH_FLOOR_PX/CEILING_PX at every zoom", () => {
    // Injected rather than re-derived: what this checks is that the ladder's own envelope
    // tracks the floor, whatever the floor is currently set to — not that it's 40 or 50.
    for (let e = -3; e <= 8; e += 0.001) {
      const scale = 10 ** e;
      const spacing = graduation_step(scale) * scale;
      expect(spacing).toBeGreaterThan(LABEL_PITCH_FLOOR_PX - 1);
      expect(spacing).toBeLessThan(LABEL_PITCH_CEILING_PX + 1);
    }
  });
});
