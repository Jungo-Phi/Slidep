import React, { useEffect, useRef, useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import { MechanismMetadata } from "../../types";
import { format_date } from "../../utils";
import { t } from "../../i18n";
import TagChipsEditor from "./TagChipsEditor";

interface MechanismMetadataFieldsProps {
  metadata: MechanismMetadata;
  /** Called with the whole metadata once an edit is validated — leaving a field, Enter, or a tag change. */
  onChange: (metadata: MechanismMetadata) => void;
  /** Every tag already used in the mechanism library, suggested by the tag autocomplete. */
  allTags: string[];
  /** How many elements the mechanism holds, shown beside its tags. */
  mechanismLength: number;
}

/**
 * A mechanism's own description — title, description, author, dates, tags — editable in place.
 * The one form for it wherever it is edited: the project tab, the gallery's details, the phone's project sheet.
 */
export const MechanismMetadataFields: React.FC<MechanismMetadataFieldsProps> = ({
  metadata,
  onChange,
  allTags,
  mechanismLength,
}) => {
  const [draft, setDraft] = useState<MechanismMetadata>(metadata);
  useEffect(() => setDraft(metadata), [metadata]);

  const handleChange = (field: keyof MechanismMetadata, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  // Set by Escape so the blur it triggers discards instead of committing.
  const discardRef = useRef(false);

  // Leaving a field validates it.
  // Metadata does not go through the history, so Escape is the only way back from an edit and has to restore rather than merely leave.
  const commit = () => {
    if (discardRef.current) {
      discardRef.current = false;
      setDraft(metadata);
      return;
    }
    if (
      draft.name === metadata.name &&
      draft.description === metadata.description &&
      draft.author === metadata.author
    )
      return;
    onChange({ ...draft });
  };

  /** `enterCommits` is off for the description, where Enter is a line break. */
  const handleKeyDown = (e: React.KeyboardEvent, enterCommits: boolean) => {
    if (e.key === "Escape") {
      discardRef.current = true;
      (e.target as HTMLElement).blur();
    } else if (e.key === "Enter" && enterCommits) {
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField
        fullWidth
        label={t("project_title")}
        value={draft.name}
        onChange={(e) => handleChange("name", e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, true)}
        onBlur={commit}
        size="small"
      />

      <TextField
        fullWidth
        label={t("project_description")}
        multiline
        rows={4.6}
        value={draft.description}
        onChange={(e) => handleChange("description", e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, false)}
        onBlur={commit}
        size="small"
        sx={{
          "& .MuiOutlinedInput-root": {
            paddingRight: 0,
          },
          "& .MuiInputBase-input": {
            fontSize: "0.86rem",
            paddingRight: "10px",
          },
        }}
      />

      <TextField
        fullWidth
        label={t("project_author")}
        value={draft.author}
        onChange={(e) => handleChange("author", e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, true)}
        onBlur={commit}
        size="small"
      />

      <Box sx={{ display: "flex", gap: 5 }}>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {t("project_created")}
          </Typography>
          <Typography variant="body2">{format_date(draft.createdAt)}</Typography>
        </Box>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {t("project_modified")}
          </Typography>
          <Typography variant="body2">{format_date(draft.modifiedAt)}</Typography>
        </Box>
      </Box>

      <Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          {t("project_tags")}
        </Typography>
        <TagChipsEditor
          tags={draft.tags}
          allTags={allTags}
          onChange={(tags) => onChange({ ...draft, tags })}
          mechanismLength={mechanismLength}
        />
      </Box>
    </Box>
  );
};

export default MechanismMetadataFields;
