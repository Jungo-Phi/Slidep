import React, { useState } from "react";
import { alpha, Box, ButtonBase } from "@mui/material";
import {
  KeyboardArrowDown,
  Public,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { Action, AppMode, Mechanism, MechanismMetadata } from "../../types";
import { t } from "../../i18n";
import { OverlaysMenu, OverlaysMenuProps } from "../toolbar/OverlaysMenu";
import { ModeMenu, PhysicsMenu } from "../toolbar/RunSettingsMenus";
import { RUN_MODES } from "../toolbar/playback-actions";
import { overlays_shown } from "../properties-panel/overlay-actions";

/** One segment of the group: what it shows, then the caret every one of them carries, since each opens a menu. */
const Segment: React.FC<{
  label: string;
  onOpen: (anchor: HTMLElement) => void;
  children: React.ReactNode;
}> = ({ label, onOpen, children }) => (
  <ButtonBase
    aria-label={label}
    aria-haspopup="menu"
    onClick={(event) => onOpen(event.currentTarget)}
    sx={{ height: "100%", pl: 0.75, pr: 0.25, gap: 0.25 }}
  >
    {children}
    <KeyboardArrowDown sx={{ fontSize: 16, opacity: 0.7 }} />
  </ButtonBase>
);

export type OverlaysSettings = Omit<
  OverlaysMenuProps,
  "condensed" | "anchorEl" | "onClose"
>;

interface RunSettingsGroupProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
  applyActions: (actions: Action[]) => void;
  overlays: OverlaysSettings;
}

/**
 * The phone's run settings, in one outline cut in three — what is shown, the physics, the mode — each opening its own menu.
 * One group rather than three buttons: they are what the desktop gathers at the centre of its bar, and three outlines side by side would weigh on a bar that holds nothing dark.
 * The eye says whether anything is drawn over the mechanism and the mode names itself; the physics' three states are read in its menu.
 */
export const RunSettingsGroup: React.FC<RunSettingsGroupProps> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  applyActions,
  overlays,
}) => {
  const [open, setOpen] = useState<{
    menu: "overlays" | "physics" | "mode";
    anchor: HTMLElement;
  } | null>(null);
  const anchor = (menu: "overlays" | "physics" | "mode") =>
    open?.menu === menu ? open.anchor : null;
  const close = () => setOpen(null);
  const anyShown = overlays_shown(
    overlays.mechanicalElements,
    overlays.beamStressLens,
    overlays.supportReactions,
  );
  const current = RUN_MODES.find((m) => m.mode === appMode) ?? RUN_MODES[0];

  return (
    <>
      <Box
        sx={{
          height: 32,
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          borderRadius: 16,
          overflow: "hidden",
          border: 1,
          borderColor: (theme) => alpha(theme.palette.text.primary, 0.3),
          "& > :not(:first-of-type)": {
            borderLeft: 1,
            borderColor: (theme) => alpha(theme.palette.text.primary, 0.3),
          },
        }}
      >
        <Segment
          label={t("show")}
          onOpen={(element) => setOpen({ menu: "overlays", anchor: element })}
        >
          {anyShown ? (
            <Visibility sx={{ fontSize: 20 }} />
          ) : (
            <VisibilityOff sx={{ fontSize: 20 }} />
          )}
        </Segment>
        {/* A fixed icon for the three settings together: none of them stands for the others, and their states are read in the menu. */}
        <Segment
          label={t("physics_settings")}
          onOpen={(element) => setOpen({ menu: "physics", anchor: element })}
        >
          <Public sx={{ fontSize: 20 }} />
        </Segment>
        <Segment
          label={t(current.labelKey)}
          onOpen={(element) => setOpen({ menu: "mode", anchor: element })}
        >
          <Box
            component="span"
            sx={{
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            {t(current.shortKey)}
          </Box>
        </Segment>
      </Box>

      <OverlaysMenu
        {...overlays}
        anchorEl={anchor("overlays")}
        onClose={close}
      />
      <PhysicsMenu
        anchorEl={anchor("physics")}
        onClose={close}
        appMode={appMode}
        mechanism={mechanism}
        applyActions={applyActions}
        touch
      />
      <ModeMenu
        anchorEl={anchor("mode")}
        onClose={close}
        appMode={appMode}
        setAppMode={setAppMode}
        mechanism={mechanism}
        updateMetadata={updateMetadata}
        rowHeight={44}
      />
    </>
  );
};
