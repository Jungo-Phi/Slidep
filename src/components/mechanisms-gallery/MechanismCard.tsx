import React, { useEffect, useRef, useState, ComponentProps } from "react";
import {
  Grid,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
  TextField,
  Divider,
} from "@mui/material";
import { AccessTime, Delete, Download, Edit } from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import { format_date } from "../../utils";
import MechanismThumbnail from "./MechanismThumbnail";

interface MechanismCardProps {
  mechanismRecord: SerializedMechanism;
  gridSize: ComponentProps<typeof Grid>["size"];
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onRename: (createdAtId: number, name: string) => void;
  onDelete: (createdAtId: number) => void;
  onExport: (mechanismRecord: SerializedMechanism) => void;
}

/**
 * Une carte de la galerie : un panneau à plat (pas de `Card`/`Paper`, pas de
 * levée au survol) pour rester léger une fois qu'on en affiche des dizaines.
 * Le survol est porté sur le panneau entier — pas seulement la miniature —
 * pour rester cohérent avec la teinte de survol déjà déclenchée dessus.
 */
export const MechanismCard: React.FC<MechanismCardProps> = ({
  mechanismRecord,
  gridSize,
  onLoad,
  onRename,
  onDelete,
  onExport,
}) => {
  const [hovered, setHovered] = useState(false);
  const hasTags =
    mechanismRecord.metadata.tags && mechanismRecord.metadata.tags.length > 0;
  const description = mechanismRecord.metadata.description;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(mechanismRecord.metadata.name);
  useEffect(() => {
    setNameDraft(mechanismRecord.metadata.name);
  }, [mechanismRecord.metadata.name]);
  // Set by Escape so the blur it triggers discards instead of committing.
  const discardNameRef = useRef(false);

  const commitName = () => {
    setEditingName(false);
    if (discardNameRef.current) {
      discardNameRef.current = false;
      setNameDraft(mechanismRecord.metadata.name);
      return;
    }
    if (nameDraft !== mechanismRecord.metadata.name) {
      onRename(mechanismRecord.metadata.createdAt, nameDraft);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      discardNameRef.current = true;
      (e.target as HTMLElement).blur();
    } else if (e.key === "Enter") {
      (e.target as HTMLElement).blur();
    }
  };

  // Same idea for the name: the actions reserve no width until hovered (see
  // below), so whether it's cut off can change with the hover state too.
  const nameRef = useRef<HTMLSpanElement>(null);
  const [nameTruncated, setNameTruncated] = useState(false);
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    setNameTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [mechanismRecord.metadata.name, hovered]);

  return (
    <Grid size={gridSize} key={mechanismRecord.metadata.createdAt}>
      <Tooltip
        disableInteractive
        title={description}
        disableHoverListener={!mechanismRecord.metadata.description}
      >
        <Box
          onClick={() => onLoad(mechanismRecord)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            cursor: "pointer",
            border: "1px solid",
            borderColor: "dividers.ground",
            borderRadius: 2,
            bgcolor: "background.default",
            overflow: "hidden",
            transition: "border-color 0.15s, background-color 0.15s",
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: "action.hover",
            },
          }}
        >
          {/* Miniature, redessinée au thème courant */}
          <MechanismThumbnail record={mechanismRecord} hovered={hovered} />

          <Divider sx={{ borderColor: "dividers.ground" }} />

          <Box sx={{ flexGrow: 1, p: 1.5 }}>
            {/* Nom, éditable via le crayon révélé au survol */}
            <Box
              display="flex"
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ minHeight: 32 }}
            >
              {editingName ? (
                <TextField
                  autoFocus
                  fullWidth
                  variant="standard"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={handleNameKeyDown}
                  onBlur={commitName}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  slotProps={{
                    input: {
                      sx: { fontSize: "1rem", fontWeight: 600 },
                    },
                  }}
                />
              ) : (
                <>
                  <Tooltip
                    disableInteractive
                    title={mechanismRecord.metadata.name}
                    disableHoverListener={!nameTruncated}
                  >
                    <Typography
                      ref={nameRef}
                      variant="h6"
                      noWrap
                      fontWeight="600"
                      color={
                        mechanismRecord.metadata.name
                          ? "text.primary"
                          : "text.disabled"
                      }
                    >
                      {mechanismRecord.metadata.name || t("untitled")}
                    </Typography>
                  </Tooltip>
                  {/* Actions par mécanisme. Largeur nulle hors survol : le nom
                    récupère cette place plutôt que d'être tronqué pour rien.
                    `stopPropagation` : le panneau entier charge le mécanisme
                    au clic. */}
                  <Box
                    sx={{
                      display: "flex",
                      flexShrink: 0,
                      ml: hovered ? 0.5 : 0,
                      width: hovered ? 90 : 0,
                      opacity: hovered ? 1 : 0,
                      overflow: "hidden",
                      transition:
                        "width 0.15s, opacity 0.15s, margin-left 0.15s",
                    }}
                  >
                    <Tooltip disableInteractive title={t("gallery_rename")}>
                      <IconButton
                        size="small"
                        color="inherit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingName(true);
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip disableInteractive title={t("gallery_export")}>
                      <IconButton
                        size="small"
                        color="inherit"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExport(mechanismRecord);
                        }}
                      >
                        <Download fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip disableInteractive title={t("action_delete")}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(mechanismRecord.metadata.createdAt);
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </>
              )}
            </Box>

            {/* Date et Info éléments */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 1.5,
                mt: 0.75,
                color: "text.secondary",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <AccessTime fontSize="small" />
                <Typography variant="caption">
                  {format_date(mechanismRecord.metadata.modifiedAt)}
                </Typography>
              </Box>

              {/* Compteur d'éléments */}
              {/*
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                bgcolor: "background.sunken",
                px: 1,
                py: 0.2,
                borderRadius: 1,
              }}
            >
              <Settings fontSize="small" sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight="600">
                {tn("gallery_parts", elementCount)}
              </Typography>
            </Box>
            */}
            </Box>

            {/* Tags (Affiché uniquement s'il y a des tags) */}
            {hasTags && (
              <Box
                sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.75 }}
              >
                {mechanismRecord.metadata.tags.slice(0, 3).map((tag, idx) => (
                  <Chip
                    key={idx}
                    label={tag}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }}
                  />
                ))}
                {mechanismRecord.metadata.tags.length > 3 && (
                  <Typography
                    variant="caption"
                    sx={{ alignSelf: "center", color: "text.secondary" }}
                  >
                    +{mechanismRecord.metadata.tags.length - 3}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Tooltip>
    </Grid>
  );
};

export default MechanismCard;
