import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
} from "@mui/material";
import {
  DEFAULT_PROBE_COMPONENTS,
  MechanicalElement,
  ProbeConfig,
  ProbeMetric,
} from "../../types/element";
import { Point2 } from "../../types/point2";

export const PROBE_METRIC_LABELS: Record<ProbeMetric, string> = {
  position: "Position",
  velocity: "Vitesse",
  angle: "Angle",
  "angular-velocity": "Vitesse angulaire",
  force: "Force",
};

export const PROBE_METRIC_ORDER: ProbeMetric[] = [
  "position",
  "velocity",
  "angle",
  "angular-velocity",
  "force",
];

/** Angular metrics are only meaningful for oriented elements: gears (own
 *  angle) and two-point edges (segment orientation). Belts follow a path,
 *  nodes are points. */
export function probe_metric_available(
  metric: ProbeMetric,
  element: MechanicalElement,
): boolean {
  if (metric !== "angle" && metric !== "angular-velocity") return true;
  return (
    element.type === "gear" ||
    element.type === "beam" ||
    element.type === "spring" ||
    element.type === "damper"
  );
}

/** Metrics offered in a selector for this element (impossible ones hidden). */
export function available_probe_metrics(
  element: MechanicalElement,
): ProbeMetric[] {
  return PROBE_METRIC_ORDER.filter((m) => probe_metric_available(m, element));
}

/** The element's probes with `metric` toggled on/off, in canonical order.
 *  Existing configs (display components) are preserved. */
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

interface ProbeMetricSelectorProps {
  element: MechanicalElement;
  /** Anchor, in screen coordinates. */
  position: Point2;
  onCommit: (newProbes: ProbeConfig[]) => void;
  onCancel: () => void;
}

/**
 * Popover opened when placing a probe on an element: pick the metric families
 * to measure. Pre-filled (and editable) when the element already has a probe.
 */
export const ProbeMetricSelector: React.FC<ProbeMetricSelectorProps> = ({
  element,
  position,
  onCommit,
  onCancel,
}) => {
  const [selected, setSelected] = useState<Set<ProbeMetric>>(
    () => new Set((element.probes ?? []).map((p) => p.metric)),
  );
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    paperRef.current?.focus();
  }, []);

  const toggle = (metric: ProbeMetric) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  };

  const commit = () => {
    // Keep existing configs (display components) for metrics still selected.
    const oldByMetric = new Map(
      (element.probes ?? []).map((p) => [p.metric, p]),
    );
    const newProbes: ProbeConfig[] = PROBE_METRIC_ORDER.filter((m) =>
      selected.has(m),
    ).map(
      (m) =>
        oldByMetric.get(m) ?? {
          metric: m,
          components: { ...DEFAULT_PROBE_COMPONENTS },
        },
    );
    onCommit(newProbes);
  };

  return (
    <>
      {/* Backdrop: click outside cancels */}
      <Box
        sx={{ position: "absolute", inset: 0, zIndex: 999 }}
        onMouseDown={onCancel}
      />
      <Paper
        ref={paperRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          else if (e.key === "Enter") commit();
        }}
        sx={{
          position: "absolute",
          left: position.x,
          top: position.y,
          transform: "translate(-50%, 14px)",
          zIndex: 1000,
          boxShadow: 4,
          borderRadius: 1.5,
          px: 1.5,
          py: 1,
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {available_probe_metrics(element).map((metric) => (
          <FormControlLabel
            key={metric}
            control={
              <Checkbox
                size="small"
                checked={selected.has(metric)}
                onChange={() => toggle(metric)}
                sx={{ py: 0.25 }}
              />
            }
            label={PROBE_METRIC_LABELS[metric]}
            slotProps={{ typography: { variant: "body2" } }}
            sx={{ mr: 0.5 }}
          />
        ))}
        <Button
          size="small"
          variant="contained"
          onClick={commit}
          sx={{ mt: 0.75, textTransform: "none" }}
        >
          Valider
        </Button>
      </Paper>
    </>
  );
};

export default ProbeMetricSelector;
