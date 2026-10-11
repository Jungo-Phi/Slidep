import { useMemo } from "react";
import {
  AppMode,
  Mechanism,
  MechanismMetadata,
  SimulationSpeed,
} from "../../types";
import {
  set_sim_clock as setRuntimeState,
  useSimClockSelector,
} from "../solver/dynamics/sim-clock";
import {
  CLOCK_MIRROR_MS,
  shown_parameters,
  simulationResetPatch,
} from "../solver/recording/use-simulation-playback";
import { apply_parameter_snapshot_to_mechanism } from "../solver/dynamics/simulation-engine";

/** The simulation settings in effect at the instant on screen: what a physics switch shows, and what it flips. */
export function useShownSimulation(
  appMode: AppMode,
  mechanism: Mechanism,
): Mechanism["simulation"] {
  const shownParameters = useSimClockSelector(
    (clock) => shown_parameters(appMode, clock),
    CLOCK_MIRROR_MS,
  );
  return useMemo(
    () =>
      shownParameters
        ? apply_parameter_snapshot_to_mechanism(mechanism, shownParameters).simulation
        : mechanism.simulation,
    [mechanism, shownParameters],
  );
}

/** Simulation speed steps, slowest to fastest. */
export const SPEEDS: SimulationSpeed[] = [0.1, 0.25, 0.5, 1, 2, 4, 10];

/** Switches the app to `newMode`, with the simulation reset that entering it calls for. */
export function change_app_mode(
  newMode: AppMode,
  setAppMode: (mode: AppMode) => void,
  mechanism: Mechanism,
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void,
): void {
  setAppMode(newMode);
  // Same tick as `setAppMode`, not left to the hook's own effect: switching directly between kinematic and dynamic (no edition in between) otherwise leaves a render where `appMode` already reads the new mode but `runtimeState.simulationSnapshots` still holds the other mode's snapshot shape — see `simulationResetPatch`.
  setRuntimeState((prev) => ({
    ...prev,
    ...simulationResetPatch(newMode, mechanism),
    isPlaying: false,
  }));
  if (newMode !== "edition")
    // Remembering the last mode is a preference, not a content edit — it must not bump `modifiedAt` and surface the mechanism as "recently modified" in the gallery just for having been tried in simulation.
    updateMetadata({ ...mechanism.metadata, lastSimulationMode: newMode }, false);
}
