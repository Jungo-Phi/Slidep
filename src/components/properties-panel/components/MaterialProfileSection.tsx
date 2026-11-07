import React from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Check,
  Close,
  Edit,
  KeyboardArrowDown,
  Layers as LibraryIcon,
  LinkOutlined,
} from "@mui/icons-material";
import { Action, ID } from "../../../types";
import { BeamElement } from "../../../types/element";
import { MaterialDef, ProfileDef } from "../../../types/material";
import { beam_linear_mass } from "../../../utils/section-properties";
import {
  default_material,
  default_profile,
} from "../../../constants/material-profile-catalog";
import {
  DENSITY,
  MASS,
  STRESS,
  format_quantity,
} from "../../../utils/quantity-format";
import { unique_copy_name } from "../../../utils/unique-name";
import { t, tn } from "../../../i18n";
import { useLibraryNavigation } from "../library-navigation";
import {
  InlineName,
  MaterialDetail,
  ProfileDetail,
} from "../panels/MaterialsLibraryPanel";
import SectionSchema from "./SectionSchema";
import { SECTION_SCHEMA } from "../../../constants/rendering-specs";
import { useNonModalPopup } from "../../common/use-non-modal-popup";
import { FIELD_LABEL_SX } from "../inspector-metrics";
import { icon } from "../../element-palette/iconDataUris";
import {
  CanvasHighlight,
  NO_HIGHLIGHT,
} from "../../canvas/drawing/draw-canvas";

/**
 * The material/profile of a beam, or of a whole selection of them at once — a picker showing "mixte" when they don't agree, and assigning to every one of them.
 * At rest the section stays compact: the profile's schema and the material's values, read-only.
 *
 * Each picker offers the mechanism's own library, plus "+ Nouveau…" at the bottom of its menu, which opens a small panel docked on the picker to name and configure a new entry right there — dimensioning a beam that needs a profile absent from the library shouldn't mean losing the beam's own context to go do that elsewhere.
 * That entry is a draft until the panel's own "Create": dismissing the panel (click away, Escape, ✕) leaves both the library and the beam untouched, and confirming creates and assigns it in a single undo step.
 *
 * The pencil opens the same kind of docked panel on the entry the beams already hold — its name and values, edited live — since that is where users look for it, not in the library tab.
 * Such an entry may be shared with beams outside the selection, which an edit here reaches as well: rather than forbidding it, the panel says so — "Partagé avec N autres poutres", and hovering it lights those beams up on the canvas — and offers "Dissocier", which gives the selection a copy of its own (create + assign, one undo step) to keep editing without touching the others.
 *
 * When the beams don't agree on one entry ("mixte"), there is nothing single to show or edit: in place of the schema (or of the material's values) sits the list of the entries the selection holds, each narrowing the selection down to its own beams — lit up on the canvas while hovered.
 *
 * The library icon jumps to the library tab and opens the entries held — duplicate/delete and the full list of users live there.
 */

interface LibraryPickerProps {
  label: string;
  entries: { id: ID; name: string }[];
  /** `undefined` when the beams it stands for don't agree on one — assigning still reaches them all. */
  selectedID: ID | undefined;
  onSelect: (id: ID) => void;
  onCreateNew: () => void;
  createNewLabel: string;
  onOpenInLibrary: () => void;
  /** Opens the selected entry's own editor — disabled while there isn't a single one to edit. */
  onEdit: () => void;
  /** Why "Edit" is disabled, while the beams don't agree on one entry. */
  editDisabledHint: string;
}

