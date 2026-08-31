import React, { useState } from "react";
import { Box, Divider, IconButton, Menu, Tooltip } from "@mui/material";
import {
  Add,
  Info,
  Redo,
  Remove,
  Undo,
  ZoomIn,
} from "@mui/icons-material";
import { Lang } from "../../i18n";
import { t } from "../../i18n";
import { Mechanism, ViewportState } from "../../types";
import { ThemeMode, ThemeName } from "../../constants/mui-theme";
import type { SnapSettings } from "../canvas/snap-corridor";
import { LanguageMenu } from "./LanguageMenu";
import { SettingsMenu } from "./SettingsMenu";
import { MAX_GRID_SCALE, MIN_GRID_SCALE } from "../../utils/grid";

// Tight like the speed stepper, so the three read as one control.
const VIEWPORT_BUTTON_SX = { px: 0.2, py: 0.5, borderRadius: 1 } as const;

/** Zoom as a share of the framing "Recentrer" aims for — the one a document opens at, so
 *  100 % is where every mechanism starts. Kept short: three digits are plenty to place
 *  oneself, and the toolbar cannot afford a number that grows. */
const format_zoom = (scale: number, reference: number): string => {
  const pct = (scale / reference) * 100;
  return pct >= 10 ? String(Math.round(pct)) : pct.toPrecision(2);
};

/** The zoom steps the buttons walk, in percent of that same framing: a click always lands
 *  on a reading one can name, which a constant ratio per click never does. */
const ZOOM_STEPS = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
  160, 180, 200, 250, 300, 350, 400, 500, 600, 800, 1000,
];

/** Guards against a step being ruled out by the float noise of the zoom round trip. */
const STEP_EPS = 1e-6;

/**
 * The scale the next step in `direction` sits at, or null at the ladder's end (or out of
 * the grid's own zoom range). A zoom set by wheel lands between steps: it snaps to the
 * next one in the direction of travel, which puts the reading back on a round value.
 */
const next_zoom_scale = (
  scale: number,
  reference: number,
  direction: 1 | -1,
): number | null => {
  const pct = (scale / reference) * 100;
  let step: number | undefined;
  if (direction === 1) step = ZOOM_STEPS.find((s) => s > pct * (1 + STEP_EPS));
  else
    for (const s of ZOOM_STEPS) {
      if (s >= pct * (1 - STEP_EPS)) break;
      step = s;
    }
  if (step === undefined) return null;
  const target = (step / 100) * reference;
  return target < MIN_GRID_SCALE || target > MAX_GRID_SCALE ? null : target;
};

interface ZoomControlsProps {
  viewport: ViewportState;
  recenterTarget: ViewportState | null;
  onZoomTo: (scale: number) => void;
  onRecenter: (target: ViewportState) => void;
}

/** The viewport stepper: the zoom steps frame the current zoom, which doubles as the
 *  "Recentrer" command — clicking it is what brings the reading back to 100 %. */
