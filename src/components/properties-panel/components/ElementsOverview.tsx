import React from "react";
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ChevronRight,
  Close,
  Delete,
  KeyboardArrowDown,
} from "@mui/icons-material";
import {
  Action,
  CanvasState,
  ID,
  Mechanism,
  MechanicalElement,
  OVERLAY_KIND_ORDER,
} from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "../../canvas/drawing/draw-canvas";
import {
  display_type,
  DisplayType,
  sorted_for_display,
} from "../element-order";
import { get_element_icon } from "../../element-palette/elementIcon";
import { multiple_selection_state } from "../../canvas/tools/canvas-state-reducer";
import ElementRow from "./ElementRow";
import GroupProperties from "./GroupProperties";
import CommandCountRow from "./CommandCountRow";
import StructureOnly from "./StructureOnly";
import {
  OVERLAY_LABEL_KEYS,
  overlay_count,
  overlay_label_count,
  overlay_targets,
  set_all_overlays,
} from "../overlay-actions";
import { selection_metrics } from "../selection-metrics";
import { LENGTH, MASS, format_quantity } from "../../../utils/quantity-format";
import { PluralKey, t, tn } from "../../../i18n";

const GROUP_LABEL_KEYS: Record<DisplayType, PluralKey> = {
  damper: "selection_damper",
  spring: "selection_spring",
  mass: "selection_mass",
  motor: "selection_motor",
  slider: "selection_slider",
  slidep: "selection_slidep",
  pivot: "selection_pivot",
  belt: "selection_belt",
  gear: "selection_gear",
  join: "selection_join",
  beam: "selection_beam",
};

/** Past this many types, the header trades the remaining icons for a "+n" — the row holds one line. */
const SHOWN_TYPE_ICONS = 3;

/** Icon and text of an `ElementDisplay`, so the list's own headers sit on the same scale. */
const TITLE_ICON = 32;
const TYPE_ICON = 28;
const TYPE_FONT_SIZE = "0.85rem";

interface SelectionGroup {
  type: DisplayType;
  elements: MechanicalElement[];
  icon: string;
}

/** The elements, grouped by type in the same order the palette itself uses. */
function build_groups(elements: MechanicalElement[]): SelectionGroup[] {
  const groups: SelectionGroup[] = [];
  for (const el of sorted_for_display(elements)) {
    const type = display_type(el);
    const last = groups[groups.length - 1];
    if (last?.type === type) last.elements.push(el);
    else groups.push({ type, elements: [el], icon: get_element_icon(el) });
  }
  return groups;
}

interface ElementsOverviewProps {
  /** Empty for the whole mechanism, which is what the tab shows when nothing is selected. */
  selectedIds: ID[];
  mechanism: Mechanism;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  setHighlight: (highlight: CanvasHighlight) => void;
  simulating: boolean;
  /** Destroys every selected element at once — the counterpart of the Delete key, which the panel
   *  would otherwise be the only place not to offer. Never offered for the whole mechanism. */
  onDeleteSelection: () => void;
}

/**
 * The elements tab's list: one section per element type, carrying that type's own common fields
 * and, behind its chevron, its elements one by one. A group is both what you read the list as and
 * what you edit it through — two parallel lists, one naming the types and one editing them, would
 * have said the same thing twice.
 *
 * It shows a multi-selection, or the whole mechanism when nothing is selected — the same list of
 * the same elements, so it is one component. What a selection adds is what can only be said of
 * one: dropping a type out of it, narrowing it down to a single type, destroying it whole. Without
 * a selection those give way to the gesture the mechanism-wide list has instead: clicking a type
 * selects it.
 *
 * Collapsed, so the panel's height follows the number of types present rather than the number of
 * elements: twenty beams are one line, not twenty. A group of one has no group to speak of — its
 * own row stands in for the header.
 *
 * The tint runs under a type's own header and its elements, the way a section title carries its
 * own band; the fields it commands sit below it on the panel's own ground. The display layers and
 * the totals stay outside the groups altogether — they cut across the types, and a per-type
 * counter of them would only fragment what reads better whole.
 */
