import {
  MutableRefObject,
  RefObject,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { IDBPDatabase, openDB } from "idb";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  Mechanism,
  MechanismMetadata,
  SerializedMechanism,
  SlidepDB,
  ViewportState,
  ZERO,
} from "../../types";
import { CanvasState } from "../../types/canvas-state";
import {
  default_profile,
  seed_material_catalog,
} from "../../constants/material-profile-catalog";
import { unique_copy_name } from "../../utils/unique-name";
import {
  debounce,
  fit_viewport_to_bounds,
  ViewArea,
  FileImport,
  load_mechanism,
  load_mechanisms_from_file,
  load_mechanisms_from_filelist,
  mechanism_bounds,
  migrate_document,
  Repair,
  repair_summary,
  save_all_to_zip,
  save_to_file,
  serialize_mechanism,
} from "../../utils";
import {
  CANVAS_FIT_MARGIN,
  PREVIEW_MIN_ZOOM,
  SNACKBAR_DURATION,
} from "../../constants/interaction-specs";
import { t, tn } from "../../i18n";
import { EXAMPLE_MECHANISMS } from "../../constants/example-mechanisms";

const DB_VERSION = 4;
const DEBOUNCE_AUTOSAVE_TIME_MILLIS = 1500;

/** The mechanism library. Keyed by `metadata.createdAt`, so two records sharing one are the same entry.
 * `EXAMPLE_MECHANISMS` is seeded once, tied to the version bump rather than a separate flag: any library — empty or not — gets them added the first time it is opened past this version.
 * Deleting one afterwards is final; see `handleRestoreExamples` for the user-facing way back. */
let dbPromise: Promise<IDBPDatabase<SlidepDB>> | null = null;
const openMechanismsDB = (): Promise<IDBPDatabase<SlidepDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<SlidepDB>("SlidepDB", DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("mechanisms")) {
          const store = db.createObjectStore("mechanisms", {
            keyPath: "metadata.createdAt",
          });
          store.createIndex("by-date", "metadata.modifiedAt");
        }
        if (oldVersion < 4) {
          // A user who built these examples in the app before they shipped already owns entries under the same createdAt — `add()` on an existing key aborts the whole transaction, so only what's genuinely missing gets seeded.
          const store = transaction.objectStore("mechanisms");
          const existingIds = new Set(await store.getAllKeys());
          await Promise.all(
            EXAMPLE_MECHANISMS.filter(
              (example) => !existingIds.has(example.metadata.createdAt),
            ).map((example) => store.add(example)),
          );
        }
      },
      // The browser closed the connection on its own: the next call opens a fresh one instead of reusing a dead handle.
      terminated() {
        dbPromise = null;
      },
      // A blocked or failed open must not wedge every later call behind the same broken promise.
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
};

/** Safari drops its IndexedDB connection after a sleep or a long stay in the background, without firing `terminated`: every later transaction on it then fails with one of these. */
const isConnectionLost = (error: unknown) => {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "InvalidStateError" || name === "UnknownError";
};

/**
 * Runs `operation` against the library, reopening the connection and trying once more if the browser has dropped it.
 * The only way to reach the database: `operation` may run twice, so it must be safe to repeat — a single transaction, or idempotent writes.
 */
async function withMechanismsDB<T>(
  operation: (db: IDBPDatabase<SlidepDB>) => Promise<T>,
): Promise<T> {
  const opening = openMechanismsDB();
  const db = await opening;
  try {
    return await operation(db);
  } catch (error) {
    if (!isConnectionLost(error)) throw error;
    console.warn("IndexedDB connection lost, reopening:", error);
    // Another call may already have reopened it: only the dead connection is discarded.
    if (dbPromise === opening) dbPromise = null;
    db.close();
    return operation(await openMechanismsDB());
  }
}

/** Every stored mechanism, raised to the current file format. The only way to read the library. */
const read_all_records = async (db: IDBPDatabase<SlidepDB>) =>
  (await db.getAll("mechanisms")).map(migrate_document);

