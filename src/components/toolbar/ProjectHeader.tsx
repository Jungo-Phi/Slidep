import React from "react";
import { Box, CircularProgress, Divider, IconButton, Tooltip, Typography, alpha } from "@mui/material";
import { Apps } from "@mui/icons-material";
import { icon } from "../element-palette/iconDataUris";
import { t } from "../../i18n";
import { SaveStatus } from "../mechanisms-gallery/use-mechanism-library";

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
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1, minWidth: 0 }}>
    {/* Logo */}
    <Box
      component="img"
      src={icon("logo")}
      alt="Slidep"
      sx={{ height: 26, display: "block", flexShrink: 0 }}
    />
    {/* Le mot-symbole est le premier sacrifié : le logo suffit à
      identifier l'app quand la place manque. */}
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

    <Divider orientation="vertical" flexItem sx={{ mx: tight ? 0.5 : 1 }} />

    {/* Bouton Bibliothèque — accès direct à la galerie */}
    <Tooltip disableInteractive title={t("toolbar_library")}>
      <IconButton color="inherit" size="small" onClick={onOpenGallery} sx={{ m: -1 }}>
        <Apps sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>

    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

    {/* Nom du projet + pastille */}
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}>
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
        <Tooltip disableInteractive title={t("save_saving")}>
          <CircularProgress size={8} color="inherit" sx={{ flexShrink: 0, opacity: 0.7 }} />
        </Tooltip>
      ) : (
        <Tooltip
          disableInteractive
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
