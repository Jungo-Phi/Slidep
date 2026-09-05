import React from "react";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Tooltip,
  TextField,
  Typography,
  Divider,
} from "@mui/material";
import {
  Add,
  Close,
  AddToPhotos,
  KeyboardArrowDown,
  ChevronRight,
  DragIndicator,
} from "@mui/icons-material";
import {
  Action,
  BeamElement,
  CanvasState,
  HoveredPart,
  ID,
  Mechanism,
} from "../../../types";
import { ProfileShape } from "../../../types/material";
import {
  default_material,
  default_profile,
  default_shape_for_kind,
} from "../../../constants/material-profile-catalog";
import { validate_profile_shape } from "../../../utils/section-properties";
import { unique_copy_name } from "../../../utils/unique-name";
import NumberInput from "../components/NumberInput";
import SectionSchema from "../components/SectionSchema";
import ElementDisplay from "../components/ElementDisplay";
import { PROBE_ELEMENT_COLORS } from "../components/ProbeChart";
import { INLINE_INPUT_SX } from "../../mechanisms-gallery/inline-input-sx";
import { DENSITY, LENGTH, STRESS } from "../../../utils/quantity-format";
import { t, tn } from "../../../i18n";

/**
 * The properties panel's own "library" tab: create, rename, edit, duplicate and delete a
 * mechanism's own materials and profiles. Each material/profile is a group: the beams that use
 * it are listed right under its own header, and dragging a beam onto a different group's header
 * reassigns it — the target is already on screen, no need to open a menu to find it. A group's
 * numeric fields (E/Re/ρ, or a profile's cotes) and its beam list both live behind its own
 * expand toggle — any number of groups at once, not an accordion — so a collapsed entry costs a
 * single line. Reassigning every beam in a group at once works whether or not it's expanded: its
 * own handle sits right in the header, not in the (possibly hidden) list below.
 *
 * Materials alone carry a catalogue: steel, aluminium… are seeded into every mechanism's own `materials` at creation/migration (`seed_material_catalog`) as ordinary entries.
 * Duplicating one is how it becomes a normal, editable entry. Profiles have no such catalogue:
 * their "kind" (rectangle, tube…) already is that structure, and picking one already seeds
 * sensible cotes (`default_shape_for_kind`) — a second, parallel list of presets would just
 * duplicate it.
 *
 * Hovering anywhere in a section is what tints the canvas by that category, the same gesture
 * the DDL redundancy audit uses for its groups. Everything here goes through `Action`s —
 * undo/redo covers this exactly like every other edit.
 */

const swatch = (index: number) =>
  PROBE_ELEMENT_COLORS[index % PROBE_ELEMENT_COLORS.length];

/** A group's own swatch, as a light wash over its whole background rather than a dot next to
 *  its name — the 2-digit suffix is an 8-digit hex color's own alpha channel. */
const swatch_tint = (index: number) => `${swatch(index)}22`;

// A beam belongs to exactly one material group and one profile group at once — separate mime
// types per section keep a drag started in one from being droppable in the other, and a
// second pair (a whole group's own id, rather than one beam's) lets the group handle bar
// reassign every beam in the group in one drop, instead of one at a time.
const MATERIAL_BEAM_MIME = "application/x-slidep-beam-id+material";
const MATERIAL_GROUP_MIME = "application/x-slidep-material-id";
const PROFILE_BEAM_MIME = "application/x-slidep-beam-id+profile";
const PROFILE_GROUP_MIME = "application/x-slidep-profile-id";

// ─── Inline rename — a truncating label at rest, like a mechanism's own name in the gallery;
// fit-to-text only while actively editing, like a renamed element in `ElementDisplay` ─────────

export interface InlineNameProps {
  name: string;
  onCommit: (newName: string) => void;
}

