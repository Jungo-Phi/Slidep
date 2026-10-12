import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, ButtonBase, IconButton, Typography } from "@mui/material";
import { Delete } from "@mui/icons-material";
import {
  Action,
  CanvasState,
  ID,
  Mechanism,
  UnionElement,
} from "../../types";
import { selected_ids } from "../../types/canvas-state";
import { t, tn } from "../../i18n";
import { getStorageItem, setStorageItem, shown_element_name } from "../../utils";
import {
  PHONE_LAYOUT,
  PHONE_QUICK_TOOLS,
} from "../../constants/layout-specs";
import { ToolStateType } from "../../constants/shortcuts";
import {
  edition_palette,
  PaletteElement,
} from "../element-palette/ElementPalette";
import { get_element_icon } from "../element-palette/elementIcon";
import {
  delete_element,
  delete_elements,
} from "../mechanism/connect-actions";
import { PhoneToolButton } from "./PhonePalette";
import { armed_palette_element } from "./armed-tool";
import { QuickValue } from "./QuickValue";

const TOOL_USAGE_KEY = "phone-tool-usage";

/** How many times each tool has been armed, on this device. */
type ToolUsage = Partial<Record<ToolStateType, number>>;

// The bar's layout, in px, for counting how many tools its width holds.
const PADDING = 8;
const GAP = 4;
const BUTTON = PHONE_LAYOUT.QUICK_TOOL_ICON + 8;

/**
 * The `room` tools the bar offers past its fixed ones, in palette order.
 * Each group gets a place in `BASE`'s order while there is room, for its most used tool — its base one until another is used more.
 * Room left past the groups goes to the most used of the rest.
 */
function quick_tools(usage: ToolUsage, room: number): PaletteElement[] {
  const groups = edition_palette().map((group) =>
    group.elements.filter(
      (element) => !PHONE_QUICK_TOOLS.FIXED.includes(element.goToStateType),
    ),
  );
  const uses = (element: PaletteElement) => usage[element.goToStateType] ?? 0;
  const picked = new Set<PaletteElement>();
  for (const base of PHONE_QUICK_TOOLS.BASE) {
    if (picked.size >= room) break;
    const group = groups.find((elements) =>
      elements.some((element) => element.goToStateType === base),
    );
    if (!group) continue;
    let best = group.find((element) => element.goToStateType === base)!;
    for (const element of group) if (uses(element) > uses(best)) best = element;
    picked.add(best);
  }
  const palette = groups.flat();
  const rest = palette
    .filter((element) => !picked.has(element))
    .sort((a, b) => uses(b) - uses(a));
  for (const element of rest) {
    if (picked.size >= room) break;
    picked.add(element);
  }
  return palette.filter((element) => picked.has(element));
}

interface PhoneQuickBarProps {
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
  /** Raises the sheet on the tab where the selection is read. */
  onOpenSelection: () => void;
}

/**
 * The phone's quick-access bar, over the bottom bar in edition: shortcuts to what is done most, for what is on the canvas now.
 * With a selection, the selection — a tap reads it in the sheet, or puts the sheet away if it already shows it — its one value at hand (`QuickValue`), and deleting it.
 * Without one, the selection tool and the eraser, always, then as many tools as its width holds: one per palette group first, the most used of each.
 * A tool only changes place when another takes its slot, which takes arming it from the sheet: a tap in the bar never moves what is under the finger.
 * Tapping the selection tool, or the armed tool again, puts the armed tool away.
 * In simulation the transport row takes its place.
 */
