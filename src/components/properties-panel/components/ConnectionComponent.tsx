import React from "react";
import {
  Action,
  CanvasState,
  ConnectsActionType,
  MechanicalElement,
  Mechanism,
  shown_element_name,
  ZERO,
} from "../../../types";
import { Box, IconButton, Typography } from "@mui/material";
import {
  LinkOff as LinkOffIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import { get_element_icon } from "../../element-palette/elementIcon";
import {
  disconnect_element,
  get_connection_pair_type,
  get_connections,
} from "../../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";

interface ConnectionProps {
  element: MechanicalElement;
  connectedElement: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (actions: Action[]) => void;
  mechanism: Mechanism;
}

const Connection: React.FC<ConnectionProps> = ({
  element,
  connectedElement,
  containerType,
  setHoveredPart,
  setCanvasState,
  updateMechanism,
  mechanism,
}) => {
  const icon = get_element_icon(connectedElement.type);

  const handleMouseEnter = () => {
    let hoveredPart: HoveredPart;
    if ("position" in connectedElement) {
      hoveredPart = {
        type: "Node",
        position: connectedElement.position,
        id: connectedElement.id,
        beamBodyHover: false,
      };
    } else {
      // Edge
      hoveredPart = {
        type: "Edge",
        position: connectedElement.positionStart.lerp(
          connectedElement.positionEnd,
          0.5,
        ),
        id: connectedElement.id,
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
    setCanvasState({
      type: "SelectedElement",
      elementID: connectedElement.id,
    });
  };

  const handleSwitchMeshedGearDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    let index: number;
    if (element.type === "belt") {
      index = get_connections(element, "ConnectsAttachedGears").indexOf(
        connectedElement.id,
      );
      updateMechanism([
        {
          type: "SwitchMeshedGearDirection",
          id: element.id,
          index,
          direction: !element.attachedGearsIDs[index].direction,
        },
      ]);
    } else if (connectedElement.type === "belt") {
      index = get_connections(
        connectedElement,
        "ConnectsAttachedGears",
      ).indexOf(element.id);
      updateMechanism([
        {
          type: "SwitchMeshedGearDirection",
          id: connectedElement.id,
          index,
          direction: !connectedElement.attachedGearsIDs[index].direction,
        },
      ]);
    }
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const connection_pair_type = get_connection_pair_type(
      element.id,
      connectedElement,
    );
    updateMechanism([
      disconnect_element(
        element,
        connectedElement,
        containerType,
        mechanism.mechanicalElements,
      ),
      disconnect_element(
        connectedElement,
        element,
        connection_pair_type,
        mechanism.mechanicalElements,
      ),
    ]);
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
      border={1}
      borderColor={"#00000025"}
      borderRadius={2}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <IconButton
        onClick={handleSelect}
        title="Select"
        size="small"
        sx={{ my: -2 }}
      >
        <Box
          component="img"
          src={icon}
          alt={connectedElement.type}
          sx={{
            width: 24,
            height: 24,
            display: "block",
            mx: -0.25,
            my: -0.75,
          }}
        />
      </IconButton>

      <Box>
        <Typography variant={"body2"} fontWeight={500}>
          {shown_element_name(connectedElement)}
        </Typography>
      </Box>
      <IconButton onClick={handleDisconnect} title="Disconnect" size="small">
        <LinkOffIcon fontSize="small" color="error" sx={{ my: -0.5 }} />
      </IconButton>
      <>
        {(() => {
          if (
            (element.type === "belt" &&
              containerType === "ConnectsAttachedGears") ||
            containerType === "ConnectsAttachedBelt"
          ) {
            {
              let direction = false;
              if (element.type === "belt") {
                direction =
                  element.attachedGearsIDs[
                    get_connections(element, "ConnectsAttachedGears").indexOf(
                      connectedElement.id,
                    )
                  ].direction;
              } else if (connectedElement.type === "belt") {
                direction =
                  connectedElement.attachedGearsIDs[
                    get_connections(
                      connectedElement,
                      "ConnectsAttachedGears",
                    ).indexOf(element.id)
                  ].direction;
              }
              if (direction) {
                return (
                  <IconButton
                    onClick={handleSwitchMeshedGearDirection}
                    title="Switch rotation direction"
                    size="small"
                  >
                    <RotateLeftIcon
                      fontSize="small"
                      color="secondary"
                      sx={{ my: -0.5 }}
                    />
                  </IconButton>
                );
              } else {
                return (
                  <IconButton
                    onClick={handleSwitchMeshedGearDirection}
                    title="Switch rotation direction"
                    size="small"
                  >
                    <RotateRightIcon
                      fontSize="small"
                      color="secondary"
                      sx={{ my: -0.5 }}
                    />
                  </IconButton>
                );
              }
            }
          }
        })()}
      </>
    </Box>
  );
};

export default Connection;