export const InlineName: React.FC<InlineNameProps> = ({ name, onCommit }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);
  const discardRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Measured against the actual rendered input's own font (never a guessed one, which drifted
  // from the real metrics and clipped the text's tail) — a hidden span sharing that exact font
  // is the only reliable way to size a text input to its content.
  React.useEffect(() => {
    if (!editing || !inputRef.current) return;
    const span = document.createElement("span");
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    span.style.whiteSpace = "pre";
    span.style.font = getComputedStyle(inputRef.current).font;
    span.textContent = draft || " ";
    document.body.appendChild(span);
    setWidth(span.offsetWidth);
    document.body.removeChild(span);
  }, [draft, editing]);

  if (!editing)
    return (
      <Typography
        variant="body2"
        noWrap
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        sx={{
          ...INLINE_INPUT_SX,
          minWidth: 0,
          cursor: "text",
        }}
      >
        {name}
      </Typography>
    );

  return (
    <TextField
      variant="standard"
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      inputRef={inputRef}
      InputProps={{ disableUnderline: true }}
      sx={{
        ...INLINE_INPUT_SX,
        width: Math.max(24, width + 8),
        flexShrink: 0,
        // Matches the `body2` Typography this replaces while editing — without it, the input
        // falls back to the theme's default (larger) input font and the row visibly resizes.
        "& .MuiInputBase-input": {
          paddingTop: "4px",
          paddingBottom: "4px",
          fontSize: "0.875rem",
          lineHeight: 1.43,
        },
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          discardRef.current = true;
          (e.target as HTMLElement).blur();
        } else if (e.key === "Enter") {
          (e.target as HTMLElement).blur();
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (discardRef.current) {
          discardRef.current = false;
          setDraft(name);
          return;
        }
        if (draft.trim() !== "" && draft !== name) onCommit(draft);
        else setDraft(name);
      }}
    />
  );
};

// ─── A beam nested under its material/profile group — draggable onto another group's header ──

interface DraggableBeamRowProps {
  beam: BeamElement;
  dragMimeType: string;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

const DraggableBeamRow: React.FC<DraggableBeamRowProps> = ({
  beam,
  dragMimeType,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
}) => (
  <Box
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(dragMimeType, beam.id);
      e.dataTransfer.effectAllowed = "move";
    }}
    sx={{
      display: "flex",
      alignItems: "center",
      cursor: "grab",
      "&:active": { cursor: "grabbing" },
      // The handle itself picks up a background on hover — it's the part that's grabbable,
      // so it's the part that should say so, not the row as a whole.
      "&:hover .drag-handle": { backgroundColor: "action.selected" },
    }}
  >
    <Box
      className="drag-handle"
      sx={{
        display: "flex",
        alignItems: "center",
        borderRadius: 1.5,
        mr: 0.25,
      }}
    >
      <DragIndicator
        fontSize="inherit"
        sx={{ fontSize: 22, mx: -0.25, py: "2px", color: "text.disabled" }}
      />
    </Box>
    <ElementDisplay
      element={beam}
      hoveredPart={hoveredPart}
      setHoveredPart={setHoveredPart}
      selectedIds={selectedIds}
      setCanvasState={setCanvasState}
      applyActions={applyActions}
      size="small"
      editable={false}
    />
  </Box>
);

// ─── The whole group's own handle — grabs every one of its beams at once, dropped on another
// group's header the same way a single beam is. Lives in the header row itself (not beside the
// beam list) so it works whether the group is expanded or not, and so its own drag image can
// just be that header — see `LibraryEntryGroup`'s `headerRef`. Only worth showing once a group
// holds more than one beam: with just one, its own row's handle already does the same thing. ─

interface GroupHandleBarProps {
  dragMimeType: string;
  groupID: ID;
  headerRef: React.RefObject<HTMLDivElement | null>;
}

const GroupHandleBar: React.FC<GroupHandleBarProps> = ({
  dragMimeType,
  groupID,
  headerRef,
}) => (
  <Box
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(dragMimeType, groupID);
      e.dataTransfer.effectAllowed = "move";
      if (headerRef.current)
        e.dataTransfer.setDragImage(headerRef.current, 12, 12);
    }}
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 1.5,
      cursor: "grab",
      "&:active": { cursor: "grabbing" },
      "&:hover": { backgroundColor: "action.selected" },
    }}
  >
    <DragIndicator
      fontSize="inherit"
      sx={{ fontSize: 22, mx: -0.25, color: "text.disabled" }}
    />
  </Box>
);

