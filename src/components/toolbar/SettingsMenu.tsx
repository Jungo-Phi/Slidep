import React, { useCallback, useState } from "react";
import {
  Box,
  Divider,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Check,
  DarkMode,
  GridOff,
  GridOn,
  LightMode,
  Settings,
  SettingsBrightness,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { is_string_key, StringKey, t } from "../../i18n";
import {
  resolve_theme,
  THEME_FAMILIES,
  ThemeMode,
  ThemeName,
} from "../../constants/mui-theme";
import {
  ANGLE_STEPS,
  CUSTOM_ANGLE_STEP,
  type SnapSettings,
} from "../canvas/snap-corridor";
import NumberInput from "../properties-panel/components/NumberInput";

/** A theme family is named by its id; only the ones with a translation read differently. */
const theme_family_label = (name: string): string => {
  const key = `theme_family_${name.toLowerCase()}`;
  return is_string_key(key) ? t(key) : name;
};

/**
 * The ambience the whole app is in, whichever family it wears — the choice is
 * global, as it is in the system it can defer to, and not a property of each
 * family.
 */
const THEME_MODES: {
  mode: ThemeMode;
  titleKey: StringKey;
  Icon: typeof LightMode;
}[] = [
  { mode: "light", titleKey: "theme_light", Icon: LightMode },
  { mode: "dark", titleKey: "theme_dark", Icon: DarkMode },
  { mode: "system", titleKey: "theme_system", Icon: SettingsBrightness },
];

interface SettingsMenuProps {
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
}

/** The settings menu: grid/snap toggles, angle step, and theme family/mode picker. */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({
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
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const setSnapSetting = useCallback(
    <K extends keyof SnapSettings>(key: K, value: SnapSettings[K]) =>
      setSnapSettings((prev) => ({ ...prev, [key]: value })),
    [setSnapSettings],
  );

  return (
    <>
      <Tooltip disableInteractive title={t("toolbar_settings")}>
        <IconButton
          color="inherit"
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <Settings sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => {
          previewLater(null);
          setAnchorEl(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        // Leaving the list — for another setting or out of the menu
        // entirely — drops the preview, armed or showing, and restores
        // the chosen theme.
        MenuListProps={{ onMouseLeave: () => previewLater(null) }}
      >
        <MenuItem disableRipple onClick={() => setShowGrid(!showGrid)}>
          <FormControlLabel
            control={
              <Box sx={{ display: "flex", mr: 1 }}>
                {showGrid ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </Box>
            }
            label={t("settings_show_grid")}
            sx={{ margin: 0 }}
          />
        </MenuItem>
        <MenuItem disableRipple onClick={() => setSnapToGrid(!snapToGrid)}>
          <FormControlLabel
            control={
              <Box sx={{ display: "flex", mr: 1 }}>
                {snapToGrid ? (
                  <GridOn fontSize="small" />
                ) : (
                  <GridOff fontSize="small" />
                )}
              </Box>
            }
            label={t("settings_snap_to_grid")}
            sx={{ margin: 0 }}
          />
        </MenuItem>
        <MenuItem
          disableRipple
          onClick={() =>
            setSnapSetting("highlightSnap", !snapSettings.highlightSnap)
          }
          disabled={!snapToGrid}
        >
          <FormControlLabel
            control={
              <Box sx={{ display: "flex", mr: 1 }}>
                {snapSettings.highlightSnap ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </Box>
            }
            label={t("settings_highlight_snap")}
            sx={{ margin: 0 }}
          />
        </MenuItem>
        <MenuItem
          disableRipple
          onClick={() =>
            setSnapSetting("showAngleGuides", !snapSettings.showAngleGuides)
          }
          disabled={!snapToGrid}
        >
          <FormControlLabel
            control={
              <Box sx={{ display: "flex", mr: 1 }}>
                {snapSettings.showAngleGuides ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </Box>
            }
            label={t("settings_show_angle_guides")}
            sx={{ margin: 0 }}
          />
        </MenuItem>

        <MenuItem
          disableRipple
          disabled={!snapSettings.showAngleGuides}
          sx={{
            py: 0.5,
            gap: 1,
            "&:hover": { backgroundColor: "transparent" },
            "&.Mui-focusVisible": { backgroundColor: "transparent" },
            cursor: "default",
          }}
        >
          <Typography variant="body2" color="textDisabled" sx={{ flexGrow: 1 }}>
            {t("settings_angle_step")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {isCustomAngleStep && (
              <Box sx={{ display: "flex", mr: "-1px" }}>
                <NumberInput
                  label={""}
                  value={snapSettings.angleStep}
                  suffix="°"
                  onChange={(value) =>
                    setSnapSettings((prev) => ({
                      ...prev,
                      angleStep: Math.min(90, Math.max(1, value)),
                      angleStepIsCustom: true,
                    }))
                  }
                  unsigned
                />
              </Box>
            )}
            <Select
              disabled={!snapToGrid}
              value={isCustomAngleStep ? "custom" : snapSettings.angleStep}
              onChange={(e) =>
                setSnapSettings((prev) => ({
                  ...prev,
                  angleStep:
                    e.target.value === "custom"
                      ? CUSTOM_ANGLE_STEP
                      : Number(e.target.value),
                  angleStepIsCustom: e.target.value === "custom",
                }))
              }
              sx={{
                maxWidth: isCustomAngleStep ? 36 : "none",
                height: 28,
                fontSize: "body2.fontSize",
                border: "none",
                "& .MuiSelect-select": {
                  ...(isCustomAngleStep && {
                    color: "transparent",
                    textShadow: "0 0 0 transparent",
                  }),
                },
                "& .MuiOutlinedInput-notchedOutline": {
                  ...(isCustomAngleStep && {
                    borderLeft: "none",
                  }),
                },
                ...(isCustomAngleStep && {
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }),
              }}
            >
              {ANGLE_STEPS.map((step) => (
                <MenuItem
                  key={step}
                  value={step}
                  sx={{ fontSize: "body2.fontSize" }}
                >
                  {step}°
                </MenuItem>
              ))}
              <MenuItem value="custom" sx={{ fontSize: "body2.fontSize" }}>
                {t("settings_angle_step_custom")}
              </MenuItem>
            </Select>
          </Box>
        </MenuItem>

        <Divider />
        <MenuItem disableRipple disabled>
          <FormControlLabel
            control={<Switch size="small" disabled />}
            label={t("settings_show_constraints")}
          />
        </MenuItem>
        <Divider />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 3,
            pl: 3,
            pr: 2,
            py: 0.5,
          }}
        >
          <Typography variant="body2" color="textDisabled">
            {t("settings_theme")}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="medium"
            value={themeChoice.mode}
            onChange={(_, mode: ThemeMode | null) =>
              mode && changeTheme(themeChoice.family, mode)
            }
          >
            {THEME_MODES.map(({ mode, titleKey, Icon }) => (
              <ToggleButton
                key={mode}
                value={mode}
                onMouseEnter={() =>
                  previewLater(
                    resolve_theme(themeChoice.family, mode, systemDark),
                  )
                }
                sx={{ px: 1, py: 0.25, border: 0 }}
              >
                <Tooltip disableInteractive title={t(titleKey)}>
                  <Icon sx={{ fontSize: 18 }} />
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {/* The families, each shown in the ambience currently set. The
          grey name is the theme the pair resolves to, where the family
          does not already carry it (Fantaisie → Blueprint). */}
        {THEME_FAMILIES.map((family) => {
          const resolved = resolve_theme(
            family.name,
            themeChoice.mode,
            systemDark,
          );
          return (
            <MenuItem
              key={family.name}
              selected={family.name === themeChoice.family}
              onClick={() => changeTheme(family.name, themeChoice.mode)}
              onMouseEnter={() => previewLater(resolved)}
            >
              <ListItemIcon>
                {family.name === themeChoice.family && (
                  <Check sx={{ fontSize: 18 }} />
                )}
              </ListItemIcon>
              {theme_family_label(family.name)}
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
          {t("settings_element_style")}
        </MenuItem>
      </Menu>
    </>
  );
};
