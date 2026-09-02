import { Box, IconButton, Typography, Menu, Tooltip } from "@mui/material";
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
        {available_overlays(element).map((kind) => {
          const shown = overlay_shown(element, kind);
          return (
            <Box
              key={kind}
              component="button"
              type="button"
              role="switch"
              aria-checked={shown}
              onClick={() => applyActions(set_overlay(element, kind, !shown))}
              sx={(theme) => ({
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                p: 0.5,
                border: 0,
                cursor: "pointer",
                borderRadius: 1.5,
                color: shown ? "text.primary" : "text.secondary",
                backgroundColor: "transparent",
                "&:hover": { backgroundColor: theme.palette.action.hover },
              })}
            >
              {shown ? (
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
          );
        })}
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
          {t("measurements")}
        </Typography>
        <Tooltip title={t("analysis_choose_metrics")}>
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
        </Tooltip>
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
