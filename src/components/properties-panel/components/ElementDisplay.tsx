import React, { useState } from "react";
import { Action, CanvasState, ID, UnionElement, ZERO } from "../../../types";
import {
  Box,
  IconButton,
  Typography,
  Tooltip,
} from "@mui/material";
import { get_element_icon } from "../../element-palette/elementIcon";
import { HoveredPart, is_hovered } from "../../../types/hovered-part";
import { element_to_hovered_part } from "../../canvas/utils";
import { is_nameable, shown_element_name } from "../../../utils";
import { useElementNavigation } from "../element-navigation";
import EditableName from "./EditableName";

interface ElementDisplayProps {
  element: UnionElement;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  /** Every element id the canvas currently holds selected — single or multiple. */
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  size: "small" | "medium" | "large";
  editable: boolean;
  trailingControls?: React.ReactNode;
  interactive?: boolean;
  /** Overrides the hover cursor when it diverges from `interactive` — e.g. a
   * non-interactive preview (no click, no highlight of its own) that still sits inside a parent which opens something on click, like FrameControl's edge display.
   * Defaults to mirroring `interactive`. */
  cursor?: "pointer" | "default";
}

const ElementDisplayComponent: React.FC<ElementDisplayProps> = ({
  element,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  size,
  editable,
  trailingControls,
  interactive = true,
  cursor = interactive ? "pointer" : "default",
}) => {
  // A non-interactive display (a label inside a menu item, a frame preview) is never a target of its own, so it shouldn't reflect hover or selection state that belongs to the real, clickable row elsewhere.
  const hovered = interactive && is_hovered(hoveredPart, element.id);
  const selected = interactive && selectedIds.includes(element.id);
  // A geometric-constraint badge (align/normal/parallel/equal) carries no name to begin with.
  // Nothing displays it, so offering to edit it would be a control with no visible effect.
  const canRename = editable && is_nameable(element);
  const icon = get_element_icon(element);
  const initialName = shown_element_name(element);
  const drillDown = useElementNavigation();

  const [isEditing, setIsEditing] = useState(false);
  // Suppress the select tooltip while a more specific one is showing over the same row: the rename text, or (when present) one of the trailing controls.
  const [renameHovered, setRenameHovered] = useState(false);
  const [trailingHovered, setTrailingHovered] = useState(false);
  // `hovered` below also goes true from a hover arriving elsewhere (the canvas highlighting this same element) — the right cue for the background tint, but not for the tooltip, which must only follow the pointer actually being here.
  const [locallyHovered, setLocallyHovered] = useState(false);

  const fontSizeValue =
    size === "small" ? "0.75rem" : size === "medium" ? "0.85rem" : "1rem";
  const fontWeight = 500;

  const handleMouseEnter = () => {
    setLocallyHovered(true);
    if (!element || isEditing || !interactive) return;
    setHoveredPart(element_to_hovered_part(element));
  };

  const handleMouseLeave = () => {
    setLocallyHovered(false);
    if (isEditing) return;
    setHoveredPart({ type: "Void", position: ZERO });
  };

  // Selecting from inside the panel is an explicit "tell me more about this one" gesture: it drills down to the tab hosting the element, wherever the card sits.
  // A canvas selection goes through neither of these and keeps the active tab.
  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element || isEditing || !interactive) return;
    setCanvasState({
      type: "SelectedElement",
      elementID: element.id,
    });
    drillDown(element);
  };

  const rename = (newName: string) =>
    applyActions([
      {
        type: "UpdateElementName",
        id: element.id,
        newName,
        oldName: is_nameable(element) ? element.name : undefined,
      },
    ]);

  const iconSize = size === "small" ? 24 : size === "medium" ? 28 : 32;
  // The height the whole row settles at: its glyph, plus the hairline border around it.
  // What `trailingControls` holds sizes itself (see `ICON_GROUP_SX`), so that a control bringing buttons of its own keeps them.
  const rowHeight = iconSize + 2;
  const gap = size === "small" ? "1px" : size === "medium" ? "2px" : "6px";

  const textStyleCommon = {
    fontWeight: selected ? fontWeight + 300 : fontWeight,
    color: "text.primary",
    lineHeight: 1.5,
    whiteSpace: "nowrap" as const,
  };

  const content = (
    <IconButton
      {...(!trailingControls &&
        interactive && {
          onClick: handleSelect,
          onMouseEnter: handleMouseEnter,
          onMouseLeave: handleMouseLeave,
        })}
      sx={{
        borderRadius: 5,
        minHeight: rowHeight,
        padding: size === "small" ? "4px" : size === "medium" ? "5px" : "8px",
        backgroundColor:
          !trailingControls && hovered ? "action.hover" : "transparent",
        "&:hover": {
          backgroundColor:
            trailingControls || !interactive ? "transparent" : "action.hover",
        },
        cursor,
        ...(trailingControls && {
          justifyContent: "flex-start",
          minWidth: 0,
        }),
        "&:focus-visible": {
          backgroundColor: "action.selected",
        },
      }}
      disableRipple
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: gap,
          m: "-5px",
          borderRadius: 5,
          pl: 0.25,
          pr: 0.75,
          minWidth: 0,
        }}
        border={1}
        borderColor={"transparent"}
      >
        <Tooltip
          title={""}
          open={
            interactive &&
            !isEditing &&
            locallyHovered &&
            !renameHovered &&
            !trailingHovered
          }
        >
          <Box
            component="img"
            src={icon}
            draggable={false}
            sx={{
              width: iconSize,
              height: iconSize,
              flexShrink: 0,
            }}
          />
        </Tooltip>

        {canRename && interactive ? (
          <EditableName
            name={initialName}
            onRename={rename}
            fontSize={fontSizeValue}
            fontWeight={textStyleCommon.fontWeight}
            onEditingChange={setIsEditing}
            onHoverChange={setRenameHovered}
          />
        ) : (
          <Typography
            sx={{
              ...textStyleCommon,
              fontSize: fontSizeValue,
              cursor: "inherit",
              userSelect: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
            }}
          >
            {initialName}
          </Typography>
        )}
      </Box>
    </IconButton>
  );

  if (!trailingControls) return content;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        minHeight: rowHeight,
        borderRadius: 5,
        cursor: "pointer",
        justifyContent: "space-between",
        backgroundColor: hovered ? "action.hover" : "transparent",
        "&:hover": {
          backgroundColor: "action.hover",
        },
        "&:has(.element-display-actions:hover)": {
          backgroundColor: "transparent",
        },
      }}
      onClick={handleSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {content}
      <Box
        className="element-display-actions"
        sx={{ display: "contents" }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setTrailingHovered(true)}
        onMouseLeave={() => setTrailingHovered(false)}
      >
        {trailingControls}
      </Box>
    </Box>
  );
};

export default ElementDisplayComponent;
