import { useLayoutEffect, useRef } from "react";
import { Button } from "@mui/material";
import { Link } from "@mui/icons-material";

import { t } from "../../i18n";
import { CANVAS_CONTROL_SX } from "./canvas-control-sx";
import { ID, Mechanism, Point2, ScreenPoint } from "../../types";
import { world2screen } from "../../utils";
import { link_actions, PastePlan } from "../mechanism/clipboard";

/** How far (screen px) under what was pasted the button sits, and how far it keeps from the canvas's edges: the ruler's margin. */
const GAP = 12;

/** The middle of the bottom of what `ids` cover on screen, gears' rims included; null when none of them is left. */
function under(ids: readonly ID[], mechanism: Mechanism): ScreenPoint | null {
  const { viewport } = mechanism;
  const points: ScreenPoint[] = [];
  for (const element of mechanism.mechanicalElements) {
    if (!ids.includes(element.id)) continue;
    if (!("position" in element)) {
      points.push(world2screen(element.positionStart, viewport));
      points.push(world2screen(element.positionEnd, viewport));
      continue;
    }
    const center = world2screen(element.position, viewport);
    const rim = element.type === "gear" ? element.radius * viewport.scale : 0;
    points.push(new Point2<"screen">(center.x, center.y + rim));
  }
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  return new Point2<"screen">(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    Math.max(...points.map((p) => p.y)) + GAP,
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

interface PasteLinkButtonProps {
  mechanism: Mechanism;
  /** The paste just made, which the button offers to tie to its originals. */
  plan: PastePlan;
  onLink: () => void;
}

/**
 * The offer, under what was just pasted, to tie its dimensions to the originals instead: a linked paste is otherwise hard to come across.
 * It stays inside the canvas, whatever part of the paste is in view, and renders nothing when the paste has nothing to tie.
 */
export function PasteLinkButton({ mechanism, plan, onLink }: PasteLinkButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const linkable = link_actions(plan.sources, mechanism).length > 0;
  const at = linkable ? under(plan.pastedIDs, mechanism) : null;

  // Placed once the button is laid out, as its size is what keeps it inside the canvas.
  useLayoutEffect(() => {
    const button = ref.current;
    const canvas = button?.offsetParent;
    if (!button || !at || !(canvas instanceof HTMLElement)) return;
    const { offsetWidth: width, offsetHeight: height } = button;
    // The sheet a phone layout lays over the bottom of the canvas, see `CANVAS_CORNER_BOTTOM`.
    const inset =
      parseFloat(getComputedStyle(button).getPropertyValue("--canvas-bottom-inset")) || 0;
    const left = clamp(at.x - width / 2, GAP, canvas.clientWidth - GAP - width);
    const top = clamp(at.y, GAP, canvas.clientHeight - GAP - inset - height);
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  });

  if (!at) return null;
  return (
    <Button
      ref={ref}
      size="small"
      color="inherit"
      startIcon={<Link />}
      onClick={onLink}
      sx={[
        CANVAS_CONTROL_SX,
        {
          position: "absolute",
          left: at.x,
          top: at.y,
          zIndex: 900,
          textTransform: "none",
          whiteSpace: "nowrap",
          // Outlined as the constraint badges are: it offers to make one.
          border: 1,
          borderColor: "badge.stroke",
        },
      ]}
    >
      {t("link_to_original")}
    </Button>
  );
}
