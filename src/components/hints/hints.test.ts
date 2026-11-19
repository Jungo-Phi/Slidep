// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  dismiss_hint,
  hint_consumed,
  hint_resolved,
  reset_hints,
  resolve_hint,
} from "./hints";

describe("hints", () => {
  beforeEach(() => {
    localStorage.clear();
    reset_hints();
  });

  it("are pending until consumed, then for good", () => {
    expect(hint_consumed("run")).toBe(false);
    resolve_hint("run");
    expect(hint_consumed("run")).toBe(true);
    expect(hint_consumed("grab")).toBe(false);
  });

  it("tell an action taken from a bubble closed", () => {
    resolve_hint("run");
    dismiss_hint("grab");
    expect(hint_resolved("run")).toBe(true);
    expect(hint_resolved("grab")).toBe(false);
  });

  it("all come back on a reset", () => {
    resolve_hint("run");
    dismiss_hint("grab");
    reset_hints();
    expect(hint_consumed("run")).toBe(false);
    expect(hint_consumed("grab")).toBe(false);
    expect(hint_resolved("run")).toBe(false);
  });
});
