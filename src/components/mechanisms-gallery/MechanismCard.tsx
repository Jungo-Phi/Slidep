import React, { useEffect, useRef, useState } from "react";
import {
  Typography,
  Box,
  IconButton,
  Tooltip,
  TextField,
  Divider,
} from "@mui/material";
import { AddToPhotos, Delete, Download, MoreVert } from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import MechanismThumbnail from "./MechanismThumbnail";
import TagChipsEditor from "./TagChipsEditor";
import { INLINE_INPUT_SX } from "./inline-input-sx";
import { schedule_idle, cancel_idle } from "../../utils/idle-schedule";

interface MechanismCardProps {
  mechanismRecord: SerializedMechanism;
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onRename: (createdAtId: number, name: string) => void;
  onDelete: (createdAtId: number) => void;
  onExport: (mechanismRecord: SerializedMechanism) => void;
  onDuplicate: (
    createdAtId: number,
  ) => Promise<SerializedMechanism | undefined>;
  onUpdateTags: (createdAtId: number, tags: string[]) => void;
  allTags: string[];
  startInNameEdit?: boolean;
  onNameEditStarted?: () => void;
  /** The thumbnail and the title alone, for a narrow screen: the rest is behind `onShowDetails`, and tapping anywhere else opens the mechanism. */
  compact?: boolean;
  onShowDetails?: () => void;
  /** Whether it is the mechanism open in the app. */
  isOpen?: boolean;
  /** Whether its details are the ones raised. */
  detailsShown?: boolean;
  /**
   * Whether Tab stops on it and on its controls: in the gallery, only the card the arrows last reached is, so that Tab crosses the grid in one step.
   * See `gallery-keyboard.ts` for the arrows.
   */
  tabbable?: boolean;
  /** Its column and rank in the gallery, which the arrows read off the card itself. */
  gridPosition?: { column: number; row: number };
}

/** The keys that act on a focused card or control as a click does. */
const is_activation = (event: React.KeyboardEvent) =>
  event.key === "Enter" || event.key === " ";

