/**
 * The greeting for the first slidep a browser sees fused, the element the app is named after.
 *
 * Fusing a pivot and a slider is the only way a user makes one: the fusion bundle is what is watched for, so a slidep arriving any other way — a mechanism opened, an example, a paste — never counts.
 * Once seen, never again in this browser.
 */

import { DIM } from "../../constants/rendering-specs";
import {
  INTERACTION_SPECS,
  SLIDEP_BIRTH,
} from "../../constants/interaction-specs";
import type { Action, ID } from "../../types";
import { getStorageItem, setStorageItem } from "../../utils/storage";

const SEEN_KEY = "first-slidep-seen";

/** The slidep being greeted and the `performance.now()` its fusion was applied at. */
export interface SlidepBirth {
  id: ID;
  start: number;
}

/** How the symbol is drawn at one instant of its click. */
export interface SlidepBirthPose {
  /** Applied around the symbol's centre, strokes included. */
  scale: number;
  /** The body's width, px, growing from the slider's to the slidep's. */
  outerWidth: number;
  /** The halo's blur, px, in the symbol's own ink, fading out with the click. */
  halo: number;
}

let birth: SlidepBirth | null = null;

/** The id of the slidep `actions` fuse out of a pivot and a slider, if they do: the slidep takes the pivot's id. */
export function fused_slidep_id(actions: readonly Action[]): ID | undefined {
  const deleted = (type: string, id?: ID) =>
    actions.some(
      (a) =>
        a.type === "DeleteElement" &&
        a.element.type === type &&
        (id === undefined || a.element.id === id),
    );
  for (const action of actions)
    if (
      action.type === "CreateElement" &&
      action.element.type === "slidep" &&
      deleted("pivot", action.element.id) &&
      deleted("slider")
    )
      return action.element.id;
  return undefined;
}

/** Starts the greeting if `actions`, about to be applied by the user, fuse this browser's first slidep. */
export function note_slidep_birth(
  actions: readonly Action[],
  now = performance.now(),
) {
  if (birth || getStorageItem(SEEN_KEY, false)) return;
  const id = fused_slidep_id(actions);
  if (id === undefined) return;
  setStorageItem(SEEN_KEY, true);
  birth = { id, start: now };
}

/** The greeting under way at `now`, or null once it is over. */
export function current_slidep_birth(now: number): SlidepBirth | null {
  if (birth && now - birth.start > birth_duration()) birth = null;
  return birth;
}

function birth_duration() {
  return SLIDEP_BIRTH.MESSAGE_DELAY_MS + SLIDEP_BIRTH.MESSAGE_MS;
}

/** Overshoots its target before settling, as two parts snapping together do. */
function ease_out_back(p: number) {
  const c = 1.70158;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}

/** The symbol's pose `elapsed` ms into its greeting, or null once the click is over and it is drawn as usual. */
export function slidep_birth_pose(elapsed: number): SlidepBirthPose | null {
  if (elapsed < 0 || elapsed >= SLIDEP_BIRTH.CLICK_MS) return null;
  const p = elapsed / SLIDEP_BIRTH.CLICK_MS;
  const { POP_SCALE, POP_PEAK } = SLIDEP_BIRTH;
  const swell =
    p < POP_PEAK
      ? 1 - (1 - p / POP_PEAK) ** 2
      : 1 - ((p - POP_PEAK) / (1 - POP_PEAK)) ** 2;
  return {
    scale: 1 + (POP_SCALE - 1) * swell,
    outerWidth:
      DIM.SLIDER_OUTER_WIDTH +
      (DIM.SLIDEP_OUTER_WIDTH - DIM.SLIDER_OUTER_WIDTH) * ease_out_back(p),
    halo: INTERACTION_SPECS.SELECTION_HALO_SIZE * (1 - p),
  };
}

/** The message's opacity and rise, px, `elapsed` ms into the greeting; null while it is not shown. */
export function slidep_birth_message(
  elapsed: number,
): { opacity: number; rise: number } | null {
  const t = elapsed - SLIDEP_BIRTH.MESSAGE_DELAY_MS;
  const { MESSAGE_MS, MESSAGE_FADE_MS, MESSAGE_RISE_PX } = SLIDEP_BIRTH;
  if (t < 0 || t > MESSAGE_MS) return null;
  return {
    opacity: Math.min(1, t / MESSAGE_FADE_MS, (MESSAGE_MS - t) / MESSAGE_FADE_MS),
    rise: (MESSAGE_RISE_PX * t) / MESSAGE_MS,
  };
}
