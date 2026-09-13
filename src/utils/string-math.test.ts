import { describe, it, expect } from "vitest";
import { format_sim_time } from "./string-math";

describe("format_sim_time", () => {
  it("donne le centième de seconde sous la minute", () => {
    expect(format_sim_time(0)).toBe("0.00s");
    expect(format_sim_time(45.347)).toBe("45.34s");
  });

  it("passe aux minutes à 60 s, secondes sur deux chiffres et au dixième", () => {
    expect(format_sim_time(60)).toBe("1m00.0s");
    expect(format_sim_time(65.97)).toBe("1m05.9s");
    expect(format_sim_time(173.4)).toBe("2m53.4s");
    expect(format_sim_time(600)).toBe("10m00.0s");
  });

  it("tronque, pour ne jamais annoncer un instant qui n'est pas atteint", () => {
    // Rounded, this would read `60.00s` — a duration the other branch spells `1m00.0s`.
    expect(format_sim_time(59.996)).toBe("59.99s");
    expect(format_sim_time(119.99)).toBe("1m59.9s");
  });

  it("ne perd pas un centième à l'arrondi binaire", () => {
    expect(format_sim_time(0.29)).toBe("0.29s");
  });

  it("ne rétrécit jamais quand le temps avance", () => {
    for (const [before, after] of [[9.99, 10], [59.99, 60], [599.9, 600]]) {
      expect(format_sim_time(after).length).toBeGreaterThanOrEqual(format_sim_time(before).length);
    }
  });

  it("ne descend pas sous zéro", () => {
    expect(format_sim_time(-0.5)).toBe("0.00s");
  });
});
