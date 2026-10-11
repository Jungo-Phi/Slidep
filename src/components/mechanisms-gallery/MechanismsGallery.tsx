import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAmbient } from "../common/use-ambient";
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
import { MechanismMetadata, SerializedMechanism } from "../../types";
import MechanismDetailsPanel from "./MechanismDetailsPanel";
import { t } from "../../i18n";
import { EXAMPLE_MECHANISMS } from "../../constants/example-mechanisms";
import MechanismCard from "./MechanismCard";
import { INLINE_INPUT_SX } from "./inline-input-sx";
import { usePhoneLayout } from "../phone/use-phone-layout";

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
  onUpdateMetadata: (
    createdAtId: number,
    metadata: Pick<MechanismMetadata, "name" | "description" | "author" | "tags">,
  ) => void;
  /** The mechanism open in the app, marked among the others. */
  currentId: number;
}

// Height of the "New mechanism" card when the library is empty, with no existing card to copy the height from.
const NEW_CARD_FALLBACK_HEIGHT = 300;

/** Lowercased and stripped of diacritics, so the search treats "moteur" and "môteur" alike. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** One of the library's own actions: labelled, or its icon alone when `compact`, where the width runs short. */
const LibraryAction: React.FC<{
  compact: boolean;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ compact, icon, label, tooltip, disabled = false, onClick }) => (
  <Tooltip title={tooltip}>
    <span>
      {compact ? (
        <IconButton
          size="small"
          color="inherit"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </IconButton>
      ) : (
        <Button
          size="small"
          color="inherit"
          disabled={disabled}
          startIcon={icon}
          onClick={onClick}
          sx={{ textTransform: "none", fontSize: "0.8rem", px: 1.5 }}
        >
          {label}
        </Button>
      )}
    </span>
  </Tooltip>
);

