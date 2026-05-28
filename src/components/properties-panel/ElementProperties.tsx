/**
 * ElementProperties component
 * Displays properties for element elements
 */

import { Box, IconButton, Divider, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { MechanicalElement, shown_element_name } from "../../types/element";
import VectorInput from "./components/VectorInput";
import GroundSwitch from "./components/GroundSwitch";
import BeltTensionSwitch from "./components/BeltTensionSwitch";
import LockableNumberInput from "./components/LockableNumberInput";
import { CanvasState, Action, Mechanism, ActionBundleType } from "../../types";
import { get_element_icon } from "../element-palette/elementIcon";
import ConnectionsProperties from "./ConnectionsProperties";
import { delete_element } from "./../mechanical-canvas/connect-actions";
import { HoveredPart } from "../../types/hovered-part";

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
  const icon = get_element_icon(element.type);

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            component="img"
            src={icon}
            alt={element.type}
            sx={{
              width: 32,
              height: 32,
              display: "block",
            }}
          />
          <Box>
            <Typography variant={"body1"} fontWeight={500}>
              {shown_element_name(element)}
            </Typography>
          </Box>
        </Box>
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

      {"position" in element && (
        <Box
          sx={{
            display: "flex",
            direction: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
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

      <Box>
        <ConnectionsProperties
          element={element}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          updateMechanism={updateMechanism}
          mechanism={mechanism}
        ></ConnectionsProperties>
      </Box>

      {element.type === "belt" && (
        <Box>
          <Typography>
            {element.attachedGearsIDs.map((id) => id + " ")}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ElementProperties;
