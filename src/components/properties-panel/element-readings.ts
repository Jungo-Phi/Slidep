import { MechanicalElement, OverlayKind, ProbeMetric } from "../../types";
import { DynamicSnapshot } from "../../types/runtime-state";
import {
  PHYSICS_OVERLAY_COLOR,
  PhysicsOverlayKind,
} from "../../constants/physics-display-specs";
import { GRAVITY } from "../../constants/physics-specs";
import { icon, icon_tinted } from "../element-palette/iconDataUris";
import { available_overlays, is_node_element } from "../../utils/element-queries";
import {
  element_carries_mass,
  element_centroidal_inertia,
  element_has_rotational_inertia,
  element_mass,
} from "../../utils/element-mass";
import {
  MetricSample,
  ReactionPoint,
  element_acceleration,
  element_angular_acceleration,
  element_reactions,
} from "../solver/recording/probe-series";
import { MaterialDef, ProfileDef } from "../../types/material";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";

/** Every list that shows an overlay glyph draws it at this size, the one the "Afficher" menu sets. */
export const OVERLAY_ICON_SIZE = 18;

/**
 * The glyph that stands for a reading, tinted with the hue the canvas draws it in.
 * One drawing serves several quantities: an arrow is a weight or an inertial force by its colour alone, exactly as on the canvas.
 * A reaction has its own, resultant and couple in one glyph, because that is what it is.
 */
export function reading_icon(kind: PhysicsOverlayKind): string {
  const name =
    kind === "velocity"
      ? "speed"
      : kind === "reaction-support" || kind === "reaction-internal"
        ? "reaction"
        : "force";
  return icon_tinted(name, PHYSICS_OVERLAY_COLOR[kind]);
}

/**
 * The glyph of a whole overlay layer, for the lists that switch layers rather than read them.
 * The trajectory's own keeps the theme's stroke: its drawn hue is handed out per shown trajectory so several can be told apart, leaving no one colour to stand for it.
 */
export function overlay_icon(kind: OverlayKind): string {
  switch (kind) {
    case "trajectory":
      return icon("trajectory");
    case "velocity":
    case "weight":
    case "inertia":
      return reading_icon(kind);
    // An element's own force layer draws the reactions between it and its neighbours; a support's own is switched mechanism-wide.
    case "force":
      return reading_icon("reaction-internal");
  }
}

/**
 * One overlay reading of an element: a quantity the canvas draws, and which is therefore read by selecting it rather than by listing its components beside the element itself.
 * `metrics` names what it measures the way a probe does, which is where each label, unit and layout comes from — two of them for a reaction, whose resultant and couple are one reading but two curves.
 */
export interface Reading {
  focus: FocusedOverlay;
  metrics: ProbeMetric[];
  icon: string;
  color: string;
}

/**
 * What one eye switches.
 * A support reaction has no element flag of its own: it is a property of the problem rather than of the node it sits on, and is switched mechanism-wide (see `OverlaysMenu`), so its group offers no eye.
 */
export type ReadingLayer =
  | { kind: "element-overlay"; overlay: OverlayKind }
  | { kind: "support-reactions" };

export type LayerKey = OverlayKind | "support-reactions";

/** Identifies a layer among an element's own — a React key, and how the readings of one layer find each other. */
export function layer_key(layer: ReadingLayer): LayerKey {
  return layer.kind === "support-reactions" ? layer.kind : layer.overlay;
}

/**
 * The readings one layer holds, in the order they are listed under an element.
 * A layer with several is a group: one eye above, its readings under it.
 * `readings` empty means the layer is drawn without ever being read — a trajectory.
 */
export interface ReadingGroup {
  layer: ReadingLayer;
  icon: string;
  /** The hue the canvas draws it in, absent for a trajectory (see `overlay_icon`). */
  color?: string;
  readings: Reading[];
}

/** What a reaction at `which` measures: the reaction metrics already come in a per-point shape (node, start, end), which is exactly the shape a drawn reaction has.
 * Both are always named; one with nothing to report at this instant simply shows no reading (see `format_metric`). */
function reaction_metrics(which: ReactionPoint): ProbeMetric[] {
  if (which === "node") return ["force", "moment"];
  if (which === "start") return ["force-start", "moment-start"];
  return ["force-end", "moment-end"];
}

