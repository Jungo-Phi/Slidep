import React from "react";
import { Box } from "@mui/material";
import { MechanicalElement, ID } from "../../types/element";
import { CanvasState, Action, Mechanism } from "../../types";
import { ConnectionsContainer } from "./components/ConnectionsContainer";
import { HoveredPart } from "../../types/hovered-part";

interface ConnectionsPropertiesProps {
  element: MechanicalElement;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
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
  hoveredPart,
  setHoveredPart,
  selectedIds,
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedGears"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedEdges"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsRotatingEdges"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedGears"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedBelt"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsMeshedGears"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodesBody"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodeEnd"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
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
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
          <ConnectionsContainer
            element={element}
            containerType="ConnectsFixedNodeEnd"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </ConnectionsGrid>
      );
    case "belt":
      return (
        <ConnectionsGrid>
          {element.closed ? (
            <ConnectionsContainer
              element={element}
              containerType="ConnectsFixedNodeStart"
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          ) : (
            <>
              <ConnectionsContainer
                element={element}
                containerType="ConnectsFixedNodeStart"
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
                mechanism={mechanism}
              />
              <ConnectionsContainer
                element={element}
                containerType="ConnectsFixedNodeEnd"
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
                mechanism={mechanism}
              />
            </>
          )}

          <ConnectionsContainer
            element={element}
            containerType="ConnectsAttachedGears"
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        </ConnectionsGrid>
      );
  }
};

export default ConnectionsProperties;
