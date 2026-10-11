import React, { useRef } from "react";
import { Box } from "@mui/material";
import { CanvasState } from "../../types";
import {
  PropertiesPanel,
  PropertiesPanelProps,
} from "../properties-panel/PropertiesPanel";
import { PhoneSheet, SheetHeight } from "./PhoneSheet";
import { PhoneTransport, PlayFab } from "./PhoneTransport";
import { change_app_mode } from "../toolbar/playback-actions";
import { PhonePalette } from "./PhonePalette";
import { PhoneTopBar, PhoneTopBarProps } from "./PhoneTopBar";
import { PhoneBottomBar, SheetTab } from "./PhoneBottomBar";

/** The sheet while it is up: the tab it shows, and how high. */
export interface PhoneSheetState {
  tab: SheetTab;
  height: SheetHeight;
}

interface PhoneLayoutProps {
  /** Draws the canvas, reporting its taps to the layout. */
  renderCanvas: (onTap: (onElement: boolean) => void) => React.ReactNode;
  topBar: PhoneTopBarProps;
  /** The panel as the desktop would show it: its `activeTab` is the desktop's, which the sheet only shows once raised on it. */
  panel: PropertiesPanelProps;
  /** Held by the app, whose canvas draws for the tab the sheet shows; `null` while the sheet is down. */
  sheet: PhoneSheetState | null;
  setSheet: React.Dispatch<React.SetStateAction<PhoneSheetState | null>>;
  setCanvasState: (state: CanvasState) => void;
  onPlayPause: () => void;
  timelineTrackRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The app on a phone (docs/plan-mobile.md): the canvas between two bars, and one sheet the bottom bar raises over it.
 * The project lives at the top, the work at the bottom; the palette, the inspector and every panel tab are tabs of the same sheet.
 */
export const PhoneLayout: React.FC<PhoneLayoutProps> = ({
  renderCanvas,
  topBar,
  panel,
  sheet,
  setSheet,
  setCanvasState,
  onPlayPause,
  timelineTrackRef,
}) => {
  const { appMode, canvasState, mechanism, activeTab, setActiveTab } = panel;
  // What the sheet showed last, so it slides away showing it rather than going blank.
  const lastTabRef = useRef<SheetTab>("palette");
  if (sheet) lastTabRef.current = sheet.tab;
  const sheetTab = sheet?.tab ?? lastTabRef.current;

  const close = () => setSheet(null);
  const open = (tab: SheetTab) => {
    if (tab !== "palette") setActiveTab(tab);
    setSheet((current) => ({ tab, height: current?.height ?? "half" }));
  };
  const onTab = (tab: SheetTab) => {
    if (sheet?.tab === tab) close();
    else open(tab);
  };
  // Tapping an element keeps the sheet on its tab, so what it reads follows the selection; tapping empty space puts it away.
  // The palette is a chooser: a tap on the canvas means the choosing is over.
  const onCanvasTap = (onElement: boolean) => {
    if (!sheet) return;
    if (!onElement || sheet.tab === "palette") close();
  };

  return (
    <Box
      sx={{
        // The dynamic viewport: a mobile browser's own bars come and go, and `vh` would hide the bottom bar behind them.
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "background.default",
      }}
    >
      <PhoneTopBar {...topBar} />
      <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* A stacking context of its own: what floats on the canvas — the ruler's button among others — stays under the sheet whatever its own z-index. */}
        <Box sx={{ position: "absolute", inset: 0, zIndex: 0 }}>
          {renderCanvas(onCanvasTap)}
        </Box>
        {appMode === "edition" && <PlayFab onPlay={onPlayPause} />}
        <PhoneSheet
          open={!!sheet}
          height={sheet?.height ?? "half"}
          setHeight={(height) =>
            setSheet((current) => current && { ...current, height })
          }
          onClose={close}
        >
          {sheetTab === "palette" ? (
            <PhonePalette
              canvasState={canvasState}
              setCanvasState={setCanvasState}
              mechanism={mechanism}
              appMode={appMode}
              onPicked={close}
            />
          ) : (
            <PropertiesPanel {...panel} activeTab={sheetTab} variant="sheet" />
          )}
        </PhoneSheet>
      </Box>
      {appMode !== "edition" && (
        <PhoneTransport
          appMode={appMode}
          onPlayPause={onPlayPause}
          timelineTrackRef={timelineTrackRef}
        />
      )}
      <PhoneBottomBar
        appMode={appMode}
        canvasState={canvasState}
        mechanism={mechanism}
        sheetTab={sheet?.tab ?? null}
        desktopTab={activeTab}
        onTab={onTab}
        onStop={() =>
          change_app_mode(
            "edition",
            topBar.setAppMode,
            mechanism,
            topBar.updateMetadata,
          )
        }
      />
    </Box>
  );
};
