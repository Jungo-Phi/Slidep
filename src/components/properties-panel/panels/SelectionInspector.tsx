import React from "react";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import { Close } from "@mui/icons-material";
import {
  Action,
  AppMode,
  CanvasState,
  ID,
  Mechanism,
  MechanicalElement,
  ProbeMetric,
  RuntimeState,
  ZERO,
} from "../../../types";
import {
  DynamicSnapshot,
  KinematicSnapshot,
} from "../../../types/runtime-state";
import { HoveredAbscissa, HoveredPart } from "../../../types/hovered-part";
import {
  MetricSample,
  get_dynamic_metric_at,
  get_metric_at,
} from "../../solver/recording/probe-series";
import { dynamic_snapshot_at } from "../../solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../../solver/recording/cohesion-field";
import { GRAVITY } from "../../../constants/physics-specs";
import { overlay_shown } from "../../../utils/element-queries";
import { element_mass } from "../../../utils/element-mass";
import { measure_belt_length } from "../../../utils/belt-geom";
import { FORCE, LENGTH, MASS } from "../../../utils/quantity-format";
import { shown_element_name } from "../../../utils";
import {
  CARD_ICON_BUTTON_SX,
  FULL_BLEED,
  HEADER_HEIGHT,
  HEADER_INSET,
  ICON_GROUP_SX,
  ROW_ICON_BUTTON_SX,
  SUBJECT_VALUES_INSET,
} from "../inspector-metrics";
import { OVERLAY_LABEL_KEYS, set_overlay } from "../overlay-actions";
import {
  InspectorValue,
  Reading,
  ReadingGroup,
  element_reading_groups,
  inspector_layout,
  layer_key,
  is_series_value,
  mass_reading_sample,
  merged_internal,
  reading_quantities,
  same_reading,
} from "../element-readings";
import { InspectedSubject } from "../selection-subject";
import { LiveParameter, live_parameters } from "../live-parameters";
import { format_metric, format_scalar } from "../metric-display";
import CohesionDiagrams from "../components/CohesionDiagrams";
import ElementDisplay from "../components/ElementDisplay";
import HostRow from "../components/HostRow";
import LoadInspector from "../components/LoadInspector";
import MaterialProfileSection from "../components/MaterialProfileSection";
import NumberInput from "../components/NumberInput";
import ProbeMetricsButton from "../components/ProbeMetricsButton";
import SignedNumberInput from "../components/SignedNumberInput";
import { MetricRow, MetricValues, ValueRow } from "../components/MetricRow";
import ReadingRow from "../components/ReadingRow";
import { t, tn } from "../../../i18n";
import type { FocusedOverlay } from "../../canvas/drawing/drawing-functions";
import type { BeamElement } from "../../../types/element";

/** A reading's own name: its layer, and the end of the element it is read at where there are two. */
const reading_label = (layerLabel: string, which?: "node" | "start" | "end") =>
  which === "start"
    ? `${layerLabel} ${t("point_start")}`
    : which === "end"
      ? `${layerLabel} ${t("point_end")}`
      : layerLabel;

/** What a card is told the selection holds when its own element is not what is selected. */
const NOTHING_SELECTED: ID[] = [];

interface SelectionInspectorProps {
  subject: InspectedSubject | undefined;
  /** The edited mechanism: every value written goes to it, and every live parameter is read off it so an edit lands relative to the value actually stored. */
  mechanism: Mechanism;
  /** The same mechanism in the pose on screen, where a load's own resolved vector is read from. */
  analysedMechanism: Mechanism;
  runtimeState: RuntimeState;
  appMode: AppMode;
  applyActions: (actions: Action[]) => void;
  /** Names one reading as selected, the same register a click on its own arrow reports into. */
  setFocusedOverlay: (overlay: FocusedOverlay) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  /** Publishes the abscissa hovered on a beam's own N/T/Mf diagrams, for the canvas to mark. */
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
  /** Elements a motion carrying no inertia moves, as the analysis below measured them — their missing mass is what leaves it without one. */
  inertiaFreeElements: ReadonlySet<ID>;
}

/**
 * What the simulation says about one thing: the element, load or overlay reading the selection points at.
 * The panel's own miniature of the elements tab, laid out in the same order and kept to what a running simulation can answer or absorb — the live values, the quantities measured at the instant on screen, and the readings the canvas draws over it.
 * What an element shows folded and unfolded is decided per element type (`inspector_layout`).
 *
 * Sized by its own content: what keeps the charts below from moving as the selection changes is the scroll region it is held in, not any height it reserves for itself (see `AnalysisPanel`).
 */
