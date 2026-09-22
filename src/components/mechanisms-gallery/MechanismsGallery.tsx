import React, { useMemo, useRef, useState } from "react";
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
  Restore,
  Search,
} from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { t } from "../../i18n";
import { EXAMPLE_MECHANISMS } from "../../constants/example-mechanisms";
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
  onRestoreExamples: () => void;
}

// Height of the "New mechanism" card when the library is empty, with no existing card to copy the height from.
const NEW_CARD_FALLBACK_HEIGHT = 300;

/** Lowercased and stripped of diacritics, so the search treats "moteur" and "môteur" alike. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

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
  onRestoreExamples,
}) => {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searching = search.trim().length > 0;

  // Cleared on every fresh opening rather than on close, which covers every way the dialog closes (button, backdrop, Escape, loading a mechanism) from a single spot.
  // Adjusted during render rather than in an effect, so the dialog's first paint already shows the cleared search instead of a filtered list that then jumps to the full one.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSearch("");
  }

  const presentIds = new Set(
    mechanismRecords.map((record) => record.metadata.createdAt),
  );
  const allExamplesPresent = EXAMPLE_MECHANISMS.every((example) =>
    presentIds.has(example.metadata.createdAt),
  );

  // Set right after a duplication so the new card opens straight into name editing; cleared as soon as that card consumes it, so it never re-triggers on a later render.
  const [justDuplicatedId, setJustDuplicatedId] = useState<number | null>(null);
  const handleDuplicate = async (createdAtId: number) => {
    const duplicated = await onDuplicate(createdAtId);
    if (duplicated) setJustDuplicatedId(duplicated.metadata.createdAt);
    return duplicated;
  };

  // Values already used somewhere in the library.
  // The three simulation modes are always suggested in addition, as the most common starting point for sorting.
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

  // Sort by descending modification date.
  const sortedMechanismRecords = [...mechanismRecords]
    .sort((a, b) => b.metadata.modifiedAt - a.metadata.modifiedAt)
    .filter((record) => {
      const needle = fold(search.trim());
      if (!needle) return true;
      return (
        fold(record.metadata.name).includes(needle) ||
        record.metadata.tags.some((tag) => fold(tag).includes(needle))
      );
    });

  // Number of columns actually shown at the current breakpoint, so cards can be distributed ourselves (see below) instead of letting CSS `columns` do it column by column, which would break reading order.
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

  // Round-robin distribution (card i -> column i % columnCount): reads like text (row by row, left to right) while keeping the stack compact for a variable card height, unlike CSS `columns`, which fills one whole column before the next.
  const cardColumns = useMemo(() => {
    const columns: SerializedMechanism[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    sortedMechanismRecords.forEach((record, i) => {
      // The "New mechanism" card occupies index 0, shifting the mechanisms by one slot.
      const index = searching ? i : i + 1;
      columns[index % columnCount].push(record);
    });
    return columns;
  }, [sortedMechanismRecords, columnCount, searching]);

  // Height of the "New mechanism" card: that of the smallest card in the first row (the first element of each column, measured for real since a card's height depends on its content — description, tag count).
  const [firstRowHeights, setFirstRowHeights] = useState<
    Record<number, number>
  >({});
  const firstRowObservers = useRef<Map<number, ResizeObserver>>(new Map());
  const firstRowRefCallbacks = useRef<
    Map<number, (el: HTMLDivElement | null) => void>
  >(new Map());
  const getFirstRowRef = (columnIndex: number) => {
    let callback = firstRowRefCallbacks.current.get(columnIndex);
    if (!callback) {
      callback = (el) => {
        firstRowObservers.current.get(columnIndex)?.disconnect();
        firstRowObservers.current.delete(columnIndex);
        if (!el) {
          setFirstRowHeights((prev) => {
            if (!(columnIndex in prev)) return prev;
            const next = { ...prev };
            delete next[columnIndex];
            return next;
          });
          return;
        }
        const observer = new ResizeObserver(([entry]) => {
          const height = entry.contentRect.height;
          setFirstRowHeights((prev) =>
            prev[columnIndex] === height
              ? prev
              : { ...prev, [columnIndex]: height },
          );
        });
        observer.observe(el);
        firstRowObservers.current.set(columnIndex, observer);
      };
      firstRowRefCallbacks.current.set(columnIndex, callback);
    }
    return callback;
  };
  const measuredFirstRowHeights = Object.values(firstRowHeights);
  const newCardHeight =
    measuredFirstRowHeights.length > 0
      ? Math.min(...measuredFirstRowHeights)
      : NEW_CARD_FALLBACK_HEIGHT;

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
          {t("library")}
        </Typography>

        <TextField
          size="small"
          variant="outlined"
          placeholder={t("search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputRef={searchInputRef}
          slotProps={{
            input: {
              startAdornment: (
                <Search
                  fontSize="small"
                  sx={{ mr: 1, ml: -0.5, color: "text.secondary" }}
                />
              ),
              endAdornment: search.length > 0 && (
                <Tooltip title={t("clear_search")}>
                  <IconButton
                    size="small"
                    aria-label={t("clear_search")}
                    onClick={() => {
                      setSearch("");
                      searchInputRef.current?.focus();
                    }}
                    sx={{
                      borderRadius: 1,
                      mr: -1.3,
                      p: 0.3,
                      color: "text.secondary",
                    }}
                  >
                    <Close sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
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
          <Tooltip title={t("storage_notice")}>
            <InfoOutlined
              sx={{ fontSize: 20, color: "text.secondary", ml: -1, mr: 4 }}
            />
          </Tooltip>
          <Tooltip title={t("import_tooltip")}>
            <Button
              size="small"
              color="inherit"
              startIcon={<FileOpen fontSize="small" />}
              onClick={onImport}
              sx={{ textTransform: "none", fontSize: "0.8rem", px: 1.5 }}
            >
              {t("import")}
            </Button>
          </Tooltip>
          <Tooltip
            title={t(
              mechanismRecords.length === 0
                ? "export_all_empty"
                : "export_all_tooltip",
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
                {t("export_all")}
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={t(
              allExamplesPresent
                ? "restore_examples_none_missing"
                : "restore_examples_tooltip",
            )}
          >
            <span>
              <Button
                size="small"
                color="inherit"
                disabled={allExamplesPresent}
                startIcon={<Restore fontSize="small" />}
                onClick={onRestoreExamples}
                sx={{ textTransform: "none", fontSize: "0.8rem", px: 1.5 }}
              >
                {t("restore_examples")}
              </Button>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ m: 0.5 }} />
          <Tooltip title={t("close")}>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {searching && sortedMechanismRecords.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography color="text.secondary">{t("no_results")}</Typography>
          </Box>
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
                      height: newCardHeight,
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
                      {t("new_mechanism")}
                    </Typography>
                  </Box>
                )}

                {column.map((mechanismRecord, rowIndex) => {
                  const card = (
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
                  );
                  // The first element of each column (first row) is measured to size the "New mechanism" card on the smallest one.
                  if (rowIndex !== 0) return card;
                  return (
                    <Box
                      key={mechanismRecord.metadata.createdAt}
                      ref={getFirstRowRef(columnIndex)}
                    >
                      {card}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MechanismsGallery;
