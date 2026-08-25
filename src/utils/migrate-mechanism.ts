/**
 * Brings a stored document up to the file format the code expects.
 *
 * Every mechanism read from outside the app — the library, an imported file —
 * goes through `migrate_document` before anything else looks at it. What comes
 * out is a `SerializedMechanism` of the current version; `deserialize_mechanism`
 * can then assume the shape it knows.
 */

import { DEFAULT } from "../constants/physics-specs";
import { DEFAULT_SIMULATION, SerializedMechanism } from "../types";

/** The format `serialize_mechanism` writes today. */
export const CURRENT_FORMAT_VERSION = 8;

/** A document mid-migration: its shape belongs to no version in particular. */
type RawDocument = Record<string, unknown>;

export interface MigrationStep {
  /** The version this step produces. Steps run in ascending order. */
  to: number;
  /**
   * Whether undo/redo entries survive the step. `false` empties `history` and
   * `future`: an entry the step cannot convert would undo into a shape no
   * current code can read. There is no default — each step must decide.
   *
   * Aim for `true`: a rename or a reshaping applies to a stored action as well
   * as to the current state, and dropping the stack costs the user their undo
   * for nothing. Reserve `false` for a step that would have to guess — an
   * action whose meaning is gone, not merely spelled differently.
   */
  preservesHistory: boolean;
  apply: (doc: RawDocument) => RawDocument;
}

/**
 * The chain, from the oldest step to the newest. A step converts a document of
 * version `to - 1` into one of version `to`, `history` and `future` included
 * when it claims to preserve them.
 */
const MIGRATIONS: MigrationStep[] = [
  {
    to: 2,
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(close_belt),
      history: close_belt_in_stack(doc.history),
      future: close_belt_in_stack(doc.future),
    }),
  },
  {
    to: 3,
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(
        add_physical_defaults,
      ),
      history: add_physical_defaults_in_stack(doc.history),
      future: add_physical_defaults_in_stack(doc.future),
    }),
  },
  {
    to: 4,
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(
        add_motor_torque_default,
      ),
      history: add_motor_torque_default_in_stack(doc.history),
      future: add_motor_torque_default_in_stack(doc.future),
    }),
  },
  {
    to: 5,
    // The undo stack mixes distances into fields with no distance-specific shape
    // (a `ChangeForce`'s vector, a `MoveElements`' delta) that only the action's
    // own `type` disambiguates. Converting the document's present state is exact;
    // guessing that for every action variant is not worth the risk to a reopened
    // file, so the stack is dropped instead.
    preservesHistory: false,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(rescale_element),
      constraintElements: as_array(doc.constraintElements).map(rescale_element),
      viewport: rescale_viewport(doc.viewport),
    }),
  },
  {
    to: 6,
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(
        rescale_motor_speed,
      ),
      history: rescale_motor_speed_in_stack(doc.history),
      future: rescale_motor_speed_in_stack(doc.future),
    }),
  },
  {
    to: 7,
    // The properties panel edits a dimension-angle's value through the same generic
    // `ChangeDimensionEdgeValue` action every other dimension kind uses (the reducer
    // dispatches on `id`, not on which of these six action types is named), so a stored
    // action carrying that type cannot be told apart from one that truly holds a length —
    // guessing would risk rescaling the wrong quantity, or missing degrees that need it.
    preservesHistory: false,
    apply: (doc) => ({
      ...doc,
      constraintElements: as_array(doc.constraintElements).map(
        rescale_dimension_angle,
      ),
    }),
  },
  {
    to: 8,
    // Gravity/collisions/floor move from disjoint, session-only React state onto the
    // mechanism itself, so a document from before they existed here gets today's defaults
    // rather than nothing — nothing in `history`/`future` carries them, so no stack reshape.
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      simulation: is_record(doc.simulation) ? doc.simulation : DEFAULT_SIMULATION,
    }),
  },
];

/** v1 → v2: a belt's `tight` flag becomes `closed`, on the element itself. */
const close_belt = (element: unknown): unknown => {
  if (!is_record(element) || element.type !== "belt") return element;
  const { tight, ...rest } = element;
  return { ...rest, closed: tight === true };
};

/** The same rename where an action names the flag: `TightenBelt` and the belts it carries. */
const close_belt_in_action = (action: unknown): unknown => {
  if (!is_record(action)) return action;
  switch (action.type) {
    case "TightenBelt":
      return {
        type: "CloseBelt",
        id: action.id,
        closed: action.tightened === true,
      };
    case "UpdatePositionsToValidState":
      return action.masterActionType === "TightenBelt"
        ? { ...action, masterActionType: "CloseBelt" }
        : action;
    case "CreateElement":
    case "DeleteElement":
      return { ...action, element: close_belt(action.element) };
    default:
      return action;
  }
};