export const MechanismCard: React.FC<MechanismCardProps> = ({
  mechanismRecord,
  onLoad,
  onRename,
  onDelete,
  onExport,
  onDuplicate,
  onUpdateTags,
  allTags,
  startInNameEdit,
  onNameEditStarted,
  compact = false,
  onShowDetails,
  isOpen = false,
  detailsShown = false,
  tabbable = true,
  gridPosition,
}) => {
  const [hovered, setHovered] = useState(false);
  // The keyboard on the card or inside it shows it as the pointer does: its hidden buttons come up, where the focus is about to go.
  const [focused, setFocused] = useState(false);
  const shown = hovered || focused;
  const tabIndex = tabbable ? 0 : -1;
  const cardRef = useRef<HTMLDivElement>(null);
  const description = mechanismRecord.metadata.description;

  // The duplicate/export/delete buttons stay collapsed to zero width until hovered — mounting them is invisible either way, so it's deferred like a thumbnail's drawing, off of the batch that mounts every other card in the gallery at once.
  const [actionsReady, setActionsReady] = useState(false);
  useEffect(() => {
    const handle = schedule_idle(() => setActionsReady(true));
    return () => cancel_idle(handle);
  }, []);

  const [editingName, setEditingName] = useState(!!startInNameEdit);
  const [nameDraft, setNameDraft] = useState(mechanismRecord.metadata.name);
  useEffect(() => {
    setNameDraft(mechanismRecord.metadata.name);
  }, [mechanismRecord.metadata.name]);
  useEffect(() => {
    if (startInNameEdit) {
      setEditingName(true);
      onNameEditStarted?.();
    }
  }, [startInNameEdit, onNameEditStarted]);

  const discardNameRef = useRef(false);
  // A name edit closed from the keyboard hands the focus back to the title it came from.
  const refocusTitleRef = useRef(false);

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
      refocusTitleRef.current = true;
      (e.target as HTMLElement).blur();
    } else if (e.key === "Enter") {
      refocusTitleRef.current = true;
      (e.target as HTMLElement).blur();
    }
  };

  const nameRef = useRef<HTMLSpanElement | null>(null);
  const setNameElement = (element: HTMLSpanElement | null) => {
    nameRef.current = element;
    if (element && refocusTitleRef.current) {
      refocusTitleRef.current = false;
      element.focus();
    }
  };
  const [nameTruncated, setNameTruncated] = useState(false);
  const hoveredRef = useRef(shown);
  hoveredRef.current = shown;
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
      ref={cardRef}
      data-mechanism-id={mechanismRecord.metadata.createdAt}
      data-gallery-card=""
      data-gallery-key={mechanismRecord.metadata.createdAt}
      data-column={gridPosition?.column}
      data-row={gridPosition?.row}
      role="button"
      aria-label={mechanismRecord.metadata.name || t("untitled")}
      tabIndex={tabIndex}
      onClick={() => onLoad(mechanismRecord)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) {
          if (!is_activation(event)) return;
          event.preventDefault();
          onLoad(mechanismRecord);
          return;
        }
        // From one of its controls, Escape comes back to the card rather than closing the gallery.
        if (event.key === "Escape") {
          event.stopPropagation();
          cardRef.current?.focus();
        }
      }}
      sx={{
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        border: "1px solid",
        borderColor: isOpen ? "primary.main" : "dividers.ground",
        borderRadius: 2,
        bgcolor: detailsShown ? "action.selected" : "background.default",
        overflow: "hidden",
        transition: "border-color 0.15s, background-color 0.15s",
        // The orange border already says which card the keyboard is on: the theme's focus outline would double it.
        "&:focus-visible": { outline: "none" },
        "&:hover, &:focus-within": {
          borderColor: "primary.main",
          bgcolor: "action.hover",
        },
      }}
    >
      <MechanismThumbnail record={mechanismRecord} hovered={shown} />

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
                title={mechanismRecord.metadata.name}
                disableHoverListener={!nameTruncated}
              >
                <Typography
                  ref={setNameElement}
                  variant="h6"
                  noWrap
                  fontWeight="600"
                  color={
                    mechanismRecord.metadata.name
                      ? "text.primary"
                      : "text.disabled"
                  }
                  marginLeft={0.5}
                  // Compact, the title is the card like the rest of it: it opens; the name is edited in the details.
                  onClick={
                    compact
                      ? undefined
                      : (e) => {
                          e.stopPropagation();
                          setEditingName(true);
                        }
                  }
                  {...(!compact && {
                    role: "button",
                    tabIndex,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (!is_activation(e)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingName(true);
                    },
                  })}
                  sx={{
                    cursor: compact ? "pointer" : "text",
                    borderRadius: 1,
                    px: 0.5,
                    mx: -0.5,
                    "&:focus-visible": {
                      outline: "none",
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  {mechanismRecord.metadata.name || t("untitled")}
                </Typography>
              </Tooltip>

              {compact ? (
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label={t("mechanism_details")}
                  tabIndex={tabIndex}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDetails?.();
                  }}
                  sx={{ flexShrink: 0, mr: -1 }}
                >
                  <MoreVert fontSize="small" />
                </IconButton>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    flexShrink: 0,
                    ml: 0.5,
                    mr: -0.5,
                    width: shown ? 96 : 0,
                    opacity: shown ? 1 : 0,
                    overflow: "hidden",
                    transition: "width 0.15s, opacity 0.15s, margin-left 0.15s",
                  }}
                >
                  {actionsReady && (
                    <>
                      <Tooltip title={t("duplicate")}>
                        <IconButton
                          size="small"
                          color="inherit"
                          aria-label={t("duplicate")}
                          tabIndex={tabIndex}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(mechanismRecord.metadata.createdAt);
                          }}
                        >
                          <AddToPhotos fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("export")}>
                        <IconButton
                          size="small"
                          color="inherit"
                          aria-label={t("export")}
                          tabIndex={tabIndex}
                          onClick={(e) => {
                            e.stopPropagation();
                            onExport(mechanismRecord);
                          }}
                        >
                          <Download fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("delete")}>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={t("delete")}
                          tabIndex={tabIndex}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(mechanismRecord.metadata.createdAt);
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>

        {!compact && description && (
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

        {!compact && (
          <TagChipsEditor
            tags={mechanismRecord.metadata.tags}
            allTags={allTags}
            onChange={(tags) =>
              onUpdateTags(mechanismRecord.metadata.createdAt, tags)
            }
            mechanismLength={mechanismRecord.mechanicalElements.length}
            modifiedAt={mechanismRecord.metadata.modifiedAt}
            tabbable={tabbable}
          />
        )}
      </Box>
    </Box>
  );
};

export default MechanismCard;