/**
 * The framing "Recentrer" aims for: the mechanism's content fit to `area`, clear of the ElementPalette overlay on its left edge.
 * The area is the canvas itself, or what of it a phone's sheet leaves in sight.
 */
export const fit_to_content = (
  mechanism: Mechanism,
  area: ViewArea,
): ViewportState => {
  const fitted = fit_viewport_to_bounds(
    mechanism_bounds(
      mechanism.mechanicalElements,
      mechanism.constraintElements,
    ),
    area.width,
    area.height,
    { ...CANVAS_FIT_MARGIN, defaultZoom: PREVIEW_MIN_ZOOM },
  );
  return { ...fitted, pan: fitted.pan };
};

export type SaveStatus = "idle" | "saved" | "saving" | "error";

export type UseMechanismLibraryArgs = {
  mechanismRef: MutableRefObject<Mechanism>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  setMechanism: (mechanism: Mechanism) => void;
  setCanvasState: (state: CanvasState) => void;
  setSnackbar: (snackbar: {
    open: boolean;
    message: string;
    duration?: number;
    severity?: "warning";
  }) => void;
  resetSimulationState: () => void;
};

/**
 * The mechanism library: the IndexedDB-backed store the gallery reads and writes, plus the autosave that keeps the currently-edited mechanism in it.
 */
