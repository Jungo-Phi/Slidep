import { createContext } from "react";
import { get_language, Lang } from "./index";

/**
 * The language on screen, as React sees it: `t` reads the module-level choice, so a component that skips a render keeps the text it last drew.
 * Provided by App; read it through `useAmbient`.
 */
export const LanguageContext = createContext<Lang>(get_language());
