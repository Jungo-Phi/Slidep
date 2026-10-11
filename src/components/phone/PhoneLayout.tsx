import React, { useRef, useState } from "react";
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

interface PhoneLayoutProps {
  /** Draws the canvas, reporting its taps to the layout. */
  renderCanvas: (onTap: (onElement: boolean) => void) => React.ReactNode;
  topBar: PhoneTopBarProps;
  panel: PropertiesPanelProps;
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
  setCanvasState,
  onPlayPause,
  timelineTrackRef,
}) => {
  const { appMode, canvasState, mechanism, activeTab, setActiveTab } = panel;
  const [sheet, setSheet] = useState<{
    palette: boolean;
    height: SheetHeight;
  } | null>(null);
  // What the sheet showed last, so it slides away showing it rather than going blank.
  const lastSheetRef = useRef<{ palette: boolean }>({ palette: false });
  if (sheet) lastSheetRef.current = sheet;
  const showsPalette = (sheet ?? lastSheetRef.current).palette;

  const close = () => setSheet(null);
  const open = (tab: SheetTab) => {
    if (tab !== "palette") setActiveTab(tab);
    setSheet((current) => ({
      palette: tab === "palette",
      height: current?.height ?? "half",
    }));
  };
  const onTab = (tab: SheetTab) => {
    const shown = sheet && (sheet.palette ? "palette" : activeTab);
    if (shown === tab) close();
    else open(tab);
  };
  // Tapping an element keeps the sheet on its tab, so what it reads follows the selection; tapping empty space puts it away.
  // The palette is a chooser: a tap on the canvas means the choosing is over.
  const onCanvasTap = (onElement: boolean) => {
    if (!sheet) return;
    if (!onElement || sheet.palette) close();
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
          {showsPalette ? (
            <PhonePalette
              canvasState={canvasState}
              setCanvasState={setCanvasState}
              mechanism={mechanism}
              appMode={appMode}
              onPicked={close}
            />
          ) : (
            <PropertiesPanel {...panel} variant="sheet" />
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
        active={sheet ? (sheet.palette ? "palette" : activeTab) : null}
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
