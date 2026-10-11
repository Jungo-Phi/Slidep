import React from "react";
import { Box } from "@mui/material";
import { Public } from "@mui/icons-material";
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
import { HoveredPart } from "../../../types/hovered-part";
import {
  change_distributed_force,
  frame_change_actions,
  frame_current_edge,
  host_length,
} from "../load-actions";
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

interface LoadValueInputProps {
  load: LoadElement;
  /** The element the load is applied to: a distributed load's resultant is read against its length. */
  host: MechanicalElement;
  /** The same load in the pose on screen: the value is read off it, while the write is built against `load`, the stored one. */
  shownLoad: LoadElement;
  applyActions: (actions: Action[]) => void;
}

/** A load's own value, on its row: F for a force, the resultant for a distributed one, M — signed — for a moment. */
export const LoadValueInput: React.FC<LoadValueInputProps> = ({
  load,
  host,
  shownLoad,
  applyActions,
}) => {
  if (load.type === "force") {
    const shown = shownLoad.type === "force" ? shownLoad : load;
    return (
      <NumberInput
        label="F"
        title={t("force")}
        kind={FORCE}
        value={shown.vector.length()}
        onChange={(magnitude) =>
          applyActions([
            {
              type: "ChangeForce",
              id: load.id,
              newVector: load.vector.with_length(magnitude),
              oldVector: load.vector,
            },
          ])
        }
      />
    );
  }
  if (load.type === "distributed-force") {
    const shown = shownLoad.type === "distributed-force" ? shownLoad : load;
    const beamLength = host_length(host);
    return (
      <NumberInput
        label="F"
        title={t("resultant_force")}
        kind={FORCE}
        value={((shown.magnitudeStart + shown.magnitudeEnd) / 2) * beamLength}
        onChange={(resultant) => {
          if (beamLength <= 0) return;
          const current =
            ((load.magnitudeStart + load.magnitudeEnd) / 2) * beamLength;
          applyActions([
            current > 1e-9
              ? change_distributed_force(load, {
                  newMagnitudeStart: load.magnitudeStart * (resultant / current),
                  newMagnitudeEnd: load.magnitudeEnd * (resultant / current),
                })
              : change_distributed_force(load, {
                  newMagnitudeStart: resultant / beamLength,
                  newMagnitudeEnd: resultant / beamLength,
                }),
          ]);
        }}
      />
    );
  }
  const shown = shownLoad.type === "moment" ? shownLoad : load;
  return (
    <SignedNumberInput
      label="M"
      title={t("moment")}
      kind={MOMENT}
      value={shown.value}
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
  );
};

interface LoadDetailsProps {
  load: LoadElement;
  /** The element the load is applied to, which decides what its frame may be expressed against. */
  host: MechanicalElement;
  mechanicalElements: MechanicalElement[];
  /** The same load in the pose on screen: every value is read off it, while every write below is built against `load`, the stored one. */
  shownLoad: LoadElement;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

const ROW_SX = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  py: 0.5,
};

/**
 * A load unfolded under its row, on the page of the element it is applied on: its frame and direction, a distributed load's two intensities.
 * Its value and the way to delete it stay on the row itself; a moment, which has nothing more, unfolds to nothing.
 */
export const LoadDetails = React.forwardRef<HTMLDivElement, LoadDetailsProps>(
  (
    {
      load,
      host,
      mechanicalElements,
      shownLoad,
      hoveredPart,
      setHoveredPart,
      selectedIds,
      setCanvasState,
      applyActions,
    },
    ref,
  ) => {
    if (load.type === "moment") return null;
    // Reference edge(s) for the world/edge frame control: an edge host is the single reference, a node host offers the edges attached to it.
    const hostEdge: EdgeElement | undefined =
      "positionStart" in host ? (host as EdgeElement) : undefined;
    const nodeEdges = hostEdge
      ? []
      : node_candidate_edges(host, mechanicalElements);

    const shownForce = shownLoad.type === "force" ? shownLoad : undefined;
    const shownDistributed =
      shownLoad.type === "distributed-force" ? shownLoad : undefined;
    const shownFrame =
      shownLoad.type === "force" || shownLoad.type === "distributed-force"
        ? shownLoad.frame
        : undefined;

    /** Which way the load points, in whichever frame it is expressed. */
    const angle_input = () =>
      load.type === "force" ? (
        <NumberInput
          label="α"
          title={t("angle")}
          kind={ANGLE}
          value={wrap_angle_rad((shownForce ?? load).vector.angle())}
          onChange={(angle) =>
            applyActions([
              {
                type: "ChangeForce",
                id: load.id,
                newVector: Point2.from_polar(load.vector.length(), angle),
                oldVector: load.vector,
              },
            ])
          }
        />
      ) : load.type === "distributed-force" ? (
        <NumberInput
          label="α"
          title={t("angle")}
          kind={ANGLE}
          value={wrap_angle_rad((shownDistributed ?? load).direction.angle())}
          onChange={(angle) =>
            applyActions([
              change_distributed_force(load, {
                newDirection: Point2.from_polar(1, angle),
              }),
            ])
          }
        />
      ) : null;

    return (
      <Box ref={ref} sx={{ pb: 0.5 }}>
        {(load.type === "force" || load.type === "distributed-force") && (
          <Box sx={ROW_SX}>
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
              onHoverEnd={() => setHoveredPart({ type: "Void", position: ZERO })}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
            />
            {angle_input()}
          </Box>
        )}
        {load.type === "distributed-force" && (
          <Box sx={ROW_SX}>
            <NumberInput
              label="q₀"
              title={t("linear_force_start")}
              kind={LOAD_INTENSITY}
              value={(shownDistributed ?? load).magnitudeStart}
              onChange={(magnitudeStart) =>
                applyActions([
                  change_distributed_force(load, {
                    newMagnitudeStart: magnitudeStart,
                  }),
                ])
              }
            />
            <NumberInput
              label="q₁"
              title={t("linear_force_end")}
              kind={LOAD_INTENSITY}
              value={(shownDistributed ?? load).magnitudeEnd}
              onChange={(magnitudeEnd) =>
                applyActions([
                  change_distributed_force(load, {
                    newMagnitudeEnd: magnitudeEnd,
                  }),
                ])
              }
            />
          </Box>
        )}
      </Box>
    );
  },
);
LoadDetails.displayName = "LoadDetails";

export default LoadDetails;