// ─── The compact, collapsible header shared by a material or a profile group ─────────────────

interface LibraryEntryGroupProps {
  index: number;
  name: string;
  usageCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  /** The hovered canvas beam belongs to this entry, or this entry's own row is hovered — tints
   *  the whole group so it's found at a glance even while collapsed. */
  isCanvasHighlighted: boolean;
  canDelete?: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onRename?: (newName: string) => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  groupRef?: (el: HTMLDivElement | null) => void;
  /** The whole group's own drag, offered from a small handle in the header itself — undefined
   *  when there's nothing to grab as a group (0 or 1 beam). */
  groupDrag?: { id: ID; mimeType: string };
  detail?: React.ReactNode;
  children?: React.ReactNode;
}

const LibraryEntryGroup: React.FC<LibraryEntryGroupProps> = ({
  index,
  name,
  usageCount,
  expanded,
  onToggleExpand,
  isCanvasHighlighted,
  canDelete = true,
  onHoverStart,
  onHoverEnd,
  onRename,
  onDuplicate,
  onDelete,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  groupRef,
  groupDrag,
  detail,
  children,
}) => {
  const headerRef = React.useRef<HTMLDivElement>(null);

  return (
    <Box
      ref={groupRef}
      // The whole group — header and its beam rows — is the drop target, not just the header
      // line: a bigger target is a faster one to hit while dragging.
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        backgroundColor: dragOver ? "action.selected" : swatch_tint(index),
        outline: dragOver ? "2px dashed" : "none",
        outlineColor: "primary.main",
        outlineOffset: -2,
      }}
    >
      <Box
        ref={headerRef}
        onClick={onToggleExpand}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          p: 0.5,
          cursor: "pointer",
          backgroundColor:
            isCanvasHighlighted && !dragOver ? "action.hover" : "transparent",
        }}
      >
        <IconButton size="small" sx={{ p: 0.25 }} disableRipple>
          {expanded ? (
            <KeyboardArrowDown fontSize="inherit" />
          ) : (
            <ChevronRight fontSize="inherit" />
          )}
        </IconButton>
        {groupDrag && (
          <GroupHandleBar
            dragMimeType={groupDrag.mimeType}
            groupID={groupDrag.id}
            headerRef={headerRef}
          />
        )}
        <Tooltip title={tn("used_by_beams", usageCount)}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            {usageCount}
          </Typography>
        </Tooltip>
        <InlineName name={name} onCommit={onRename!} />
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={t("duplicate")}>
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <AddToPhotos fontSize="inherit" />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={canDelete ? t("delete") : t("delete_disabled_last_entry")}
        >
          <span>
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                onDelete!();
              }}
              disabled={!canDelete}
            >
              <Close fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {expanded && (
        <>
          {detail}
          {children}
        </>
      )}
    </Box>
  );
};

// ─── Materials ─────────────────────────────────────────────────────────────────────────────────

export interface MaterialDetailProps {
  E: number;
  Re: number;
  rho: number;
  onChangeE?: (newE: number) => void;
  onChangeRe?: (newRe: number) => void;
  onChangeRho?: (newRho: number) => void;
}

export const MaterialDetail: React.FC<MaterialDetailProps> = ({
  E,
  Re,
  rho,
  onChangeE,
  onChangeRe,
  onChangeRho,
}) => (
  <Box>
    <Divider />
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 1,
        p: 1.5,
      }}
    >
      <NumberInput
        label="E"
        title={t("material_field_E")}
        kind={STRESS}
        value={E}
        onChange={onChangeE ?? (() => {})}
        unsigned
      />
      <NumberInput
        label="Re"
        title={t("material_field_Re")}
        kind={STRESS}
        value={Re}
        onChange={onChangeRe ?? (() => {})}
        unsigned
      />
      <NumberInput
        label="ρ"
        title={t("material_field_rho")}
        kind={DENSITY}
        value={rho}
        onChange={onChangeRho ?? (() => {})}
        unsigned
      />
    </Box>
  </Box>
);

