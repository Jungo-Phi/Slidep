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
} from "../../types";
import { ConstraintResidual } from "../../types/runtime-state";
import { COLORS } from "../../theme/canvas-theme";
import { HoveredAbscissa, HoveredPart } from "../../types/hovered-part";
import { CanvasState, selected_ids } from "../../types/canvas-state";
import { ProjectInfoSection } from "./panels/ProjectInfoSection";
import ElementProperties from "./panels/ElementProperties";
import ConstraintsPanel from "./panels/ConstraintsPanel";
import AnalysisPanel from "./panels/AnalysisPanel";
import MaterialsLibraryPanel, { LibraryFocusRequest } from "./panels/MaterialsLibraryPanel";
import { host_mechanical_element } from "../mechanism/connect-actions";
import { ElementNavigationContext } from "./element-navigation";
import { LibraryNavigationContext } from "./library-navigation";
import { CanvasHighlight } from "../canvas/drawing/draw-canvas";
import { RedundancySymbol } from "../solver/analysis/redundancy-symbols";
import { OverlayScrollArea } from "./components/OverlayScrollArea";
import { t } from "../../i18n";

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
  unsatisfied: ConstraintResidual[];
  /** Publishes the abscissa hovered on a beam's N/T/Mf diagrams, for the canvas to mark. */
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
  /** Sets which library section is hovered — also what tints the canvas for as long as the
   *  hover lasts. The value itself is read straight from the app by the canvas, not through
   *  this panel. */
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
  unsatisfied,
  runtimeState,
  setRuntimeState,
  setHoveredAbscissa,
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
      (activeTab === "elements" || activeTab === "constraints")
    )
      clearSelectionKeepTab();
  };

  const selectedID: ID | undefined = (canvasState as { elementID?: ID })
    .elementID;
  // Every id currently selected — for a plain click, the same singleton as
  // selectedID; for a box selection, the whole group. Threaded down so any
  // ElementDisplay can tell whether it names one of them.
  const selectedIds = selected_ids(canvasState);
  // The mechanical element the selection points at (a selected load resolves to
  // its host). Shared by the elements tab and the analysis tab's measures section.
  const selectedElement = host_mechanical_element(
    selectedID,
    mechanism.mechanicalElements,
    mechanism.loads,
  );

  // Any ElementDisplay clicked anywhere in the panel drills down to the element it names.
  const drillDownToElement = React.useCallback(
    () => setActiveTab("elements"),
    [setActiveTab],
  );

  // A beam's material/profile picker's own "where can I edit this?" link — jumps to the
  // library tab with that entry selected there. Local: only `MaterialsLibraryPanel`, a child
  // of this same component, needs to read the request.
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

        <OverlayScrollArea sx={{ flexGrow: 1 }}>
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
              setCanvasState={setCanvasState}
              unsatisfied={unsatisfied}
              runtimeState={runtimeState}
              setRuntimeState={setRuntimeState}
              selectedElement={selectedElement}
              setHoveredAbscissa={setHoveredAbscissa}
            />
          )}
        </OverlayScrollArea>
      </Paper>
      </LibraryNavigationContext.Provider>
    </ElementNavigationContext.Provider>
  );
};

export default PropertiesPanel;
