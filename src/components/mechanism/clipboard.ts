/**
 * Copying part of a mechanism and pasting it into this one or another.
 *
 * What is copied is the selection, cut off from the rest as if the rest had been deleted, plus the few elements it cannot exist without — see `copy_closure`.
 * The content travels as JSON through the system clipboard, so it reaches other tabs and has to be checked on the way back in.
 */

import {
  Action,
  ConstraintElement,
  ID,
  LoadElement,
  MaterialDef,
  MechanicalElement,
  Mechanism,
  Point2,
  ProfileDef,
  UnionElement,
  WorldPoint,
} from "../../types";
import { PASTE_OFFSET_PX } from "../../constants/interaction-specs";
import { element_ref_fields } from "../../types/element-refs";
import { getStorageItem, setStorageItem } from "../../utils/storage";
import { belt_junction_id } from "../../utils/belt-rules";
import { is_nameable } from "../../utils/element-queries";
import { CURRENT_FORMAT_VERSION } from "../../utils/migrate-mechanism";
import { prune_field, repair_mechanism } from "../../utils/repair-mechanism";
import {
  deserialize_constraint_elements,
  deserialize_loads,
  deserialize_mechanical_elements,
} from "../../utils/serialization";
import { unique_copy_name } from "../../utils/unique-name";

/**
 * The clipboard type the content is stored under.
 * Not `text/plain`, so that pasting into a text field or another application does not spill JSON there.
 */
export const CLIPBOARD_MIME = "application/x-slidep-elements";

const CLIPBOARD_KIND = "slidep-elements";

export interface ClipboardContent {
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  loads: LoadElement[];
  /** The library entries the copied beams name, which the destination mechanism may not hold. */
  materials: MaterialDef[];
  profiles: ProfileDef[];
}

/**
 * `selectedIDs` and what they cannot be copied without.
 *
 * A gear and its axle go together, as they do when deleted.
 * A closed belt takes its junction and pulleys: without them the loop has no geometry, its two terminals being one point.
 * An open belt has a shape of its own, so it keeps only the pulleys that are selected.
 */
function copy_closure(
  selectedIDs: ID[],
  byID: Map<ID, MechanicalElement>,
): Set<ID> {
  const kept = new Set<ID>();
  const pending = [...selectedIDs];
  while (pending.length > 0) {
    const id = pending.pop()!;
    const element = byID.get(id);
    if (!element || kept.has(id)) continue;
    kept.add(id);
    if (element.type === "gear") pending.push(element.parentAxleID);
    if (element.type === "pivot" || element.type === "slidep")
      pending.push(...element.fixedGearsIDs);
    if (element.type === "belt" && element.closed) {
      pending.push(...element.attachedGearsIDs.map((gear) => gear.id));
      const junction = belt_junction_id(element);
      if (junction) pending.push(junction);
    }
  }
  return kept;
}

/** `element` without its references outside `kept`, or null when it needs one of them. */
function cut_from_rest<T extends UnionElement>(
  element: T,
  kept: Set<ID>,
): T | null {
  const dead = (id: ID) => !kept.has(id);
  let cut = element;
  for (const { field, ids, spec } of element_ref_fields(element)) {
    if (spec.target.includes("material") || spec.target.includes("profile"))
      continue;
    if (!ids.some(dead)) continue;
    if (spec.required) return null;
    cut = prune_field(cut, field, spec, dead);
  }
  return cut;
}

/**
 * What copying `selectedIDs` puts on the clipboard, or null when they name no mechanical element.
 * A constraint or a load is copied along with the elements it applies to, never alone.
 */
export function copied_selection(
  selectedIDs: ID[],
  mechanism: Mechanism,
): ClipboardContent | null {
  const byID = new Map(mechanism.mechanicalElements.map((el) => [el.id, el]));
  const kept = copy_closure(selectedIDs, byID);
  if (kept.size === 0) return null;

  const keep_cut = <T extends UnionElement>(elements: T[]): T[] =>
    elements.flatMap((element) => cut_from_rest(element, kept) ?? []);

  const mechanicalElements = keep_cut(
    mechanism.mechanicalElements.filter((el) => kept.has(el.id)),
  );
  const beams = mechanicalElements.filter((el) => el.type === "beam");
  return {
    mechanicalElements,
    constraintElements: keep_cut(mechanism.constraintElements),
    loads: keep_cut(mechanism.loads),
    materials: mechanism.materials.filter((m) =>
      beams.some((beam) => beam.materialID === m.id),
    ),
    profiles: mechanism.profiles.filter((p) =>
      beams.some((beam) => beam.profileID === p.id),
    ),
  };
}

