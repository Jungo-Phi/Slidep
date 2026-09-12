import { Box, Typography } from "@mui/material";
import { MechanicalElement } from "../../../types/element";
import { Action } from "../../../types";
import {
  available_overlays,
  overlay_shown,
} from "../../../utils/element-queries";
import {
  OVERLAY_LABEL_KEYS,
  overlay_label_count,
  set_overlay,
} from "../overlay-actions";
import { t, tn } from "../../../i18n";
import { overlay_icon } from "../element-readings";
import ProbeMetricsButton from "./ProbeMetricsButton";
import ReadingRow from "./ReadingRow";
import React from "react";

interface ProbesSectionProps {
  element: MechanicalElement;
  applyActions: (actions: Action[]) => void;
}

export const ProbesSection: React.FC<ProbesSectionProps> = ({
  element,
  applyActions,
}) => {
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
            <ReadingRow
              key={kind}
              icon={overlay_icon(kind)}
              label={tn(
                OVERLAY_LABEL_KEYS[kind],
                overlay_label_count([element], kind),
              )}
              shown={shown}
              onToggle={() => applyActions(set_overlay(element, kind, !shown))}
            />
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
        <ProbeMetricsButton element={element} applyActions={applyActions} />
      </Box>
    </Box>
  );
};

export default ProbesSection;
