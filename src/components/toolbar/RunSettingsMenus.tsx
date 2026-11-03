import React from "react";
import {
  alpha,
  Box,
  ButtonBase,
  Chip,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  useTheme,
} from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";
import { TOP_BAR_CONTROL_HEIGHT } from "./toolbar-metrics";
import { t } from "../../i18n";
import { Action, AppMode, Mechanism, MechanismMetadata } from "../../types";
import { icon, icon_inked } from "../element-palette/iconDataUris";
import { useNonModalPopup } from "../common/use-non-modal-popup";
import {
  change_app_mode,
  PhysicsSwitch,
  RUN_MODES,
} from "./playback-actions";

interface PhysicsToggleProps {
  on: boolean;
  /** The palette icon's basename: the off state is its `-off` sibling. */
  iconName: "gravity" | "collision" | "floor";
  tooltip?: string;
  /** Absent, the chip only shows the state: whatever holds it takes the click. */
  onToggle?: () => void;
  /** Diameter (px). */
  size?: number;
}

/** One simulation switch (gravity, collisions, floor): icon only, filled when on. */
export const PhysicsToggle: React.FC<PhysicsToggleProps> = ({
  on,
  iconName,
  tooltip,
  onToggle,
  size = 22,
}) => {
  const theme = useTheme();
  const chip = (
    <Chip
      icon={
        <Box
          component="img"
          src={
            on
              ? icon_inked(iconName, theme.palette.primary.contrastText)
              : icon(`${iconName}-off`)
          }
          alt=""
          sx={{ width: (size * 18) / 22, height: (size * 18) / 22 }}
        />
      }
      size="small"
      clickable={!!onToggle}
      onClick={onToggle}
      variant="outlined"
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        borderColor: on ? "primary.main" : "text.primary",
        backgroundColor: on ? "primary.main" : "transparent",
        color: on ? "primary.contrastText" : "inherit",
        // The label's slot is what makes a chip a pill: dropped, the icon centres on its own.
        "& .MuiChip-label": { display: "none" },
        "& .MuiChip-icon": {
          margin: 0,
          color: on ? "primary.contrastText" : "inherit",
        },
        "&.MuiChip-clickable:hover": {
          backgroundColor: on ? "primary.dark" : "action.hover",
        },
      }}
    />
  );
  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip;
};

interface MenuTriggerProps {
  /** Its accessible name, and its tooltip unless `tooltip` says otherwise. */
  label: string;
  /** For a trigger already showing its label, which the tooltip has no need to repeat. */
  tooltip?: string;
  /** Whether its menu is open. */
  expanded: boolean;
  /** Called with the button itself, to anchor the menu on. */
  onToggle: (anchor: HTMLElement) => void;
  /** Draws the pill outline the phone's run settings wear: for a trigger showing text, which needs it to read as a button. */
  outlined?: boolean;
  children: React.ReactNode;
}

/** A top-bar button opening a menu: what it shows, then a caret saying a menu lies behind it. */
export const MenuTrigger: React.FC<MenuTriggerProps> = ({
  label,
  tooltip = label,
  expanded,
  onToggle,
  outlined,
  children,
}) => (
  <Tooltip title={tooltip}>
    <ButtonBase
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={(event) => onToggle(event.currentTarget)}
      sx={{
        height: TOP_BAR_CONTROL_HEIGHT,
        flexShrink: 0,
        pl: 0.75,
        pr: 0.25,
        gap: 0.25,
        borderRadius: outlined ? TOP_BAR_CONTROL_HEIGHT / 2 + "px" : 1,
        border: outlined ? 1 : 0,
        borderColor: (theme) => alpha(theme.palette.text.primary, 0.3),
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      {children}
      <KeyboardArrowDown sx={{ fontSize: 16, opacity: 0.7 }} />
    </ButtonBase>
  </Tooltip>
);

interface AnchoredMenuProps {
  /** Open while set. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** Leaves the canvas underneath live while the menu is open (`useNonModalPopup`): the desktop's way, where the pointer goes on to the canvas. */
  nonModal?: boolean;
}

/** The props a menu opening below its anchor's right edge takes, modal or not. */
const useMenuProps = ({ anchorEl, onClose, nonModal }: AnchoredMenuProps) => {
  const popup = useNonModalPopup(!!anchorEl, anchorEl, onClose);
  return {
    ...(nonModal ? popup : { onClose }),
    anchorEl,
    open: !!anchorEl,
    anchorOrigin: { vertical: "bottom", horizontal: "right" },
    transformOrigin: { vertical: "top", horizontal: "right" },
  } as const;
};

/** The three physics switches as menu rows: each stays open on its click, so several can be flipped in a row. */
export const PhysicsMenu: React.FC<
  AnchoredMenuProps & {
    switches: PhysicsSwitch[];
    applyActions: (actions: Action[]) => void;
  }
> = ({ switches, applyActions, ...anchor }) => (
  <Menu {...useMenuProps(anchor)}>
    {switches.map((row) => (
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
);

/** The mode selector as a menu: picking a mode closes it. */
export const ModeMenu: React.FC<
  AnchoredMenuProps & {
    appMode: AppMode;
    setAppMode: (mode: AppMode) => void;
    mechanism: Mechanism;
    updateMetadata: (metadata: MechanismMetadata, touch?: boolean) => void;
    /** Height of a row (px): a finger needs more than a pointer. */
    rowHeight?: number;
  }
> = ({
  appMode,
  setAppMode,
  mechanism,
  updateMetadata,
  rowHeight,
  ...anchor
}) => (
  <Menu {...useMenuProps(anchor)}>
    {RUN_MODES.map(({ mode, labelKey, tooltipKey }) => (
      // Beside the menu, not over it, so it never hides the next mode.
      <Tooltip key={mode} title={t(tooltipKey)} placement="right">
        <MenuItem
          selected={mode === appMode}
          onClick={() => {
            anchor.onClose();
            if (mode !== appMode)
              change_app_mode(mode, setAppMode, mechanism, updateMetadata);
          }}
          sx={{ minHeight: rowHeight }}
        >
          {t(labelKey)}
        </MenuItem>
      </Tooltip>
    ))}
  </Menu>
);
