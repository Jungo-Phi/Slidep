import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  connect_elements,
  delete_element,
  delete_elements,
} from "../components/mechanism/connect-actions";
import { actionReducer } from "../components/mechanism/action-reducer";
import { validate_mechanism } from "./validate-mechanism";
import { DEFAULT_METADATA, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import { HoveredPart, names_element } from "../types/hovered-part";
import { CanvasState } from "../types/canvas-state";
import { legality_for_state } from "../components/mechanism/connection-rules";
import {
  handle_placing_element,
  MouseDownResult,
} from "../components/canvas/placing-element-actions";
import { handle_placing_constraint } from "../components/canvas/placing-constraint-actions";
import {
  HOVER_TARGETS,
  type BeltProbe,
  type EdgeProbe,
  type HoverTargets,
} from "../components/canvas/get-hover";
import { ID, MechanicalElement, UnionElement } from "../types";

/**
 * Property: any state reachable through gestures the UI offers is a valid
 * mechanism. A counter-example is always a real defect — either the operation
 * is wrong, or the interface should not have offered it.
 *
 * Commands never fabricate an Action: they call the very functions the canvas
 * calls, with operands drawn from the current state.
 */

let counter = 0;
const fresh = (): ID => {
  counter += 1;
  return `00000000-0000-0000-0000-${String(counter).padStart(12, "0")}` as ID;
};

const P = (x: number, y: number) => new Point2(x, y);

// ─── Gadgets: small, individually valid fragments ─────────────────────────────

type Gadget =
  "lonePivot" | "loneJoin" | "loneBeam" | "pivotOnBeam" | "gearOnAxle";

const GADGETS: Gadget[] = [
  "lonePivot",
  "loneJoin",
  "loneBeam",
  "pivotOnBeam",
  "gearOnAxle",
];

function build_gadget(gadget: Gadget, x: number): MechanicalElement[] {
  switch (gadget) {
    case "lonePivot":
      return [
        {
          type: "pivot",
          id: fresh(),
          probes: [],
          overlays: {},
          position: P(x, 0),
          isGrounded: false,
          rotatingEdgesIDs: [],
          fixedGearsIDs: [],
        },
      ];
    case "loneJoin":
      return [
        {
          type: "join",
          id: fresh(),
          probes: [],
          overlays: {},
          position: P(x, 0),
          isGrounded: false,
          fixedEdgesIDs: [],
        },
      ];
    case "loneBeam":
      return [
        {
          type: "beam",
          id: fresh(),
          probes: [],
          overlays: {},
          positionStart: P(x, 0),
          positionEnd: P(x + 40, 0),
          fixedNodeStartID: undefined,
          fixedNodeEndID: undefined,
          fixedNodesBodyIDs: [],
        },
      ];
    case "pivotOnBeam": {
      const pivotID = fresh();
      const beamID = fresh();
      return [
        {
          type: "pivot",
          id: pivotID,
          probes: [],
          overlays: {},
          position: P(x, 0),
          isGrounded: false,
          rotatingEdgesIDs: [beamID],
          fixedGearsIDs: [],
        },
        {
          type: "beam",
          id: beamID,
          probes: [],
          overlays: {},
          positionStart: P(x, 0),
          positionEnd: P(x + 40, 0),
          fixedNodeStartID: pivotID,
          fixedNodeEndID: undefined,
          fixedNodesBodyIDs: [],
        },
      ];
    }
    case "gearOnAxle": {
      const axleID = fresh();
      const gearID = fresh();
      return [
        {
          type: "pivot",
          id: axleID,
          probes: [],
          overlays: {},
          position: P(x, 0),
          isGrounded: false,
          rotatingEdgesIDs: [],
          fixedGearsIDs: [gearID],
        },
        {
          type: "gear",
          id: gearID,
          probes: [],
          overlays: {},
          position: P(x, 0),
          angle: 0,
          radius: 20,
          parentAxleID: axleID,
          fixedNodesBodyIDs: [],
          meshedGearsIDs: [],
          attachedBeltID: undefined,
        },
      ];
    }
  }
}

function build_mechanism(gadgets: Gadget[]): Mechanism {
  const mechanicalElements = gadgets.flatMap((g, i) =>
    build_gadget(g, i * 120),
  );
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

// ─── Hovered parts, as the canvas would produce them ──────────────────────────

const EDGE_PARTS = ["start", "end", "body"] as const;

/** What the selection tool sees — the part a drag grabs comes from there. */
const SELECT_ALL_TARGETS = HOVER_TARGETS.Selecting;

/** A belt is only ever an `Edge` at its two terminals: its body is a `BeltBody`,
 *  reported with a section index that this generator cannot produce yet. */
const BELT_PARTS = ["start", "end"] as const;

/** Which parts of an edge a probe mode reports. */
function edge_parts(
  mode: EdgeProbe,
  element: MechanicalElement,
): readonly ("start" | "end" | "body")[] {
  switch (mode) {
    case "ends":
      return ["start", "end"];
    case "ends+body":
      return EDGE_PARTS;
    case "ends+beam-body":
      return element.type === "beam" ? EDGE_PARTS : ["start", "end"];
    case "body":
    case "body-centre":
      return ["body"];
  }
}

/** Which parts of a belt a probe mode reports, of those this generator can build. */
function belt_parts(mode: BeltProbe): readonly ("start" | "end")[] {
  // "runs+arcs" and "runs-tangent" report `BeltBody` only, which needs a section
  // index — out of reach until `parts_of` can produce one.
  return mode === "ends" || mode === "full" ? BELT_PARTS : [];
}

/**
 * The parts of an element a tool would report under the cursor.
 *
 * `legality_for_state` is only half the oracle: a rule refuses a target the tool
 * can *see*, while `HOVER_TARGETS` decides which families it looks at at all.
 * Handing a tool a part it never probes explores a gesture the interface has no
 * way to produce, and the resulting invalid state accuses the code of a defect
 * that belongs to the generator.
 */
function parts_of(
  element: MechanicalElement,
  targets: HoverTargets = SELECT_ALL_TARGETS,
): HoveredPart[] {
  if (element.type === "gear") {
    if (!targets.gear) return [];
    return [
      {
        type: "GearTooth",
        position: element.position,
        id: element.id,
        deleting: false,
      },
    ];
  }
  if ("positionStart" in element) {
    const parts: readonly ("start" | "end" | "body")[] =
      element.type === "belt"
        ? targets.belt
          ? belt_parts(targets.belt)
          : []
        : targets.edge
          ? edge_parts(targets.edge, element)
          : [];
    return parts.map((part) => ({
      type: "Edge" as const,
      position: part === "end" ? element.positionEnd : element.positionStart,
      id: element.id,
      deleting: false,
      part,
    }));
  }
  // "carried-gear" designates the gear an axle carries, not the node itself.
  if (targets.node !== "centre" && targets.node !== "centre+past") return [];
  return [
    {
      type: "Node",
      position: element.position,
      id: element.id,
      deleting: false,
      beamBodyHover: false,
    },
  ];
}

// ─── Tools ────────────────────────────────────────────────────────────────────

/**
 * The two placement state machines, driven exactly as the canvas drives them on
 * mouse-down. Building a belt, a motor or a load through its own tool is what
 * keeps the generator from having to hand-craft those shapes — a hand-made
 * gadget that is subtly wrong makes the code under test look guilty.
 */
type PlacementToolState = Parameters<typeof handle_placing_element>[0];
type ConstraintToolState = Parameters<typeof handle_placing_constraint>[0];
type ToolState = PlacementToolState | ConstraintToolState;

const PLACEMENT_TOOL_TYPES = [
  "PlacingBeamStart",
  "PlacingBeamEnd",
  "PlacingSpringStart",
  "PlacingSpringEnd",
  "PlacingDamperStart",
  "PlacingDamperEnd",
  "PlacingBeltStart",
  "PlacingBeltEnd",
  "PlacingMotor",
  "PlacingPivot",
  "PlacingSlider",
  "PlacingJoin",
  "PlacingMass",
  "PlacingGearStart",
  "PlacingGearRadius",
  "PlacingGround",
  "PlacingForceStart",
  "PlacingForceEnd",
  "PlacingDistributedForce",
  "PlacingMomentStart",
  "PlacingMomentEnd",
  "PlacingProbe",
] as const satisfies readonly PlacementToolState["type"][];

const CONSTRAINT_TOOL_TYPES = [
  "DimensionStart",
  "DimensionNode",
  "DimensionEdge",
  "DimensionNodeToNode",
  "DimensionEdgeToNode",
  "DimensionAngle",
  "DimensionRadius",
  "DimensionBelt",
  "HorizontalVerticalConstraintStart",
  "HorizontalVerticalConstraintNode",
  "NormalConstraintStart",
  "NormalConstraintEdge",
  "ParallelConstraintStart",
  "ParallelConstraintEdge",
  "EqualConstraintStart",
  "EqualConstraintEdge",
  "EqualConstraintGear",
  "GearRatioConstraintStart",
  "GearRatioConstraintGear",
] as const satisfies readonly ConstraintToolState["type"][];

type Assert<T extends true> = T;

/** A state a handler accepts but the lists above forgot would silently become
 *  "idle", and every gesture it leads to would leave the explored space. */
export type NoUnlistedPlacementTool = Assert<
  Exclude<
    PlacementToolState["type"],
    (typeof PLACEMENT_TOOL_TYPES)[number]
  > extends never
    ? true
    : false
>;
export type NoUnlistedConstraintTool = Assert<
  Exclude<
    ConstraintToolState["type"],
    (typeof CONSTRAINT_TOOL_TYPES)[number]
  > extends never
    ? true
    : false
>;

function is_placement_tool(state: ToolState): state is PlacementToolState {
  return (PLACEMENT_TOOL_TYPES as readonly string[]).includes(state.type);
}

/**
 * The tool a returned canvas state continues, if any. A gesture that ends in a
 * value editor or a probe popover leaves both families: the generator treats it
 * as the user dismissing it, which is the only outcome it can express.
 */
function as_tool(state: CanvasState): ToolState | undefined {
  const known = [
    ...PLACEMENT_TOOL_TYPES,
    ...CONSTRAINT_TOOL_TYPES,
  ] as readonly string[];
  return known.includes(state.type) ? (state as ToolState) : undefined;
}

/**
 * The tools a click may start from — the palette, in effect. `PlacingProbe` is
 * left out: it opens a metric popover the generator has no way to answer, so it
 * would only spend budget returning to idle.
 */
const ROOT_TOOLS: ToolState[] = [
  { type: "PlacingBeamStart" },
  { type: "PlacingSpringStart" },
  { type: "PlacingDamperStart" },
  { type: "PlacingBeltStart" },
  { type: "PlacingPivot" },
  { type: "PlacingMotor" },
  { type: "PlacingSlider" },
  { type: "PlacingJoin" },
  { type: "PlacingMass" },
  { type: "PlacingGearStart" },
  { type: "PlacingGround" },
  { type: "PlacingForceStart" },
  { type: "PlacingMomentStart" },
  { type: "DimensionStart" },
  { type: "HorizontalVerticalConstraintStart" },
  { type: "NormalConstraintStart" },
  { type: "ParallelConstraintStart" },
  { type: "EqualConstraintStart" },
  { type: "GearRatioConstraintStart" },
];

function run_tool(
  state: ToolState,
  hoveredPart: HoveredPart,
  mechanism: Mechanism,
): MouseDownResult {
  const { mechanicalElements, constraintElements, loads } = mechanism;
  return is_placement_tool(state)
    ? handle_placing_element(
        state,
        hoveredPart,
        mechanicalElements,
        constraintElements,
        loads,
      )
    : handle_placing_constraint(state, hoveredPart, mechanicalElements);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

type Command =
  | { kind: "connect"; a: number; partA: number; b: number; partB: number }
  | { kind: "deleteOne"; i: number }
  | { kind: "deleteMany"; indices: number[] }
  | { kind: "place"; tool: number; target: number; x: number; y: number };

const command_arbitrary = fc.oneof(
  fc.record({
    kind: fc.constant("connect" as const),
    a: fc.nat(20),
    partA: fc.nat(2),
    b: fc.nat(20),
    partB: fc.nat(2),
  }),
  fc.record({ kind: fc.constant("deleteOne" as const), i: fc.nat(20) }),
  fc.record({
    kind: fc.constant("deleteMany" as const),
    indices: fc.array(fc.nat(20), { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant("place" as const),
    tool: fc.nat(ROOT_TOOLS.length - 1),
    target: fc.nat(40),
    x: fc.nat(11),
    y: fc.nat(5),
  }),
);

const pick = <T>(items: T[], n: number): T => items[n % items.length];

/** The canvas state a drag of that part goes through, so the rules see the real gesture. */
function drag_state(selectedPart: HoveredPart): CanvasState {
  switch (selectedPart.type) {
    case "Node":
      return { type: "MovingNode", elementID: selectedPart.id };
    case "GearTooth":
      return { type: "ChangingGearRadius", elementID: selectedPart.id };
    case "Edge":
      if (selectedPart.part === "start")
        return { type: "MovingEdgeStartPoint", elementID: selectedPart.id };
      if (selectedPart.part === "end")
        return { type: "MovingEdgeEndPoint", elementID: selectedPart.id };
      return { type: "MovingEdgeBody", elementID: selectedPart.id, t: 0.5 };
    default:
      return { type: "Selecting" };
  }
}

/**
 * What the canvas carries between two clicks. `tool` is the active tool and how
 * far it is through its own gesture — a belt is three clicks, a dimension two.
 * `undefined` is the selection tool: any drag or delete goes back to it.
 */
interface Session {
  mechanism: Mechanism;
  tool: ToolState | undefined;
}

/** Whether the interface would offer this target — the oracle the hover consults. */
function is_offered(
  state: CanvasState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
): boolean {
  if (!names_element(hoveredPart)) return true;
  const candidate: UnionElement | undefined = mechanicalElements.find(
    (element) => element.id === hoveredPart.id,
  );
  if (!candidate) return false;
  return legality_for_state(state, mechanicalElements)(candidate, hoveredPart)
    .allowed;
}

/** Applies one command through the production entry points. Returns the new session. */
function run_command(session: Session, command: Command): Session {
  const { mechanism } = session;
  const { mechanicalElements, constraintElements, loads } = mechanism;
  if (mechanicalElements.length === 0) return session;

  switch (command.kind) {
    case "place": {
      // A tool mid-gesture keeps the click; only an idle one can be swapped.
      const state = session.tool ?? pick(ROOT_TOOLS, command.tool);
      const probed = HOVER_TARGETS[state.type];
      const targets: HoveredPart[] = [
        { type: "Void", position: P(command.x * 40, command.y * 40 - 100) },
        ...mechanicalElements.flatMap((element) => parts_of(element, probed)),
      ];
      const hoveredPart = pick(targets, command.target);
      if (!is_offered(state, hoveredPart, mechanicalElements)) return session;
      const result = run_tool(state, hoveredPart, mechanism);
      return {
        mechanism:
          result.actions.length === 0
            ? mechanism
            : actionReducer(mechanism, result.actions, false),
        tool: as_tool(result.newCanvasState ?? state),
      };
    }
    // Dragging and erasing belong to the selection tool: reaching for them puts
    // whatever tool was active back to idle.
    case "connect": {
      const selected = pick(mechanicalElements, command.a);
      const hovered = pick(mechanicalElements, command.b);
      if (selected.id === hovered.id) return session;
      // The grabbed part comes from the selection tool; the target comes from
      // what the drag itself probes.
      const selectedParts = parts_of(selected);
      if (selectedParts.length === 0) return { mechanism, tool: undefined };
      const selectedPart = pick(selectedParts, command.partA);
      const state = drag_state(selectedPart);
      const hoveredParts = parts_of(hovered, HOVER_TARGETS[state.type]);
      if (hoveredParts.length === 0) return { mechanism, tool: undefined };
      const hoveredPart = pick(hoveredParts, command.partB);
      // The gesture is only explored if the interface would offer it — same
      // oracle the hover consults, so the generator cannot drift from the UI.
      if (
        !legality_for_state(state, mechanicalElements)(hovered, hoveredPart)
          .allowed
      )
        return { mechanism, tool: undefined };
      const actions = connect_elements(
        hoveredPart,
        selected,
        selectedPart,
        mechanicalElements,
        constraintElements,
        loads,
      );
      return {
        mechanism:
          actions.length === 0
            ? mechanism
            : actionReducer(mechanism, actions, false),
        tool: undefined,
      };
    }
    case "deleteOne": {
      const target = pick(mechanicalElements, command.i);
      const actions = delete_element(
        target.id,
        mechanicalElements,
        constraintElements,
        loads,
      );
      return {
        mechanism: actionReducer(mechanism, actions, false),
        tool: undefined,
      };
    }
    case "deleteMany": {
      const ids = [
        ...new Set(
          command.indices.map((n) => pick(mechanicalElements, n).id as ID),
        ),
      ];
      const actions = delete_elements(
        ids,
        mechanicalElements,
        constraintElements,
        loads,
      );
      return {
        mechanism: actionReducer(mechanism, actions, false),
        tool: undefined,
      };
    }
  }
}

// Vitest runs on Node, but the project carries no @types/node.
declare const process: { env: Record<string, string | undefined> };

/**
 * Budget of the committed run. `FUZZ_RUNS=8000 FUZZ_COMMANDS=14 npx vitest run
 * src/utils/mechanism-fuzz.test.ts` replays the deep probe, which reaches
 * defects the default budget almost never hits.
 */
const NUM_RUNS = Number(process.env.FUZZ_RUNS ?? 300);
const MAX_COMMANDS = Number(process.env.FUZZ_COMMANDS ?? 6);

/** `FUZZ_SEED=<seed from the failure report>` replays that exact run. */
const SEED = process.env.FUZZ_SEED ? Number(process.env.FUZZ_SEED) : undefined;

/** Runs a sequence to the end, throwing on the first state the validator rejects. */
function run_sequence(seed: Gadget[], commands: Command[]): void {
  let session: Session = { mechanism: build_mechanism(seed), tool: undefined };
  // A bad seed would blame the code under test for a generator bug.
  expect(validate_mechanism(session.mechanism)).toBeNull();

  for (let step = 0; step < commands.length; step++) {
    // An exception escaping an operation is the worst outcome and the least
    // readable one: without the sequence that produced it, there is nothing to
    // replay.
    try {
      session = run_command(session, commands[step]);
    } catch (error) {
      throw new Error(
        `${describe_sequence(seed, commands, step)}\nException: ${describe_throw(error)}`,
      );
    }
    const errors = validate_mechanism(session.mechanism);
    if (errors)
      throw new Error(
        describe_failure(seed, commands, step, session.mechanism),
      );
  }
}

/** The message plus the frames inside `src`, which is where the culprit is. */
function describe_throw(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.includes("/src/") || line.includes("\\src\\"))
    .slice(0, 4)
    .map((line) => `  ${line.trim()}`);
  return [error.message, ...frames].join("\n");
}

function describe_sequence(
  seed: Gadget[],
  commands: Command[],
  step: number,
): string {
  return [
    `Seed: [${seed.join(", ")}]`,
    `Commandes jusqu'à l'échec: ${JSON.stringify(commands.slice(0, step + 1))}`,
  ].join("\n");
}

function describe_failure(
  seed: Gadget[],
  commands: Command[],
  step: number,
  mechanism: Mechanism,
): string {
  const errors = validate_mechanism(mechanism) ?? [];
  return [
    describe_sequence(seed, commands, step),
    `Erreurs:`,
    ...errors.map((e) => `  ${e.code}: ${e.message}`),
  ].join("\n");
}

describe("fuzzing — les gestes de l'UI préservent la validité", () => {
  it("les gadgets de départ sont eux-mêmes valides", () => {
    for (const gadget of GADGETS) {
      const mechanism = build_mechanism([gadget]);
      expect(
        validate_mechanism(mechanism),
        `le gadget "${gadget}" est invalide`,
      ).toBeNull();
    }
  });

  it("aucune séquence de connexions et suppressions ne casse le mécanisme", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...GADGETS), { minLength: 1, maxLength: 3 }),
        fc.array(command_arbitrary, {
          minLength: 1,
          maxLength: MAX_COMMANDS,
        }),
        run_sequence,
      ),
      { numRuns: NUM_RUNS, seed: SEED },
    );
  });
});

