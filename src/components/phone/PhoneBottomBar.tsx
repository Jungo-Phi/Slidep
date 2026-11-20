import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import {
  Assessment,
  Build,
  Category,
  Layers,
  Straighten,
} from "@mui/icons-material";
import { AppMode, CanvasState, Mechanism, PropertiesPanelTab } from "../../types";
import { t } from "../../i18n";
import { PHONE_LAYOUT } from "../../constants/layout-specs";
import { armed_palette_element } from "./armed-tool";

/** What the bottom bar's tabs raise in the sheet: the palette, or one of the panel's tabs. */
export type SheetTab = "palette" | PropertiesPanelTab;

const TAB_ICONS: Record<Exclude<SheetTab, "palette" | "project">, typeof Build> = {
  elements: Build,
  constraints: Straighten,
  library: Layers,
  analysis: Assessment,
};

const TAB_LABEL_KEYS = {
  elements: "elements",
  constraints: "constraints",
  library: "materials",
  analysis: "analysis",
} as const;

/** One slot of the bar: an icon over its name, lit when `active`. */
const BarButton: React.FC<{
  label: string;
  active: boolean;
  /** What a hint pointing at this slot looks for (see `hints.ts`). */
  hintAnchor?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, hintAnchor, onClick, children }) => (
  <ButtonBase
    aria-label={label}
    data-hint-anchor={hintAnchor}
    aria-pressed={active}
    onClick={onClick}
    sx={{
      flex: 1,
      minWidth: 0,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 0.25,
      color: active ? "primary.main" : "text.primary",
    }}
  >
    {children}
    <Typography
      noWrap
      sx={{
        maxWidth: "100%",
        px: 0.25,
        fontSize: "0.62rem",
        fontWeight: active ? 700 : 500,
        lineHeight: 1,
      }}
    >
      {label}
    </Typography>
  </ButtonBase>
);

interface PhoneBottomBarProps {
  appMode: AppMode;
  canvasState: CanvasState;
  mechanism: Mechanism;
  /** The tab whose sheet is up, `null` while the sheet is down. */
  sheetTab: SheetTab | null;
  onTab: (tab: SheetTab) => void;
}

/**
 * The phone's bottom bar — the work: palette, elements, constraints, materials, analysis.
 * Stopping a simulation is the canvas corner's button, where play was (see `RunFab`).
 *
 * Only the tab whose sheet is up is lit: the selection reads in the quick-access bar, and the armed tool in the palette tab's own icon.
 */
export const PhoneBottomBar: React.FC<PhoneBottomBarProps> = ({
  appMode,
  canvasState,
  mechanism,
  sheetTab,
  onTab,
}) => {
  const simulating = appMode !== "static";
  const armed = armed_palette_element(canvasState, mechanism);
  const lit = sheetTab;
  const tabs: Exclude<SheetTab, "palette" | "project">[] = [
    "elements",
    "constraints",
    "library",
    "analysis",
  ];

  return (
    <Box
      sx={{
        // Clear of the home indicator: the bar's ground runs under it, its tabs above.
        height: `calc(${PHONE_LAYOUT.BAR_HEIGHT + 8}px + env(safe-area-inset-bottom))`,
        pb: "env(safe-area-inset-bottom)",
        flexShrink: 0,
        display: "flex",
        alignItems: "stretch",
        backgroundColor: "background.toolbar",
        borderTop: 1,
        borderColor: "dividers.toolbar",
      }}
    >
      {/* The armed tool stands in for the palette's icon: the one sign left, once the sheet is down, that a tap will put something down. */}
      <BarButton
        label={armed ? t(armed.nameKey) : t("palette")}
        active={lit === "palette"}
        // The slot shows the armed tool, so a hint about that tool points here.
        hintAnchor={armed?.goToStateType}
        onClick={() => onTab("palette")}
      >
        {armed ? (
          <Box
            component="img"
            src={simulating && armed.simIconSrc ? armed.simIconSrc : armed.iconSrc}
            alt=""
            sx={{ width: 24, height: 24 }}
          />
        ) : (
          <Category />
        )}
      </BarButton>
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <BarButton
            key={tab}
            label={t(TAB_LABEL_KEYS[tab])}
            active={lit === tab}
            onClick={() => onTab(tab)}
          >
            <Icon />
          </BarButton>
        );
      })}
    </Box>
  );
};
