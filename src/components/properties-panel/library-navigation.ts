import React from "react";
import { ID } from "../../types";

/**
 * A beam's material/profile picker's own "where can I edit this?" link: jumps to the library tab and opens the entries named there — several of them when a selection of beams doesn't share one.
 * Provided once by `PropertiesPanel`, consumed by `MaterialProfileSection`.
 * Undefined outside a provider, in which case the link does nothing.
 */
export const LibraryNavigationContext = React.createContext<
  ((section: "materials" | "profiles", ids: ID[]) => void) | undefined
>(undefined);

export function useLibraryNavigation(): (
  section: "materials" | "profiles",
  ids: ID[],
) => void {
  const focus = React.useContext(LibraryNavigationContext);
  return React.useCallback(
    (section: "materials" | "profiles", ids: ID[]) => focus?.(section, ids),
    [focus],
  );
}