const close_belt_in_stack = (stack: unknown): unknown[][] =>
  as_array(stack).map((bundle) => as_array(bundle).map(close_belt_in_action));

/** v2 → v3: mass and friction, absent from every element saved before they existed,
 *  fall back to the same defaults a freshly placed element gets. */
const add_physical_defaults = (element: unknown): unknown => {
  if (!is_record(element)) return element;
  switch (element.type) {
    case "pivot":
      return { rotationalFriction: DEFAULT.ROTATIONAL_FRICTION, ...element };
    case "slider":
      return { slidingFriction: DEFAULT.SLIDING_FRICTION, ...element };
    case "slidep":
      return {
        slidingFriction: DEFAULT.SLIDING_FRICTION,
        rotationalFriction: DEFAULT.ROTATIONAL_FRICTION,
        ...element,
      };
    case "gear":
      return { surfaceMass: DEFAULT.SURFACE_MASS, ...element };
    case "beam":
      return { linearMass: DEFAULT.LINEAR_MASS, ...element };
    default:
      return element;
  }
};

/** The same defaulting where an action carries a whole element: `CreateElement` and `DeleteElement`. */
const add_physical_defaults_in_action = (action: unknown): unknown => {
  if (!is_record(action)) return action;
  switch (action.type) {
    case "CreateElement":
    case "DeleteElement":
      return { ...action, element: add_physical_defaults(action.element) };
    default:
      return action;
  }
};

const add_physical_defaults_in_stack = (stack: unknown): unknown[][] =>
  as_array(stack).map((bundle) =>
    as_array(bundle).map(add_physical_defaults_in_action),
  );

/** v3 → v4: a motor's torque limit, absent from every one saved before it existed, falls
 *  back to the same default a freshly placed motor gets. */
const add_motor_torque_default = (element: unknown): unknown => {
  if (!is_record(element) || element.type !== "pivot") return element;
  const motor = add_motor_config_torque_default(element.motor);
  return motor === element.motor ? element : { ...element, motor };
};

/** The `MotorConfig` itself, wherever one is carried directly rather than nested in a
 *  pivot — `SetMotorConfig`'s `newConfig`/`oldConfig` — `undefined` (no motor) passes
 *  through unchanged. */
const add_motor_config_torque_default = (config: unknown): unknown => {
  if (!is_record(config) || typeof config.torque === "number") return config;
  return { torque: DEFAULT.MOTOR_TORQUE, ...config };
};

/** The same defaulting where an action carries a pivot, or a `MotorConfig` on its own. */
const add_motor_torque_default_in_action = (action: unknown): unknown => {
  if (!is_record(action)) return action;
  switch (action.type) {
    case "CreateElement":
    case "DeleteElement":
      return { ...action, element: add_motor_torque_default(action.element) };
    case "SetMotorConfig":
      return {
        ...action,
        newConfig: add_motor_config_torque_default(action.newConfig),
        oldConfig: add_motor_config_torque_default(action.oldConfig),
      };
    default:
      return action;
  }
};

const add_motor_torque_default_in_stack = (stack: unknown): unknown[][] =>
  as_array(stack).map((bundle) =>
    as_array(bundle).map(add_motor_torque_default_in_action),
  );

/** v4 → v5: world units become metres. Every stored distance shrinks by it, and a saved
 *  viewport's scale grows by the same factor, so a reopened file frames the same view. */
const WORLD_UNIT_RESCALE = 1 / 1000;

const rescale_point = (point: unknown): unknown => {
  if (!is_record(point)) return point;
  const { x, y } = point;
  return {
    ...point,
    x: typeof x === "number" ? x * WORLD_UNIT_RESCALE : x,
    y: typeof y === "number" ? y * WORLD_UNIT_RESCALE : y,
  };
};

/** Every mechanical or constraint element's own distances: a position, the two ends of an
 *  edge, a gear's radius, a spring or damper's rest length, a dimension's value — except an
 *  angle (degrees at this version, not yet a length's kind of number regardless) and a gear
 *  ratio (dimensionless), the two dimension families that aren't lengths. */
