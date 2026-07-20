import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  Action,
  ConstraintElement,
  LoadElement,
  MechanicalElement,
  Mechanism,
  Point2,
  SerializedMechanism,
  ViewportState,
} from "../types";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedLoadElement,
  SerializedMechanicalElement,
  SerializedPoint2,
  SerializedViewportState,
} from "../types/serialized";
import { CURRENT_FORMAT_VERSION, migrate_document } from "./migrate-mechanism";

// --- Point2 fields carried by actions
//
// `JSON.stringify` flattens a Point2 into a plain `{x, y}`, so every Point2
// field of every action has to be revived by hand on the way back in. The table
// below is derived from the `Action` union so that `tsc` — not a code review —
// catches a forgotten field: adding a Point2 to an action makes the entry
// incomplete, and adding a new action that carries one makes the whole key
// missing. Both are compile errors.
//
// Known limit: only *top-level* Point2 fields are detected. No action nests a
// Point2 inside an object or an array today; if one ever does, it needs its own
// handling in `deserialize_action` (see `UpdatePositionsToValidState`).

type ActionOfType<T extends Action["type"]> = Extract<Action, { type: T }>;

/** Keys of `A` whose value is a `Point2` (optionality stripped). */
type PointKeysOf<A> = {
  [K in keyof A]-?: NonNullable<A[K]> extends Point2 ? K : never;
}[keyof A];

/** Action types carrying at least one top-level `Point2`. */
type ActionTypeWithPoints = {
  [T in Action["type"]]: [PointKeysOf<ActionOfType<T>>] extends [never]
    ? never
    : T;
}[Action["type"]];

const ACTION_POINT_FIELDS: {
  [T in ActionTypeWithPoints]: Record<PointKeysOf<ActionOfType<T>>, true>;
} = {
  MoveNode: { newPosition: true, oldPosition: true },
  MoveEdgeStart: { newPosition: true, oldPosition: true },
  MoveEdgeEnd: { newPosition: true, oldPosition: true },
  MoveEdgeBody: { newPosition: true, oldPosition: true },
  MoveConstraint: { newPosition: true, oldPosition: true },
  MoveElements: { newPos: true, delta: true },
  ChangeGearRadius: { target: true },
  ChangeForce: { newVector: true, oldVector: true },
  ChangeDistributedForce: { newDirection: true, oldDirection: true },
};

// --- Helper functions

function sp(p: Point2): SerializedPoint2 {
  return { x: p.x, y: p.y };
}

function dp(s: SerializedPoint2): Point2 {
  return new Point2(s.x, s.y);
}

function serialize_points_map(
  m: Map<string, Point2>,
): [string, SerializedPoint2][] {
  return [...m.entries()].map(([k, v]) => [k, sp(v)]);
}

function serialize_numbers_map(m: Map<string, number>): [string, number][] {
  return [...m.entries()];
}

function deserialize_points_map(
  entries: [string, SerializedPoint2][],
): Map<string, Point2> {
  return new Map(entries.map(([k, v]) => [k, dp(v)]));
}

function deserialize_numbers_map(
  entries: [string, number][],
): Map<string, number> {
  return new Map(entries);
}

function serialize_action(a: Action): SerializedAction {
  switch (a.type) {
    case "CreateElement":
    case "DeleteElement":
      const isMechanical = [
        "pivot",
        "slider",
        "slidep",
        "join",
        "mass",
        "gear",
        "beam",
        "spring",
        "damper",
        "belt",
      ].includes(a.element.type);

      return {
        type: a.type,
        element: isMechanical
          ? serialize_mechanical_element(a.element as MechanicalElement)
          : serialize_constraint_element(a.element as ConstraintElement),
      } as SerializedAction;
    case "UpdatePositionsToValidState":
      return {
        type: a.type,
        masterActionType: a.masterActionType,
        newNodes: {
          positions: serialize_points_map(a.newNodes.positions),
          radii: serialize_numbers_map(a.newNodes.radii),
          posMasses: serialize_numbers_map(a.newNodes.posMasses),
          radMasses: serialize_numbers_map(a.newNodes.radMasses),
        },
        oldNodes: {
          positions: serialize_points_map(a.oldNodes.positions),
          radii: serialize_numbers_map(a.oldNodes.radii),
          posMasses: serialize_numbers_map(a.oldNodes.posMasses),
          radMasses: serialize_numbers_map(a.oldNodes.radMasses),
        },
      };
    default:
      return JSON.parse(JSON.stringify(a));
  }
}