/**
 * Counter-examples the deep probe found, kept as executable records rather than
 * prose: each one still reproduces its defect, and `it.fails` turns red the day
 * it stops — which is the day to fix the operation and flip it back to `it`.
 *
 * The default budget reaches none of these, so without this block the suite is
 * green while the defects are alive.
 */
/**
 * Defects the deep probe found in the placement tools, all three killed by
 * making `handle_place_element` advance a simulated state between its successive
 * `connect_elements` calls. Kept as `it` — they are the regression net for that
 * composition, and the gesture that produced each one is still explored.
 */
describe("fuzzing — le placement compose ses étapes", () => {
  it("l'outil engrenage sur un pivot existant ne lève plus", () => {
    run_sequence(
      ["lonePivot"],
      [
        { kind: "place", tool: 9, target: 21, x: 0, y: 0 },
        { kind: "place", tool: 0, target: 21, x: 0, y: 0 },
      ],
    );
  });

  it("une barre posée sur une extrémité déjà tenue reste réciproque", () => {
    run_sequence(
      ["loneBeam", "pivotOnBeam", "pivotOnBeam"],
      [
        { kind: "place", tool: 0, target: 28, x: 0, y: 0 },
        { kind: "place", tool: 0, target: 17, x: 0, y: 0 },
      ],
    );
  });

  it("un pivot créé sous un engrenage posé reste réciproque", () => {
    run_sequence(
      ["lonePivot", "loneBeam"],
      [
        { kind: "deleteMany", indices: [0] },
        { kind: "place", tool: 9, target: 5, x: 0, y: 0 },
        { kind: "place", tool: 0, target: 4, x: 0, y: 0 },
      ],
    );
  });
});

