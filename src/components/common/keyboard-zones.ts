import React, { useEffect } from "react";

/**
 * The large regions of the window the keyboard jumps between: F6 goes to the next one, Shift+F6 to the previous one, as in a browser or an office suite.
 * Each is marked with `data-keyboard-zone`, and their order on the page is the order F6 follows.
 * Inside a zone, Tab and the arrows move as usual: F6 is the way to cross the window without walking every control on the way.
 */
export type KeyboardZone =
  "topbar" | "palette" | "analysis" | "canvas" | "rail" | "panel";

export const ZONE_ATTRIBUTE = "data-keyboard-zone";

/** What a zone root carries to be one. */
export const zone_props = (zone: KeyboardZone) => ({ [ZONE_ATTRIBUTE]: zone });

const TABBABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Whether `element` is laid out on screen: a folded panel or a hidden menu keeps its controls in the page, out of sight. */
const shown = (element: HTMLElement) => element.getClientRects().length > 0;

/** The Tab stops of `root` that are on screen, in page order. */
const stops_in = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && shown(element),
  );

/** The control a zone is entered on: the zone itself when it takes the focus, else its first Tab stop, which in a toolbar is the button last reached. */
function zone_entry(zone: HTMLElement): HTMLElement | undefined {
  if (zone.tabIndex >= 0) return zone;
  return stops_in(zone)[0];
}

/** The zones on the page that have somewhere to land, in page order. */
function zones(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`[${ZONE_ATTRIBUTE}]`),
  ).filter((zone) => shown(zone) && zone_entry(zone) !== undefined);
}

/** Moves the focus into `zone`, returning whether there was a place to land. */
export function focus_zone(zone: KeyboardZone): boolean {
  const root = document.querySelector<HTMLElement>(
    `[${ZONE_ATTRIBUTE}="${zone}"]`,
  );
  const entry = root && shown(root) ? zone_entry(root) : undefined;
  entry?.focus();
  return !!entry;
}

/** F6 and Shift+F6, heard from anywhere, a text field included: the way out of a field is the very thing they are for. */
export function useZoneCycling() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F6" || event.ctrlKey || event.altKey || event.metaKey)
        return;
      const all = zones();
      if (all.length === 0) return;
      event.preventDefault();
      const active = document.activeElement;
      const current = all.findIndex((zone) => zone.contains(active));
      const step = event.shiftKey ? -1 : 1;
      // From outside every zone, F6 starts at the first and Shift+F6 at the last.
      const next =
        current === -1
          ? event.shiftKey
            ? all.length - 1
            : 0
          : (current + step + all.length) % all.length;
      zone_entry(all[next])?.focus();
    };
    // Captured, so that no field or menu on the way swallows it.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

/** A control the up and down arrows already mean something in: a text area's lines, a list's choices, a slider's value. */
const keeps_vertical_arrows = (element: HTMLElement) =>
  !!element.closest(
    "textarea, select, [role='slider'], [role='listbox'], [role='menu'], [contenteditable='true'], input[type='number'], input[type='range']",
  );

/**
 * Lets the up and down arrows move between the rows of a list in `ref`, `row` naming them: from a control to the one in the same place on the next row, as down a column of a table.
 * Tab still goes through each row's controls, the arrows being the quick way down a long list to the row wanted.
 */
export function useRowArrows(
  ref: React.RefObject<HTMLElement | null>,
  row: string,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      // Read at the key rather than at mount: a list empty at first is drawn later.
      const list = ref.current;
      const target = event.target as HTMLElement;
      if (!list || !(target instanceof HTMLElement)) return;
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        keeps_vertical_arrows(target)
      )
        return;
      const from = target.closest<HTMLElement>(row);
      if (!from || !list.contains(from)) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>(row));
      const column = stops_in(from).findIndex((stop) => stop.contains(target));
      if (column === -1) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      // A row with nothing to reach, a folded or empty one, is passed over.
      for (let i = rows.indexOf(from) + step; i >= 0 && i < rows.length; i += step) {
        const stops = stops_in(rows[i]);
        if (stops.length === 0) continue;
        event.preventDefault();
        // The arrows also step through the recording, from anywhere but here.
        event.stopPropagation();
        stops[Math.min(column, stops.length - 1)].focus();
        return;
      }
    };
    // Heard on the page rather than through React, which would also bring it the keys of a menu opened from a row, and first, for the recording not to step as well.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [ref, row]);
}

const TOOLBAR_ITEMS = "button, [role='button'], [role='tab']";

/** A key the control under the focus keeps for itself: the caret of a field, the value of a slider. */
const keeps_arrows = (element: HTMLElement) =>
  !!element.closest(
    "input, textarea, select, [role='slider'], [contenteditable='true']",
  );

/**
 * Makes `ref` one Tab stop whose buttons the left and right arrows move between, Home and End going to its ends: the toolbar pattern.
 * Tab lands on the button last reached, so that coming back finds the bar as it was left.
 * The up and down arrows go to the bars stacked above and below it, named by their zone.
 * Read off the buttons on the page rather than declared, so a bar whose buttons change with the mode or the width needs nothing more.
 */
export function useRovingToolbar(
  ref: React.RefObject<HTMLElement | null>,
  neighbours: { above?: KeyboardZone; below?: KeyboardZone } = {},
) {
  const { above, below } = neighbours;
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    let current: HTMLElement | null = null;

    const items = () =>
      Array.from(bar.querySelectorAll<HTMLElement>(TOOLBAR_ITEMS)).filter(
        (item) =>
          !(item as HTMLButtonElement).disabled &&
          item.getAttribute("aria-disabled") !== "true" &&
          shown(item),
      );

    // Only what differs is written: the observer below hears the bar's own writes too.
    const apply = () => {
      const all = items();
      if (!current || !all.includes(current)) current = all[0] ?? null;
      for (const item of bar.querySelectorAll<HTMLElement>(TOOLBAR_ITEMS)) {
        const tabIndex = item === current ? "0" : "-1";
        if (item.getAttribute("tabindex") !== tabIndex)
          item.setAttribute("tabindex", tabIndex);
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>(
        TOOLBAR_ITEMS,
      );
      if (!item || !bar.contains(item) || item === current) return;
      current = item;
      apply();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        keeps_arrows(target)
      )
        return;
      const all = items();
      const index = all.indexOf(
        target.closest<HTMLElement>(TOOLBAR_ITEMS) as HTMLElement,
      );
      if (index === -1) return;
      let next: HTMLElement | undefined;
      if (event.key === "ArrowRight") next = all[index + 1];
      else if (event.key === "ArrowLeft") next = all[index - 1];
      else if (event.key === "Home") next = all[0];
      else if (event.key === "End") next = all[all.length - 1];
      else if (event.key === "ArrowUp" && above) {
        if (focus_zone(above)) event.preventDefault();
        event.stopPropagation();
        return;
      } else if (event.key === "ArrowDown" && below) {
        if (focus_zone(below)) event.preventDefault();
        event.stopPropagation();
        return;
      } else return;
      // At an end the arrow stops, as it does between the cards of the gallery: it never wraps round to the other side.
      event.preventDefault();
      // The arrows also step through the recording, from anywhere but here.
      event.stopPropagation();
      next?.focus();
    };

    apply();
    // Buttons come and go with the mode and the width, and a button turning disabled cannot hold the bar's stop.
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(bar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "tabindex",
        "aria-disabled",
        "style",
        "class",
      ],
    });
    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, above, below]);
}