// ─── Profiles ──────────────────────────────────────────────────────────────────────────────────

const SHAPE_KINDS: ProfileShape["kind"][] = [
  "rect",
  "box",
  "round",
  "tube",
  "I",
];

const shape_kind_label = (kind: ProfileShape["kind"]): string => {
  switch (kind) {
    case "rect":
      return t("profile_rectangle");
    case "box":
      return t("profile_box");
    case "round":
      return t("profile_round");
    case "tube":
      return t("profile_tube");
    case "I":
      return t("profile_i_beam");
  }
};

interface CoteFieldProps {
  label: string;
  title: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const CoteField: React.FC<CoteFieldProps> = ({
  label,
  title,
  value,
  onChange,
  disabled,
}) => (
  <NumberInput
    label={label}
    title={title}
    kind={LENGTH}
    value={value}
    onChange={onChange}
    unsigned
    precision={2}
    disabled={disabled}
  />
);

interface ShapeCotesProps {
  shape: ProfileShape;
  onChange: (newShape: ProfileShape) => void;
  disabled?: boolean;
}

/** The cote fields for `shape`'s own kind — never more than what that kind actually holds. A
 *  candidate that violates `validate_profile_shape` (a negative cote, a wall thickness past
 *  the half-cote it's cut from) is dropped rather than committed. */
const ShapeCotes: React.FC<ShapeCotesProps> = ({
  shape,
  onChange,
  disabled,
}) => {
  const commit = (candidate: ProfileShape) => {
    if (validate_profile_shape(candidate)) onChange(candidate);
  };

  switch (shape.kind) {
    case "rect":
      return (
        <>
          <CoteField
            label="b"
            title={t("profile_field_width")}
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            title={t("profile_field_height")}
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
        </>
      );
    case "box":
      return (
        <>
          <CoteField
            label="b"
            title={t("profile_field_width")}
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            title={t("profile_field_height")}
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
          <CoteField
            label="e"
            title={t("profile_field_thickness")}
            value={shape.e}
            onChange={(e) => commit({ ...shape, e })}
            disabled={disabled}
          />
        </>
      );
    case "round":
      return (
        <CoteField
          label="d"
          title={t("profile_field_diameter")}
          value={shape.d}
          onChange={(d) => commit({ ...shape, d })}
          disabled={disabled}
        />
      );
    case "tube":
      return (
        <>
          <CoteField
            label="d"
            title={t("profile_field_diameter")}
            value={shape.d}
            onChange={(d) => commit({ ...shape, d })}
            disabled={disabled}
          />
          <CoteField
            label="e"
            title={t("profile_field_thickness")}
            value={shape.e}
            onChange={(e) => commit({ ...shape, e })}
            disabled={disabled}
          />
        </>
      );
    case "I":
      return (
        <>
          <CoteField
            label="b"
            title={t("profile_field_width")}
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            title={t("profile_field_height")}
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
          <CoteField
            label="tw"
            title={t("profile_field_web_thickness")}
            value={shape.tw}
            onChange={(tw) => commit({ ...shape, tw })}
            disabled={disabled}
          />
          <CoteField
            label="tf"
            title={t("profile_field_flange_thickness")}
            value={shape.tf}
            onChange={(tf) => commit({ ...shape, tf })}
            disabled={disabled}
          />
        </>
      );
  }
};

export interface ProfileDetailProps {
  shape: ProfileShape;
  onChangeShape?: (newShape: ProfileShape) => void;
}

export const ProfileDetail: React.FC<ProfileDetailProps> = ({
  shape,
  onChangeShape,
}) => (
  <Box>
    <Divider />
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5 }}>
      <Select
        size="small"
        value={shape.kind}
        onChange={(e) =>
          onChangeShape?.(
            default_shape_for_kind(e.target.value as ProfileShape["kind"]),
          )
        }
      >
        {SHAPE_KINDS.map((kind) => (
          <MenuItem key={kind} value={kind}>
            {shape_kind_label(kind)}
          </MenuItem>
        ))}
      </Select>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <ShapeCotes shape={shape} onChange={onChangeShape!} />
      </Box>
      <SectionSchema shape={shape} />
    </Box>
  </Box>
);

