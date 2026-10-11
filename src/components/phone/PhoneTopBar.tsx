import React, { useRef, useState } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Apps,
  CenterFocusStrong,
  Info,
  Language,
  Menu as MenuIcon,
  Redo,
  Settings,
  Undo,
} from "@mui/icons-material";
import {
  Action,
  AppMode,
  Mechanism,
  MechanismMetadata,
  ViewportState,
} from "../../types";
import { Lang, t } from "../../i18n";
import type { ThemeMode, ThemeName } from "../../theme/mui-theme";
import type { SnapSettings } from "../../utils/snap-corridor";
import { LanguageMenu } from "../toolbar/LanguageMenu";
import { SettingsMenu } from "../toolbar/SettingsMenu";
import { PHONE_LAYOUT } from "../../constants/layout-specs";
import { OverlaysSettings, RunSettingsGroup } from "./RunSettingsGroup";

export interface PhoneTopBarProps {
  mechanism: Mechanism;
  undoMechanism: () => void;
  redoMechanism: () => void;
  recenterTarget: ViewportState | null;
  onRecenter: (target: ViewportState) => void;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  applyActions: (actions: Action[]) => void;
  onOpenGallery: () => void;
  onOpenAbout: () => void;
  language: Lang;
  onSelectLang: (lang: Lang) => void;
  showGrid: boolean;
  setShowGrid: (value: boolean) => void;
  showContactPoints: boolean;
  setShowContactPoints: (value: boolean) => void;
  snapToGrid: boolean;
  setSnapToGrid: (value: boolean) => void;
  snapSettings: SnapSettings;
  setSnapSettings: React.Dispatch<React.SetStateAction<SnapSettings>>;
  isCustomAngleStep: boolean;
  themeChoice: { family: string; mode: ThemeMode };
  systemDark: boolean;
  changeTheme: (family: string, mode: ThemeMode) => void;
  previewLater: (name: ThemeName | null) => void;
  overlays: OverlaysSettings;
}

/** The phone's top bar — the project: menu, history, framing, and what is shown, the physics and the mode. */
export const PhoneTopBar: React.FC<PhoneTopBarProps> = ({
  mechanism,
  undoMechanism,
  redoMechanism,
  recenterTarget,
  onRecenter,
  appMode,
  setAppMode,
  updateMetadata,
  applyActions,
  onOpenGallery,
  onOpenAbout,
  language,
  onSelectLang,
  overlays,
  ...settings
}) => {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Which of the menu's own popups is open: the settings and the languages open on the menu button once the menu has stepped aside.
  const [open, setOpen] = useState<"menu" | "settings" | "language" | null>(
    null,
  );
  const anchor = (which: typeof open) =>
    open === which ? menuButtonRef.current : null;
  const framed =
    !!recenterTarget &&
    mechanism.viewport.scale === recenterTarget.scale &&
    mechanism.viewport.pan.equals(recenterTarget.pan);
  const pick = (action: () => void) => () => {
    setOpen(null);
    action();
  };

  return (
    <Box
      sx={{
        height: PHONE_LAYOUT.BAR_HEIGHT,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 0.5,
        backgroundColor: "background.toolbar",
        borderBottom: 1,
        borderColor: "dividers.toolbar",
      }}
    >
      {/* The menu and the popups it opens, as one item of the bar: its spacing counts three items whatever the popups render while closed. */}
      <Box sx={{ display: "flex" }}>
        <IconButton
          color="inherit"
          ref={menuButtonRef}
          aria-label={t("menu")}
          onClick={() => setOpen(open === "menu" ? null : "menu")}
        >
          <MenuIcon />
        </IconButton>
        <Menu
          anchorEl={anchor("menu")}
          open={open === "menu"}
          onClose={() => setOpen(null)}
          // The icons in the text's own colour, as everywhere in the app, rather than MUI's grey.
          MenuListProps={{ sx: { "& .MuiListItemIcon-root": { color: "inherit" } } }}
        >
          <MenuItem onClick={pick(onOpenGallery)}>
            <ListItemIcon>
              <Apps fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("mechanism_library")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => setOpen("settings")}>
            <ListItemIcon>
              <Settings fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("settings")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => setOpen("language")}>
            <ListItemIcon>
              <Language fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("language")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={pick(onOpenAbout)}>
            <ListItemIcon>
              <Info fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("about")}</ListItemText>
          </MenuItem>
        </Menu>
        <SettingsMenu
          {...settings}
          anchorEl={anchor("settings")}
          onClose={() => setOpen(null)}
        />
        <LanguageMenu
          language={language}
          onSelectLang={onSelectLang}
          anchorEl={anchor("language")}
          onClose={() => setOpen(null)}
        />
      </Box>

      <RunSettingsGroup
        appMode={appMode}
        setAppMode={setAppMode}
        mechanism={mechanism}
        updateMetadata={updateMetadata}
        applyActions={applyActions}
        overlays={overlays}
      />

      <Box sx={{ display: "flex", alignItems: "center" }}>
        <IconButton
          color="inherit"
          aria-label={t("recenter")}
          onClick={() => recenterTarget && onRecenter(recenterTarget)}
          disabled={!recenterTarget || framed}
        >
          <CenterFocusStrong />
        </IconButton>
        <IconButton
          color="inherit"
          aria-label={t("undo")}
          onClick={undoMechanism}
          disabled={mechanism.history.length === 0}
        >
          <Undo />
        </IconButton>
        <IconButton
          color="inherit"
          aria-label={t("redo")}
          onClick={redoMechanism}
          disabled={mechanism.future.length === 0}
        >
          <Redo />
        </IconButton>
      </Box>
    </Box>
  );
};