export const ElementsOverview: React.FC<ElementsOverviewProps> = ({
  selectedIds,
  mechanism,
  hoveredPart,
  setHoveredPart,
  setCanvasState,
  applyActions,
  setHighlight,
  simulating,
  onDeleteSelection,
}) => {
  const mechanicalElements = mechanism.mechanicalElements;
  const selecting = selectedIds.length > 0;
  const groups = build_groups(
    selecting
      ? mechanicalElements.filter((el) => selectedIds.includes(el.id))
      : mechanicalElements,
  );
  const listed = groups.flatMap((group) => group.elements);
  const [expanded, setExpanded] = React.useState<ReadonlySet<DisplayType>>(
    new Set(),
  );

  const toggleExpanded = (type: DisplayType) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (!next.delete(type)) next.add(type);
      return next;
    });

  const removeGroup = (group: SelectionGroup) => {
    const removedIds = new Set(group.elements.map((el) => el.id));
    const remaining = selectedIds.filter((id) => !removedIds.has(id));
    setCanvasState(multiple_selection_state(remaining, mechanicalElements));
  };

  // Selecting a type is always worth a click; narrowing a selection down to one of its types is
  // not, once it holds nothing else.
  const groupIsClickable = !selecting || groups.length > 1;

  const selectGroup = (group: SelectionGroup) => {
    setCanvasState(
      multiple_selection_state(
        group.elements.map((el) => el.id),
        mechanicalElements,
      ),
    );
  };

  const deselectOne = (id: ID) => {
    setCanvasState(
      multiple_selection_state(
        selectedIds.filter((selectedId) => selectedId !== id),
        mechanicalElements,
      ),
    );
  };

  const metrics = selection_metrics(
    listed,
    mechanism.materials,
    mechanism.profiles,
  );

  const groupRow = (group: SelectionGroup) => {
    const isExpanded = expanded.has(group.type);
    return (
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <IconButton
          size="small"
          onClick={() => toggleExpanded(group.type)}
          sx={{ p: 0.5, borderRadius: 3 }}
        >
          {isExpanded ? (
            <KeyboardArrowDown fontSize="small" />
          ) : (
            <ChevronRight fontSize="small" />
          )}
        </IconButton>
        <Tooltip
          title={
            groupIsClickable
              ? t(selecting ? "selection_keep_group" : "selection_select_group")
              : ""
          }
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              flex: 1,
              px: -0.5,
              borderRadius: 3,
              cursor: groupIsClickable ? "pointer" : "default",
              ...(groupIsClickable && {
                "&:hover": { backgroundColor: "action.hover" },
              }),
            }}
            onClick={groupIsClickable ? () => selectGroup(group) : undefined}
            onMouseEnter={() =>
              setHighlight({
                elements: new Set(group.elements.map((el) => el.id)),
                kind: "pick",
              })
            }
            onMouseLeave={() => setHighlight(NO_HIGHLIGHT)}
          >
            <Box
              component="img"
              src={group.icon}
              draggable={false}
              sx={{ width: TYPE_ICON, height: TYPE_ICON, ml: 0.25 }}
            />
            <Typography sx={{ fontWeight: 500, fontSize: TYPE_FONT_SIZE }}>
              {tn(GROUP_LABEL_KEYS[group.type], group.elements.length)}
            </Typography>
          </Box>
        </Tooltip>
        {selecting && (
          <Tooltip title={t("selection_remove_group")}>
            <IconButton
              size="small"
              onClick={() => removeGroup(group)}
              sx={{ borderRadius: 3 }}
            >
              <Close sx={{ width: 20, height: 20 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  };

  if (groups.length === 0)
    return (
      <Box
        sx={{
          m: 2,
          p: 2,
          textAlign: "center",
          borderRadius: 3,
          backgroundColor: "background.sunken",
          color: "text.disabled",
          fontSize: "0.875rem",
        }}
      >
        {t("elements_empty")}
      </Box>
    );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", m: 2, gap: 1 }}>
      <IconButton
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 5,
          padding: 0,
          mx: -1,
          mt: -1,
          backgroundColor: "transparent",
          "&:hover": { backgroundColor: "action.hover" },
          "&:focus-visible": {
            backgroundColor: "action.selected",
          },
        }}
        disableRipple
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            my: 0.5,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              mx: 0.5,
            }}
          >
            {groups.slice(0, SHOWN_TYPE_ICONS).map((group) => (
              <Box
                key={group.type}
                component="img"
                src={group.icon}
                draggable={false}
                sx={{ width: TITLE_ICON, height: TITLE_ICON }}
              />
            ))}
            {groups.length > SHOWN_TYPE_ICONS && (
              <Typography color="text.primary" fontWeight={800} marginX={0.5}>
                +{groups.length - SHOWN_TYPE_ICONS}
              </Typography>
            )}
          </Box>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 500 }}>
            {tn("selection_count", listed.length)}
          </Typography>
        </Box>
        {selecting ? (
          <StructureOnly disabled={simulating}>
            <Tooltip title={t("selection_delete")}>
              <IconButton
                color="error"
                onMouseEnter={() =>
                  setHighlight({
                    elements: new Set(selectedIds),
                    kind: "erase",
                  })
                }
                onMouseLeave={() => setHighlight(NO_HIGHLIGHT)}
                onClick={onDeleteSelection}
                sx={{ borderRadius: 4 }}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </StructureOnly>
        ) : (
          <Box />
        )}
      </IconButton>

      <Divider sx={{ mx: -2 }} />

      {groups.map((group) => (
        <Box key={group.type}>
          <Box
            sx={{
              borderRadius: 2.5,
              backgroundColor: "background.sunken",
              overflow: "hidden",
            }}
          >
            {group.elements.length === 1 ? (
              <ElementRow
                element={group.elements[0]}
                hoveredPart={hoveredPart}
                setHoveredPart={setHoveredPart}
                selectedIds={selectedIds}
                setCanvasState={setCanvasState}
                applyActions={applyActions}
                simulating={simulating}
                size="medium"
                readOnly
                onDeselect={selecting ? deselectOne : undefined}
              />
            ) : (
              groupRow(group)
            )}
            {group.elements.length > 1 && expanded.has(group.type) && (
              <List
                disablePadding
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexDirection: "column",
                  width: "100%",
                  pl: 3,
                  pb: 0.5,
                }}
              >
                {group.elements.map((el) => (
                  <ListItem disablePadding key={el.id}>
                    <ElementRow
                      element={el}
                      hoveredPart={hoveredPart}
                      setHoveredPart={setHoveredPart}
                      selectedIds={selectedIds}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                      simulating={simulating}
                      size="small"
                      readOnly
                      onDeselect={selecting ? deselectOne : undefined}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
          <Box>
            <GroupProperties
              elements={group.elements}
              constraintElements={mechanism.constraintElements}
              materials={mechanism.materials}
              profiles={mechanism.profiles}
              applyActions={applyActions}
              simulating={simulating}
            />
          </Box>
        </Box>
      ))}

      <Divider sx={{ mx: -2 }} />

      <Box>
        {OVERLAY_KIND_ORDER.map((kind) => {
          const targets = overlay_targets(listed, kind);
          if (targets.length === 0) return null;
          const { shown, total } = overlay_count(listed, kind);
          return (
            <CommandCountRow
              key={kind}
              label={tn(
                OVERLAY_LABEL_KEYS[kind],
                overlay_label_count(targets, kind),
              )}
              on={shown}
              total={total}
              px={0.5}
              onSetAll={(show) =>
                applyActions(set_all_overlays(listed, kind, show))
              }
            />
          );
        })}
      </Box>

      {(metrics.mass > 0 || metrics.beamCount > 0) && (
        <>
          <Divider sx={{ mx: -2 }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              rowGap: 0.25,
            }}
          >
            {metrics.mass > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t("selection_total_mass")} :{" "}
                {format_quantity(metrics.mass, MASS)}
              </Typography>
            )}
            {metrics.beamCount > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t("selection_total_length")} :{" "}
                {format_quantity(metrics.beamLength, LENGTH)}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

export default ElementsOverview;
