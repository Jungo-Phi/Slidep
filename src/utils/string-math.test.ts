import { describe, it, expect } from "vitest";
import { format_sim_time } from "./string-math";

describe("format_sim_time", () => {
  it("donne le dixième de seconde sous la minute", () => {
    expect(format_sim_time(0)).toBe("0.0s");
    expect(format_sim_time(45.34)).toBe("45.3s");
  });

  it("passe aux minutes à 60 s, secondes sur deux chiffres", () => {
    expect(format_sim_time(60)).toBe("1m00s");
    expect(format_sim_time(65.9)).toBe("1m05s");
    expect(format_sim_time(173.4)).toBe("2m53s");
    expect(format_sim_time(600)).toBe("10m00s");
  });

  it("tronque, pour ne jamais annoncer un instant qui n'est pas atteint", () => {
    // Rounded, this would read `60.0s` — a duration the other branch spells `1m00s`.
    expect(format_sim_time(59.96)).toBe("59.9s");
    expect(format_sim_time(119.99)).toBe("1m59s");
  });

  it("ne descend pas sous zéro", () => {
    expect(format_sim_time(-0.5)).toBe("0.0s");
  });
});
