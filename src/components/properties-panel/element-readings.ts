import { MechanicalElement, OverlayKind, ProbeMetric } from "../../types";
import { StringKey } from "../../i18n";
import { probe_metric_available } from "../canvas/ProbeMetricSelector";
import { DynamicSnapshot } from "../../types/runtime-state";
import { PhysicsOverlayKind } from "../../constants/physics-display-specs";
import { ICON_COLORS } from "../../theme/canvas-theme";
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
  return icon_tinted(name, ICON_COLORS.OVERLAY[kind]);
}

/**
 * The glyph of a whole overlay layer, for the lists that switch layers rather than read them.
 * The trajectory's own keeps the theme's stroke: its drawn hue is handed out per element shown so several can be told apart, leaving no one colour to stand for it.
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
    // A member's own internal effort, read along it rather than at one of its ends (see `merged_internal`): one axial figure, a belt's most loaded strand, and for a beam nothing at all — what it carries is the field the diagrams draw, which no single figure stands for (`reading_quantities`).
    merged_internal(focus)
      ? element.type === "beam"
        ? []
        : element.type === "belt"
          ? ["belt-tension"]
          : ["axial-force"]
      : focus.kind === "reaction-support" || focus.kind === "reaction-internal"
        ? reaction_metrics(focus.which ?? "node")
        : focus.kind === "inertia" && element_has_rotational_inertia(element)
          ? ["inertia", "inertia-moment"]
          : [focus.kind];
  return {
    focus,
    metrics,
    icon: reading_icon(focus.kind),
    color: ICON_COLORS.OVERLAY[focus.kind],
  };
}

const reading = (
  element: MechanicalElement,
  kind: PhysicsOverlayKind,
  which?: ReactionPoint,
): Reading =>
  reading_from_focus({ elementID: element.id, kind, which }, element);

/** One line of what a reading spells out: a quantity, under the name it goes by inside that reading. */
export interface ReadingQuantity {
  value: InspectorValue;
  labelKey: StringKey;
}

/**
 * What a reading spells out, line by line, once it is the panel's own subject.
 * Each line is named for what it adds to the reading rather than for the quantity on its own — under "Velocity", "linear" and "angular" say something, where "velocity" would only repeat the heading above it.
 * Richer than `Reading.metrics`, which is the summary one row of a list can hold: a weight is read here with the mass it comes from, a velocity with the rotation that goes with it.
 */
export function reading_quantities(
  reading: Reading,
  element: MechanicalElement,
): ReadingQuantity[] {
  switch (reading.focus.kind) {
    case "velocity": {
      const linear: ReadingQuantity = {
        value: "velocity",
        labelKey: "quantity_linear",
      };
      // A point has no rotation of its own to read; an oriented element does.
      return probe_metric_available("angular-velocity", element)
        ? [linear, { value: "angular-velocity", labelKey: "quantity_angular" }]
        : [linear];
    }
    // The force, and what it is the weight OF: the mass is the one figure that explains the other, and the way to change it.
    case "weight":
      return [
        { value: "weight", labelKey: "force" },
        { value: "mass", labelKey: "mass" },
      ];
    case "inertia":
      return element_has_rotational_inertia(element)
        ? [
            { value: "inertia", labelKey: "force" },
            { value: "inertia-moment", labelKey: "moment" },
          ]
        : [{ value: "inertia", labelKey: "force" }];
    case "reaction-internal":
    case "reaction-support": {
      // A beam says nothing here: its effort is the field the diagrams draw, not a figure.
      // A spring or a damper is a massless member with a purely axial law, so that one figure is its whole torsor — no couple at either end to read beside it (`member_axial_reaction`).
      if (merged_internal(reading.focus))
        return element.type === "beam"
          ? []
          : element.type === "belt"
            ? [{ value: "belt-tension", labelKey: "metric_belt_tension" }]
            : [{ value: "axial-force", labelKey: "metric_axial_force" }];
      const [force, moment] = reaction_metrics(reading.focus.which ?? "node");
      return [
        { value: force, labelKey: "force" },
        { value: moment, labelKey: "moment" },
      ];
    }
  }
}

/**
 * Whether this reading is a member's internal effort taken as a whole rather than at one of its ends.
 * Both ends of a two-point member report the same effort, opposite in sign, so reading them apart says one thing twice — and a beam, whose two ends genuinely differ, is read as the field between them instead (`CohesionDiagrams`).
 * A belt reports at both ends of every strand, and reads as its most loaded one.
 * A gear's own internal reaction sits at its centre and keeps its point, having only ever had one.
 */
export function merged_internal(focus: FocusedOverlay): boolean {
  return focus.kind === "reaction-internal" && focus.which === undefined;
}

/**
 * The reading a click names, as the panel and the canvas both understand it.
 * The one place an end is dropped: a click lands on one arrow, but what it names is the effort the whole member carries.
 */
