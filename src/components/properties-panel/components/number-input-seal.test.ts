// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";

// The icons barrel opens thousands of files under the test transform; the field only needs the two arrows, and they draw nothing this test looks at.
vi.mock("@mui/icons-material", () => ({
  KeyboardArrowUp: () => null,
  KeyboardArrowDown: () => null,
}));

import NumberInput from "./NumberInput";
import { HistorySeal, HistorySealContext } from "../../mechanism/history-seal";

/** What the field asked of the history, in order. */
const calls: string[] = [];
const seal: HistorySeal = {
  arm: (key) => calls.push(`arm ${key}`),
  close: () => calls.push("close"),
};

function show(props: Partial<React.ComponentProps<typeof NumberInput>> = {}) {
  render(
    React.createElement(
      HistorySealContext.Provider,
      { value: seal },
      React.createElement(NumberInput, {
        label: "m",
        title: "mass",
        value: 1,
        onChange: () => {},
        ...props,
      }),
    ),
  );
  const buttons = screen.getAllByRole("button");
  return { up: buttons[0], down: buttons[1], adornment: buttons[2] };
}

const click = (button: HTMLElement) => {
  fireEvent.mouseDown(button);
  fireEvent.mouseUp(button);
};

afterEach(() => {
  cleanup();
  calls.length = 0;
});

describe("what a numeric field tells the history", () => {
  it("arms one run for a series of steps, up or down, and closes none of it", () => {
    const { up, down } = show();
    click(up);
    click(up);
    click(down);
    expect(calls.filter((c) => c === "close")).toHaveLength(0);
    // Every step arms the same run, so its window reopens on each one.
    expect(new Set(calls)).toHaveLength(1);
  });

  it("closes on a typed value, which stands alone", () => {
    show();
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    expect(calls).toEqual(["close"]);
  });

  it("says nothing when a typed value is the one already shown", () => {
    show();
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(calls).toEqual([]);
  });

  it("closes on an adornment click, a decision like a typed value", () => {
    const { adornment } = show({
      adornment: {
        icon: () => null,
        title: "reset",
        onClick: () => {},
      },
    });
    fireEvent.click(adornment);
    expect(calls).toEqual(["close"]);
  });
});
