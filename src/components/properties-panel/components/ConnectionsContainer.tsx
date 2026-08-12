import React, { useRef } from "react";
import { Box, Typography, List, ListItem } from "@mui/material";
import { MechanicalElement } from "../../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ConnectsActionType,
} from "../../../types";
import Connection from "./ConnectionComponent";
import { get_connections } from "../../mechanism/connect-actions";
import { HoveredPart } from "../../../types/hovered-part";
import { ID } from "../../../types/element";
import { ordered_body_nodes } from "../element-order";
import { StringKey, t } from "../../../i18n";

const CONTAINER_NAME_KEYS: Record<ConnectsActionType, StringKey> = {
  ConnectsAttachedBelt: "slot_belt",
  ConnectsAttachedGears: "slot_gears",
  ConnectsFixedEdges: "slot_fixed_edges",
  ConnectsParentBeam: "slot_parent",
  ConnectsFixedNodeStart: "slot_start_node",
  ConnectsFixedNodeEnd: "slot_end_node",
  ConnectsParentAxle: "slot_axle",
  ConnectsRotatingEdges: "slot_rotating_edges",
  ConnectsFixedNodesBody: "slot_body_nodes",
  ConnectsMeshedGears: "slot_meshed_gears",
  ConnectsFixedGears: "slot_fixed_gears",
};

interface ConnectionsContainerProps {
  element: MechanicalElement;
  containerType: ConnectsActionType;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
}

export const ConnectionsContainer: React.FC<ConnectionsContainerProps> = ({
  element,
  containerType,
  hoveredPart,
  setHoveredPart,
  selectedIds,
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
  const stored = get_connections(element, containerType);
  const connections =
    containerType === "ConnectsFixedNodesBody"
      ? ordered_body_nodes(element, stored, mechanism.mechanicalElements)
      : stored;
  const containerName = t(
    containerType === "ConnectsFixedNodeStart" &&
      element.type === "belt" &&
      element.closed
      ? "slot_junction"
      : containerType === "ConnectsFixedNodesBody" && element.type === "gear"
        ? "slot_fixed_nodes"
        : CONTAINER_NAME_KEYS[containerType],
  );

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
            {connections.map((connectedId) => (
              <React.Fragment key={connectedId}>
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
                    hoveredPart={hoveredPart}
                    setHoveredPart={setHoveredPart}
                    selectedIds={selectedIds}
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
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          </ListItem>
        )}
        {connections.length === 0 && (
          <Typography variant="caption" color="textDisabled">
            {t("slot_empty")}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default ConnectionsContainer;
