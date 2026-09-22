import { ProbeMetric, WorldPoint } from "../../types";
import { Point2 } from "../../types/point2";
import { MetricSample } from "../solver/recording/probe-series";
import { quantity_kind_for_metric } from "../solver/recording/negligibility-pool";
import {
  QuantityKind,
  QuantityUnit,
  display_unit,
  to_mantissa,
} from "../../utils/quantity-format";

/**
 * How one measured quantity reads in a panel row.
 * - `vector`: its two components alone. A position's own magnitude is its distance to the canvas origin, which is arbitrary.
 * - `magnitude`: its length alone. A weight always points along gravity, so its components carry nothing the magnitude does not.
 * - `both`: the magnitude as the headline, the components beside it.
 * - `scalar`: one signed number.
 * - `turn`: a rotation, shown as a sense and a magnitude rather than a sign the reader has to decode.
 */
export type MetricShape = "vector" | "magnitude" | "both" | "scalar" | "turn";

export function metric_shape(metric: ProbeMetric): MetricShape {
  switch (metric) {
    case "position":
      return "vector";
    case "weight":
      return "magnitude";
    case "velocity":
    case "acceleration":
    case "inertia":
    case "force":
    case "force-start":
    case "force-end":
      return "both";
    case "angle":
    case "angular-velocity":
    case "angular-acceleration":
    case "motor-power":
    case "length":
    case "elongation":
    case "elongation-velocity":
    case "axial-force":
    case "shear-force":
    // A bending moment is signed by whether the beam smiles or frowns, not by a sense of rotation — "turn" would decode that sign into a clockwise arrow that means nothing here.
    case "bending-moment":
    case "stress":
    case "shear-stress":
    case "belt-tension":
    case "slide-abscissa":
    case "slide-velocity":
      return "scalar";
    case "moment":
    case "moment-start":
    case "moment-end":
    case "inertia-moment":
    case "motor-torque":
      return "turn";
  }
}

/** Decimals shown on every reading, whatever its unit: the unit ladder is what keeps a small value legible, not the digits after the point. */
const PRECISION = 2;

/**
 * One measured quantity ready to render.
 * Everything shown shares `unit`, chosen on the largest of the quantity's own readings: a magnitude in kN beside components in N would read as a different quantity, so the symbol is placed once, by the renderer, for all of them.
 */
export interface FormattedMetric {
  unit: QuantityUnit;
  /** Mantissa of the headline reading, absent where the quantity is read as its components alone. */
  main?: number;
  /** Clockwise or counter-clockwise, in the data model's own sense (positive is clockwise), absent at exactly zero. */
  sense?: "cw" | "ccw";
  /** The component pair, for the quantities that show one — drawn stacked, x over y (`Vector`). */
  vector?: WorldPoint;
}

/** A single SI value laid out like a scalar reading, for a quantity no series carries. */
export function format_scalar(value: number, kind: QuantityKind): FormattedMetric {
  const unit = display_unit(Math.abs(value), kind, PRECISION);
  return { unit, main: to_mantissa(value, unit, PRECISION) };
}

const curve = (sample: MetricSample, key: string): number | undefined =>
  sample.values.find((v) => v.key === key)?.value;

/**
 * `sample` laid out according to its own `metric_shape`, or `undefined` when it carries no reading at this instant — no snapshot yet, or a quantity this mode never computes.
 * The caller decides what an absent reading looks like; every shape here is a value that exists.
 */
export function format_metric(
  sample: MetricSample,
): FormattedMetric | undefined {
  if (sample.values.length === 0) return undefined;
  const unit = display_unit(
    Math.max(...sample.values.map(({ value }) => Math.abs(value)), 0),
    quantity_kind_for_metric(sample.metric),
  );
  const base = { unit };
  const mantissa = (value: number) => to_mantissa(value, unit, PRECISION);
  const pair = (): WorldPoint | undefined => {
    const x = curve(sample, "x");
    const y = curve(sample, "y");
    return x === undefined || y === undefined
      ? undefined
      : (new Point2(x, y) as WorldPoint);
  };
  const norm = curve(sample, "norm");
  const value = curve(sample, "value");

  switch (metric_shape(sample.metric)) {
    case "vector":
      return { ...base, vector: pair() };
    case "magnitude":
      return norm === undefined ? undefined : { ...base, main: mantissa(norm) };
    case "both":
      return {
        ...base,
        main: norm === undefined ? undefined : mantissa(norm),
        vector: pair(),
      };
    case "scalar":
      return value === undefined
        ? undefined
        : { ...base, main: mantissa(value) };
    case "turn":
      return value === undefined
        ? undefined
        : {
            ...base,
            main: mantissa(Math.abs(value)),
            sense: value === 0 ? undefined : value > 0 ? "cw" : "ccw",
          };
  }
}
