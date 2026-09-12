import React from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
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
  KeyboardArrowDown,
  OpenInNew,
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
import { t } from "../../../i18n";
import { useLibraryNavigation } from "../library-navigation";
import {
  InlineName,
  MaterialDetail,
  ProfileDetail,
} from "../panels/MaterialsLibraryPanel";
import SectionSchema from "./SectionSchema";
import { useNonModalPopup } from "../../common/use-non-modal-popup";

/**
 * The material/profile assignment of a beam, or of a whole selection of them at once — a picker showing "mixte" when they don't agree, and assigning to every one of them.
 * Each picker offers the mechanism's own library, plus "+ Nouveau…" at the bottom of its menu, which opens a small panel docked on the picker to name and configure a new entry right there — dimensioning a beam that needs a profile absent from the library shouldn't mean losing the beam's own context to go do that elsewhere.
 * That entry is a draft until the panel's own "Create": dismissing the panel (click away, Escape, ✕) leaves both the library and the beam untouched, and confirming creates and assigns it in a single undo step.
 * The small link icon does a different thing for the entries already assigned: it jumps to the library tab and opens each of them, to answer "where can I edit this?" — duplicate/delete and the usage count only make sense there, since those entries may already be shared by other beams.
 *
 * The material picker's own `entries` already includes the catalogue (steel, aluminium…) — seeded read-only into every mechanism's library, so nothing here treats them specially; they pick and assign exactly like any other material.
 * Profiles carry no such catalogue: their own shape kind already is the catalogue (see `MaterialsLibraryPanel`'s own doc).
 */

interface LibraryPickerProps {
  /** The dropdown alone, no name beside it and no way out to the library: what a panel shows when its room is spent elsewhere. */
  compact?: boolean;
  label: string;
  entries: { id: ID; name: string }[];
  /** `undefined` when the beams it stands for don't agree on one — assigning still reaches them all. */
  selectedID: ID | undefined;
  onSelect: (id: ID) => void;
  onCreateNew: () => void;
  createNewLabel: string;
  onOpenInLibrary: () => void;
}

/** Forwards its own root, so the parent can dock the "just created" panel on it. */
const LibraryPicker = React.forwardRef<HTMLDivElement, LibraryPickerProps>(
  (
    {
      compact = false,
      label,
      entries,
      selectedID,
      onSelect,
      onCreateNew,
      createNewLabel,
      onOpenInLibrary,
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
          display: compact ? "flex" : "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 1.5,
          ...(compact && { flex: 1, minWidth: 0 }),
        }}
      >
        {!compact && <Typography variant="subtitle2">{label}</Typography>}
        <Tooltip title={compact ? label : ""}>
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
              py: compact ? 0 : 0.25,
              ...(compact && { flex: 1, minWidth: 0 }),
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <Typography variant={compact ? "caption" : "body2"} noWrap>
              {selected?.name ?? t("mixed_value")}{" "}
            </Typography>
            <KeyboardArrowDown fontSize="small" />
          </Box>
        </Tooltip>
        {!compact && (
          <Tooltip title={t("open_in_library")}>
            <IconButton
              size="small"
              onClick={onOpenInLibrary}
              sx={{ justifySelf: "end" }}
            >
              <OpenInNew fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
        <Menu
          {...popup}
          anchorEl={anchorEl}
          open={!!anchorEl}
        >
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

interface MaterialProfileSectionProps {
  /** One beam, or every beam of a multi-selection — an assignment goes to all of them. */
  elements: BeamElement[];
  materials: MaterialDef[];
  profiles: ProfileDef[];
  applyActions: (actions: Action[]) => void;
  /** The two dropdowns side by side and nothing else — no names, no section drawing, no values read off the entries: what a panel shows when its room is spent on other things (`SelectionInspector`). */
  compact?: boolean;
}

export const MaterialProfileSection: React.FC<MaterialProfileSectionProps> = ({
  elements,
  materials,
  profiles,
  applyActions,
  compact = false,
}) => {
  const focusLibraryEntry = useLibraryNavigation();
  const materialID = common_id(elements, (el) => el.materialID);
  const profileID = common_id(elements, (el) => el.profileID);
  const profile = profiles.find((p) => p.id === profileID);
  const material = materials.find((m) => m.id === materialID);
  /** Every entry the beams use, first one first — what the "open in library" link opens. */
  const used = (read: (element: BeamElement) => ID) => [
    ...new Set(elements.map(read)),
  ];
  // One beam only: a selection reads its mass off its own totals instead, where it also counts what isn't a beam.
  const soleBeam = elements.length === 1 ? elements[0] : undefined;
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

  const materialPickerRef = React.useRef<HTMLDivElement>(null);
  const profilePickerRef = React.useRef<HTMLDivElement>(null);
  // The entry being drafted, docked on its own picker — never both: starting one drops whatever the other picker had open, same as any other popover on this row.
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const draftMaterial = draft?.section === "materials" ? draft.material : null;
  const draftProfile = draft?.section === "profiles" ? draft.profile : null;

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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: compact ? "center" : "stretch",
        gap: 1,
      }}
    >
      <LibraryPicker
        compact={compact}
        ref={materialPickerRef}
        label={t("material_label")}
        entries={materials}
        selectedID={materialID}
        onSelect={(newMaterialID) =>
          applyActions(assignMaterial(newMaterialID))
        }
        onCreateNew={() =>
          setDraft({
            section: "materials",
            material: default_material(materials.map((m) => m.name)),
          })
        }
        createNewLabel={t("add_material")}
        onOpenInLibrary={() =>
          focusLibraryEntry(
            "materials",
            used((el) => el.materialID),
          )
        }
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
      <LibraryPicker
        compact={compact}
        ref={profilePickerRef}
        label={t("profile_label")}
        entries={profiles}
        selectedID={profileID}
        onSelect={(newProfileID) => applyActions(assignProfile(newProfileID))}
        onCreateNew={() =>
          setDraft({
            section: "profiles",
            profile: default_profile(profiles.map((p) => p.name)),
          })
        }
        createNewLabel={t("add_profile")}
        onOpenInLibrary={() =>
          focusLibraryEntry(
            "profiles",
            used((el) => el.profileID),
          )
        }
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
      {profile && !compact && <SectionSchema shape={profile.shape} />}
      <Box
        sx={{
          display: compact ? "none" : "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          rowGap: 0.5,
          columnGap: 2,
          px: 1,
        }}
      >
        {material && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            E : {format_quantity(material.E, STRESS)}
          </Typography>
        )}
        {material && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            Re : {format_quantity(material.Re, STRESS)}
          </Typography>
        )}
        {material && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            ρ : {format_quantity(material.rho, DENSITY)}
          </Typography>
        )}
        {beamMass !== undefined && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            {t("mass")} : {format_quantity(beamMass, MASS)}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default MaterialProfileSection;
