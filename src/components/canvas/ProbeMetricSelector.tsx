import React, { useEffect, useRef } from "react";
import { Box, Checkbox, MenuItem, Paper } from "@mui/material";
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

/** The surface the metric list sits on, shared by both places that show it. */
export const PROBE_METRIC_PAPER_SX = {
  boxShadow: 4,
  borderRadius: 1.5,
  py: 1,
  display: "flex",
  flexDirection: "column",
  outline: "none",
} as const;

interface ProbeMetricSelectorProps {
  element: MechanicalElement;
  /** Called with the element's new probes each time a metric is toggled. */
  onToggle: (newProbes: ProbeConfig[]) => void;
}

/**
 * The metrics an element can measure, ticked on and off. Mounted both in the
 * canvas popover and in the properties panel, so the same choice is made from
 * the same list wherever it is reached.
 */
export const ProbeMetricSelector: React.FC<ProbeMetricSelectorProps> = ({
  element,
  onToggle,
}) => {
  return (
    <>
      {available_probe_metrics(element).map((metric) => (
        <MenuItem
          key={metric}
          dense
          onClick={() => onToggle(toggled_probes(element, metric))}
        >
          <Checkbox
            size="small"
            checked={element.probes.some((p) => p.metric === metric)}
            sx={{ p: 0, ml: -0.5, mr: 1 }}
          />
          {PROBE_METRIC_LABELS[metric]}
        </MenuItem>
      ))}
    </>
  );
};

interface OnCanvasProbeMetricSelectorProps {
  element: MechanicalElement;
  /** Anchor, in screen coordinates. */
  position: Point2;
  /** Called with the element's new probes each time a metric is toggled. */
  onToggle: (newProbes: ProbeConfig[]) => void;
  onClose: () => void;
}

/**
 * Popover for picking what an element measures, opened by placing a probe on it
 * or by clicking the badge of one it already carries.
 *
 * Each metric applies as it is ticked, like the same list in the properties
 * panel: there is nothing to confirm, so closing it never means losing a choice.
 */
export const OnCanvasProbeMetricSelector: React.FC<
  OnCanvasProbeMetricSelectorProps
> = ({ element, position, onToggle, onClose }) => {
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    paperRef.current?.focus();
  }, []);

  return (
    <>
      {/* Backdrop: clicking outside closes it */}
      <Box
        sx={{ position: "absolute", inset: 0, zIndex: 999 }}
        onMouseDown={onClose}
      />
      <Paper
        ref={paperRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") onClose();
        }}
        sx={{
          ...PROBE_METRIC_PAPER_SX,
          position: "absolute",
          left: position.x,
          top: position.y,
          transform: "translate(-50%, 14px)",
          zIndex: 1000,
        }}
      >
        <ProbeMetricSelector element={element} onToggle={onToggle} />
      </Paper>
    </>
  );
};

export default OnCanvasProbeMetricSelector;
