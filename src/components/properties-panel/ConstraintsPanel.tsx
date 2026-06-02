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
import React from "react";
import RatioInput from "./components/RatioInput";
import { element_to_hovered_part } from "../mechanical-canvas/utils";

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
    setHoveredPart(element_to_hovered_part(constraint, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  return (
    <List
      sx={{
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {mechanism.constraintElements.map((constraint, index) => (
        <React.Fragment key={index}>
          <ListItem
            disablePadding
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              marginY: "-1px",
            }}
          >
            <Box
              border={2}
              borderColor={
                constraint.id === constraintID ? "#00000080" : "#00000025"
              }
              borderRadius={5}
            >
              <ElementDisplay
                element={constraint}
                size="medium"
                setHoveredPart={setHoveredPart}
                setCanvasState={setCanvasState}
                updateMechanism={updateMechanism}
              ></ElementDisplay>
            </Box>

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
                        constraint.type === "dimension-angle" ? "°" : undefined
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
              color="error"
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
              <DeleteIcon sx={{ width: 20, height: 20 }} />
            </IconButton>
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
  );
};

export default ConstraintsPanel;
