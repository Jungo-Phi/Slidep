import React from "react";

/**
 * How the properties panel reacts when an ElementDisplay is clicked.
 *
 * Selecting an element from *inside* the panel is an explicit "tell me more
 * about this one" gesture, so it always drills down to the elements tab —
 * whatever panel the card sits in (analysis, constraints, connections…).
 *
 * That is deliberately not the same rule as selecting on the canvas: in
 * simulation, a canvas click means "observe", and must leave the active tab
 * alone (see the tab derivation in App.tsx). Keying the behaviour on where the
 * selection came from — rather than on which card was clicked — is what keeps
 * the two apart without special cases scattered through the panels.
 *
 * Provided once by PropertiesPanel; ElementDisplay consumes it. Undefined
 * outside a provider, in which case a click only selects.
 */
export const ElementNavigationContext = React.createContext<
  (() => void) | undefined
>(undefined);

/** Called by ElementDisplay after a click selected an element. */
export function useElementNavigation(): () => void {
  const drillDown = React.useContext(ElementNavigationContext);
  return React.useCallback(() => drillDown?.(), [drillDown]);
}
