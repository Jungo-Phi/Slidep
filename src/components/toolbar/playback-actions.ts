import { useMemo } from "react";
import type { StringKey } from "../../i18n";
import {
  Action,
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

export interface PhysicsSwitch {
  iconName: "gravity" | "collision" | "floor";
  labelKey: StringKey;
  /** The tooltip of its chip, which says the state as well as the setting. */
  stateKey: StringKey;
  on: boolean;
  /** The action that flips it. */
  toggle: Action;
}

/** Gravity, collisions and floor, as they stand at the instant on screen: what they show is what they flip. */
export const usePhysicsSwitches = (
  appMode: AppMode,
  mechanism: Mechanism,
): PhysicsSwitch[] => {
  const shown = useShownSimulation(appMode, mechanism);
  return [
    {
      iconName: "gravity",
      labelKey: "gravity",
      stateKey: shown.gravity ? "gravity_on" : "gravity_off",
      on: shown.gravity,
      toggle: { type: "SetGravity", enabled: !shown.gravity },
    },
    {
      iconName: "collision",
      labelKey: "collisions",
      stateKey: shown.collisions ? "collisions_on" : "collisions_off",
      on: shown.collisions,
      toggle: { type: "SetCollisions", enabled: !shown.collisions },
    },
    {
      iconName: "floor",
      labelKey: "floor",
      stateKey: shown.floor.enabled ? "floor_on" : "floor_off",
      on: shown.floor.enabled,
      toggle: { type: "SetFloorEnabled", enabled: !shown.floor.enabled },
    },
  ];
};

/** The modes a menu offers: statics is left out until it exists. */
export const RUN_MODES: {
  mode: AppMode;
  labelKey: StringKey;
  shortKey: StringKey;
  tooltipKey: StringKey;
}[] = [
  {
    mode: "edition",
    labelKey: "mode_edition",
    shortKey: "mode_edition_short",
    tooltipKey: "mode_edition_tooltip",
  },
  {
    mode: "kinematic",
    labelKey: "mode_kinematic",
    shortKey: "mode_kinematic_short",
    tooltipKey: "mode_kinematic_tooltip",
  },
  {
    mode: "dynamic",
    labelKey: "mode_dynamic",
    shortKey: "mode_dynamic_short",
    tooltipKey: "mode_dynamic_tooltip",
  },
];

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
