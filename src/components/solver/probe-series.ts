import {
  ID,
  MechanicalElement,
  ProbeMetric,
  is_node_element,
  overlay_shown,
} from "../../types/element";
import { Point2 } from "../../types/point2";
import { KinematicSnapshot } from "../../types/runtime-state";

export type ProbeCurveKey = "x" | "y" | "norm" | "value";

export interface ProbeCurve {
  key: ProbeCurveKey;
  values: number[];
}

/** Time series of a probed metric: shared time axis + one array per curve.
 *  Empty `t` means no data (no snapshots yet, or metric not computed in the
 *  current simulation mode — e.g. force in kinematic). */
export interface ProbeSeries {
  t: number[];
  curves: ProbeCurve[];
  unit: string;
}

/** Where a probe samples an element: its position for nodes/bodies, the
 *  midpoint for edges. */
function sample_position(
  element: MechanicalElement,
  snapshot: KinematicSnapshot,
): Point2 | undefined {
  if ("position" in element) return snapshot.positions.get(element.id);
  const start = snapshot.positions.get(`${element.id}:start`);
  const end = snapshot.positions.get(`${element.id}:end`);
  return start && end ? start.lerp(end, 0.5) : undefined;
}

/** Oriented angle of the element (rad): gear own angle, or edge direction. */
function sample_angle(
  element: MechanicalElement,
  snapshot: KinematicSnapshot,
): number | undefined {
  if (element.type === "gear") return snapshot.angles.get(element.id);
  const start = snapshot.positions.get(`${element.id}:start`);
  const end = snapshot.positions.get(`${element.id}:end`);
  return start && end ? end.sub(start).angle() : undefined;
}

/** The recorded path of one element (canvas trajectory overlay). */
export interface ProbeTrajectory {
  elementID: ID;
  points: Point2[];
  /** Number of points at or before the playback time `time`. */
  headCount: number;
}

/**
 * Extract the trajectory of every node whose `trajectory` overlay is on from
 * the recorded kinematic snapshots, in mechanical-element order. Trajectories
 * only apply to node elements (a single moving point).
 */
export function get_probe_trajectories(
  elements: MechanicalElement[],
  snapshots: KinematicSnapshot[],
  time: number,
): ProbeTrajectory[] {
  const out: ProbeTrajectory[] = [];
  for (const el of elements) {
    if (!is_node_element(el) || !overlay_shown(el, "trajectory")) continue;
    const points: Point2[] = [];
    let headCount = 0;
    for (const snap of snapshots) {
      const p = sample_position(el, snap);
      if (!p) continue;
      points.push(p);
      if (snap.t <= time) headCount = points.length;
    }
    out.push({ elementID: el.id, points, headCount });
  }
  return out;
}

/**
 * Extract the plottable time series of one probe metric from the recorded
 * kinematic snapshots. Velocity is derived from positions by central finite
 * differences; edge angles are unwrapped so the curve stays continuous across
 * the ±180° seam.
 */
export function get_probe_series(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: KinematicSnapshot[],
): ProbeSeries {
  switch (metric) {
    case "position":
    case "velocity": {
      const t: number[] = [];
      const points: Point2[] = [];
      for (const snap of snapshots) {
        const p = sample_position(element, snap);
        if (!p) continue;
        t.push(snap.t);
        points.push(p);
      }

      let vectors = points;
      if (metric === "velocity") {
        if (points.length < 2) return { t: [], curves: [], unit: "mm/s" };
        vectors = points.map((_, i) => {
          const i0 = Math.max(0, i - 1);
          const i1 = Math.min(points.length - 1, i + 1);
          const dt = t[i1] - t[i0];
          return dt > 0
            ? points[i1].sub(points[i0]).mul(1 / dt)
            : new Point2(0, 0);
        });
      }

      // Position "norm" is the displacement from the start of the recording
      // (‖p‖ would be the distance to the arbitrary canvas origin); velocity
      // norm is the plain magnitude ‖v‖.
      const origin = metric === "position" ? points[0] : undefined;
      return {
        t,
        curves: [
          { key: "x", values: vectors.map((v) => v.x) },
          { key: "y", values: vectors.map((v) => v.y) },
          {
            key: "norm",
            values: vectors.map((v) =>
              origin ? v.sub(origin).length() : Math.hypot(v.x, v.y),
            ),
          },
        ],
        unit: metric === "position" ? "mm" : "mm/s",
      };
    }

    case "angle":
    case "angular-velocity": {
      const t: number[] = [];
      const angles: number[] = []; // unwrapped, rad
      let prev: number | undefined;
      for (const snap of snapshots) {
        let a = sample_angle(element, snap);
        if (a === undefined) continue;
        // Unwrap: keep the curve continuous across the ±π seam.
        if (prev !== undefined) {
          while (a - prev > Math.PI) a -= 2 * Math.PI;
          while (a - prev < -Math.PI) a += 2 * Math.PI;
        }
        prev = a;
        t.push(snap.t);
        angles.push(a);
      }

      if (metric === "angle")
        return {
          t,
          curves: [
            { key: "value", values: angles.map((a) => (a * 180) / Math.PI) },
          ],
          unit: "°",
        };

      // Angular velocity by central differences, in tr/min (motor unit)
      if (angles.length < 2) return { t: [], curves: [], unit: "tr/min" };
      const omega = angles.map((_, i) => {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(angles.length - 1, i + 1);
        const dt = t[i1] - t[i0];
        return dt > 0
          ? (((angles[i1] - angles[i0]) / dt) * 60) / (2 * Math.PI)
          : 0;
      });
      return { t, curves: [{ key: "value", values: omega }], unit: "tr/min" };
    }

    case "force":
      // Not computed by the kinematic solver; static/dynamic will fill this in.
      return { t: [], curves: [], unit: "N" };
  }
}

/** One measured quantity of an element at a given instant. */
export interface MetricSample {
  metric: ProbeMetric;
  unit: string;
  /** One entry per curve of the metric ("x"/"y"/"norm", or "value"). Empty when
   *  the metric has no data yet (no snapshots, or not computed in this mode). */
  values: { key: ProbeCurveKey; value: number }[];
}

/**
 * The instantaneous value of `metric` at simulation time `t`: the same series
 * `get_probe_series` plots, sampled at the recorded time closest to `t`.
 */
export function get_metric_at(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: KinematicSnapshot[],
  t: number,
): MetricSample {
  const series = get_probe_series(element, metric, snapshots);
  if (series.t.length === 0) return { metric, unit: series.unit, values: [] };

  // Nearest recorded sample: the series time axis is uniform (RECORD_DT), but
  // scan for the closest rather than assume it — snapshots can start late.
  let best = 0;
  for (let i = 1; i < series.t.length; i++) {
    if (Math.abs(series.t[i] - t) < Math.abs(series.t[best] - t)) best = i;
  }
  return {
    metric,
    unit: series.unit,
    values: series.curves.map((c) => ({ key: c.key, value: c.values[best] })),
  };
}
