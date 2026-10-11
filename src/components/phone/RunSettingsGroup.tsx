import React, { useState } from "react";
import {
  alpha,
  Box,
  ButtonBase,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  KeyboardArrowDown,
  Public,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { Action, AppMode, Mechanism, MechanismMetadata } from "../../types";
import { StringKey, t } from "../../i18n";
import { OverlaysMenu, OverlaysMenuProps } from "../toolbar/OverlaysMenu";
import { PhysicsToggle } from "../toolbar/PlaybackControls";
import {
  change_app_mode,
  useShownSimulation,
} from "../toolbar/playback-actions";
import { overlays_shown } from "../properties-panel/overlay-actions";

const MODES: { mode: AppMode; labelKey: StringKey; shortKey: StringKey }[] = [
  { mode: "edition", labelKey: "mode_edition", shortKey: "mode_edition_short" },
  {
    mode: "kinematic",
    labelKey: "mode_kinematic",
    shortKey: "mode_kinematic_short",
  },
  { mode: "dynamic", labelKey: "mode_dynamic", shortKey: "mode_dynamic_short" },
];

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
  const shown = useShownSimulation(appMode, mechanism);
  const anyShown = overlays_shown(
    overlays.mechanicalElements,
    overlays.beamStressLens,
    overlays.supportReactions,
  );
  const current = MODES.find((m) => m.mode === appMode) ?? MODES[0];
  const physics: {
    iconName: "gravity" | "collision" | "floor";
    labelKey: StringKey;
    on: boolean;
    toggle: Action;
  }[] = [
    {
      iconName: "gravity",
      labelKey: "gravity",
      on: shown.gravity,
      toggle: { type: "SetGravity", enabled: !shown.gravity },
    },
    {
      iconName: "collision",
      labelKey: "collisions",
      on: shown.collisions,
      toggle: { type: "SetCollisions", enabled: !shown.collisions },
    },
    {
      iconName: "floor",
      labelKey: "floor",
      on: shown.floor.enabled,
      toggle: { type: "SetFloorEnabled", enabled: !shown.floor.enabled },
    },
  ];

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
      <Menu
        anchorEl={anchor("physics")}
        open={!!anchor("physics")}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {physics.map((row) => (
          <MenuItem
            key={row.iconName}
            onClick={() => applyActions([row.toggle])}
            sx={{ gap: 1 }}
          >
            <PhysicsToggle on={row.on} iconName={row.iconName} size={28} />
            <ListItemText>{t(row.labelKey)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        anchorEl={anchor("mode")}
        open={!!anchor("mode")}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {MODES.map(({ mode, labelKey }) => (
          <MenuItem
            key={mode}
            selected={mode === appMode}
            onClick={() => {
              close();
              if (mode !== appMode)
                change_app_mode(mode, setAppMode, mechanism, updateMetadata);
            }}
            sx={{ minHeight: 44 }}
          >
            {t(labelKey)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