/**
 * The reading a canvas click or a panel row names, on `element`, the element it is read from.
 * Every kind but the reactions is a `ProbeMetric` of its own name, so only they need `which` to say which point of the element they read at.
 * A body that turns as a whole reads its inertia as a force and a couple together, the way a reaction does; a point mass has no couple to read.
 */
export function reading_from_focus(
  focus: FocusedOverlay,
  element: MechanicalElement,
): Reading {
  const metrics: ProbeMetric[] =
    focus.kind === "reaction-support" || focus.kind === "reaction-internal"
      ? reaction_metrics(focus.which ?? "node")
      : focus.kind === "inertia" && element_has_rotational_inertia(element)
        ? ["inertia", "inertia-moment"]
        : [focus.kind];
  return {
    focus,
    metrics,
    icon: reading_icon(focus.kind),
    color: PHYSICS_OVERLAY_COLOR[focus.kind],
  };
}

const reading = (
  element: MechanicalElement,
  kind: PhysicsOverlayKind,
  which?: ReactionPoint,
): Reading =>
  reading_from_focus({ elementID: element.id, kind, which }, element);

/** Whether two readings name the same thing — a canvas click and a panel row meeting on one row. */
export function same_reading(a: FocusedOverlay, b: FocusedOverlay): boolean {
  return (
    a.elementID === b.elementID && a.kind === b.kind && a.which === b.which
  );
}

/**
 * Every reading `element` carries at the instant on screen, grouped by the eye that shows them.
 * Reactions are read off `snapshot` rather than derived from the element's shape, so the list holds exactly the readings the canvas can draw: which points report a force, and which of them also report a couple, is the solver's answer rather than a property of the element.
 */
export function element_reading_groups(
  element: MechanicalElement,
  snapshot: DynamicSnapshot | undefined,
  dynamic: boolean,
): ReadingGroup[] {
  const groups: ReadingGroup[] = [];
  // A trajectory is the one layer the kinematic solver draws too; every other reading here is a force, a mass or an acceleration, which only dynamic mode has.
  const overlays = dynamic
    ? available_overlays(element)
    : available_overlays(element).filter((kind) => kind === "trajectory");
  const single = (overlay: OverlayKind, kind: PhysicsOverlayKind) => {
    if (!overlays.includes(overlay)) return;
    groups.push({
      layer: { kind: "element-overlay", overlay },
      icon: reading_icon(kind),
      color: PHYSICS_OVERLAY_COLOR[kind],
      readings: [reading(element, kind)],
    });
  };

  if (overlays.includes("trajectory"))
    groups.push({
      layer: { kind: "element-overlay", overlay: "trajectory" },
      icon: overlay_icon("trajectory"),
      readings: [],
    });
  // `OVERLAY_KIND_ORDER`'s own order, which every other list of these follows.
  single("velocity", "velocity");
  single("inertia", "inertia");
  single("weight", "weight");

  if (!snapshot) return groups;
  const isNode = is_node_element(element);
  for (const r of element_reactions(element, snapshot)) {
    // Only a node ever reads as a support reaction, and only where it is anchored — the same split `use-simulation-playback` colours the arrows by.
    const support = r.atAnchor && isNode;
    // A free node's reading is zero wherever beams carry it, and means little where they do not, so nothing draws it — same guard the arrows themselves apply.
    if (isNode && !support) continue;
    const kind: PhysicsOverlayKind = support
      ? "reaction-support"
      : "reaction-internal";
    const layer: ReadingLayer = support
      ? { kind: "support-reactions" }
      : { kind: "element-overlay", overlay: "force" };
    let group = groups.find((g) => layer_key(g.layer) === layer_key(layer));
    if (!group) {
      group = {
        layer,
        icon: reading_icon(kind),
        color: PHYSICS_OVERLAY_COLOR[kind],
        readings: [],
      };
      groups.push(group);
    }
    group.readings.push(reading(element, kind, r.which));
  }
  return groups;
}

/** A value read as a plain number beside an element: a measured quantity, or its mass, which no series carries. */
export type InspectorValue = ProbeMetric | "mass";

/**
 * What `SelectionInspector` shows of one element, decided per element type rather than by what a probe can measure.
 * `values` and the `featured` layers are always on screen; `details` and every other layer only once the reader unfolds them.
 * A value never repeats what a layer already reads, which is why velocity is a value in kinematic mode only.
 */
