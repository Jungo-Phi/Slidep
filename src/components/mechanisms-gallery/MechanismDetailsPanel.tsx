import React from "react";
import { Box, Button, IconButton } from "@mui/material";
import {
  AddToPhotos,
  Close,
  Delete,
  Download,
  OpenInNew,
} from "@mui/icons-material";
import { MechanismMetadata, SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import MechanismThumbnail from "./MechanismThumbnail";
import MechanismMetadataFields from "./MechanismMetadataFields";

/** Side of the panel's thumbnail (px): enough to recognise the mechanism, small enough to leave the form in view. */
const THUMBNAIL_SIDE = 96;

interface MechanismDetailsPanelProps {
  record: SerializedMechanism;
  onClose: () => void;
  onLoad: (record: SerializedMechanism) => void;
  onUpdateMetadata: (createdAtId: number, metadata: MechanismMetadata) => void;
  onDuplicate: (createdAtId: number) => void;
  onExport: (record: SerializedMechanism) => void;
  onDelete: (createdAtId: number) => void;
  allTags: string[];
}

/**
 * What the phone's gallery keeps off its cards — description, author, dates, tags, element count — for one mechanism, editable in place, with what can be done to it.
 * Laid at the foot of the gallery rather than over it: the cards stay in view and within reach above.
 * For the mechanism open in the app, this is where its project is edited.
 */
export const MechanismDetailsPanel: React.FC<MechanismDetailsPanelProps> = ({
  record,
  onClose,
  onLoad,
  onUpdateMetadata,
  onDuplicate,
  onExport,
  onDelete,
  allTags,
}) => (
  <Box
    sx={{
      flex: "0 0 auto",
      maxHeight: "45%",
      overflowY: "auto",
      borderTop: 1,
      borderColor: "dividers.ground",
      boxShadow: (theme) => `0 -4px 12px ${theme.palette.action.hover}`,
      bgcolor: "background.paper",
    }}
  >
    <Box sx={{ display: "flex", gap: 0.5, p: 2, pb: 1.5 }}>
      <Box
        sx={{
          width: THUMBNAIL_SIDE,
          flexShrink: 0,
          borderRadius: 1.5,
          overflow: "hidden",
          border: 1,
          borderColor: "dividers.ground",
        }}
      >
        <MechanismThumbnail record={record} hovered={false} />
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          mt: 1,
          gap: 0.5,
          "& .MuiButton-root": { textTransform: "none" },
        }}
      >
        <Button
          sx={{mx: -0.5}}
          size="small"
          color="inherit"
          startIcon={<AddToPhotos />}
          onClick={() => onDuplicate(record.metadata.createdAt)}
        >
          {t("duplicate")}
        </Button>
        <Button
          sx={{mx: -0.5}}
          size="small"
          color="inherit"
          startIcon={<Download />}
          onClick={() => onExport(record)}
        >
          {t("export")}
        </Button>
        <Button
          sx={{mx: -0.5}}
          size="small"
          color="error"
          startIcon={<Delete />}
          onClick={() => onDelete(record.metadata.createdAt)}
        >
          {t("delete")}
        </Button>
        <Button
          sx={{mx: -0.5}}
          size="small"
          variant="contained"
          startIcon={<OpenInNew />}
          onClick={() => onLoad(record)}
        >
          {t("open_mechanism")}
        </Button>
      </Box>
      <IconButton
        aria-label={t("close")}
        onClick={onClose}
        sx={{ alignSelf: "flex-start", m: -1 }}
      >
        <Close />
      </IconButton>
    </Box>
    <Box sx={{ px: 2, pb: 2 }}>
      <MechanismMetadataFields
        metadata={record.metadata}
        onChange={(metadata) =>
          onUpdateMetadata(record.metadata.createdAt, metadata)
        }
        allTags={allTags}
        mechanismLength={record.mechanicalElements.length}
      />
    </Box>
  </Box>
);

export default MechanismDetailsPanel;
