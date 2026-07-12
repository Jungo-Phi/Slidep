import React from "react";
import {
  Action,
  ActionBundleType,
  CanvasState,
  ConnectsActionType,
  MechanicalElement,
  Mechanism,
} from "../../../types";
import { IconButton } from "@mui/material";
import {
  LinkOff as LinkOffIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import {
  disconnect_element,
  get_connection_pair_type,
  get_connections,
} from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";

interface ConnectionProps {
  element: MechanicalElement;
  connectedElement: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
}

const Connection: React.FC<ConnectionProps> = ({
  element,
  connectedElement,
  containerType,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
}) => {
  const handleSwitchMeshedGearDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    let index: number;
    if (element.type === "belt") {
      index = get_connections(element, "ConnectsAttachedGears").indexOf(
        connectedElement.id,
      );
      applyActions(
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
      applyActions(
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
    if (!connectedElement) return;
    const connection_pair_type = get_connection_pair_type(
      element.id,
      connectedElement,
    );
    applyActions(
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

  const showDirectionButton =
    (connectedElement &&
      element.type === "belt" &&
      containerType === "ConnectsAttachedGears") ||
    containerType === "ConnectsAttachedBelt";

  let direction = false;
  if (showDirectionButton) {
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
          get_connections(connectedElement, "ConnectsAttachedGears").indexOf(
            element.id,
          )
        ].direction;
    }
  }
  const DirectionIcon = direction ? RotateLeftIcon : RotateRightIcon;

  return (
    <ElementDisplay
      element={connectedElement}
      setHoveredPart={setHoveredPart}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      size="small"
      editable={false}
      trailingControls={
        <>
          {showDirectionButton && (
            <IconButton
              sx={{
                borderRadius: 5,
                "&:hover": {
                  backgroundColor: "#00000025",
                },
                my: -0.5,
                ml: -0.5,
              }}
              onClick={handleSwitchMeshedGearDirection}
              title="Inverser la direction"
              size="small"
            >
              <DirectionIcon
                fontSize="small"
                color="secondary"
                sx={{ mx: -0.1, my: -0.4 }}
              />
            </IconButton>
          )}
          <IconButton
            sx={{
              borderRadius: 5,
              "&:hover": {
                backgroundColor: "#00000025",
              },
              my: -0.5,
              ml: -0.5,
            }}
            onClick={handleDisconnect}
            title="Déconnecter"
            size="small"
          >
            <LinkOffIcon
              sx={{ mx: -0.1, my: -0.4 }}
              fontSize="small"
              color="error"
            />
          </IconButton>
        </>
      }
    ></ElementDisplay>
  );
};

export default Connection;
