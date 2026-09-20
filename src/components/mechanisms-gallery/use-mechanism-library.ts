import {
  MutableRefObject,
  RefObject,
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
const openMechanismsDB = () =>
  openDB<SlidepDB>("SlidepDB", DB_VERSION, {
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
  });

/** Every stored mechanism, raised to the current file format. The only way to read the library. */
const read_all_records = async (db: IDBPDatabase<SlidepDB>) =>
  (await db.getAll("mechanisms")).map(migrate_document);

/** The framing "Recentrer" aims for: the mechanism's content fit to the canvas, clear of the ElementPalette overlay on its left edge. */
export const fit_to_content = (
  mechanism: Mechanism,
  canvas: HTMLCanvasElement,
): ViewportState => {
  const fitted = fit_viewport_to_bounds(
    mechanism_bounds(
      mechanism.mechanicalElements,
      mechanism.constraintElements,
    ),
    canvas.width,
    canvas.height,
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
      const db = await openMechanismsDB();
      const mechanismToSave = {
        ...mechanismRef.current,
        metadata: touch
          ? { ...mechanismRef.current.metadata, modifiedAt: Date.now() }
          : mechanismRef.current.metadata,
      };
      await db.put("mechanisms", serialize_mechanism(mechanismToSave));
      if (touch) setSaveStatus("saved");

      if (galleryOpenRef.current) {
        setSavedMechanisms(await read_all_records(db));
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
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
    (async () => {
      const db = await openMechanismsDB();
      const records = await read_all_records(db);
      if (records.length === 0) return;
      setSavedMechanisms(records);
      setGalleryOpen(true);
    })();
  }, []);

  const handleOpenGallery = useCallback(async () => {
    const db = await openMechanismsDB();
    setSavedMechanisms(await read_all_records(db));
    setGalleryOpen(true);
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
  const handleRenameFromGallery = useCallback(
    async (createdAtId: number, name: string) => {
      const db = await openMechanismsDB();
      const record = await db.get("mechanisms", createdAtId);
      if (!record) return;

      const updated = { ...record, metadata: { ...record.metadata, name } };
      await db.put("mechanisms", updated);

      setSavedMechanisms((prev) =>
        prev.map((r) => (r.metadata.createdAt === createdAtId ? updated : r)),
      );

      if (mechanismRef.current.metadata.createdAt === createdAtId) {
        setMechanism({
          ...mechanismRef.current,
          metadata: { ...mechanismRef.current.metadata, name },
        });
      }
    },
    [mechanismRef, setMechanism],
  );

  // Same rationale as handleRenameFromGallery: the currently open mechanism must stay in sync so the next autosave doesn't overwrite the tag change.
  const handleUpdateTagsFromGallery = useCallback(
    async (createdAtId: number, tags: string[]) => {
      const db = await openMechanismsDB();
      const record = await db.get("mechanisms", createdAtId);
      if (!record) return;

      const updated = {
        ...record,
        metadata: { ...record.metadata, tags },
      };
      await db.put("mechanisms", updated);

      setSavedMechanisms((prev) =>
        prev.map((r) => (r.metadata.createdAt === createdAtId ? updated : r)),
      );

      if (mechanismRef.current.metadata.createdAt === createdAtId) {
        setMechanism({
          ...mechanismRef.current,
          metadata: { ...mechanismRef.current.metadata, tags },
        });
      }
    },
    [mechanismRef, setMechanism],
  );

  const handleDeleteFromGallery = useCallback(
    async (createdAtId: number) => {
      if (!window.confirm(t("mechanism_delete_confirm"))) return;

      const db = await openDB<SlidepDB>("SlidepDB", DB_VERSION);
      await db.delete("mechanisms", createdAtId);

      setSavedMechanisms((prev) =>
        prev.filter((r) => r.metadata.createdAt !== createdAtId),
      );
      setSnackbar({ open: true, message: t("mechanism_deleted") });
    },
    [setSnackbar],
  );

  const handleDuplicateFromGallery = useCallback(
    async (createdAtId: number) => {
      const db = await openMechanismsDB();
      const record = await db.get("mechanisms", createdAtId);
      if (!record) return undefined;

      const existing = await db.getAll("mechanisms");
      const takenIds = new Set(existing.map((r) => r.metadata.createdAt));
      const takenNames = new Set(existing.map((r) => r.metadata.name));

      let id = Date.now();
      while (takenIds.has(id)) id++;

      const base = record.metadata.name || t("untitled");
      const name = unique_copy_name(base, takenNames);

      const now = Date.now();
      const duplicated: SerializedMechanism = {
        ...record,
        metadata: {
          ...record.metadata,
          createdAt: id,
          name,
          modifiedAt: now,
        },
      };
      await db.put("mechanisms", duplicated);

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
      const db = await openMechanismsDB();
      const existing = await db.getAll("mechanisms");
      const takenIds = new Set(existing.map((r) => r.metadata.createdAt));
      const takenNames = new Set(existing.map((r) => r.metadata.name));

      // Importing is an entry, so records are repaired before anything is written: a known-broken entry must not land in the library when the sound version is already in hand.
      // Reading them all up front also keeps an archive importing fully or not at all.
      const repairs: Repair[] = [];
      const sound = records.map((record) => {
        const loaded = load_mechanism(record);
        repairs.push(...loaded.repairs);
        return serialize_mechanism(loaded.mechanism);
      });

      const stored: SerializedMechanism[] = [];
      for (const record of sound) {
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

        const entry = { ...record, metadata };
        await db.put("mechanisms", entry);
        stored.push(entry);
      }
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

  const handleMenuButtonUpload = useCallback(() => {
    load_mechanisms_from_file()
      .then(importFiles)
      .catch(() =>
        setSnackbar({
          open: true,
          message: t("file_unreadable"),
          severity: "warning",
        }),
      );
  }, [importFiles, setSnackbar]);

  const handleFilesDropped = useCallback(
    (files: FileList | File[]) => {
      load_mechanisms_from_filelist(files)
        .then(importFiles)
        .catch(() =>
          setSnackbar({
            open: true,
            message: t("file_unreadable"),
            severity: "warning",
          }),
        );
    },
    [importFiles, setSnackbar],
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
    const db = await openMechanismsDB();
    const existingIds = new Set(await db.getAllKeys("mechanisms"));
    const missing = EXAMPLE_MECHANISMS.filter(
      (example) => !existingIds.has(example.metadata.createdAt),
    );
    if (missing.length === 0) return;

    for (const example of missing) await db.put("mechanisms", example);

    setSavedMechanisms(await read_all_records(db));
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
