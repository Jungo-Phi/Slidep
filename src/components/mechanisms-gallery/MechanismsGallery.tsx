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
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
  MoreVert,
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
import { OverlayScrollArea } from "../properties-panel/components/OverlayScrollArea";
import {
  CardSpot,
  GALLERY_KEYS,
  GalleryKey,
  card_neighbour,
} from "./gallery-keyboard";

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
    metadata: Pick<
      MechanismMetadata,
      "name" | "description" | "author" | "tags"
    >,
  ) => void;
  /** The mechanism open in the app, marked among the others. */
  currentId: number;
  /** On a phone, what the app's top bar leaves to the gallery's header — settings, language, about. */
  phoneActions?: React.ReactNode;
}

/** Below this window width (px), the library's actions drop their label for their icon alone, the label moving into the tooltip: the search keeps its room. */
const ICON_ONLY_ACTIONS_MAX_WIDTH = 1200;

// Height of the "New mechanism" card when the library is empty, with no existing card to copy the height from.
const NEW_CARD_FALLBACK_HEIGHT = 300;

/** The roving key of the "New mechanism" card; a mechanism's is its `createdAt`. */
const NEW_CARD_KEY = "new";

/** The cards of the grid as the arrows see them, read off the cards on screen. */
function card_spots(
  grid: HTMLElement,
): (CardSpot & { element: HTMLElement })[] {
  return Array.from(
    grid.querySelectorAll<HTMLElement>("[data-gallery-card]"),
  ).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      element,
      column: Number(element.dataset.column),
      row: Number(element.dataset.row),
      middle: (rect.top + rect.bottom) / 2,
    };
  });
}

