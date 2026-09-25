import { describe, expect, it } from "vitest";
import { to_hex } from "./color-format";

describe("to_hex", () => {
  it("writes an rgb() colour as hex", () => {
    expect(to_hex("rgb(255, 128, 0)")).toBe("#ff8000");
    expect(to_hex("rgb(0,0,5)")).toBe("#000005");
  });

  it("leaves a hex colour as it is", () => {
    expect(to_hex("#ec4899")).toBe("#ec4899");
  });
});