function deserialize_action(s: SerializedAction): Action {
  switch (s.type) {
    case "CreateElement":
    case "DeleteElement": {
      const isMechanical = (
        [
          "pivot",
          "slider",
          "slidep",
          "join",
          "mass",
          "gear",
          "beam",
          "spring",
          "damper",
          "belt",
        ] as string[]
      ).includes(s.element.type);

      return {
        type: s.type,
        element: isMechanical
          ? deserialize_mechanical_element(
              s.element as SerializedMechanicalElement,
            )
          : deserialize_constraint_element(
              s.element as SerializedConstraintElement,
            ),
      } as Action;
    }
    case "UpdatePositionsToValidState":
      return {
        type: s.type,
        masterActionType: s.masterActionType,
        newNodes: {
          positions: deserialize_points_map(s.newNodes.positions),
          radii: deserialize_numbers_map(s.newNodes.radii),
          posMasses: deserialize_numbers_map(s.newNodes.posMasses),
          radMasses: deserialize_numbers_map(s.newNodes.radMasses),
        },
        oldNodes: {
          positions: deserialize_points_map(s.oldNodes.positions),
          radii: deserialize_numbers_map(s.oldNodes.radii),
          posMasses: deserialize_numbers_map(s.oldNodes.posMasses),
          radMasses: deserialize_numbers_map(s.oldNodes.radMasses),
        },
      };
    default: {
      const result = { ...s } as Record<string, unknown>;
      // Only actions carrying a Point2 have an entry, hence the lookup guard.
      const pointFields: Record<string, true> | undefined =
        ACTION_POINT_FIELDS[s.type as ActionTypeWithPoints];
      for (const key in pointFields) {
        const value = result[key];
        if (isSerializedPoint(value)) result[key] = dp(value);
      }
      return result as unknown as Action;
    }
  }
}

function serialize_mechanical_element(
  e: MechanicalElement,
): SerializedMechanicalElement {
  return JSON.parse(JSON.stringify(e));
}

function serialize_constraint_element(
  e: ConstraintElement,
): SerializedConstraintElement {
  return JSON.parse(JSON.stringify(e));
}

function serialize_load_element(e: LoadElement): SerializedLoadElement {
  return JSON.parse(JSON.stringify(e));
}

function deserialize_load_element(s: SerializedLoadElement): LoadElement {
  return revive_points(
    s as unknown as Record<string, unknown>,
  ) as unknown as LoadElement;
}

function serialize_viewport(e: ViewportState): SerializedViewportState {
  return JSON.parse(JSON.stringify(e));
}

function isSerializedPoint(p: unknown): p is SerializedPoint2 {
  return (
    typeof p === "object" &&
    p !== null &&
    "x" in p &&
    "y" in p &&
    typeof (p as any).x === "number" &&
    typeof (p as any).y === "number"
  );
}

function revive_points(s: Record<string, unknown>): Record<string, unknown> {
  const result = { ...s };
  for (const key in result) {
    const value = result[key];
    if (isSerializedPoint(value)) {
      result[key] = new Point2(value.x, value.y);
    }
  }
  return result;
}

function deserialize_mechanical_element(
  serializedMechanicalElement: SerializedMechanicalElement,
): MechanicalElement {
  const el = revive_points(
    serializedMechanicalElement as unknown as Record<string, unknown>,
  ) as unknown as Record<string, unknown>;

  // Restore optional connection fields lost by JSON.stringify (undefined → absent from JSON)
  const t = el.type as string;
  if (t === "beam" || t === "spring" || t === "damper" || t === "belt") {
    if (!("fixedNodeStartID" in el)) el.fixedNodeStartID = undefined;
    if (!("fixedNodeEndID" in el)) el.fixedNodeEndID = undefined;
  }
  if (t === "slider" || t === "slidep") {
    if (!("parentBeamID" in el)) el.parentBeamID = undefined;
  }
  if (t === "gear") {
    if (!("attachedBeltID" in el)) el.attachedBeltID = undefined;
  }

  if (typeof el.overlays !== "object" || el.overlays === null) el.overlays = {};

  return el as unknown as MechanicalElement;
}

