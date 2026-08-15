import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Divider,
  Button,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  AddCircleOutline,
  Archive,
  Close,
  FileOpen,
  InfoOutlined,
  Search,
} from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import MechanismCard from "./MechanismCard";
import { INLINE_INPUT_SX } from "./inline-input-sx";

interface MechanismsGalleryProps {
  open: boolean;
  onClose: () => void;
  mechanismRecords: SerializedMechanism[];
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onRename: (createdAtId: number, name: string) => void;
  onDelete: (createdAtId: number) => void;
  onDuplicate: (
    createdAtId: number,
  ) => Promise<SerializedMechanism | undefined>;
  onUpdateTags: (createdAtId: number, tags: string[]) => void;
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
  onDuplicate,
  onUpdateTags,
  onNew,
  onImport,
  onExport,
  onExportAll,
}) => {
  const [search, setSearch] = useState("");
  const searching = search.trim().length > 0;

  // Set right after a duplication so the new card opens straight into name editing;
  // cleared as soon as that card consumes it, so it never re-triggers on a later render.
  const [justDuplicatedId, setJustDuplicatedId] = useState<number | null>(
    null,
  );
  const handleDuplicate = async (createdAtId: number) => {
    const duplicated = await onDuplicate(createdAtId);
    if (duplicated) setJustDuplicatedId(duplicated.metadata.createdAt);
    return duplicated;
  };

  // Valeurs déjà utilisées quelque part dans la bibliothèque. Les trois modes de simulation
  // sont toujours suggérés en plus, comme point de départ le plus courant pour trier.
  const usedTags = useMemo(() => {
    const set = new Set<string>();
    for (const record of mechanismRecords)
      for (const tag of record.metadata.tags) set.add(tag);
    return set;
  }, [mechanismRecords]);
  const allTags = [
    ...new Set([
      t("mode_static"),
      t("mode_kinematic"),
      t("mode_dynamic"),
      ...usedTags,
    ]),
  ].sort();

  // Trier par date de modification décroissante
  const sortedMechanismRecords = [...mechanismRecords]
    .sort((a, b) => b.metadata.modifiedAt - a.metadata.modifiedAt)
    .filter((record) => {
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return (
        record.metadata.name.toLowerCase().includes(needle) ||
        record.metadata.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });

  // Nombre de colonnes réellement affiché au palier courant, pour pouvoir répartir
  // les cartes nous-mêmes (voir plus bas) plutôt que de laisser `columns` CSS le
  // faire colonne par colonne, ce qui casserait l'ordre de lecture.
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.up("sm"));
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const isLg = useMediaQuery(theme.breakpoints.up("lg"));
  const isXl = useMediaQuery(theme.breakpoints.up("xl"));
  const manyMechanisms = mechanismRecords.length >= 16;
  const columnCount = isLg
    ? manyMechanisms && isXl
      ? 5
      : 4
    : isMd
      ? 3
      : isSm
        ? 2
        : 1;

  // Répartition en "round-robin" (carte i -> colonne i % columnCount) : ça lit comme
  // du texte (ligne par ligne, gauche à droite) tout en gardant l'empilement compact
  // par colonne d'une hauteur de carte variable, contrairement à `columns` CSS qui
  // remplit une colonne entière avant de passer à la suivante.
  const cardColumns = useMemo(() => {
    const columns: SerializedMechanism[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    sortedMechanismRecords.forEach((record, i) => {
      // La carte "Nouveau Mécanisme" occupe l'index 0, décalant les mécanismes d'un cran.
      const index = searching ? i : i + 1;
      columns[index % columnCount].push(record);
    });
    return columns;
  }, [sortedMechanismRecords, columnCount, searching]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
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
          pt: 1.5,
          pb: 1,
          pr: 2,
          bgcolor: "background.default",
        }}
      >
        <Typography fontSize={"large"} fontWeight={500} sx={{ flexShrink: 0 }}>
          {t("gallery_title")}
        </Typography>

        <TextField
          size="small"
          variant="outlined"
          placeholder={t("gallery_search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              disableUnderline: true,
              startAdornment: (
                <Search
                  fontSize="small"
                  sx={{ mr: 1, ml: -0.5, color: "text.secondary" }}
                />
              ),
            },
          }}
          sx={{ ...INLINE_INPUT_SX, px: -0.5, flexGrow: 1, maxWidth: 360 }}
        />

        {/* L'import et l'export global portent sur toute la bibliothèque ;
            l'export d'*un* mécanisme vit sur sa carte. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Tooltip disableInteractive title={t("gallery_storage_notice")}>
            <InfoOutlined
              sx={{ fontSize: 20, color: "text.secondary", ml: -1, mr: 4 }}
            />
          </Tooltip>
          <Tooltip disableInteractive title={t("gallery_import_tooltip")}>
            <Button
              size="small"
              color="inherit"
              startIcon={<FileOpen fontSize="small" />}
              onClick={onImport}
              sx={{ textTransform: "none", fontSize: "0.8rem", px: 1.5 }}
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
                sx={{ textTransform: "none", fontSize: "0.8rem", px: 1.5 }}
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
        {searching && sortedMechanismRecords.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ textAlign: "center", mt: 4 }}
          >
            {t("gallery_no_results")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            {cardColumns.map((column, columnIndex) => (
              <Box
                key={columnIndex}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* Carte "Nouveau Mécanisme" : masquée pendant une recherche, elle ne fait
                    pas partie des résultats. Elle occupe toujours la première colonne. */}
                {!searching && columnIndex === 0 && (
                  <Box
                    onClick={onNew}
                    sx={{
                      minHeight: 335,
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
                )}

                {column.map((mechanismRecord) => (
                  <MechanismCard
                    key={mechanismRecord.metadata.createdAt}
                    mechanismRecord={mechanismRecord}
                    onLoad={onLoad}
                    onRename={onRename}
                    onDelete={onDelete}
                    onExport={onExport}
                    onDuplicate={handleDuplicate}
                    onUpdateTags={onUpdateTags}
                    allTags={allTags}
                    startInNameEdit={
                      mechanismRecord.metadata.createdAt === justDuplicatedId
                    }
                    onNameEditStarted={() => setJustDuplicatedId(null)}
                  />
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MechanismsGallery;
