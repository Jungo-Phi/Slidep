import { registerSW } from "virtual:pwa-register";
import { getStorageItem, setStorageItem } from "./storage";

/** How long after the page opened a freshly installed build may still reload it on its own. */
const AUTO_RELOAD_WINDOW_MS = 15_000;

/** Minimum delay between two automatic reloads, so nothing can trap the app in a reload loop. */
const RELOAD_COOLDOWN_MS = 60_000;

const LAST_AUTO_RELOAD_KEY = "sw-auto-reload-at";

/**
 * Registers the service worker, and reloads the page when a new build takes over — but only right after the page opened, while the user has nothing to lose.
 * An update landing later stays dormant until the next visit: reloading would close the mechanism being edited and drop the user back into the gallery.
 */
export function register_service_worker(): void {
  registerSW({
    onNeedReload: () => {
      // performance.now() counts from the start of the navigation.
      if (performance.now() > AUTO_RELOAD_WINDOW_MS) return;

      const now = Date.now();
      if (now - getStorageItem(LAST_AUTO_RELOAD_KEY, 0) < RELOAD_COOLDOWN_MS) return;
      setStorageItem(LAST_AUTO_RELOAD_KEY, now);
      window.location.reload();
    },
  });
}
