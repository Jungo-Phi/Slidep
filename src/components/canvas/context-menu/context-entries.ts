/**
 * What can be done on the canvas from a menu, stated once for the right-click menu and the phone's quick-access bar.
 *
 * An entry says what it is, and what it does in terms of a `ContextHost`: neither knows how the other is drawn.
 */

import {
  Action,
  CanvasState,
  ID,
  MechanicalElement,
  Mechanism,
  MirrorAxis,
  OVERLAY_KIND_ORDER,
  OverlayKind,
  Point2,
  ViewportState,
  WorldPoint,
} from "../../../types";
import type { HoveredPart } from "../../../types/hovered-part";
import { t, tn } from "../../../i18n";
import { mirror_actions } from "../../mechanism/mirror-actions";
import { belt_can_close, belt_junctions } from "../../../utils/belt-rules";
import {
  can_collide,
  element_collides,
  is_groundable,
  overlay_applies,
  overlay_shown,
} from "../../../utils/element-queries";
import { shown_element_name } from "../../../utils/string-math";
import { get_element_icon } from "../../element-palette/elementIcon";
import { icon } from "../../element-palette/iconDataUris";
import {
  copied_selection,
  forget_paste_spots,
  last_copy,
  plan_paste,
  remember_copy,
  serialize_clipboard,
} from "../../mechanism/clipboard";
import {
  close_belt_actions,
  delete_elements,
  disconnect_all,
  get_connection_types,
  get_connections,
  open_belt,
} from "../../mechanism/connect-actions";
import { set_all_collides } from "../../properties-panel/collision-actions";
import { overlay_icon } from "../../properties-panel/element-readings";
import {
  set_motor_anchor,
  toggle_ground,
} from "../../properties-panel/element-value-actions";
import {
  OVERLAY_LABEL_KEYS,
  set_overlay,
} from "../../properties-panel/overlay-actions";

/** What an entry acts through. */
export interface ContextHost {
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
  setCanvasState: (state: CanvasState) => void;
  /** Where the menu was opened, when it was opened at a point of the canvas. */
  position?: WorldPoint;
  /** The snap step, when the grid snap is on. */
  grid?: number;
  recenterTarget?: ViewportState | null;
  onRecenter?: (target: ViewportState) => void;
  /** Lights up on the canvas what a row names; a touch has no hover to do it with. */
  setHoveredPart?: (hoveredPart: HoveredPart) => void;
}

export interface ContextEntry {
  id: string;
  label: string;
  /** Its keyboard equivalent, as shown beside it. */
  shortcut?: string;
  /** Its icon, when it is one of the app's own drawings rather than a Material one. */
  iconSrc?: string;
  /** A layer: shows an eye, and stays open on the tap. */
  shown?: boolean;
  /** The current choice in a list of choices. */
  selected?: boolean;
  /** The element this row names, lit up on the canvas while the pointer rests on it. */
  highlights?: MechanicalElement;
  disabled?: boolean;
  danger?: boolean;
  /** Opens a list of its own instead of acting. */
  submenu?: ContextEntry[];
  run?: (host: ContextHost) => void;
}

/** Separated in the menu, in order. */
export type ContextEntries = ContextEntry[][];

/** Whether the canvas is waiting with nothing under way, which is when a right click means a menu rather than a step back. */
export function is_at_rest(state: CanvasState): boolean {
  return (
    state.type === "Selecting" ||
    state.type === "SelectedElement" ||
    state.type === "SelectedMultiple"
  );
}

/** The canvas state holding `ids`, all of them mechanical. */
export function selecting(ids: ID[]): CanvasState {
  return ids.length === 1
    ? { type: "SelectedElement", elementID: ids[0] }
    : { type: "SelectedMultiple", elementIDs: ids };
}

function paste_text(text: string, host: ContextHost): void {
  const plan = plan_paste(text, host.position, host.mechanism, host.grid);
  if (!plan) return;
  host.applyActions(plan.actions);
  host.setCanvasState(selecting(plan.pastedIDs));
}

/**
 * Copies `ids`, returning what was copied.
 * The browser only lets a page write to the clipboard during a `copy` event, which this provokes for the listener on the canvas to answer.
 */
function copy_ids(ids: ID[], mechanism: Mechanism): string | null {
  const content = copied_selection(ids, mechanism);
  if (!content) return null;
  const text = serialize_clipboard(content);
  remember_copy(text);
  document.execCommand("copy");
  return text;
}

function delete_ids(ids: ID[], host: ContextHost): void {
  const { mechanicalElements, constraintElements, loads } = host.mechanism;
  host.applyActions(
    delete_elements(ids, mechanicalElements, constraintElements, loads),
  );
  host.setCanvasState({ type: "Selecting" });
}

