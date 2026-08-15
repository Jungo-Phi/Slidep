import React, { useState, useEffect, useRef, useCallback } from "react";
import { Action, CanvasState, ID, UnionElement, ZERO } from "../../../types";
import { Box, IconButton, Typography, TextField } from "@mui/material";
import { get_element_icon } from "../../element-palette/elementIcon";
import { HoveredPart, is_hovered } from "../../../types/hovered-part";
import { element_to_hovered_part } from "../../canvas/utils";
import { is_nameable, shown_element_name } from "../../../utils";
import { useElementNavigation } from "../element-navigation";
import { t } from "../../../i18n";

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
   *  non-interactive preview (no click, no highlight of its own) that still sits
   *  inside a parent which opens something on click, like FrameControl's edge
   *  display. Defaults to mirroring `interactive`. */
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
  // A non-interactive display (a label inside a menu item, a frame preview) is
  // never a target of its own, so it shouldn't reflect hover or selection state
  // that belongs to the real, clickable row elsewhere.
  const hovered = interactive && is_hovered(hoveredPart, element.id);
  const selected = interactive && selectedIds.includes(element.id);
  // A geometric-constraint badge (align/normal/parallel/equal) carries no name
  // to begin with — nothing displays it, so offering to edit it would be a
  // control with no visible effect.
  const canRename = editable && is_nameable(element);
  const icon = get_element_icon(element);
  const initialName = shown_element_name(element);
  const drillDown = useElementNavigation();

  const [inputValue, setInputValue] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [inputWidth, setInputWidth] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const fontSizeValue =
    size === "small" ? "0.75rem" : size === "medium" ? "0.875rem" : "1rem";
  const fontWeight = 500;

  const measureTextWidth = useCallback(
    (text: string) => {
      const span = document.createElement("span");
      span.style.visibility = "hidden";
      span.style.position = "absolute";
      span.style.whiteSpace = "nowrap";
      span.style.fontWeight = fontWeight.toString();
      span.style.fontSize = fontSizeValue;
      span.style.lineHeight = "1.5";
      span.textContent = text;

      document.body.appendChild(span);
      const width = span.offsetWidth;
      document.body.removeChild(span);

      return width;
    },
    [fontSizeValue],
  );

  useEffect(() => {
    if (!isEditing) {
      setInputValue(initialName);
      setInputWidth(0);
    }
  }, [initialName, isEditing]);

  const updateWidth = useCallback(
    (text: string) => {
      const width = measureTextWidth(text);
      setInputWidth(Math.max(8, width + 2));
    },
    [measureTextWidth],
  );

  const handleMouseEnter = () => {
    if (!element || isEditing || !interactive) return;
    setHoveredPart(element_to_hovered_part(element));
  };

  const handleMouseLeave = () => {
    if (isEditing) return;
    setHoveredPart({ type: "Void", position: ZERO });
  };

  // Selecting from inside the panel is an explicit "tell me more about this
  // one" gesture: it drills down to the elements tab, wherever the card sits.
  // A canvas selection goes through neither of these and keeps the active tab.
  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element || isEditing || !interactive) return;
    setCanvasState({
      type: "SelectedElement",
      elementID: element.id,
    });
    drillDown();
  };

  const handleNameChange = (newName: string) => {
    setInputValue(newName);
    if (element && newName !== initialName) {
      applyActions([
        {
          type: "UpdateElementName",
          id: element.id,
          newName,
          oldName: is_nameable(element) ? element.name : undefined,
        },
      ]);
    }
    setIsEditing(false);
  };

  const handleBlur = () => {
    handleNameChange(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      handleNameChange(inputValue);
    } else if (e.key === "Escape") {
      setInputValue(initialName);
      setIsEditing(false);
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canRename && !isEditing && interactive) {
      updateWidth(initialName);
      setIsEditing(true);
    }
  };

  useEffect(() => {
    if (isEditing) {
      updateWidth(inputValue);
    }
  }, [inputValue, isEditing, updateWidth]);

  const iconSize = size === "small" ? 24 : size === "medium" ? 28 : 32;
  const gap = size === "small" ? "1px" : "6px";

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
        padding: size === "small" ? "4px" : size === "medium" ? "6px" : "8px",
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

        {isEditing ? (
          <TextField
            value={inputValue}
            inputRef={inputRef}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={handleTextClick}
            variant="standard"
            autoFocus
            sx={{
              width: `${inputWidth}px`,
              minWidth: 0,
              "& .MuiInputBase-input": {
                ...textStyleCommon,
                fontSize: fontSizeValue,
                padding: 0,
                margin: 0,
                textOverflow: "clip",
                backgroundColor: "primary.contrastText",
                borderRadius: "2px",
                cursor: "text",
                overflow: "hidden",
                boxSizing: "content-box",
              },
              "& .MuiInput-underline:before": {
                borderBottom: "none",
              },
              "& .MuiInput-underline:hover:not(.Mui-disabled):before": {
                borderBottom: "none",
              },
              "& .MuiInput-underline:after": {
                borderBottom: "none",
              },
            }}
          />
        ) : canRename ? (
          <Typography
            variant={
              size === "small"
                ? "caption"
                : size === "medium"
                  ? "body2"
                  : "body1"
            }
            onClick={handleTextClick}
            title={t("element_rename_hint")}
            sx={{
              ...textStyleCommon,
              fontSize: fontSizeValue,
              cursor: "text",
              userSelect: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "inline-block",
            }}
          >
            {initialName}
          </Typography>
        ) : (
          <Typography
            variant={
              size === "small"
                ? "caption"
                : size === "medium"
                  ? "body2"
                  : "body1"
            }
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
      >
        {trailingControls}
      </Box>
    </Box>
  );
};

export default ElementDisplayComponent;
