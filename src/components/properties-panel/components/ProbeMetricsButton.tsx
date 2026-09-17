import React from "react";
import { Box, IconButton, Menu, Tooltip } from "@mui/material";
import { MechanicalElement } from "../../../types/element";
import { Action } from "../../../types";
import { ProbeMetricSelector } from "../../canvas/ProbeMetricSelector";
import { icon } from "../../element-palette/iconDataUris";
import { t } from "../../../i18n";
import { useDismissOnShortcut } from "../../common/dismiss-popups";
import { is_probes_only_bundle } from "../../mechanism/action-kind";
import { ROW_ICON_BUTTON_SX } from "../inspector-metrics";

/**
 * The probe badge as a button: opens the list of what this element can measure, ticked on and off.
 * Wherever an element's own panel offers that choice, it offers it through this, so the list is reached the same way from every one of them.
 */
export const ProbeMetricsButton: React.FC<{
  element: MechanicalElement;
  applyActions: (actions: Action[]) => void;
  /** Drawn size of the badge, in px. */
  size?: number;
}> = ({ element, applyActions, size = 28 }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  useDismissOnShortcut(
    !!anchorEl,
    () => setAnchorEl(null),
    (replayed) => is_probes_only_bundle(replayed, element.id),
  );
  return (
    <>
      <Tooltip title={t("choose_metrics")}>
        {/* Square-cornered rather than round: the drawing inside is a curve on axes, which a circle crops badly — and it never sits at a card's own edge, where the round shape is what matters. */}
        <IconButton
          color="inherit"
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={ROW_ICON_BUTTON_SX}
        >
          <Box
            component="img"
            style={{ width: size, height: size }}
            src={icon("probe")}
          />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        <ProbeMetricSelector
          element={element}
          onToggle={(newProbes) =>
            applyActions([
              {
                type: "SetProbes",
                elementID: element.id,
                newProbes,
                oldProbes: element.probes ?? [],
              },
            ])
          }
        />
      </Menu>
    </>
  );
};

export default ProbeMetricsButton;
