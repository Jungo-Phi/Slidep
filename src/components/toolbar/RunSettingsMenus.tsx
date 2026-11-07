import React from "react";
import {
  alpha,
  Box,
  ButtonBase,
  Divider,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { KeyboardArrowDown, Replay } from "@mui/icons-material";
import ToggleIcon from "../properties-panel/components/ToggleIcon";
import { OVERLAY_ICON_SIZE } from "../properties-panel/element-readings";
import { TOP_BAR_CONTROL_HEIGHT } from "./toolbar-metrics";
import { t } from "../../i18n";
import {
  Action,
  AppMode,
  DEFAULT_SIMULATION,
  Mechanism,
  MechanismMetadata,
} from "../../types";
import { useNonModalPopup } from "../common/use-non-modal-popup";
import {
  change_app_mode,
  PhysicsSwitch,
  RUN_MODES,
  usePhysicsSwitches,
  useShownSimulation,
} from "./playback-actions";
import NumberInput from "../properties-panel/components/NumberInput";
import { simulation_value } from "../mechanism/simulation-values";
import type { SimulationValueSetting } from "../../types/actions";
import type { StringKey } from "../../i18n";
import {
  LINEAR_ACCELERATION,
  QuantityKind,
} from "../../utils/quantity-format";

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

/** The numeric settings' own fields: the symbol each is written with, how finely it is read, and the range it means anything in. */
const VALUE_FIELDS: Record<
  SimulationValueSetting,
  {
    symbol: string;
    /** Absent, the field carries no tooltip: its row's label says enough. */
    hintKey?: StringKey;
    kind?: QuantityKind;
    precision: number;
    step: number;
    max?: number;
    /** A value to go back to, offered as the field's own button, and what that button says it does. */
    reset?: { value: number; titleKey: StringKey };
  }
> = {
  gravityStrength: {
    symbol: "g",
    kind: LINEAR_ACCELERATION,
    precision: 2,
    step: 0.1,
    reset: { value: DEFAULT_SIMULATION.gravityStrength, titleKey: "gravity_reset" },
  },
  restitution: {
    symbol: "e",
    hintKey: "restitution_hint",
    precision: 2,
    step: 0.05,
    max: 1,
  },
  staticFriction: {
    symbol: "μs",
    hintKey: "static_friction_hint",
    precision: 2,
    step: 0.05,
  },
  dynamicFriction: {
    symbol: "μd",
    hintKey: "dynamic_friction_hint",
    precision: 2,
    step: 0.05,
  },
};

/** A section's name inside a top-bar popup, headed as the display menu heads its own. */
const PopupHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="body2"
    color="textDisabled"
    sx={{ px: 2, py: 0.5, display: "block" }}
  >
    {children}
  </Typography>
);

/**
 * The physics the mechanism runs under: gravity and its strength, then the contacts — collisions, the floor, and how an impact bounces and rubs.
 * A popover rather than a menu: it holds fields to type in, which a menu's own type-to-select would steal the keys from.
 * Every value is the one in effect at the instant on screen, like the switches (see `useShownSimulation`); an edit is a parameter edit, so it applies mid-run without leaving the simulation.
 */
export const PhysicsMenu: React.FC<
  AnchoredMenuProps & {
    appMode: AppMode;
    mechanism: Mechanism;
    applyActions: (actions: Action[]) => void;
    /** Rows padded for a finger rather than a pointer. */
    touch?: boolean;
  }
> = ({ appMode, mechanism, applyActions, touch, ...anchor }) => {
  const switches = usePhysicsSwitches(appMode, mechanism);
  const shown = useShownSimulation(appMode, mechanism);
  // Centred under its button, as the display menu is.
  const menuProps = {
    ...useMenuProps(anchor),
    anchorOrigin: { vertical: "bottom", horizontal: "center" },
    transformOrigin: { vertical: "top", horizontal: "center" },
  } as const;
  const switchOf = (name: PhysicsSwitch["iconName"]) =>
    switches.find((row) => row.iconName === name)!;

  const valueField = (setting: SimulationValueSetting) => {
    const field = VALUE_FIELDS[setting];
    const value = simulation_value(shown, setting);
    const write = (newValue: number) =>
      applyActions([
        {
          type: "ChangeSimulationValue",
          setting,
          newValue: Math.min(Math.max(newValue, 0), field.max ?? Infinity),
          oldValue: simulation_value(mechanism.simulation, setting),
        },
      ]);
    const reset = field.reset;
    return (
      <NumberInput
        label={field.symbol}
        title={field.hintKey ? t(field.hintKey) : ""}
        kind={field.kind}
        value={value}
        precision={field.precision}
        step={field.step}
        unsigned
        onChange={write}
        // The reset button eats into the field: a value with its unit would no longer fit.
        width={reset ? 112 : undefined}
        adornment={
          reset && {
            icon: Replay,
            title: t(reset.titleKey),
            disabled: value === reset.value,
            color: "secondary",
            onClick: () => write(reset.value),
          }
        }
      />
    );
  };

  const minHeight = touch ? 44 : 36;

  /**
   * A setting switched on and off: the row itself is the switch, its glyph lit or faded as an element's own collision or anchor toggle is.
   * A field it governs sits at the end of its row, outside the button: a click there is an edit, never a toggle.
   */
  const switchRow = (row: PhysicsSwitch, field?: React.ReactNode) => (
    <Box sx={{ display: "flex", alignItems: "center", minHeight, pr: field ? 1.5 : 0 }}>
      <Tooltip title={t(row.stateKey)} placement="left">
        <ButtonBase
          role="switch"
          aria-checked={row.on}
          onClick={() => applyActions([row.toggle])}
          sx={{
            flex: 1,
            alignSelf: "stretch",
            justifyContent: "flex-start",
            gap: 1,
            pl: 2,
            pr: 2,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <ToggleIcon
            on={row.on}
            onName={row.iconName}
            offName={`${row.iconName}-off`}
            size={OVERLAY_ICON_SIZE}
          />
          <Typography
            variant="body1"
            color={row.on ? "text.primary" : "text.secondary"}
            sx={{ whiteSpace: "nowrap" }}
          >
            {t(row.labelKey)}
          </Typography>
        </ButtonBase>
      </Tooltip>
      {field}
    </Box>
  );

  const valueRow = (setting: SimulationValueSetting, labelKey: StringKey) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        pl: 2,
        pr: 1.5,
        minHeight,
      }}
    >
      <Typography variant="body1" sx={{ whiteSpace: "nowrap" }}>
        {t(labelKey)}
      </Typography>
      {valueField(setting)}
    </Box>
  );

  return (
    <Popover {...menuProps}>
      <Box sx={{ py: 1, minWidth: 300 }}>
        {switchRow(switchOf("gravity"), valueField("gravityStrength"))}
        <Divider sx={{ my: 1 }} />
        <PopupHeading>{t("contacts_section")}</PopupHeading>
        {switchRow(switchOf("collision"))}
        {switchRow(switchOf("floor"))}
        {valueRow("restitution", "restitution")}
        {valueRow("staticFriction", "static_friction")}
        {valueRow("dynamicFriction", "dynamic_friction")}
      </Box>
    </Popover>
  );
};

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
