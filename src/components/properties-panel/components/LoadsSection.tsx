import { Box, IconButton } from "@mui/material";
import { Delete, Public } from "@mui/icons-material";
import {
  Action,
  CanvasState,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  ID,
  LoadElement,
  LoadFrame,
  MechanicalElement,
  Point2,
  ZERO,
} from "../../../types";
import {
  frame2world_transform,
  world2frame_transform,
  node_candidate_edges,
} from "../../../utils/load-frame";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";
import ElementPicker from "./ElementPicker";
import NumberInput from "./NumberInput";
import SignedNumberInput from "./SignedNumberInput";
import { t } from "../../../i18n";
import { element_to_hovered_part } from "../../canvas/utils";

const to_deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;
const to_rad = (deg: number) => (deg * Math.PI) / 180;

/** Build a SetDistributedForce action from partial new values (rest kept). */
const change_distributed_force = (
  load: DistributedForceElement,
  next: Partial<{
    newDirection: Point2;
    newMagnitudeStart: number;
    newMagnitudeEnd: number;
  }>,
): Action => ({
  type: "ChangeDistributedForce",
  id: load.id,
  newDirection: next.newDirection ?? load.direction,
  oldDirection: load.direction,
  newMagnitudeStart: next.newMagnitudeStart ?? load.magnitudeStart,
  oldMagnitudeStart: load.magnitudeStart,
  newMagnitudeEnd: next.newMagnitudeEnd ?? load.magnitudeEnd,
  oldMagnitudeEnd: load.magnitudeEnd,
});

/**
 * Change a load's frame while preserving its visual direction: re-express the
 * stored vector/direction through the reference edge's current orientation so the
 * arrow doesn't jump — only its behaviour under motion changes.
 */
