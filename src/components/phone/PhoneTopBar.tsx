import React from "react";
import { Box, IconButton } from "@mui/material";
import { Apps, CenterFocusStrong, Redo, Undo } from "@mui/icons-material";
import {
  Action,
  AppMode,
  Mechanism,
  MechanismMetadata,
  ViewportState,
} from "../../types";
import { t } from "../../i18n";
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
  overlays: OverlaysSettings;
}

/**
 * The phone's top bar — the project: the gallery, history, framing, and what is shown, the physics and the mode.
 * The app's settings, language and about live in the gallery's header, one tap further.
 */
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
  overlays,
}) => {
  const framed =
    !!recenterTarget &&
    mechanism.viewport.scale === recenterTarget.scale &&
    mechanism.viewport.pan.equals(recenterTarget.pan);

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
      <IconButton
        color="inherit"
        aria-label={t("mechanism_library")}
        onClick={onOpenGallery}
      >
        <Apps />
      </IconButton>

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
