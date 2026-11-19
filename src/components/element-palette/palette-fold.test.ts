import { describe, expect, it } from "vitest";
import { folded_groups } from "./palette-fold";

const GROUPS = [
  { titleKey: "interface", count: 3 },
  { titleKey: "geometry", count: 2 },
  { titleKey: "loads", count: 2 },
  { titleKey: "constraints", count: 6 },
];

describe("folded_groups", () => {
  it("folds nothing on a wide bar, or before its width is known", () => {
    expect(folded_groups(GROUPS, 2000).size).toBe(0);
    expect(folded_groups(GROUPS, null).size).toBe(0);
  });

  it("folds from the right, as few groups as fit", () => {
    // 3×32+2×2 + 2×(2×32+2) + 6×32+5×2 + 3×21 = 100 + 132 + 202 + 63 = 497, plus 248 for the ends.
    expect([...folded_groups(GROUPS, 745)]).toEqual([]);
    expect([...folded_groups(GROUPS, 744)]).toEqual(["constraints"]);
  });

  it("never folds the selection tools", () => {
    expect(folded_groups(GROUPS, 0).has("interface")).toBe(false);
  });
});