export function serialize_clipboard(content: ClipboardContent): string {
  return JSON.stringify({
    kind: CLIPBOARD_KIND,
    formatVersion: CURRENT_FORMAT_VERSION,
    ...content,
  });
}

/**
 * The content `text` holds, or null when it cannot be pasted as is: another format version (a tab left open across an update), or anything the strict getters would trip on.
 */
export function parse_clipboard(text: string): ClipboardContent | null {
  try {
    const raw = JSON.parse(text);
    if (raw?.kind !== CLIPBOARD_KIND) return null;
    if (raw.formatVersion !== CURRENT_FORMAT_VERSION) return null;
    const content: ClipboardContent = {
      mechanicalElements: deserialize_mechanical_elements(raw.mechanicalElements),
      constraintElements: deserialize_constraint_elements(raw.constraintElements),
      loads: deserialize_loads(raw.loads),
      materials: raw.materials,
      profiles: raw.profiles,
    };
    if (content.mechanicalElements.length === 0) return null;
    const { repairs } = repair_mechanism({
      ...content,
      viewport: { scale: 1, pan: new Point2<"screen">(0, 0) },
    } as Mechanism);
    return repairs.length === 0 ? content : null;
  } catch {
    return null;
  }
}

/** The centre of the box around `elements`. */
export function elements_center(elements: MechanicalElement[]): WorldPoint {
  const points = elements.flatMap((el) =>
    "position" in el ? [el.position] : [el.positionStart, el.positionEnd],
  );
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return new Point2<"world">(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  );
}

/**
 * How far to carry content centred on `center` so it lands on `wanted`, shifted diagonally off any spot in `occupied`: a paste that hides exactly behind what is already there looks like nothing happened.
 * With `grid`, the move is a whole number of grid steps, so what was on the grid stays on it.
 */
export function paste_delta(
  center: WorldPoint,
  wanted: WorldPoint,
  occupied: readonly WorldPoint[],
  offset: number,
  grid?: number,
): WorldPoint {
  const on_grid = (v: number) => (grid ? Math.round(v / grid) * grid : v);
  const size = grid ? Math.max(1, Math.ceil(offset / grid)) * grid : offset;
  let delta = new Point2<"world">(
    on_grid(wanted.x - center.x),
    on_grid(wanted.y - center.y),
  );
  // World y points up, so this steps down and to the right on screen.
  const step = new Point2<"world">(size, -size);
  while (occupied.some((o) => center.add(delta).sub(o).length() < size / 2))
    delta = delta.add(step);
  return delta;
}

const LAST_COPY_KEY = "last-copy";

/** Keeps `text` for a paste with no keyboard behind it: a page can write to the system clipboard unprompted, but only a keyboard paste lets it read back. */
export function remember_copy(text: string): void {
  setStorageItem(LAST_COPY_KEY, text);
}

/** The last copy made in any tab, for a paste from a menu. */
export function last_copy(): string | null {
  return getStorageItem<string | null>(LAST_COPY_KEY, null);
}

/** Where the content last pasted already sits, so that pasting it again does not stack it there. */
let pasteSpots: { text: string; centers: WorldPoint[] } | null = null;

/** Tells the next paste that `text` was cut: its spot is free, so it may land right back there. */
export function forget_paste_spots(text: string): void {
  pasteSpots = { text, centers: [] };
}

/**
 * The bundle that pastes the clipboard `text` around `wanted`, or null when it cannot be pasted.
 * Without `wanted`, it lands next to the original.
 * `grid` is the snap step, when the grid snap is on.
 */
