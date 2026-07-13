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
      const pointFields = [
        "newPosition",
        "oldPosition",
        "newPos",
        "delta",
      ] as const;
      for (const key of pointFields) {
        if (key in result) {
          const p = result[key] as SerializedPoint2;
          result[key] = dp(p);
        }
      }
      // Migration: SetShowTrajectory became the "trajectory" kind of the
      // generic SetShowOverlay. Keep old history entries undoable.
      if (result.type === "SetShowTrajectory") {
        result.type = "SetShowOverlay";
        result.kind = "trajectory";
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

  // Migration: the per-element `showTrajectory` boolean became one flag among
  // several in `overlays`. Files saved before the change carry the old field.
  if ("showTrajectory" in el) {
    if (el.showTrajectory)
      el.overlays = { ...(el.overlays as object), trajectory: true };
    delete el.showTrajectory;
  }
  if (typeof el.overlays !== "object" || el.overlays === null) el.overlays = {};

  // Drop probes saved in the legacy placeholder format (metric "position-x"…)
  if (Array.isArray(el.probes)) {
    const validMetrics = ["position", "velocity", "angle", "force"];
    const probes = (el.probes as Record<string, unknown>[]).filter(
      (p) =>
        p &&
        validMetrics.includes(p.metric as string) &&
        typeof p.components === "object",
    );
    if (probes.length > 0) el.probes = probes;
    else delete el.probes;
  }

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
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function load_from_file(): Promise<any> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".slidep";

    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          resolve(data);
        } catch (err) {
          reject("Erreur lors de la lecture du JSON");
        }
      };
      reader.readAsText(file);
    };

    input.click();
  });
}