const rescale_element = (element: unknown): unknown => {
  if (!is_record(element)) return element;
  const scaled = { ...element };
  if ("position" in scaled) scaled.position = rescale_point(scaled.position);
  if ("positionStart" in scaled)
    scaled.positionStart = rescale_point(scaled.positionStart);
  if ("positionEnd" in scaled)
    scaled.positionEnd = rescale_point(scaled.positionEnd);
  if (element.type === "gear" && typeof scaled.radius === "number")
    scaled.radius = scaled.radius * WORLD_UNIT_RESCALE;
  if (
    (element.type === "spring" || element.type === "damper") &&
    typeof scaled.restLength === "number"
  )
    scaled.restLength = scaled.restLength * WORLD_UNIT_RESCALE;
  if (
    typeof scaled.value === "number" &&
    element.type !== "dimension-angle" &&
    element.type !== "gear-ratio"
  )
    scaled.value = scaled.value * WORLD_UNIT_RESCALE;
  return scaled;
};

/** v6 → v7: a dimension-angle's value becomes radians, like `ANGLE` everywhere else, instead
 *  of the one dimension kind that held degrees directly. */
const DIMENSION_ANGLE_RESCALE = Math.PI / 180;

const rescale_dimension_angle = (element: unknown): unknown => {
  if (
    !is_record(element) ||
    element.type !== "dimension-angle" ||
    typeof element.value !== "number"
  )
    return element;
  return { ...element, value: element.value * DIMENSION_ANGLE_RESCALE };
};

const rescale_viewport = (viewport: unknown): unknown => {
  if (!is_record(viewport)) return viewport;
  return {
    ...viewport,
    scale:
      typeof viewport.scale === "number"
        ? viewport.scale / WORLD_UNIT_RESCALE
        : viewport.scale,
  };
};

/** v5 → v6: a motor's speed becomes rad/s, like every other stored quantity, instead of the
 *  one field that held tr/min directly. */
const MOTOR_SPEED_RESCALE = (2 * Math.PI) / 60;

const rescale_motor_config = (config: unknown): unknown => {
  if (!is_record(config) || typeof config.speed !== "number") return config;
  return { ...config, speed: config.speed * MOTOR_SPEED_RESCALE };
};

const rescale_motor_speed = (element: unknown): unknown => {
  if (!is_record(element) || element.type !== "pivot") return element;
  const motor = rescale_motor_config(element.motor);
  return motor === element.motor ? element : { ...element, motor };
};

/** The same rescaling where an action carries a pivot, or a `MotorConfig` on its own. */
const rescale_motor_speed_in_action = (action: unknown): unknown => {
  if (!is_record(action)) return action;
  switch (action.type) {
    case "CreateElement":
    case "DeleteElement":
      return { ...action, element: rescale_motor_speed(action.element) };
    case "SetMotorConfig":
      return {
        ...action,
        newConfig: rescale_motor_config(action.newConfig),
        oldConfig: rescale_motor_config(action.oldConfig),
      };
    default:
      return action;
  }
};

const rescale_motor_speed_in_stack = (stack: unknown): unknown[][] =>
  as_array(stack).map((bundle) =>
    as_array(bundle).map(rescale_motor_speed_in_action),
  );

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const as_array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/**
 * Raises `raw` to `CURRENT_FORMAT_VERSION`. A document without a
 * `formatVersion` is a version 1 that predates the field, not an older format.
 *
 * Throws on a document that is unreadable or too recent — both are cases where
 * carrying on would mean guessing at the user's data.
 */
export function migrate_document(raw: unknown): SerializedMechanism {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("Document illisible");

  let doc = { ...raw } as RawDocument;
  // Never `CURRENT_FORMAT_VERSION`: that reads a legacy document as already
  // up to date and skips every step it owes.
  let version =
    typeof doc.formatVersion === "number" ? doc.formatVersion : 1;

  if (version > CURRENT_FORMAT_VERSION)
    throw new Error(
      `Format ${version} : ce mécanisme vient d'une version plus récente de Slidep (format ${CURRENT_FORMAT_VERSION}).`,
    );

  for (const step of MIGRATIONS) {
    if (step.to <= version) continue;
    doc = step.apply(doc);
    if (!step.preservesHistory) doc = { ...doc, history: [], future: [] };
    version = step.to;
  }

  doc.formatVersion = CURRENT_FORMAT_VERSION;
  return doc as unknown as SerializedMechanism;
}

/** The chain, for the test that checks it stays contiguous. */
export const MIGRATION_STEPS: readonly MigrationStep[] = MIGRATIONS;
