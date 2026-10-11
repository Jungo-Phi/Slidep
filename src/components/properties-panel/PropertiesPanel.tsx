import React from "react";
import { Box, Paper, Tabs, Tab, Tooltip } from "@mui/material";
import {
  Folder as ProjectIcon,
  Build as ElementIcon,
  Straighten as ConstraintsIcon,
  Assessment as AnalysisIcon,
  Layers as LibraryIcon,
} from "@mui/icons-material";
import {
  Action,
  AppMode,
  ID,
  Mechanism,
  MechanismMetadata,
  PropertiesPanelTab,
  RuntimeState,
  SimulationConfig,
  UnionElement,
} from "../../types";
import { COLORS } from "../../theme/canvas-theme";
import { HoveredAbscissaSource, HoveredPart } from "../../types/hovered-part";
import { CanvasState, selected_ids } from "../../types/canvas-state";
import { ProjectInfoSection } from "./panels/ProjectInfoSection";
import ElementProperties from "./panels/ElementProperties";
import ConstraintsPanel from "./panels/ConstraintsPanel";
import AnalysisPanel from "./panels/AnalysisPanel";
import WorstStress from "./components/WorstStress";
import MaterialsLibraryPanel, { LibraryFocusRequest } from "./panels/MaterialsLibraryPanel";
import { is_constraint_type } from "../canvas/utils";
import { ElementNavigationContext } from "./element-navigation";
import { SimulationLockContext } from "./simulation-lock";
import { LibraryNavigationContext } from "./library-navigation";
import { CanvasHighlight } from "../canvas/drawing/draw-canvas";
import { RedundancySymbol } from "../solver/analysis/redundancy-symbols";
import { DynamicSnapshot } from "../../types/runtime-state";
import { at_recording_end } from "../solver/dynamics/simulation-engine";
import { OverlayScrollArea } from "./components/OverlayScrollArea";
import EnergyBalance from "./components/EnergyBalance";
import { inspected_subject } from "./selection-subject";
import { t } from "../../i18n";
import { useAmbient } from "../common/use-ambient";
import { useSimClock } from "../solver/dynamics/sim-clock";
import {
  CLOCK_MIRROR_MS,
  useAnalysedMechanism,
} from "../solver/recording/use-simulation-playback";
import type {
  HoveredBalanceTerm,
  MomentBalanceReference,
} from "../solver/analysis/force-balance";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";

interface PropertiesPanelViewProps {
  /** Names what the canvas should pick out, and why; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** How a redundant constraint the analysis panel is naming right now would yield. */
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Where the analysis panel publishes the pose it is animating, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
  setCanvasState: (state: CanvasState) => void;
  /** Deselects without moving the active tab off "elements" — see handleTabClick. */
  clearSelectionKeepTab: () => void;
  canvasState: CanvasState;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
  /** The same mechanism in the pose on screen, which in simulation is not the edited one. */
  analysedMechanism: Mechanism;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  updateMetadata: (metadata: MechanismMetadata) => void;
  /** Every tag already used in the mechanism library, suggested by the tag autocomplete. */
  allTags: string[];
  setRuntimeState: React.Dispatch<React.SetStateAction<RuntimeState>>;
  runtimeState: RuntimeState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
  appMode: AppMode;
  activeTab: PropertiesPanelTab;
  setActiveTab: (tab: PropertiesPanelTab) => void;
  /** Motors standing blocked at the cursor — see `motors_blocked_at`. */
  blockedMotors: ReadonlySet<ID>;
  /** Publishes the abscissa hovered on a beam's N/T/Mf diagrams, for the canvas to mark. */
  setHoveredAbscissa: (hovered: HoveredAbscissaSource | null) => void;
  /** See `App`'s own `hoveredBalanceTerm`. */
  setHoveredBalanceTerm: (hovered: HoveredBalanceTerm | null) => void;
  /** See `App`'s own `momentBalanceReference`. */
  momentBalanceReference: MomentBalanceReference;
  setMomentBalanceReference: (reference: MomentBalanceReference) => void;
  /** See `App`'s own `momentBalanceReferenceHovered`. */
  setMomentBalanceReferenceHovered: (hovered: boolean) => void;
  /** See `App`'s own `focusedOverlay`. */
  focusedOverlay: FocusedOverlay | null;
  /** Names a physics-overlay reading as selected — `App`'s own `setFocusedOverlay`, the same one a plain click on the canvas arrow itself reports through. */
  setFocusedOverlay: (overlay: FocusedOverlay | null) => void;
  /** Sets which library section is hovered — also what tints the canvas for as long as the hover lasts.
   * The value itself is read straight from the app by the canvas, not through this panel. */
  setLibrarySection: (section: "materials" | "profiles" | null) => void;
  /** A library row hovered there, for the canvas to accentuate its beams and fade the rest. */
  hoveredLibraryEntryID: ID | null;
  setHoveredLibraryEntryID: (id: ID | null) => void;
  /** `"sheet"`: the contents alone, full width, for the phone's sheet — whose tabs live in the bottom bar. */
  variant?: "side" | "sheet";
}

