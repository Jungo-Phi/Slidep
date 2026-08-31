import React from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Tooltip,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Close, AddToPhotos, Lock } from "@mui/icons-material";
import { Action, BeamElement, HoveredPart, ID, Mechanism } from "../../types";
import { ProfileShape } from "../../types/material";
import {
  default_material,
  default_profile,
  default_shape_for_kind,
} from "../../constants/material-profile-catalog";
import {
  material_usage_count,
  profile_usage_count,
} from "../../utils/library-usage";
import { validate_profile_shape } from "../../utils/section-properties";
import NumberInput from "./components/NumberInput";
import SectionSchema from "./components/SectionSchema";
import { PROBE_ELEMENT_COLORS } from "./components/ProbeChart";
import { INLINE_INPUT_SX } from "../mechanisms-gallery/inline-input-sx";
import { DENSITY, LENGTH, STRESS } from "../../utils/quantity-format";
import { t } from "../../i18n";

/**
 * The properties panel's own "library" tab: create, rename, edit, duplicate and delete a
 * mechanism's own materials and profiles, master/detail —
 * a compact list selects the entry whose fields show below.
 *
 * Materials alone carry a catalogue: steel, aluminium… are seeded into every mechanism's own
 * `materials` at creation/migration (`seed_material_catalog`), `readOnly` — ordinary entries,
 * selectable and assignable like any other, just locked against rename/edit/delete.
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

// ─── Inline rename, fit to its own text — like a renamed element in `ElementDisplay` ─────────

export interface InlineNameProps {
  name: string;
  onCommit: (newName: string) => void;
  /** Same font/sizing as editable — only the HTML `readonly` attribute differs — so a locked
   *  catalogue entry's name reads at the same size as everyone else's, not smaller. */
  readOnly?: boolean;
}

export const InlineName: React.FC<InlineNameProps> = ({
  name,
  onCommit,
  readOnly = false,
}) => {
  const [draft, setDraft] = React.useState(name);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => setDraft(name), [name]);
  const discardRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Measured against the actual rendered input's own font (never a guessed one, which drifted
  // from the real metrics and clipped the text's tail) — a hidden span sharing that exact font
  // is the only reliable way to size a text input to its content.
  React.useEffect(() => {
    if (!inputRef.current) return;
    const span = document.createElement("span");
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    span.style.whiteSpace = "pre";
    span.style.font = getComputedStyle(inputRef.current).font;
    span.textContent = draft || " ";
    document.body.appendChild(span);
    setWidth(span.offsetWidth);
    document.body.removeChild(span);
  }, [draft]);

  return (
    <TextField
      variant="standard"
      value={draft}
      disabled={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      inputRef={inputRef}
      InputProps={{ disableUnderline: true }}
      sx={{
        ...INLINE_INPUT_SX,
        width: Math.max(24, width + 16),
        flexShrink: 0,
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

// ─── The compact list row, shared shape for materials and profiles ───────────────────────────

interface ListRowProps {
  index: number;
  name: string;
  usageCount?: number;
  selected: boolean;
  isHighlighted: boolean;
  /** A catalogue-seeded entry (`MaterialDef.readOnly`) — no rename, no delete; "duplicate" is
   *  how it becomes an ordinary, editable one. */
  readOnly?: boolean;
  /** Ignored when `readOnly`. */
  canDelete?: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onRename?: (newName: string) => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}

const ListRow: React.FC<ListRowProps> = ({
  index,
  name,
  usageCount = 0,
  selected,
  isHighlighted,
  readOnly = false,
  canDelete = true,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onRename,
  onDuplicate,
  onDelete,
}) => (
  <Box
    onClick={onSelect}
    onMouseEnter={onHoverStart}
    onMouseLeave={onHoverEnd}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.5,
      py: 0.5,
      px: 1,
      cursor: "pointer",
      borderBottom: 1,
      borderColor: "divider",
      backgroundColor: selected
        ? "action.selected"
        : isHighlighted
          ? "action.hover"
          : "transparent",
    }}
  >
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: swatch(index),
        flexShrink: 0,
      }}
    />
    <InlineName name={name} onCommit={onRename!} readOnly={readOnly} />
    <Box sx={{ flexGrow: 1 }} />
    {!readOnly && (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ flexShrink: 0 }}
      >
        {usageCount > 0 ? usageCount : t("unused_entry")}
      </Typography>
    )}
    <Tooltip title={t("duplicate")} disableInteractive>
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
    {readOnly ? (
      <span>
        <IconButton size="small" disabled>
          <Lock fontSize="inherit" />
        </IconButton>
      </span>
    ) : (
      <Tooltip
        title={canDelete ? t("delete") : t("delete_disabled_last_entry")}
        disableInteractive
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
    )}
  </Box>
);

