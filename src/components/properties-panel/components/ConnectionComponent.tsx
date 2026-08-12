import React from "react";
import {
  Action,
  CanvasState,
  ConnectsActionType,
  MechanicalElement,
  Mechanism,
} from "../../../types";
import { IconButton } from "@mui/material";
import { LinkOff, RotateLeft, RotateRight } from "@mui/icons-material";
import {
  disconnect_element,
  get_connection_pair_types,
  get_connections,
  open_belt,
} from "../../mechanism/connect-actions";
import { belt_junction_id } from "../../../utils/belt-rules";
import { HoveredPart } from "../../../types/hovered-part";
import { ID } from "../../../types/element";
import ElementDisplay from "./ElementDisplay";
import { t } from "../../../i18n";

interface ConnectionProps {
  element: MechanicalElement;
  connectedElement: MechanicalElement;
  containerType: ConnectsActionType;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
}

const Connection: React.FC<ConnectionProps> = ({
  element,
  connectedElement,
  containerType,
  hoveredPart,
  setHoveredPart,
  selectedIds,
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
            clockwise: !element.attachedGearsIDs[index].clockwise,
          },
        ],
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
            clockwise: !connectedElement.attachedGearsIDs[index].clockwise,
          },
        ],
      );
    }
  };

  // The belt–junction link of a closed belt, seen from either side. Its removal
  // opens the belt rather than detaching it: one terminal is freed and the loop
  // cleared, but the junction keeps the other terminal.
  const belt =
    element.type === "belt"
      ? element
      : connectedElement?.type === "belt"
        ? connectedElement
        : undefined;
  const junctionOf = belt === element ? connectedElement : element;
  const opensBelt =
    !!belt && belt.closed && belt_junction_id(belt) === junctionOf?.id;

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connectedElement) return;
    if (opensBelt && belt) {
      applyActions(open_belt(belt));
      return;
    }
    applyActions(
      [
        disconnect_element(
          element,
          connectedElement,
          containerType,
          mechanism.mechanicalElements,
        ),
        ...get_connection_pair_types(element.id, connectedElement).map(
          (pairType) =>
            disconnect_element(
              connectedElement,
              element,
              pairType,
              mechanism.mechanicalElements,
            ),
        ),
      ],
    );
  };

  const showDirectionButton =
    (connectedElement &&
      element.type === "belt" &&
      containerType === "ConnectsAttachedGears") ||
    containerType === "ConnectsAttachedBelt";
  let clockwise = false;
  if (showDirectionButton) {
    if (element.type === "belt") {
      clockwise =
        element.attachedGearsIDs[
          get_connections(element, "ConnectsAttachedGears").indexOf(
            connectedElement.id,
          )
        ].clockwise;
    } else if (connectedElement.type === "belt") {
      clockwise =
        connectedElement.attachedGearsIDs[
          get_connections(connectedElement, "ConnectsAttachedGears").indexOf(
            element.id,
          )
        ].clockwise;
    }
  }
  const DirectionIcon = clockwise ? RotateRight : RotateLeft;
  const showDisconnectButton =
    containerType !== "ConnectsParentAxle" &&
    containerType !== "ConnectsFixedGears";

  return (
    <ElementDisplay
      element={connectedElement}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={selectedIds}
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
                  backgroundColor: "action.hover",
                },
                my: -0.5,
                ml: -0.5,
              }}
              onClick={handleSwitchMeshedGearDirection}
              title={t("connection_flip")}
              size="small"
            >
              <DirectionIcon
                fontSize="small"
                color="secondary"
                sx={{ mx: -0.1, my: -0.4 }}
              />
            </IconButton>
          )}
          {showDisconnectButton && (
            <IconButton
              sx={{
                borderRadius: 5,
                my: -0.5,
                ml: -0.5,
              }}
              color="error"
              onClick={handleDisconnect}
              title={t(
                opensBelt ? "connection_open_belt" : "connection_disconnect",
              )}
              size="small"
            >
              <LinkOff sx={{ mx: -0.1, my: -0.4 }} fontSize="small" />
            </IconButton>
          )}
        </>
      }
    ></ElementDisplay>
  );
};

export default Connection;