/** Forwards its own root, so the parent can dock its panels (draft, editor) on it. */
const LibraryPicker = React.forwardRef<HTMLDivElement, LibraryPickerProps>(
  (
    {
      label,
      entries,
      selectedID,
      onSelect,
      onCreateNew,
      createNewLabel,
      onOpenInLibrary,
      onEdit,
      editDisabledHint,
    },
    ref,
  ) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const popup = useNonModalPopup(!!anchorEl, anchorEl, () =>
      setAnchorEl(null),
    );
    const selected = entries.find((entry) => entry.id === selectedID);

    return (
      <Box
        ref={ref}
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Typography sx={FIELD_LABEL_SX}>{label}</Typography>
        <Box
          onClick={(e) => {
            const field = e.currentTarget;
            setAnchorEl((current) => (current ? null : field));
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            borderRadius: 3,
            border: 1,
            borderColor: "divider",
            pl: 1,
            py: 0.25,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <Typography variant="body2" noWrap>
            {selected?.name ?? t("mixed_value")}{" "}
          </Typography>
          <KeyboardArrowDown fontSize="small" />
        </Box>
        <Box
          sx={{
            display: "flex",
            justifySelf: "end",
            flexShrink: 0,
            // Ink rather than the IconButton default (`action.active`, a faded ink), like the rest of the panel; a disabled button keeps its own grey.
            "& .MuiIconButton-root:not(.Mui-disabled)": { color: "text.primary" },
          }}
        >
          {/* Kept in place when mixed, only disabled: the row doesn't shift, and the tooltip says what to do instead. */}
          <Tooltip title={selected ? t("edit") : editDisabledHint}>
            <span>
              <IconButton
                size="small"
                onClick={onEdit}
                disabled={!selected}
              >
                <Edit fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("open_in_library")}>
            <IconButton size="small" onClick={onOpenInLibrary}>
              <LibraryIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>
        <Menu {...popup} anchorEl={anchorEl} open={!!anchorEl}>
          {entries.map((entry) => (
            <MenuItem
              key={entry.id}
              dense
              selected={entry.id === selectedID}
              onClick={() => {
                onSelect(entry.id);
                setAnchorEl(null);
              }}
            >
              {entry.name}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            dense
            onClick={() => {
              onCreateNew();
              setAnchorEl(null);
            }}
          >
            <Add fontSize="small" sx={{ mr: 1 }} />
            {createNewLabel}
          </MenuItem>
        </Menu>
      </Box>
    );
  },
);
LibraryPicker.displayName = "LibraryPicker";

/** Lights `ids` up on the canvas for as long as it's asked to, and never leaves them lit once unmounted. */
function useOwnHighlight(setHighlight?: (highlight: CanvasHighlight) => void) {
  const litRef = React.useRef(false);
  const light = (ids: ID[]) => {
    if (!setHighlight || ids.length === 0) return;
    litRef.current = true;
    setHighlight({ elements: new Set(ids), kind: "pick" });
  };
  const clear = () => {
    if (!litRef.current) return;
    litRef.current = false;
    setHighlight?.(NO_HIGHLIGHT);
  };
  const clearRef = React.useRef(clear);
  clearRef.current = clear;
  React.useEffect(() => () => clearRef.current(), []);
  return { light, clear };
}

/**
 * The schema/values block's own height, whatever it shows.
 * Fits the tallest schema at `PAGE_SECTION_SIZE` (a tube, 82 px with its cotes) and the material's four caption lines without a scrollbar; only a long mixed list scrolls.
 */
const SUMMARY_HEIGHT = 84;

/** One side of that block: its content centred while it fits, scrolled from its top once it doesn't. */
const SUMMARY_COLUMN_SX = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  "& > *": { my: "auto" },
} as const;

/** One entry the selection holds, and which of its beams hold it. */
interface EntryGroup {
  id: ID;
  name: string;
  beamIDs: ID[];
}

/**
 * In place of a mixed selection's schema/values: the entries it holds, listed right there, each narrowing the selection down to its own beams.
 * Hovering an entry lights its beams up on the canvas — the same "pick" highlight, and the same row look, as the elements overview's own groups.
 */
const GroupList: React.FC<{
  groups: EntryGroup[];
  onSelectBeams?: (ids: ID[]) => void;
  setHighlight?: (highlight: CanvasHighlight) => void;
}> = ({ groups, onSelectBeams, setHighlight }) => {
  const { light, clear } = useOwnHighlight(setHighlight);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {groups.map((group) => (
        <Box
          key={group.id}
          onMouseEnter={() => light(group.beamIDs)}
          onMouseLeave={clear}
          onClick={
            onSelectBeams
              ? () => {
                  clear();
                  onSelectBeams(group.beamIDs);
                }
              : undefined
          }
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 0.75,
            borderRadius: 3,
            cursor: onSelectBeams ? "pointer" : "default",
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          {/* Half the panel's width: a long name is the part that gives way, the count never does. */}
          <Typography
            variant="body2"
            noWrap
            title={group.name}
            sx={{ flex: 1, minWidth: 0 }}
          >
            {group.name}
          </Typography>
          <Box
            component="img"
            src={icon("beam")}
            draggable={false}
            sx={{ width: 16, height: 16, flexShrink: 0 }}
          />
          {/* The icon already says "beams": the count stands alone beside it. */}
          <Typography variant="caption" color="text.secondary" noWrap>
            {group.beamIDs.length}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

/**
 * The held entry's own editor, docked on its picker: its name, its values, and — when other beams share it — that fact, plus the way out of it.
 * Hovering it lights up, on the canvas, every other beam an edit here would also reach.
 */
const EntryEditor: React.FC<{
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  name: string;
  onRename: (newName: string) => void;
  /** Beams outside the selection that hold this same entry. */
  otherBeamIDs: ID[];
  onDetach: () => void;
  detachHint: string;
  setHighlight?: (highlight: CanvasHighlight) => void;
  children: React.ReactNode;
}> = ({
  anchorEl,
  open,
  onClose,
  name,
  onRename,
  otherBeamIDs,
  onDetach,
  detachHint,
  setHighlight,
  children,
}) => {
  const shared = otherBeamIDs.length > 0;
  const { light, clear } = useOwnHighlight(setHighlight);
  const hoveringRef = React.useRef(false);
  // The others change under the cursor (a detach, an undo…): the lit set follows.
  const othersKey = otherBeamIDs.join();
  React.useEffect(() => {
    if (!hoveringRef.current) return;
    if (shared) light(otherBeamIDs);
    else clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={() => {
        hoveringRef.current = false;
        clear();
        onClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box
        sx={{ width: 260 }}
        onMouseEnter={() => {
          hoveringRef.current = true;
          light(otherBeamIDs);
        }}
        onMouseLeave={() => {
          hoveringRef.current = false;
          clear();
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "background.default",
            p: 1,
          }}
        >
          <InlineName name={name} onCommit={onRename} />
          <Tooltip title={t("close")}>
            <IconButton size="small" onClick={onClose}>
              <Close fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        {shared && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              columnGap: 1,
              px: 1,
              pt: 1,
            }}
          >
            <Tooltip title={t("shared_edit_hint")}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <LinkOutlined sx={{ fontSize: 14 }} />
                {tn("shared_with_beams", otherBeamIDs.length)}
              </Typography>
            </Tooltip>
            <Tooltip title={detachHint}>
              <Link
                component="button"
                variant="caption"
                underline="hover"
                onClick={onDetach}
              >
                {t("detach")}
              </Link>
            </Tooltip>
          </Box>
        )}
        {children}
      </Box>
    </Popover>
  );
};

/** An entry being configured in its docked panel — held here, outside the mechanism, until confirmed. */
type Draft =
  | { section: "materials"; material: MaterialDef }
  | { section: "profiles"; profile: ProfileDef };

/** The one id `read` gives for every beam, or `undefined` if they don't all give the same. */
function common_id(
  elements: BeamElement[],
  read: (element: BeamElement) => ID,
): ID | undefined {
  const first = read(elements[0]);
  return elements.every((el) => read(el) === first) ? first : undefined;
}

/** The selection's beams, grouped by the entry `read` gives each — in library order. */
function entry_groups(
  elements: BeamElement[],
  read: (element: BeamElement) => ID,
  entries: { id: ID; name: string }[],
): EntryGroup[] {
  return entries
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      beamIDs: elements.filter((el) => read(el) === entry.id).map((el) => el.id),
    }))
    .filter((group) => group.beamIDs.length > 0);
}

interface MaterialProfileSectionProps {
  /** One beam, or every beam of a multi-selection — an assignment goes to all of them. */
  elements: BeamElement[];
  /** The same beams at the instant on screen: which entries they hold is read off these, while every assignment is built against `elements` (see `rebased_bundle`). */
  shownElements?: BeamElement[];
  /** The library at the instant on screen — what is listed and shown. */
  materials: MaterialDef[];
  profiles: ProfileDef[];
  /** The stored library, which every edit is built against — defaults to the shown one. */
  storedMaterials?: MaterialDef[];
  storedProfiles?: ProfileDef[];
  /** Every beam of the mechanism on screen — who else shares the entry being edited. */
  allBeams: BeamElement[];
  applyActions: (actions: Action[]) => void;
  setHighlight?: (highlight: CanvasHighlight) => void;
  /** Narrows the selection down to these beams — what a mixed selection's group menu does. */
  onSelectBeams?: (ids: ID[]) => void;
}

export const MaterialProfileSection: React.FC<MaterialProfileSectionProps> = ({
  elements,
  shownElements = elements,
  materials,
  profiles,
  storedMaterials = materials,
  storedProfiles = profiles,
  allBeams,
  applyActions,
  setHighlight,
  onSelectBeams,
}) => {
  const focusLibraryEntry = useLibraryNavigation();
  const materialID = common_id(shownElements, (el) => el.materialID);
  const profileID = common_id(shownElements, (el) => el.profileID);
  const profile = profiles.find((p) => p.id === profileID);
  const material = materials.find((m) => m.id === materialID);
  /** Every entry the beams use, first one first — what the "open in library" link opens. */
  const used = (read: (element: BeamElement) => ID) => [
    ...new Set(shownElements.map(read)),
  ];
  const selectedIDs = new Set(elements.map((el) => el.id));
  const others = (read: (beam: BeamElement) => ID, id: ID) =>
    allBeams
      .filter((beam) => read(beam) === id && !selectedIDs.has(beam.id))
      .map((beam) => beam.id);
  // One beam only: a selection reads its mass off its own totals instead, where it also counts what isn't a beam.
  const soleBeam = shownElements.length === 1 ? shownElements[0] : undefined;
  const beamMass =
    soleBeam &&
    beam_linear_mass(
      soleBeam.materialID,
      soleBeam.profileID,
      materials,
      profiles,
    ) * soleBeam.positionStart.distance_to(soleBeam.positionEnd);

  const assignMaterial = (newMaterialID: ID): Action[] =>
    elements.map((el) => ({
      type: "AssignMaterial",
      id: el.id,
      newMaterialID,
      oldMaterialID: el.materialID,
    }));
  const assignProfile = (newProfileID: ID): Action[] =>
    elements.map((el) => ({
      type: "AssignProfile",
      id: el.id,
      newProfileID,
      oldProfileID: el.profileID,
    }));

  // What each edit is built against: the stored entry, or the one shown when a later edit deleted it — the edit brings it back.
  const stored_material = (m: MaterialDef) =>
    storedMaterials.find((s) => s.id === m.id) ?? m;
  const stored_profile = (p: ProfileDef) =>
    storedProfiles.find((s) => s.id === p.id) ?? p;
  // A rename never brings back an entry a later edit deleted: a zero-sized edit of it does, ahead of the rename (same as the library tab).
  const revive_material = (m: MaterialDef): Action[] =>
    storedMaterials.some((s) => s.id === m.id)
      ? []
      : [{ type: "ChangeMaterialRho", id: m.id, delta: 0 }];
  const revive_profile = (p: ProfileDef): Action[] =>
    storedProfiles.some((s) => s.id === p.id)
      ? []
      : [
          {
            type: "ChangeProfileShape",
            id: p.id,
            newShape: p.shape,
            oldShape: p.shape,
          },
        ];

  const materialPickerRef = React.useRef<HTMLDivElement>(null);
  const profilePickerRef = React.useRef<HTMLDivElement>(null);
  // The entry being drafted, docked on its own picker — never both: starting one drops whatever the other picker had open, same as any other popover on this row.
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const draftMaterial = draft?.section === "materials" ? draft.material : null;
  const draftProfile = draft?.section === "profiles" ? draft.profile : null;
  // Which held entry's editor is open — the same one-at-a-time rule.
  const [editing, setEditing] = React.useState<
    "materials" | "profiles" | null
  >(null);

  const editDraftMaterial = (patch: Partial<MaterialDef>) =>
    setDraft((cur) =>
      cur?.section === "materials"
        ? { ...cur, material: { ...cur.material, ...patch } }
        : cur,
    );
  const editDraftProfile = (patch: Partial<ProfileDef>) =>
    setDraft((cur) =>
      cur?.section === "profiles"
        ? { ...cur, profile: { ...cur.profile, ...patch } }
        : cur,
    );

  const createMaterial = (material: MaterialDef) => {
    applyActions([
      { type: "CreateMaterial", material },
      ...assignMaterial(material.id),
    ]);
    setDraft(null);
  };
  const createProfile = (profile: ProfileDef) => {
    applyActions([
      { type: "CreateProfile", profile },
      ...assignProfile(profile.id),
    ]);
    setDraft(null);
  };

  /** A copy of `source` for the selection alone — created and assigned in one undo step; the editor stays open, now on the copy. */
  const detachMaterial = (source: MaterialDef) =>
    createMaterial({
      ...source,
      id: crypto.randomUUID() as ID,
      name: unique_copy_name(
        source.name,
        materials.map((m) => m.name),
      ),
    });
  const detachProfile = (source: ProfileDef) =>
    createProfile({
      ...source,
      id: crypto.randomUUID() as ID,
      name: unique_copy_name(
        source.name,
        profiles.map((p) => p.name),
      ),
    });

  return (
    // The full width whatever it holds: sized by its contents, it would shift its pickers each time another profile's schema came in wider or narrower.
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        width: "100%",
        gap: 1,
      }}
    >
      <LibraryPicker
        ref={materialPickerRef}
        label={t("material_label")}
        entries={materials}
        selectedID={materialID}
        onSelect={(newMaterialID) =>
          applyActions(assignMaterial(newMaterialID))
        }
        onCreateNew={() => {
          setEditing(null);
          setDraft({
            section: "materials",
            material: default_material(materials.map((m) => m.name)),
          });
        }}
        createNewLabel={t("add_material")}
        editDisabledHint={t("edit_disabled_material")}
        onOpenInLibrary={() =>
          focusLibraryEntry(
            "materials",
            used((el) => el.materialID),
          )
        }
        onEdit={() => {
          setDraft(null);
          setEditing("materials");
        }}
      />
      <Popover
        open={!!draftMaterial}
        anchorEl={materialPickerRef.current}
        onClose={() => setDraft(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        {draftMaterial && (
          <Box sx={{ width: 260 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                bgcolor: "background.default",
                p: 1,
              }}
            >
              <InlineName
                name={draftMaterial.name}
                onCommit={(name) => editDraftMaterial({ name })}
              />
              <Tooltip title={t("cancel")}>
                <IconButton size="small" onClick={() => setDraft(null)}>
                  <Close fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
            <Divider sx={{ mb: 1 }} />
            <MaterialDetail
              E={draftMaterial.E}
              Re={draftMaterial.Re}
              rho={draftMaterial.rho}
              onChangeE={(E) => editDraftMaterial({ E })}
              onChangeRe={(Re) => editDraftMaterial({ Re })}
              onChangeRho={(rho) => editDraftMaterial({ rho })}
            />
            <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                startIcon={<Check fontSize="small" />}
                onClick={() => createMaterial(draftMaterial)}
              >
                {t("create")}
              </Button>
            </Box>
          </Box>
        )}
      </Popover>
      {material && (
        <EntryEditor
          open={editing === "materials"}
          anchorEl={materialPickerRef.current}
          onClose={() => setEditing(null)}
          name={material.name}
          onRename={(newName) =>
            applyActions([
              ...revive_material(material),
              {
                type: "RenameMaterial",
                id: material.id,
                newName,
                oldName: material.name,
              },
            ])
          }
          otherBeamIDs={others((beam) => beam.materialID, material.id)}
          onDetach={() => detachMaterial(material)}
          detachHint={t("detach_hint_material")}
          setHighlight={setHighlight}
        >
          <MaterialDetail
            E={material.E}
            Re={material.Re}
            rho={material.rho}
            onChangeE={(newE) =>
              applyActions([
                {
                  type: "ChangeMaterialE",
                  id: material.id,
                  delta: newE - stored_material(material).E,
                },
              ])
            }
            onChangeRe={(newRe) =>
              applyActions([
                {
                  type: "ChangeMaterialRe",
                  id: material.id,
                  delta: newRe - stored_material(material).Re,
                },
              ])
            }
            onChangeRho={(newRho) =>
              applyActions([
                {
                  type: "ChangeMaterialRho",
                  id: material.id,
                  delta: newRho - stored_material(material).rho,
                },
              ])
            }
          />
        </EntryEditor>
      )}
      <LibraryPicker
        ref={profilePickerRef}
        label={t("profile_label")}
        entries={profiles}
        selectedID={profileID}
        onSelect={(newProfileID) => applyActions(assignProfile(newProfileID))}
        onCreateNew={() => {
          setEditing(null);
          setDraft({
            section: "profiles",
            profile: default_profile(profiles.map((p) => p.name)),
          });
        }}
        createNewLabel={t("add_profile")}
        editDisabledHint={t("edit_disabled_profile")}
        onOpenInLibrary={() =>
          focusLibraryEntry(
            "profiles",
            used((el) => el.profileID),
          )
        }
        onEdit={() => {
          setDraft(null);
          setEditing("profiles");
        }}
      />
      <Popover
        open={!!draftProfile}
        anchorEl={profilePickerRef.current}
        onClose={() => setDraft(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        {draftProfile && (
          <Box sx={{ width: 260 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                bgcolor: "background.default",
                p: 1,
              }}
            >
              <InlineName
                name={draftProfile.name}
                onCommit={(name) => editDraftProfile({ name })}
              />
              <Tooltip title={t("cancel")}>
                <IconButton size="small" onClick={() => setDraft(null)}>
                  <Close fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
            <Divider sx={{ mb: 1 }} />
            <ProfileDetail
              shape={draftProfile.shape}
              onChangeShape={(shape) => editDraftProfile({ shape })}
            />
            <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                startIcon={<Check fontSize="small" />}
                onClick={() => createProfile(draftProfile)}
              >
                {t("create")}
              </Button>
            </Box>
          </Box>
        )}
      </Popover>
      {profile && (
        <EntryEditor
          open={editing === "profiles"}
          anchorEl={profilePickerRef.current}
          onClose={() => setEditing(null)}
          name={profile.name}
          onRename={(newName) =>
            applyActions([
              ...revive_profile(profile),
              {
                type: "RenameProfile",
                id: profile.id,
                newName,
                oldName: profile.name,
              },
            ])
          }
          otherBeamIDs={others((beam) => beam.profileID, profile.id)}
          onDetach={() => detachProfile(profile)}
          detachHint={t("detach_hint_profile")}
          setHighlight={setHighlight}
        >
          <ProfileDetail
            shape={profile.shape}
            onChangeShape={(newShape) =>
              applyActions([
                {
                  type: "ChangeProfileShape",
                  id: profile.id,
                  newShape,
                  oldShape: stored_profile(profile).shape,
                },
              ])
            }
          />
        </EntryEditor>
      )}
      {/* The profile always on the left, the material always on the right — the schema and the values when the beams agree, the list of what they hold when they don't.
          A fixed height whatever shows: switching selections mustn't make the panel below jump, so a long list scrolls inside its own column instead. */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          height: SUMMARY_HEIGHT,
        }}
      >
        <Box sx={SUMMARY_COLUMN_SX}>
          {profile ? (
            <SectionSchema
              shape={profile.shape}
              size={SECTION_SCHEMA.PAGE_SECTION_SIZE}
            />
          ) : (
            <GroupList
              groups={entry_groups(
                shownElements,
                (el) => el.profileID,
                profiles,
              )}
              onSelectBeams={onSelectBeams}
              setHighlight={setHighlight}
            />
          )}
        </Box>
        <Box sx={SUMMARY_COLUMN_SX}>
          {material ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignSelf: "center",
                minWidth: 0,
              }}
            >
              <Typography variant="caption" color="text.secondary" noWrap>
                E : {format_quantity(material.E, STRESS)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                Re : {format_quantity(material.Re, STRESS)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                ρ : {format_quantity(material.rho, DENSITY)}
              </Typography>
              {beamMass !== undefined && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {t("mass")} : {format_quantity(beamMass, MASS)}
                </Typography>
              )}
            </Box>
          ) : (
            <GroupList
              groups={entry_groups(
                shownElements,
                (el) => el.materialID,
                materials,
              )}
              onSelectBeams={onSelectBeams}
              setHighlight={setHighlight}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default MaterialProfileSection;
