import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { t } from "../../../i18n";
import { OVERLAY_ICON_SIZE } from "../element-readings";
import { ICON_GROUP_SX, ROW_ICON_BUTTON_SX } from "../inspector-metrics";

interface ReadingRowProps {
  /** Data URI of the layer's own glyph. */
  icon: string;
  label: string;
  /** What it reads right now, absent on a group's own header. */
  value?: React.ReactNode;
  /** Drawn as selected: this is the reading the canvas is showing as selected too. */
  selected?: boolean;
  /** Selects the reading, which also reveals it on the canvas whether or not its layer is shown. */
  onClick?: () => void;
  /** Points at the reading for as long as the cursor rests here: the canvas draws it, and lights up the element it is read from — exactly what resting on an `ElementDisplay` does for an element. */
  onHoverChange?: (hovered: boolean) => void;
  /** Resting on the eye says which other rows it commands, since one layer is drawn as a whole. */
  onEyeHoverChange?: (hovered: boolean) => void;
  /** Lit because the eye being pointed at commands this row too. */
  commanded?: boolean;
  /** Lit because the cursor is on this very reading out on the canvas — the return leg of `onHoverChange`. */
  pointed?: boolean;
  /** Present → the row carries an eye. */
  shown?: boolean;
  onToggle?: () => void;
  /** A reading listed under its own group's header. */
  nested?: boolean;
  /** Controls belonging to the row itself rather than to its layer, past the eye — the way out of the selection, on the row that opens the panel. */
  trailing?: React.ReactNode;
  /** The row names the panel's own subject: read louder than the rows it leads, the way a selected `ElementDisplay` is. */
  strong?: boolean;
  /** Overrides the row's own height, for a row that has to line up with a card rather than with its siblings. */
  height?: number;
}

/**
 * One line of the readings list: an overlay layer with its eye, or one selectable reading with its value.
 * A layer holding several readings is a header with no value of its own, its readings nested under it.
 */
export const ReadingRow: React.FC<ReadingRowProps> = ({
  icon,
  label,
  value,
  selected = false,
  onClick,
  shown,
  onToggle,
  nested = false,
  onHoverChange,
  onEyeHoverChange,
  commanded = false,
  pointed = false,
  trailing,
  strong = false,
  height,
}) => {
  const row = (
    <Box
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        minHeight: height ?? 26,
        pl: nested ? 2 : 0.5,
        borderRadius: 1.5,
        cursor: onClick ? "pointer" : "default",
        backgroundColor: selected
        ? theme.palette.action.selected
        : commanded || pointed
          ? theme.palette.action.hover
          : undefined,
        // Every row here answers the pointer, clickable or not: each stands for something drawn on the canvas, and the tint is what pairs the two — the same bond an `ElementDisplay` keeps with its own element.
        "&:hover": { backgroundColor: theme.palette.action.hover },
      })}
    >
      <Box
        component="img"
        src={icon}
        alt=""
        sx={{ width: OVERLAY_ICON_SIZE, height: OVERLAY_ICON_SIZE, flexShrink: 0 }}
      />
      <Typography
        variant="caption"
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: strong ? 800 : undefined,
          color: shown === false ? "text.secondary" : "text.primary",
        }}
      >
        {label}
      </Typography>
      {value}
      <Box sx={ICON_GROUP_SX}>
        {onToggle !== undefined && shown !== undefined && (
          <Tooltip title={t(shown ? "hide" : "show")}>
            <IconButton
              size="small"
              role="switch"
              aria-checked={shown}
              onMouseEnter={() => onEyeHoverChange?.(true)}
              onMouseLeave={() => onEyeHoverChange?.(false)}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              sx={{
                ...ROW_ICON_BUTTON_SX,
                color: shown ? "text.primary" : "text.disabled",
              }}
            >
              {shown ? (
                <Visibility fontSize="small" />
              ) : (
                <VisibilityOff fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
        {trailing}
      </Box>
    </Box>
  );
  return row;
};

export default ReadingRow;
