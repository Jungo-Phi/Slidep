import React from "react";
import { Box } from "@mui/material";
import { MechanicalElement } from "../../types/element";
import { CanvasState, Action, Mechanism, ActionBundleType } from "../../types";
import { ConnectionsContainer } from "./components/ConnectionsContainer";
import { HoveredPart } from "../../types/hovered-part";

interface ConnectionsPropertiesProps {
  element: MechanicalElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
}

export const ConnectionsProperties: React.FC<ConnectionsPropertiesProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
}) => {
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
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
            flexDirection: "column",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsParentBeam"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
            flexDirection: "column",
          }}
        >
          <ConnectionsContainer
            element={element}
            containerType="ConnectsParentBeam"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsRotatingEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </Box>
      );
    case "gear": {
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
            containerType="ConnectsParentAxle"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedBelt"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsMeshedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </Box>
      );
    }
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
              applyActions={applyActions}
              mechanism={mechanism}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeEnd"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          </Box>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodeEnd"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
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
              applyActions={applyActions}
              mechanism={mechanism}
            />
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeEnd"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          </Box>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </Box>
      );
  }
};

export default ConnectionsProperties;