export function plan_paste(
  text: string,
  wanted: WorldPoint | undefined,
  mechanism: Mechanism,
  grid?: number,
): { actions: Action[]; pastedIDs: ID[] } | null {
  const content = parse_clipboard(text);
  if (!content) return null;
  const center = elements_center(content.mechanicalElements);
  if (pasteSpots?.text !== text) pasteSpots = { text, centers: [center] };
  const delta = paste_delta(
    center,
    wanted ?? center,
    pasteSpots.centers,
    PASTE_OFFSET_PX / mechanism.viewport.scale,
    grid,
  );
  pasteSpots.centers.push(center.add(delta));
  return paste_actions(content, delta, mechanism);
}

/** Every string of `value` that `ids` knows, replaced; a `Point2` holds no reference and stays a `Point2`. */
function with_ids_replaced<T>(value: T, ids: Map<string, ID>): T {
  if (typeof value === "string") return (ids.get(value) ?? value) as T;
  if (Array.isArray(value))
    return value.map((item) => with_ids_replaced(item, ids)) as T;
  if (value instanceof Point2 || typeof value !== "object" || value === null)
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      with_ids_replaced(item, ids),
    ]),
  ) as T;
}

/** The points of an element that are places in the world, unlike a force's vector or direction. */
const POSITION_FIELDS = ["position", "positionStart", "positionEnd"];

function translated<T extends UnionElement>(element: T, delta: WorldPoint): T {
  const moved: Record<string, unknown> = { ...element };
  for (const field of POSITION_FIELDS) {
    const point = moved[field];
    if (point instanceof Point2) moved[field] = point.add(delta);
  }
  return moved as unknown as T;
}

/** The entry of `library` to use for `entry`: the same one, else one identical to it, so that pasting across tabs does not pile up copies of the same steel. */
function matching_entry<T extends { id: ID }>(
  entry: T,
  library: readonly T[],
): T | undefined {
  const content = (value: T) => JSON.stringify({ ...value, id: undefined });
  return (
    library.find((other) => other.id === entry.id) ??
    library.find((other) => content(other) === content(entry))
  );
}

/**
 * The bundle that pastes `content` into `mechanism`, moved by `delta`, under fresh IDs.
 * A name only changes if `mechanism` already uses it, so a cut element pasted back keeps its own.
 */
export function paste_actions(
  content: ClipboardContent,
  delta: WorldPoint,
  mechanism: Mechanism,
): { actions: Action[]; pastedIDs: ID[] } {
  const ids = new Map<string, ID>();
  for (const element of [
    ...content.mechanicalElements,
    ...content.constraintElements,
    ...content.loads,
  ])
    ids.set(element.id, crypto.randomUUID() as ID);

  const libraryActions: Action[] = [];
  for (const material of content.materials) {
    const match = matching_entry(material, mechanism.materials);
    if (match) ids.set(material.id, match.id);
    else libraryActions.push({ type: "CreateMaterial", material });
  }
  for (const profile of content.profiles) {
    const match = matching_entry(profile, mechanism.profiles);
    if (match) ids.set(profile.id, match.id);
    else libraryActions.push({ type: "CreateProfile", profile });
  }

  const taken = new Set(
    [
      ...mechanism.mechanicalElements,
      ...mechanism.constraintElements,
      ...mechanism.loads,
    ].flatMap((el) => (is_nameable(el) && el.name ? [el.name] : [])),
  );
  const pasted = <T extends UnionElement>(element: T): T => {
    const copy = translated(with_ids_replaced(element, ids), delta);
    if (!is_nameable(copy) || !copy.name) return copy;
    if (taken.has(copy.name)) copy.name = unique_copy_name(copy.name, taken);
    taken.add(copy.name);
    return copy;
  };

  const mechanicalElements = content.mechanicalElements.map(pasted);
  return {
    // The elements first: `apply_actions` reads the bundle's first action as its master.
    actions: [
      ...[
        ...mechanicalElements,
        ...content.constraintElements.map(pasted),
        ...content.loads.map(pasted),
      ].map((element): Action => ({ type: "CreateElement", element })),
      ...libraryActions,
    ],
    pastedIDs: mechanicalElements.map((el) => el.id),
  };
}
