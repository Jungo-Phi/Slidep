import React, { useRef, useState } from "react";
import { Box, Typography, List, ListItem } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { ID, MechanicalElement } from "../../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ConnectsActionType,
  ActionBundleType,
} from "../../../types";
import Connection from "./ConnectionComponent";
import {
  connect_element,
  disconnect_element,
  get_connections,
} from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";

const EmptyContainer: React.FC = ({}) => {
  return (
    <Typography
      variant="caption"
      color="textDisabled"
      sx={{
        fontWeight: "500",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      Pas d'éléments
    </Typography>
  );
};

interface ConnectionsContainerProps {
  element: MechanicalElement;
  containerType: ConnectsActionType;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
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
  applyActions,
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

    applyActions(actions, "Connects");
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const dragImageRef = useRef<HTMLLIElement>(null);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "inherit",
        flexDirection: "column",
      }}
    >
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

      <Box
        sx={{
          minWidth: 128,
          bgcolor: "#0001",
        }}
        border={1}
        borderRadius={
          containerType === "ConnectsParentBeam" ||
          containerType === "ConnectsFixedNodeStart" ||
          containerType === "ConnectsFixedNodeEnd" ||
          containerType === "ConnectsParentAxle" ||
          containerType === "ConnectsAttachedBelt"
            ? 3
            : 2.4
        }
        borderColor={"#00000000"}
        paddingLeft={0.2}
        paddingRight={
          containerType === "ConnectsParentBeam" ||
          containerType === "ConnectsFixedNodeStart" ||
          containerType === "ConnectsFixedNodeEnd" ||
          containerType === "ConnectsAttachedBelt"
            ? 0
            : 0.8
        }
        onDragOver={(e) => handleDragOver(e)}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
      >
        {(() => {
          switch (containerType) {
            case "ConnectsParentBeam":
            case "ConnectsFixedNodeStart":
            case "ConnectsFixedNodeEnd":
            case "ConnectsParentAxle":
            case "ConnectsAttachedBelt":
              const connections = get_connections(element, containerType);
              if (connections.length === 0) {
                return <EmptyContainer />;
              }
              const connectedId = connections[0];
              return (
                <ListItem ref={dragImageRef} disablePadding sx={{ my: -0.12 }}>
                  <Box
                    draggable
                    onDragStart={(e) => {
                      if (dragImageRef.current) {
                        e.dataTransfer.setDragImage(
                          dragImageRef.current,
                          8,
                          12,
                        );
                      }
                      handleDragStart(connectedId, 0, containerType);
                    }}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 24,
                      color: "text.disabled",
                      flexShrink: 0,
                      borderRadius: 1,
                      "&:hover": {
                        backgroundColor: "#00000025",
                      },
                      my: -1,
                      mr: "-2px",
                    }}
                  >
                    <DragIndicatorIcon />
                  </Box>
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
                        <ListItem
                          ref={dragImageRef}
                          disablePadding
                          sx={{ my: -0.12 }}
                        >
                          <Box
                            draggable
                            onDragStart={(e) => {
                              if (dragImageRef.current) {
                                e.dataTransfer.setDragImage(
                                  dragImageRef.current,
                                  8,
                                  12,
                                );
                              }
                              handleDragStart(
                                connectedId,
                                index,
                                containerType,
                              );
                            }}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 18,
                              height: 24,
                              color: "text.disabled",
                              flexShrink: 0,
                              borderRadius: 1,
                              "&:hover": {
                                backgroundColor: "#00000025",
                              },
                              my: -1,
                              mr: "-2px",
                            }}
                          >
                            <DragIndicatorIcon />
                          </Box>
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
      </Box>
    </Box>
  );
};

export default ConnectionsContainer;