export interface InspectorLayout {
  values: InspectorValue[];
  details: InspectorValue[];
  featured: LayerKey[];
  /** The internal readings at both ends are summed up as one axial force: a massless member pushes equally on both, so they say the same thing twice. */
  axialForce: boolean;
}

export function inspector_layout(
  element: MechanicalElement,
  dynamic: boolean,
): InspectorLayout {
  const layout = (
    values: InspectorValue[],
    details: InspectorValue[],
    featured: LayerKey[] = [],
    axialForce = false,
  ): InspectorLayout => ({ values, details, featured, axialForce });
  // An anchored node does not move, so what it says is what the ground pushes back with.
  const grounded = "isGrounded" in element && element.isGrounded;

  if (!dynamic)
    switch (element.type) {
      case "beam":
        return layout(["angular-velocity"], ["angle", "length"]);
      case "spring":
        return layout(["length", "elongation"], ["angle", "angular-velocity"]);
      case "damper":
        return layout(["length"], ["angle", "angular-velocity"]);
      case "belt":
        return layout([], ["length"]);
      case "gear":
        return layout(["angular-velocity"], ["angle"]);
      case "slider":
      case "slidep":
        return layout(
          ["slide-abscissa", "slide-velocity"],
          ["position", "velocity"],
          ["trajectory"],
        );
      case "pivot":
      case "join":
      case "mass":
        return grounded
          ? layout([], ["position"])
          : layout(["velocity"], ["position"], ["trajectory"]);
    }

  const at_rest_or_moving: LayerKey = grounded ? "support-reactions" : "velocity";
  switch (element.type) {
    case "beam":
      return layout(
        [],
        ["angle", "angular-velocity", "length", "elongation", "mass"],
        ["force"],
      );
    case "spring":
      return layout(
        ["length", "elongation"],
        ["angle", "angular-velocity"],
        ["force"],
        true,
      );
    case "damper":
      return layout(
        ["elongation-velocity"],
        ["length", "angle", "angular-velocity"],
        ["force"],
        true,
      );
    case "belt":
      return layout(["belt-tension"], ["length"]);
    case "gear":
      return layout(["angular-velocity"], ["angle"]);
    case "pivot":
      return layout(
        element.motor ? ["motor-power", "motor-torque"] : [],
        ["position"],
        [at_rest_or_moving],
      );
    case "join":
      return layout([], ["position"], [at_rest_or_moving]);
    case "slider":
    case "slidep":
      return layout(["slide-abscissa", "slide-velocity"], ["position"], ["velocity"]);
    case "mass":
      return layout([], ["position"], [at_rest_or_moving, "inertia"]);
  }
}

/**
 * The value of a weight or inertia reading, the ones no probe series carries: each is a mass, or a moment of inertia, times something, so each needs the catalogue that mass is read from (`get_dynamic_metric_at` answers every other reading).
 * `undefined` where the quantity does not exist right now: gravity off, no snapshot to read an acceleration from, or a point mass asked for a couple.
 */
export function mass_reading_sample(
  element: MechanicalElement,
  metric: "weight" | "inertia" | "inertia-moment",
  snapshot: DynamicSnapshot | undefined,
  gravityOn: boolean,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): MetricSample | undefined {
  if (!element_carries_mass(element)) return undefined;
  const mass = element_mass(element, materials, profiles);
  if (mass <= 0) return undefined;
  if (metric === "inertia-moment") {
    const inertia = element_centroidal_inertia(element, materials, profiles);
    const alpha = snapshot
      ? element_angular_acceleration(element, snapshot)
      : undefined;
    if (inertia === undefined || alpha === undefined) return undefined;
    // The solver turns counter-clockwise positive; every moment on screen reads clockwise positive.
    return {
      metric,
      unit: "N·m",
      values: [{ key: "value", value: -inertia * alpha }],
    };
  }
  const vector =
    metric === "weight"
      ? gravityOn
        ? GRAVITY.mul(mass)
        : undefined
      : snapshot && element_acceleration(element, snapshot)?.mul(mass);
  if (!vector) return undefined;
  return {
    metric,
    unit: "N",
    values: [
      { key: "x", value: vector.x },
      { key: "y", value: vector.y },
      { key: "norm", value: vector.length() },
    ],
  };
}