/**
 * Two nodes carried by the same body, then merged: the survivor must take the
 * place it already holds rather than be named twice.
 */
describe("fuzzing — la fusion ne duplique pas une référence de corps", () => {
  it("un nœud absorbé par un autre du même corps ne le dédouble pas", () => {
    run_sequence(
      ["pivotOnBeam", "lonePivot", "loneBeam"],
      [
        { kind: "connect", a: 5, partA: 0, b: 11, partB: 2 },
        { kind: "deleteOne", i: 0 },
        { kind: "connect", a: 0, partA: 0, b: 6, partB: 2 },
        { kind: "deleteMany", indices: [0] },
        { kind: "connect", a: 2, partA: 0, b: 15, partB: 0 },
        { kind: "deleteMany", indices: [0] },
      ],
    );
  });

  it("le même défaut par un autre chemin", () => {
    run_sequence(
      ["loneBeam", "pivotOnBeam", "loneBeam"],
      [
        { kind: "connect", a: 7, partA: 2, b: 0, partB: 0 },
        { kind: "deleteOne", i: 0 },
        { kind: "connect", a: 0, partA: 0, b: 2, partB: 2 },
        { kind: "connect", a: 0, partA: 0, b: 15, partB: 0 },
        { kind: "connect", a: 0, partA: 0, b: 0, partB: 0 },
      ],
    );
  });
});

