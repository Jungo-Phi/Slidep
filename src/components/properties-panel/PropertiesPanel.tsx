import React from "react";
import {
  Box,
  IconButton,
  Paper,
  Tooltip,
  alpha,
  useTheme,
} from "@mui/material";
import { icon_faded } from "../element-palette/iconDataUris";
import {
  Folder as ProjectIcon,
  Build as ElementIcon,
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
import { t, type StringKey } from "../../i18n";
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
import { zone_props } from "../common/keyboard-zones";

interface PropertiesPanelViewProps {
  /** Names what the canvas should pick out, and why; empty clears the highlight. */
  setHighlight: (highlight: CanvasHighlight) => void;
  /** How a redundant constraint the analysis panel is naming right now would yield. */
  setRedundancySymbols: (symbols: RedundancySymbol[]) => void;
  /** Where the analysis panel publishes the pose it is animating, for the canvas to draw. */
  modePreviewRef: React.MutableRefObject<Mechanism | null>;
  setCanvasState: (state: CanvasState) => void;
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
  /**
   * `"side"`: the desktop's right-hand panel, the contextual one — every tab but the analysis.
   * `"analysis"`: the desktop's left-hand panel, the analysis alone, always on screen.
   * `"sheet"`: the contents alone, full width, for the phone's sheet — whose tabs live in the bottom bar.
   */
  variant?: "side" | "analysis" | "sheet";
  /** Whether the contextual panel is unfolded: the user's choice, which the app never overrides. */
  sideOpen: boolean;
  setSideOpen: (open: boolean) => void;
}

const PANEL_WIDTH = 300;

/** Narrower than the contextual panel: the analysis reads as a column of verdicts and figures, and it is always on screen. */
const ANALYSIS_WIDTH = 240;

const RAIL_WIDTH = 44;

/** Cotation shows the palette's own dimension glyph: the tab reads as the place of what those tools make, and the ruler keeps the only ruler on screen. */
const RAIL_TABS: {
  id: PropertiesPanelTab;
  icon: typeof ProjectIcon | "dimension";
  labelKey: StringKey;
}[] = [
  { id: "project", icon: ProjectIcon, labelKey: "project" },
  { id: "elements", icon: ElementIcon, labelKey: "elements" },
  { id: "constraints", icon: "dimension", labelKey: "constraints" },
  { id: "library", icon: LibraryIcon, labelKey: "materials" },
];

/** A palette icon, drawn in the colour the tab's own icons take, and larger than they are: the palette's glyphs leave a wider margin inside their square. */
function PaletteGlyph({
  name,
  color,
}: {
  name: string;
  color: "primary" | "secondary";
}) {
  const theme = useTheme();
  const { src, opacity } = icon_faded(
    name,
    color === "primary" ? theme.palette.primary.main : theme.palette.text.secondary,
  );
  return (
    <Box
      component="img"
      src={src}
      alt=""
      draggable={false}
      sx={{ width: 26, height: 26, display: "block", opacity }}
    />
  );
}

/**
 * The contextual panel's tabs, in a column standing over the canvas against the panel's side: they cost the canvas no width, and stay on screen with the panel folded, as the way to open it again.
 * It changes only with the active tab, so it skips the renders the panel takes at every instant of a simulation.
 */
const PanelRail = React.memo(function PanelRail({
  activeTab,
  open,
  markElements,
  markConstraints,
  onTabClick,
  onTabSelect,
}: {
  activeTab: PropertiesPanelTab;
  open: boolean;
  /**
   * With the panel folded, the tabs that have something selected to show are lit, the panel staying as the user left it.
   * Only these two: what the other tabs show does not depend on the selection.
   */
  markElements: boolean;
  markConstraints: boolean;
  onTabClick: (tab: PropertiesPanelTab) => void;
  /** A tab reached with the arrows: shown, never folded away as a second click on it does. */
  onTabSelect: (tab: PropertiesPanelTab) => void;
}) {
  useAmbient();
  const buttonsRef = React.useRef(new Map<PropertiesPanelTab, HTMLElement>());
  // One Tab stop, the tab shown, the up and down arrows moving between them and showing each as they go: the tablist pattern.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const index = RAIL_TABS.findIndex(
      (tab) => buttonsRef.current.get(tab.id) === event.target,
    );
    if (index === -1) return;
    const next =
      event.key === "ArrowDown"
        ? RAIL_TABS[index + 1]
        : event.key === "ArrowUp"
          ? RAIL_TABS[index - 1]
          : event.key === "Home"
            ? RAIL_TABS[0]
            : event.key === "End"
              ? RAIL_TABS[RAIL_TABS.length - 1]
              : undefined;
    if (
      !next &&
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    if (!next) return;
    onTabSelect(next.id);
    buttonsRef.current.get(next.id)?.focus();
  };
  return (
    <Box
      {...zone_props("rail")}
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: "100%",
        zIndex: 1,
        width: RAIL_WIDTH,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0.5,
        // The column spans the panel's height for its tabs to sit midway: the space between them stays the canvas's.
        pointerEvents: "none",
        "& > *": { pointerEvents: "auto" },
      }}
    >
      {RAIL_TABS.map((tab) => {
        const selected = open && tab.id === activeTab;
        const marked =
          !open &&
          ((tab.id === "elements" && markElements) ||
            (tab.id === "constraints" && markConstraints));
        const label = t(tab.labelKey);
        return (
          <Box
            key={tab.id}
            sx={{ position: "relative", display: "flex", justifyContent: "flex-end" }}
          >
            <Tooltip title={label} placement="left">
              <IconButton
                ref={(element: HTMLButtonElement | null) => {
                  if (element) buttonsRef.current.set(tab.id, element);
                  else buttonsRef.current.delete(tab.id);
                }}
                role="tab"
                aria-selected={selected}
                aria-label={label}
                tabIndex={tab.id === activeTab ? 0 : -1}
                onClick={() => onTabClick(tab.id)}
                sx={[
                  {
                    width: 40,
                    height: 40,
                    // Square and flush on the panel's side, rounded on the canvas's: a tab coming out of the panel.
                    borderRadius: "8px 0 0 8px",
                    // The same faint ground as the ruler's button, the other control standing on the canvas.
                    backgroundColor: (theme) =>
                      alpha(theme.palette.text.primary, 0.07),
                    transition: "background-color 120ms",
                    "&:hover, &.Mui-focusVisible": {
                      backgroundColor: (theme) =>
                        alpha(theme.palette.text.primary, 0.14),
                    },
                    color: selected || marked ? "primary.main" : "text.secondary",
                  },
                  // The open tab is part of the panel: its ground and outline, run over the panel's own edge so nothing separates them.
                  selected && {
                    width: 41,
                    mr: "-1px",
                    bgcolor: "background.paper",
                    border: 1,
                    borderRight: 0,
                    borderColor: "divider",
                    "&:hover": { bgcolor: "background.paper" },
                    // The focus darkens its ground of paper as the other tabs' hover does theirs, a veil laid over the paper rather than in its place, which would let the canvas through.
                    "&.Mui-focusVisible": {
                      bgcolor: "background.paper",
                      backgroundImage: (theme) => {
                        const veil = alpha(theme.palette.text.primary, 0.07);
                        return `linear-gradient(${veil}, ${veil})`;
                      },
                    },
                  },
                ]}
              >
                {tab.icon === "dimension" ? (
                  <PaletteGlyph
                    name="dimension"
                    color={selected || marked ? "primary" : "secondary"}
                  />
                ) : (
                  <tab.icon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
});

const PropertiesPanelView: React.FC<PropertiesPanelViewProps> = ({
  modePreviewRef,
  setHighlight,
  setRedundancySymbols,
  setCanvasState,
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
  sideOpen: open,
  setSideOpen,
}) => {
  // The analysis has a panel of its own beside the canvas: the contextual one never shows it.
  const tab: PropertiesPanelTab =
    variant === "analysis"
      ? "analysis"
      : variant === "side" && activeTab === "analysis"
        ? "project"
        : activeTab;
  const handleRailClick = (clicked: PropertiesPanelTab) => {
    const next = !(open && clicked === tab);
    if (next) setActiveTab(clicked);
    setSideOpen(next);
  };
  const handleRailSelect = (selected: PropertiesPanelTab) => {
    setActiveTab(selected);
    setSideOpen(true);
  };
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
  const liveSelectedIds = React.useMemo(
    () => selected_ids(canvasState),
    [canvasState],
  );
  // A box selection being dragged out only shows on the canvas: the panel keeps the selection it had, and takes the new one on mouseup.
  const boxSelecting = canvasState.type === "SelectingMultiple";
  const [settledSelectedIds, setSettledSelectedIds] =
    React.useState(liveSelectedIds);
  if (!boxSelecting && settledSelectedIds !== liveSelectedIds)
    setSettledSelectedIds(liveSelectedIds);
  const selectedIds = boxSelecting ? settledSelectedIds : liveSelectedIds;
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

  // Folded, the contextual panel shows its tabs alone: what it would show is not built at all.
  const shown = variant !== "side" || open;

  const content = shown && (
    <Paper
      {...zone_props(variant === "analysis" ? "analysis" : "panel")}
      sx={{
        width:
          variant === "sheet"
            ? "100%"
            : variant === "analysis"
              ? ANALYSIS_WIDTH
              : PANEL_WIDTH,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "none",
        borderTopRightRadius: variant === "analysis" ? 8 : 0,
        borderTopLeftRadius: variant === "side" ? 8 : 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        // Set apart by a plain line: the accent colour is kept for what is active.
        borderLeft: variant === "side" ? 1 : 0,
        borderRight: variant === "analysis" ? 1 : 0,
        borderTop: variant === "sheet" ? 0 : 1,
        borderColor: "divider",
        boxShadow: "none",
        backgroundColor: variant === "sheet" ? "transparent" : undefined,
      }}
    >
      <OverlayScrollArea sx={{ flex: 1, minHeight: 0 }}>
        {tab === "project" && (
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
        {tab === "elements" && (
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
        {tab === "constraints" && (
          <ConstraintsPanel
            hoveredPart={hoveredPart}
            setHoveredPart={setHoveredPart}
            selectedIds={selectedIds}
            setCanvasState={setCanvasState}
            applyActions={applyActions}
            mechanism={mechanism}
          />
        )}
        {tab === "library" && (
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
        {tab === "analysis" && (
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
            showElementPage={() => setActiveTab("elements")}
            // The mechanism's own readings over the whole run, read after the degrees of freedom: the solver's energy balance, then the most stressed beam once one has been read — a card that appeared empty on every mechanism without beams would only ever be noise.
            runSummary={
              appMode === "dynamic" && (
                <Box>
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
              )
            }
          />
        )}
      </OverlayScrollArea>
    </Paper>
  );

  return (
    <SimulationLockContext.Provider value={appMode !== "static"}>
    <ElementNavigationContext.Provider value={drillDownToElement}>
      <LibraryNavigationContext.Provider value={focusLibraryEntry}>
      {variant === "side" ? (
        <Box sx={{ position: "relative", display: "flex", height: "100%", flexShrink: 0 }}>
          {/* The tabs first in the page, though drawn beside the panel: Tab reaches them before what they show. */}
          <PanelRail
            activeTab={tab}
            open={open}
            // A probe clicked opens its metric box on the canvas, which is where it is read: it is no selection to show in the tab.
            markElements={
              canvasState.type !== "PlacingProbeMetrics" &&
              selectedIds.some(
                (id) =>
                  mechanism.mechanicalElements.some((el) => el.id === id) ||
                  mechanism.loads.some((load) => load.id === id),
              )
            }
            markConstraints={selectedIds.some((id) =>
              mechanism.constraintElements.some((c) => c.id === id),
            )}
            onTabClick={handleRailClick}
            onTabSelect={handleRailSelect}
          />
          {content}
        </Box>
      ) : (
        content
      )}
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
