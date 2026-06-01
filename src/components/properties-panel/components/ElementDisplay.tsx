import React from "react";
import {
  Action,
  ActionBundleType,
  CanvasState,
  shown_element_name,
  UnionElement,
  ZERO,
} from "../../../types";
import { Box, IconButton, Typography } from "@mui/material";
import { get_element_icon } from "../../element-palette/elementIcon";
import { HoveredPart } from "../../../types/hovered-part";
import { COLORS } from "../../../constants/rendering-specs";
import { element_to_hovered_part } from "../../mechanical-canvas/utils";

interface ElementDisplayProps {
  element: UnionElement;
  size: "small" | "medium" | "large";
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
}

const ElementDisplayComponent: React.FC<ElementDisplayProps> = ({
  element,
  size,
  setHoveredPart,
  setCanvasState,
}) => {
  const icon = get_element_icon(!element ? undefined : element.type);
  const element_name = shown_element_name(element);

  const handleMouseEnter = () => {
    if (!element) return;
    setHoveredPart(element_to_hovered_part(element));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!element) return;
    setCanvasState({
      type: "SelectedElement",
      elementID: element.id,
      isMouseDown: false,
    });
  };

  return (
    <IconButton
      sx={{
        borderRadius: 5,
        "&:hover": {
          backgroundColor: "#00000025",
        },
      }}
      onClick={handleSelect}
      title="Sélectionner"
      size={size}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: size === "small" ? 0.25 : size === "medium" ? 0.75 : 1.5,
          mx: size === "small" ? -0.75 : size === "medium" ? -1 : -1.5,
          my: size === "small" ? -0.75 : size === "medium" ? -1 : -1.5,
          borderRadius: 5,
          pl: 0.25,
          pr: 0.75,
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
            width: size === "small" ? 24 : size === "medium" ? 32 : 40,
            height: size === "small" ? 24 : size === "medium" ? 32 : 40,
          }}
        />
        <Typography
          variant={
            size === "small" ? "body2" : size === "medium" ? "body1" : "h5"
          }
          fontWeight={500}
          color={COLORS.STROKE}
        >
          {element_name}
        </Typography>
      </Box>
    </IconButton>
  );
};

export default ElementDisplayComponent;
