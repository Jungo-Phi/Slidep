import React from "react";
import { UnionElement } from "../../types";

/**
 * How the properties panel reacts when an ElementDisplay is clicked.
 *
 * Selecting an element from *inside* the panel is an explicit "tell me more about this one" gesture, so it always drills down to the tab that hosts what the card names — elements for a mechanical element or a load, constraints for a constraint — whatever panel the card itself sits in (analysis, connections, materials…).
 *
 * A selection alone does not always move the tab — not on a phone in a simulation (see `handlePhoneCanvasTap` in App.tsx) — so the panel asks for the tab itself.
 *
 * Provided once by PropertiesPanel; ElementDisplay and the materials library consume it.
 * Undefined outside a provider, in which case a click only selects.
 */
export const ElementNavigationContext = React.createContext<
  ((element: UnionElement) => void) | undefined
>(undefined);

/** Called by ElementDisplay after a click selected an element. */
export function useElementNavigation(): (element: UnionElement) => void {
  const drillDown = React.useContext(ElementNavigationContext);
  return React.useCallback(
    (element: UnionElement) => drillDown?.(element),
    [drillDown],
  );
}