function deserialize_constraint_element(
  serializedConstraintElement: SerializedConstraintElement,
): ConstraintElement {
  return revive_points(
    serializedConstraintElement as unknown as Record<string, unknown>,
  ) as unknown as ConstraintElement;
}

function deserialize_viewport(
  serializedViewport: SerializedViewportState,
): ViewportState {
  return revive_points(
    serializedViewport as unknown as Record<string, unknown>,
  ) as unknown as ViewportState;
}

export function serialize_mechanism(mechanism: Mechanism): SerializedMechanism {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    metadata: { ...mechanism.metadata },
    viewport: serialize_viewport(mechanism.viewport),
    mechanicalElements: mechanism.mechanicalElements.map(
      serialize_mechanical_element,
    ),
    constraintElements: mechanism.constraintElements.map(
      serialize_constraint_element,
    ),
    loads: mechanism.loads.map((l) => serialize_load_element(l)),
    history: mechanism.history.map((actions) =>
      actions.map((action) => serialize_action(action)),
    ),
    future: mechanism.future.map((actions) =>
      actions.map((action) => serialize_action(action)),
    ),
  };
}

export function deserialize_mechanism(
  serializedMechanism: SerializedMechanism,
): Mechanism {
  return {
    metadata: { ...serializedMechanism.metadata },
    viewport: deserialize_viewport(serializedMechanism.viewport),
    mechanicalElements: serializedMechanism.mechanicalElements.map(
      deserialize_mechanical_element,
    ),
    constraintElements: serializedMechanism.constraintElements.map(
      deserialize_constraint_element,
    ),
    loads: (serializedMechanism.loads ?? []).map(deserialize_load_element),
    history: serializedMechanism.history.map((serializedActions) =>
      serializedActions.map((serializedAction) =>
        deserialize_action(serializedAction),
      ),
    ),
    future: serializedMechanism.future.map((serializedActions) =>
      serializedActions.map((serializedAction) =>
        deserialize_action(serializedAction),
      ),
    ),
  };
}

export function clone_mechanism(mechanism: Mechanism): Mechanism {
  return deserialize_mechanism(serialize_mechanism(mechanism));
}

export function save_to_file(data: any, filename: string = "data.slidep") {
  const jsonString = JSON.stringify(data, null, 2); // Formaté pour la lisibilité
  const blob = new Blob([jsonString], { type: "application/json" });
  download_blob(blob, filename);
}

function download_blob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Strips the characters Windows and macOS reject in a file name, and trims the dots and spaces Windows silently drops. */
function sanitize_filename(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned || "mecanisme";
}

/** Downloads every mechanism as one `.slidep` per entry inside a single zip. Names collide freely in the gallery, so duplicates get a ` (2)` suffix. */
export function save_all_to_zip(
  records: SerializedMechanism[],
  filename: string = "Mes mécanismes.zip",
) {
  const files: Record<string, Uint8Array> = {};

  for (const record of records) {
    const base = sanitize_filename(record.metadata.name || "mecanisme");
    // Probing every candidate rather than counting per base: a mechanism
    // actually named "Bielle (2)" must not be overwritten by the suffix
    // generated for a second "Bielle".
    let entry = `${base}.slidep`;
    for (let n = 2; entry in files; n++) entry = `${base} (${n}).slidep`;
    files[entry] = strToU8(JSON.stringify(record, null, 2));
  }

  const zipped = zipSync(files, { level: 6 });
  download_blob(
    new Blob([zipped as BlobPart], { type: "application/zip" }),
    filename,
  );
}

export interface FileImport {
  records: SerializedMechanism[];
  /** A zip fills the library; a lone `.slidep` is opened in the editor. */
  isArchive: boolean;
}

/** Prompts for a `.slidep` or a `.zip` of them. Never resolves if the user cancels the picker. */
export function load_mechanisms_from_file(): Promise<FileImport> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".slidep,.zip";

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        if (!file.name.toLowerCase().endsWith(".zip")) {
          resolve({
            records: [migrate_document(JSON.parse(await file.text()))],
            isArchive: false,
          });
          return;
        }

        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (entry) => entry.name.toLowerCase().endsWith(".slidep"),
        });
        const records = Object.values(entries).map((bytes) =>
          migrate_document(JSON.parse(strFromU8(bytes))),
        );
        if (records.length === 0)
          throw new Error("Archive sans fichier .slidep");
        resolve({ records, isArchive: true });
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}
