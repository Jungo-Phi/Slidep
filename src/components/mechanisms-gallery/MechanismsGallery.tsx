import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Divider,
  Button,
} from "@mui/material";
import {
  AddCircleOutline,
  Archive,
  Close,
  FileOpen,
  InfoOutlined,
} from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import MechanismCard from "./MechanismCard";

interface MechanismsGalleryProps {
  open: boolean;
  onClose: () => void;
  mechanismRecords: SerializedMechanism[];
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onRename: (createdAtId: number, name: string) => void;
  onDelete: (createdAtId: number) => void;
  onNew: () => void;
  onImport: () => void;
  onExport: (mechanismRecord: SerializedMechanism) => void;
  onExportAll: () => void;
}

export const MechanismsGallery: React.FC<MechanismsGalleryProps> = ({
  open,
  onClose,
  mechanismRecords,
  onLoad,
  onRename,
  onDelete,
  onNew,
  onImport,
  onExport,
  onExportAll,
}) => {
  // Trier par date de modification décroissante
  const sortedMechanismRecords = [...mechanismRecords].sort(
    (a, b) => b.metadata.modifiedAt - a.metadata.modifiedAt,
  );

  // Au-delà de 12 mécanismes, un écran large peut afficher plus de 4 colonnes.
  const gridSize =
    mechanismRecords.length >= 12
      ? { xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }
      : { xs: 12, sm: 6, md: 4, lg: 3 };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      // Ni "lg" (1200px) ni "xl" (1536px) : une valeur propre entre les deux,
      // MUI n'a pas de palier pour ça.
      maxWidth={false}
      PaperProps={{
        sx: {
          height: "85vh",
          maxWidth: 1320,
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
          pr: 2,
          bgcolor: "background.default",
        }}
      >
        <Typography fontSize={"large"} fontWeight={500} sx={{ flexShrink: 0 }}>
          {t("gallery_title")}
        </Typography>

        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 0.5,
            minWidth: 0,
            mx: 2,
            color: "text.secondary",
          }}
        >
          <InfoOutlined sx={{ fontSize: 15, flexShrink: 0 }} />
          <Typography variant="caption">
            {t("gallery_storage_notice")}
          </Typography>
        </Box>
        {/* L'import et l'export global portent sur toute la bibliothèque ;
            l'export d'*un* mécanisme vit sur sa carte. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          <Tooltip disableInteractive title={t("gallery_import_tooltip")}>
            <Button
              size="small"
              color="inherit"
              startIcon={<FileOpen fontSize="small" />}
              onClick={onImport}
              sx={{ textTransform: "none", fontSize: "0.8rem" }}
            >
              {t("gallery_import")}
            </Button>
          </Tooltip>
          <Tooltip
            disableInteractive
            title={t(
              mechanismRecords.length === 0
                ? "gallery_export_all_empty"
                : "gallery_export_all_tooltip",
            )}
          >
            <span>
              <Button
                size="small"
                color="inherit"
                disabled={mechanismRecords.length === 0}
                startIcon={<Archive fontSize="small" />}
                onClick={onExportAll}
                sx={{ textTransform: "none", fontSize: "0.8rem" }}
              >
                {t("gallery_export_all")}
              </Button>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ m: 0.5 }} />
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          {/* 1. Carte "Nouveau Mécanisme" (En première position) */}
          <Grid size={gridSize}>
            <Box
              onClick={onNew}
              sx={{
                height: "100%",
                minHeight: 180,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "2px dashed",
                borderColor: "dividers.ground",
                borderRadius: 2,
                bgcolor: "background.sunken",
                transition: "border-color 0.15s, background-color 0.15s",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                },
              }}
            >
              <AddCircleOutline
                sx={{ fontSize: 48, color: "text.secondary", mb: 1 }}
              />
              <Typography variant="h6" color="text.secondary">
                {t("gallery_new")}
              </Typography>
            </Box>
          </Grid>

          {/* 2. Liste des mécanismes existants */}
          {sortedMechanismRecords.map((mechanismRecord) => (
            <MechanismCard
              key={mechanismRecord.metadata.createdAt}
              mechanismRecord={mechanismRecord}
              gridSize={gridSize}
              onLoad={onLoad}
              onRename={onRename}
              onDelete={onDelete}
              onExport={onExport}
            />
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default MechanismsGallery;