/** The tab bar: it changes only with the active tab, so it skips the renders the panel takes at every instant of a simulation. */
const PanelTabs = React.memo(function PanelTabs({
  activeTab,
  setActiveTab,
  clearSelectionKeepTab,
}: {
  activeTab: PropertiesPanelTab;
  setActiveTab: (tab: PropertiesPanelTab) => void;
  clearSelectionKeepTab: () => void;
}) {
  useAmbient();
  const handleTabChange = (
    _event: React.SyntheticEvent,
    newValue: PropertiesPanelTab,
  ) => {
    setActiveTab(newValue);
  };

  const handleTabClick = (
    _event: React.MouseEvent,
    tabLabel: PropertiesPanelTab,
  ) => {
    if (
      tabLabel === activeTab &&
      (activeTab === "elements" ||
        activeTab === "constraints" ||
        activeTab === "analysis")
    )
      clearSelectionKeepTab();
  };

  return (
    <Box
      sx={{
        backgroundColor: "primary.main",
        color: "primary.contrastText",
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        textColor="inherit"
        tabIndex={0}
        sx={{
          minHeight: 40,
          height: 40,
          "& .MuiTabs-flexContainer": {
            justifyContent: "space-around",
          },
          "& .MuiTab-root": {
            px: 2,
            my: -0.5,
            fontWeight: "bold",
            "&.Mui-selected": {
              color: "primary.contrastText",
            },
          },
          "& .MuiTabs-indicator": {
            backgroundColor: "primary.contrastText",
            height: 3,
            borderRadius: "3px 3px 0 0",
          },
        }}
      >
        {[
          {
            id: "project" as PropertiesPanelTab,
            icon: ProjectIcon,
            label: t("project"),
          },
          {
            id: "elements" as PropertiesPanelTab,
            icon: ElementIcon,
            label: t("elements"),
          },
          {
            id: "constraints" as PropertiesPanelTab,
            icon: ConstraintsIcon,
            label: t("constraints"),
          },
          {
            id: "library" as PropertiesPanelTab,
            icon: LibraryIcon,
            label: t("materials"),
          },
          {
            id: "analysis" as PropertiesPanelTab,
            icon: AnalysisIcon,
            label: t("analysis"),
          },
        ].map((tab) => {
          return (
            <Tab
              key={tab.id}
              value={tab.id}
              onClick={(e) => handleTabClick(e, tab.id)}
              icon={
                <Tooltip title={tab.label}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      margin: -1,
                    }}
                  >
                    <tab.icon fontSize="small" />
                    {activeTab === tab.id && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                        }}
                      >
                        {tab.label}
                      </span>
                    )}
                  </Box>
                </Tooltip>
              }
              label=""
              sx={{
                minWidth: "auto",
                justifyContent: "center",
              }}
            />
          );
        })}
      </Tabs>
    </Box>
  );
});

