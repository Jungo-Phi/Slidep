import { Box, IconButton, Typography, FormControlLabel, Button, Paper } from "@mui/material";
import { ShowChart, VisibilityOff, Visibility } from "@mui/icons-material";
import { MechanicalElement, available_overlays, overlay_shown } from "../../../types/element";
import { Action, PropertiesPanelTab } from "../../../types";
import { ProbeMetricSelector } from "../../canvas/ProbeMetricSelector";
import { OVERLAY_LABEL_KEYS, set_overlay } from "../overlay-actions";
import { t } from "../../../i18n";

interface ProbesSectionProps {
  element: MechanicalElement;
  applyActions: (actions: Action[]) => void;
  setActiveTab: (tab: PropertiesPanelTab) => void;
}

export const ProbesSection: React.FC<ProbesSectionProps> = ({
  element,
  applyActions,
  setActiveTab,
}) => {
  const probes = element.probes ?? [];
  return (
    <Box
      sx={{
        px: 2,
        pb: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
      }}
    >
      {available_overlays(element).map((kind) => (
        <FormControlLabel
          key={kind}
          control={
            <IconButton
              size="small"
              color="inherit"
              onClick={() =>
                applyActions(
                  set_overlay(element, kind, !overlay_shown(element, kind)),
                )
              }
            >
              {overlay_shown(element, kind) ? (
                <Visibility fontSize="small" />
              ) : (
                <VisibilityOff fontSize="small" />
              )}
            </IconButton>
          }
          label={
            <Typography variant="caption">
              {t(OVERLAY_LABEL_KEYS[kind])}
            </Typography>
          }
          sx={{ m: 0, gap: 0.5 }}
        />
      ))}
      <Button
        size="small"
        startIcon={<ShowChart />}
        onClick={() => setActiveTab("analysis")}
        sx={{
          textTransform: "none",
          alignSelf: "flex-start",
          py: 0,
          minWidth: 0,
        }}
      >
        {t("element_view_charts")}
      </Button>

      <Box sx={{ display: "flex", alignItems: "left" }}>
        <Paper sx={{ py: 1 }}>
          <ProbeMetricSelector
            element={element}
            onToggle={(newProbes) =>
              applyActions(
                [
                  {
                    type: "SetProbes",
                    elementID: element.id,
                    newProbes,
                    oldProbes: probes,
                  },
                ],
              )
            }
          />
        </Paper>
      </Box>
    </Box>
  );
};

export default ProbesSection;