/** A point of `element` to open something at when no pointer says where. */
function element_point(element: MechanicalElement): WorldPoint {
  if ("position" in element) return element.position;
  return new Point2<"world">(
    (element.positionStart.x + element.positionEnd.x) / 2,
    (element.positionStart.y + element.positionEnd.y) / 2,
  );
}

function clipboard_entries(ids: ID[]): ContextEntry[] {
  return [
    {
      id: "copy",
      label: t("copy"),
      shortcut: "Ctrl+C",
      run: ({ mechanism }) => void copy_ids(ids, mechanism),
    },
    {
      id: "cut",
      label: t("cut"),
      shortcut: "Ctrl+X",
      run: (host) => {
        const text = copy_ids(ids, host.mechanism);
        if (text) forget_paste_spots(text);
        delete_ids(ids, host);
      },
    },
    {
      id: "duplicate",
      label: t("duplicate"),
      run: (host) => {
        const content = copied_selection(ids, host.mechanism);
        // Beside the original wherever the menu was opened: this is not a paste at the cursor.
        if (content)
          paste_text(serialize_clipboard(content), {
            ...host,
            position: undefined,
          });
      },
    },
    paste_entry(),
  ];
}

function paste_entry(): ContextEntry {
  const text = last_copy();
  return {
    id: "paste",
    label: t("paste_here"),
    shortcut: "Ctrl+V",
    disabled: !text,
    run: (host) => {
      if (text) paste_text(text, host);
    },
  };
}

function collisions_entry(elements: MechanicalElement[]): ContextEntry[] {
  const targets = elements.filter(can_collide);
  if (targets.length === 0) return [];
  const entry = (on: boolean, label: string): ContextEntry => ({
    id: on ? "collisions-on" : "collisions-off",
    label,
    iconSrc: icon(on ? "collision" : "collision-off"),
    run: ({ applyActions }) => applyActions(set_all_collides(targets, on)),
  });
  if (elements.length === 1)
    return [
      element_collides(targets[0])
        ? entry(false, t("exclude_from_collisions"))
        : entry(true, t("include_in_collisions")),
    ];
  // Both, since a group need not agree: a row with nothing left to do is greyed rather than gone, so the other stays where it was.
  return [
    {
      ...entry(true, t("include_all_in_collisions")),
      disabled: targets.every(element_collides),
    },
    {
      ...entry(false, t("exclude_all_from_collisions")),
      disabled: !targets.some(element_collides),
    },
  ];
}

function overlays_entry(element: MechanicalElement): ContextEntry[] {
  const kinds: OverlayKind[] = OVERLAY_KIND_ORDER.filter((kind) =>
    overlay_applies(element, kind),
  );
  if (kinds.length === 0) return [];
  return [
    {
      id: "overlays",
      label: t("show"),
      submenu: kinds.map((kind) => {
        const shown = overlay_shown(element, kind);
        return {
          id: `overlay-${kind}`,
          label: tn(OVERLAY_LABEL_KEYS[kind], 1),
          iconSrc: overlay_icon(kind),
          shown,
          run: ({ applyActions }) =>
            applyActions(set_overlay(element, kind, !shown)),
        };
      }),
    },
  ];
}