const frame_change_actions = (
  load: ForceElement | DistributedForceElement,
  newFrame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Action[] => {
  const actions: Action[] = [
    { type: "SetLoadFrame", id: load.id, newFrame, oldFrame: load.frame },
  ];
  if (load.type === "force") {
    const world = frame2world_transform(
      load.vector,
      load.frame,
      mechanicalElements,
    );
    actions.push({
      type: "ChangeForce",
      id: load.id,
      newVector: world2frame_transform(world, newFrame, mechanicalElements),
      oldVector: load.vector,
    });
  } else {
    const world = frame2world_transform(
      load.direction,
      load.frame,
      mechanicalElements,
    );
    actions.push(
      change_distributed_force(load, {
        newDirection: world2frame_transform(
          world,
          newFrame,
          mechanicalElements,
        ),
      }),
    );
  }
  return actions;
};

/** Finds the edge a load's frame currently refers to, among the candidates
 *  offered by the ElementPicker or (if it fell out of them) all elements. */
const frame_current_edge = (
  load: ForceElement | DistributedForceElement,
  candidateEdges: EdgeElement[],
  mechanicalElements: MechanicalElement[],
): EdgeElement | undefined => {
  if (load.frame === "world") return undefined;
  const edgeID = load.frame.edgeID;
  return (
    candidateEdges.find((e) => e.id === edgeID) ??
    (mechanicalElements.find((e) => e.id === edgeID && "positionStart" in e) as
      | EdgeElement
      | undefined)
  );
};

interface LoadsSectionProps {
  element: MechanicalElement;
  mechanicalElements: MechanicalElement[];
  loads: LoadElement[];
  selectedLoadID: ID | undefined;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

export const LoadsSection: React.FC<LoadsSectionProps> = ({
  element,
  mechanicalElements,
  loads,
  selectedLoadID,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
}) => {
  // Reference edge(s) for the world/edge frame control.
  // When the host is an edge (distributed force, or a force on an edge) that edge is the single reference.
  // For a force on a node, the candidates are the edges attached to it.
  const hostEdge: EdgeElement | undefined =
    "positionStart" in element ? (element as EdgeElement) : undefined;
  const nodeEdges = hostEdge
    ? []
    : node_candidate_edges(element, mechanicalElements);

  const beamLength =
    "positionStart" in element
      ? element.positionStart.distance_to(element.positionEnd)
      : 0;

  return (
    <Box sx={{ px: 1 }}>
      {loads.map((load) => (
        <Box
          key={load.id}
          sx={{
            mt: 0.5,
            pb: 0.5,
            borderRadius: 3,
            border: 1,
            borderColor:
              load.id === selectedLoadID ? "primary.main" : "transparent",
          }}
        >
          <ElementDisplay
            element={load}
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            size="medium"
            editable={true}
            trailingControls={
              <IconButton
                size="small"
                color="error"
                onMouseEnter={() =>
                  setHoveredPart(element_to_hovered_part(load, true))
                }
                onMouseLeave={() =>
                  setHoveredPart({ type: "Void", position: ZERO })
                }
                onClick={() =>
                  applyActions(
                    [{ type: "DeleteElement", element: load }],
                  )
                }
                title={t("action_delete")}
                sx={{ borderRadius: 3 }}
              >
                <Delete sx={{ width: 20, height: 20 }} />
              </IconButton>
            }
          />
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              px: 1,
              py: 0.5,
            }}
          >
            {load.type === "force" && (
              <>
                <NumberInput
                  label="N"
                  value={load.vector.length()}
                  onChange={(mag) =>
                    applyActions(
                      [
                        {
                          type: "ChangeForce",
                          id: load.id,
                          newVector: load.vector.with_length(mag),
                          oldVector: load.vector,
                        },
                      ],
                    )
                  }
                />
                <NumberInput
                  label="°"
                  value={to_deg(load.vector.angle())}
                  onChange={(deg) =>
                    applyActions(
                      [
                        {
                          type: "ChangeForce",
                          id: load.id,
                          newVector: Point2.from_polar(
                            load.vector.length(),
                            to_rad(deg),
                          ),
                          oldVector: load.vector,
                        },
                      ],
                    )
                  }
                />
              </>
            )}
            {load.type === "distributed-force" && (
              <>
                <NumberInput
                  label="°"
                  value={to_deg(load.direction.angle())}
                  onChange={(deg) =>
                    applyActions(
                      [
                        change_distributed_force(load, {
                          newDirection: Point2.from_polar(1, to_rad(deg)),
                        }),
                      ],
                    )
                  }
                />
                <NumberInput
                  label="q₀"
                  value={load.magnitudeStart}
                  onChange={(v) =>
                    applyActions(
                      [
                        change_distributed_force(load, {
                          newMagnitudeStart: v,
                        }),
                      ],
                    )
                  }
                />
                <NumberInput
                  label="q₁"
                  value={load.magnitudeEnd}
                  onChange={(v) =>
                    applyActions(
                      [
                        change_distributed_force(load, {
                          newMagnitudeEnd: v,
                        }),
                      ],
                    )
                  }
                />
                <NumberInput
                  label="R (N)"
                  value={
                    (((load.magnitudeStart + load.magnitudeEnd) / 2) *
                      beamLength) /
                    1000
                  }
                  onChange={(resultant) => {
                    if (beamLength <= 0) return;
                    const current =
                      (((load.magnitudeStart + load.magnitudeEnd) / 2) *
                        beamLength) /
                      1000;
                    const next =
                      current > 1e-9
                        ? change_distributed_force(load, {
                            newMagnitudeStart:
                              load.magnitudeStart * (resultant / current),
                            newMagnitudeEnd:
                              load.magnitudeEnd * (resultant / current),
                          })
                        : change_distributed_force(load, {
                            newMagnitudeStart: (resultant / beamLength) * 1000,
                            newMagnitudeEnd: (resultant / beamLength) * 1000,
                          });
                    applyActions([next]);
                  }}
                />
              </>
            )}
            {load.type === "moment" && (
              <SignedNumberInput
                label="N·m"
                value={load.value}
                onChange={(value) =>
                  applyActions(
                    [
                      {
                        type: "ChangeMoment",
                        id: load.id,
                        newValue: value,
                        oldValue: load.value,
                      },
                    ],
                  )
                }
              />
            )}
            {(load.type === "force" || load.type === "distributed-force") && (
              <ElementPicker
                label="Repère"
                options={hostEdge ? [hostEdge] : nodeEdges}
                extraOption={{
                  label: t("frame_world"),
                  icon: Public,
                  selected: load.frame === "world",
                }}
                selected={frame_current_edge(
                  load,
                  hostEdge ? [hostEdge] : nodeEdges,
                  mechanicalElements,
                )}
                onSelectExtra={() =>
                  applyActions(
                    frame_change_actions(load, "world", mechanicalElements),
                  )
                }
                onSelectElement={(edge) =>
                  applyActions(
                    frame_change_actions(
                      load,
                      { mode: "edge", edgeID: edge.id },
                      mechanicalElements,
                    ),
                  )
                }
                onHoverElement={(edge) =>
                  setHoveredPart(element_to_hovered_part(edge, false))
                }
                onHoverEnd={() =>
                  setHoveredPart({ type: "Void", position: ZERO })
                }
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
              />
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default LoadsSection;