/** Lowercased and stripped of diacritics, so the search treats "moteur" and "môteur" alike. */
const fold = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** One of the library's own actions, in the header. */
const LibraryAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  /** Shows the icon alone, the label heading the tooltip instead. */
  iconOnly?: boolean;
}> = ({
  icon,
  label,
  tooltip,
  disabled = false,
  onClick,
  iconOnly = false,
}) => (
  <Tooltip
    title={
      iconOnly ? (
        <>
          <Box component="span" sx={{ display: "block", fontWeight: 700 }}>
            {label}
          </Box>
          {tooltip}
        </>
      ) : (
        tooltip
      )
    }
  >
    <span>
      {iconOnly ? (
        <IconButton
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
  phoneActions,
}) => {
  useAmbient();
  // The library's own actions, which a phone keeps behind ⋮.
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const pickMore = (action: () => void) => () => {
    setMoreAnchor(null);
    action();
  };
  const [search, setSearch] = useState("");
  // The typed value keeps the field itself responsive; filtering, sorting and the resulting card shuffle across columns run on this one instead, a beat behind, so a fast typist never waits on a render of the whole grid between keystrokes.
  const deferredSearch = useDeferredValue(search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const searching = deferredSearch.trim().length > 0;

  // Cleared on every fresh opening rather than on close, which covers every way the dialog closes (button, backdrop, Escape, loading a mechanism) from a single spot.
  // Adjusted during render rather than in an effect, so the dialog's first paint already shows the cleared search instead of a filtered list that then jumps to the full one.
  const [wasOpen, setWasOpen] = useState(open);
  // The mechanism whose details are raised, on a phone.
  const [detailsId, setDetailsId] = useState<number | null>(null);
  /**
   * The card Tab stops on in the grid, the one the arrows last reached: the grid is one stop for Tab, the arrows moving between its cards.
   * Back on "New mechanism" whenever the focus leaves the grid, so that entering it always starts there.
   */
  const [rovingKey, setRovingKey] = useState(NEW_CARD_KEY);
  const gridRef = useRef<HTMLDivElement>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setDetailsId(null);
      setRovingKey(NEW_CARD_KEY);
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
  const iconOnlyActions = useMediaQuery(
    `(max-width:${ICON_ONLY_ACTIONS_MAX_WIDTH}px)`,
  );
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

  // A key no card holds any more — a search hides "New mechanism", a card is deleted — falls back to the first card shown.
  const shownKeys = [
    ...(searching ? [] : [NEW_CARD_KEY]),
    ...sortedMechanismRecords.map((record) =>
      String(record.metadata.createdAt),
    ),
  ];
  const tabKey = shownKeys.includes(rovingKey) ? rovingKey : shownKeys[0];

  // A card deleted from the keyboard took the focus with it: it goes on to the next card in reading order, the previous one for the last.
  const refocusRef = useRef<{ deleted: number; next: string | null } | null>(
    null,
  );
  const handleDelete = (createdAtId: number) => {
    const key = String(createdAtId);
    const keyAt = (index: number) => shownKeys[index] ?? null;
    const index = shownKeys.indexOf(key);
    const card = contentRef.current?.querySelector(
      `[data-mechanism-id="${createdAtId}"]`,
    );
    refocusRef.current = card?.contains(document.activeElement)
      ? { deleted: createdAtId, next: keyAt(index + 1) ?? keyAt(index - 1) }
      : null;
    onDelete(createdAtId);
  };
  useEffect(() => {
    const pending = refocusRef.current;
    if (!pending || !gridRef.current) return;
    // Not deleted yet, or declined: the card is still there, and so is the focus.
    if (presentIds.has(pending.deleted)) return;
    refocusRef.current = null;
    gridRef.current
      .querySelector<HTMLElement>(`[data-gallery-key="${pending.next}"]`)
      ?.focus({ preventScroll: true });
    // `presentIds` is rebuilt from `mechanismRecords` at every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanismRecords]);

  const focusGrid = () =>
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-gallery-key="${tabKey}"]`)
      ?.focus({ preventScroll: true });

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!GALLERY_KEYS.has(event.key)) return;
    const target = event.target as HTMLElement;
    // A field keeps its arrows for its own text.
    if (target.closest("input, textarea")) return;
    const card = target.closest<HTMLElement>("[data-gallery-card]");
    if (!card || !gridRef.current) return;
    const spots = card_spots(gridRef.current);
    const from = spots.find((spot) => spot.element === card);
    if (!from) return;
    event.preventDefault();
    const to = card_neighbour(spots, from, event.key as GalleryKey);
    // The browser's own scroll to a focused element is a jump, and once done leaves the smooth one nothing to do: the grid's own scroll is the only one.
    if (to) to.element.focus({ preventScroll: true });
    // Above the first row stands the search, which leads down into the grid.
    else if (event.key === "ArrowUp" && target === card)
      searchInputRef.current?.focus();
  };

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
          pr: 2.5,
          bgcolor: "background.default",
        }}
      >
        <Typography
          fontSize={"large"}
          fontWeight={500}
          noWrap
          // On a phone the title is what gives way when the header runs short, never the buttons beside it: from no width of its own, it can only take what they leave, never push them onto a line of their own.
          sx={phone ? { flex: "1 1 0", minWidth: 0 } : { flexShrink: 0 }}
        >
          {t("library")}
        </Typography>

        <TextField
          size="small"
          variant="outlined"
          placeholder={t("search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            focusGrid();
          }}
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
              : { maxWidth: 360, minWidth: 180, mx: 2 }),
          }}
        />

        {/* Import and export-all act on the whole library; exporting *one* mechanism lives on its card. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            // A phone's icon buttons carry their own padding: they need no gap on top of it.
            gap: phone ? 0 : 1,
            mr: -1,
            flexShrink: 0,
          }}
        >
          {phone ? (
            <>
              {phoneActions}
              <IconButton
                size="medium"
                color="inherit"
                aria-label={t("more_actions")}
                onClick={(e) => setMoreAnchor(e.currentTarget)}
              >
                <MoreVert />
              </IconButton>
              <Menu
                anchorEl={moreAnchor}
                open={!!moreAnchor}
                onClose={() => setMoreAnchor(null)}
              >
                <MenuItem onClick={pickMore(onImport)}>
                  <ListItemIcon>
                    <FileOpen fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t("import")}</ListItemText>
                </MenuItem>
                <MenuItem
                  disabled={mechanismRecords.length === 0}
                  onClick={pickMore(onExportAll)}
                >
                  <ListItemIcon>
                    <Archive fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t("export_all")}</ListItemText>
                </MenuItem>
                <MenuItem
                  disabled={allExamplesPresent}
                  onClick={pickMore(onRestoreExamples)}
                >
                  <ListItemIcon>
                    <Restore fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t("restore_examples")}</ListItemText>
                </MenuItem>
                <Divider />
                {/* Under the export, which it is the reason for. */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="p"
                  sx={{ px: 2, py: 0.5, maxWidth: 280 }}
                >
                  {t("storage_notice")}
                </Typography>
              </Menu>
            </>
          ) : (
            <>
              {/* Focusable, for its tooltip to be read from the keyboard too. */}
              <Tooltip title={t("storage_notice")}>
                <Box
                  component="span"
                  tabIndex={0}
                  aria-label={t("storage_notice")}
                  sx={{
                    display: "inline-flex",
                    p: 0.5,
                    mr: 2.5,
                    borderRadius: 1,
                    color: "text.secondary",
                    "&:focus-visible": {
                      outline: "none",
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  <InfoOutlined sx={{ fontSize: 20 }} />
                </Box>
              </Tooltip>
              <LibraryAction
                iconOnly={iconOnlyActions}
                icon={<FileOpen fontSize="medium" />}
                label={t("import")}
                tooltip={t("import_tooltip")}
                onClick={onImport}
              />
              <LibraryAction
                iconOnly={iconOnlyActions}
                icon={<Archive fontSize="medium" />}
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
                iconOnly={iconOnlyActions}
                icon={<Restore fontSize="medium" />}
                label={t("restore_examples")}
                tooltip={t(
                  allExamplesPresent
                    ? "restore_examples_none_missing"
                    : "restore_examples_tooltip",
                )}
                disabled={allExamplesPresent}
                onClick={onRestoreExamples}
              />
            </>
          )}
          <Divider orientation="vertical" flexItem sx={{ m: 0.5 }} />
          <Tooltip title={t("close")}>
            <IconButton onClick={onClose} size="medium">
              <Close />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      {/* The same floating scrollbar as the panels', which fades while the cards are only being looked at. */}
      <DialogContent
        dividers
        sx={{
          p: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <OverlayScrollArea sx={{ flex: 1 }} scrollerRef={contentRef}>
          <Box sx={{ p: 2 }}>
            {searching && sortedMechanismRecords.length === 0 ? (
              <Box
                sx={{
                  py: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography color="text.secondary">
                  {t("no_results")}
                </Typography>
              </Box>
            ) : (
              <Box
                ref={gridRef}
                onKeyDown={handleGridKeyDown}
                onFocus={(event) => {
                  const card = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>("[data-gallery-key]");
                  if (card?.dataset.galleryKey)
                    setRovingKey(card.dataset.galleryKey);
                  // The whole card comes into view, not just the control that took the focus.
                  card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }}
                onBlur={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setRovingKey(NEW_CARD_KEY);
                }}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  alignItems: "flex-start",
                  // A card scrolled into view keeps the grid's margin from the edge.
                  "& [data-gallery-card]": { scrollMarginBlock: 16 },
                }}
              >
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
                        role="button"
                        tabIndex={tabKey === NEW_CARD_KEY ? 0 : -1}
                        data-gallery-card=""
                        data-gallery-key={NEW_CARD_KEY}
                        data-column={0}
                        data-row={0}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ")
                            return;
                          event.preventDefault();
                          onNew();
                        }}
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
                          transition:
                            "border-color 0.15s, background-color 0.15s",
                          // The orange border says where the keyboard is, as on the other cards.
                          "&:focus-visible": { outline: "none" },
                          "&:hover, &:focus-visible": {
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
                      const key = String(mechanismRecord.metadata.createdAt);
                      // Under "New mechanism", the first column's cards stand a rank lower.
                      const row =
                        !searching && columnIndex === 0
                          ? rowIndex + 1
                          : rowIndex;
                      const card = (
                        <MechanismCard
                          key={mechanismRecord.metadata.createdAt}
                          mechanismRecord={mechanismRecord}
                          tabbable={key === tabKey}
                          gridPosition={{ column: columnIndex, row }}
                          onLoad={onLoad}
                          onRename={onRename}
                          onDelete={handleDelete}
                          onExport={onExport}
                          onDuplicate={handleDuplicate}
                          onUpdateTags={onUpdateTags}
                          allTags={allTags}
                          startInNameEdit={
                            !phone &&
                            mechanismRecord.metadata.createdAt ===
                              justDuplicatedId
                          }
                          onNameEditStarted={() => setJustDuplicatedId(null)}
                          compact={phone}
                          onShowDetails={() =>
                            setDetailsId(mechanismRecord.metadata.createdAt)
                          }
                          isOpen={
                            phone &&
                            mechanismRecord.metadata.createdAt === currentId
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
          </Box>
        </OverlayScrollArea>
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
