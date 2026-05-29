/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, Divider } from "@mui/material";
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

interface ElementPropertiesProps {
  element: MechanicalElement;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
  mechanism: Mechanism;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element,
  setHoveredPart,
  setCanvasState,
  updateMechanism,
  mechanism,
}) => {
  const handleMouseEnter = () => {
    let hoveredPart: HoveredPart;
    if ("radius" in element) {
      hoveredPart = {
        type: "GearTooth",
        position: element.position,
        id: element.id,
      };
    } else if ("position" in element) {
      hoveredPart = {
        type: "Node",
        position: element.position,
        id: element.id,
        beamBodyHover: false,
      };
    } else {
      hoveredPart = {
        type: "Edge",
        position: element.positionStart.lerp(element.positionEnd, 0.5),
        id: element.id,
        part: "body",
      };
    }
    setHoveredPart(hoveredPart);
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          my: -1,
        }}
      >
        <ElementDisplay
          element={element}
          size="medium"
          bold={false}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          updateMechanism={updateMechanism}
        ></ElementDisplay>
        <IconButton
          color="error"
          onClick={() =>
            updateMechanism(
              delete_element(element, mechanism.mechanicalElements),
              "Other",
            )
          }
          title="Supprimer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      <Divider sx={{ my: 2 }} />

      {"position" in element && "isGrounded" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            mb: -1,
          }}
        >
          <VectorInput
            x={element.position.x}
            y={element.position.y}
            setPos={(pos) =>
              updateMechanism(
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
            label=""
          />
          <GroundSwitch
            grounded={element.isGrounded}
            setGround={(grounded) =>
              updateMechanism(
                [{ type: "GroundNode", id: element.id, grounded }],
                "Other",
              )
            }
          />
        </Box>
      )}

      {"positionStart" in element && (
        <Box>
          <Box
            sx={{
              display: "flex",
              direction: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <VectorInput
              x={element.positionStart.x}
              y={element.positionStart.y}
              setPos={(pos) =>
                updateMechanism(
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
              label="" // "Start"
            />
            <VectorInput
              x={element.positionEnd.x}
              y={element.positionEnd.y}
              setPos={(pos) =>
                updateMechanism(
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
              label="" // "End"
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              direction: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.5,
              mt: 1,
            }}
          >
            <NumberInput
              label="Longueur"
              value={element.positionStart.distance_to(element.positionEnd)}
              onChange={(length) =>
                updateMechanism(
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
                  "ChangeDimension",
                )
              }
              large={true}
            />
            {element.type === "belt" && (
              <BeltTensionSwitch
                tightened={element.tight}
                setTight={(tightened) =>
                  updateMechanism(
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
          </Box>
        </Box>
      )}

      <Box>
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          {element.type === "mass" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                direction: "row",
                gap: 2,
                mt: 2,
              }}
            >
              <NumberInput
                label="Mass (kg)"
                value={element.mass}
                onChange={(mass) =>
                  updateMechanism(
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
                large={true}
              />
            </Box>
          )}
          {element.type === "gear" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                direction: "row",
                gap: 2,
                mt: 2,
              }}
            >
              <NumberInput
                label="Radius (kg)"
                value={element.radius}
                onChange={(radius) =>
                  updateMechanism(
                    [
                      {
                        type: "ChangeGearRadius",
                        id: element.id,
                        newRadius: radius,
                        oldRadius: element.radius,
                      },
                    ],
                    "MoveElement",
                  )
                }
                large={true}
              />
            </Box>
          )}
          {element.type === "spring" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                direction: "row",
                gap: 2,
                mt: 2,
              }}
            >
              <NumberInput
                label="Stifness (N/m)"
                value={element.stiffness}
                onChange={(stiffness) =>
                  updateMechanism(
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
                large={true}
              />
            </Box>
          )}
          {element.type === "damper" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                direction: "row",
                gap: 2,
                mt: 2,
              }}
            >
              <NumberInput
                label="Damping (N·s/m)"
                value={element.damping}
                onChange={(damping) =>
                  updateMechanism(
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
                large={true}
              />
            </Box>
          )}
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

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
        <Box>
          <ConnectionsProperties
            element={element}
            setHoveredPart={setHoveredPart}
            setCanvasState={setCanvasState}
            updateMechanism={updateMechanism}
            mechanism={mechanism}
          ></ConnectionsProperties>
        </Box>
      )}
    </Box>
  );
};

export default ElementProperties;
