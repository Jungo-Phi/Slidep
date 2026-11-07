import React, { useLayoutEffect, useRef, useState } from "react";
import { Checkbox, Divider, MenuItem, Paper } from "@mui/material";
import { MechanicalElement, ProbeConfig } from "../../types/element";
import { ScreenPoint } from "../../types";
import {
  available_probe_metric_sections,
  PROBE_METRIC_LABEL_KEYS,
  toggled_probes,
} from "../../utils/probe-metrics";
import { t } from "../../i18n";

/** The surface the metric list sits on, shared by both places that show it. */
const PROBE_METRIC_PAPER_SX = {
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
      {available_probe_metric_sections(element).map((section, index) => (
        <React.Fragment key={section[0]}>
          {index > 0 && <Divider sx={{ my: 0.5 }} />}
          {section.map((metric) => (
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
        </React.Fragment>
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
