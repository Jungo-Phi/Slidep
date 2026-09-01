import React from "react";
import {
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Close, KeyboardArrowDown, OpenInNew } from "@mui/icons-material";
import { Action, ID } from "../../../types";
import { BeamElement } from "../../../types/element";
import { MaterialDef, ProfileDef } from "../../../types/material";
import {
  default_material,
  default_profile,
} from "../../../constants/material-profile-catalog";
import { beam_linear_mass } from "../../../utils/section-properties";
import { MASS, format_quantity } from "../../../utils/quantity-format";
import { t } from "../../../i18n";
import { useLibraryNavigation } from "../library-navigation";
import {
  InlineName,
  MaterialDetail,
  ProfileDetail,
} from "../MaterialsLibraryPanel";
import SectionSchema from "./SectionSchema";

/**
 * A beam's material/profile assignment. Each picker
 * offers the mechanism's own library, plus "+ Nouveau…" at the bottom of its menu, which
 * creates a fresh entry, assigns it here, then opens a small panel docked on the picker to name
 * and configure it right there — dimensioning a beam that needs a profile absent from the
 * library shouldn't mean losing the beam's own context to go do that elsewhere. The small link
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
      <Box ref={ref} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="caption" sx={{ minWidth: 64 }}>
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
            px: 1,
            py: 0.25,
            flex: 1,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <Typography variant="body2" sx={{ flex: 1 }}>
            {selected?.name ?? ""}
          </Typography>
          <KeyboardArrowDown fontSize="small" />
        </Box>
        <Tooltip title={t("open_in_library")}>
          <IconButton size="small" onClick={onOpenInLibrary}>
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
  const material = materials.find((m) => m.id === element.materialID);
  const profile = profiles.find((p) => p.id === element.profileID);
  const mass =
    beam_linear_mass(
      element.materialID,
      element.profileID,
      materials,
      profiles,
    ) * element.positionStart.distance_to(element.positionEnd);

  const materialPickerRef = React.useRef<HTMLDivElement>(null);
  const profilePickerRef = React.useRef<HTMLDivElement>(null);
  // Which "just created" panel is open, docked on its own picker — never both: creating one
  // replaces whatever the other picker had open, same as any other popover on this row.
  const [openPanel, setOpenPanel] = React.useState<
    "materials" | "profiles" | null
  >(null);

  const createMaterial = () => {
    const newMaterial = default_material(materials.map((m) => m.name));
    applyActions([
      { type: "CreateMaterial", material: newMaterial },
      {
        type: "AssignMaterial",
        id: element.id,
        newMaterialID: newMaterial.id,
        oldMaterialID: element.materialID,
      },
    ]);
    setOpenPanel("materials");
  };
  const createProfile = () => {
    const newProfile = default_profile(profiles.map((p) => p.name));
    applyActions([
      { type: "CreateProfile", profile: newProfile },
      {
        type: "AssignProfile",
        id: element.id,
        newProfileID: newProfile.id,
        oldProfileID: element.profileID,
      },
    ]);
    setOpenPanel("profiles");
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
        onCreateNew={createMaterial}
        createNewLabel={t("add_material")}
        onOpenInLibrary={() =>
          focusLibraryEntry("materials", element.materialID)
        }
      />
      <Popover
        open={openPanel === "materials"}
        anchorEl={materialPickerRef.current}
        onClose={() => setOpenPanel(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        {material && (
          <Box sx={{ width: 260 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1,
                py: 0.5,
              }}
            >
              <InlineName
                name={material.name}
                onCommit={(newName) =>
                  applyActions([
                    {
                      type: "RenameMaterial",
                      id: material.id,
                      newName,
                      oldName: material.name,
                    },
                  ])
                }
              />
              <Tooltip title={t("close")}>
                <IconButton size="small" onClick={() => setOpenPanel(null)}>
                  <Close fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
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
        onCreateNew={createProfile}
        createNewLabel={t("add_profile")}
        onOpenInLibrary={() => focusLibraryEntry("profiles", element.profileID)}
      />
      <Popover
        open={openPanel === "profiles"}
        anchorEl={profilePickerRef.current}
        onClose={() => setOpenPanel(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        {profile && (
          <Box sx={{ width: 260 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1,
                pt: 0.5,
              }}
            >
              <InlineName
                name={profile.name}
                onCommit={(newName) =>
                  applyActions([
                    {
                      type: "RenameProfile",
                      id: profile.id,
                      newName,
                      oldName: profile.name,
                    },
                  ])
                }
              />
              <Tooltip title={t("close")}>
                <IconButton size="small" onClick={() => setOpenPanel(null)}>
                  <Close fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
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
          </Box>
        )}
      </Popover>
      {profile && <SectionSchema shape={profile.shape} />}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textAlign: "center" }}
      >
        {t("mass")} : {format_quantity(mass, MASS)}
      </Typography>
    </Box>
  );
};

export default MaterialProfileSection;
