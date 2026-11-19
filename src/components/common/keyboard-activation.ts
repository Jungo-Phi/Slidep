import type React from "react";

/**
 * What a clickable box that is not a button needs to be one for the keyboard: a Tab stop, a role that says so, and Enter for a click.
 * Enter alone, since Space plays and pauses the simulation everywhere in the app.
 * Nothing without `onActivate`, so a box clickable only in some states stays out of the Tab order in the others.
 */
export function activation_props(onActivate: (() => void) | undefined) {
  if (!onActivate) return {};
  return {
    role: "button",
    tabIndex: 0,
    onKeyDown: (event: React.KeyboardEvent) => {
      // A control inside the box answers Enter for itself.
      if (event.key !== "Enter" || event.target !== event.currentTarget) return;
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    },
  };
}

/**
 * The highlight the pointer gives on hover, given by the keyboard too: on while the focus is on the box or on a control inside it.
 * What the canvas lights for a row has to follow the focus, or the keyboard would walk the rows blind.
 */
export function focus_hover_props(onChange: (on: boolean) => void) {
  return {
    onFocus: () => onChange(true),
    onBlur: (event: React.FocusEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        onChange(false);
    },
  };
}