/** What only this type of element can do. */
function type_entries(
  element: MechanicalElement,
  mechanism: Mechanism,
): ContextEntry[] {
  const entries: ContextEntry[] = [];
  const { mechanicalElements, constraintElements, loads } = mechanism;
  if (is_groundable(element) && !belt_junctions(mechanicalElements).has(element.id))
    entries.push({
      id: "ground",
      label: t(element.isGrounded ? "release" : "anchor"),
      iconSrc: icon(element.isGrounded ? "ground-off" : "ground"),
      run: ({ applyActions }) => applyActions([toggle_ground(element)]),
    });
  if (element.type === "pivot" && element.motor) {
    const motor = element.motor;
    entries.push({
      // Named after the current sense, which its icon shows as the panel's does.
      id: motor.speed < 0 ? "reverse-motor-counter" : "reverse-motor-clockwise",
      label: t("reverse_direction"),
      run: ({ applyActions }) =>
        applyActions([
          {
            type: "SetMotorConfig",
            id: element.id,
            newConfig: { ...motor, speed: -motor.speed },
            oldConfig: motor,
          },
        ]),
    });
    const beams = element.rotatingEdgesIDs.flatMap((id) => {
      const edge = mechanicalElements.find((el) => el.id === id);
      return edge?.type === "beam" ? [edge] : [];
    });
    // With no beam on the pivot, the ground is the only anchor there is to choose.
    if (beams.length > 0)
      entries.push({
        id: "motor-anchor",
        label: t("motor_anchor"),
        iconSrc: icon("motor"),
        submenu: [
          {
            id: "motor-anchor-ground",
            label: t("ground"),
            iconSrc: icon("ground"),
            selected: motor.parentBeamID === undefined,
            run: ({ applyActions }) =>
              applyActions(set_motor_anchor(element, motor, undefined)),
          },
          ...beams.map(
            (beam): ContextEntry => ({
              id: `motor-anchor-${beam.id}`,
              label: shown_element_name(beam),
              iconSrc: get_element_icon(beam),
              highlights: beam,
              selected: motor.parentBeamID === beam.id,
              run: ({ applyActions }) =>
                applyActions(set_motor_anchor(element, motor, beam.id)),
            }),
          ),
        ],
      });
  }
  if (element.type === "belt" && element.closed)
    entries.push({
      id: "open-belt",
      label: t("open_belt"),
      danger: true,
      run: ({ applyActions }) => applyActions(open_belt(element)),
    });
  if (
    element.type === "belt" &&
    !element.closed &&
    belt_can_close(element.attachedGearsIDs.length)
  )
    entries.push({
      id: "close-belt",
      label: t("close_belt"),
      run: ({ applyActions, position }) =>
        applyActions(
          close_belt_actions(
            element,
            position ?? element.positionStart,
            mechanicalElements,
            constraintElements,
            loads,
          ),
        ),
    });
  const linked = get_connection_types(element).some(
    (type) =>
      type !== "ConnectsParentAxle" &&
      type !== "ConnectsFixedGears" &&
      get_connections(element, type).length > 0,
  );
  entries.push({
    id: "disconnect",
    label: t("disconnect"),
    danger: true,
    disabled: !linked,
    run: ({ applyActions }) =>
      applyActions(
        disconnect_all(element.id, mechanicalElements, constraintElements, loads),
      ),
  });
  return entries;
}

function mirror_entries(ids: ID[]): ContextEntry[] {
  const entry = (axis: MirrorAxis, label: string): ContextEntry => ({
    id: `mirror-${axis}`,
    label,
    run: ({ mechanism, applyActions }) =>
      applyActions(mirror_actions(ids, axis, mechanism)),
  });
  return [
    entry("horizontal", t("mirror_horizontal")),
    entry("vertical", t("mirror_vertical")),
  ];
}

function delete_entry(ids: ID[]): ContextEntry {
  return {
    id: "delete",
    label: t("delete"),
    shortcut: t("delete_key"),
    danger: true,
    run: (host) => delete_ids(ids, host),
  };
}

const non_empty = (groups: ContextEntries): ContextEntries =>
  groups.filter((group) => group.length > 0);

/** The entries for `ids`, the selection under the menu. */
export function selection_entries(
  ids: ID[],
  mechanism: Mechanism,
  isSimulating: boolean,
): ContextEntries {
  const mechanical = ids.flatMap(
    (id) => mechanism.mechanicalElements.find((el) => el.id === id) ?? [],
  );

  // An overlay: a constraint or a load, copied with what it applies to and never alone.
  if (mechanical.length === 0) {
    if (isSimulating) return [];
    const exists = [...mechanism.constraintElements, ...mechanism.loads].some(
      (el) => el.id === ids[0],
    );
    return exists ? [[delete_entry(ids)]] : [];
  }

  if (mechanical.length > 1)
    return non_empty(
      isSimulating
        ? [collisions_entry(mechanical)]
        : [
            clipboard_entries(ids),
            mirror_entries(ids),
            collisions_entry(mechanical),
            [delete_entry(ids)],
          ],
    );

  const element = mechanical[0];
  const measure: ContextEntry = {
    id: "add-measure",
    label: t("add_measure"),
    iconSrc: icon("probe"),
    run: ({ setCanvasState, position }) =>
      setCanvasState({
        type: "PlacingProbeMetrics",
        elementID: element.id,
        position: position ?? element_point(element),
      }),
  };
  const reading = [measure, ...overlays_entry(element), ...collisions_entry([element])];
  if (isSimulating) return [reading];
  return non_empty([
    clipboard_entries(ids),
    reading,
    type_entries(element, mechanism),
    [delete_entry(ids)],
  ]);
}

/** The entries for empty space. */
export function void_entries(
  mechanism: Mechanism,
  isSimulating: boolean,
): ContextEntries {
  const recenter: ContextEntry = {
    id: "recenter",
    label: t("recenter"),
    run: ({ recenterTarget, onRecenter }) => {
      if (recenterTarget) onRecenter?.(recenterTarget);
    },
  };
  if (isSimulating) return [[recenter]];
  const ids = mechanism.mechanicalElements.map((el) => el.id);
  return [
    [
      paste_entry(),
      {
        id: "select-all",
        label: t("select_all"),
        shortcut: "Ctrl+A",
        disabled: ids.length === 0,
        run: ({ setCanvasState }) => setCanvasState(selecting(ids)),
      },
    ],
    [recenter],
  ];
}