// ─── The panel itself ──────────────────────────────────────────────────────────────────────────

export interface LibraryFocusRequest {
  section: "materials" | "profiles";
  /** Every entry to open — more than one when the beams asking don't share theirs. */
  ids: ID[];
}

interface MaterialsLibraryPanelProps {
  mechanism: Mechanism;
  applyActions: (actions: Action[]) => void;
  /** Which section is hovered — also what tints the canvas for as long as the hover lasts.
   *  Lifted to the app, not local state: the canvas needs to know it too. */
  setHoveredSection: (section: "materials" | "profiles" | null) => void;
  /** A row hovered here, for the canvas to accentuate its beams and fade the rest — narrows
   *  the section-wide tint to just this entry. */
  hoveredEntryID: ID | null;
  setHoveredEntryID: (id: ID | null) => void;
  /** The canvas's own hover, read (never written) here — the reverse direction: a beam
   *  hovered on the canvas lights up the row it belongs to. */
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  /** Threaded down to each beam row so it can select/highlight like any other `ElementDisplay`. */
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  /** Set from the elements tab's own "where can I edit this?" link — expands that entry here
   *  once, then must be acknowledged so the next visit doesn't re-apply it. */
  focusRequest: LibraryFocusRequest | null;
  onFocusHandled: () => void;
}

