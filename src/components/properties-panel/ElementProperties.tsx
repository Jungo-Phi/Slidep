/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, Divider, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  MechanicalElement,
  shown_element_name,
  UnionElement,
} from "../../types/element";
import VectorInput from "./components/VectorInput";
import GroundSwitch from "./components/GroundSwitch";
import BeltTensionSwitch from "./components/BeltTensionSwitch";
import LockableNumberInput from "./components/LockableNumberInput";
import { CanvasState, Action, Mechanism, ActionBundleType } from "../../types";
import { get_element_icon } from "../element-palette/elementIcon";
import ConnectionsProperties from "./ConnectionsProperties";
import {
  delete_element,
  get_mechanical_element_from_id,
} from "./../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../types/hovered-part";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";

interface ElementPropertiesProps {
  element: UnionElement;
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
        >
          <DeleteIcon />
        </IconButton>
      </Box>

      <Divider sx={{ my: 2 }} />

      {"value" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <NumberInput
            value={element.value}
            onChange={(value: number) =>
              updateMechanism(
                [
                  {
                    type: "ChangeDimensionEdgeValue",
                    id: element.id,
                    newValue: value,
                    oldValue: element.value,
                  },
                ],
                "ChangeDimension",
              )
            }
            onIncrement={() =>
              updateMechanism(
                [
                  {
                    type: "ChangeDimensionEdgeValue",
                    id: element.id,
                    newValue: element.value + 1,
                    oldValue: element.value,
                  },
                ],
                "ChangeDimension",
              )
            }
            onDecrement={() =>
              updateMechanism(
                [
                  {
                    type: "ChangeDimensionEdgeValue",
                    id: element.id,
                    newValue: element.value - 1,
                    oldValue: element.value,
                  },
                ],
                "ChangeDimension",
              )
            }
            label="Value" //"Value"
          />
        </Box>
      )}

      {"edgeID" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Divider sx={{ my: 2 }} />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              pr: 0.5,
            }}
            border={1}
            borderColor={"#00000025"}
            borderRadius={2}
          >
            <IconButton title="Select" size="small" sx={{ my: -2 }}>
              <Box
                component="img"
                src={get_element_icon(
                  get_mechanical_element_from_id(
                    element.edgeID,
                    mechanism.mechanicalElements,
                  ).type,
                )}
                alt={
                  get_mechanical_element_from_id(
                    element.edgeID,
                    mechanism.mechanicalElements,
                  ).type
                }
                sx={{
                  width: 24,
                  height: 24,
                  display: "block",
                  mx: -0.25,
                  my: -0.75,
                }}
              />
            </IconButton>

            <Box>
              <Typography variant={"body2"} fontWeight={500}>
                {shown_element_name(
                  get_mechanical_element_from_id(
                    element.edgeID,
                    mechanism.mechanicalElements,
                  ),
                )}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

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
            label="" //"Position"
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
            <LockableNumberInput
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
              onIncrement={() =>
                updateMechanism(
                  [
                    {
                      type: "ChangeEdgeLength",
                      id: element.id,
                      newLength:
                        element.positionStart.distance_to(element.positionEnd) +
                        1,
                      oldLength: element.positionStart.distance_to(
                        element.positionEnd,
                      ),
                    },
                  ],
                  "ChangeDimension",
                )
              }
              onDecrement={() =>
                updateMechanism(
                  [
                    {
                      type: "ChangeEdgeLength",
                      id: element.id,
                      newLength:
                        element.positionStart.distance_to(element.positionEnd) -
                        1,
                      oldLength: element.positionStart.distance_to(
                        element.positionEnd,
                      ),
                    },
                  ],
                  "ChangeDimension",
                )
              }
              lockable={true}
              locked={false} // TODO : connect to a DimensionEdge (if not belt)
              onToggleLock={() => {}}
              width={120}
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
              <LockableNumberInput
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
                onIncrement={() =>
                  updateMechanism(
                    [{ type: "ChangeMass", id: element.id, delta: 1 }],
                    "ChangeConstant",
                  )
                }
                onDecrement={() =>
                  updateMechanism(
                    [{ type: "ChangeMass", id: element.id, delta: -1 }],
                    "ChangeConstant",
                  )
                }
                lockable={false}
                locked={false}
                onToggleLock={() => {}}
                width={120}
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
              <LockableNumberInput
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
                onIncrement={() =>
                  updateMechanism(
                    [
                      {
                        type: "ChangeGearRadius",
                        id: element.id,
                        newRadius: element.radius + 1,
                        oldRadius: element.radius,
                      },
                    ],
                    "MoveElement",
                  )
                }
                onDecrement={() =>
                  updateMechanism(
                    [
                      {
                        type: "ChangeGearRadius",
                        id: element.id,
                        newRadius: element.radius - 1,
                        oldRadius: element.radius,
                      },
                    ],
                    "MoveElement",
                  )
                }
                lockable={false}
                locked={false}
                onToggleLock={() => {}}
                width={120}
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
              <LockableNumberInput
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
                onIncrement={() =>
                  updateMechanism(
                    [{ type: "ChangeStiffness", id: element.id, delta: 1 }],
                    "ChangeConstant",
                  )
                }
                onDecrement={() =>
                  updateMechanism(
                    [{ type: "ChangeStiffness", id: element.id, delta: -1 }],
                    "ChangeConstant",
                  )
                }
                lockable={false}
                locked={false}
                onToggleLock={() => {}}
                width={120}
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
              <LockableNumberInput
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
                onIncrement={() =>
                  updateMechanism(
                    [{ type: "ChangeDamping", id: element.id, delta: 1 }],
                    "ChangeConstant",
                  )
                }
                onDecrement={() =>
                  updateMechanism(
                    [{ type: "ChangeDamping", id: element.id, delta: -1 }],
                    "ChangeConstant",
                  )
                }
                lockable={false}
                locked={false}
                onToggleLock={() => {}}
                width={120}
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
