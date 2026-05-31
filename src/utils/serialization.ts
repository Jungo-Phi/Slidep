import {
  Action,
  ConstraintElement,
  MechanicalElement,
  Mechanism,
  Point2,
  SerializedMechanism,
} from "../types";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedMechanicalElement,
  SerializedPoint2,
} from "../types/serialized";

// --- Helper functions

function sp(p: Point2): SerializedPoint2 {
  return { x: p.x, y: p.y };
}

function dp(s: SerializedPoint2): Point2 {
  return new Point2(s.x, s.y);
}

function serializePointsMap(
  m: Map<string, Point2>,
): [string, SerializedPoint2][] {
  return [...m.entries()].map(([k, v]) => [k, sp(v)]);
}

function serializeNumbersMap(m: Map<string, number>): [string, number][] {
  return [...m.entries()];
}

function deserializePointsMap(
  entries: [string, SerializedPoint2][],
): Map<string, Point2> {
  return new Map(entries.map(([k, v]) => [k, dp(v)]));
}

function deserializeNumbersMap(
  entries: [string, number][],
): Map<string, number> {
  return new Map(entries);
}

// ─── Serialize / Deserialize Action ───────────────────────────────────────────

export function serializeAction(a: Action): SerializedAction {
  console.log(a);
  switch (a.type) {
    // Contient un UnionElement avec des Point2 imbriqués → déléguer
    case "CreateElement":
    case "DeleteElement": {
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
          ? serializeMechanicalElement(a.element as MechanicalElement)
          : serializeConstraintElement(a.element as ConstraintElement),
      } as SerializedAction;
    }

    // Contient des Map<string, Point2> et Map<string, number>
    case "UpdatePositionsToValidState":
      return {
        type: a.type,
        masterActionType: a.masterActionType,
        newNodes: {
          positions: serializePointsMap(a.newNodes.positions),
          radii: serializeNumbersMap(a.newNodes.radii),
          posMasses: serializeNumbersMap(a.newNodes.posMasses),
          radMasses: serializeNumbersMap(a.newNodes.radMasses),
        },
        oldNodes: {
          positions: serializePointsMap(a.oldNodes.positions),
          radii: serializeNumbersMap(a.oldNodes.radii),
          posMasses: serializeNumbersMap(a.oldNodes.posMasses),
          radMasses: serializeNumbersMap(a.oldNodes.radMasses),
        },
      };

    // Tous les autres cas : Point2 sont propriétés directes → JSON suffit
    default:
      return JSON.parse(JSON.stringify(a));
  }
}

// ─── deserializeAction ────────────────────────────────────────────────────────

export function deserializeAction(s: SerializedAction): Action {
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
          ? deserializeMechanicalElement(
              s.element as SerializedMechanicalElement,
            )
          : deserializeConstraintElement(
              s.element as SerializedConstraintElement,
            ),
      } as Action;
    }

    case "UpdatePositionsToValidState":
      return {
        type: s.type,
        masterActionType: s.masterActionType,
        newNodes: {
          positions: deserializePointsMap(s.newNodes.positions),
          radii: deserializeNumbersMap(s.newNodes.radii),
          posMasses: deserializeNumbersMap(s.newNodes.posMasses),
          radMasses: deserializeNumbersMap(s.newNodes.radMasses),
        },
        oldNodes: {
          positions: deserializePointsMap(s.oldNodes.positions),
          radii: deserializeNumbersMap(s.oldNodes.radii),
          posMasses: deserializeNumbersMap(s.oldNodes.posMasses),
          radMasses: deserializeNumbersMap(s.oldNodes.radMasses),
        },
      };

    // Tous les autres cas : reconstruire les Point2 par nom de champ
    default: {
      const result = { ...s } as Record<string, unknown>;
      const pointFields = [
        "newPosition",
        "oldPosition",
        "deltaStart",
        "newPos",
        "delta",
      ] as const;
      for (const key of pointFields) {
        if (key in result) {
          const p = result[key] as SerializedPoint2;
          result[key] = dp(p);
        }
      }
      return result as Action;
    }
  }
}

export function cloneAction(a: Action): Action {
  return deserializeAction(serializeAction(a));
}

// ─── Serialize / Deserialize Elements ────────────────────────────────────────

export function serializeMechanicalElement(
  e: MechanicalElement,
): SerializedMechanicalElement {
  return JSON.parse(JSON.stringify(e));
}

export function serializeConstraintElement(
  e: ConstraintElement,
): SerializedConstraintElement {
  return JSON.parse(JSON.stringify(e));
}

function revivePoints(s: Record<string, unknown>): Record<string, unknown> {
  const result = { ...s };

  for (const key of ["position", "positionStart", "positionEnd"] as const) {
    if (key in result) {
      const p = result[key] as SerializedPoint2;
      result[key] = new Point2(p.x, p.y);
    }
  }

  return result;
}

export function deserializeMechanicalElement(
  serializedMechanicalElement: SerializedMechanicalElement,
): MechanicalElement {
  return revivePoints(
    serializedMechanicalElement as unknown as Record<string, unknown>,
  ) as unknown as MechanicalElement;
}

export function deserializeConstraintElement(
  serializedConstraintElement: SerializedConstraintElement,
): ConstraintElement {
  return revivePoints(
    serializedConstraintElement as unknown as Record<string, unknown>,
  ) as unknown as ConstraintElement;
}

export function cloneMechanicalElement(
  e: MechanicalElement,
): MechanicalElement {
  return deserializeMechanicalElement(serializeMechanicalElement(e));
}

export function cloneConstraintElement(
  e: ConstraintElement,
): ConstraintElement {
  return deserializeConstraintElement(serializeConstraintElement(e));
}

// ─── Serialize / Deserialize Mechanism ────────────────────────────────────────

export function serializeMechanism(mechanism: Mechanism): SerializedMechanism {
  return {
    metadata: { ...mechanism.metadata },
    viewport: { ...mechanism.viewport },
    mechanicalElements: mechanism.mechanicalElements.map(
      serializeMechanicalElement,
    ),
    constraintElements: mechanism.constraintElements.map(
      serializeConstraintElement,
    ),
    history: mechanism.history.map((actions) =>
      actions.map((action) => serializeAction(action)),
    ),
    future: mechanism.future.map((actions) =>
      actions.map((action) => serializeAction(action)),
    ),
  };
}

export function deserializeMechanism(
  serializedMechanism: SerializedMechanism,
): Mechanism {
  return {
    metadata: { ...serializedMechanism.metadata },
    viewport: { ...serializedMechanism.viewport },
    mechanicalElements: serializedMechanism.mechanicalElements.map(
      deserializeMechanicalElement,
    ),
    constraintElements: serializedMechanism.constraintElements.map(
      deserializeConstraintElement,
    ),
    history: serializedMechanism.history.map((serializedActions) =>
      serializedActions.map((serializedAction) =>
        deserializeAction(serializedAction),
      ),
    ),
    future: serializedMechanism.future.map((serializedActions) =>
      serializedActions.map((serializedAction) =>
        deserializeAction(serializedAction),
      ),
    ),
  };
}

// Cloner
export function cloneMechanism(mechanism: Mechanism): Mechanism {
  return deserializeMechanism(serializeMechanism(mechanism));
}

// Sauvegarder
/*
{
  const json = JSON.stringify(serializeMechanism(mechanism));
  localStorage.setItem("mechanism", json);
  // ou : await fetch("/api/save", { method: "POST", body: json });
}
*/

// Charger
/*
{
  const raw = localStorage.getItem("mechanism");
  if (raw) {
    mechanism = deserializeMechanism(JSON.parse(raw));
  }
}
*/
