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

/** Two-column grid: each ConnectionsContainer contributes a name cell and a
 * connections cell, so names and connections line up across containers. */
const ConnectionsGrid: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "max-content 1fr",
      columnGap: 2,
      rowGap: 1.5,
      alignItems: "center",
      justifyItems: "start",
      pl: 2,
    }}
  >
    {children}
  </Box>
);

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
        <ConnectionsGrid>
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
        </ConnectionsGrid>
      );
    case "slider":
      return (
        <ConnectionsGrid>
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
        </ConnectionsGrid>
      );
    case "slidep":
      return (
        <ConnectionsGrid>
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
        </ConnectionsGrid>
      );
    case "join":
    case "mass":
      return (
        <ConnectionsGrid>
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedEdges"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </ConnectionsGrid>
      );
    case "gear": {
      return (
        <ConnectionsGrid>
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
        </ConnectionsGrid>
      );
    }
    case "beam":
      return (
        <ConnectionsGrid>
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
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </ConnectionsGrid>
      );
    case "spring":
    case "damper":
      return (
        <ConnectionsGrid>
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
        </ConnectionsGrid>
      );
    case "belt":
      return (
        <ConnectionsGrid>
          {element.tight ? (
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeStart"
              setHoveredPart={setHoveredPart}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          ) : (
            <>
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
            </>
          )}

          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedGears"
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </ConnectionsGrid>
      );
  }
};

export default ConnectionsProperties;
