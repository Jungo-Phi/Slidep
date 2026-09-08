import React from "react";
import { Box, CircularProgress, Divider, IconButton, Tooltip, Typography, alpha } from "@mui/material";
import { Apps } from "@mui/icons-material";
import { icon } from "../element-palette/iconDataUris";
import { t } from "../../i18n";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";
import { TOP_BAR_DIVIDER_SX, TOP_BAR_GROUP_GAP } from "./toolbar-metrics";

interface ProjectHeaderProps {
  /** Drops the wordmark, keeping only the logo — for narrow windows. */
  tight: boolean;
  onOpenGallery: () => void;
  projectName: string;
  saveStatus: SaveStatus;
}

/** Logo, library shortcut, and project name with its save-status dot. */
export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  tight,
  onOpenGallery,
  projectName,
  saveStatus,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: TOP_BAR_GROUP_GAP,
      flex: 1,
      minWidth: 0,
    }}
  >
    <Box
      component="img"
      src={icon("logo")}
      alt="Slidep"
      sx={{ height: 26, display: "block", flexShrink: 0 }}
    />
    {/* The wordmark is the first thing sacrificed: the logo alone identifies the app when room runs short. */}
    {!tight && (
      <Typography
        sx={{
          fontSize: "1.5em",
          fontWeight: 700,
          color: "primary.main",
          letterSpacing: "-0.04em",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        Slidep
      </Typography>
    )}

    <Divider orientation="vertical" flexItem sx={TOP_BAR_DIVIDER_SX} />

    <Tooltip title={t("mechanism_library")}>
      <IconButton color="inherit" size="small" onClick={onOpenGallery}>
        <Apps sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>

    <Divider orientation="vertical" flexItem sx={TOP_BAR_DIVIDER_SX} />

    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: TOP_BAR_GROUP_GAP,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Typography
        variant="body2"
        fontWeight={400}
        noWrap
        sx={{ opacity: 0.9 }}
        color={projectName ? "text.primary" : "text.disabled"}
      >
        {projectName || t("untitled")}
      </Typography>

      {saveStatus === "saving" ? (
        <Tooltip title={t("save_saving")}>
          <CircularProgress size={8} color="inherit" sx={{ flexShrink: 0, opacity: 0.7 }} />
        </Tooltip>
      ) : (
        <Tooltip
          title={
            saveStatus === "saved"
              ? t("save_saved")
              : saveStatus === "error"
                ? t("save_error")
                : ""
          }
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              backgroundColor:
                saveStatus === "saved"
                  ? "success.main"
                  : saveStatus === "error"
                    ? "error.main"
                    : "transparent",
              transition: "background-color 0.3s ease",
              boxShadow: (t) =>
                saveStatus === "saved"
                  ? `0 0 4px ${alpha(t.palette.success.light, 0.7)}`
                  : "none",
            }}
          />
        </Tooltip>
      )}
    </Box>
  </Box>
);
