import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { Action } from "../../../types";
import { MechanicalElement } from "../../../types/element";
import { can_collide, element_collides } from "../../../utils/element-queries";
import { t } from "../../../i18n";
import { set_collides } from "../collision-actions";
import ToggleIcon from "./ToggleIcon";

/**
 * Takes an element out of the collisions, or puts it back.
 * Wherever an element's own panel offers that choice, it offers it through this; renders nothing for an element that can never collide.
 * `shown` is the same element at the instant on screen, which the state is read off, while the write is built against `element` (see `rebased_bundle`).
 */
export const CollisionToggleButton: React.FC<{
  element: MechanicalElement;
  shown: MechanicalElement;
  applyActions: (actions: Action[]) => void;
  /** Drawn size of the icon, in px. */
  size?: number;
  sx?: SxProps<Theme>;
}> = ({ element, shown, applyActions, size = 28, sx }) => {
  if (!can_collide(element)) return null;
  const collides = element_collides(shown);
  const label = t(collides ? "exclude_from_collisions" : "include_in_collisions");
  return (
    <Tooltip title={label}>
      <IconButton
        color="inherit"
        size="small"
        aria-label={label}
        onClick={() => applyActions(set_collides(element, !collides))}
        sx={sx}
      >
        <ToggleIcon
          on={collides}
          onName="collision"
          offName="collision-off"
          size={size}
        />
      </IconButton>
    </Tooltip>
  );
};

export default CollisionToggleButton;
