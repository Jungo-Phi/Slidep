import React from "react";
import { Box, Typography } from "@mui/material";
import { ProbeMetric } from "../../../types";
import { MetricSample } from "../../solver/recording/probe-series";
import { FormattedMetric, format_metric } from "../metric-display";
import { PROBE_METRIC_LABEL_KEYS } from "../../canvas/ProbeMetricSelector";
import Vector from "../../common/Vector";
import { t } from "../../../i18n";

/** Clockwise is the data model's positive sense, the one every moment on screen is drawn in. */
const SENSE_GLYPH = { cw: "↻", ccw: "↺" } as const;

/** Shown wherever a quantity has no reading at this instant. */
export const NO_READING = "—";

/**
 * One measured quantity's value: its magnitude, its components, and the one unit both read in.
 * Laid out by `format_metric`, so what a quantity shows is decided once, per quantity, rather than here.
 * A `summary` keeps the magnitude alone, for a row that leads to the full reading — falling back to the components where the quantity has no magnitude worth showing.
 */
export const MetricValue: React.FC<{
  formatted: FormattedMetric | undefined;
  summary?: boolean;
}> = ({ formatted, summary = false }) => {
  if (formatted === undefined)
    return (
      <Typography variant="caption" color="text.disabled">
        {NO_READING}
      </Typography>
    );
  const { unit, main, sense, vector } = formatted;
  const showVector = vector !== undefined && (!summary || main === undefined);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        minWidth: 0,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {main !== undefined && (
        <Typography variant="caption" fontWeight={600} noWrap>
          {sense && `${SENSE_GLYPH[sense]} `}
          {main}
        </Typography>
      )}
      {showVector && <Vector value={vector} unit={unit} />}
      <Typography variant="caption" color="text.secondary" noWrap>
        {unit.symbol}
      </Typography>
    </Box>
  );
};

/**
 * Everything one reading reads, side by side: a resultant and its couple for a reaction, a single value for anything else.
 * A quantity with nothing to report at this instant is left out rather than shown as a blank, and a reading with nothing at all reads as one dash.
 */
export const MetricValues: React.FC<{
  formatted: (FormattedMetric | undefined)[];
  summary?: boolean;
}> = ({ formatted, summary = false }) => {
  const present = formatted.filter(
    (value): value is FormattedMetric => value !== undefined,
  );
  if (present.length === 0)
    return (
      <Typography variant="caption" color="text.disabled">
        {NO_READING}
      </Typography>
    );
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
      {present.map((value, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <Typography variant="caption" color="text.disabled">
              ·
            </Typography>
          )}
          <MetricValue formatted={value} summary={summary} />
        </React.Fragment>
      ))}
    </Box>
  );
};

/** One value of the inspected subject: what it is on the left, what it reads on the right. */
export const ValueRow: React.FC<{
  label: string;
  formatted: FormattedMetric | undefined;
}> = ({ label, formatted }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 1,
      minHeight: 22,
    }}
  >
    <Typography variant="caption" color="text.secondary" noWrap>
      {label}
    </Typography>
    <MetricValue formatted={formatted} />
  </Box>
);

/** One measured quantity of the inspected subject, labelled the way a probe names it. */
export const MetricRow: React.FC<{
  metric: ProbeMetric;
  sample: MetricSample | undefined;
}> = ({ metric, sample }) => (
  <ValueRow
    label={t(PROBE_METRIC_LABEL_KEYS[metric])}
    formatted={sample && format_metric(sample)}
  />
);

export default MetricRow;
