/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, Divider, List, ListItem } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { MechanicalElement } from "../../types/element";
import VectorInput from "./components/VectorInput";
import GroundSwitch from "./components/GroundSwitch";
import BeltTensionSwitch from "./components/BeltTensionSwitch";
import {
  CanvasState,
  Action,
  Mechanism,
  ActionBundleType,
  ZERO,
} from "../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import { delete_element } from "./../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";
import { element_to_hovered_part } from "../mechanical-canvas/utils";
import React from "react";

interface ElementPropertiesProps {
  element: MechanicalElement | undefined;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  mechanism: Mechanism;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  applyActions,
  mechanism,
}) => {
  const handleMouseEnter = (el: MechanicalElement) => {
    setHoveredPart(element_to_hovered_part(el, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  if (!element) {
    const hasElements = mechanism.mechanicalElements.length > 0;
    return (
      <Box>
        <Box sx={{ textAlign: "center", p: 4, pb: hasElements ? 2 : 4 }}>
          <Box sx={{ fontSize: "0.875rem", color: "text.disabled" }}>
            Sélectionnez un élément pour voir ses propriétés
          </Box>
        </Box>
        {hasElements && (
          <List
            sx={{
              display: "flex",
              alignItems: "center",
              flexDirection: "column",
              mx: 2,
              my: 1,
            }}
          >
            {mechanism.mechanicalElements.map((element, index) => (
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
                  <Box border={2} borderColor={"#00000025"} borderRadius={5}>
                    <ElementDisplay
                      element={element}
                      setHoveredPart={setHoveredPart}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                      size="medium"
                      editable={true}
                    ></ElementDisplay>
                  </Box>

                  <IconButton
                    color="error"
                    onMouseEnter={() => handleMouseEnter(element)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() =>
                      applyActions(
                        [{ type: "DeleteElement", element }],
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
          </List>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          m: 1,
        }}
      >
        <ElementDisplay
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="large"
          editable={true}
        ></ElementDisplay>

        {"isGrounded" in element && element.type !== "mass" && (
          <GroundSwitch
            grounded={element.isGrounded}
            setGround={(grounded) =>
              applyActions(
                [{ type: "GroundNode", id: element.id, grounded }],
                "Other",
              )
            }
          />
        )}
        {element.type === "belt" && (
          <BeltTensionSwitch
            tightened={element.tight}
            setTight={(tightened) =>
              applyActions(
                [
                  {
                    type: "TightenBelt",
                    id: element.id,
                    tightened,
                  },
                ],
                "Other",
              )
            }
          />
        )}
        {element.type === "mass" && (
          <NumberInput
            label="kg"
            value={element.mass}
            onChange={(mass) =>
              applyActions(
                [
                  {
                    type: "ChangeMass",
                    id: element.id,
                    delta: mass - element.mass,
                  },
                ],
                "ChangeConstant",
              )
            }
            accent={true}
          />
        )}
        {element.type === "spring" && (
          <NumberInput
            label="N/m"
            value={element.stiffness}
            onChange={(stiffness) =>
              applyActions(
                [
                  {
                    type: "ChangeStiffness",
                    id: element.id,
                    delta: stiffness - element.stiffness,
                  },
                ],
                "ChangeConstant",
              )
            }
            accent={true}
          />
        )}
        {element.type === "damper" && (
          <NumberInput
            label="N·s/m"
            value={element.damping}
            onChange={(damping) =>
              applyActions(
                [
                  {
                    type: "ChangeDamping",
                    id: element.id,
                    delta: damping - element.damping,
                  },
                ],
                "ChangeConstant",
              )
            }
            accent={true}
          />
        )}
        <IconButton
          color="error"
          onClick={() =>
            applyActions(
              delete_element(
                element.id,
                mechanism.mechanicalElements,
                mechanism.constraintElements,
              ),
              "Other",
            )
          }
          title="Supprimer"
          onMouseEnter={(_e) => handleMouseEnter(element)}
          onMouseLeave={handleMouseLeave}
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      <Divider sx={{ my: 1 }} />

      {"position" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            m: 1,
          }}
        >
          <VectorInput
            x={element.position.x}
            y={element.position.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveNode",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.position,
                  },
                ],
                "MoveElement",
              )
            }
          />
          {element.type === "gear" && (
            <NumberInput
              value={element.radius}
              onChange={(radius) => {
                applyActions(
                  [
                    {
                      type: "ChangeGearRadius",
                      id: element.id,
                      newRadius: radius,
                      oldRadius: element.radius,
                    },
                  ],
                  "MoveElement",
                );
              }}
              label="Rayon"
              large={true}
            />
          )}
        </Box>
      )}

      {"positionStart" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            m: 1,
          }}
        >
          <VectorInput
            x={element.positionStart.x}
            y={element.positionStart.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveEdgeStart",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.positionStart,
                  },
                ],
                "MoveElement",
              )
            }
          />
          <NumberInput
            value={element.positionStart.distance_to(element.positionEnd)}
            onChange={(length) => {
              const linkedDim = mechanism.constraintElements.find(
                (c) =>
                  c.type === "dimension-edge" && c.edgeID === element.id,
              );
              if (linkedDim && linkedDim.type === "dimension-edge") {
                applyActions(
                  [
                    {
                      type: "ChangeDimensionEdgeValue",
                      id: linkedDim.id,
                      newValue: length,
                      oldValue: linkedDim.value,
                    },
                  ],
                  "ChangeDimension",
                );
              } else {
                applyActions(
                  [
                    {
                      type: "ChangeEdgeLength",
                      id: element.id,
                      newLength: length,
                      oldLength: element.positionStart.distance_to(
                        element.positionEnd,
                      ),
                    },
                  ],
                  "MoveElement",
                );
              }
            }}
            large={true}
            label="Longueur"
          />
          <VectorInput
            x={element.positionEnd.x}
            y={element.positionEnd.y}
            setPos={(pos) =>
              applyActions(
                [
                  {
                    type: "MoveEdgeEnd",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: element.positionEnd,
                  },
                ],
                "MoveElement",
              )
            }
          />
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      {(element.type === "beam" ||
        element.type === "belt" ||
        element.type === "damper" ||
        element.type === "gear" ||
        element.type === "join" ||
        element.type === "mass" ||
        element.type === "pivot" ||
        element.type === "slidep" ||
        element.type === "slider" ||
        element.type === "spring") && (
        <ConnectionsProperties
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          mechanism={mechanism}
        ></ConnectionsProperties>
      )}
    </Box>
  );
};

export default ElementProperties;
