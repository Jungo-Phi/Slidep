import { Box, IconButton, Typography, Menu } from "@mui/material";
import { VisibilityOff, Visibility } from "@mui/icons-material";
import { MechanicalElement } from "../../../types/element";
import { Action } from "../../../types";
import {
  available_overlays,
  overlay_shown,
} from "../../../utils/element-queries";
import { ProbeMetricSelector } from "../../canvas/ProbeMetricSelector";
import {
  OVERLAY_LABEL_KEYS,
  overlay_label_count,
  set_overlay,
} from "../overlay-actions";
import { t, tn } from "../../../i18n";
import { icon } from "../../element-palette/iconDataUris";
import React from "react";

interface ProbesSectionProps {
  element: MechanicalElement;
  applyActions: (actions: Action[]) => void;
}

export const ProbesSection: React.FC<ProbesSectionProps> = ({
  element,
  applyActions,
}) => {
  const [metricMenu, setMetricMenu] = React.useState<{
    anchorEl: HTMLElement;
  } | null>(null);

  return (
    <Box
      sx={{
        px: 2,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.25,
        }}
      >
        {available_overlays(element).map((kind) => (
          <Box
            key={kind}
            onClick={() =>
              applyActions(
                set_overlay(element, kind, !overlay_shown(element, kind)),
              )
            }
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              p: 0.5,
              cursor: "pointer",
              borderRadius: 1,
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {overlay_shown(element, kind) ? (
              <Visibility fontSize="small" />
            ) : (
              <VisibilityOff fontSize="small" />
            )}
            <Typography variant="caption">
              {tn(
                OVERLAY_LABEL_KEYS[kind],
                overlay_label_count([element], kind),
              )}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
        }}
      >
        <Typography variant="subtitle2" color="textDisabled">
          {t("palette_measurements")}
        </Typography>
        <IconButton
          color="inherit"
          size="small"
          onClick={(e) =>
            setMetricMenu({
              anchorEl: e.currentTarget,
            })
          }
        >
          <Box
            component="img"
            style={{ width: 28, height: 28 }}
            src={icon("probe")}
          />
        </IconButton>
      </Box>

      <Menu
        anchorEl={metricMenu?.anchorEl ?? null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={!!metricMenu}
        onClose={() => setMetricMenu(null)}
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
    </Box>
  );
};

export default ProbesSection;