export function focus_of_reading(focus: FocusedOverlay): FocusedOverlay {
  return focus.kind === "reaction-internal" && focus.which !== "node"
    ? { elementID: focus.elementID, kind: focus.kind }
    : focus;
}

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
  // The kinematic solver draws a trajectory and, differentiated from its positions, a velocity; every other reading here is a force, a mass or an acceleration, which only dynamic mode has.
  const overlays = dynamic
    ? available_overlays(element)
    : available_overlays(element).filter(
        (kind) => kind === "trajectory" || kind === "velocity",
      );
  const single = (overlay: OverlayKind, kind: PhysicsOverlayKind) => {
    if (!overlays.includes(overlay)) return;
    groups.push({
      layer: { kind: "element-overlay", overlay },
      icon: reading_icon(kind),
      color: ICON_COLORS.OVERLAY[kind],
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
        color: ICON_COLORS.OVERLAY[kind],
        readings: [],
      };
      groups.push(group);
    }
    // An edge's two ends carry one and the same internal effort, so the layer holds one reading for the member (see `merged_internal`) — the second point it reports at adds nothing.
    const merged = !support && r.which !== "node";
    if (merged && group.readings.length > 0) continue;
    group.readings.push(reading(element, kind, merged ? undefined : r.which));
  }
  return groups;
}

/**
 * A value read as a plain number beside an element: a measured quantity, or one of the two no series carries.
 * Those two are read off the mechanism in the pose on screen instead — a mass is not a time series at all, and a belt's length is its whole path around its pulleys, which a recording holds no single slot for.
 */
export type InspectorValue = ProbeMetric | "mass" | "belt-length";

/** Whether a value is one a recording carries, as opposed to one the panel works out from the pose on screen. */
export function is_series_value(value: InspectorValue): value is ProbeMetric {
  return value !== "mass" && value !== "belt-length";
}

/**
 * What `SelectionInspector` shows of one element, decided per element type rather than by what a probe can measure.
 * Everything an element has to say is on screen at once: there is no folded view, and so no line a reader has to go looking for.
 * A value never repeats what a layer already reads, which is why an element with a velocity layer lists no velocity of its own, in either mode.
 */
export interface InspectorLayout {
  values: InspectorValue[];
  /**
   * Whether the layers come before the values.
   * The two blocks trade places, never their rows: a layer row carries a control and a value row a figure, so interleaving the two per element type would cost more in legibility than the ordering wins.
   * True where what the canvas draws IS the element's headline — a beam's internal effort, an anchored node's reaction — false where a plain figure is, such as a gear's own speed.
   */
  layersFirst: boolean;
}

export function inspector_layout(
  element: MechanicalElement,
  dynamic: boolean,
): InspectorLayout {
  const layout = (
    values: InspectorValue[],
    layersFirst = false,
  ): InspectorLayout => ({ values, layersFirst });
  // An anchored node does not move, so what it says is what the ground pushes back with.
  const grounded = "isGrounded" in element && element.isGrounded;

  // Kinematic mode draws no force, no mass and no acceleration, so an element is down to its own geometry — and to the trajectory and the velocity, the two layers this mode does draw.
  if (!dynamic)
    switch (element.type) {
      case "beam":
        return layout(["length", "angle"]);
      case "spring":
        return layout(["length", "elongation", "angle", "angular-velocity"]);
      case "damper":
        return layout([
          "length",
          "elongation-velocity",
          "angle",
          "angular-velocity",
        ]);
      case "belt":
        return layout(["belt-length"]);
      case "gear":
        return layout(["angle"]);
      case "slider":
      case "slidep":
        return layout(["slide-abscissa", "slide-velocity", "position"]);
      case "pivot":
      case "join":
      case "mass":
        return layout(["position"]);
    }

  switch (element.type) {
    // What a beam is there for is what it carries, so its own end torsors lead and the geometry follows.
    // No angular velocity for it: its velocity reading spells that out already (`reading_quantities`), and saying it twice is what this table is trying to stop — a spring and a damper have no such reading, so each names its own rotation here.
    case "beam":
      return layout(["length", "angle", "mass"], true);
    case "spring":
      return layout(["length", "elongation", "angle", "angular-velocity"], true);
    case "damper":
      return layout(
        ["length", "elongation-velocity", "angle", "angular-velocity"],
        true,
      );
    // Its tension is what a belt is there to carry, and its internal-effort layer already reads it.
    case "belt":
      return layout(["belt-length"], true);
    case "gear":
      return layout(["angle"]);
    // Anchored, a node is read through the reaction the ground answers with; free, its position and whatever drives it come first.
    case "pivot":
      return layout(
        element.motor ? ["motor-power", "position"] : ["position"],
        grounded,
      );
    case "join":
      return layout(["position"], grounded);
    case "slider":
    case "slidep":
      return layout(["slide-abscissa", "slide-velocity", "position"]);
    case "mass":
      return layout(["position"], true);
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
