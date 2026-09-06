import React from "react";

/**
 * Whether a simulation is running, for the panel controls that lock while it does.
 *
 * Provided once by PropertiesPanel and read by `StructureOnly` wherever it sits — a
 * connection's disconnect button is four components below the only one that knows the app
 * mode, and threading a boolean down to it would put the question in every signature on the
 * way. False outside a provider, which is what a panel rendered in isolation wants.
 */
export const SimulationLockContext = React.createContext<boolean>(false);

/** Read by `StructureOnly`; a control that needs the raw flag can read it too. */
export function useSimulating(): boolean {
  return React.useContext(SimulationLockContext);
}
