/**
 * The hints: a bubble pointing at a control, shown once, at a quiet moment, to someone who has not found it yet.
 *
 * Each hint has an action that resolves it.
 * Doing it consumes the hint for good, whether the hint was ever shown or not: someone who found the control alone has no need of being shown it.
 * Closing the bubble consumes it as well.
 */

import { useSyncExternalStore } from "react";
import type { PopperPlacementType } from "@mui/material";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "../../utils/storage";
import type { StringKey } from "../../i18n";

/** How long the user must have done nothing before a hint shows: one that pops up mid-gesture interrupts, one that waits for a pause proposes. */
export const HINT_IDLE_MS = 1200;

export type HintId = "run" | "grab" | "ddl";

/**
 * What a hint says, and the control it points at: the element carrying `data-hint-anchor` with this value.
 * `placement` is where the bubble goes when there is room, flipped otherwise.
 */
export const HINTS: Record<
  HintId,
  { textKey: StringKey; anchor: string; placement: PopperPlacementType }
> = {
  run: { textKey: "hint_run", anchor: "play", placement: "bottom" },
  grab: { textKey: "hint_grab", anchor: "Grabbing", placement: "bottom" },
  ddl: { textKey: "hint_ddl", anchor: "ddl", placement: "right" },
};

/** In the order they are offered, when two could show at once. */
export const HINT_ORDER: HintId[] = ["run", "grab", "ddl"];

const storage_key = (id: HintId) => `hint-consumed-${id}`;

const listeners = new Set<() => void>();

export function hint_consumed(id: HintId): boolean {
  return getStorageItem(storage_key(id), false);
}

/** The hints resolved by their action during this session, which a bubble still on screen celebrates rather than just closes. */
const resolved = new Set<HintId>();

const notify = () => {
  for (const listener of listeners) listener();
};

/** Done with this hint for good: its action was taken. */
export function resolve_hint(id: HintId): void {
  if (hint_consumed(id)) return;
  resolved.add(id);
  setStorageItem(storage_key(id), true);
  notify();
}

/** Done with this hint for good: its bubble was closed. */
export function dismiss_hint(id: HintId): void {
  if (hint_consumed(id)) return;
  setStorageItem(storage_key(id), true);
  notify();
}

/** Whether `id` was consumed by its action, during this session. */
export const hint_resolved = (id: HintId): boolean => resolved.has(id);

/** Every hint pending again, as on a first visit: for whoever wants to see them again. */
export function reset_hints(): void {
  for (const id of HINT_ORDER) removeStorageItem(storage_key(id));
  resolved.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The situations reported by the component that knows them, rather than passed down to the hint layer: whether a run stands on a rigid structure is known to the analysis panel alone.
 */
const situations = new Set<HintId>();

export function report_hint_situation(id: HintId, holds: boolean): void {
  if (situations.has(id) === holds) return;
  if (holds) situations.add(id);
  else situations.delete(id);
  notify();
}

/** The hints whose situation a component reports as holding, re-rendering the caller when that changes. */
export function useReportedSituations(): HintId[] {
  const key = useSyncExternalStore(subscribe, () =>
    HINT_ORDER.filter((id) => situations.has(id)).join(","),
  );
  return key === "" ? [] : (key.split(",") as HintId[]);
}

/** The hints not consumed yet, re-rendering the caller when one is. */
export function usePendingHints(): HintId[] {
  const key = useSyncExternalStore(subscribe, () =>
    HINT_ORDER.filter((id) => !hint_consumed(id)).join(","),
  );
  return key === "" ? [] : (key.split(",") as HintId[]);
}
