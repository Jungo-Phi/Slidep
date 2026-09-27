import { useContext } from "react";
import { useTheme } from "@mui/material";
import { LanguageContext } from "../../i18n/language-context";

/**
 * Call it at the top of any component wrapped in `memo`.
 * Text comes from `t` and canvas colours from the live `COLORS`/`ICON_COLORS` bindings, neither of which React tracks: without this, a memoised component keeps the language and the theme it last rendered with.
 */
export function useAmbient(): void {
  useContext(LanguageContext);
  useTheme();
}
