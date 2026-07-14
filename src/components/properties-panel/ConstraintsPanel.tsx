/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, List, ListItem } from "@mui/material";
import { Delete } from "@mui/icons-material";
import { ConstraintElement, ID } from "../../types/element";
import {
  CanvasState,
  Action,
  Mechanism,
  ActionBundleType,
  ZERO,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";
import React from "react";
import RatioInput from "./components/RatioInput";
import { element_to_hovered_part } from "../canvas/utils";

interface ConstraintsPanelProps {
  constraintID: ID;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = ({
  constraintID,
  setHoveredPart,
  setCanvasState,
  applyActions: applyActions,
  mechanism,
}) => {
  const handleMouseEnter = (constraint: ConstraintElement) => {
    setHoveredPart(element_to_hovered_part(constraint, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  return (
    <Box
      sx={{
        borderRadius: 3,
        margin: 2,
        backgroundColor: "background.sunken",
      }}
    >
      <List
        disablePadding
        sx={{
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          width: "100%",
        }}
      >
        {mechanism.constraintElements.map((constraint, index) => (
          <React.Fragment key={index}>
            <ListItem disablePadding>
              <Box
                sx={{
                  border: constraint.id === constraintID ? 1 : 0,
                  borderColor: "divider",
                  borderRadius: 5,
                  width: "100%",
                }}
              >
                <ElementDisplay
                  element={constraint}
                  setHoveredPart={setHoveredPart}
                  setCanvasState={setCanvasState}
                  applyActions={applyActions}
                  size="medium"
                  editable={true}
                  trailingControls={
                    <>
                      {(() => {
                        switch (constraint.type) {
                          case "dimension-edge":
                          case "dimension-node-to-node":
                          case "dimension-edge-to-node":
                          case "dimension-angle":
                          case "dimension-radius":
                          case "dimension-belt":
                            return (
                              <NumberInput
                                value={constraint.value}
                                onChange={(value: number) =>
                                  applyActions(
                                    [
                                      {
                                        type: "ChangeDimensionEdgeValue",
                                        id: constraint.id,
                                        newValue: value,
                                        oldValue: constraint.value,
                                      },
                                    ],
                                    "ChangeDimension",
                                  )
                                }
                                label=""
                                suffix={
                                  constraint.type === "dimension-angle"
                                    ? "°"
                                    : undefined
                                }
                                signed={false}
                              />
                            );
                          case "gear-ratio":
                            return (
                              <RatioInput
                                value={constraint.value}
                                onChange={(value: number) =>
                                  applyActions(
                                    [
                                      {
                                        type: "ChangeGearRatioValue",
                                        id: constraint.id,
                                        newValue: value,
                                        oldValue: constraint.value,
                                      },
                                    ],
                                    "ChangeDimension",
                                  )
                                }
                              />
                            );
                        }
                      })()}
                      <IconButton
                        color="error"
                        onMouseEnter={() => handleMouseEnter(constraint)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() =>
                          applyActions(
                            [{ type: "DeleteElement", element: constraint }],
                            "Other",
                          )
                        }
                        title="Supprimer"
                        sx={{ borderRadius: 3 }}
                      >
                        <Delete sx={{ width: 20, height: 20 }} />
                      </IconButton>
                    </>
                  }
                />
              </Box>
            </ListItem>
          </React.Fragment>
        ))}
      </List>
      {mechanism.constraintElements.length === 0 && (
        <Box
          sx={{
            padding: 2,
            textAlign: "center",
            fontSize: "0.875rem",
            color: "text.disabled",
          }}
        >
          Pas encore de contraintes
        </Box>
      )}
    </Box>
  );
};

export default ConstraintsPanel;
