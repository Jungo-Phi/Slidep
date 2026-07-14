import React, { useRef } from "react";
import { Box, Typography, List, ListItem } from "@mui/material";
import { MechanicalElement } from "../../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ConnectsActionType,
  ActionBundleType,
} from "../../../types";
import Connection from "./ConnectionComponent";
import { get_connections } from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";

const CONTAINER_NAMES: Record<ConnectsActionType, string> = {
  ConnectsAttachedBelt: "Belt",
  ConnectsAttachedGears: "Gears",
  ConnectsFixedEdges: "Fixed edges",
  ConnectsParentBeam: "Parent",
  ConnectsFixedNodeStart: "Start node",
  ConnectsFixedNodeEnd: "End node",
  ConnectsParentAxle: "Axle",
  ConnectsRotatingEdges: "Rotating edges",
  ConnectsFixedNodesBody: "Body nodes",
  ConnectsMeshedGears: "Meshed gears",
  ConnectsFixedGears: "Fixed gears",
};

interface ConnectionsContainerProps {
  element: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
}

export const ConnectionsContainer: React.FC<ConnectionsContainerProps> = ({
  element,
  containerType,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
}) => {
  const dragImageRef = useRef<HTMLLIElement>(null);

  const isListContainer =
    containerType === "ConnectsFixedEdges" ||
    containerType === "ConnectsRotatingEdges" ||
    containerType === "ConnectsFixedNodesBody" ||
    containerType === "ConnectsMeshedGears" ||
    containerType === "ConnectsAttachedGears" ||
    containerType === "ConnectsFixedGears";
  const connections = get_connections(element, containerType);
  const containerName =
    containerType === "ConnectsFixedNodeStart" &&
    element.type === "belt" &&
    element.tight
      ? "Jonction"
      : containerType === "ConnectsFixedNodesBody" && element.type === "gear"
        ? "Fixed nodes"
        : CONTAINER_NAMES[containerType];

  return (
    <Box sx={{ display: "contents" }}>
      <Typography variant="subtitle2">{containerName}</Typography>

      <Box
        sx={{
          minWidth: isListContainer ? 96 : 88,
          minHeight: isListContainer ? 36 : 28,
          borderRadius: isListContainer ? 2.4 : 3,
          padding: "2px",
          backgroundColor: "background.sunken",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isListContainer && (
          <List disablePadding>
            {connections.map((connectedId, index) => (
              <React.Fragment key={index}>
                <ListItem ref={dragImageRef} disablePadding>
                  <Connection
                    element={element}
                    connectedElement={
                      mechanism.mechanicalElements.find(
                        (element: MechanicalElement) =>
                          element.id === connectedId,
                      ) as MechanicalElement
                    }
                    containerType={containerType}
                    setHoveredPart={setHoveredPart}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    mechanism={mechanism}
                  />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
        {connections.length > 0 && !isListContainer && (
          <ListItem ref={dragImageRef} disablePadding>
            <Connection
              element={element}
              connectedElement={
                mechanism.mechanicalElements.find(
                  (element: MechanicalElement) => element.id === connections[0],
                ) as MechanicalElement
              }
              containerType={containerType}
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          </ListItem>
        )}
        {connections.length === 0 && (
          <Typography variant="caption" color="textDisabled">
            {`Pas d'élément${isListContainer ? "s" : ""}`}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default ConnectionsContainer;
