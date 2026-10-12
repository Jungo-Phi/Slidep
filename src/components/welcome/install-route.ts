import { useSyncExternalStore } from "react";
import { StringKey } from "../../i18n";

/** Chromium's own install offer, not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** How this browser installs the app: a button playing its own offer, the steps to follow in its menus, or nothing — installed already, or a browser that cannot. */
export type InstallRoute =
  | { kind: "prompt"; install: () => void }
  | { kind: "steps"; stepsKey: StringKey }
  | null;

// The offer fires once, early, and whoever does not catch it then never sees it: it is held here from the moment this module loads.
let offer: BeforeInstallPromptEvent | null = null;
let installed = false;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  for (const listener of listeners) listener();
};

window.addEventListener("beforeinstallprompt", (event) => {
  // Kept for the welcome screen's button, rather than spent on the browser's own banner.
  event.preventDefault();
  offer = event as BeforeInstallPromptEvent;
  changed();
});
window.addEventListener("appinstalled", () => {
  offer = null;
  installed = true;
  changed();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** iOS and iPadOS, whatever the browser: all of them install through Safari's share sheet, and an iPad reads as a Mac but for its touch screen. */
export const is_ios = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const is_standalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** How to install the app from the browser it runs in, kept up to date as the browser's own offer comes and goes. */
export function useInstallRoute(): InstallRoute {
  useSyncExternalStore(subscribe, () => version);
  if (installed || is_standalone()) return null;
  const held = offer;
  if (held)
    return {
      kind: "prompt",
      install: () => {
        // An offer plays once: whatever the answer, the button goes with it.
        void held.prompt();
        void held.userChoice.then(() => {
          offer = null;
          changed();
        });
      },
    };
  const ua = navigator.userAgent;
  if (is_ios()) return { kind: "steps", stepsKey: "welcome_install_ios" };
  if (/Android/.test(ua) && /Firefox\//.test(ua))
    return { kind: "steps", stepsKey: "welcome_install_android_menu" };
  if (
    /Macintosh/.test(ua) &&
    /Safari\//.test(ua) &&
    !/Chrome|Chromium|Edg|Firefox/.test(ua)
  )
    return { kind: "steps", stepsKey: "welcome_install_mac_safari" };
  // A Chromium that made no offer has the app installed already, or will not take it; any other browser cannot install it.
  return null;
}
