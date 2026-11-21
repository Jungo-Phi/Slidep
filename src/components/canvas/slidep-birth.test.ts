import { describe, expect, it } from "vitest";
import { DIM } from "../../constants/rendering-specs";
import { SLIDEP_BIRTH } from "../../constants/interaction-specs";
import type { Action } from "../../types";
import {
  fused_slidep_id,
  slidep_birth_message,
  slidep_birth_pose,
} from "./slidep-birth";

const element = (type: string, id: string) =>
  ({ type, id }) as unknown as Extract<Action, { type: "CreateElement" }>["element"];

describe("fused_slidep_id", () => {
  it("names the slidep a pivot and a slider fuse into", () => {
    const actions: Action[] = [
      { type: "DeleteElement", element: element("pivot", "p") },
      { type: "DeleteElement", element: element("slider", "s") },
      { type: "CreateElement", element: element("slidep", "p") },
    ];
    expect(fused_slidep_id(actions)).toBe("p");
  });

  it("ignores a slidep created without a fusion, as a paste does", () => {
    expect(
      fused_slidep_id([
        { type: "CreateElement", element: element("slidep", "p") },
      ]),
    ).toBeUndefined();
  });
});

describe("slidep_birth_pose", () => {
  it("grows the body from the slider's width and lets go once the click is over", () => {
    expect(slidep_birth_pose(0)?.outerWidth).toBeCloseTo(DIM.SLIDER_OUTER_WIDTH);
    expect(slidep_birth_pose(0)?.scale).toBeCloseTo(1);
    const peak = slidep_birth_pose(SLIDEP_BIRTH.CLICK_MS * SLIDEP_BIRTH.POP_PEAK);
    expect(peak?.scale).toBeCloseTo(SLIDEP_BIRTH.POP_SCALE);
    expect(slidep_birth_pose(SLIDEP_BIRTH.CLICK_MS)).toBeNull();
  });
});

describe("slidep_birth_message", () => {
  it("fades in after its delay and out at its end", () => {
    expect(slidep_birth_message(0)).toBeNull();
    const mid = slidep_birth_message(
      SLIDEP_BIRTH.MESSAGE_DELAY_MS + SLIDEP_BIRTH.MESSAGE_MS / 2,
    );
    expect(mid?.opacity).toBe(1);
    expect(
      slidep_birth_message(
        SLIDEP_BIRTH.MESSAGE_DELAY_MS + SLIDEP_BIRTH.MESSAGE_MS + 1,
      ),
    ).toBeNull();
  });
});
