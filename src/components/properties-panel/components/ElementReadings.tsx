import React from "react";
import { Box } from "@mui/material";
import {
  Action,
  AppMode,
  BeamElement,
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
import { HoveredAbscissaSource, HoveredPart } from "../../../types/hovered-part";
import {
  MetricSample,
  get_dynamic_metric_at,
  get_metric_at,
} from "../../solver/recording/probe-series";
import {
  apply_dynamic_snapshot_to_mechanism,
  dynamic_snapshot_at,
  effort_snapshot_at,
} from "../../solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../../solver/recording/cohesion-field";
import { GRAVITY } from "../../../constants/physics-specs";
import { available_overlays, overlay_shown } from "../../../utils/element-queries";
import { element_mass } from "../../../utils/element-mass";
import { shown_element_name } from "../../../utils";
import { FORCE, MASS } from "../../../utils/quantity-format";
import { SUBJECT_VALUES_INSET } from "../inspector-metrics";
import {
  OVERLAY_LABEL_KEYS,
  overlay_label_count,
  set_overlay,
} from "../overlay-actions";
import {
  InspectorValue,
  Reading,
  ReadingGroup,
  element_reading_groups,
  inspector_layout,
  is_series_value,
  layer_key,
  mass_reading_sample,
  merged_internal,
  overlay_icon,
  reading_quantities,
  same_reading,
} from "../element-readings";
import { format_metric, format_scalar } from "../metric-display";
import CohesionDiagrams from "./CohesionDiagrams";
import { MetricRow, MetricValues, ValueRow } from "./MetricRow";
import ReadingRow from "./ReadingRow";
import { t, tn } from "../../../i18n";
import type { FocusedOverlay } from "../../canvas/drawing/drawing-functions";

/**
 * Whether the element's page already shows `value` in another section: the pose in its geometry, a beam's mass in its physics, a motor's power under its motor.
 * Only an edge has an angle of its own there; a gear's turns with the gear, and is read here.
 */
const shown_elsewhere = (element: MechanicalElement, value: InspectorValue) =>
  value === "position" ||
  value === "length" ||
  value === "belt-length" ||
  value === "mass" ||
  value === "motor-power" ||
  (value === "angle" && "positionStart" in element);

/** A reading's own name: its layer, and the end of the element it is read at where there are two. */
const reading_label = (layerLabel: string, which?: "node" | "start" | "end") =>
  which === "start"
    ? `${layerLabel} ${t("point_start")}`
    : which === "end"
      ? `${layerLabel} ${t("point_end")}`
      : layerLabel;

interface ElementReadingsProps {
  element: MechanicalElement;
  mechanism: Mechanism;
  /** The same mechanism in the pose on screen, which every value here is read off. */
  analysedMechanism: Mechanism;
  runtimeState: RuntimeState;
  appMode: AppMode;
  applyActions: (actions: Action[]) => void;
  /** The reading named as selected, here or by a click on its arrow on the canvas: if it is one of this element's, it is unfolded in place. */
  focusedOverlay: FocusedOverlay | null;
  setFocusedOverlay: (overlay: FocusedOverlay | null) => void;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  /** Publishes the abscissa hovered on a beam's own N/T/Mf diagrams, for the canvas to mark. */
  setHoveredAbscissa: (hovered: HoveredAbscissaSource | null) => void;
}

/**
 * What an element's page reads of it: one row per overlay reading, each carrying the eye of its own layer, and the values no layer draws.
 * In edition there is nothing to read yet, so the rows are the eyes alone, one per layer.
 *
 * A quantity a layer draws is a link, not a value: its row sums it up, and a click unfolds it in place — its quantities one per line, a beam's N/T/Mf diagrams, a belt's strands.
 * What each element type lists, and whether its values or its readings come first, is decided per type (`inspector_layout`).
 */
export const ElementReadings: React.FC<ElementReadingsProps> = ({
  element,
  mechanism,
  analysedMechanism,
  runtimeState,
  appMode,
  applyActions,
  focusedOverlay,
  setFocusedOverlay,
  hoveredPart,
  setHoveredPart,
  setHoveredAbscissa,
}) => {
  const simulating = appMode !== "edition";
  const dynamic = appMode === "dynamic";
  const snapshot =
    (dynamic &&
      dynamic_snapshot_at(
        runtimeState.simulationSnapshots as DynamicSnapshot[],
        runtimeState.time,
      )) ||
    undefined;

  // The same element at the instant on screen: what every value is read off.
  const shown = (analysedMechanism.mechanicalElements.find(
    (e) => e.id === element.id,
  ) ?? element) as MechanicalElement;

  const sample_of = (metric: ProbeMetric): MetricSample | undefined =>
    metric === "weight" || metric === "inertia" || metric === "inertia-moment"
      ? mass_reading_sample(
          shown,
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

  const formatted_of = (metrics: ProbeMetric[]) =>
    metrics.map((metric) => {
      const sample = sample_of(metric);
      return sample && format_metric(sample);
    });

  // Only one of this element's own readings unfolds here; one of another element's is that element's page's business.
  const focused =
    focusedOverlay && focusedOverlay.elementID === element.id
      ? focusedOverlay
      : null;

  // Resting on a row points the canvas at that reading, the same register a cursor resting on its own arrow sets.
  const hover_reading = (reading: Reading, hovered: boolean) =>
    setHoveredPart(
      hovered
        ? { type: "Overlay", position: ZERO, reading: reading.focus }
        : { type: "Void", position: ZERO },
    );

  // The layer whose eye the cursor is resting on: every row that eye commands lights up, since a layer is shown or hidden whole.
  const [pointedLayer, setPointedLayer] = React.useState<string | null>(null);
  const pointedReading =
    hoveredPart.type === "Overlay" ? hoveredPart.reading : null;

  // A merged internal-effort reading of a beam IS its N/T/Mf field, so this is the one reading that needs it computed.
  const diagramBeam: BeamElement | undefined =
    focused && merged_internal(focused) && element.type === "beam"
      ? element
      : undefined;
  // Read whole at the recorded instant nearest the one on screen, pose included, like every other effort shown here: see `effort_snapshot_at`.
  const effortSnapshot =
    (dynamic &&
      effort_snapshot_at(
        runtimeState.simulationSnapshots as DynamicSnapshot[],
        runtimeState.time,
      )) ||
    undefined;
  const cohesionField = React.useMemo(() => {
    const cohesion = effortSnapshot?.beamCohesion?.find(
      (c) => c.beamID === diagramBeam?.id,
    );
    if (!diagramBeam || !effortSnapshot || !cohesion) return undefined;
    const shownBeam =
      apply_dynamic_snapshot_to_mechanism(
        analysedMechanism,
        effortSnapshot,
      ).mechanicalElements.find(
        (el): el is BeamElement =>
          el.type === "beam" && el.id === diagramBeam.id,
      ) ?? diagramBeam;
    return compute_cohesion_field(
      shownBeam,
      analysedMechanism.materials,
      analysedMechanism.profiles,
      cohesion,
      analysedMechanism.loads,
      effortSnapshot,
      analysedMechanism.simulation.gravity ? GRAVITY : ZERO,
    );
  }, [diagramBeam, effortSnapshot, analysedMechanism]);
  // Clears the canvas's own marker when the diagrams go away — nothing else ever un-sets it once one stops being hovered without the mouse ever leaving it.
  React.useEffect(() => {
    if (!diagramBeam) {
      setHoveredAbscissa(null);
      return;
    }
    return () => setHoveredAbscissa(null);
  }, [diagramBeam, setHoveredAbscissa]);

  // The unfolded reading is brought into view: it may sit well down the page, and a click on its arrow out on the canvas is what unfolded it.
  const unfoldedRef = React.useRef<HTMLDivElement>(null);
  const focusKey = focused ? `${focused.kind}-${focused.which ?? ""}` : null;
  React.useEffect(() => {
    if (focusKey)
      unfoldedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusKey]);

  // In edition nothing is read yet: one eye per layer the element can show, so it is set before the run.
  if (!simulating)
    return (
      <Box sx={{ px: 2, display: "flex", flexDirection: "column", gap: 0.25 }}>
        {available_overlays(element).map((kind) => {
          const on = overlay_shown(element, kind);
          return (
            <ReadingRow
              key={kind}
              icon={overlay_icon(kind)}
              label={tn(OVERLAY_LABEL_KEYS[kind], overlay_label_count([element], kind))}
              shown={on}
              onToggle={() => applyActions(set_overlay(element, kind, !on))}
            />
          );
        })}
      </Box>
    );

  /**
   * What one layer is called, and the eye that shows it.
   * A support reaction has no flag of its own: its eye writes the mechanism-wide free-body switch, so turning one off turns them all off.
   */
  const layer_display = (group: ReadingGroup) => {
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

  const value_row = (value: InspectorValue, label?: string) => {
    if (value === "mass")
      return (
        <ValueRow
          key={value}
          label={label ?? t("mass")}
          formatted={format_scalar(
            element_mass(
              shown,
              analysedMechanism.materials,
              analysedMechanism.profiles,
            ),
            MASS,
          )}
        />
      );
    if (!is_series_value(value)) return null;
    return (
      <MetricRow key={value} metric={value} sample={sample_of(value)} label={label} />
    );
  };

  /** One row per strand of a belt, in path order, each named by the pulleys it runs between; a tension the pose leaves open reads as a dash. */
  const strand_rows = () => {
    const name_of = (
      gearID: string | undefined,
      terminal: "point_start" | "point_end",
    ) => {
      if (gearID === undefined)
        return `${shown_element_name(element)} ${t(terminal)}`;
      return shown_element_name(
        analysedMechanism.mechanicalElements.find((el) => el.id === gearID),
      );
    };
    return (snapshot?.beltStrands ?? [])
      .filter((strand) => strand.beltID === element.id)
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

  /** A reading unfolded: one line per quantity, each named for what it adds rather than for itself — the row above has already said which reading this is. */
  const unfolded = (reading: Reading) => {
    // A reaction names both its quantities, but a hinge reports no couple: what has nothing to say here is left out rather than shown as a blank line.
    const spelled = reading_quantities(reading, element);
    const read = spelled.filter(
      ({ value }) =>
        !is_series_value(value) || (sample_of(value)?.values.length ?? 0) > 0,
    );
    const quantities = read.length > 0 ? read : spelled.slice(0, 1);
    return (
      <Box ref={unfoldedRef} sx={{ pb: 0.5 }}>
        <Box sx={SUBJECT_VALUES_INSET}>
          {quantities.map(({ value, labelKey }) => value_row(value, t(labelKey)))}
          {element.type === "belt" && merged_internal(reading.focus) && strand_rows()}
        </Box>
        {/* A beam's effort is a field along the member, not a figure at a point. */}
        {diagramBeam && (
          <CohesionDiagrams
            field={cohesionField}
            forcePoolMax={runtimeState.negligibilityPool.force}
            momentPoolMax={runtimeState.negligibilityPool.moment}
            emptyMessage={t("chart_waiting")}
            beamID={diagramBeam.id}
            onHoverAbscissa={setHoveredAbscissa}
          />
        )}
      </Box>
    );
  };

  /**
   * One row per reading, each carrying the eye of its own layer.
   * The eye sits on each of the rows it commands rather than above them — what it hides is the layer, so pointing at it lights up its whole set.
   */
  const reading_rows = (group: ReadingGroup) => {
    const { key, label, eye } = layer_display(group);
    // A trajectory is drawn without ever being read, so its row carries the eye alone.
    if (group.readings.length === 0)
      return <ReadingRow key={key} icon={group.icon} label={label} {...eye} />;

    return group.readings.map((reading) => {
      const selected = !!focused && same_reading(focused, reading.focus);
      return (
        <React.Fragment key={`${key}-${reading.focus.which ?? "node"}`}>
          <ReadingRow
            icon={reading.icon}
            label={reading_label(label, reading.focus.which)}
            value={
              // A reading with no quantity to summarise shows nothing, not a dash: a beam's internal effort is a field, and there is no figure missing to announce.
              reading.metrics.length > 0 && (
                <MetricValues formatted={formatted_of(reading.metrics)} summary />
              )
            }
            selected={selected}
            commanded={pointedLayer === key && group.readings.length > 1}
            pointed={
              !!pointedReading && same_reading(pointedReading, reading.focus)
            }
            // A second click folds it back.
            onClick={() => setFocusedOverlay(selected ? null : reading.focus)}
            onHoverChange={(hovered) => hover_reading(reading, hovered)}
            {...eye}
          />
          {selected && unfolded(reading)}
        </React.Fragment>
      );
    });
  };

  const layout = inspector_layout(element, dynamic);
  const layerRows = element_reading_groups(element, snapshot, dynamic).flatMap(
    (group) => reading_rows(group),
  );
  const valueRows = layout.values
    .filter((value) => !shown_elsewhere(element, value))
    .map((value) => value_row(value));
  // Each block stays in one run, and only their order is the element type's to choose (see `InspectorLayout.layersFirst`).
  const [firstBlock, secondBlock] = layout.layersFirst
    ? [layerRows, valueRows]
    : [valueRows, layerRows];

  return (
    <Box sx={{ px: 2, display: "flex", flexDirection: "column", gap: 0.25 }}>
      {firstBlock}
      {secondBlock}
    </Box>
  );
};

export default ElementReadings;
