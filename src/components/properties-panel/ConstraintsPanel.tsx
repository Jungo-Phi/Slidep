/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, List, Typography, ListItem } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
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
import { get_mechanical_element_from_id } from "../mechanical-canvas/connect-actions";
import { COLORS } from "../../constants/rendering-specs";
import React from "react";
import RatioInput from "./components/RatioInput";

interface ConstraintsPanelProps {
  constraintID: ID;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
  mechanism: Mechanism;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = ({
  constraintID,
  setHoveredPart,
  setCanvasState,
  updateMechanism,
  mechanism,
}) => {
  const handleMouseEnter = (constraint: ConstraintElement) => {
    const hoveredPart: HoveredPart = {
      type: "Node",
      position: constraint.position,
      id: constraint.id,
      beamBodyHover: false,
    };
    setHoveredPart(hoveredPart);
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  return (
    <Box>
      <Typography variant="body1" fontWeight={500} marginLeft={1}>
        Contraintes
      </Typography>

      <List
        sx={{
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        {mechanism.constraintElements.map((constraint, index) => (
          <React.Fragment key={index}>
            <ListItem disablePadding>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  bgcolor: COLORS.BACKGROUND,
                }}
                border={2}
                borderColor={"#00000025"}
                borderRadius={5}
                marginY={"-1px"}
              >
                <ElementDisplay
                  element={constraint}
                  size="medium"
                  bold={constraint.id === constraintID}
                  setHoveredPart={setHoveredPart}
                  setCanvasState={setCanvasState}
                  updateMechanism={updateMechanism}
                ></ElementDisplay>

                {(() => {
                  switch (constraint.type) {
                    case "dimension-edge":
                    case "dimension-node-to-node":
                    case "dimension-edge-to-node":
                    case "dimension-angle":
                    case "dimension-radius":
                      return (
                        <NumberInput
                          value={constraint.value}
                          onChange={(value: number) =>
                            updateMechanism(
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
                        />
                      );
                    case "gear-ratio":
                      return (
                        <RatioInput
                          value={constraint.value}
                          onChange={(value: number) =>
                            updateMechanism(
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
                  sx={{
                    borderRadius: 5,
                    "&:hover": {
                      backgroundColor: "#00000025",
                    },
                    my: -0.5,
                  }}
                  onMouseEnter={() => handleMouseEnter(constraint)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() =>
                    updateMechanism(
                      [{ type: "DeleteElement", element: constraint }],
                      "Other",
                    )
                  }
                  title="Supprimer"
                >
                  <DeleteIcon sx={{ width: 18, height: 18 }} color="error" />
                </IconButton>
              </Box>
            </ListItem>
          </React.Fragment>
        ))}
        {mechanism.constraintElements.length === 0 && (
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
            Pas de contraintes
          </Typography>
        )}
      </List>
    </Box>
  );
};

export default ConstraintsPanel;