// ─── Materials ─────────────────────────────────────────────────────────────────────────────────

export interface MaterialDetailProps {
  E: number;
  Re: number;
  rho: number;
  readOnly?: boolean;
  onChangeE?: (newE: number) => void;
  onChangeRe?: (newRe: number) => void;
  onChangeRho?: (newRho: number) => void;
}

export const MaterialDetail: React.FC<MaterialDetailProps> = ({
  E,
  Re,
  rho,
  readOnly = false,
  onChangeE,
  onChangeRe,
  onChangeRho,
}) => (
  <Box
    sx={{ display: "flex", flexDirection: "column", gap: 1, px: 1.5, py: 1.5 }}
  >
    <Tooltip title={t("material_field_E")} disableInteractive>
      <Box>
        <NumberInput
          label="E"
          kind={STRESS}
          value={E}
          onChange={onChangeE ?? (() => {})}
          unsigned
          disabled={readOnly}
        />
      </Box>
    </Tooltip>
    <Tooltip title={t("material_field_Re")} disableInteractive>
      <Box>
        <NumberInput
          label="Re"
          kind={STRESS}
          value={Re}
          onChange={onChangeRe ?? (() => {})}
          unsigned
          disabled={readOnly}
        />
      </Box>
    </Tooltip>
    <Tooltip title={t("material_field_rho")} disableInteractive>
      <Box>
        <NumberInput
          label="ρ"
          kind={DENSITY}
          value={rho}
          onChange={onChangeRho ?? (() => {})}
          unsigned
          disabled={readOnly}
        />
      </Box>
    </Tooltip>
  </Box>
);

// ─── Profiles ──────────────────────────────────────────────────────────────────────────────────

const SHAPE_KINDS: ProfileShape["kind"][] = [
  "rect",
  "round",
  "box",
  "tube",
  "I",
];

const shape_kind_label = (kind: ProfileShape["kind"]): string => {
  switch (kind) {
    case "rect":
      return t("profile_rectangle");
    case "round":
      return t("profile_round");
    case "box":
      return t("profile_box");
    case "tube":
      return t("profile_tube");
    case "I":
      return t("profile_i_beam");
  }
};

interface CoteFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const CoteField: React.FC<CoteFieldProps> = ({
  label,
  value,
  onChange,
  disabled,
}) => (
  <NumberInput
    label={label}
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
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
        </>
      );
    case "round":
      return (
        <CoteField
          label="d"
          value={shape.d}
          onChange={(d) => commit({ ...shape, d })}
          disabled={disabled}
        />
      );
    case "box":
      return (
        <>
          <CoteField
            label="b"
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
          <CoteField
            label="e"
            value={shape.e}
            onChange={(e) => commit({ ...shape, e })}
            disabled={disabled}
          />
        </>
      );
    case "tube":
      return (
        <>
          <CoteField
            label="d"
            value={shape.d}
            onChange={(d) => commit({ ...shape, d })}
            disabled={disabled}
          />
          <CoteField
            label="e"
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
            value={shape.b}
            onChange={(b) => commit({ ...shape, b })}
            disabled={disabled}
          />
          <CoteField
            label="h"
            value={shape.h}
            onChange={(h) => commit({ ...shape, h })}
            disabled={disabled}
          />
          <CoteField
            label="tw"
            value={shape.tw}
            onChange={(tw) => commit({ ...shape, tw })}
            disabled={disabled}
          />
          <CoteField
            label="tf"
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
  readOnly?: boolean;
  onChangeShape?: (newShape: ProfileShape) => void;
}

