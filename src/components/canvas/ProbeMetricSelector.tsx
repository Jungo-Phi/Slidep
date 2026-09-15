import React, { useLayoutEffect, useRef, useState } from "react";
import { Checkbox, MenuItem, Paper } from "@mui/material";
import {
  DEFAULT_PROBE_COMPONENTS,
  MechanicalElement,
  ProbeConfig,
  ProbeMetric,
} from "../../types/element";
import { ScreenPoint } from "../../types";
import { StringKey, t } from "../../i18n";

export const PROBE_METRIC_LABEL_KEYS: Record<ProbeMetric, StringKey> = {
  position: "metric_position",
  velocity: "velocity_one",
  angle: "angle",
  "angular-velocity": "metric_angular_velocity",
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
};

export const PROBE_METRIC_ORDER: ProbeMetric[] = [
  "position",
  "velocity",
  "angle",
  "angular-velocity",
  "motor-power",
  "force",
  "force-start",
  "force-end",
  "moment",
  "moment-start",
  "moment-end",
];

/** Angular metrics are only meaningful for oriented elements: gears (own
 * angle) and two-point edges (segment orientation).
 * Belts follow a path, nodes are points. */
function angular_metric_available(element: MechanicalElement): boolean {
  return (
    element.type === "gear" ||
    element.type === "beam" ||
    element.type === "spring" ||
    element.type === "damper"
  );
}

/** Reaction metrics come in two shapes: a single point for a node/body
 * element (its own position), or an independent start/end pair for an edge — a beam's root and tip carry unrelated loads, so they are never merged into one reading (see `ElementReaction` in `probe-series.ts`).
 * Each element offers only the shape that matches it. */
function reaction_metric_available(
  metric: "force" | "force-start" | "force-end" | "moment" | "moment-start" | "moment-end",
  element: MechanicalElement,
): boolean {
  const isEdge = "positionStart" in element;
  return metric === "force" || metric === "moment" ? !isEdge : isEdge;
}

/** A motor's own mechanical power (τ·ω) only exists where there is a motor to read it
 * from — a pivot with a `motor` config, never a bare pivot or any other element type. */
function motor_power_available(element: MechanicalElement): boolean {
  return element.type === "pivot" && !!element.motor;
}

export function probe_metric_available(
  metric: ProbeMetric,
  element: MechanicalElement,
): boolean {
  // A belt is sampled at the mid-point between its two ends, which sits nowhere on the path it actually follows — the same reason `available_overlays` refuses it a velocity arrow.
  if (metric === "position" || metric === "velocity")
    return element.type !== "belt";
  if (metric === "angle" || metric === "angular-velocity")
    return angular_metric_available(element);
  if (metric === "motor-power") return motor_power_available(element);
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
 * The metrics an element can measure, ticked on and off.
 * Mounted both in the canvas popover and in the properties panel, so the same choice is made from the same list wherever it is reached.
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
          {t(PROBE_METRIC_LABEL_KEYS[metric])}
        </MenuItem>
      ))}
    </>
  );
};

/** Gap between the anchor and the box's top edge, kept clear so the probe badge stays readable. */
const ANCHOR_GAP = 14;

/** Breathing room between the box and the edge of the canvas it is held inside. */
const EDGE_MARGIN = 8;

interface OnCanvasProbeMetricSelectorProps {
  element: MechanicalElement;
  /** Anchor, in screen coordinates. */
  position: ScreenPoint;
  /** The canvas the box is held inside, whose edges bound it. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Called with the element's new probes each time a metric is toggled. */
  onToggle: (newProbes: ProbeConfig[]) => void;
  onClose: () => void;
}

/**
 * Popover for picking what an element measures, opened by placing a probe on it or by clicking the badge of one it already carries.
 *
 * Each metric applies as it is ticked, like the same list in the properties panel: there is nothing to confirm, so closing it never means losing a choice.
 */
export const OnCanvasProbeMetricSelector: React.FC<
  OnCanvasProbeMetricSelectorProps
> = ({ element, position, containerRef, onToggle, onClose }) => {
  const paperRef = useRef<HTMLDivElement>(null);
  const [clampOffset, setClampOffset] = useState({ x: 0, y: 0 });

  // The box takes the focus so its list answers the keyboard, and takes it back when it moves to another element — a click on the canvas leaves it on the canvas.
  useLayoutEffect(() => {
    paperRef.current?.focus();
  }, [element.id]);

  // Measured from where the box would sit with no offset at all, never from where the last one put it: the correction stays a function of the anchor, and settles in one pass.
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const container = containerRef.current;
    if (!paper || !container) return;
    const { width, height } = paper.getBoundingClientRect();
    const left = position.x - width / 2;
    const top = position.y + ANCHOR_GAP;
    const right = left + width;
    const bottom = top + height;
    let dx = 0;
    let dy = 0;
    if (left < EDGE_MARGIN) dx = EDGE_MARGIN - left;
    else if (right > container.clientWidth - EDGE_MARGIN)
      dx = container.clientWidth - EDGE_MARGIN - right;
    if (top < EDGE_MARGIN) dy = EDGE_MARGIN - top;
    else if (bottom > container.clientHeight - EDGE_MARGIN)
      dy = container.clientHeight - EDGE_MARGIN - bottom;
    setClampOffset({ x: dx, y: dy });
  }, [containerRef, position.x, position.y]);

  return (
    <Paper
      ref={paperRef}
      tabIndex={-1}
      onKeyDownCapture={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      sx={{
        ...PROBE_METRIC_PAPER_SX,
        position: "absolute",
        left: position.x,
        top: position.y,
        transform: `translate(calc(-50% + ${clampOffset.x}px), calc(${ANCHOR_GAP}px + ${clampOffset.y}px))`,
        zIndex: 1000,
      }}
    >
      <ProbeMetricSelector element={element} onToggle={onToggle} />
    </Paper>
  );
};

export default OnCanvasProbeMetricSelector;