describe("fuzzing — défauts ouverts, reproduits", () => {
  it.fails("MISSING_BIDIRECTIONAL : extrémité de barre non réciproque", () => {
    run_sequence(
      ["pivotOnBeam", "pivotOnBeam"],
      [
        { kind: "connect", a: 2, partA: 0, b: 5, partB: 1 },
        { kind: "connect", a: 14, partA: 0, b: 0, partB: 0 },
        { kind: "deleteMany", indices: [0] },
      ],
    );
  });

});

/**
 * Two gestures the rules now refuse. The sequences no longer build anything —
 * the refusal drops the offending command — so they only guard against the rule
 * being lost; what each rule actually says is asserted in
 * `connection-rules.test.ts`.
 */
describe("fuzzing — gestes désormais refusés", () => {
  it("le corps d'un ressort ne s'accroche pas à un nœud", () => {
    run_sequence(
      ["lonePivot"],
      [
        { kind: "place", tool: 1, target: 0, x: 0, y: 0 },
        { kind: "place", tool: 0, target: 0, x: 0, y: 0 },
        { kind: "connect", a: 9, partA: 2, b: 0, partB: 0 },
      ],
    );
  });

  it("deux engrenages du même axe ne s'engrènent pas", () => {
    run_sequence(
      ["gearOnAxle", "gearOnAxle"],
      [
        { kind: "connect", a: 2, partA: 0, b: 0, partB: 0 },
        { kind: "connect", a: 0, partA: 0, b: 20, partB: 0 },
        { kind: "connect", a: 0, partA: 0, b: 0, partB: 0 },
      ],
    );
  });
});
