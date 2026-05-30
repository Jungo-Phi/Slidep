import React from "react";
import {
  Action,
  ActionBundleType,
  CanvasState,
  ConnectsActionType,
  MechanicalElement,
  Mechanism,
} from "../../../types";
import { Box, IconButton } from "@mui/material";
import {
  LinkOff as LinkOffIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import {
  disconnect_element,
  get_connection_pair_type,
  get_connections,
} from "../../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";
import { COLORS } from "../../../constants/rendering-specs";

interface ConnectionProps {
  element: MechanicalElement;
  connectedElement: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
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
  const handleSwitchMeshedGearDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    let index: number;
    if (element.type === "belt") {
      index = get_connections(element, "ConnectsAttachedGears").indexOf(
        connectedElement.id,
      );
      updateMechanism(
        [
          {
            type: "SwitchAttachedGearDirection",
            id: element.id,
            index,
            direction: !element.attachedGearsIDs[index].direction,
          },
        ],
        "Other",
      );
    } else if (connectedElement.type === "belt") {
      index = get_connections(
        connectedElement,
        "ConnectsAttachedGears",
      ).indexOf(element.id);
      updateMechanism(
        [
          {
            type: "SwitchAttachedGearDirection",
            id: connectedElement.id,
            index,
            direction: !connectedElement.attachedGearsIDs[index].direction,
          },
        ],
        "Other",
      );
    }
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (connectedElement === undefined) return;
    const connection_pair_type = get_connection_pair_type(
      element.id,
      connectedElement,
    );
    updateMechanism(
      [
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
      ],
      "Connects",
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        flexDirection: "row",
        alignItems: "center",
        bgcolor:
          connectedElement === undefined
            ? COLORS.DELETION_BOX + COLORS.HALF_TRANSPARENCY
            : COLORS.BACKGROUND,
      }}
      border={2}
      borderColor={"#00000025"}
      borderRadius={5}
    >
      <ElementDisplay
        element={connectedElement}
        size="small"
        bold={false}
        setHoveredPart={setHoveredPart}
        setCanvasState={setCanvasState}
        updateMechanism={updateMechanism}
      ></ElementDisplay>
      <IconButton
        sx={{
          borderRadius: 5,
          "&:hover": {
            backgroundColor: "#00000025",
          },
          my: -0.5,
          ml: "-4px",
        }}
        onClick={handleDisconnect}
        title="Déconnecter"
        size="small"
      >
        <LinkOffIcon sx={{ my: -0.4 }} fontSize="small" color="error" />
      </IconButton>
      <>
        {(() => {
          if (
            (connectedElement !== undefined &&
              element.type === "belt" &&
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
                    sx={{
                      borderRadius: 5,
                      "&:hover": {
                        backgroundColor: "#00000025",
                      },
                      my: -0.5,
                      ml: "-4px",
                    }}
                    onClick={handleSwitchMeshedGearDirection}
                    title="Inverser la direction"
                    size="small"
                  >
                    <RotateLeftIcon
                      fontSize="small"
                      color="secondary"
                      sx={{ mx: -0.2, my: -0.4 }}
                    />
                  </IconButton>
                );
              } else {
                return (
                  <IconButton
                    sx={{
                      borderRadius: 5,
                      "&:hover": {
                        backgroundColor: "#00000025",
                      },
                      my: -0.5,
                      ml: "-4px",
                    }}
                    onClick={handleSwitchMeshedGearDirection}
                    title="Inverser la direction"
                    size="small"
                  >
                    <RotateRightIcon
                      fontSize="small"
                      color="secondary"
                      sx={{ mx: -0.2, my: -0.4 }}
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
