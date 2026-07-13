import React, { useState, useEffect, useRef } from "react";
import {
  Action,
  ActionBundleType,
  CanvasState,
  UnionElement,
  ZERO,
} from "../../../types";
import { Box, IconButton, Typography, TextField, alpha } from "@mui/material";
import { get_element_icon } from "../../element-palette/elementIcon";
import { HoveredPart } from "../../../types/hovered-part";
import { element_to_hovered_part } from "../../canvas/utils";
import { shown_element_name } from "../../../utils";
import { useElementNavigation } from "../element-navigation";

interface ElementDisplayProps {
  element: UnionElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  size: "small" | "medium" | "large";
  editable: boolean;
  trailingControls?: React.ReactNode;
  interactive?: boolean;
}

const ElementDisplayComponent: React.FC<ElementDisplayProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  applyActions,
  size,
  editable,
  trailingControls,
  interactive = true,
}) => {
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

  const measureTextWidth = (text: string) => {
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
  };

  useEffect(() => {
    if (!isEditing) {
      setInputValue(initialName);
      setInputWidth(0);
    }
  }, [initialName, isEditing]);

  const updateWidth = (text: string) => {
    const width = measureTextWidth(text);
    setInputWidth(Math.max(8, width + 2));
  };

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
      applyActions(
        [
          {
            type: "UpdateElementName",
            id: element.id,
            newName,
            oldName: element.name,
          },
        ],
        "Other",
      );
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
    if (editable && !isEditing && interactive) {
      updateWidth(initialName);
      setIsEditing(true);
    }
  };

  useEffect(() => {
    if (isEditing) {
      updateWidth(inputValue);
    }
  }, [inputValue, isEditing]);

  const iconSize = size === "small" ? 24 : size === "medium" ? 28 : 32;
  const gap = size === "small" ? "1px" : "6px";

  const textStyleCommon = {
    fontWeight: fontWeight,
    color: "text.primary",
    lineHeight: 1.5,
    whiteSpace: "nowrap" as const,
  };

  const content = (
    <IconButton
      // With trailingControls the wrapper below carries the interactions for
      // the whole row; on its own, the card must carry them itself — otherwise
      // it shows a pointer cursor and a hover but does nothing on click.
      {...(!trailingControls && {
        onClick: handleSelect,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
      })}
      sx={{
        borderRadius: 5,
        padding: size === "small" ? "4px" : size === "medium" ? "6px" : "8px",
        "&:hover": {
          backgroundColor:
            trailingControls || !interactive ? "transparent" : "action.hover",
        },
        cursor: interactive ? "pointer" : "default",
        ...(trailingControls && {
          justifyContent: "flex-start",
          minWidth: 0,
        }),
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
                // Translucent white, so the row's own background still shows
                // through while the name is being edited.
                backgroundColor: (t) => alpha(t.palette.common.white, 0.8),
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
        ) : editable ? (
          <Typography
            variant={
              size === "small"
                ? "caption"
                : size === "medium"
                  ? "body2"
                  : "body1"
            }
            onClick={handleTextClick}
            title={"Cliquer pour modifier le nom"}
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
