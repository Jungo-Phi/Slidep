import React, { useRef, useState } from "react";
import { Autocomplete, Box, Chip, TextField, Tooltip } from "@mui/material";
import { AccessTime, Add, Close, Settings } from "@mui/icons-material";
import { t, tn } from "../../i18n";
import { INLINE_INPUT_SX } from "./inline-input-sx";
import { format_date } from "../../utils";

interface TagChipsEditorProps {
  tags: string[];
  /** Tags already used elsewhere in the library, suggested by the freeSolo autocomplete. */
  allTags: string[];
  onChange: (tags: string[]) => void;
  mechanismLength: number;
  modifiedAt?: number;
}

/**
 * Tags rendered as chips, editable in place: hovering a chip swaps its label for a "×" (an
 * absolutely-positioned overlay, so the chip never changes width) and a trailing "+" chip
 * turns into a freeSolo autocomplete. Shared by the gallery card and the project panel so
 * tags are edited the same way wherever they show up.
 */
export const TagChipsEditor: React.FC<TagChipsEditorProps> = ({
  tags,
  allTags,
  onChange,
  mechanismLength,
  modifiedAt,
}) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Set by Escape so the blur it triggers discards instead of committing.
  const discardRef = useRef(false);

  const commitDraft = () => {
    setAdding(false);
    if (discardRef.current) {
      discardRef.current = false;
      setDraft("");
      return;
    }
    const value = draft.trim();
    setDraft("");
    if (!value || tags.includes(value)) return;
    onChange([...tags, value]);
  };

  const removeTag = (tag: string) =>
    onChange(tags.filter((existing) => existing !== tag));

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{
        display: "flex",
        gap: 0.5,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {modifiedAt && (
        <Chip
          icon={<AccessTime sx={{ fontSize: 14 }} />}
          label={format_date(modifiedAt)}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.7rem",
            fontWeight: 600,
            bgcolor: "background.sunken",
            "& .MuiChip-icon": { ml: "2px" },
          }}
        />
      )}
      <Chip
        icon={<Settings sx={{ fontSize: 14 }} />}
        label={tn("gallery_parts", mechanismLength)}
        size="small"
        sx={{
          height: 20,
          fontSize: "0.7rem",
          fontWeight: 600,
          bgcolor: "background.sunken",
          "& .MuiChip-icon": { ml: "2px" },
        }}
      />
      {tags.map((tag) => (
        <Chip
          key={tag}
          size="small"
          variant="outlined"
          label={
            <Box sx={{ position: "relative", display: "inline-flex" }}>
              <Box
                component="span"
                className="tag-label-text"
                sx={{ transition: "opacity 0.1s" }}
              >
                {tag}
              </Box>
              <Box
                className="tag-delete-overlay"
                onClick={() => removeTag(tag)}
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.1s",
                  cursor: "pointer",
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </Box>
            </Box>
          }
          sx={{
            height: 20,
            fontSize: "0.7rem",
            "&:hover .tag-label-text": { opacity: 0 },
            "&:hover .tag-delete-overlay": { opacity: 1 },
            "&:hover": {
              backgroundColor: "action.hover",
            },
          }}
        />
      ))}
      {adding ? (
        <Autocomplete
          freeSolo
          disableClearable
          size="small"
          openOnFocus
          options={allTags.filter((tag) => !tags.includes(tag))}
          inputValue={draft}
          onInputChange={(_, value) => setDraft(value)}
          onChange={(_, value, reason) => {
            // Only a pick from the list: freeSolo typed text still commits via Enter/blur below.
            if (reason !== "selectOption" || typeof value !== "string") return;
            setAdding(false);
            setDraft("");
            if (!tags.includes(value)) onChange([...tags, value]);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              discardRef.current = true;
              (e.target as HTMLElement).blur();
            } else if (e.key === "Enter") {
              (e.target as HTMLElement).blur();
            }
          }}
          slotProps={{
            popper: { style: { width: "max-content" } },
            listbox: {
              sx: {
                "& .MuiAutocomplete-option": {
                  fontSize: "0.75rem",
                  minHeight: "auto",
                  py: 0.25,
                  px: 1,
                },
              },
            },
          }}
          sx={{ maxHeight: 20 }}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              variant="standard"
              onBlur={commitDraft}
              slotProps={{
                input: {
                  ...params.InputProps,
                  disableUnderline: true,
                  sx: { fontSize: "0.7rem" },
                },
              }}
              sx={{
                ...INLINE_INPUT_SX,
                minWidth: 75,
                maxHeight: 20,
                borderRadius: 10,
              }}
            />
          )}
        />
      ) : (
        <Tooltip disableInteractive title={t("gallery_add_tag")}>
          <Chip
            label={<Add sx={{ fontSize: 14, display: "block" }} />}
            size="small"
            variant="outlined"
            onClick={() => setAdding(true)}
            sx={{
              height: 20,
              width: 20,
              borderRadius: "10px",
              borderStyle: "dashed",
              cursor: "pointer",
              "& .MuiChip-label": {
                p: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              },
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
};

export default TagChipsEditor;
