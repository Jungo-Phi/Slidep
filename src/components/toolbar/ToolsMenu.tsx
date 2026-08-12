import React from "react";
import { Box, Divider, IconButton, Tooltip } from "@mui/material";
import { CenterFocusStrong, Info, Redo, Undo } from "@mui/icons-material";
import { Lang } from "../../i18n";
import { t } from "../../i18n";
import { Mechanism, ViewportState } from "../../types";
import { ThemeMode, ThemeName } from "../../constants/mui-theme";
import type { SnapSettings } from "../canvas/snap-corridor";
import { LanguageMenu } from "./LanguageMenu";
import { SettingsMenu } from "./SettingsMenu";

interface ToolsMenuProps {
  mechanism: Mechanism;
  recenterTarget: ViewportState | null;
  onRecenter: (target: ViewportState) => void;
  undoMechanism: () => void;
  redoMechanism: () => void;
  language: Lang;
  onSelectLang: (lang: Lang) => void;
  showGrid: boolean;
  setShowGrid: (value: boolean) => void;
  snapToGrid: boolean;
  setSnapToGrid: (value: boolean) => void;
  snapSettings: SnapSettings;
  setSnapSettings: React.Dispatch<React.SetStateAction<SnapSettings>>;
  isCustomAngleStep: boolean;
  themeChoice: { family: string; mode: ThemeMode };
  systemDark: boolean;
  changeTheme: (family: string, mode: ThemeMode) => void;
  previewLater: (name: ThemeName | null) => void;
  onOpenAbout: () => void;
}

/** The toolbar's right-hand cluster: recenter, undo/redo, language, settings, about. */
export const ToolsMenu: React.FC<ToolsMenuProps> = ({
  mechanism,
  recenterTarget,
  onRecenter,
  undoMechanism,
  redoMechanism,
  language,
  onSelectLang,
  showGrid,
  setShowGrid,
  snapToGrid,
  setSnapToGrid,
  snapSettings,
  setSnapSettings,
  isCustomAngleStep,
  themeChoice,
  systemDark,
  changeTheme,
  previewLater,
  onOpenAbout,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.25,
      flex: 1,
      justifyContent: "flex-end",
    }}
  >
    {/* Recentrer */}
    <Tooltip disableInteractive title={t("toolbar_recenter")}>
      <IconButton
        color="inherit"
        size="small"
        onClick={() => recenterTarget && onRecenter(recenterTarget)}
        disabled={
          !recenterTarget ||
          (mechanism.viewport.scale === recenterTarget.scale &&
            mechanism.viewport.pan.equals(recenterTarget.pan))
        }
      >
        <CenterFocusStrong sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>

    {/* Undo / Redo */}
    <Tooltip disableInteractive title={t("toolbar_undo")}>
      <span>
        <IconButton
          color="inherit"
          size="small"
          onClick={() => undoMechanism()}
          disabled={mechanism.history.length === 0}
        >
          <Undo sx={{ fontSize: 20 }} />
        </IconButton>
      </span>
    </Tooltip>
    <Tooltip disableInteractive title={t("toolbar_redo")}>
      <span>
        <IconButton
          color="inherit"
          size="small"
          onClick={() => redoMechanism()}
          disabled={mechanism.future.length === 0}
        >
          <Redo sx={{ fontSize: 20 }} />
        </IconButton>
      </span>
    </Tooltip>

    <Divider orientation="vertical" flexItem sx={{ ml: 0.75, mr: 0.5, my: 0.25 }} />

    <LanguageMenu language={language} onSelectLang={onSelectLang} />

    <SettingsMenu
      showGrid={showGrid}
      setShowGrid={setShowGrid}
      snapToGrid={snapToGrid}
      setSnapToGrid={setSnapToGrid}
      snapSettings={snapSettings}
      setSnapSettings={setSnapSettings}
      isCustomAngleStep={isCustomAngleStep}
      themeChoice={themeChoice}
      systemDark={systemDark}
      changeTheme={changeTheme}
      previewLater={previewLater}
    />

    {/* À propos */}
    <Tooltip disableInteractive title={t("toolbar_about")}>
      <IconButton color="inherit" size="small" onClick={onOpenAbout}>
        <Info sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>
  </Box>
);
