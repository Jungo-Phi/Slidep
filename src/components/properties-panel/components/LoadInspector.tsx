import React from "react";
import { Box, Divider, IconButton, Tooltip } from "@mui/material";
import { Close, Public } from "@mui/icons-material";
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
} from "../load-actions";
import ElementDisplay from "./ElementDisplay";
import ElementPicker from "./ElementPicker";
import NumberInput from "./NumberInput";
import SignedNumberInput from "./SignedNumberInput";
import { t } from "../../../i18n";
import { element_to_hovered_part } from "../../canvas/utils";
import {
  CARD_ICON_BUTTON_SX,
  FULL_BLEED,
  HEADER_INSET,
  ICON_GROUP_SX,
} from "../inspector-metrics";
import HostRow from "./HostRow";
import {
  ANGLE,
  FORCE,
  LOAD_INTENSITY,
  MOMENT,
  wrap_angle_rad,
} from "../../../utils/quantity-format";

interface LoadInspectorProps {
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
  /** Drops the selection, the way every subject of this panel is dismissed. */
  onDeselect: () => void;
}

/**
 * The one load the analysis panel is reading, laid out the way that panel lays out everything else: the subject named at the top in an `ElementDisplay`, its own settings under it.
 * A sibling of `LoadsSection`, not a mode of it — the elements tab lists several loads at once to edit them, this one reads a single one under a running simulation, and the two are expected to drift apart.
 * What the edits write is shared all the same (`load-actions.ts`): the same load edited from two places must produce the same action.
 *
 * Dismissing is a deselection, never a deletion: this panel reads a simulation, and nothing that reads should be one misclick away from changing the mechanism.
 */
export const LoadInspector: React.FC<LoadInspectorProps> = ({
  load,
  host,
  mechanicalElements,
  shownLoad,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  onDeselect,
}) => {
  // Reference edge(s) for the world/edge frame control: an edge host is the single reference, a node host offers the edges attached to it.
  const hostEdge: EdgeElement | undefined =
    "positionStart" in host ? (host as EdgeElement) : undefined;
  const nodeEdges = hostEdge ? [] : node_candidate_edges(host, mechanicalElements);
  const beamLength = hostEdge
    ? hostEdge.positionStart.distance_to(hostEdge.positionEnd)
    : 0;

  const shownForce = shownLoad.type === "force" ? shownLoad : undefined;
  const shownDistributed =
    shownLoad.type === "distributed-force" ? shownLoad : undefined;
  const shownMoment = shownLoad.type === "moment" ? shownLoad : undefined;
  const shownFrame =
    shownLoad.type === "force" || shownLoad.type === "distributed-force"
      ? shownLoad.frame
      : undefined;

  /** The load's own headline value, beside its name the way an element's m, k or b is. */
  const magnitude_input = () => {
    if (load.type === "force")
      return (
        <NumberInput
          label="F"
          title={t("force")}
          kind={FORCE}
          value={(shownForce ?? load).vector.length()}
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
    if (load.type === "distributed-force") {
      const shown = shownDistributed ?? load;
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
                    newMagnitudeStart:
                      load.magnitudeStart * (resultant / current),
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
    return (
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
    );
  };

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

  const row_sx = {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    py: 0.5,
  };

  return (
    <>
      <Box sx={HEADER_INSET}>
        <ElementDisplay
          element={load}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          selectedIds={selectedIds}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="medium"
          editable
          trailingControls={
            <>
              {magnitude_input()}
              <Box sx={ICON_GROUP_SX}>
                <Tooltip title={t("deselect")}>
                  <IconButton
                    size="small"
                    onClick={onDeselect}
                    sx={CARD_ICON_BUTTON_SX}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </>
          }
        />
      </Box>
      <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
      {(load.type === "force" || load.type === "distributed-force") && (
        <Box sx={row_sx}>
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
              applyActions(frame_change_actions(load, "world", mechanicalElements))
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
        <Box sx={row_sx}>
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
      <HostRow
        label={t("load_applied_on")}
        element={host}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
      />
    </>
  );
};

export default LoadInspector;
