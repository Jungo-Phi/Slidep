import { MechanicalElement, ProbeMetric } from "../../types/element";
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