const ZoomControls: React.FC<ZoomControlsProps> = ({
  viewport,
  recenterTarget,
  onZoomTo,
  onRecenter,
}) => {
  const zoomOut =
    recenterTarget && next_zoom_scale(viewport.scale, recenterTarget.scale, -1);
  const zoomIn =
    recenterTarget && next_zoom_scale(viewport.scale, recenterTarget.scale, 1);
  const framed =
    !!recenterTarget &&
    viewport.scale === recenterTarget.scale &&
    viewport.pan.equals(recenterTarget.pan);

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Tooltip disableInteractive title={t("zoom_out")}>
        <span>
          <IconButton
            color="inherit"
            size="small"
            onClick={() => zoomOut && onZoomTo(zoomOut)}
            disabled={!zoomOut}
            sx={VIEWPORT_BUTTON_SX}
          >
            <Remove sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip disableInteractive title={t("recenter")}>
        <Box
          component="button"
          onClick={() =>
            recenterTarget && !framed && onRecenter(recenterTarget)
          }
          sx={{
            all: "unset",
            cursor: framed ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 36,
            minHeight: 26.4,
            px: 0,
            fontSize: "0.7rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            borderRadius: 1,
            // Being framed on the mechanism is the neutral state: only a viewport one
            // click away from it is worth the eye.
            color: "text.secondary",
            "&:hover": {
              backgroundColor: framed ? "transparent" : "action.hover",
            },
          }}
        >
          {recenterTarget
            ? `${format_zoom(viewport.scale, recenterTarget.scale)}%`
            : "—"}
        </Box>
      </Tooltip>
      <Tooltip disableInteractive title={t("zoom_in")}>
        <span>
          <IconButton
            color="inherit"
            size="small"
            onClick={() => zoomIn && onZoomTo(zoomIn)}
            disabled={!zoomIn}
            sx={VIEWPORT_BUTTON_SX}
          >
            <Add sx={{ fontSize: 20 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

/** The same stepper behind a single magnifier, for a toolbar with no room for three slots. */
const ZoomMenu: React.FC<ZoomControlsProps> = (props) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  return (
    <>
      <Tooltip disableInteractive title={t("zoom")}>
        <IconButton
          color="inherit"
          size="small"
          aria-expanded={!!anchorEl}
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <ZoomIn sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box sx={{ px: 1, py: 0.5 }}>
          <ZoomControls {...props} />
        </Box>
      </Menu>
    </>
  );
};

interface ToolsMenuProps {
  mechanism: Mechanism;
  recenterTarget: ViewportState | null;
  onRecenter: (target: ViewportState) => void;
  undoMechanism: () => void;
  redoMechanism: () => void;
  onZoomTo: (scale: number) => void;
  /** Folds the zoom stepper behind a single magnifier. */
  tight: boolean;
  language: Lang;
  onSelectLang: (lang: Lang) => void;
  showGrid: boolean;
  setShowGrid: (value: boolean) => void;
  snapToGrid: boolean;
  setSnapToGrid: (value: boolean) => void;
  snapSettings: SnapSettings;
  setSnapSettings: React.Dispatch<React.SetStateAction<SnapSettings>>;
  isCustomAngleStep: boolean;
  themeChoice: { family: string; mode: ThemeMode };
  systemDark: boolean;
  changeTheme: (family: string, mode: ThemeMode) => void;
  previewLater: (name: ThemeName | null) => void;
  onOpenAbout: () => void;
}

/** The toolbar's right-hand cluster: viewport, undo/redo, language, settings, about. */
export const ToolsMenu: React.FC<ToolsMenuProps> = ({
  mechanism,
  recenterTarget,
  onRecenter,
  undoMechanism,
  redoMechanism,
  onZoomTo,
  tight,
  language,
  onSelectLang,
  showGrid,
  setShowGrid,
  snapToGrid,
  setSnapToGrid,
  snapSettings,
  setSnapSettings,
  isCustomAngleStep,
  themeChoice,
  systemDark,
  changeTheme,
  previewLater,
  onOpenAbout,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.25,
      flex: 1,
      justifyContent: "flex-end",
    }}
  >
    {tight ? (
      <ZoomMenu
        viewport={mechanism.viewport}
        recenterTarget={recenterTarget}
        onZoomTo={onZoomTo}
        onRecenter={onRecenter}
      />
    ) : (
      <ZoomControls
        viewport={mechanism.viewport}
        recenterTarget={recenterTarget}
        onZoomTo={onZoomTo}
        onRecenter={onRecenter}
      />
    )}

    <Divider
      orientation="vertical"
      flexItem
      sx={{ ml: 0.75, mr: 0.5, my: 0.25 }}
    />

    {/* Undo / Redo */}
    <Tooltip disableInteractive title={t("undo")}>
      <span>
        <IconButton
          color="inherit"
          size="small"
          onClick={() => undoMechanism()}
          disabled={mechanism.history.length === 0}
        >
          <Undo sx={{ fontSize: 20 }} />
        </IconButton>
      </span>
    </Tooltip>
    <Tooltip disableInteractive title={t("redo")}>
      <span>
        <IconButton
          color="inherit"
          size="small"
          onClick={() => redoMechanism()}
          disabled={mechanism.future.length === 0}
        >
          <Redo sx={{ fontSize: 20 }} />
        </IconButton>
      </span>
    </Tooltip>

    <Divider
      orientation="vertical"
      flexItem
      sx={{ ml: 0.75, mr: 0.5, my: 0.25 }}
    />

    <LanguageMenu language={language} onSelectLang={onSelectLang} />

    <SettingsMenu
      showGrid={showGrid}
      setShowGrid={setShowGrid}
      snapToGrid={snapToGrid}
      setSnapToGrid={setSnapToGrid}
      snapSettings={snapSettings}
      setSnapSettings={setSnapSettings}
      isCustomAngleStep={isCustomAngleStep}
      themeChoice={themeChoice}
      systemDark={systemDark}
      changeTheme={changeTheme}
      previewLater={previewLater}
    />

    {/* À propos */}
    <Tooltip disableInteractive title={t("about")}>
      <IconButton color="inherit" size="small" onClick={onOpenAbout}>
        <Info sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>
  </Box>
);
