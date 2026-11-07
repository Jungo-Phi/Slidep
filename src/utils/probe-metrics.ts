/**
 * Which metrics a probe may read on which element, and in what order they are listed.
 *
 * Kept free of React so the mechanism edits, which the solver worker also loads, can ask the same question as the selector.
 */

import {
  DEFAULT_PROBE_COMPONENTS,
  type MechanicalElement,
  type ProbeConfig,
  type ProbeMetric,
} from "../types/element";
import { samples_own_point } from "./element-queries";
import type { StringKey } from "../i18n";

export const PROBE_METRIC_LABEL_KEYS: Record<ProbeMetric, StringKey> = {
  position: "metric_position",
  velocity: "velocity_one",
  acceleration: "metric_acceleration",
  angle: "angle",
  "angular-velocity": "metric_angular_velocity",
  "angular-acceleration": "metric_angular_acceleration",
  "motor-power": "metric_motor_power",
  force: "force",
  "force-start": "metric_force_start",
  "force-end": "metric_force_end",
  moment: "moment",
  "moment-start": "metric_moment_start",
  "moment-end": "metric_moment_end",
  weight: "overlay_weight_one",
  inertia: "overlay_inertia_one",
  "inertia-moment": "metric_inertia_moment",
  length: "length",
  elongation: "metric_elongation",
  "elongation-velocity": "metric_elongation_velocity",
  "axial-force": "metric_axial_force",
  "shear-force": "metric_shear_force",
  "bending-moment": "metric_bending_moment",
  stress: "metric_stress",
  "shear-stress": "metric_shear_stress",
  "belt-tension": "metric_belt_tension",
  "slide-abscissa": "metric_slide_abscissa",
  "slide-velocity": "metric_slide_velocity",
  "motor-torque": "metric_motor_torque",
};

/**
 * The metrics a selector offers, in sections — the list is drawn with a separator between them, so a beam's dozen readings land as four short groups instead of one wall.
 *
 * Sections are the ORDER's own source of truth (`PROBE_METRIC_ORDER` is their concatenation): a metric added to one is offered and grouped by the same edit, and cannot end up listed in a place its group does not explain.
 * A section every element refuses simply does not appear, along with its separator.
 *
 * The four end-of-edge reactions are deliberately absent, and so are `weight`/`inertia`: all of them are read from the canvas overlay rather than plotted over time (see `ProbeMetric`).
 */
const PROBE_METRIC_SECTIONS: ProbeMetric[][] = [
  // Where its own point is, and how that point moves.
  ["position", "velocity", "acceleration"],
  // How it turns.
  ["angle", "angular-velocity", "angular-acceleration"],
  // What the member measures of itself.
  [
    "length",
    "elongation",
    "elongation-velocity",
    "slide-abscissa",
    "slide-velocity",
  ],
  // What a motor delivers.
  ["motor-power", "motor-torque"],
  // What a member carries inside itself, and whether a beam's section holds.
  [
    "axial-force",
    "belt-tension",
    "shear-force",
    "bending-moment",
    "stress",
    "shear-stress",
  ],
  // What it hands to whatever it is attached to.
  ["force", "moment"],
];

export const PROBE_METRIC_ORDER: ProbeMetric[] = PROBE_METRIC_SECTIONS.flat();

/** Angular metrics — the orientation and its two rates — are only meaningful for oriented elements: gears (own angle) and two-point edges (segment orientation).
 * Belts follow a path, nodes are points. */
function angular_metric_available(element: MechanicalElement): boolean {
  return (
    element.type === "gear" ||
    element.type === "beam" ||
    element.type === "spring" ||
    element.type === "damper"
  );
}

/** Reaction metrics come in two shapes: a single point for a node/body element (its own position), or an independent start/end pair for an edge — a beam's root and tip carry unrelated loads, so they are never merged into one reading (see `ElementReaction` in `probe-series.ts`).
 * Each element offers only the shape that matches it, and a spring or a damper offers no couple at all: its law is purely axial, so neither of its ends ever reports one (`member_axial_reaction`). */
function reaction_metric_available(
  metric: "force" | "force-start" | "force-end" | "moment" | "moment-start" | "moment-end",
  element: MechanicalElement,
): boolean {
  const isEdge = "positionStart" in element;
  if (metric === "force" || metric === "moment") return !isEdge;
  if (metric === "moment-start" || metric === "moment-end")
    return isEdge && element.type !== "spring" && element.type !== "damper";
  return isEdge;
}

