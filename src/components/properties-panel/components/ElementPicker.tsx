import React from "react";
import { Box, Typography, Menu, MenuItem, Tooltip } from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";
import {
  Action,
  CanvasState,
  ID,
  UnionElement,
} from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";

interface ExtraOption {
  label: string;
  icon: React.ElementType;
  selected: boolean;
}

const ExtraOptionLabel: React.FC<{
  icon: React.ElementType;
  label: string;
}> = ({ icon: Icon, label }) => (
  <Box sx={{ display: "flex", alignItems: "center", p: "4px" }}>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        m: "-4px",
        pl: 0.25,
        pr: 0.75,
      }}
    >
      <Icon
        sx={{ margin: "2px", width: 20, height: 20, color: "text.primary" }}
      />
      <Typography
        sx={{
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "text.primary",
          lineHeight: 1.5,
        }}
      >
        {label}
      </Typography>
    </Box>
  </Box>
);

interface ElementPickerProps<T extends UnionElement> {
  /** Text preceding the current selection, e.g. "Repère :". */
  label: string;
  options: T[];
  extraOption?: ExtraOption;
  selected: T | undefined;
  onSelectExtra?: () => void;
  onSelectElement: (option: T) => void;
  onHoverElement: (option: T) => void;
  onHoverEnd: () => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

/**
 * A control showing the current choice (an element via ElementDisplay, or
 * `extraOption`) that opens a menu to pick among `options` and `extraOption`.
 * Hidden when there is nothing to choose from.
 */
export function ElementPicker<T extends UnionElement>({
  label,
  options,
  extraOption,
  selected,
  onSelectExtra,
  onSelectElement,
  onHoverElement,
  onHoverEnd,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
}: ElementPickerProps<T>) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  if (options.length === 0) return null;

  const choose = (fn: () => void) => {
    fn();
    setAnchorEl(null);
    onHoverEnd();
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Tooltip title={label}>
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          onMouseEnter={() => selected && onHoverElement(selected)}
          onMouseLeave={onHoverEnd}
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            borderRadius: 3,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          {selected ? (
            <ElementDisplay
              element={selected}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              size="small"
              editable={false}
              interactive={false}
              cursor="pointer"
            />
          ) : (
            extraOption && (
              <ExtraOptionLabel
                icon={extraOption.icon}
                label={extraOption.label}
              />
            )
          )}
          <KeyboardArrowDown fontSize="small" sx={{ ml: -0.5 }} />
        </Box>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
      >
        {extraOption && (
          <MenuItem
            dense
            selected={extraOption.selected}
            onClick={() => onSelectExtra && choose(onSelectExtra)}
          >
            <ExtraOptionLabel
              icon={extraOption.icon}
              label={extraOption.label}
            />
          </MenuItem>
        )}
        {options.map((option) => (
          <MenuItem
            key={option.id}
            dense
            selected={selected?.id === option.id}
            onClick={() => choose(() => onSelectElement(option))}
            onMouseEnter={() => onHoverElement(option)}
            onMouseLeave={onHoverEnd}
          >
            <ElementDisplay
              element={option}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              size="small"
              editable={false}
              interactive={false}
              cursor="pointer"
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export default ElementPicker;
