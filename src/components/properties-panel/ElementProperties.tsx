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
import { element_to_hovered_part } from "../mechanical-canvas/utils";

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
    setHoveredPart(element_to_hovered_part(element, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          my: -1,
        }}
      >
        <ElementDisplay
          element={element}
          size="large"
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          updateMechanism={updateMechanism}
        ></ElementDisplay>

        {"isGrounded" in element && element.type !== "mass" && (
          <GroundSwitch
            grounded={element.isGrounded}
            setGround={(grounded) =>
              updateMechanism(
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
        {element.type === "mass" && (
          <NumberInput
            label="kg"
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
            accent={true}
          />
        )}
        {element.type === "spring" && (
          <NumberInput
            label="N/m"
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
            accent={true}
          />
        )}
        {element.type === "damper" && (
          <NumberInput
            label="N·s/m"
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
            accent={true}
          />
        )}
        <IconButton
          color="error"
          onClick={() =>
            updateMechanism(
              delete_element(
                element.id,
                mechanism.mechanicalElements,
                mechanism.constraintElements,
              ),
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

      {"position" in element && (
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
          />
          {element.type === "gear" && (
            <NumberInput
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
          />
          <NumberInput
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
            label="Longueur"
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
          />
        </Box>
      )}

      <Divider sx={{ mt: 2, mb: 1 }} />

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
          updateMechanism={updateMechanism}
          mechanism={mechanism}
        ></ConnectionsProperties>
      )}
    </Box>
  );
};

export default ElementProperties;