export const SelectionInspector: React.FC<SelectionInspectorProps> = ({
  subject,
  mechanism,
  analysedMechanism,
  runtimeState,
  appMode,
  applyActions,
  setFocusedOverlay,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  setHoveredAbscissa,
  inertiaFreeElements,
}) => {
  const dynamic = appMode === "dynamic";
  const snapshot =
    (dynamic &&
      dynamic_snapshot_at(
        runtimeState.simulationSnapshots as DynamicSnapshot[],
        runtimeState.time,
      )) ||
    undefined;

  // The same element at the instant on screen: parameter values are read off it, writes are built against the element itself (see `rebased_bundle`).
  const shown_of = <T extends MechanicalElement>(el: T): T =>
    (analysedMechanism.mechanicalElements.find((e) => e.id === el.id) as
      | T
      | undefined) ?? el;

  const sample_of = (
    element: MechanicalElement,
    metric: ProbeMetric,
  ): MetricSample | undefined =>
    metric === "weight" || metric === "inertia" || metric === "inertia-moment"
      ? mass_reading_sample(
          shown_of(element),
          metric,
          snapshot,
          analysedMechanism.simulation.gravity,
          analysedMechanism.materials,
          analysedMechanism.profiles,
        )
      : dynamic
        ? get_dynamic_metric_at(
            element,
            metric,
            runtimeState.simulationSnapshots as DynamicSnapshot[],
            runtimeState.time,
          )
        : get_metric_at(
            element,
            metric,
            runtimeState.simulationSnapshots as KinematicSnapshot[],
            runtimeState.time,
          );

  const formatted_of = (element: MechanicalElement, metrics: ProbeMetric[]) =>
    metrics.map((metric) => {
      const sample = sample_of(element, metric);
      return sample && format_metric(sample);
    });

  const focusedReading =
    subject?.kind === "reading" ? subject.reading.focus : null;

  // Resting on a row points the canvas at that reading, the same register a cursor resting on its own arrow sets: the canvas draws it, and lights up the element it is read from.
  const hover_reading = (reading: Reading, hovered: boolean) =>
    setHoveredPart(
      hovered
        ? { type: "Overlay", position: ZERO, reading: reading.focus }
        : { type: "Void", position: ZERO },
    );

  // The layer whose eye the cursor is resting on: every row that eye commands lights up, since a layer is shown or hidden whole.
  const [pointedLayer, setPointedLayer] = React.useState<string | null>(null);
  // The reading the cursor is on, wherever it is: a row lights up for its own arrow out on the canvas exactly as that arrow lights up for its row.
  const pointedReading =
    hoveredPart.type === "Overlay" ? hoveredPart.reading : null;

  const selectedBeam: BeamElement | undefined =
    subject?.kind === "element" && subject.element.type === "beam"
      ? subject.element
      : undefined;
  /**
   * The beam whose N/T/Mf field is being read.
   * A merged internal-effort reading IS that field — its two ends are only where the curves start and stop — so this is the one subject that needs it computed.
   */
  const diagramBeam: BeamElement | undefined =
    subject?.kind === "reading" &&
    merged_internal(subject.reading.focus) &&
    subject.element.type === "beam"
      ? subject.element
      : undefined;
  // Off the same nearest snapshot every reading here uses, rather than the live per-frame ref the canvas draws from.
  const cohesionField = React.useMemo(() => {
    const cohesion = snapshot?.beamCohesion?.find(
      (c) => c.beamID === diagramBeam?.id,
    );
    if (!diagramBeam || !snapshot || !cohesion) return undefined;
    const shownBeam =
      analysedMechanism.mechanicalElements.find(
        (el): el is BeamElement =>
          el.type === "beam" && el.id === diagramBeam.id,
      ) ?? diagramBeam;
    return compute_cohesion_field(
      shownBeam,
      analysedMechanism.materials,
      analysedMechanism.profiles,
      cohesion,
      analysedMechanism.loads,
      snapshot,
      analysedMechanism.simulation.gravity ? GRAVITY : ZERO,
    );
  }, [diagramBeam, snapshot, analysedMechanism]);
  // Clears the canvas's own marker when the diagrams go away — nothing else ever un-sets it once one stops being hovered without the mouse ever leaving it.
  React.useEffect(() => {
    if (!diagramBeam) {
      setHoveredAbscissa(null);
      return;
    }
    return () => setHoveredAbscissa(null);
  }, [diagramBeam, setHoveredAbscissa]);

  /**
   * What one layer is called, and the eye that shows it.
   * A support reaction has no flag of its own: its eye writes the mechanism-wide free-body switch, so turning one off turns them all off.
   */
  const layer_display = (element: MechanicalElement, group: ReadingGroup) => {
    const overlay =
      group.layer.kind === "element-overlay" ? group.layer.overlay : undefined;
    const key = layer_key(group.layer);
    return {
      key,
      label: overlay
        ? tn(OVERLAY_LABEL_KEYS[overlay], 1)
        : t("reaction_support_one"),
      eye: {
        shown: overlay
          ? overlay_shown(element, overlay)
          : mechanism.simulation.supportReactions,
        onToggle: () =>
          overlay
            ? applyActions(
                set_overlay(element, overlay, !overlay_shown(element, overlay)),
              )
            : applyActions([
                {
                  type: "SetSupportReactions",
                  enabled: !mechanism.simulation.supportReactions,
                },
              ]),
        onEyeHoverChange: (hovered: boolean) =>
          setPointedLayer(hovered ? key : null),
      },
    };
  };

  /**
   * One row per reading, each carrying the eye of its own layer.
   * Every row reads the same way, and the eye sits on each of the rows it commands rather than above them — what it hides is the layer, so pointing at it lights up its whole set.
   * `rowCount` is how many rows the layer shows in all, the ones drawn here included.
   */
  const reading_rows = (
    element: MechanicalElement,
    group: ReadingGroup,
    readings: Reading[],
    rowCount = group.readings.length,
  ) => {
    const { key, label, eye } = layer_display(element, group);
    // A trajectory is drawn without ever being read, so its row carries the eye alone.
    if (group.readings.length === 0)
      return <ReadingRow key={key} icon={group.icon} label={label} {...eye} />;

    return readings.map((reading) => (
      <ReadingRow
        key={`${key}-${reading.focus.which ?? "node"}`}
        icon={reading.icon}
        label={reading_label(label, reading.focus.which)}
        value={
          // A reading with no quantity to summarise shows nothing, not a dash: a beam's internal effort is a field, and there is no figure missing to announce.
          reading.metrics.length > 0 && (
            <MetricValues
              formatted={formatted_of(element, reading.metrics)}
              summary
            />
          )
        }
        selected={
          !!focusedReading && same_reading(focusedReading, reading.focus)
        }
        commanded={pointedLayer === key && rowCount > 1}
        pointed={!!pointedReading && same_reading(pointedReading, reading.focus)}
        onClick={() => setFocusedOverlay(reading.focus)}
        onHoverChange={(hovered) => hover_reading(reading, hovered)}
        {...eye}
      />
    ));
  };

  /**
   * Drops the selection, the one way out every subject of this panel offers.
   * Rounded to match what it sits in: a card's own shapes are round, a row's are not.
   */
  const deselect_button = (
    sx: typeof ROW_ICON_BUTTON_SX | typeof CARD_ICON_BUTTON_SX = ROW_ICON_BUTTON_SX,
  ) => (
    <Tooltip title={t("deselect")}>
      <IconButton
        size="small"
        onClick={() => setCanvasState({ type: "Selecting" })}
        sx={sx}
      >
        <Close fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  /**
   * The subject's own element, named — the top row when the element IS the subject, and a plain link back to it further down when something else is.
   * `owned` false where the element is not what is selected: the card must not read as selected, and clicking it selects the element rather than following through to its own tab.
   * The subject's own card is `medium` and carries the controls that belong to it, so that every kind of subject opens the panel the same way.
   */
  const card = (
    element: MechanicalElement,
    owned = true,
    trailingControls?: React.ReactNode,
  ) => (
    <ElementDisplay
      element={element}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={owned ? selectedIds : NOTHING_SELECTED}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      size={owned ? "medium" : "small"}
      editable={false}
      trailingControls={trailingControls}
    />
  );

  const parameter_input = (parameter: LiveParameter) =>
    parameter.signed ? (
      <SignedNumberInput
        key={parameter.label}
        label={parameter.label}
        title={t(parameter.titleKey)}
        kind={parameter.kind}
        value={parameter.value}
        onChange={(value) => applyActions(parameter.change(value))}
      />
    ) : (
      <NumberInput
        key={parameter.label}
        label={parameter.label}
        title={t(parameter.titleKey)}
        kind={parameter.kind}
        value={parameter.value}
        onChange={(value) => applyActions(parameter.change(value))}
        unsigned
        precision={2}
        accent={parameter.slot === "header"}
      />
    );

  const parameter_row = (parameters: LiveParameter[]) =>
    parameters.length > 0 && (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 1,
          py: 0.5,
        }}
      >
        {parameters.map(parameter_input)}
      </Box>
    );

  const value_row = (
    element: MechanicalElement,
    value: InspectorValue,
    label?: string,
  ) => {
    if (value === "mass")
      return (
        <ValueRow
          key={value}
          label={label ?? t("mass")}
          formatted={format_scalar(
            element_mass(
              shown_of(element),
              analysedMechanism.materials,
              analysedMechanism.profiles,
            ),
            MASS,
          )}
          alert={
            inertiaFreeElements.has(element.id)
              ? t("mass_no_inertia_hint")
              : undefined
          }
        />
      );
    // A belt's own length is the path it follows around its pulleys, measured on the pose on screen: no recorded series carries it, and it reads the same in edition as under a running simulation.
    if (value === "belt-length")
      return (
        <ValueRow
          key={value}
          label={label ?? t("length")}
          formatted={
            element.type === "belt"
              ? format_scalar(
                  measure_belt_length(
                    shown_of(element),
                    analysedMechanism.mechanicalElements,
                  ),
                  LENGTH,
                )
              : undefined
          }
        />
      );
    return (
      <MetricRow
        key={value}
        metric={value}
        sample={sample_of(element, value)}
        label={label}
      />
    );
  };

  const element_body = (element: MechanicalElement) => {
    const parameters = live_parameters(element, shown_of(element));
    const in_slot = (slot: LiveParameter["slot"]) =>
      parameters.filter((parameter) => parameter.slot === slot);
    const layout = inspector_layout(element, dynamic);
    const layerRows = element_reading_groups(element, snapshot, dynamic).map(
      (group) => reading_rows(element, group, group.readings),
    );
    const valueRows = layout.values.map((value) => value_row(element, value));
    // Each block stays in one run, and only their order is the element type's to choose (see `InspectorLayout.layersFirst`).
    const [firstBlock, secondBlock] = layout.layersFirst
      ? [layerRows, valueRows]
      : [valueRows, layerRows];
    const physical = in_slot("physical");

    return (
      <>
        {/* Beside the name, what the elements tab puts there: the one value that defines the element, then the two ways out — to its probes, and out of the selection. */}
        <Box sx={HEADER_INSET}>
          {card(
            element,
            true,
            <>
              {in_slot("header").map(parameter_input)}
              <Box sx={ICON_GROUP_SX}>
                <ProbeMetricsButton
                  element={element}
                  applyActions={applyActions}
                  size={22}
                />
                {deselect_button(CARD_ICON_BUTTON_SX)}
              </Box>
            </>,
          )}
        </Box>
        <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
        {parameter_row(in_slot("drive"))}
        {firstBlock}
        {firstBlock.length > 0 && secondBlock.length > 0 && (
          <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
        )}
        {secondBlock}
        {(physical.length > 0 || selectedBeam) && (
          <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
        )}
        {parameter_row(physical)}
        {selectedBeam && (
          <MaterialProfileSection
            elements={[selectedBeam]}
            shownElements={[shown_of(selectedBeam)]}
            materials={analysedMechanism.materials}
            profiles={analysedMechanism.profiles}
            applyActions={applyActions}
            compact
          />
        )}
      </>
    );
  };

  /** One row per strand of `belt`, in path order, each named by the pulleys it runs between; a tension the pose leaves open reads as a dash. */
  const strand_rows = (belt: MechanicalElement) => {
    const name_of = (gearID: ID | undefined, terminal: "point_start" | "point_end") => {
      if (gearID === undefined) return `${shown_element_name(belt)} ${t(terminal)}`;
      return shown_element_name(
        analysedMechanism.mechanicalElements.find((el) => el.id === gearID),
      );
    };
    return (snapshot?.beltStrands ?? [])
      .filter((strand) => strand.beltID === belt.id)
      .map((strand, i) => (
        <ValueRow
          key={`strand-${i}`}
          label={`${name_of(strand.fromGear, "point_start")} – ${name_of(strand.toGear, "point_end")}`}
          formatted={
            strand.determined ? format_scalar(strand.tension, FORCE) : undefined
          }
        />
      ));
  };

  const reading_body = (
    reading_subject: Extract<InspectedSubject, { kind: "reading" }>,
  ) => {
    const { element, reading } = reading_subject;
    const groups = element_reading_groups(element, snapshot, dynamic);
    const group = groups.find((g) =>
      g.readings.some((r) => same_reading(r.focus, reading.focus)),
    );
    const layer = group && layer_display(element, group);
    // A reaction names both its quantities, but a hinge reports no couple: what has nothing to say here is left out rather than shown as a blank line.
    const spelled = reading_quantities(reading, element);
    const read = spelled.filter(
      ({ value }) =>
        !is_series_value(value) ||
        (sample_of(element, value)?.values.length ?? 0) > 0,
    );
    const quantities = read.length > 0 ? read : spelled.slice(0, 1);
    // The reading being read carries its own eye, here on its title: it is the one thing this panel is about, and switching it off from anywhere else would mean leaving it first.
    const siblings =
      group?.readings.filter((r) => !same_reading(r.focus, reading.focus)) ?? [];
    return (
      <>
        {/* The subject, at the top: a reading is what the reader clicked, so its own row opens the panel, and answers the pointer the way a card does — resting on it draws the arrow and lights the element it is read from, and the canvas lights the row back. */}
        <Box sx={HEADER_INSET}>
          <ReadingRow
            icon={reading.icon}
            label={reading_label(layer?.label ?? "", reading.focus.which)}
            strong
            height={HEADER_HEIGHT}
            pointed={
              !!pointedReading && same_reading(pointedReading, reading.focus)
            }
            onHoverChange={(hovered) => hover_reading(reading, hovered)}
            trailing={deselect_button()}
            {...layer?.eye}
          />
        </Box>
        <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
        {/* One line per quantity, each named for what it adds rather than for itself: the heading above has already said which reading this is, and at which end. */}
        <Box sx={SUBJECT_VALUES_INSET}>
          {quantities.map(({ value, labelKey }) =>
            value_row(element, value, t(labelKey)),
          )}
          {element.type === "belt" &&
            merged_internal(reading.focus) &&
            strand_rows(element)}
        </Box>
        {/* The reading itself, for a beam: its effort is a field along the member, not a figure at a point. */}
        {diagramBeam && (
          <CohesionDiagrams
            field={cohesionField}
            forcePoolMax={runtimeState.negligibilityPool.force}
            momentPoolMax={runtimeState.negligibilityPool.moment}
            emptyMessage={t("chart_waiting")}
            onHoverS={(s) =>
              setHoveredAbscissa(
                s === null ? null : { beamID: diagramBeam.id, s },
              )
            }
          />
        )}
        <HostRow
          label={t("reading_read_from")}
          element={element}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
        />
        {/* Whatever else its own layer holds: the other end of a beam, and nothing at all for the layers that carry one reading. */}
        {group && siblings.length > 0 && (
          <>
            <Divider sx={{ my: 0.5, ...FULL_BLEED }} />
            {reading_rows(element, group, siblings)}
          </>
        )}
      </>
    );
  };

  const load_body = (
    load_subject: Extract<InspectedSubject, { kind: "load" }>,
  ) => (
    <LoadInspector
      load={load_subject.load}
      host={load_subject.host}
      mechanicalElements={mechanism.mechanicalElements}
      shownLoad={
        analysedMechanism.loads.find((l) => l.id === load_subject.load.id) ??
        load_subject.load
      }
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={selectedIds}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      onDeselect={() => setCanvasState({ type: "Selecting" })}
    />
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
        px: 2,
      }}
    >
      <Box
        sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}
      >
        {subject === undefined ? (
          <Typography
            sx={{
              textAlign: "center",
              fontSize: "0.875rem",
              color: "text.disabled",
              p: 1,
            }}
          >
            {t("measures_select_element")}
          </Typography>
        ) : subject.kind === "element" ? (
          element_body(subject.element)
        ) : subject.kind === "reading" ? (
          reading_body(subject)
        ) : (
          load_body(subject)
        )}
      </Box>
    </Box>
  );
};

export default SelectionInspector;
