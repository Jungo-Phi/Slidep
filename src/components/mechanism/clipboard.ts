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

const points_of = (el: MechanicalElement): WorldPoint[] =>
  "position" in el ? [el.position] : [el.positionStart, el.positionEnd];

/** The centre of the box around `elements`. */
export function elements_center(elements: MechanicalElement[]): WorldPoint {
  const points = elements.flatMap(points_of);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return new Point2<"world">(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  );
}

/** The part of the world the canvas shows. */
export interface WorldBox {
  min: WorldPoint;
  max: WorldPoint;
}

const in_box = ({ x, y }: WorldPoint, box: WorldBox): boolean =>
  x >= box.min.x && x <= box.max.x && y >= box.min.y && y <= box.max.y;

/** How many steps aside a paste looks for a free spot before settling for the one it was aimed at. */
const MAX_PASTE_STEPS = 50;

/**
 * How far to carry content centred on `center` so it lands on `wanted`, stepped diagonally aside while `occupied` says the move would hide it exactly behind what is already there: such a paste looks like nothing happened.
 * The steps go down and to the right first, and the other way where that leaves `view`, so the centre of the paste stays in sight.
 * With `grid`, the move is a whole number of grid steps, so what was on the grid stays on it.
 */
export function paste_delta(
  center: WorldPoint,
  wanted: WorldPoint,
  occupied: (delta: WorldPoint) => boolean,
  offset: number,
  grid?: number,
  view?: WorldBox,
): WorldPoint {
  const on_grid = (v: number) => (grid ? Math.round(v / grid) * grid : v);
  const size = grid ? Math.max(1, Math.ceil(offset / grid)) * grid : offset;
  const aimed = new Point2<"world">(
    on_grid(wanted.x - center.x),
    on_grid(wanted.y - center.y),
  );
  const in_view = (delta: WorldPoint) => !view || in_box(center.add(delta), view);
  // World y points up: the first steps down and to the right on screen.
  const diagonals = [
    new Point2<"world">(1, -1),
    new Point2<"world">(1, 1),
    new Point2<"world">(-1, -1),
    new Point2<"world">(-1, 1),
  ];
  if (!occupied(aimed)) return aimed;
  for (const diagonal of diagonals)
    for (let steps = 1; steps <= MAX_PASTE_STEPS; steps++) {
      const delta = aimed.add(diagonal.mul(steps * size));
      if (!in_view(delta)) break;
      if (!occupied(delta)) return delta;
    }
  return aimed;
}

