import { useMemo } from "react";
import type { StringKey } from "../../i18n";
import {
  Action,
  AppMode,
  Mechanism,
  MechanismMetadata,
  SimulationSpeed,
  is_simulating,
} from "../../types";
import { useSimClockSelector } from "../solver/dynamics/sim-clock";
import {
  CLOCK_MIRROR_MS,
  shown_parameters,
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

/** The modes the selector offers, rest first. */
export const RUN_MODES: {
  mode: AppMode;
  labelKey: StringKey;
  shortKey: StringKey;
  tooltipKey: StringKey;
}[] = [
  {
    mode: "static",
    labelKey: "mode_static",
    shortKey: "mode_static_short",
    tooltipKey: "mode_static_tooltip",
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

/**
 * Switches the app to `newMode` and remembers it as the mechanism's last run mode.
 * `setAppMode` is `useSimulationPlayback`'s `changeMode`, which sets the clock along with the mode.
 */
export function change_app_mode(
  newMode: AppMode,
  setAppMode: (mode: AppMode) => void,
  mechanism: Mechanism,
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void,
): void {
  setAppMode(newMode);
  if (is_simulating(newMode))
    // Remembering the last mode is a preference, not a content edit — it must not bump `modifiedAt` and surface the mechanism as "recently modified" in the gallery just for having been tried in simulation.
    updateMetadata({ ...mechanism.metadata, lastSimulationMode: newMode }, false);
}