export const ProfileDetail: React.FC<ProfileDetailProps> = ({
  shape,
  readOnly = false,
  onChangeShape,
}) => (
  <Box
    sx={{ display: "flex", flexDirection: "column", gap: 1, px: 1.5, py: 1.5 }}
  >
    <Select
      size="small"
      value={shape.kind}
      disabled={readOnly}
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
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <ShapeCotes
        shape={shape}
        onChange={readOnly ? () => {} : onChangeShape!}
        disabled={readOnly}
      />
    </Box>
    <SectionSchema shape={shape} />
  </Box>
);

// ─── The panel itself ──────────────────────────────────────────────────────────────────────────

export interface LibraryFocusRequest {
  section: "materials" | "profiles";
  id: ID;
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
  /** Set from the elements tab's own "where can I edit this?" link — selects that entry here
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
  focusRequest,
  onFocusHandled,
}) => {
  // The master/detail selection — which entry's fields show below its list. Local: unlike
  // `hoveredSection`/hover, the canvas has no need to know it.
  const [selectedMaterialID, setSelectedMaterialID] = React.useState<ID | null>(
    null,
  );
  const [selectedProfileID, setSelectedProfileID] = React.useState<ID | null>(
    null,
  );

  React.useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.section === "materials")
      setSelectedMaterialID(focusRequest.id);
    else setSelectedProfileID(focusRequest.id);
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  const hoveredBeam =
    hoveredPart.type === "Edge"
      ? mechanism.mechanicalElements.find(
          (el): el is BeamElement =>
            el.type === "beam" && el.id === hoveredPart.id,
        )
      : undefined;

  // Falls back to the first entry so the detail pane is never empty while the library holds
  // at least one — including right after the selected entry was deleted.
  const ownSelectedMaterial =
    mechanism.materials.find((m) => m.id === selectedMaterialID) ??
    mechanism.materials[0];
  const ownSelectedProfile =
    mechanism.profiles.find((p) => p.id === selectedProfileID) ??
    mechanism.profiles[0];

  const addMaterial = () => {
    const material = default_material();
    applyActions([{ type: "CreateMaterial", material }]);
    setSelectedMaterialID(material.id);
  };
  const addProfile = () => {
    const profile = default_profile();
    applyActions([{ type: "CreateProfile", profile }]);
    setSelectedProfileID(profile.id);
  };

  const deleteMaterial = (materialID: ID) => {
    // In use: reassign every beam holding it to another entry first, one bundled undo step —
    // this is the "delete" gesture; a blocked dialog isn't. Only truly impossible (this is the
    // library's last material) leaves the delete button disabled instead.
    const fallback = mechanism.materials.find((m) => m.id !== materialID);
    if (!fallback) return;
    const material = mechanism.materials.find((m) => m.id === materialID);
    if (!material) return;
    const reassign: Action[] = mechanism.mechanicalElements
      .filter(
        (el): el is BeamElement =>
          el.type === "beam" && el.materialID === materialID,
      )
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
    const reassign: Action[] = mechanism.mechanicalElements
      .filter(
        (el): el is BeamElement =>
          el.type === "beam" && el.profileID === profileID,
      )
      .map((beam) => ({
        type: "AssignProfile",
        id: beam.id,
        newProfileID: fallback.id,
        oldProfileID: profileID,
      }));
    applyActions([...reassign, { type: "DeleteProfile", profile }]);
  };

  return (
    <Box>
      {/* ── Matériaux ── */}
      <Box
        onMouseEnter={() => setHoveredSection("materials")}
        onMouseLeave={() => {
          setHoveredSection(null);
          setHoveredEntryID(null);
        }}
      >
        <Typography
          variant="subtitle2"
          fontWeight={600}
          sx={{ px: 2, pt: 1.5 }}
        >
          {t("materials")}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          {mechanism.materials.map((material, i) => (
            <ListRow
              key={material.id}
              index={i}
              name={material.name}
              usageCount={material_usage_count(
                mechanism.mechanicalElements,
                material.id,
              )}
              readOnly={material.readOnly}
              selected={ownSelectedMaterial?.id === material.id}
              isHighlighted={
                hoveredBeam?.materialID === material.id ||
                hoveredEntryID === material.id
              }
              canDelete={mechanism.materials.length > 1}
              onSelect={() => setSelectedMaterialID(material.id)}
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
                      readOnly: false,
                    },
                  },
                ])
              }
              onDelete={() => deleteMaterial(material.id)}
            />
          ))}
        </Box>
        <Button
          fullWidth
          size="small"
          startIcon={<Add fontSize="small" />}
          onClick={addMaterial}
        >
          {t("add_material")}
        </Button>
        {ownSelectedMaterial && (
          <MaterialDetail
            E={ownSelectedMaterial.E}
            Re={ownSelectedMaterial.Re}
            rho={ownSelectedMaterial.rho}
            readOnly={ownSelectedMaterial.readOnly}
            onChangeE={(newE) =>
              applyActions([
                {
                  type: "ChangeMaterialE",
                  id: ownSelectedMaterial.id,
                  delta: newE - ownSelectedMaterial.E,
                },
              ])
            }
            onChangeRe={(newRe) =>
              applyActions([
                {
                  type: "ChangeMaterialRe",
                  id: ownSelectedMaterial.id,
                  delta: newRe - ownSelectedMaterial.Re,
                },
              ])
            }
            onChangeRho={(newRho) =>
              applyActions([
                {
                  type: "ChangeMaterialRho",
                  id: ownSelectedMaterial.id,
                  delta: newRho - ownSelectedMaterial.rho,
                },
              ])
            }
          />
        )}
      </Box>

      <Divider sx={{ mt: 1 }} />

      {/* ── Profilés ── */}
      <Box
        onMouseEnter={() => setHoveredSection("profiles")}
        onMouseLeave={() => {
          setHoveredSection(null);
          setHoveredEntryID(null);
        }}
      >
        <Typography
          variant="subtitle2"
          fontWeight={600}
          sx={{ px: 2, pt: 1.5 }}
        >
          {t("profiles_section")}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          {mechanism.profiles.map((profile, i) => (
            <ListRow
              key={profile.id}
              index={i}
              name={profile.name}
              usageCount={profile_usage_count(
                mechanism.mechanicalElements,
                profile.id,
              )}
              selected={ownSelectedProfile?.id === profile.id}
              isHighlighted={
                hoveredBeam?.profileID === profile.id ||
                hoveredEntryID === profile.id
              }
              canDelete={mechanism.profiles.length > 1}
              onSelect={() => setSelectedProfileID(profile.id)}
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
                    profile: { ...profile, id: crypto.randomUUID() as ID },
                  },
                ])
              }
              onDelete={() => deleteProfile(profile.id)}
            />
          ))}
        </Box>
        <Button
          fullWidth
          size="small"
          startIcon={<Add fontSize="small" />}
          onClick={addProfile}
        >
          {t("add_profile")}
        </Button>
        {ownSelectedProfile && (
          <ProfileDetail
            shape={ownSelectedProfile.shape}
            onChangeShape={(newShape) =>
              applyActions([
                {
                  type: "ChangeProfileShape",
                  id: ownSelectedProfile.id,
                  newShape,
                  oldShape: ownSelectedProfile.shape,
                },
              ])
            }
          />
        )}
      </Box>
    </Box>
  );
};

export default MaterialsLibraryPanel;
