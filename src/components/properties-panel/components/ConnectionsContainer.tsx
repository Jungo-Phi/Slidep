import React, { useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Card,
} from "@mui/material";
import { ID, MechanicalElement } from "../../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ConnectsActionType,
} from "../../../types";
import Connection from "./ConnectionComponent";
import {
  connect_element,
  disconnect_element,
  get_connections,
} from "../../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";

const EmptyContainer: React.FC = ({}) => {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontStyle: "italic" }}
    >
      No elements
    </Typography>
  );
};

interface ConnectionsContainerProps {
  element: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (actions: Action[]) => void;
  mechanism: Mechanism;
  draggedItem: {
    id: ID;
    index: number;
    sourceType: ConnectsActionType;
  } | null;
  setDraggedItem: (
    item: {
      id: ID;
      index: number;
      sourceType: ConnectsActionType;
    } | null,
  ) => void;
}

export const ConnectionsContainer: React.FC<ConnectionsContainerProps> = ({
  element,
  containerType,
  setHoveredPart,
  setCanvasState,
  updateMechanism,
  mechanism,
  draggedItem,
  setDraggedItem,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (
    id: ID,
    index: number,
    sourceType: ConnectsActionType,
  ) => {
    setDraggedItem({ id, index, sourceType });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Determine insertion position based on vertical cursor position
    // If hovering over box container, calculate insertion position based on cursor height
    const container = e.currentTarget as HTMLElement;
    const list = container.querySelector("ul");
    if (list) {
      const listItems = list.querySelectorAll("li");
      const items = get_connections(element, containerType);

      let insertIndex = 0;
      if (typeof items === "number") {
        // TODO <- Remove this shit
        insertIndex = 1;
      } else if (typeof items === "undefined") {
        insertIndex = 1;
      } else {
        insertIndex = items.length;
      }

      // Iterate over list items to find insertion position
      for (let i = 0; i < listItems.length; i++) {
        const rect = listItems[i].getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        if (y < height / 2) {
          insertIndex = i;
          break;
        }
      }

      setDragOverIndex(insertIndex);
    } else {
      // If no list exists (empty box)
      setDragOverIndex(0);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (draggedItem === null || dragOverIndex === null) {
      setDraggedItem(null);
      setDragOverIndex(null);
      return;
    }
    const draggedElement = mechanism.mechanicalElements.find(
      (element: MechanicalElement) => element.id === draggedItem.id,
    ) as MechanicalElement;
    let removeIndex = draggedItem.index;
    let insertIndex = dragOverIndex;
    let actions: Action[] = [];

    if (
      draggedItem.sourceType === containerType &&
      removeIndex < dragOverIndex
    ) {
      // Moving within the same container
      // Adjust insert index if we removed item before the insert position
      insertIndex = dragOverIndex - 1;
    }
    // Remove from source container
    actions.push(
      disconnect_element(
        element,
        draggedElement,
        draggedItem.sourceType,
        mechanism.mechanicalElements,
      ),
    );
    // Add to target container
    actions.push(
      connect_element(
        element,
        draggedElement,
        containerType,
        insertIndex,
        //mechanism.mechanicalElements,
      ),
    );

    updateMechanism(actions);
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  return (
    <Box>
      <Typography variant="subtitle2">
        {containerType
          .replace("Connects", "")
          .split("N")
          .join(" N")
          .split("E")
          .join(" E")
          .split("B")
          .join(" B")
          .split("G")
          .join(" G")
          .split("S")
          .join(" S")}
      </Typography>
      <Card
        elevation={2}
        sx={{
          p: 1,
          minWidth: 150,
        }}
        onDragOver={(e) => handleDragOver(e)}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
        {(() => {
          switch (containerType) {
            case "ConnectsParentBeam":
            case "ConnectsFixedNodeStart":
            case "ConnectsFixedNodeEnd":
            case "ConnectsAttachedBelt":
              const connections = get_connections(element, containerType);
              if (connections.length === 0) {
                return <EmptyContainer />;
              }
              const connectedId = connections[0];
              return (
                <ListItemButton
                  draggable
                  onDragStart={() =>
                    handleDragStart(connectedId, 0, containerType)
                  }
                  sx={{
                    borderRadius: 1,
                    "&:hover": {
                      backgroundColor: "#00000025",
                    },
                    height: 20,
                  }}
                >
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
                    updateMechanism={updateMechanism}
                    mechanism={mechanism}
                  />
                </ListItemButton>
              );
            case "ConnectsFixedEdges":
            case "ConnectsRotatingEdges":
            case "ConnectsFixedNodesBody":
            case "ConnectsMeshedGears":
            case "ConnectsAttachedGears":
            case "ConnectsFixedGears":
              return (
                <List>
                  {get_connections(element, containerType).map(
                    (connectedId, index) => (
                      <React.Fragment key={index}>
                        {/* Insertion indicator above the item */}
                        {dragOverIndex === index && (
                          <Box
                            sx={{
                              height: 3,
                              backgroundColor: "primary.main",
                              my: 0.25,
                              borderRadius: 2,
                              boxShadow: "0 2px 4px rgba(33, 150, 243, 0.3)",
                            }}
                          />
                        )}
                        <ListItem disablePadding sx={{ mb: 0.5, p: 0 }}>
                          <ListItemButton
                            draggable
                            onDragStart={() =>
                              handleDragStart(connectedId, index, containerType)
                            }
                            sx={{
                              borderRadius: 1,
                              "&:hover": {
                                backgroundColor: "#00000025",
                              },
                              height: 20,
                            }}
                          >
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
                              updateMechanism={updateMechanism}
                              mechanism={mechanism}
                            />
                          </ListItemButton>
                        </ListItem>
                      </React.Fragment>
                    ),
                  )}
                  {/* Insertion indicator at the end of the list */}
                  {dragOverIndex ===
                    get_connections(element, containerType).length && (
                    <Box
                      sx={{
                        height: 3,
                        backgroundColor: "primary.main",
                        my: 0.25,
                        borderRadius: 2,
                        boxShadow: "0 2px 4px rgba(33, 150, 243, 0.3)",
                      }}
                    />
                  )}
                  {get_connections(element, containerType).length === 0 && (
                    <EmptyContainer />
                  )}
                </List>
              );
          }
        })()}
      </Card>
    </Box>
  );
};

export default ConnectionsContainer;
