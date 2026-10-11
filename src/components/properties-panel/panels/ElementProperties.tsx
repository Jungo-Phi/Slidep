/**
 * The page of one mechanical element, in every mode: one order, which the mode fills differently (docs/plan-onglet-element.md).
 * What lives through a simulation comes first — motor, physics, readings, loads — and the structure it freezes last: the geometry, shown in the pose on screen, then the connections.
 */

import {
  Box,
  IconButton,
  Divider,
  Tooltip,
} from "@mui/material";
import { Delete, Lock, LockOpen, Replay } from "@mui/icons-material";
import { ID, MechanicalElement } from "../../../types/element";
import VectorInput from "../components/VectorInput";
import {
  BeamElement,
  CanvasState,
  Action,
  AppMode,
  Mechanism,
  Point2,
  RuntimeState,
  ZERO,
} from "../../../types";
import ConnectionsProperties from "./ConnectionsProperties";
import {
  delete_element,
  delete_elements,
} from "../../mechanism/connect-actions";
import {
  HoveredAbscissaSource,
  HoveredPart,
  is_hovered,
} from "../../../types/hovered-part";
import NumberInput from "../components/NumberInput";
import SignedNumberInput from "../components/SignedNumberInput";
import ElementDisplay from "../components/ElementDisplay";
import ElementsOverview from "../components/ElementsOverview";
import ElementReadings from "../components/ElementReadings";
import LoadDetails, { LoadValueInput } from "../components/LoadDetails";
import { MetricRow, ValueRow } from "../components/MetricRow";
import ReadingRow from "../components/ReadingRow";
import { ROW_CONTROL_CLASS, ROW_ICON_BUTTON_SX } from "../inspector-metrics";
import { format_scalar } from "../metric-display";
import { get_element_icon } from "../../element-palette/elementIcon";
import { shown_element_name } from "../../../utils";
import ProbeMetricsButton from "../components/ProbeMetricsButton";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "../../canvas/drawing/draw-canvas";
import type { FocusedOverlay } from "../../canvas/drawing/drawing-functions";
import { t } from "../../../i18n";
import { element_to_hovered_part, linked_constraint } from "../../canvas/utils";
import { measure_belt_length } from "../../../utils/belt-geom";
import { is_groundable } from "../../../utils/element-queries";
import CollisionToggleButton from "../components/CollisionToggleButton";
import ToggleIcon from "../components/ToggleIcon";
import React from "react";
import { icon } from "../../element-palette/iconDataUris";
import StructureOnly from "../components/StructureOnly";
import {
  create_length_dimension,
  create_radius_dimension,
} from "../element-dimensions";
import ElementPicker from "../components/ElementPicker";
import MaterialProfileSection from "../components/MaterialProfileSection";
import { DEFAULT } from "../../../constants/physics-specs";
import {
  ANGLE,
  ANGULAR_VELOCITY,
  INERTIA,
  LENGTH,
  MASS,
  MOMENT,
  POWER,
  STIFFNESS,
  SURFACE_MASS,
  DAMPING,
  ANGULAR_DAMPING,
  wrap_angle_rad,
} from "../../../utils/quantity-format";
import {
  gear_inertia,
  surface_mass_for_inertia,
} from "../../../utils/gear-mass";
import { motor_available_power } from "../../solver/dynamics/motor-model";
import {
  snapshot_index_at,
} from "../../solver/dynamics/simulation-engine";
import { get_dynamic_metric_at } from "../../solver/recording/probe-series";
import { DynamicSnapshot } from "../../../types/runtime-state";

/** The ground/unground button's icon, reused as the ElementPicker "world" option so a motor's anchor reads with the same visual language as the ground toggle. */
const GroundIcon: React.FC<{ sx?: object }> = ({ sx }) => (
  <Box component="img" src={icon("ground")} sx={sx} />
);