export const PhoneQuickBar: React.FC<PhoneQuickBarProps> = ({
  canvasState,
  setCanvasState,
  mechanism,
  applyActions,
  onOpenSelection,
}) => {
  const palette = edition_palette().flatMap((group) => group.elements);
  const tool = (type: ToolStateType) =>
    palette.find((element) => element.goToStateType === type);

  const [usage, setUsage] = useState<ToolUsage>(() => {
    const stored = getStorageItem<unknown>(TOOL_USAGE_KEY, {});
    return typeof stored === "object" && stored !== null
      ? (stored as ToolUsage)
      : {};
  });
  const armedType = armed_palette_element(canvasState, mechanism)?.goToStateType;
  useEffect(() => {
    if (!armedType || PHONE_QUICK_TOOLS.FIXED.includes(armedType)) return;
    setUsage((current) => {
      const next = { ...current, [armedType]: (current[armedType] ?? 0) + 1 };
      setStorageItem(TOOL_USAGE_KEY, next);
      return next;
    });
  }, [armedType]);

  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selectTool = tool("Selecting");
  const ids =
    selectTool?.hilightRule(canvasState, mechanism) === true
      ? selected_ids(canvasState)
      : [];
  const find = (id: ID): UnionElement | undefined =>
    mechanism.mechanicalElements.find((element) => element.id === id) ??
    mechanism.constraintElements.find((element) => element.id === id) ??
    mechanism.loads.find((element) => element.id === id);
  const selected = ids.length === 1 ? find(ids[0]) : undefined;

  let content: React.ReactNode;
  if (ids.length > 1 || selected) {
    // What a deletion drags along is only built on the tap: `delete_elements` replays the mechanism to find it.
    const remove = () =>
      applyActions(
        ids.length === 1
          ? delete_element(
              ids[0],
              mechanism.mechanicalElements,
              mechanism.constraintElements,
              mechanism.loads,
            )
          : delete_elements(
              ids,
              mechanism.mechanicalElements,
              mechanism.constraintElements,
              mechanism.loads,
            ),
      );
    content = (
      <>
        <ButtonBase
          onClick={onOpenSelection}
          sx={{
            flex: "0 1 auto",
            minWidth: 0,
            height: BUTTON,
            justifyContent: "flex-start",
            gap: 1,
            px: 0.5,
            borderRadius: 1.5,
          }}
        >
          {selected && (
            <Box
              component="img"
              src={get_element_icon(selected)}
              alt=""
              draggable={false}
              sx={{
                width: PHONE_LAYOUT.QUICK_TOOL_ICON,
                height: PHONE_LAYOUT.QUICK_TOOL_ICON,
                flexShrink: 0,
              }}
            />
          )}
          <Typography noWrap sx={{ fontSize: "0.85rem", fontWeight: 700 }}>
            {selected
              ? shown_element_name(selected)
              : tn("selection_count", ids.length)}
          </Typography>
        </ButtonBase>
        {/* Centred in what the name leaves before the delete button; the name gives way first, the value being what the bar is for. */}
        <Box
          sx={{
            flex: "1 0 auto",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {selected && (
            <QuickValue
              element={selected}
              mechanism={mechanism}
              applyActions={applyActions}
            />
          )}
        </Box>
        <IconButton
          color="error"
          aria-label={t("delete")}
          onClick={() => {
            remove();
            setCanvasState({ type: "Selecting" });
          }}
        >
          <Delete />
        </IconButton>
      </>
    );
  } else {
    const fixed = PHONE_QUICK_TOOLS.FIXED.flatMap((type) => tool(type) ?? []);
    const room = Math.floor(
      (width - 2 * PADDING + GAP) / (BUTTON + GAP) - fixed.length,
    );
    content = [...fixed, ...quick_tools(usage, Math.max(0, room))].map(
      (element) => (
        <PhoneToolButton
          key={element.goToStateType}
          element={element}
          iconSize={PHONE_LAYOUT.QUICK_TOOL_ICON}
          canvasState={canvasState}
          setCanvasState={setCanvasState}
          mechanism={mechanism}
          appMode="edition"
        />
      ),
    );
  }

  return (
    <Box
      ref={barRef}
      sx={{
        height: PHONE_LAYOUT.QUICK_BAR_HEIGHT,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${GAP}px`,
        px: `${PADDING}px`,
        overflow: "hidden",
        backgroundColor: "background.toolbar",
        borderTop: 1,
        borderColor: "dividers.toolbar",
      }}
    >
      {content}
    </Box>
  );
};
