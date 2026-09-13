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
import { HoveredAbscissa, HoveredPart } from "../../types/hovered-part";
import { CanvasState, selected_ids } from "../../types/canvas-state";
import { ProjectInfoSection } from "./panels/ProjectInfoSection";
import ElementProperties from "./panels/ElementProperties";
import ConstraintsPanel from "./panels/ConstraintsPanel";
import AnalysisPanel from "./panels/AnalysisPanel";
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
import { PanelSplitter, useSplitShare } from "./components/PanelSplitter";
import EnergyBalance from "./components/EnergyBalance";
import SelectionInspector from "./panels/SelectionInspector";
import { inspected_subject } from "./selection-subject";
import { t } from "../../i18n";
import type {
  HoveredBalanceTerm,
  MomentBalanceReference,
} from "../solver/analysis/force-balance";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";

/**
 * The share of the panel's height the analysis tab's subject starts with, the rest going to the mechanism-wide sections below it.
 * Moved by the splitter between them, and remembered from then on.
 */
const DEFAULT_SUBJECT_SHARE = 0.45;

export interface PropertiesPanelProps {
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
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
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
  setFocusedOverlay: (overlay: FocusedOverlay) => void;
  /** Sets which library section is hovered — also what tints the canvas for as long as the hover lasts.
   * The value itself is read straight from the app by the canvas, not through this panel. */
  setLibrarySection: (section: "materials" | "profiles" | null) => void;
  /** A library row hovered there, for the canvas to accentuate its beams and fade the rest. */
  hoveredLibraryEntryID: ID | null;
  setHoveredLibraryEntryID: (id: ID | null) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
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

  const selectedID: ID | undefined = (canvasState as { elementID?: ID })
    .elementID;
  // Every id currently selected — for a plain click, the same singleton as selectedID; for a box selection, the whole group.
  // Threaded down so any ElementDisplay can tell whether it names one of them.
  const selectedIds = selected_ids(canvasState);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Scrubbing from a chart: landing on the end of the recording is not scrubbing, since playing from there records on.
  const seekTime = (time: number) =>
    setRuntimeState((previous) => ({
      ...previous,
      time,
      isPlaying: false,
      scrubbed: !at_recording_end(previous.simulationSnapshots, time),
    }));
  const [subjectShare, setSubjectShare] = useSplitShare(
    "analysisSubjectShare",
    DEFAULT_SUBJECT_SHARE,
  );
  // What the analysis tab's own subject panel is reading: an overlay reading named on the canvas, or whatever the selection points at.
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
          width: 300,
          flexShrink: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "none",
          borderRadius: 0,
          borderLeft: `2px solid ${COLORS.ACCENT}`,
          boxShadow: "none",
        }}
      >
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

        {/* The regions and nothing else: the splitter measures the share against this, so a tab bar inside it would offset every drag by its own height. */}
        <Box
          ref={panelRef}
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* The analysis tab reads two different things at once, so it scrolls as two: what the selection says on top, what the mechanism says below.
              Sharing one scroll would have the subject's own height — which changes at every selection — move the charts under the reader. */}
          {activeTab === "analysis" && appMode !== "edition" && (
            <>
              <OverlayScrollArea
                sx={{ flex: `0 0 ${100 * subjectShare}%`, minHeight: 0 }}
              >
                <Box sx={{ my: 1 }}>
                  {/* With nothing selected, the mechanism's own energy takes the region: the one reading there is never an element to hold it against, which is what makes it the thing a selection can replace (see `EnergyBalance`). */}
                  {subject === undefined && appMode === "dynamic" ? (
                    <EnergyBalance
                      snapshots={
                        runtimeState.simulationSnapshots as DynamicSnapshot[]
                      }
                      currentTime={runtimeState.time}
                      onSeek={seekTime}
                    />
                  ) : (
                    <SelectionInspector
                      subject={subject}
                      mechanism={mechanism}
                      analysedMechanism={analysedMechanism}
                      runtimeState={runtimeState}
                      appMode={appMode}
                      applyActions={applyActions}
                      setFocusedOverlay={setFocusedOverlay}
                      hoveredPart={hoveredPart}
                      setHoveredPart={setHoveredPart}
                      selectedIds={selectedIds}
                      setCanvasState={setCanvasState}
                      setHoveredAbscissa={setHoveredAbscissa}
                    />
                  )}
                </Box>
              </OverlayScrollArea>
              <PanelSplitter containerRef={panelRef} onChange={setSubjectShare} />
            </>
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
            {activeTab === "elements" && (
              <ElementProperties
                element={
                  mechanism.mechanicalElements.find(
                    (el) => el.id === selectedID,
                  ) || mechanism.loads.find((l) => l.id === selectedID)
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
                momentBalanceReference={momentBalanceReference}
                setMomentBalanceReference={setMomentBalanceReference}
                setMomentBalanceReferenceHovered={setMomentBalanceReferenceHovered}
                setFocusedOverlay={setFocusedOverlay}
              />
            )}
          </OverlayScrollArea>
        </Box>
      </Paper>
      </LibraryNavigationContext.Provider>
    </ElementNavigationContext.Provider>
    </SimulationLockContext.Provider>
  );
};

export default PropertiesPanel;
