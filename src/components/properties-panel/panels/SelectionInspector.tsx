import React from "react";
import { Box, Divider, Typography } from "@mui/material";
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
import { OVERLAY_LABEL_KEYS, set_overlay } from "../overlay-actions";
import {
  Reading,
  ReadingGroup,
  element_reading_groups,
  inspector_value_metrics,
  layer_key,
  mass_reading_sample,
  same_reading,
} from "../element-readings";
import { InspectedSubject } from "../selection-subject";
import { live_parameters } from "../live-parameters";
import { format_metric } from "../metric-display";
import CohesionDiagrams from "../components/CohesionDiagrams";
import ElementDisplay from "../components/ElementDisplay";
import LoadsSection from "../components/LoadsSection";
import MaterialProfileSection from "../components/MaterialProfileSection";
import NumberInput from "../components/NumberInput";
import ProbeMetricsButton from "../components/ProbeMetricsButton";
import SignedNumberInput from "../components/SignedNumberInput";
import { MetricRow, MetricValues } from "../components/MetricRow";
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
}

/**
 * What the simulation says about one thing: the element, load or overlay reading the selection points at.
 * The panel's own miniature of the elements tab, kept to what a running simulation can answer or absorb — the live values, the quantities measured at the instant on screen, and the readings the canvas draws over it.
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

  // The N/T/Mf field of the beam being read, off the same nearest snapshot every reading here uses rather than the live per-frame ref the canvas draws from.
  const selectedBeam: BeamElement | undefined =
    subject?.kind === "element" && subject.element.type === "beam"
      ? subject.element
      : undefined;
  const cohesionField = React.useMemo(() => {
    const cohesion = snapshot?.beamCohesion?.find(
      (c) => c.beamID === selectedBeam?.id,
    );
    if (!selectedBeam || !snapshot || !cohesion) return undefined;
    const shownBeam =
      analysedMechanism.mechanicalElements.find(
        (el): el is BeamElement =>
          el.type === "beam" && el.id === selectedBeam.id,
      ) ?? selectedBeam;
    return compute_cohesion_field(
      shownBeam,
      analysedMechanism.materials,
      analysedMechanism.profiles,
      cohesion,
      analysedMechanism.loads,
      snapshot,
      analysedMechanism.simulation.gravity ? GRAVITY : ZERO,
    );
  }, [selectedBeam, snapshot, analysedMechanism]);
  // Clears the canvas's own marker when the diagrams go away — nothing else ever un-sets it once one stops being hovered without the mouse ever leaving it.
  React.useEffect(() => {
    if (!selectedBeam) {
      setHoveredAbscissa(null);
      return;
    }
    return () => setHoveredAbscissa(null);
  }, [selectedBeam, setHoveredAbscissa]);

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
   */
  const reading_rows = (
    element: MechanicalElement,
    group: ReadingGroup,
    readings: Reading[],
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
          <MetricValues
            formatted={formatted_of(element, reading.metrics)}
            summary
          />
        }
        selected={
          !!focusedReading && same_reading(focusedReading, reading.focus)
        }
        commanded={pointedLayer === key && group.readings.length > 1}
        pointed={!!pointedReading && same_reading(pointedReading, reading.focus)}
        onClick={() => setFocusedOverlay(reading.focus)}
        onHoverChange={(hovered) => hover_reading(reading, hovered)}
        {...eye}
      />
    ));
  };

  /**
   * The subject's own element, named.
   * `owned` false where the element is not what is selected — a reading is, and its element only carries it: the card must not read as selected, and clicking it selects the element rather than following through to its own tab.
   */
  const card = (element: MechanicalElement, owned = true) => (
    <ElementDisplay
      element={element}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={owned ? selectedIds : NOTHING_SELECTED}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      size="small"
      editable={false}
    />
  );

  const element_body = (element: MechanicalElement) => {
    const parameters = live_parameters(element, shown_of(element));
    const groups = element_reading_groups(element, snapshot, dynamic);

    return (
      <>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{card(element)}</Box>
          <ProbeMetricsButton
            element={element}
            applyActions={applyActions}
            size={22}
          />
        </Box>
        {parameters.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 1,
              py: 0.5,
            }}
          >
            {parameters.map((parameter) =>
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
                />
              ),
            )}
          </Box>
        )}
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
        {inspector_value_metrics(element, dynamic).map((metric) => (
          <MetricRow
            key={metric}
            metric={metric}
            sample={sample_of(element, metric)}
          />
        ))}
        {groups.length > 0 && <Divider sx={{ my: 0.5 }} />}
        {groups.map((group) => reading_rows(element, group, group.readings))}
        {/* Dynamic mode only, and silently: the kinematic solver computes no internal force, so a beam there has nothing to say rather than something missing to announce. */}
        {dynamic && selectedBeam && (
          <CohesionDiagrams
            field={cohesionField}
            forcePoolMax={runtimeState.negligibilityPool.force}
            momentPoolMax={runtimeState.negligibilityPool.moment}
            emptyMessage={t("chart_waiting")}
            onHoverS={(s) =>
              setHoveredAbscissa(
                s === null ? null : { beamID: selectedBeam.id, s },
              )
            }
          />
        )}
      </>
    );
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
    const read = reading.metrics.filter(
      (metric) => (sample_of(element, metric)?.values.length ?? 0) > 0,
    );
    // The reading being read carries its own eye, here on its title: it is the one thing this panel is about, and switching it off from anywhere else would mean leaving it first.
    const siblings =
      group?.readings.filter((r) => !same_reading(r.focus, reading.focus)) ?? [];
    return (
      <>
        <ReadingRow
          icon={reading.icon}
          label={reading_label(layer?.label ?? "", reading.focus.which)}
          {...layer?.eye}
        />
        {/* One line per quantity here, unlike the rows that lead to this one: a reaction is read as a resultant AND a couple, each with its own components. */}
        {(read.length > 0 ? read : reading.metrics.slice(0, 1)).map((metric) => (
          <MetricRow
            key={metric}
            metric={metric}
            sample={sample_of(element, metric)}
          />
        ))}
        {card(element, false)}
        {/* Whatever else its own layer holds: the other end of a beam, and nothing at all for the layers that carry one reading. */}
        {group && siblings.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            {reading_rows(element, group, siblings)}
          </>
        )}
      </>
    );
  };

  const load_body = (
    load_subject: Extract<InspectedSubject, { kind: "load" }>,
  ) => (
    <LoadsSection
      element={load_subject.host}
      mechanicalElements={mechanism.mechanicalElements}
      loads={[load_subject.load]}
      displayLoads={analysedMechanism.loads}
      selectedLoadID={load_subject.load.id}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={selectedIds}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
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
