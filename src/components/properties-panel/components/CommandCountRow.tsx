import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { t } from "../../../i18n";
import { OVERLAY_ICON_SIZE } from "../element-readings";

interface CommandCountRowProps {
  /** Data URI of the layer's own glyph, ahead of the label — absent for a set with no glyph of its own. */
  icon?: string;
  label: string;
  /** How many of `total` are currently on. */
  on: number;
  total: number;
  onSetAll: (on: boolean) => void;
  /** Default to the eye pair — the ground row passes its own. */
  onIcon?: React.ReactNode;
  offIcon?: React.ReactNode;
  onTitle?: string;
  offTitle?: string;
  /** Horizontal inset, in theme units — a menu's own margin is wider than a panel's. */
  px?: number;
  /** Extra control rendered between the label and the counter — the trajectory row's style toggle. */
  children?: React.ReactNode;
}

/**
 * A bulk on/off pair over a set of elements: label, n/total counter, and the two commands as bare icons.
 * The counter carries the ternary state (none / some / all) — which is what makes the pair legible as two commands rather than one toggle — so the icons only have to carry the action, not the state.
 */
export const CommandCountRow: React.FC<CommandCountRowProps> = ({
  icon,
  label,
  on,
  total,
  onSetAll,
  onIcon = <Visibility fontSize="small" />,
  offIcon = <VisibilityOff fontSize="small" />,
  onTitle,
  offTitle,
  px = 1.5,
  children,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.5,
      px,
      py: 0.25,
      opacity: total === 0 ? 0.4 : 1,
      // Only reaches an image icon: a MUI icon is dimmed by the disabled button itself.
      "& .MuiIconButton-root.Mui-disabled img": { opacity: 0.4 },
    }}
  >
    {icon !== undefined && (
      <Box
        component="img"
        src={icon}
        alt=""
        sx={{
          width: OVERLAY_ICON_SIZE,
          height: OVERLAY_ICON_SIZE,
          flexShrink: 0,
        }}
      />
    )}
    <Typography variant="body2" sx={{ flex: 1, whiteSpace: "nowrap" }}>
      {label}
    </Typography>
    {children}
    <Typography
      variant="caption"
      color="inherit"
      sx={{
        pr: 0.5,
        minWidth: 30,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {on}/{total}
    </Typography>
    <Tooltip title={onTitle ?? t("show_all")}>
      <span>
        <IconButton
          size="small"
          color="inherit"
          onClick={() => onSetAll(true)}
          disabled={total === 0 || on === total}
          sx={{ p: 0.5 }}
        >
          {onIcon}
        </IconButton>
      </span>
    </Tooltip>
    <Tooltip title={offTitle ?? t("hide_all")}>
      <span>
        <IconButton
          size="small"
          color="inherit"
          onClick={() => onSetAll(false)}
          disabled={total === 0 || on === 0}
          sx={{ p: 0.5 }}
        >
          {offIcon}
        </IconButton>
      </span>
    </Tooltip>
  </Box>
);

export default CommandCountRow;
