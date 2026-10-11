import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import {
  Assessment,
  Build,
  Category,
  Layers,
  Stop,
  Straighten,
} from "@mui/icons-material";
import { AppMode, CanvasState, Mechanism, PropertiesPanelTab } from "../../types";
import { t } from "../../i18n";
import { PHONE_LAYOUT } from "../../constants/layout-specs";
import {
  edition_palette,
  PaletteElement,
} from "../element-palette/ElementPalette";

/** What the bottom bar's tabs raise in the sheet: the palette, or one of the panel's tabs. */
export type SheetTab = "palette" | PropertiesPanelTab;

/** The palette tool armed in `canvasState`, if any — the selection tool being no tool to show. */
function armed_palette_element(
  canvasState: CanvasState,
  mechanism: Mechanism,
): PaletteElement | undefined {
  for (const group of edition_palette())
    for (const element of group.elements)
      if (
        element.goToStateType !== "Selecting" &&
        element.hilightRule(canvasState, mechanism)
      )
        return element;
  return undefined;
}

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

/** One slot of the bar: an icon over its name, lit while its sheet is up — or always, for an `accent` action. */
const BarButton: React.FC<{
  label: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, accent = false, onClick, children }) => (
  <ButtonBase
    aria-label={label}
    aria-pressed={accent ? undefined : active}
    onClick={onClick}
    sx={{
      flex: 1,
      minWidth: 0,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 0.25,
      color: active || accent ? "primary.main" : "text.primary",
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
  active: SheetTab | null;
  onTab: (tab: SheetTab) => void;
  /** Ends the simulation, back to edition. */
  onStop: () => void;
}

/**
 * The phone's bottom bar — the work: palette, elements, constraints, materials, analysis.
 * In simulation, stop takes the place of constraints.
 */
export const PhoneBottomBar: React.FC<PhoneBottomBarProps> = ({
  appMode,
  canvasState,
  mechanism,
  active,
  onTab,
  onStop,
}) => {
  const simulating = appMode !== "edition";
  const armed = armed_palette_element(canvasState, mechanism);
  const tabs: Exclude<SheetTab, "palette" | "project">[] = [
    "elements",
    "constraints",
    "library",
    "analysis",
  ];

  return (
    <Box
      sx={{
        height: PHONE_LAYOUT.BAR_HEIGHT + 8,
        flexShrink: 0,
        display: "flex",
        alignItems: "stretch",
        backgroundColor: "background.toolbar",
        borderTop: 1,
        borderColor: "dividers.toolbar",
      }}
    >
      {/* Under play, at the transport row's left end: the two ends of a run, one above the other. */}
      {/* The armed tool stands in for the palette's icon: the one sign left, once the sheet is down, that a tap will put something down. */}
      <BarButton
        label={armed ? t(armed.nameKey) : t("palette")}
        active={active === "palette" || !!armed}
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
        // Stop takes the middle slot, the one of constraints — nothing is dimensioned while simulating — so no tab moves when a run starts.
        if (simulating && tab === "constraints")
          return (
            <BarButton
              key="stop"
              label={t("stop_simulation")}
              active={false}
              accent
              onClick={onStop}
            >
              <Stop />
            </BarButton>
          );
        const Icon = TAB_ICONS[tab];
        return (
          <BarButton
            key={tab}
            label={t(TAB_LABEL_KEYS[tab])}
            active={active === tab}
            onClick={() => onTab(tab)}
          >
            <Icon />
          </BarButton>
        );
      })}
    </Box>
  );
};
