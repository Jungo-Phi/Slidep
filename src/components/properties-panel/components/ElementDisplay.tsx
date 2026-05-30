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

interface ElementDisplayProps {
  element: UnionElement;
  size: "small" | "medium" | "large";
  bold: boolean;
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
  bold,
  setHoveredPart,
  setCanvasState,
}) => {
  const icon = get_element_icon(
    element === undefined ? undefined : element.type,
  );
  const element_name = shown_element_name(element);

  const handleMouseEnter = () => {
    if (element === undefined) return;
    let hoveredPart: HoveredPart;
    if ("radius" in element) {
      hoveredPart = {
        type: "GearTooth",
        position: element.position,
        id: element.id,
      };
    } else if ("position" in element) {
      hoveredPart = {
        type: "Node",
        position: element.position,
        id: element.id,
        beamBodyHover: false,
      };
    } else {
      hoveredPart = {
        type: "Edge",
        position: element.positionStart.lerp(element.positionEnd, 0.5),
        id: element.id,
        part: "body",
      };
    }
    setHoveredPart(hoveredPart);
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (element === undefined) return;
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
          fontWeight={bold ? 800 : 500}
          color={COLORS.STROKE}
          sx={{ letterSpacing: bold ? "-0.02em" : "normal" }}
        >
          {element_name}
        </Typography>
      </Box>
    </IconButton>
  );
};

export default ElementDisplayComponent;