export function useMechanismLibrary({
  mechanismRef,
  canvasRef,
  setMechanism,
  setCanvasState,
  setSnackbar,
  resetSimulationState,
}: UseMechanismLibraryArgs) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [savedMechanisms, setSavedMechanisms] = useState<SerializedMechanism[]>(
    [],
  );
  const galleryOpenRef = useRef(galleryOpen);
  useEffect(() => {
    galleryOpenRef.current = galleryOpen;
  }, [galleryOpen]);

  // Whether any edit pending in the current debounce window should bump `modifiedAt` — a preference-only change (e.g. `lastSimulationMode`) passes `false`, but it must not suppress the stamp for a real edit coalesced in the same window, so this accumulates with OR instead of just keeping the latest call's flag.
  const pendingTouchRef = useRef(false);

  const performSaveToDB = useCallback(async () => {
    const touch = pendingTouchRef.current;
    pendingTouchRef.current = false;
    // A silent save leaves the status pill alone: nothing the user did warrants telling them their work is being written.
    // A failure still shows, whatever caused the save — a store that cannot be written to concerns every later edit too.
    if (touch) setSaveStatus("saving");
    try {
      const mechanismToSave = serialize_mechanism({
        ...mechanismRef.current,
        metadata: touch
          ? { ...mechanismRef.current.metadata, modifiedAt: Date.now() }
          : mechanismRef.current.metadata,
      });
      await withMechanismsDB((db) => db.put("mechanisms", mechanismToSave));
      if (touch) setSaveStatus("saved");

      if (galleryOpenRef.current) {
        // The full library is a lot of cards to mount at once: deprioritized so it doesn't block the rest of the app while it renders.
        const records = await withMechanismsDB(read_all_records);
        startTransition(() => setSavedMechanisms(records));
      }
    } catch (error) {
      console.error("Autosave failed:", error);
      setSaveStatus("error");
    }
  }, [mechanismRef]);

  const debouncedSave = useRef(
    debounce(() => {
      performSaveToDB();
    }, DEBOUNCE_AUTOSAVE_TIME_MILLIS),
  ).current;

  /** Marks an edit as pending save. The one thing every mutation of `mechanism` must call.
   * `touch` tells whether it counts as modifying the mechanism: `false` persists the change without stamping `modifiedAt` and without showing the save status, for a setting the user carries along rather than an edit they made. */
  const markDirty = useCallback(
    (touch = true) => {
      pendingTouchRef.current = pendingTouchRef.current || touch;
      if (touch) setSaveStatus("saving");
      debouncedSave();
    },
    [debouncedSave],
  );

  /** App starts: only greet with the gallery when there is something to load. */
  useEffect(() => {
    withMechanismsDB(read_all_records)
      .then((records) => {
        if (records.length === 0) return;
        // A large library is a lot of cards to mount at once: deprioritized so the app stays responsive while they render, instead of a single blocking frame.
        startTransition(() => {
          setSavedMechanisms(records);
          setGalleryOpen(true);
        });
      })
      // Storage refused from the start (private browsing, blocked site data): the editor still works, and the first autosave reports the failure.
      .catch((error) => console.error("Mechanism library unavailable:", error));
  }, []);

  // Opens on whatever `savedMechanisms` already holds — however stale — rather than waiting on a fresh read, so the click feels as instant as any other menu action.
  // The read still happens, just after: a card lands on outdated data only when something changed the record while the gallery was closed, and even then only until this resolves and replaces the list a moment later.
  const handleOpenGallery = useCallback(() => {
    setGalleryOpen(true);
    withMechanismsDB(read_all_records)
      .then((records) => startTransition(() => setSavedMechanisms(records)))
      .catch((error) => console.error("Mechanism library unreadable:", error));
  }, []);

  const closeGallery = useCallback(() => setGalleryOpen(false), []);

  const handleLoadFromGallery = useCallback(
    (mechanismRecord: SerializedMechanism) => {
      const { mechanism: loaded, repairs } = load_mechanism(mechanismRecord);
      const currentCanvas = canvasRef.current;
      // A repaired viewport landed on the raw default, which frames nothing in particular — fit it to the mechanism instead, like "Recentrer".
      setMechanism(
        currentCanvas && repairs.some((r) => r.code === "VIEWPORT_RESET")
          ? { ...loaded, viewport: fit_to_content(loaded, currentCanvas) }
          : loaded,
      );
      setGalleryOpen(false);
      setCanvasState({ type: "Selecting" });
      resetSimulationState();
      setSnackbar(
        repairs.length > 0
          ? {
              open: true,
              message: repair_summary(repairs),
              duration: SNACKBAR_DURATION.REPORT,
              severity: "warning",
            }
          : { open: true, message: t("mechanism_loaded") },
      );
    },
    [
      canvasRef,
      setMechanism,
      setCanvasState,
      resetSimulationState,
      setSnackbar,
    ],
  );

  // Renaming a record that happens to be the one currently open must also update the live mechanism — otherwise the next autosave would silently overwrite it.
  // The currently open mechanism is kept in sync with its stored record, so the next autosave doesn't overwrite the edit.
  const handleUpdateMetadataFromGallery = useCallback(
    async (
      createdAtId: number,
      patch: Partial<
        Pick<MechanismMetadata, "name" | "description" | "author" | "tags">
      >,
    ) => {
      const updated = await withMechanismsDB(async (db) => {
        const record = await db.get("mechanisms", createdAtId);
        if (!record) return undefined;
        const patched = { ...record, metadata: { ...record.metadata, ...patch } };
        await db.put("mechanisms", patched);
        return patched;
      });
      if (!updated) return;

      setSavedMechanisms((prev) =>
        prev.map((r) => (r.metadata.createdAt === createdAtId ? updated : r)),
      );

      if (mechanismRef.current.metadata.createdAt === createdAtId) {
        setMechanism({
          ...mechanismRef.current,
          metadata: { ...mechanismRef.current.metadata, ...patch },
        });
      }
    },
    [mechanismRef, setMechanism],
  );

  const handleRenameFromGallery = useCallback(
    (createdAtId: number, name: string) =>
      handleUpdateMetadataFromGallery(createdAtId, { name }),
    [handleUpdateMetadataFromGallery],
  );

  const handleUpdateTagsFromGallery = useCallback(
    (createdAtId: number, tags: string[]) =>
      handleUpdateMetadataFromGallery(createdAtId, { tags }),
    [handleUpdateMetadataFromGallery],
  );

  const handleDeleteFromGallery = useCallback(
    async (createdAtId: number) => {
      if (!window.confirm(t("mechanism_delete_confirm"))) return;

      await withMechanismsDB((db) => db.delete("mechanisms", createdAtId));

      setSavedMechanisms((prev) =>
        prev.filter((r) => r.metadata.createdAt !== createdAtId),
      );
      setSnackbar({ open: true, message: t("mechanism_deleted") });
    },
    [setSnackbar],
  );

  const handleDuplicateFromGallery = useCallback(
    async (createdAtId: number) => {
      // One transaction, so a retry after a lost connection cannot store the copy twice.
      const duplicated = await withMechanismsDB(async (db) => {
        const tx = db.transaction("mechanisms", "readwrite");
        const record = await tx.store.get(createdAtId);
        if (!record) return undefined;

        const existing = await tx.store.getAll();
        const takenIds = new Set(existing.map((r) => r.metadata.createdAt));
        const takenNames = new Set(existing.map((r) => r.metadata.name));

        let id = Date.now();
        while (takenIds.has(id)) id++;

        const base = record.metadata.name || t("untitled");
        const copy: SerializedMechanism = {
          ...record,
          metadata: {
            ...record.metadata,
            createdAt: id,
            name: unique_copy_name(base, takenNames),
            modifiedAt: Date.now(),
          },
        };
        await tx.store.put(copy);
        await tx.done;
        return copy;
      });
      if (!duplicated) return undefined;

      setSavedMechanisms((prev) => [...prev, duplicated]);
      return duplicated;
    },
    [],
  );

  const handleNewFromGallery = useCallback(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;

    const empty: Mechanism = {
      metadata: {
        ...DEFAULT_METADATA,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
      viewport: { scale: 1, pan: ZERO },
      simulation: DEFAULT_SIMULATION,
      mechanicalElements: [],
      constraintElements: [],
      loads: [],
      materials: seed_material_catalog(),
      profiles: [default_profile()],
      history: [],
      future: [],
    };
    setMechanism({ ...empty, viewport: fit_to_content(empty, currentCanvas) });
    setGalleryOpen(false);
    setCanvasState({ type: "Selecting" });
    resetSimulationState();
    setSaveStatus("idle");
  }, [canvasRef, setMechanism, setCanvasState, resetSimulationState]);

  // An import never overwrites a stored mechanism: it enters the library as a copy, next to the original.
  const storeImportedRecords = useCallback(
    async (records: SerializedMechanism[]) => {
      // Importing is an entry, so records are repaired before anything is written: a known-broken entry must not land in the library when the sound version is already in hand.
      const repairs: Repair[] = [];
      const sound = records.map((record) => {
        const loaded = load_mechanism(record);
        repairs.push(...loaded.repairs);
        return serialize_mechanism(loaded.mechanism);
      });

      // One transaction keeps an archive importing fully or not at all, and lets a retry after a lost connection start over without leaving half the archive behind as extra copies.
      const stored = await withMechanismsDB(async (db) => {
        const tx = db.transaction("mechanisms", "readwrite");
        const existing = await tx.store.getAll();
        const takenIds = new Set(existing.map((r) => r.metadata.createdAt));
        const takenNames = new Set(existing.map((r) => r.metadata.name));

        const entries = sound.map((record) => {
          const metadata = { ...record.metadata, modifiedAt: Date.now() };

          if (takenIds.has(metadata.createdAt)) {
            let id = Date.now();
            while (takenIds.has(id)) id++;
            metadata.createdAt = id;

            const base = record.metadata.name || t("untitled");
            let name = t("copy_of", { name: base });
            for (let n = 2; takenNames.has(name); n++)
              name = t("copy_of_n", { name: base, n });
            metadata.name = name;
          }

          takenIds.add(metadata.createdAt);
          takenNames.add(metadata.name);
          return { ...record, metadata };
        });

        await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
        return entries;
      });
      return { stored, repairs };
    },
    [],
  );

  const importFiles = useCallback(
    async ({ records, isArchive }: FileImport) => {
      const { stored, repairs } = await storeImportedRecords(records);

      if (isArchive) {
        setSavedMechanisms((prev) => [...prev, ...stored]);
        setSnackbar({
          open: true,
          message:
            tn("mechanisms_imported", stored.length) +
            (repairs.length > 0 ? ` — ${repair_summary(repairs)}` : ""),
          ...(repairs.length > 0 && {
            duration: SNACKBAR_DURATION.REPORT,
            severity: "warning",
          }),
        });
        return;
      }

      // A repaired viewport needs to be fitted it to the mechanism.
      const loaded = load_mechanism(stored[0]).mechanism;
      const currentCanvas = canvasRef.current;
      setMechanism(
        currentCanvas && repairs.some((r) => r.code === "VIEWPORT_RESET")
          ? { ...loaded, viewport: fit_to_content(loaded, currentCanvas) }
          : loaded,
      );
      setCanvasState({ type: "Selecting" });
      resetSimulationState();
      setGalleryOpen(false);
      setSaveStatus("saved");
      setSnackbar({
        open: true,
        message:
          repairs.length > 0
            ? repair_summary(repairs)
            : t("mechanism_imported"),
        ...(repairs.length > 0 && {
          duration: SNACKBAR_DURATION.REPORT,
          severity: "warning",
        }),
      });
    },
    [
      storeImportedRecords,
      canvasRef,
      setMechanism,
      setCanvasState,
      resetSimulationState,
      setSnackbar,
    ],
  );

  /** Imports what `reading` yields, telling a file that cannot be parsed apart from a library that cannot be written to. */
  const importFrom = useCallback(
    (reading: Promise<FileImport>) => {
      const warn = (message: string) =>
        setSnackbar({ open: true, message, severity: "warning" });
      reading.then(
        (parsed) =>
          importFiles(parsed).catch((error) => {
            console.error("Import could not be stored:", error);
            warn(t("import_storage_failed"));
          }),
        (error) => {
          console.error("Import could not be read:", error);
          warn(t("file_unreadable"));
        },
      );
    },
    [importFiles, setSnackbar],
  );

  const handleMenuButtonUpload = useCallback(
    () => importFrom(load_mechanisms_from_file()),
    [importFrom],
  );

  const handleFilesDropped = useCallback(
    (files: FileList | File[]) =>
      importFrom(load_mechanisms_from_filelist(files)),
    [importFrom],
  );

  // Export from the gallery, whose records are already serialized.
  const handleExportRecord = useCallback((record: SerializedMechanism) => {
    save_to_file(record, `${record.metadata.name || t("untitled")}.slidep`);
  }, []);

  const handleExportAllRecords = useCallback(() => {
    save_all_to_zip(
      savedMechanisms,
      t("archive_filename"),
      t("default_filename"),
    );
    setSnackbar({
      open: true,
      message: tn("mechanisms_exported", savedMechanisms.length),
    });
  }, [savedMechanisms, setSnackbar]);

  // Puts back whichever examples are missing (deleted), by their fixed createdAt — one still present, even edited by the user, is left alone rather than reset to its pristine state.
  const handleRestoreExamples = useCallback(async () => {
    const { missing, records } = await withMechanismsDB(async (db) => {
      const existingIds = new Set(await db.getAllKeys("mechanisms"));
      const absent = EXAMPLE_MECHANISMS.filter(
        (example) => !existingIds.has(example.metadata.createdAt),
      );
      for (const example of absent) await db.put("mechanisms", example);
      return { missing: absent, records: await read_all_records(db) };
    });
    if (missing.length === 0) return;

    startTransition(() => setSavedMechanisms(records));
    setSnackbar({
      open: true,
      message: tn("examples_restored", missing.length),
    });
  }, [setSnackbar]);

  return {
    saveStatus,
    setSaveStatus,
    galleryOpen,
    savedMechanisms,
    markDirty,
    handleOpenGallery,
    closeGallery,
    handleLoadFromGallery,
    handleRenameFromGallery,
    handleUpdateTagsFromGallery,
    handleUpdateMetadataFromGallery,
    handleDeleteFromGallery,
    handleDuplicateFromGallery,
    handleNewFromGallery,
    handleMenuButtonUpload,
    handleFilesDropped,
    handleExportRecord,
    handleExportAllRecords,
    handleRestoreExamples,
  };
}