/** Whether every element of `content`, moved by `delta`, would sit within `tolerance` of one just like it in `mechanism`. */
function lands_on_twin(
  content: ClipboardContent,
  delta: WorldPoint,
  mechanism: Mechanism,
  tolerance: number,
): boolean {
  return content.mechanicalElements.every((element) => {
    const moved = points_of(element).map((p) => p.add(delta));
    return mechanism.mechanicalElements.some(
      (other) =>
        other.type === element.type &&
        points_of(other).every((p, i) => p.sub(moved[i]).length() < tolerance),
    );
  });
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

/** What a paste adds: its bundle, the mechanical elements to select, and the ID each pasted element was copied from. */
export interface PastePlan {
  actions: Action[];
  pastedIDs: ID[];
  sources: ReadonlyMap<ID, ID>;
}

export interface PasteOptions {
  /** Where to centre the paste; without it, next to the original, or in the middle of `view` when the original is out of it. */
  wanted?: WorldPoint;
  /** The snap step, when the grid snap is on. */
  grid?: number;
  /** What the canvas shows, which the paste is kept in. */
  view?: WorldBox;
  /** Ties the pasted dimensions to the originals, see `link_to_original`. */
  linked?: boolean;
}

/** The bundle that pastes the clipboard `text` into `mechanism`, or null when it cannot be pasted. */
export function plan_paste(
  text: string,
  mechanism: Mechanism,
  { wanted, grid, view, linked = false }: PasteOptions = {},
): PastePlan | null {
  const content = parse_clipboard(text);
  if (!content) return null;
  const center = elements_center(content.mechanicalElements);
  const beside =
    view && !in_box(center, view) ? view.min.lerp(view.max, 0.5) : center;
  const offset = PASTE_OFFSET_PX / mechanism.viewport.scale;
  const delta = paste_delta(
    center,
    wanted ?? beside,
    (delta) => lands_on_twin(content, delta, mechanism, offset / 2),
    offset,
    grid,
    view,
  );
  return paste_actions(content, delta, mechanism, linked);
}

/** The element `constraint` measures, when it is a dimension `link_to_original` can turn into an equality. */
function linkable_target(constraint: ConstraintElement): ID | null {
  if (constraint.type === "dimension-edge") return constraint.edgeID;
  if (constraint.type === "dimension-radius") return constraint.gearID;
  return null;
}

/**
 * The constraint that ties a pasted dimension to the original of what it measures, or null when there is none to tie it to.
 * A length becomes an equality with the original edge, a radius a 1:1 ratio with the original gear: one constraint for another, so the paste stays exactly as constrained.
 * The other dimensions have no equality to become, and keep their own value.
 * `find` looks up a mechanical element; an original it cannot find (cut, or copied from another mechanism) ties nothing.
 */
function link_to_original(
  dimension: ConstraintElement,
  sources: ReadonlyMap<ID, ID>,
  find: (id: ID) => MechanicalElement | undefined,
): ConstraintElement | null {
  const target = linkable_target(dimension);
  if (target === null) return null;
  const source = sources.get(target);
  const original = source === undefined ? undefined : find(source);
  const copy = find(target);
  if (!original || !copy) return null;
  const id = crypto.randomUUID() as ID;
  if (dimension.type === "dimension-edge")
    return { type: "equal", id, startEdgeID: original.id, endEdgeID: copy.id };
  if (!("position" in original) || !("position" in copy)) return null;
  return {
    type: "gear-ratio",
    id,
    position: original.position.lerp(copy.position, 0.5),
    startGearID: original.id,
    endGearID: copy.id,
    value: 1,
  };
}

/**
 * The bundle that ties what a paste added to `mechanism` to the originals it was copied from, as a linked paste would have; empty when there is nothing to tie.
 * `sources` is the paste's own, see `PastePlan`.
 */
export function link_actions(
  sources: ReadonlyMap<ID, ID>,
  mechanism: Mechanism,
): Action[] {
  const byID = new Map(mechanism.mechanicalElements.map((el) => [el.id, el]));
  return mechanism.constraintElements.flatMap((constraint): Action[] => {
    if (!sources.has(constraint.id)) return [];
    const link = link_to_original(constraint, sources, (id) => byID.get(id));
    if (!link) return [];
    // The link first: `apply_actions` reads the bundle's first action as its master.
    return [
      { type: "CreateElement", element: link },
      { type: "DeleteElement", element: constraint },
    ];
  });
}

/** Whether a linked paste of `text` into `mechanism` would tie anything to an original. */
export function pastes_linked(text: string, mechanism: Mechanism): boolean {
  const content = parse_clipboard(text);
  if (!content) return false;
  const present = new Set(mechanism.mechanicalElements.map((el) => el.id));
  return content.constraintElements.some((constraint) => {
    const target = linkable_target(constraint);
    return target !== null && present.has(target);
  });
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
 * `linked` ties the pasted dimensions to the originals, see `link_to_original`.
 */
export function paste_actions(
  content: ClipboardContent,
  delta: WorldPoint,
  mechanism: Mechanism,
  linked = false,
): PastePlan {
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

  const sources = new Map<ID, ID>();
  for (const element of [
    ...content.mechanicalElements,
    ...content.constraintElements,
    ...content.loads,
  ])
    sources.set(ids.get(element.id)!, element.id);

  const mechanicalElements = content.mechanicalElements.map(pasted);
  const byID = new Map(
    [...mechanism.mechanicalElements, ...mechanicalElements].map((el) => [
      el.id,
      el,
    ]),
  );
  const constraintElements = content.constraintElements.map((constraint) => {
    const copy = pasted(constraint);
    if (!linked) return copy;
    return link_to_original(copy, sources, (id) => byID.get(id)) ?? copy;
  });
  return {
    // The elements first: `apply_actions` reads the bundle's first action as its master.
    actions: [
      ...[
        ...mechanicalElements,
        ...constraintElements,
        ...content.loads.map(pasted),
      ].map((element): Action => ({ type: "CreateElement", element })),
      ...libraryActions,
    ],
    pastedIDs: mechanicalElements.map((el) => el.id),
    sources,
  };
}