const MechanismsGalleryView: React.FC<MechanismsGalleryProps> = ({
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
  onUpdateMetadata,
  currentId,
}) => {
  useAmbient();
  const [search, setSearch] = useState("");
  // The typed value keeps the field itself responsive; filtering, sorting and the resulting card shuffle across columns run on this one instead, a beat behind, so a fast typist never waits on a render of the whole grid between keystrokes.
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searching = deferredSearch.trim().length > 0;

  // Cleared on every fresh opening rather than on close, which covers every way the dialog closes (button, backdrop, Escape, loading a mechanism) from a single spot.
  // Adjusted during render rather than in an effect, so the dialog's first paint already shows the cleared search instead of a filtered list that then jumps to the full one.
  const [wasOpen, setWasOpen] = useState(open);
  // The mechanism whose details are raised, on a phone.
  const [detailsId, setDetailsId] = useState<number | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setDetailsId(null);
    }
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
    if (duplicated) {
      setJustDuplicatedId(duplicated.metadata.createdAt);
      // Raised on the copy, where it is renamed: a compact card has no name to edit in place.
      if (detailsId !== null) setDetailsId(duplicated.metadata.createdAt);
    }
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

  const phone = usePhoneLayout();
  // A phone's alone, and only for a mechanism still in the library: deleting one takes its details with it.
  const detailsRecord = phone
    ? mechanismRecords.find((r) => r.metadata.createdAt === detailsId)
    : undefined;
  // The card whose details are up stays in sight above them, though the panel has just taken the bottom of the gallery.
  useEffect(() => {
    if (detailsId === null) return;
    contentRef.current
      ?.querySelector(`[data-mechanism-id="${detailsId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [detailsId]);

  // Sort by descending modification date — on a phone, the mechanism open in the app first, the one whose details are its project.
  const sortedMechanismRecords = [...mechanismRecords]
    .sort(
      (a, b) =>
        (phone
          ? Number(b.metadata.createdAt === currentId) -
            Number(a.metadata.createdAt === currentId)
          : 0) || b.metadata.modifiedAt - a.metadata.modifiedAt,
    )
    .filter((record) => {
      const needle = fold(deferredSearch.trim());
      if (!needle) return true;
      return (
        fold(record.metadata.name).includes(needle) ||
        record.metadata.tags.some((tag) => fold(tag).includes(needle))
      );
    });

  // Number of columns actually shown at the current breakpoint, so cards can be distributed ourselves (see below) instead of letting CSS `columns` do it column by column, which would break reading order.
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const isLg = useMediaQuery(theme.breakpoints.up("lg"));
  const isXl = useMediaQuery(theme.breakpoints.up("xl"));
  const manyMechanisms = mechanismRecords.length >= 16;
  // Never fewer than two: one card a row reads as a list, and a phone has the width for two thumbnails.
  const columnCount = isLg ? (manyMechanisms && isXl ? 5 : 4) : isMd ? 3 : 2;

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
      // Focus once the enter transition is done, after the modal's focus trap has taken its own initial focus.
      // The scroll position is reset here too: MUI keeps the Paper mounted through a quick close/reopen (the exit transition hasn't finished unmounting it yet), so the grid can otherwise reappear mid-scroll.
      slotProps={{
        transition: {
          onEntered: () => {
            searchInputRef.current?.focus();
            if (contentRef.current) contentRef.current.scrollTop = 0;
          },
        },
      }}
      // A phone has no room to spare around a dialog.
      fullScreen={phone}
      PaperProps={{
        sx: phone
          ? undefined
          : {
              height: "85vh",
              maxWidth: 1320,
              borderRadius: 2,
            },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          // On a phone the search takes a line of its own, under the title and the library's actions.
          flexWrap: phone ? "wrap" : "nowrap",
          justifyContent: "space-between",
          alignItems: "center",
          rowGap: 1,
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
                  sx={{ ml: -0.5, mr: 1, my: 1, color: "text.secondary" }}
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
          sx={{
            ...INLINE_INPUT_SX,
            px: -0.5,
            flexGrow: 1,
            ...(phone
              ? { order: 1, flexBasis: "100%", maxWidth: "none" }
              : { maxWidth: 360 }),
          }}
        />

        {/* Import and export-all act on the whole library; exporting *one* mechanism lives on its card. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0,
          }}
        >
          {/* A tap shows it at once, and long enough to read: a finger has no hover to wait on. */}
          <Tooltip
            title={t("storage_notice")}
            enterTouchDelay={0}
            leaveTouchDelay={6000}
          >
            <InfoOutlined
              sx={{
                fontSize: 20,
                color: "text.secondary",
                ml: -1,
                mr: phone ? 0.5 : 4,
              }}
            />
          </Tooltip>
          <LibraryAction
            compact={phone}
            icon={<FileOpen fontSize="small" />}
            label={t("import")}
            tooltip={t("import_tooltip")}
            onClick={onImport}
          />
          <LibraryAction
            compact={phone}
            icon={<Archive fontSize="small" />}
            label={t("export_all")}
            tooltip={t(
              mechanismRecords.length === 0
                ? "export_all_empty"
                : "export_all_tooltip",
            )}
            disabled={mechanismRecords.length === 0}
            onClick={onExportAll}
          />
          <LibraryAction
            compact={phone}
            icon={<Restore fontSize="small" />}
            label={t("restore_examples")}
            tooltip={t(
              allExamplesPresent
                ? "restore_examples_none_missing"
                : "restore_examples_tooltip",
            )}
            disabled={allExamplesPresent}
            onClick={onRestoreExamples}
          />
          <Divider orientation="vertical" flexItem sx={{ m: 0.5 }} />
          <Tooltip title={t("close")}>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }} ref={contentRef}>
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
                {/* The "New mechanism" card: hidden during a search, since it is not one of the results.
                    It always takes the first column. */}
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
                        !phone &&
                        mechanismRecord.metadata.createdAt === justDuplicatedId
                      }
                      onNameEditStarted={() => setJustDuplicatedId(null)}
                      compact={phone}
                      onShowDetails={() =>
                        setDetailsId(mechanismRecord.metadata.createdAt)
                      }
                      isOpen={
                        phone && mechanismRecord.metadata.createdAt === currentId
                      }
                      detailsShown={
                        !!detailsRecord &&
                        mechanismRecord.metadata.createdAt === detailsId
                      }
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
      {detailsRecord && (
        <MechanismDetailsPanel
          record={detailsRecord}
          onClose={() => setDetailsId(null)}
          onLoad={onLoad}
          onUpdateMetadata={(id, metadata) =>
            onUpdateMetadata(id, {
              name: metadata.name,
              description: metadata.description,
              author: metadata.author,
              tags: metadata.tags,
            })
          }
          onDuplicate={(id) => void handleDuplicate(id)}
          onExport={onExport}
          onDelete={onDelete}
          allTags={allTags}
        />
      )}
    </Dialog>
  );
};

export const MechanismsGallery = React.memo(MechanismsGalleryView);

export default MechanismsGallery;
