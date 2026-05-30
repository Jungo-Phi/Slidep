import React, { useState } from "react";
import { Box } from "@mui/material";
import { ID, MechanicalElement } from "../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ConnectsActionType,
  ActionBundleType,
} from "../../types";
import { ConnectionsContainer } from "./components/ConnectionsContainer";
import { HoveredPart } from "../../types/hovered-part";

interface ConnectionsPropertiesProps {
  element: MechanicalElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
  mechanism: Mechanism;
}

export const ConnectionsProperties: React.FC<ConnectionsPropertiesProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  updateMechanism,
  mechanism,
}) => {
  const [draggedItem, setDraggedItem] = useState<{
    id: ID;
    index: number;
    sourceType: ConnectsActionType;
  } | null>(null);

  switch (element.type) {
    case "pivot":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsRotatingEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "slider":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsParentBeam"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "slidep":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsParentBeam"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsRotatingEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "join":
    case "mass":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "gear":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "space-evenly",
              alignItems: "center",
              flexDirection: "row",
            }}
          >
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedEdges"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsRotatingEdges"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "space-evenly",
              alignItems: "center",
              flexDirection: "row",
            }}
          >
            <ConnectionsContainer
              element={element}
              containerType="ConnectsMeshedGears"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedGears"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
          </Box>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedBelt"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "beam":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "space-evenly",
              alignItems: "center",
              flexDirection: "row",
            }}
          >
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeStart"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeEnd"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
          </Box>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "spring":
    case "damper":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodeStart"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodeEnd"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
    case "belt":
      return (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "space-evenly",
              alignItems: "center",
              flexDirection: "row",
            }}
          >
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeStart"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeEnd"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              updateMechanism={updateMechanism}
              mechanism={mechanism}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
            />
          </Box>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
          />
        </Box>
      );
  }
};

export default ConnectionsProperties;
