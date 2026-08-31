import React from "react";
import { ID } from "../../types";

/**
 * A beam's material/profile picker's own "where can I edit this?" link: jumps to the library
 * tab with that entry selected there. Provided once by `PropertiesPanel`, consumed by
 * `MaterialProfileSection`. Undefined outside a provider, in which case the link does nothing.
 */
export const LibraryNavigationContext = React.createContext<
  ((section: "materials" | "profiles", id: ID) => void) | undefined
>(undefined);

export function useLibraryNavigation(): (section: "materials" | "profiles", id: ID) => void {
  const focus = React.useContext(LibraryNavigationContext);
  return React.useCallback(
    (section: "materials" | "profiles", id: ID) => focus?.(section, id),
    [focus],
  );
}
