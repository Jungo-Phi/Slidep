import React from "react";
import { Box, Typography, Menu, MenuItem, Tooltip } from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";
import { Action, CanvasState, ID, UnionElement } from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";
import { useNonModalPopup } from "../../common/use-non-modal-popup";

interface ExtraOption {
  label: string;
  icon: React.ElementType;
  selected: boolean;
}

const ExtraOptionLabel: React.FC<{
  icon: React.ElementType;
  label: string;
  large?: boolean;
}> = ({ icon: Icon, label, large }) => (
  <Box sx={{ display: "flex", alignItems: "center", p: large ? "5px" : "4px" }}>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: large ? "2px" : "1px",
        m: "-5px",
        pl: 0.25,
        pr: 0.75,
      }}
    >
      <Icon
        sx={{
          margin: "1px",
          width: large ? 28 : 24,
          height: large ? 28 : 24,
          color: "text.primary",
        }}
      />
      <Typography
        sx={{
          fontSize: large ? "0.85rem" : "0.75rem",
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
  large?: boolean;
}

/**
 * A control showing the current choice (an element via ElementDisplay, or `extraOption`) that opens a menu to pick among `options` and `extraOption`.
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
  large = undefined,
}: ElementPickerProps<T>) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const popup = useNonModalPopup(!!anchorEl, anchorEl, () => setAnchorEl(null));

  const choose = (fn: () => void) => {
    fn();
    setAnchorEl(null);
    onHoverEnd();
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <Tooltip title={label}>
        <Box
          onClick={(e) => {
            const field = e.currentTarget;
            setAnchorEl((current) => (current ? null : field));
          }}
          onMouseEnter={() => selected && onHoverElement(selected)}
          onMouseLeave={onHoverEnd}
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            borderRadius: 3,
            border: 1,
            borderColor: "divider",
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
              size={large ? "medium" : "small"}
              editable={false}
              interactive={false}
              cursor="pointer"
            />
          ) : (
            extraOption && (
              <ExtraOptionLabel
                icon={extraOption.icon}
                label={extraOption.label}
                large={large}
              />
            )
          )}
          <KeyboardArrowDown fontSize="small" sx={{ ml: -0.5 }} />
        </Box>
      </Tooltip>
      <Menu
        {...popup}
        anchorEl={anchorEl}
        open={!!anchorEl}
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
              large={large}
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
              size={large ? "medium" : "small"}
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
