import { Box, IconButton, Tooltip } from "@mui/material";
import { Delete, Public } from "@mui/icons-material";
import {
  Action,
  CanvasState,
  EdgeElement,
  ID,
  LoadElement,
  MechanicalElement,
  Point2,
  ZERO,
} from "../../../types";
import { node_candidate_edges } from "../../../utils/load-frame";
import {
  change_distributed_force,
  frame_change_actions,
  frame_current_edge,
} from "../load-actions";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";
import ElementPicker from "./ElementPicker";
import NumberInput from "./NumberInput";
import SignedNumberInput from "./SignedNumberInput";
import { t } from "../../../i18n";
import { element_to_hovered_part } from "../../canvas/utils";
import {
  ANGLE,
  FORCE,
  LOAD_INTENSITY,
  MOMENT,
  wrap_angle_rad,
} from "../../../utils/quantity-format";

interface LoadsSectionProps {
  element: MechanicalElement;
  mechanicalElements: MechanicalElement[];
  loads: LoadElement[];
  /** Same loads, in the pose on screen — only for the values shown while scrubbed; every
   * write below still goes through `loads`, matched by id (see `ElementProperties`). */
  displayLoads: LoadElement[];
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
  displayLoads,
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
      {loads.map((load) => {
        const shownLoad = displayLoads.find((l) => l.id === load.id) ?? load;
        const shownForce =
          load.type === "force" && shownLoad.type === "force"
            ? shownLoad
            : load.type === "force"
              ? load
              : undefined;
        const shownDistributed =
          load.type === "distributed-force" &&
          shownLoad.type === "distributed-force"
            ? shownLoad
            : load.type === "distributed-force"
              ? load
              : undefined;
        const shownMoment =
          load.type === "moment" && shownLoad.type === "moment"
            ? shownLoad
            : load.type === "moment"
              ? load
              : undefined;
        const shownFrame =
          shownLoad.type === "force" || shownLoad.type === "distributed-force"
            ? shownLoad.frame
            : load.type === "force" || load.type === "distributed-force"
              ? load.frame
              : undefined;
        return (
          <Box
            key={load.id}
            sx={{
              display: "flex",
              flexDirection: "column",
              mt: 0.5,
              borderRadius: 3,
              border: 1,
              borderColor:
                load.id === selectedLoadID ? "primary.main" : "transparent",
              gap: 0.5,
              padding: 0.4,
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
                <>
                  {load.type === "force" && (
                    <NumberInput
                      label="F"
                      title={t("force")}
                      kind={FORCE}
                      value={(shownForce ?? load).vector.length()}
                      onChange={(mag) =>
                        applyActions([
                          {
                            type: "ChangeForce",
                            id: load.id,
                            newVector: load.vector.with_length(mag),
                            oldVector: load.vector,
                          },
                        ])
                      }
                    />
                  )}
                  {load.type === "distributed-force" && (
                    <NumberInput
                      label="F"
                      title={t("force")}
                      kind={FORCE}
                      value={
                        (((shownDistributed ?? load).magnitudeStart +
                          (shownDistributed ?? load).magnitudeEnd) /
                          2) *
                        beamLength
                      }
                      onChange={(resultant) => {
                        if (beamLength <= 0) return;
                        const current =
                          ((load.magnitudeStart + load.magnitudeEnd) / 2) *
                          beamLength;
                        const next =
                          current > 1e-9
                            ? change_distributed_force(load, {
                                newMagnitudeStart:
                                  load.magnitudeStart * (resultant / current),
                                newMagnitudeEnd:
                                  load.magnitudeEnd * (resultant / current),
                              })
                            : change_distributed_force(load, {
                                newMagnitudeStart: resultant / beamLength,
                                newMagnitudeEnd: resultant / beamLength,
                              });
                        applyActions([next]);
                      }}
                    />
                  )}
                  {load.type === "moment" && (
                    <SignedNumberInput
                      label="M"
                      title={t("moment")}
                      kind={MOMENT}
                      value={(shownMoment ?? load).value}
                      onChange={(value) =>
                        applyActions([
                          {
                            type: "ChangeMoment",
                            id: load.id,
                            newValue: value,
                            oldValue: load.value,
                          },
                        ])
                      }
                    />
                  )}
                  <Tooltip title={t("delete")}>
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
                        applyActions([
                          { type: "DeleteElement", element: load },
                        ])
                      }
                      sx={{ borderRadius: 3 }}
                    >
                      <Delete sx={{ width: 20, height: 20 }} />
                    </IconButton>
                  </Tooltip>
                </>
              }
            />
            {(load.type === "force" || load.type === "distributed-force") && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    pb: 0.5,
                  }}
                >
                  <ElementPicker
                    label={t("frame")}
                    options={hostEdge ? [hostEdge] : nodeEdges}
                    extraOption={{
                      label: t("frame_world"),
                      icon: Public,
                      selected: shownFrame === "world",
                    }}
                    selected={
                      shownFrame &&
                      frame_current_edge(
                        shownFrame,
                        hostEdge ? [hostEdge] : nodeEdges,
                        mechanicalElements,
                      )
                    }
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
                  {load.type === "force" ? (
                    <NumberInput
                      label="α"
                      title={t("angle")}
                      kind={ANGLE}
                      value={wrap_angle_rad(
                        (shownForce ?? load).vector.angle(),
                      )}
                      onChange={(newAngle) =>
                        applyActions([
                          {
                            type: "ChangeForce",
                            id: load.id,
                            newVector: Point2.from_polar(
                              load.vector.length(),
                              newAngle,
                            ),
                            oldVector: load.vector,
                          },
                        ])
                      }
                    />
                  ) : (
                    <NumberInput
                      label="α"
                      title={t("angle")}
                      kind={ANGLE}
                      value={wrap_angle_rad(
                        (shownDistributed ?? load).direction.angle(),
                      )}
                      onChange={(newAngle) =>
                        applyActions([
                          change_distributed_force(load, {
                            newDirection: Point2.from_polar(1, newAngle),
                          }),
                        ])
                      }
                    />
                  )}
                </Box>

                {load.type === "distributed-force" && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                      pb: 0.5,
                    }}
                  >
                    <NumberInput
                      label="q₀"
                      title={t("linear_force_start")}
                      kind={LOAD_INTENSITY}
                      value={(shownDistributed ?? load).magnitudeStart}
                      onChange={(v) =>
                        applyActions([
                          change_distributed_force(load, {
                            newMagnitudeStart: v,
                          }),
                        ])
                      }
                    />
                    <NumberInput
                      label="q₁"
                      title={t("linear_force_end")}
                      kind={LOAD_INTENSITY}
                      value={(shownDistributed ?? load).magnitudeEnd}
                      onChange={(v) =>
                        applyActions([
                          change_distributed_force(load, {
                            newMagnitudeEnd: v,
                          }),
                        ])
                      }
                    />
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default LoadsSection;
