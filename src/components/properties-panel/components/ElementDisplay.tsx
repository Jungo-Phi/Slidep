import React, { useState, useEffect, useRef } from "react";
import {
  Action,
  ActionBundleType,
  CanvasState,
  UnionElement,
  ZERO,
} from "../../../types";
import { Box, IconButton, Typography, TextField } from "@mui/material";
import { get_element_icon } from "../../element-palette/elementIcon";
import { HoveredPart } from "../../../types/hovered-part";
import { COLORS } from "../../../constants/rendering-specs";
import { element_to_hovered_part } from "../../canvas/utils";
import { shown_element_name } from "../../../utils";

interface ElementDisplayProps {
  element: UnionElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  size: "small" | "medium" | "large";
  editable: boolean;
}

const ElementDisplayComponent: React.FC<ElementDisplayProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  applyActions,
  size,
  editable,
}) => {
  const icon = get_element_icon(element);
  const initialName = shown_element_name(element);

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
    //span.style.fontFamily = '"Roboto", "Helvetica", "Arial", sans-serif';
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
    if (!element || isEditing) return;
    if (
      element.type !== "force" &&
      element.type !== "moment" &&
      element.type !== "distributed-force"
    ) {
      setHoveredPart(element_to_hovered_part(element));
    }
  };

  const handleMouseLeave = () => {
    if (isEditing) return;
    setHoveredPart({ type: "Void", position: ZERO });
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element || isEditing) return;
    setCanvasState({
      type: "SelectedElement",
      elementID: element.id,
    });
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
    if (editable && !isEditing) {
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
  const gap = size === "small" ? 0 : "6px";

  const textStyleCommon = {
    fontWeight: fontWeight,
    color: COLORS.STROKE,
    lineHeight: 1.5,
    whiteSpace: "nowrap" as const,
  };

  return (
    <IconButton
      sx={{
        borderRadius: 5,
        padding: size === "small" ? "4px" : size === "medium" ? "6px" : "8px",
        "&:hover": {
          backgroundColor: "#00000025",
        },
        cursor: "default",
      }}
      onClick={handleSelect}
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
        borderColor={"#00000000"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
                backgroundColor: "rgba(255, 255, 255, 0.8)",
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
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
};

export default ElementDisplayComponent;