/** A motor's own readings — the torque it applies and the mechanical power τ·ω that torque carries — only exist where there is a motor to read them from: a pivot with a `motor` config, never a bare pivot or any other element type. */
function motor_metric_available(element: MechanicalElement): boolean {
  return element.type === "pivot" && !!element.motor;
}

/**
 * What a two-point member measures of itself.
 * `length` needs two ends far enough apart to be a straight run, which a belt's own ends are not (it follows a path between them).
 * `elongation` needs a natural length to measure from, and only a spring has one; its rate follows from the same length.
 * An axial force is the one reading three different members all have, by three different routes: a spring's and a damper's own constitutive law, and a beam's cohesion `N`.
 */
function member_metric_available(
  metric: "length" | "elongation" | "elongation-velocity" | "axial-force",
  element: MechanicalElement,
): boolean {
  if (metric === "length" || metric === "axial-force")
    return (
      element.type === "beam" ||
      element.type === "spring" ||
      element.type === "damper"
    );
  if (metric === "elongation") return element.type === "spring";
  return element.type === "spring" || element.type === "damper";
}

/** The efforts and stresses a beam carries inside itself: a beam alone has a section to resolve them against, and a cohesion field to read them from. */
function beam_metric_available(element: MechanicalElement): boolean {
  return element.type === "beam";
}

/** Where a slide reads: on the two elements that run along a rail, and only once one is attached to a rail to read against. */
function slide_metric_available(element: MechanicalElement): boolean {
  return (
    (element.type === "slider" || element.type === "slidep") &&
    element.parentBeamID !== undefined
  );
}

export function probe_metric_available(
  metric: ProbeMetric,
  element: MechanicalElement,
): boolean {
  // All three read the sampled point itself, so all three are offered exactly where that point belongs to the element (`samples_own_point`) — the same rule that decides its velocity arrow.
  if (metric === "position" || metric === "velocity" || metric === "acceleration")
    return samples_own_point(element);
  if (
    metric === "angle" ||
    metric === "angular-velocity" ||
    metric === "angular-acceleration"
  )
    return angular_metric_available(element);
  if (metric === "motor-power" || metric === "motor-torque")
    return motor_metric_available(element);
  if (
    metric === "length" ||
    metric === "elongation" ||
    metric === "elongation-velocity" ||
    metric === "axial-force"
  )
    return member_metric_available(metric, element);
  if (metric === "slide-abscissa" || metric === "slide-velocity")
    return slide_metric_available(element);
  if (metric === "belt-tension") return element.type === "belt";
  if (
    metric === "shear-force" ||
    metric === "bending-moment" ||
    metric === "stress" ||
    metric === "shear-stress"
  )
    return beam_metric_available(element);
  if (
    metric === "force" ||
    metric === "force-start" ||
    metric === "force-end" ||
    metric === "moment" ||
    metric === "moment-start" ||
    metric === "moment-end"
  )
    return reaction_metric_available(metric, element);
  return true;
}

/** Metrics offered in a selector for this element (impossible ones hidden). */
export function available_probe_metrics(
  element: MechanicalElement,
): ProbeMetric[] {
  return PROBE_METRIC_ORDER.filter((m) => probe_metric_available(m, element));
}

/** The same metrics, still grouped, with every section this element refuses dropped — what the list is drawn from. */
export function available_probe_metric_sections(
  element: MechanicalElement,
): ProbeMetric[][] {
  return PROBE_METRIC_SECTIONS.map((section) =>
    section.filter((m) => probe_metric_available(m, element)),
  ).filter((section) => section.length > 0);
}

/** The element's probes with `metric` toggled on/off, in canonical order.
 * Existing configs (display components) are preserved. */
export function toggled_probes(
  element: MechanicalElement,
  metric: ProbeMetric,
): ProbeConfig[] {
  const byMetric = new Map((element.probes ?? []).map((p) => [p.metric, p]));
  if (byMetric.has(metric)) byMetric.delete(metric);
  else
    byMetric.set(metric, {
      metric,
      components: { ...DEFAULT_PROBE_COMPONENTS },
    });
  return PROBE_METRIC_ORDER.filter((m) => byMetric.has(m)).map(
    (m) => byMetric.get(m)!,
  );
}
