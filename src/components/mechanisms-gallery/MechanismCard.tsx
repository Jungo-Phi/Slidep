import React, { useEffect, useRef, useState } from "react";
import {
  Typography,
  Box,
  IconButton,
  Tooltip,
  TextField,
  Divider,
} from "@mui/material";
import { Delete, Download } from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import MechanismThumbnail from "./MechanismThumbnail";
import TagChipsEditor from "./TagChipsEditor";
import { INLINE_INPUT_SX } from "./inline-input-sx";

interface MechanismCardProps {
  mechanismRecord: SerializedMechanism;
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onRename: (createdAtId: number, name: string) => void;
  onDelete: (createdAtId: number) => void;
  onExport: (mechanismRecord: SerializedMechanism) => void;
  onUpdateTags: (createdAtId: number, tags: string[]) => void;
  /** Every tag already used in the library, suggested by the tag autocomplete. */
  allTags: string[];
}

/**
 * Une carte de la galerie : un panneau à plat (pas de `Card`/`Paper`, pas de
 * levée au survol) pour rester léger une fois qu'on en affiche des dizaines.
 * Le survol est porté sur le panneau entier — pas seulement la miniature —
 * pour rester cohérent avec la teinte de survol déjà déclenchée dessus.
 */
export const MechanismCard: React.FC<MechanismCardProps> = ({
  mechanismRecord,
  onLoad,
  onRename,
  onDelete,
  onExport,
  onUpdateTags,
  allTags,
}) => {
  const [hovered, setHovered] = useState(false);
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

  const nameRef = useRef<HTMLSpanElement>(null);
  const [nameTruncated, setNameTruncated] = useState(false);
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    const measure = () => {
      if (hoveredRef.current) return;
      setNameTruncated(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mechanismRecord.metadata.name]);

  return (
    <Box
      onClick={() => onLoad(mechanismRecord)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
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

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          p: 1.5,
          pt: 0.5,
          gap: 1,
        }}
      >
        {/* Nom, éditable via le crayon révélé au survol */}
        <Box
          display="flex"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ minHeight: 32, mb: -1 }}
        >
          {editingName ? (
            <TextField
              autoFocus
              fullWidth
              variant="standard"
              size="small"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={handleNameKeyDown}
              onBlur={commitName}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              slotProps={{
                input: {
                  disableUnderline: true,
                  sx: { fontSize: "1rem", fontWeight: 600 },
                },
              }}
              sx={{
                ...INLINE_INPUT_SX,
                "& .MuiInputBase-input": {
                  paddingTop: "2px",
                  paddingBottom: "2px",
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
                  marginLeft={0.5}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingName(true);
                  }}
                  sx={{ cursor: "text" }}
                >
                  {mechanismRecord.metadata.name || t("untitled")}
                </Typography>
              </Tooltip>

              <Box
                sx={{
                  display: "flex",
                  flexShrink: 0,
                  ml: 0.5,
                  mr: -0.5,
                  width: hovered ? 64 : 0,
                  opacity: hovered ? 1 : 0,
                  overflow: "hidden",
                  transition: "width 0.15s, opacity 0.15s, margin-left 0.15s",
                }}
              >
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

        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: "0.78rem",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </Typography>
        )}

        <TagChipsEditor
          tags={mechanismRecord.metadata.tags}
          allTags={allTags}
          onChange={(tags) =>
            onUpdateTags(mechanismRecord.metadata.createdAt, tags)
          }
          mechanismLength={mechanismRecord.mechanicalElements.length}
          modifiedAt={mechanismRecord.metadata.modifiedAt}
        />
      </Box>
    </Box>
  );
};

export default MechanismCard;