const PropertiesPanelView: React.FC<PropertiesPanelViewProps> = ({
  modePreviewRef,
  setHighlight,
  setRedundancySymbols,
  setCanvasState,
  clearSelectionKeepTab,
  canvasState,
  applyActions,
  mechanism,
  analysedMechanism,
  hoveredPart,
  setHoveredPart,
  updateMetadata,
  allTags,
  appMode,
  activeTab,
  setActiveTab,
  blockedMotors,
  runtimeState,
  setRuntimeState,
  setHoveredAbscissa,
  setHoveredBalanceTerm,
  momentBalanceReference,
  setMomentBalanceReference,
  setMomentBalanceReferenceHovered,
  focusedOverlay,
  setFocusedOverlay,
  setLibrarySection,
  hoveredLibraryEntryID,
  setHoveredLibraryEntryID,
  variant = "side",
}) => {
  const handleProjectInfoChange = (info: MechanismMetadata) => {
    updateMetadata({
      ...mechanism.metadata,
      name: info.name,
      description: info.description,
      author: info.author,
      createdAt: info.createdAt,
      modifiedAt: info.modifiedAt,
      tags: info.tags,
    });
  };

  // Every id currently selected — one for a plain click, the whole group for a box selection.
  // Threaded down so any ElementDisplay can tell whether it names one of them.
  // Held across renders: the panel re-renders with the clock, and a fresh array each time would re-render every memoised row it reaches.
  const selectedIds = React.useMemo(() => selected_ids(canvasState), [canvasState]);
  // Scrubbing from a chart: landing on the end of the recording is not scrubbing, since playing from there records on.
  const seekTime = (time: number) =>
    setRuntimeState((previous) => ({
      ...previous,
      time,
      isPlaying: false,
      scrubbed: !at_recording_end(previous.simulationSnapshots, time),
    }));
  // What the elements tab shows the page of: an element — the one an overlay reading named on the canvas is read from, or the one selected — or a load.
  const subject = inspected_subject(selectedIds, focusedOverlay, mechanism);
  // Any ElementDisplay clicked anywhere in the panel drills down to the element it names, in the tab that knows how to show it.
  const drillDownToElement = React.useCallback(
    (element: UnionElement) =>
      setActiveTab(
        is_constraint_type(element.type) ? "constraints" : "elements",
      ),
    [setActiveTab],
  );

  // A beam's material/profile picker's own "where can I edit this?" link — jumps to the library tab with that entry selected there.
  // Local: only `MaterialsLibraryPanel`, a child of this same component, needs to read the request.
  const [libraryFocusRequest, setLibraryFocusRequest] = React.useState<LibraryFocusRequest | null>(
    null,
  );
  const focusLibraryEntry = React.useCallback(
    (section: "materials" | "profiles", ids: ID[]) => {
      setActiveTab("library");
      setLibraryFocusRequest({ section, ids });
    },
    [setActiveTab],
  );

  return (
    <SimulationLockContext.Provider value={appMode !== "edition"}>
    <ElementNavigationContext.Provider value={drillDownToElement}>
      <LibraryNavigationContext.Provider value={focusLibraryEntry}>
      <Paper
        sx={{
          width: variant === "side" ? 300 : "100%",
          flexShrink: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "none",
          borderRadius: 0,
          borderLeft: variant === "side" ? `2px solid ${COLORS.ACCENT}` : "none",
          boxShadow: "none",
          backgroundColor: variant === "side" ? undefined : "transparent",
        }}
      >
        {variant === "side" && (
          <PanelTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            clearSelectionKeepTab={clearSelectionKeepTab}
          />
        )}

        <OverlayScrollArea sx={{ flex: 1, minHeight: 0 }}>
          {activeTab === "project" && (
            <ProjectInfoSection
              mechanism={mechanism}
              updateMetadata={handleProjectInfoChange}
              allTags={allTags}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
            />
          )}
          {/* A load or a reading is read on the page of the element it belongs to, unfolded there. */}
          {activeTab === "elements" && (
            <ElementProperties
              element={
                subject?.kind === "load" ? subject.host : subject?.element
              }
              unfoldedLoadID={
                subject?.kind === "load" ? subject.load.id : undefined
              }
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
              analysedMechanism={analysedMechanism}
              appMode={appMode}
              runtimeState={runtimeState}
              setHighlight={setHighlight}
              focusedOverlay={focusedOverlay}
              setFocusedOverlay={setFocusedOverlay}
              setHoveredAbscissa={setHoveredAbscissa}
            />
          )}
          {activeTab === "constraints" && (
            <ConstraintsPanel
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              applyActions={applyActions}
              mechanism={mechanism}
            />
          )}
          {activeTab === "library" && (
            <MaterialsLibraryPanel
              mechanism={mechanism}
              analysedMechanism={analysedMechanism}
              applyActions={applyActions}
              setHoveredSection={setLibrarySection}
              hoveredEntryID={hoveredLibraryEntryID}
              setHoveredEntryID={setHoveredLibraryEntryID}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              setCanvasState={setCanvasState}
              focusRequest={libraryFocusRequest}
              onFocusHandled={() => setLibraryFocusRequest(null)}
            />
          )}
          {/* The mechanism's own readings over the whole run lead the analysis: the solver's energy balance, then the most stressed beam once one has been read — a card that appeared empty on every mechanism without beams would only ever be noise. */}
          {activeTab === "analysis" && appMode === "dynamic" && (
            <Box sx={{ mt: 1 }}>
              <EnergyBalance
                snapshots={runtimeState.simulationSnapshots as DynamicSnapshot[]}
                currentTime={runtimeState.time}
                onSeek={seekTime}
              />
              {runtimeState.stressScale.beams.size > 0 && (
                <WorstStress
                  cache={runtimeState.stressScale}
                  elements={mechanism.mechanicalElements}
                  materials={mechanism.materials}
                  profiles={mechanism.profiles}
                  currentTime={runtimeState.time}
                  onSeek={seekTime}
                  setHoveredAbscissa={setHoveredAbscissa}
                />
              )}
            </Box>
          )}
          {activeTab === "analysis" && (
            <AnalysisPanel
              setHighlight={setHighlight}
              setRedundancySymbols={setRedundancySymbols}
              modePreviewRef={modePreviewRef}
              mechanism={mechanism}
              analysedMechanism={analysedMechanism}
              appMode={appMode}
              applyActions={applyActions}
              hoveredPart={hoveredPart}
              setHoveredPart={setHoveredPart}
              selectedIds={selectedIds}
              canvasState={canvasState}
              setCanvasState={setCanvasState}
              blockedMotors={blockedMotors}
              runtimeState={runtimeState}
              seekTime={seekTime}
              setHoveredBalanceTerm={setHoveredBalanceTerm}
              setHoveredAbscissa={setHoveredAbscissa}
              momentBalanceReference={momentBalanceReference}
              setMomentBalanceReference={setMomentBalanceReference}
              setMomentBalanceReferenceHovered={setMomentBalanceReferenceHovered}
              setFocusedOverlay={setFocusedOverlay}
            />
          )}
        </OverlayScrollArea>
      </Paper>
      </LibraryNavigationContext.Provider>
    </ElementNavigationContext.Provider>
    </SimulationLockContext.Provider>
  );
};

export type PropertiesPanelProps = Omit<
  PropertiesPanelViewProps,
  "analysedMechanism" | "runtimeState"
>;

/** The panel mirrors the clock itself: its readings follow the instant on screen without making anything above it re-render. */
export const PropertiesPanel = React.memo(function PropertiesPanel(
  props: PropertiesPanelProps,
) {
  useAmbient();
  const runtimeState = useSimClock(CLOCK_MIRROR_MS);
  const analysedMechanism = useAnalysedMechanism(
    props.mechanism,
    props.appMode,
    runtimeState,
  );
  return (
    <PropertiesPanelView
      {...props}
      runtimeState={runtimeState}
      analysedMechanism={analysedMechanism}
    />
  );
});

export default PropertiesPanel;