export const MaterialsLibraryPanel: React.FC<MaterialsLibraryPanelProps> = ({
  mechanism,
  applyActions,
  setHoveredSection,
  hoveredEntryID,
  setHoveredEntryID,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  focusRequest,
  onFocusHandled,
}) => {
  // Which entries are open — their own detail (E/Re/ρ, or cotes) and beam list both, together.
  // Any number at once per section: nothing here is mutually exclusive.
  const [expandedMaterialIDs, setExpandedMaterialIDs] = React.useState<Set<ID>>(
    new Set(),
  );
  const [expandedProfileIDs, setExpandedProfileIDs] = React.useState<Set<ID>>(
    new Set(),
  );
  const toggleMaterialExpand = (id: ID) =>
    setExpandedMaterialIDs((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleProfileExpand = (id: ID) =>
    setExpandedProfileIDs((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [dragOverMaterialID, setDragOverMaterialID] = React.useState<ID | null>(
    null,
  );
  const [dragOverProfileID, setDragOverProfileID] = React.useState<ID | null>(
    null,
  );

  const materialGroupRefs = React.useRef(new Map<ID, HTMLDivElement>());
  const profileGroupRefs = React.useRef(new Map<ID, HTMLDivElement>());

  React.useEffect(() => {
    if (!focusRequest) return;
    const { ids } = focusRequest;
    if (ids.length === 0) return;
    // The first entry is what gets scrolled to: with several open, one of them has to be the
    // one the view lands on, and the picker lists them in that order.
    if (focusRequest.section === "materials") {
      setExpandedMaterialIDs((cur) => new Set([...cur, ...ids]));
      materialGroupRefs.current
        .get(ids[0])
        ?.scrollIntoView({ block: "nearest" });
    } else {
      setExpandedProfileIDs((cur) => new Set([...cur, ...ids]));
      profileGroupRefs.current.get(ids[0])?.scrollIntoView({ block: "nearest" });
    }
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  const beams = mechanism.mechanicalElements.filter(
    (el): el is BeamElement => el.type === "beam",
  );

  const hoveredBeam =
    hoveredPart.type === "Edge"
      ? beams.find((el) => el.id === hoveredPart.id)
      : undefined;

  const addMaterial = () => {
    const material = default_material(mechanism.materials.map((m) => m.name));
    applyActions([{ type: "CreateMaterial", material }]);
    setExpandedMaterialIDs((cur) => new Set(cur).add(material.id));
  };
  const addProfile = () => {
    const profile = default_profile(mechanism.profiles.map((p) => p.name));
    applyActions([{ type: "CreateProfile", profile }]);
    setExpandedProfileIDs((cur) => new Set(cur).add(profile.id));
  };

  const deleteMaterial = (materialID: ID) => {
    // In use: reassign every beam holding it to another entry first, one bundled undo step —
    // this is the "delete" gesture; a blocked dialog isn't. Only truly impossible (this is the
    // library's last material) leaves the delete button disabled instead.
    const fallback = mechanism.materials.find((m) => m.id !== materialID);
    if (!fallback) return;
    const material = mechanism.materials.find((m) => m.id === materialID);
    if (!material) return;
    const reassign: Action[] = beams
      .filter((beam) => beam.materialID === materialID)
      .map((beam) => ({
        type: "AssignMaterial",
        id: beam.id,
        newMaterialID: fallback.id,
        oldMaterialID: materialID,
      }));
    applyActions([...reassign, { type: "DeleteMaterial", material }]);
  };
  const deleteProfile = (profileID: ID) => {
    const fallback = mechanism.profiles.find((p) => p.id !== profileID);
    if (!fallback) return;
    const profile = mechanism.profiles.find((p) => p.id === profileID);
    if (!profile) return;
    const reassign: Action[] = beams
      .filter((beam) => beam.profileID === profileID)
      .map((beam) => ({
        type: "AssignProfile",
        id: beam.id,
        newProfileID: fallback.id,
        oldProfileID: profileID,
      }));
    applyActions([...reassign, { type: "DeleteProfile", profile }]);
  };

  const handleMaterialDragOver = (e: React.DragEvent, targetID: ID) => {
    if (
      !e.dataTransfer.types.includes(MATERIAL_BEAM_MIME) &&
      !e.dataTransfer.types.includes(MATERIAL_GROUP_MIME)
    )
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverMaterialID(targetID);
  };
  const handleMaterialDragLeave = (e: React.DragEvent, targetID: ID) => {
    // dragleave also fires when the pointer moves onto a child (a nested beam row) still
    // inside the same group — only clear once it has actually left the group's box.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverMaterialID((cur) => (cur === targetID ? null : cur));
  };
  const handleMaterialDrop = (targetID: ID) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverMaterialID(null);
    const groupID = e.dataTransfer.getData(MATERIAL_GROUP_MIME) as ID;
    if (groupID) {
      if (groupID === targetID) return;
      applyActions(
        beams
          .filter((beam) => beam.materialID === groupID)
          .map((beam) => ({
            type: "AssignMaterial",
            id: beam.id,
            newMaterialID: targetID,
            oldMaterialID: groupID,
          })),
      );
      return;
    }
    const beamID = e.dataTransfer.getData(MATERIAL_BEAM_MIME) as ID;
    const beam = beams.find((b) => b.id === beamID);
    if (!beam || beam.materialID === targetID) return;
    applyActions([
      {
        type: "AssignMaterial",
        id: beam.id,
        newMaterialID: targetID,
        oldMaterialID: beam.materialID,
      },
    ]);
  };

  const handleProfileDragOver = (e: React.DragEvent, targetID: ID) => {
    if (
      !e.dataTransfer.types.includes(PROFILE_BEAM_MIME) &&
      !e.dataTransfer.types.includes(PROFILE_GROUP_MIME)
    )
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverProfileID(targetID);
  };
  const handleProfileDragLeave = (e: React.DragEvent, targetID: ID) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverProfileID((cur) => (cur === targetID ? null : cur));
  };
  const handleProfileDrop = (targetID: ID) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverProfileID(null);
    const groupID = e.dataTransfer.getData(PROFILE_GROUP_MIME) as ID;
    if (groupID) {
      if (groupID === targetID) return;
      applyActions(
        beams
          .filter((beam) => beam.profileID === groupID)
          .map((beam) => ({
            type: "AssignProfile",
            id: beam.id,
            newProfileID: targetID,
            oldProfileID: groupID,
          })),
      );
      return;
    }
    const beamID = e.dataTransfer.getData(PROFILE_BEAM_MIME) as ID;
    const beam = beams.find((b) => b.id === beamID);
    if (!beam || beam.profileID === targetID) return;
    applyActions([
      {
        type: "AssignProfile",
        id: beam.id,
        newProfileID: targetID,
        oldProfileID: beam.profileID,
      },
    ]);
  };

  return (
    <Box>
      {/* ── Matériaux ── */}
      <Typography
        variant="subtitle2"
        fontWeight={600}
        sx={{ pl: 3, pt: 2, mb: -1.5 }}
      >
        {t("materials")}
      </Typography>
      <Box
        onMouseEnter={() => setHoveredSection("materials")}
        onMouseLeave={() => {
          setHoveredSection(null);
          setHoveredEntryID(null);
        }}
        sx={{
          borderRadius: 2,
          margin: 2,
          backgroundColor: "background.sunken",
          overflow: "hidden",
        }}
      >
        {mechanism.materials.map((material, i) => {
          const materialBeams = beams.filter(
            (beam) => beam.materialID === material.id,
          );
          return (
            <LibraryEntryGroup
              key={material.id}
              groupRef={(el) => {
                if (el) materialGroupRefs.current.set(material.id, el);
                else materialGroupRefs.current.delete(material.id);
              }}
              index={i}
              name={material.name}
              usageCount={materialBeams.length}
              expanded={expandedMaterialIDs.has(material.id)}
              onToggleExpand={() => toggleMaterialExpand(material.id)}
              groupDrag={
                materialBeams.length > 1
                  ? { id: material.id, mimeType: MATERIAL_GROUP_MIME }
                  : undefined
              }
              isCanvasHighlighted={
                hoveredBeam?.materialID === material.id ||
                hoveredEntryID === material.id
              }
              canDelete={mechanism.materials.length > 1}
              onHoverStart={() => setHoveredEntryID(material.id)}
              onHoverEnd={() => setHoveredEntryID(null)}
              onRename={(newName) =>
                applyActions([
                  {
                    type: "RenameMaterial",
                    id: material.id,
                    newName,
                    oldName: material.name,
                  },
                ])
              }
              onDuplicate={() =>
                applyActions([
                  {
                    type: "CreateMaterial",
                    material: {
                      ...material,
                      id: crypto.randomUUID() as ID,
                      name: unique_copy_name(
                        material.name,
                        mechanism.materials.map((m) => m.name),
                      ),
                    },
                  },
                ])
              }
              onDelete={() => deleteMaterial(material.id)}
              dragOver={dragOverMaterialID === material.id}
              onDragOver={(e) => handleMaterialDragOver(e, material.id)}
              onDragLeave={(e) => handleMaterialDragLeave(e, material.id)}
              onDrop={handleMaterialDrop(material.id)}
              detail={
                <MaterialDetail
                  E={material.E}
                  Re={material.Re}
                  rho={material.rho}
                  onChangeE={(newE) =>
                    applyActions([
                      {
                        type: "ChangeMaterialE",
                        id: material.id,
                        delta: newE - material.E,
                      },
                    ])
                  }
                  onChangeRe={(newRe) =>
                    applyActions([
                      {
                        type: "ChangeMaterialRe",
                        id: material.id,
                        delta: newRe - material.Re,
                      },
                    ])
                  }
                  onChangeRho={(newRho) =>
                    applyActions([
                      {
                        type: "ChangeMaterialRho",
                        id: material.id,
                        delta: newRho - material.rho,
                      },
                    ])
                  }
                />
              }
            >
              {materialBeams.length > 0 && (
                <Box>
                  <Divider />
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      pl: 3.5,
                      py: 0.5,
                    }}
                  >
                    {materialBeams.map((beam) => (
                      <DraggableBeamRow
                        key={beam.id}
                        beam={beam}
                        dragMimeType={MATERIAL_BEAM_MIME}
                        hoveredPart={hoveredPart}
                        setHoveredPart={setHoveredPart}
                        selectedIds={selectedIds}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </LibraryEntryGroup>
          );
        })}
        <Button
          fullWidth
          size="small"
          startIcon={<Add fontSize="small" />}
          onClick={addMaterial}
          sx={{ borderRadius: 0 }}
        >
          {t("add_material")}
        </Button>
      </Box>

      {/* ── Profilés ── */}
      <Typography variant="subtitle2" fontWeight={600} sx={{ pl: 3, mb: -1.5 }}>
        {t("profiles_section")}
      </Typography>
      <Box
        onMouseEnter={() => setHoveredSection("profiles")}
        onMouseLeave={() => {
          setHoveredSection(null);
          setHoveredEntryID(null);
        }}
        sx={{
          borderRadius: 2,
          margin: 2,
          backgroundColor: "background.sunken",
          overflow: "hidden",
        }}
      >
        {mechanism.profiles.map((profile, i) => {
          const profileBeams = beams.filter(
            (beam) => beam.profileID === profile.id,
          );
          return (
            <LibraryEntryGroup
              key={profile.id}
              groupRef={(el) => {
                if (el) profileGroupRefs.current.set(profile.id, el);
                else profileGroupRefs.current.delete(profile.id);
              }}
              index={i}
              name={profile.name}
              usageCount={profileBeams.length}
              expanded={expandedProfileIDs.has(profile.id)}
              onToggleExpand={() => toggleProfileExpand(profile.id)}
              groupDrag={
                profileBeams.length > 1
                  ? { id: profile.id, mimeType: PROFILE_GROUP_MIME }
                  : undefined
              }
              isCanvasHighlighted={
                hoveredBeam?.profileID === profile.id ||
                hoveredEntryID === profile.id
              }
              canDelete={mechanism.profiles.length > 1}
              onHoverStart={() => setHoveredEntryID(profile.id)}
              onHoverEnd={() => setHoveredEntryID(null)}
              onRename={(newName) =>
                applyActions([
                  {
                    type: "RenameProfile",
                    id: profile.id,
                    newName,
                    oldName: profile.name,
                  },
                ])
              }
              onDuplicate={() =>
                applyActions([
                  {
                    type: "CreateProfile",
                    profile: {
                      ...profile,
                      id: crypto.randomUUID() as ID,
                      name: unique_copy_name(
                        profile.name,
                        mechanism.profiles.map((p) => p.name),
                      ),
                    },
                  },
                ])
              }
              onDelete={() => deleteProfile(profile.id)}
              dragOver={dragOverProfileID === profile.id}
              onDragOver={(e) => handleProfileDragOver(e, profile.id)}
              onDragLeave={(e) => handleProfileDragLeave(e, profile.id)}
              onDrop={handleProfileDrop(profile.id)}
              detail={
                <ProfileDetail
                  shape={profile.shape}
                  onChangeShape={(newShape) =>
                    applyActions([
                      {
                        type: "ChangeProfileShape",
                        id: profile.id,
                        newShape,
                        oldShape: profile.shape,
                      },
                    ])
                  }
                />
              }
            >
              {profileBeams.length > 0 && (
                <Box>
                  <Divider />
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      pl: 3.5,
                      py: 0.5,
                    }}
                  >
                    {profileBeams.map((beam) => (
                      <DraggableBeamRow
                        key={beam.id}
                        beam={beam}
                        dragMimeType={PROFILE_BEAM_MIME}
                        hoveredPart={hoveredPart}
                        setHoveredPart={setHoveredPart}
                        selectedIds={selectedIds}
                        setCanvasState={setCanvasState}
                        applyActions={applyActions}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </LibraryEntryGroup>
          );
        })}
        <Button
          fullWidth
          size="small"
          startIcon={<Add fontSize="small" />}
          onClick={addProfile}
          sx={{ borderRadius: 0 }}
        >
          {t("add_profile")}
        </Button>
      </Box>
    </Box>
  );
};

export default MaterialsLibraryPanel;
