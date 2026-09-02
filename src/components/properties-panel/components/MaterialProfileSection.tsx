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
import {
  default_material,
  default_profile,
} from "../../../constants/material-profile-catalog";
import { beam_linear_mass } from "../../../utils/section-properties";
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

/**
 * A beam's material/profile assignment. Each picker
 * offers the mechanism's own library, plus "+ Nouveau…" at the bottom of its menu, which opens a
 * small panel docked on the picker to name and configure a new entry right there — dimensioning a
 * beam that needs a profile absent from the library shouldn't mean losing the beam's own context
 * to go do that elsewhere.
 * That entry is a draft until the panel's own "Create": dismissing the panel (click away, Escape, ✕) leaves both the library and the beam untouched, and confirming creates and assigns it in a single undo step.
 * The small link
 * icon does a different thing for the entry already assigned: it jumps to the library tab, to
 * answer "where can I edit this?" — duplicate/delete and the usage count only make sense there,
 * since that entry may already be shared by other beams.
 *
 * The material picker's own `entries` already includes the catalogue (steel, aluminium…) —
 * seeded read-only into every mechanism's library, so nothing here treats them specially; they
 * pick and assign exactly like any other material. Profiles
 * carry no such catalogue: their own shape kind already is the catalogue (see
 * `MaterialsLibraryPanel`'s own doc).
 */

interface LibraryPickerProps {
  label: string;
  entries: { id: ID; name: string }[];
  selectedID: ID;
  onSelect: (id: ID) => void;
  onCreateNew: () => void;
  createNewLabel: string;
  onOpenInLibrary: () => void;
}

/** Forwards its own root, so the parent can dock the "just created" panel on it. */
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
    },
    ref,
  ) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const selected = entries.find((entry) => entry.id === selectedID);

    return (
      <Box
        ref={ref}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ minWidth: 50 }}>
          {label}
        </Typography>
        <Box
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            borderRadius: 3,
            border: 1,
            borderColor: "divider",
            pl: 1,
            py: 0.25,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <Typography variant="body2">{selected?.name ?? ""} </Typography>
          <KeyboardArrowDown fontSize="small" />
        </Box>
        <Tooltip title={t("open_in_library")}>
          <IconButton size="small" onClick={onOpenInLibrary} sx={{ ml: 3 }}>
            <OpenInNew fontSize="inherit" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={!!anchorEl}
          onClose={() => setAnchorEl(null)}
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

interface MaterialProfileSectionProps {
  element: BeamElement;
  materials: MaterialDef[];
  profiles: ProfileDef[];
  applyActions: (actions: Action[]) => void;
}

export const MaterialProfileSection: React.FC<MaterialProfileSectionProps> = ({
  element,
  materials,
  profiles,
  applyActions,
}) => {
  const focusLibraryEntry = useLibraryNavigation();
  const profile = profiles.find((p) => p.id === element.profileID);
  const mass =
    beam_linear_mass(
      element.materialID,
      element.profileID,
      materials,
      profiles,
    ) * element.positionStart.distance_to(element.positionEnd);
  const material = materials.find((m) => m.id === element.materialID)!;

  const materialPickerRef = React.useRef<HTMLDivElement>(null);
  const profilePickerRef = React.useRef<HTMLDivElement>(null);
  // The entry being drafted, docked on its own picker — never both: starting one drops whatever
  // the other picker had open, same as any other popover on this row.
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
      {
        type: "AssignMaterial",
        id: element.id,
        newMaterialID: material.id,
        oldMaterialID: element.materialID,
      },
    ]);
    setDraft(null);
  };
  const createProfile = (profile: ProfileDef) => {
    applyActions([
      { type: "CreateProfile", profile },
      {
        type: "AssignProfile",
        id: element.id,
        newProfileID: profile.id,
        oldProfileID: element.profileID,
      },
    ]);
    setDraft(null);
  };

  return (
    <Box sx={{ px: 2, display: "flex", flexDirection: "column", gap: 1 }}>
      <LibraryPicker
        ref={materialPickerRef}
        label={t("material_label")}
        entries={materials}
        selectedID={element.materialID}
        onSelect={(newMaterialID) =>
          applyActions([
            {
              type: "AssignMaterial",
              id: element.id,
              newMaterialID,
              oldMaterialID: element.materialID,
            },
          ])
        }
        onCreateNew={() =>
          setDraft({
            section: "materials",
            material: default_material(materials.map((m) => m.name)),
          })
        }
        createNewLabel={t("add_material")}
        onOpenInLibrary={() =>
          focusLibraryEntry("materials", element.materialID)
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
            <MaterialDetail
              E={draftMaterial.E}
              Re={draftMaterial.Re}
              rho={draftMaterial.rho}
              onChangeE={(E) => editDraftMaterial({ E })}
              onChangeRe={(Re) => editDraftMaterial({ Re })}
              onChangeRho={(rho) => editDraftMaterial({ rho })}
            />
            <Divider />
            <Button
              fullWidth
              size="small"
              startIcon={<Check fontSize="small" />}
              onClick={() => createMaterial(draftMaterial)}
              sx={{ borderRadius: 0 }}
            >
              {t("create")}
            </Button>
          </Box>
        )}
      </Popover>
      <LibraryPicker
        ref={profilePickerRef}
        label={t("profile_label")}
        entries={profiles}
        selectedID={element.profileID}
        onSelect={(newProfileID) =>
          applyActions([
            {
              type: "AssignProfile",
              id: element.id,
              newProfileID,
              oldProfileID: element.profileID,
            },
          ])
        }
        onCreateNew={() =>
          setDraft({
            section: "profiles",
            profile: default_profile(profiles.map((p) => p.name)),
          })
        }
        createNewLabel={t("add_profile")}
        onOpenInLibrary={() => focusLibraryEntry("profiles", element.profileID)}
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
            <ProfileDetail
              shape={draftProfile.shape}
              onChangeShape={(shape) => editDraftProfile({ shape })}
            />
            <Divider />
            <Button
              fullWidth
              size="small"
              startIcon={<Check fontSize="small" />}
              onClick={() => createProfile(draftProfile)}
              sx={{ borderRadius: 0 }}
            >
              {t("create")}
            </Button>
          </Box>
        )}
      </Popover>
      {profile && <SectionSchema shape={profile.shape} />}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          rowGap: 1,
          columnGap: 3,
          px: 4,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          E : {format_quantity(material.E, STRESS)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Re : {format_quantity(material.Re, STRESS)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          ρ : {format_quantity(material.rho, DENSITY)}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          {t("mass")} : {format_quantity(mass, MASS)}
        </Typography>
      </Box>
    </Box>
  );
};

export default MaterialProfileSection;
