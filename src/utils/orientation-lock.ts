import { PHONE_LAYOUT } from "../constants/layout-specs";

/**
 * Holds a phone upright, where the browser lets a page do it: an installed app on Android, mostly.
 * A phone is told apart by its screen, not by the window — a narrow desktop window is no phone, and a tablet keeps turning.
 * Where the browser refuses (iOS, a page in a tab), the phone turns as before: nothing is shown over the app to make up for it.
 */
export function lock_phone_portrait(): void {
  if (Math.min(screen.width, screen.height) >= PHONE_LAYOUT.MAX_SIDE) return;
  // Not in every DOM typing: the lock is missing from some browsers altogether.
  const orientation = screen.orientation as
    | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
    | undefined;
  orientation?.lock?.("portrait").catch(() => {});
}
