import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { Action } from "../../../types";
import { MechanicalElement } from "../../../types/element";
import { can_collide, element_collides } from "../../../utils/element-queries";
import { t } from "../../../i18n";
import { set_all_collides } from "../collision-actions";
import ToggleIcon from "./ToggleIcon";

/**
 * Takes elements out of the collisions, or puts them back: one element on its own page, a whole selection in its header.
 * Wherever a panel offers that choice, it offers it through this; renders nothing when none of them can ever collide.
 * `shown` are the same elements at the instant on screen, which the state is read off, while the write is built against `elements` (see `rebased_bundle`).
 *
 * A selection that does not agree shows the icon half lit; a click then puts them all in, since it reads as "not all of them" — the same rule as the element's own toggle off.
 */
export const CollisionToggleButton: React.FC<{
  elements: MechanicalElement[];
  shown: MechanicalElement[];
  applyActions: (actions: Action[]) => void;
  /** See `contacts_active`: false, the tooltip says the setting has nothing to act on right now. */
  active: boolean;
  /** Drawn size of the icon, in px. */
  size?: number;
  sx?: SxProps<Theme>;
}> = ({ elements, shown, applyActions, active, size = 28, sx }) => {
  const targets = shown.filter(can_collide);
  if (targets.length === 0) return null;
  const on = targets.filter((el) => element_collides(el)).length;
  const all = on === targets.length;
  const label = t(all ? "exclude_from_collisions" : "include_in_collisions");
  const title = (
    <>
      {label}
      {targets.length > 1 && (
        <Box component="span" sx={{ display: "block", opacity: 0.8 }}>
          {t("collisions_count", { on, total: targets.length })}
        </Box>
      )}
      {!active && (
        <Box component="span" sx={{ display: "block", opacity: 0.8 }}>
          {t("collisions_inactive_hint")}
        </Box>
      )}
    </>
  );
  return (
    <Tooltip title={title}>
      <IconButton
        color="inherit"
        size="small"
        aria-label={label}
        onClick={() => applyActions(set_all_collides(elements, !all))}
        sx={sx}
      >
        <Box sx={{ display: "flex", opacity: !all && on > 0 ? 0.5 : 1 }}>
          <ToggleIcon
            on={on > 0}
            onName="collision"
            offName="collision-off"
            size={size}
          />
        </Box>
      </IconButton>
    </Tooltip>
  );
};

export default CollisionToggleButton;
