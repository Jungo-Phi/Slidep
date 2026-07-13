import React from "react";
import { Box, Typography } from "@mui/material";
import { MechanicalElement, ProbeMetric } from "../../types";
import { RuntimeState } from "../../types/runtime-state";
import {
  MetricSample,
  ProbeCurveKey,
  get_metric_at,
} from "../solver/probe-series";
import {
  PROBE_METRIC_LABELS,
  available_probe_metrics,
} from "../canvas/ProbeMetricSelector";

/** Reserved height of the section in the analysis tab: the panel must not change
 *  shape when the user drags elements around, which is the most frequent gesture
 *  in a motor-less simulation. */
export const ELEMENT_MEASURES_HEIGHT = 116;

const CURVE_LABELS: Record<ProbeCurveKey, string> = {
  x: "x",
  y: "y",
  norm: "‖·‖",
  value: "",
};

const format = (v: number): string =>
  Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)
    ? v.toExponential(1)
    : v.toFixed(2);

/** One measured quantity: label, unit, and its components' current values. */
const MeasureRow: React.FC<{ sample: MetricSample }> = ({ sample }) => (
  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
    <Typography
      variant="caption"
      fontWeight={600}
      noWrap
      sx={{ minWidth: 0, flexShrink: 1 }}
    >
      {PROBE_METRIC_LABELS[sample.metric]}
    </Typography>
    <Box
      sx={{
        flex: 1,
        display: "flex",
        justifyContent: "flex-end",
        gap: 0.75,
        minWidth: 0,
      }}
    >
      {sample.values.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          —
        </Typography>
      ) : (
        sample.values.map(({ key, value }) => (
          <Typography
            key={key}
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {CURVE_LABELS[key] && `${CURVE_LABELS[key]} `}
            <Box
              component="span"
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              {format(value)}
            </Box>
          </Typography>
        ))
      )}
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
      {sample.unit}
    </Typography>
  </Box>
);

interface ElementMeasuresProps {
  /** The selected element, or undefined → the empty prompt. */
  element: MechanicalElement | undefined;
  runtimeState: RuntimeState;
  /** Reserve the height even when empty (analysis tab). */
  reserveHeight?: boolean;
}

/**
 * The measured quantities of one element at the current simulation time — what
 * the mechanism *does*, as opposed to the loads (inputs) that live in its
 * properties. Shown both in the analysis tab (as the reserved "selected element"
 * section) and in the elements tab, so drilling down never loses information.
 */
export const ElementMeasures: React.FC<ElementMeasuresProps> = ({
  element,
  runtimeState,
  reserveHeight = false,
}) => {
  const samples: MetricSample[] = element
    ? available_probe_metrics(element).map((metric: ProbeMetric) =>
        get_metric_at(
          element,
          metric,
          runtimeState.kinematicSnapshots,
          runtimeState.time,
        ),
      )
    : [];

  return (
    <Box
      sx={{
        mx: 2,
        ...(reserveHeight && {
          height: ELEMENT_MEASURES_HEIGHT,
          overflowY: "auto",
        }),
        borderRadius: 3,
        backgroundColor: "action.hover",
        display: "flex",
        flexDirection: "column",
        justifyContent: element ? "flex-start" : "center",
      }}
    >
      {!element ? (
        <Typography
          sx={{
            textAlign: "center",
            fontSize: "0.875rem",
            color: "text.disabled",
            p: 2,
          }}
        >
          Sélectionnez un élément pour voir ses grandeurs
        </Typography>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            px: 1.5,
            pb: 1,
          }}
        >
          {samples.map((sample) => (
            <MeasureRow key={sample.metric} sample={sample} />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ElementMeasures;
