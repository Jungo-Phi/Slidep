import { describe, expect, it } from "vitest";
import type { ID, MechanicalElement } from "../../types";
import type { CanvasState } from "../../types/canvas-state";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";
import { carried_focus } from "./selection-subject";

const element = (id: string, type: string) =>
  ({ id, type }) as unknown as MechanicalElement;

const ELEMENTS = [
  element("beam-1", "beam"),
  element("beam-2", "beam"),
  element("pivot-1", "pivot"),
];

const selected = (elementID: string): CanvasState =>
  ({ type: "SelectedElement", elementID }) as unknown as CanvasState;

const internal = (elementID: string, which?: "node" | "start" | "end") =>
  ({ elementID, kind: "reaction-internal", which }) as unknown as FocusedOverlay;

describe("carried_focus", () => {
  it("moves a member's internal effort onto another member of the same kind", () => {
    expect(
      carried_focus(internal("beam-1"), selected("beam-2"), ELEMENTS),
    ).toMatchObject({ elementID: "beam-2", kind: "reaction-internal" });
  });

  it("gives the reading up when the selection is the member it already belongs to", () => {
    expect(
      carried_focus(internal("beam-1"), selected("beam-1" as ID), ELEMENTS),
    ).toBeNull();
  });

  it("gives it up for an element of another kind", () => {
    expect(
      carried_focus(internal("beam-1"), selected("pivot-1"), ELEMENTS),
    ).toBeNull();
  });

  it("gives it up when the new state is not a selection", () => {
    expect(
      carried_focus(internal("beam-1"), { type: "Selecting" }, ELEMENTS),
    ).toBeNull();
  });

  it("gives up a reading read at one end of the member", () => {
    expect(
      carried_focus(internal("beam-1", "start"), selected("beam-2"), ELEMENTS),
    ).toBeNull();
  });

  it("keeps nothing when nothing was named", () => {
    expect(carried_focus(null, selected("beam-2"), ELEMENTS)).toBeNull();
  });
});