interface ElementPropertiesProps {
  /** The element whose page this is; none, and the page is the overview of them all. */
  element: MechanicalElement | undefined;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
  /**
   * The mechanism at the instant on screen — see the same field on `AnalysisPanel`.
   * Feeds the parameter values shown, while every write is still built against `mechanism` (see `rebased_bundle`).
   */
  analysedMechanism: Mechanism;
  appMode: AppMode;
  runtimeState: RuntimeState;
  /** Names what the canvas should pick out, and why — see the same prop on `PropertiesPanel`. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** See `App`'s own `focusedOverlay`: one of this element's readings, if it names one, is unfolded in place. */
  focusedOverlay: FocusedOverlay | null;
  setFocusedOverlay: (overlay: FocusedOverlay | null) => void;
  /** Publishes the abscissa hovered on a beam's own N/T/Mf diagrams, for the canvas to mark. */
  setHoveredAbscissa: (hovered: HoveredAbscissaSource | null) => void;
  /** The load selected among this element's own, unfolded under its row. */
  unfoldedLoadID?: ID;
}

export const ElementProperties: React.FC<ElementPropertiesProps> = ({
  element,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
  mechanism,
  analysedMechanism,
  appMode,
  runtimeState,
  setHighlight,
  focusedOverlay,
  setFocusedOverlay,
  setHoveredAbscissa,
  unfoldedLoadID,
}) => {
  // The unfolded load is brought into view: it may sit well down the page, and a click on it out on the canvas is what unfolded it.
  const unfoldedLoadRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (unfoldedLoadID)
      unfoldedLoadRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [unfoldedLoadID]);

  const handleMouseEnter = (
    el: Parameters<typeof element_to_hovered_part>[0],
    deleting: boolean,
  ) => {
    setHoveredPart(element_to_hovered_part(el, deleting));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  if (!element) {
    return (
      <ElementsOverview
        selectedIds={selectedIds}
        mechanism={mechanism}
        analysedMechanism={analysedMechanism}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
        setHighlight={setHighlight}
        onDeleteElements={(ids) => {
          applyActions(
            delete_elements(
              ids,
              mechanism.mechanicalElements,
              mechanism.constraintElements,
              mechanism.loads,
            ),
          );
          setHighlight(NO_HIGHLIGHT);
          setCanvasState({ type: "Selecting" });
        }}
      />
    );
  }

  // The same element at the instant on screen: parameter values are read off it, writes are built against `element` (see `rebased_bundle`).
  const shown_as = <T extends MechanicalElement>(el: T): T =>
    (analysedMechanism.mechanicalElements.find((e) => e.id === el.id) as
      | T
      | undefined) ?? el;

  // Under a simulation the geometry is the pose on screen, read rather than set.
  const live = appMode !== "edition";
  const geometry = live ? shown_as(element) : element;

  // A spring with no rest length of its own takes the drawn one, and follows it.
  const restLengthIsDrawn =
    element.type === "spring" && shown_as(element).restLength === undefined;

  const linkedConstraint = linked_constraint(
    element,
    mechanism.constraintElements,
  );

  const displayLoads = analysedMechanism.loads.filter(
    (l) => l.targetID === element.id,
  );
  // Each load shown is written through its stored counterpart, or through itself when a later edit deleted it: the write brings it back.
  const elementLoads = displayLoads.map(
    (l) => mechanism.loads.find((stored) => stored.id === l.id) ?? l,
  );
  const analysedElement =
    element.type === "pivot"
      ? analysedMechanism.mechanicalElements.find((e) => e.id === element.id)
      : undefined;
  const displayMotorConfig =
    analysedElement?.type === "pivot" ? analysedElement.motor : undefined;
  const motorConfig = element.type === "pivot" ? element.motor : undefined;
  const shownMotor = displayMotorConfig ?? motorConfig;
  const availablePower = shownMotor ? motor_available_power(shownMotor) : 0;
  // Read off the frame the cursor stands on, like the stall witness: a diagnostic belongs to a state the solver produced.
  const dynamicSnapshots = runtimeState.simulationSnapshots as DynamicSnapshot[];
  const motorSaturated =
    motorConfig !== undefined &&
    appMode === "dynamic" &&
    dynamicSnapshots.length > 0 &&
    (dynamicSnapshots[snapshot_index_at(dynamicSnapshots, runtimeState.time)].motor?.some(
      (sample) => sample.pivotID === element.id && sample.saturated,
    ) ??
      false);

  // Beams the pivot's motor can push against: the beams rotating about it.
  const motorBeams: BeamElement[] =
    element.type === "pivot"
      ? element.rotatingEdgesIDs
          .map((id) => mechanism.mechanicalElements.find((e) => e.id === id))
          .filter((e): e is BeamElement => e?.type === "beam")
      : [];

  const hasPhysics =
    "rotatingEdgesIDs" in element ||
    "parentBeamID" in element ||
    element.type === "gear" ||
    element.type === "beam" ||
    element.type === "mass" ||
    element.type === "spring" ||
    element.type === "damper";

  return (
    <Box sx={{ mb: 1 }}>
      <Box margin={1}>
        <ElementDisplay
          element={element}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          selectedIds={selectedIds}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="large"
          editable={true}
          trailingControls={
            <>
              <CollisionToggleButton
                element={element}
                shown={shown_as(element)}
                applyActions={applyActions}
                sx={{ padding: 0.2, border: 1, borderColor: "divider" }}
              />

              <ProbeMetricsButton element={element} applyActions={applyActions} />

              <StructureOnly actions={["DeleteElement"]} row>
                <Tooltip title={t("delete")}>
                  <IconButton
                    color="error"
                    onClick={() =>
                      applyActions(
                        delete_element(
                          element.id,
                          mechanism.mechanicalElements,
                          mechanism.constraintElements,
                          mechanism.loads,
                        ),
                      )
                    }
                    onMouseEnter={(_e) => handleMouseEnter(element, true)}
                    onMouseLeave={handleMouseLeave}
                    sx={{ borderRadius: 4 }}
                  >
                    <Delete />
                  </IconButton>
                </Tooltip>
              </StructureOnly>
            </>
          }
        />
      </Box>

      {element.type === "pivot" && element.motor && motorConfig && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              m: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
              }}
            >
              <NumberInput
                label="C"
                title={t(motorSaturated ? "motor_torque_saturated_hint" : "motor_torque_label")}
                kind={MOMENT}
                value={(displayMotorConfig ?? element.motor).torque}
                onChange={(torque) => {
                  const motor = element.motor!;
                  applyActions([
                    {
                      type: "SetMotorConfig",
                      id: element.id,
                      // Replaced whole, so built from what is shown: a later edit of the other field must not ride along.
                      newConfig: { ...(displayMotorConfig ?? motor), torque },
                      oldConfig: motor,
                    },
                  ]);
                }}
                unsigned
                large
                atLimit={motorSaturated}
              />
              <SignedNumberInput
                label="ω"
                title={t("motor_speed_label")}
                kind={ANGULAR_VELOCITY()}
                value={(displayMotorConfig ?? element.motor).speed}
                onChange={(speed) => {
                  const motor = element.motor!;
                  applyActions([
                    {
                      type: "SetMotorConfig",
                      id: element.id,
                      newConfig: { ...(displayMotorConfig ?? motor), speed },
                      oldConfig: motor,
                    },
                  ]);
                }}
                large
                accent
              />
            </Box>
            {/* What it can give, and in dynamics what it gives right now under it, to read how much of it is used. */}
            <Box sx={{ alignSelf: "stretch", px: 1 }}>
              <ValueRow
                label={t("motor_power_available")}
                formatted={
                  availablePower > 0
                    ? format_scalar(availablePower, POWER)
                    : undefined
                }
              />
              {appMode === "dynamic" && (
                <MetricRow
                  metric="motor-power"
                  sample={get_dynamic_metric_at(
                    element,
                    "motor-power",
                    dynamicSnapshots,
                    runtimeState.time,
                  )}
                  label={t("motor_power_instant")}
                />
              )}
            </Box>
          </Box>
        </>
      )}

      {hasPhysics && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              mx: 2,
              my: 1.5,
            }}
          >
            {element.type === "mass" && (
              <NumberInput
                label="m"
                title={t("mass")}
                kind={MASS}
                value={shown_as(element).mass}
                onChange={(mass) =>
                  applyActions([
                    {
                      type: "ChangeMass",
                      id: element.id,
                      delta: mass - element.mass,
                    },
                  ])
                }
                large
                accent
                unsigned
              />
            )}
            {element.type === "damper" && (
              <NumberInput
                label="b"
                title={t("damping")}
                kind={DAMPING}
                value={shown_as(element).damping}
                onChange={(damping) =>
                  applyActions([
                    {
                      type: "ChangeDamping",
                      id: element.id,
                      delta: damping - element.damping,
                    },
                  ])
                }
                large
                accent
                unsigned
              />
            )}
            {"rotatingEdgesIDs" in element && (
              <NumberInput
                label="bᵣ"
                title={t("rotational_friction")}
                kind={ANGULAR_DAMPING}
                value={shown_as(element).rotationalFriction}
                onChange={(rotationalFriction) =>
                  applyActions([
                    {
                      type: "ChangeRotationalFriction",
                      id: element.id,
                      delta: rotationalFriction - element.rotationalFriction,
                    },
                  ])
                }
                unsigned
                large
                precision={2}
                step={0.1}
              />
            )}
            {"parentBeamID" in element && (
              <NumberInput
                label="bₛ"
                title={t("sliding_friction")}
                kind={DAMPING}
                value={shown_as(element).slidingFriction}
                onChange={(slidingFriction) =>
                  applyActions([
                    {
                      type: "ChangeSlidingFriction",
                      id: element.id,
                      delta: slidingFriction - element.slidingFriction,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "gear" && (
              <NumberInput
                label="mₛ"
                title={t("surface_mass")}
                kind={SURFACE_MASS}
                value={shown_as(element).surfaceMass}
                onChange={(surfaceMass) =>
                  applyActions([
                    {
                      type: "ChangeSurfaceMass",
                      id: element.id,
                      delta: surfaceMass - element.surfaceMass,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "gear" && (
              <NumberInput
                label="J"
                title={t("inertia")}
                kind={INERTIA}
                value={gear_inertia(
                  shown_as(element).surfaceMass,
                  element.radius,
                )}
                onChange={(inertia) =>
                  applyActions([
                    {
                      type: "ChangeSurfaceMass",
                      id: element.id,
                      delta:
                        surface_mass_for_inertia(inertia, element.radius) -
                        element.surfaceMass,
                    },
                  ])
                }
                unsigned
                large
              />
            )}
            {element.type === "beam" && (
              <MaterialProfileSection
                elements={[element]}
                shownElements={[shown_as(element)]}
                materials={analysedMechanism.materials}
                profiles={analysedMechanism.profiles}
                applyActions={applyActions}
              />
            )}
            {element.type === "spring" && (
              <NumberInput
                label="k"
                title={t("stiffness")}
                kind={STIFFNESS}
                value={shown_as(element).stiffness}
                onChange={(stiffness) =>
                  applyActions([
                    {
                      type: "ChangeStiffness",
                      id: element.id,
                      delta: stiffness - element.stiffness,
                    },
                  ])
                }
                large
                accent
                unsigned
              />
            )}
            {element.type === "spring" && (
              <NumberInput
                label="L₀"
                title={t("rest_length")}
                kind={LENGTH}
                value={
                  shown_as(element).restLength ??
                  element.positionStart.distance_to(element.positionEnd)
                }
                onChange={(restLength) =>
                  applyActions([
                    {
                      type: "UpdateElementRestLength",
                      id: element.id,
                      newValue: restLength,
                      oldValue: element.restLength,
                    },
                  ])
                }
                implicit={restLengthIsDrawn}
                adornment={{
                  icon: Replay,
                  title: t("back_to_rest"),
                  disabled: restLengthIsDrawn,
                  color: "secondary",
                  onClick: () =>
                    applyActions([
                      {
                        type: "UpdateElementRestLength",
                        id: element.id,
                        newValue: undefined,
                        oldValue: element.restLength,
                      },
                    ]),
                }}
                unsigned
                large
              />
            )}
          </Box>
        </>
      )}

      <Divider sx={{ my: 1 }} />
      <ElementReadings
        element={element}
        mechanism={mechanism}
        analysedMechanism={analysedMechanism}
        runtimeState={runtimeState}
        appMode={appMode}
        applyActions={applyActions}
        focusedOverlay={focusedOverlay}
        setFocusedOverlay={setFocusedOverlay}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        setHoveredAbscissa={setHoveredAbscissa}
      />

      {/* Read the way the readings above are: a row says what the load is worth, and selecting it — here or on the canvas — unfolds it in place. */}
      {elementLoads.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ px: 2, display: "flex", flexDirection: "column", gap: 0.25 }}>
            {elementLoads.map((load) => {
              const shownLoad =
                displayLoads.find((l) => l.id === load.id) ?? load;
              const unfolded = load.id === unfoldedLoadID;
              return (
                <React.Fragment key={load.id}>
                  <ReadingRow
                    icon={get_element_icon(load)}
                    label={shown_element_name(load)}
                    onRename={(newName) =>
                      applyActions([
                        {
                          type: "UpdateElementName",
                          id: load.id,
                          newName,
                          oldName: load.name,
                        },
                      ])
                    }
                    // Its own controls stop there: a click on them is an edit, never a fold.
                    value={
                      <Box
                        className={ROW_CONTROL_CLASS}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LoadValueInput
                          load={load}
                          host={element}
                          shownLoad={shownLoad}
                          applyActions={applyActions}
                        />
                      </Box>
                    }
                    trailing={
                      <Tooltip title={t("delete")}>
                        <IconButton
                          size="small"
                          color="error"
                          onMouseEnter={() =>
                            setHoveredPart(element_to_hovered_part(load, true))
                          }
                          onMouseLeave={handleMouseLeave}
                          onClick={(e) => {
                            e.stopPropagation();
                            applyActions([{ type: "DeleteElement", element: load }]);
                          }}
                          sx={ROW_ICON_BUTTON_SX}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    }
                    selected={unfolded}
                    pointed={is_hovered(hoveredPart, load.id)}
                    // A second click folds it back, the element staying selected.
                    onClick={() =>
                      setCanvasState({
                        type: "SelectedElement",
                        elementID: unfolded ? element.id : load.id,
                      })
                    }
                    onHoverChange={(hovered) =>
                      setHoveredPart(
                        hovered
                          ? element_to_hovered_part(load)
                          : { type: "Void", position: ZERO },
                      )
                    }
                  />
                  {unfolded && (
                    <LoadDetails
                      ref={unfoldedLoadRef}
                      load={load}
                      host={element}
                      mechanicalElements={mechanism.mechanicalElements}
                      shownLoad={shownLoad}
                      hoveredPart={hoveredPart}
                      setHoveredPart={setHoveredPart}
                      selectedIds={selectedIds}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </Box>
        </>
      )}

      {"position" in geometry && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              m: 1,
            }}
          >
            <VectorInput
              value={geometry.position}
              live={live}
              onChange={(pos) =>
                applyActions([
                  {
                    type: "MoveNode",
                    id: element.id,
                    newPosition: pos,
                    oldPosition: geometry.position,
                    committed: true,
                  },
                ])
              }
            />
            {is_groundable(element) && (
              <StructureOnly actions={["GroundNode"]}>
                <Tooltip title={t(element.isGrounded ? "release" : "anchor")}>
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={() =>
                      applyActions([
                        {
                          type: "GroundNode",
                          id: element.id,
                          grounded: !element.isGrounded,
                        },
                      ])
                    }
                    sx={{ padding: 0.25, border: 1, borderColor: "divider" }}
                  >
                    <ToggleIcon
                      on={element.isGrounded}
                      onName="ground"
                      offName="ground-off"
                      size={24}
                    />
                  </IconButton>
                </Tooltip>
              </StructureOnly>
            )}
            {/* What the motor pushes against, beside what holds the pivot itself. */}
            {element.type === "pivot" && element.motor && motorConfig && (
              <StructureOnly actions={["SetMotorConfig", "GroundNode"]}>
                <ElementPicker
                  label={t("motor_anchor")}
                  options={motorBeams}
                  extraOption={{
                    label: t("ground"),
                    icon: GroundIcon,
                    selected: motorConfig.parentBeamID === undefined,
                  }}
                  selected={motorBeams.find(
                    (beam) => beam.id === motorConfig.parentBeamID,
                  )}
                  onSelectExtra={() =>
                    applyActions([
                      {
                        type: "SetMotorConfig",
                        id: element.id,
                        newConfig: {
                          ...motorConfig,
                          parentBeamID: undefined,
                        },
                        oldConfig: motorConfig,
                      },
                      ...(element.isGrounded
                        ? []
                        : ([
                            {
                              type: "GroundNode",
                              id: element.id,
                              grounded: true,
                            },
                          ] satisfies Action[])),
                    ])
                  }
                  onSelectElement={(beam) =>
                    applyActions([
                      {
                        type: "SetMotorConfig",
                        id: element.id,
                        newConfig: { ...motorConfig, parentBeamID: beam.id },
                        oldConfig: motorConfig,
                      },
                      ...(element.isGrounded
                        ? ([
                            {
                              type: "GroundNode",
                              id: element.id,
                              grounded: false,
                            },
                          ] satisfies Action[])
                        : []),
                    ])
                  }
                  onHoverElement={(beam) =>
                    setHoveredPart(element_to_hovered_part(beam, false))
                  }
                  onHoverEnd={() =>
                    setHoveredPart({ type: "Void", position: ZERO })
                  }
                  hoveredPart={hoveredPart}
                  setHoveredPart={setHoveredPart}
                  selectedIds={selectedIds}
                  setCanvasState={setCanvasState}
                  applyActions={applyActions}
                  large
                />
              </StructureOnly>
            )}
            {element.type === "pivot" && (
              <StructureOnly actions={["SetMotorConfig", "GroundNode"]}>
                <Tooltip
                  title={t(element.motor ? "motor_revert" : "motor_convert")}
                >
                  <IconButton
                    color="inherit"
                    size="small"
                    onClick={() => {
                      const actions: Action[] = [
                        {
                          type: "SetMotorConfig",
                          id: element.id,
                          newConfig: element.motor
                            ? undefined
                            : {
                                speed: DEFAULT.MOTOR_SPEED,
                                torque: DEFAULT.MOTOR_TORQUE,
                              },
                          oldConfig: element.motor,
                        },
                      ];
                      if (!element.motor && !element.isGrounded) {
                        actions.push({
                          type: "GroundNode",
                          id: element.id,
                          grounded: true,
                        });
                      }
                      applyActions(actions);
                    }}
                    sx={{ padding: 0.25, border: 1, borderColor: "divider" }}
                  >
                    <Box
                      component="img"
                      style={{ width: 24, height: 24 }}
                      src={icon(element.motor ? "motor" : "motor-off")}
                    />
                  </IconButton>
                </Tooltip>
              </StructureOnly>
            )}
            {element.type === "gear" && (
              <NumberInput
                label="R"
                title={t("radius")}
                kind={LENGTH}
                value={element.radius}
                live={live}
                onChange={(radius) => {
                  applyActions([
                    {
                      type: "ChangeGearRadius",
                      id: element.id,
                      newRadius: radius,
                      oldRadius: element.radius,
                      target: new Point2(
                        element.position.x + radius,
                        element.position.y,
                      ),
                      committed: true,
                    },
                  ]);
                }}
                large
                unsigned
                adornment={
                  linkedConstraint
                    ? {
                        icon: Lock,
                        title: t("length_unlock"),
                        color: "secondary",
                        onMouseEnter: () =>
                          handleMouseEnter(linkedConstraint, true),
                        onMouseLeave: handleMouseLeave,
                        onClick: () =>
                          applyActions([
                            {
                              type: "DeleteElement",
                              element: linkedConstraint,
                            },
                          ]),
                      }
                    : {
                        icon: LockOpen,
                        title: t("length_lock"),
                        onClick: () =>
                          applyActions([
                            {
                              type: "CreateElement",
                              element: create_radius_dimension(
                                element,
                                mechanism.viewport,
                              ),
                            },
                          ]),
                      }
                }
              />
            )}
          </Box>
        </>
      )}

      {"positionStart" in geometry && "positionStart" in element && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              m: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <VectorInput
                value={geometry.positionStart}
                live={live}
                onChange={(pos) =>
                  applyActions([
                    {
                      type: "MoveEdgeStart",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionStart,
                      committed: true,
                    },
                  ])
                }
              />
              <VectorInput
                value={geometry.positionEnd}
                live={live}
                onChange={(pos) =>
                  applyActions([
                    {
                      type: "MoveEdgeEnd",
                      id: element.id,
                      newPosition: pos,
                      oldPosition: element.positionEnd,
                      committed: true,
                    },
                  ])
                }
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 1,
              }}
            >
              <NumberInput
                label="L"
                title={t("length")}
                kind={LENGTH}
                value={
                  geometry.type === "belt"
                    ? measure_belt_length(
                        geometry,
                        live
                          ? analysedMechanism.mechanicalElements
                          : mechanism.mechanicalElements,
                      )
                    : geometry.positionStart.distance_to(geometry.positionEnd)
                }
                live={live}
                onChange={(length) => {
                  if (element.type === "belt") {
                    const beltDim = mechanism.constraintElements.find(
                      (c) =>
                        c.type === "dimension-belt" && c.beltID === element.id,
                    );
                    if (beltDim && beltDim.type === "dimension-belt") {
                      // Persistent dimension: update its value.
                      applyActions([
                        {
                          type: "ChangeDimensionBeltValue",
                          id: beltDim.id,
                          newValue: length,
                          oldValue: beltDim.value,
                        },
                      ]);
                    } else {
                      applyActions([
                        {
                          type: "ChangeBeltLength",
                          id: element.id,
                          newLength: length,
                          oldLength: measure_belt_length(
                            element,
                            mechanism.mechanicalElements,
                          ),
                        },
                      ]);
                    }
                    return;
                  }
                  const linkedDim = mechanism.constraintElements.find(
                    (c) =>
                      c.type === "dimension-edge" && c.edgeID === element.id,
                  );
                  if (linkedDim && linkedDim.type === "dimension-edge") {
                    applyActions([
                      {
                        type: "ChangeDimensionEdgeValue",
                        id: linkedDim.id,
                        newValue: length,
                        oldValue: linkedDim.value,
                      },
                    ]);
                  } else {
                    applyActions([
                      {
                        type: "ChangeEdgeLength",
                        id: element.id,
                        newLength: length,
                        oldLength: element.positionStart.distance_to(
                          element.positionEnd,
                        ),
                      },
                    ]);
                  }
                }}
                large
                unsigned
                adornment={
                  linkedConstraint
                    ? {
                        icon: Lock,
                        title: t("length_unlock"),
                        color: "secondary",
                        onMouseEnter: () =>
                          handleMouseEnter(linkedConstraint, true),
                        onMouseLeave: handleMouseLeave,
                        onClick: () =>
                          applyActions([
                            {
                              type: "DeleteElement",
                              element: linkedConstraint,
                            },
                          ]),
                      }
                    : {
                        icon: LockOpen,
                        title: t("length_lock"),
                        onClick: () =>
                          applyActions([
                            {
                              type: "CreateElement",
                              element: create_length_dimension(
                                element,
                                mechanism.mechanicalElements,
                                mechanism.viewport,
                              ),
                            },
                          ]),
                      }
                }
              />
              {element.type !== "belt" && (
                <NumberInput
                  label="α"
                  title={t("angle")}
                  kind={ANGLE}
                  value={wrap_angle_rad(
                    geometry.positionEnd.sub(geometry.positionStart).angle(),
                  )}
                  live={live}
                  onChange={(newAngle) =>
                    applyActions([
                      {
                        type: "ChangeEdgeAngle",
                        id: element.id,
                        newAngle,
                        oldAngle: element.positionEnd
                          .sub(element.positionStart)
                          .angle(),
                      },
                    ])
                  }
                  large
                />
              )}
            </Box>
          </Box>
        </>
      )}

      <Divider sx={{ my: 1 }} />
      <ConnectionsProperties
        element={element}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        selectedIds={selectedIds}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
        mechanism={mechanism}
      />
    </Box>
  );
};

export default ElementProperties;
