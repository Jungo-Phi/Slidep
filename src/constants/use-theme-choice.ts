import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStorageItem, setStorageItem } from "../utils";
import { set_canvas_theme } from "./rendering-specs";
import {
  DEFAULT_THEME,
  resolve_theme,
  THEMES,
  ThemeMode,
  ThemeName,
} from "./mui-theme";

/** How long the pointer must rest on a theme before it is tried on. A swipe
 *  across the menu on the way somewhere else asks for nothing, and should
 *  repaint nothing. */
const THEME_PREVIEW_DELAY_MS = 100;

/**
 * The app's ambience: a family (Fantaisie, Blueprint, …) crossed with a mode (light/dark/
 * système), persisted to storage, plus the hover preview the settings menu offers before a
 * choice sticks.
 */
export function useThemeChoice() {
  // A theme is chosen as a family and a mode, not as one of the six names: the
  // name is what those two resolve to, once the browser has had its say on
  // "système".
  const [themeChoice, setThemeChoice] = useState<{
    family: string;
    mode: ThemeMode;
  }>(() => {
    const legacy = getStorageItem<ThemeName>("theme", DEFAULT_THEME);
    const chosen = legacy in THEMES ? THEMES[legacy] : THEMES[DEFAULT_THEME];
    return {
      family: getStorageItem<string>("themeFamily", chosen.family),
      mode: getStorageItem<ThemeMode>("themeMode", chosen.mode),
    };
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  // "Système" keeps following the browser, even once the menu is closed.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  const themeName = resolve_theme(themeChoice.family, themeChoice.mode, systemDark);

  // Resting on a theme in the menu tries it on: the whole app, canvas included,
  // repaints. Only a click makes it stick — leaving the menu puts back the one
  // that was chosen.
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null);
  const activeTheme = previewTheme ?? themeName;

  const previewTimer = useRef<number | null>(null);
  // Arms the preview, or — with `null` — disarms it and drops the one showing.
  // The pointer must dwell: a theme swept over on the way to another is not a
  // theme asked for.
  const previewLater = useCallback((name: ThemeName | null) => {
    if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    if (name === null) {
      previewTimer.current = null;
      setPreviewTheme(null);
      return;
    }
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      setPreviewTheme(name);
    }, THEME_PREVIEW_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    },
    [],
  );

  // The canvas palette lives in a module binding rather than in React state, so
  // it is repointed before the first paint of the new theme, not after it. It
  // then fades towards it, in step with the interface — except on the very
  // first paint, which has no previous theme to fade from.
  const themeEverApplied = useRef(false);
  useMemo(() => {
    set_canvas_theme(activeTheme, themeEverApplied.current ? undefined : 0);
    themeEverApplied.current = true;
  }, [activeTheme]);

  // The menu stays open on a choice, as it does for the grid switches above it:
  // ambience and family are two controls, and one is rarely set without a look
  // at the other.
  const changeTheme = useCallback((family: string, mode: ThemeMode) => {
    setThemeChoice({ family, mode });
    setStorageItem("themeFamily", family);
    setStorageItem("themeMode", mode);
    previewLater(null);
  }, [previewLater]);

  const currentTheme = THEMES[activeTheme].mui;

  return {
    themeChoice,
    systemDark,
    previewLater,
    changeTheme,
    currentTheme,
  };
}
