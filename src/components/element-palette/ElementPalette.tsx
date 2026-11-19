import React from "react";
import { useAmbient } from "../common/use-ambient";
import {
  Box,
  ButtonBase,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ArrowDropDown, Redo, Undo } from "@mui/icons-material";
import { AppMode, CanvasState } from "../../types";
import { shortcut_label } from "../../constants/shortcuts";
import { edition_palette, PaletteElement } from "./edition-palette";
import { palette_click_state } from "./palette-click";
import { Mechanism } from "../../types";
import { t } from "../../i18n";
import {
  focus_zone,
  useRovingToolbar,
  zone_props,
} from "../common/keyboard-zones";
import { folded_groups, PALETTE_METRICS } from "./palette-fold";
import { icon_inked } from "./iconDataUris";
import { COLORS, ICON_COLORS } from "../../theme/canvas-theme";

const { SIZE, PADDING, SIDE_WIDTH } = PALETTE_METRICS;
const BUTTON = SIZE + 2 * PADDING;

/** The two buttons of a folded group, which light each other faintly on hover: they are one control in two parts. */
const FOLD_PART = "palette-fold-part";


/** The two parts touch, squared where they meet, so they read as a single split button. */
const FOLDED_GROUP_SX = {
  gap: 0,
  [`&:hover .${FOLD_PART}:not(:hover)`]: { backgroundColor: "background.sunken" },
  "& > :first-of-type .MuiIconButton-root": {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  "& > .MuiIconButton-root": {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
} as const;

interface ElementPaletteProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  mechanism: Mechanism;
  appMode: AppMode;
  undoMechanism: () => void;
  redoMechanism: () => void;
  /** Brings the mechanism back to rest, from the button that takes the rest tools' place in simulation. */
  leaveSimulation: () => void;
}

/** What a tool shows in the current mode: its icon and highlight colours. */
function tool_look(element: PaletteElement, appMode: AppMode) {
  const sim = appMode !== "static";
  return {
    iconSrc: sim && element.simIconSrc ? element.simIconSrc : element.iconSrc,
    hilightColor:
      sim && element.simHilightColor ? element.simHilightColor : element.hilightColor,
    hilightHoverColor:
      sim && element.simHilightHoverColor
        ? element.simHilightHoverColor
        : element.hilightHoverColor,
  };
}

function tool_label(element: PaletteElement): string {
  const key = shortcut_label(element.goToStateType);
  const name = t(element.nameKey);
  return key ? `${name} (${key})` : name;
}

const ToolIcon: React.FC<{ src: string; alt: string; inverted: boolean }> = ({
  src,
  alt,
  inverted,
}) => (
  <Box
    component="img"
    src={src}
    alt={alt}
    draggable={false}
    sx={{
      width: SIZE,
      height: SIZE,
      display: "block",
      filter: inverted ? "brightness(0) invert(1)" : "none",
    }}
  />
);

interface SlotButtonProps {
  label: string;
  tooltip: string;
  iconSrc: string;
  /** The colour of the mode it leads to, its label and outline drawn in it like its icon. */
  ink: string;
  lit?: boolean;
  litColor?: string;
  litHoverColor?: string;
  hintAnchor?: string;
  onClick: (event: React.MouseEvent) => void;
}

/**
 * A button of the bar's left end, named as well as drawn and outlined, unlike the tools: it moves between rest and simulation rather than arm a gesture.
 * Lit, it takes its tool's ground, and its icon and label turn white as a tool's icon does.
 */
const SlotButton: React.FC<SlotButtonProps> = ({
  label,
  tooltip,
  iconSrc,
  ink,
  lit = false,
  litColor,
  litHoverColor,
  hintAnchor,
  onClick,
}) => (
  <Tooltip title={tooltip} placement="bottom" arrow>
    <ButtonBase
      onClick={onClick}
      aria-label={label}
      aria-pressed={lit}
      data-hint-anchor={hintAnchor}
      // As wide as its name: the slot around it keeps its width, so the tools never move.
      sx={{
        height: BUTTON,
        gap: 0.5,
        px: 0.75,
        borderRadius: 0.75,
        border: 1,
        borderColor: lit ? litColor : ink,
        backgroundColor: lit ? litColor : "transparent",
        // Tinted with its own colour, as an outlined button is: the bar's grey hover barely shows on it.
        "&:hover, &.Mui-focusVisible": {
          background: lit ? litHoverColor : alpha(ink, 0.12),
        },
      }}
    >
      <Box
        component="img"
        src={iconSrc}
        alt=""
        draggable={false}
        sx={{
          width: PALETTE_METRICS.SLOT_ICON,
          height: PALETTE_METRICS.SLOT_ICON,
          flexShrink: 0,
          filter: lit ? "brightness(0) invert(1)" : "none",
        }}
      />
      {/* Sized as the top bar's buttons size their names. */}
      <Typography
        noWrap
        sx={{
          fontSize: "0.72rem",
          // Bolder than the top bar's names: thin strokes read paler than the icon's solid fill, in the same colour.
          fontWeight: 700,
          color: lit ? "common.white" : ink,
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  </Tooltip>
);

const ElementPaletteView: React.FC<ElementPaletteProps> = ({
  setCanvasState,
  canvasState,
  mechanism,
  appMode,
  undoMechanism,
  redoMechanism,
  leaveSimulation,
}) => {
  useAmbient();
  // Rebuilt on every render, which is how the icons and highlight colors follow a theme change: both are read from the active canvas palette at call time.
  // The tools that exist at rest only stand apart, in the bar's left slot, so the groups never shift when the simulation takes them away.
  const tools = edition_palette();
  const palette = tools.map((group) => ({
    ...group,
    elements: group.elements.filter((element) => !element.restOnly),
  }));
  const restTools = tools.flatMap((group) =>
    group.elements
      .filter((element) => element.restOnly)
      .map((element) => ({ groupKey: group.titleKey, element })),
  );

  const barRef = React.useRef<HTMLDivElement>(null);
  useRovingToolbar(barRef, { above: "topbar", below: "canvas" });
  const [barWidth, setBarWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setBarWidth(bar.clientWidth));
    observer.observe(bar);
    setBarWidth(bar.clientWidth);
    return () => observer.disconnect();
  }, []);
  const folded = folded_groups(
    palette.map((group) => ({
      titleKey: group.titleKey,
      count: group.elements.length,
    })),
    barWidth,
  );

  // The tool a folded group shows on its button: the last one taken from it, the way a toolbar that folds its groups keeps the one in use at hand.
  const [lastUsed, setLastUsed] = React.useState<Record<string, string>>({});
  // Kept once closed, with `open` false: the menu still shows its tools while it fades out, rather than an empty frame.
  const [openGroup, setOpenGroup] = React.useState<{
    titleKey: string;
    anchor: HTMLElement;
    open: boolean;
  } | null>(null);
  const closeGroup = () => setOpenGroup((group) => group && { ...group, open: false });

  // A tool armed from the keyboard is used from the keyboard: the focus goes on to the canvas, where its cursor waits at the middle of the view.
  // A press of Enter or Space clicks with no pointer, which is what `detail` 0 says.
  const handleElementClick = (
    groupKey: string,
    element: PaletteElement,
    isHighlighted: boolean,
    event?: React.MouseEvent,
  ) => {
    setLastUsed((used) => ({ ...used, [groupKey]: element.goToStateType }));
    const next = palette_click_state(element, isHighlighted, canvasState, mechanism);
    setCanvasState(next);
    // A frame later, once a menu it was picked from has closed and handed the focus back to its button.
    if (event?.detail === 0 && next.type !== "Selecting")
      requestAnimationFrame(() => focus_zone("canvas"));
  };

  const tool_button = (
    groupKey: string,
    element: PaletteElement,
    className?: string,
  ) => {
    const isHighlighted = element.hilightRule(canvasState, mechanism);
    const { iconSrc, hilightColor, hilightHoverColor } = tool_look(element, appMode);
    const name = t(element.nameKey);
    return (
      <Tooltip
        key={element.goToStateType}
        title={tool_label(element)}
        placement="bottom"
        arrow
      >
        <Box component="span" sx={{ display: "inline-flex" }}>
          <IconButton
            onClick={(event) =>
              handleElementClick(groupKey, element, isHighlighted, event)
            }
            sx={{
              width: BUTTON,
              height: BUTTON,
              borderRadius: 0.75,
              backgroundColor: isHighlighted ? hilightColor : "transparent",
              "&:hover, &.Mui-focusVisible": {
                background: isHighlighted ? hilightHoverColor : "action.hover",
              },
            }}
            aria-label={name}
            data-hint-anchor={element.goToStateType}
            className={isHighlighted ? undefined : className}
          >
            <ToolIcon src={iconSrc} alt={name} inverted={isHighlighted} />
          </IconButton>
        </Box>
      </Tooltip>
    );
  };

  /**
   * A group folded into two buttons: its tool at hand, the one in use or else the last one taken, and the menu of them all.
   * The tool stays one click away, as unfolded, and the menu is only for changing it.
   */
  const folded_buttons = (groupKey: string, elements: PaletteElement[]) => {
    const shown =
      elements.find((element) => element.hilightRule(canvasState, mechanism)) ??
      elements.find((element) => element.goToStateType === lastUsed[groupKey]) ??
      elements[0];
    const title = t(groupKey as Parameters<typeof t>[0]);
    return (
      <>
        {tool_button(groupKey, shown, FOLD_PART)}
        <Tooltip title={title} placement="bottom" arrow>
          <IconButton
            onClick={(event) =>
              setOpenGroup({
                titleKey: groupKey,
                anchor: event.currentTarget,
                open: true,
              })
            }
            aria-label={title}
            aria-haspopup="menu"
            className={FOLD_PART}
            sx={{
              width: PALETTE_METRICS.CARET,
              height: BUTTON,
              p: 0,
              borderRadius: 0.75,
              color: "text.secondary",
              "&.Mui-focusVisible": { backgroundColor: "action.hover" },
            }}
          >
            <ArrowDropDown sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </>
    );
  };

  const openElements =
    palette.find((group) => group.titleKey === openGroup?.titleKey)?.elements ?? [];

  return (
    <Paper
      ref={barRef}
      {...zone_props("palette")}
      role="toolbar"
      aria-label={t("palette")}
      elevation={0}
      sx={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        p: 0.5,
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        userSelect: "none",
        width: "100%",
        overflow: "hidden",
      }}
    >
      {/* As wide as the history buttons on the right, so the tools stay centred on the window: the tools used only at rest, set against its left edge as the history is against the right. */}
      {/* In simulation the way back to rest takes their place, so the slot is always the one that moves between the two. */}
      <Box
        sx={{
          width: SIDE_WIDTH,
          flexShrink: 0,
          display: "flex",
          gap: 0.5,
          px: 1,
          boxSizing: "border-box",
        }}
      >
        {appMode === "static"
          ? restTools.map(({ groupKey, element }) => {
              const lit = element.hilightRule(canvasState, mechanism);
              return (
                <SlotButton
                  key={element.goToStateType}
                  label={t(element.nameKey)}
                  tooltip={tool_label(element)}
                  iconSrc={element.iconSrc}
                  ink={COLORS.ACCENT}
                  lit={lit}
                  litColor={element.hilightColor}
                  litHoverColor={element.hilightHoverColor}
                  hintAnchor={element.goToStateType}
                  onClick={(event) =>
                    handleElementClick(groupKey, element, lit, event)
                  }
                />
              );
            })
          : (
            <SlotButton
              label={t("leave_to_edit")}
              tooltip={`${t("leave_simulation")} (Escape)`}
              iconSrc={icon_inked("select", ICON_COLORS.SELECTION_STROKE)}
              ink={COLORS.SELECTION_STROKE}
              onClick={leaveSimulation}
            />
          )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          // `safe` keeps the first groups in sight should the folding still fall short.
          justifyContent: "safe center",
        }}
      >
        {palette.map((group) => (
          <React.Fragment key={group.titleKey}>
            {group.titleKey !== "interface" && (
              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: `${PALETTE_METRICS.DIVIDER_MARGIN}px`, my: 0.25 }}
              />
            )}
            <Box
              component="section"
              sx={[
                { display: "flex", gap: `${PALETTE_METRICS.GAP}px` },
                folded.has(group.titleKey) && FOLDED_GROUP_SX,
              ]}
            >
              {folded.has(group.titleKey)
                ? folded_buttons(group.titleKey, group.elements)
                : group.elements.map((element) =>
                    tool_button(group.titleKey, element),
                  )}
            </Box>
          </React.Fragment>
        ))}
      </Box>
      <Box
        sx={{
          width: SIDE_WIDTH,
          flexShrink: 0,
          display: "flex",
          justifyContent: "flex-end",
          gap: 0.5,
          px: 1,
          boxSizing: "border-box",
        }}
      >
        <Tooltip title={t("undo")} placement="bottom" arrow>
          <span>
            <IconButton
              color="inherit"
              size="small"
              onClick={undoMechanism}
              disabled={mechanism.history.length === 0}
            >
              <Undo sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("redo")} placement="bottom" arrow>
          <span>
            <IconButton
              color="inherit"
              size="small"
              onClick={redoMechanism}
              disabled={mechanism.future.length === 0}
            >
              <Redo sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Menu
        open={openGroup?.open ?? false}
        anchorEl={openGroup?.anchor}
        onClose={closeGroup}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        {openElements.map((element) => {
          const isHighlighted = element.hilightRule(canvasState, mechanism);
          const shortcut = shortcut_label(element.goToStateType);
          return (
            <MenuItem
              key={element.goToStateType}
              selected={isHighlighted}
              onClick={(event) => {
                if (openGroup)
                  handleElementClick(openGroup.titleKey, element, isHighlighted, event);
                closeGroup();
              }}
              sx={{ gap: 1.5 }}
            >
              <ToolIcon src={tool_look(element, appMode).iconSrc} alt="" inverted={false} />
              <Typography variant="body2">
                {t(element.nameKey)}
                {shortcut && (
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {` (${shortcut})`}
                  </Box>
                )}
              </Typography>
            </MenuItem>
          );
        })}
      </Menu>
    </Paper>
  );
};

export const ElementPalette = React.memo(ElementPaletteView);

export default ElementPalette;
