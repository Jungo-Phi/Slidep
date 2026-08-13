/**
 * The model the degrees-of-freedom analysis reads, derived from the simulation's own.
 *
 * Answers, for a mechanism: which variables are free, which links actually constrain them,
 * and how both split into independent kinematic chains. It stops at the counting level —
 * `grublerCount` is `m − h`, a lower bound on mobility, not the mobility itself. Measuring
 * `m` needs the solver (see the mobility probe); this module is what the probe runs on.
 *
 * Built on `compile_simulation_model`, never on the raw parsing: without the belt no-slip
 * links a belt transmits nothing, and the counts drift by up to 16 on a Core XY.
 */

import { ID, KinNodes, Link, Mechanism } from "../../types";
import {
  compile_simulation_model,
  rewire_belts,
  SimulationModel,
} from "./kinematic-simulation";

/** Why a link was dropped from the analysis. */
export type PruneReason =
  /** Every variable it touches is anchored, so it constrains nothing. */
  | "inert"
  /**
   * Redundant by construction — present for solver conditioning, adds no rank.
   * `BeltSubChainAggregate`, and one strand law per closed belt loop.
   */
  | "conditioning"
  /** A driver, not a joint: counted separately. */
  | "driver"
  /** Transient (grab) or soft (spring). */
  | "transient";

export type PrunedLink = { link: Link; reason: PruneReason };

/**
 * One independent kinematic chain: a connected group of free variables, and the links
 * that constrain them. Moving a chain never moves another.
 */
export type AnalysisChain = {
  /** First variable key in canonical order — stable across edits that leave the chain intact. */
  id: string;
  /** This chain's free variable keys, canonical order. A gear appears twice: its centre and its angle share a key. */
  variableKeys: string[];
  /**
   * This chain's scalar unknowns, canonical order.
   *
   * Carried rather than re-derived from `variableKeys`, because that key alone cannot say
   * which it is: a gear's centre and its angle are both filed under the bare gear id, so
   * reading the kind back off the key drops one of the two.
   */
  variables: Variable[];
  /** 2 per free position, 1 per angle. */
  freeVariables: number;
  links: Link[];
  /** Σ ddl over `links`: the number of constraint rows. */
  constraintRows: number;
  /** Drivers acting on this chain. */
  motors: Link[];
  /** Whether any of its links reaches the frame. A chain that does not will drift. */
  grounded: boolean;
  /** `m − h`. Mobility is at least this — never less (see the mobility probe's guard). */
  grublerCount: number;
  /**
   * The chain's own parts: those holding one of its free variables, plus its motors.
   *
   * What a highlight shows. The rest of the frame is left out on purpose: every chain hangs
   * off the same anchors, so including them said nothing about which chain was pointed at
   * and lit up most of the mechanism. Motors are the exception — they are what the reader
   * reaches for, and every mode of the chain names one.
   *
   * Contains the union of its modes' `moves` by construction, since a mode moves a subset of
   * these variables and is driven by a subset of these motors.
   */
  elements: ID[];
};

/**
 * One scalar unknown. `key` indexes the solver's own maps, so it stays in the raw (fused)
 * form; the ORDER of `variableOrder` is what is canonical, not the spelling of the keys.
 */
export type Variable = { key: string; component: "x" | "y" | "angle" };

export type AnalysisModel = {
  nodes: KinNodes;
  /** Links that carry a constraint on a free variable. */
  links: Link[];
  pruned: PrunedLink[];
  anchored: Set<string>;
  /** Every free variable, canonical order: positions (x then y) then angles. */
  variableOrder: Variable[];
  chains: AnalysisChain[];
  /** Lever arm of each angle DOF: what one radian of it is worth in millimetres. */
  gearRadii: Map<ID, number>;
};

/**
 * Every variable key a link touches, positions and angles alike.
 *
 * Distinct from `keys_of`, which feeds `sort_links` and only ever needed position keys —
 * widening it there would reorder the solver's sweep. `analysis-model.test.ts` asserts this
 * one covers `keys_of` on every link type, so the two cannot drift apart unnoticed.
 */
export function variable_keys_of(link: Link): string[] {
  switch (link.type) {
    case "Radius":
      return [link.key1];
    case "Coincidence":
    case "Distance":
    case "MinDistance":
    case "Spring":
    case "Horizontal":
    case "Vertical":
    case "GearMeshing":
    case "GearRatio":
    case "KeepOrientation":
      return [link.key1, link.key2];
    case "DistanceToLine":
    case "SlideOnSegment":
    case "FixedOnSegment":
      return [link.key1, link.key2, link.key3];
    case "Angle":
    case "Normal":
    case "Parallel":
    case "EqualLength":
      return [link.key1, link.key2, link.key3, link.key4];
    case "MotorBeam":
      return link.anchorKey === undefined
        ? [link.pivotKey, link.drivenKey]
        : [link.pivotKey, link.drivenKey, link.anchorKey];
    case "MotorAngle":
      return link.anchorPivotKey === undefined || link.anchorKey === undefined
        ? [link.angleKey]
        : [link.angleKey, link.anchorPivotKey, link.anchorKey];
    case "GearMeshAngle":
      return [link.angleKey1, link.angleKey2, link.posKey1, link.posKey2];
    case "CoaxialAngle":
      return [link.angleKey1, link.angleKey2];
    case "GearPerimeterPin":
      return [link.nodeKey, link.centerKey, link.angleKey];
    case "BeamFollowsAngle":
      return [link.pivotKey, link.drivenKey, link.angleKey];
    case "BeltLength":
      return [
        link.startKey,
        link.endKey,
        ...link.gearPosKeys,
        ...link.gearAngleKeys,
      ];
    case "BeltJunction":
      return [link.nodeKey, ...link.gearPosKeys];
    case "BeltPin":
      return [
        link.nodeKey,
        ...link.gearPosKeys,
        ...link.gearAngleKeys,
        link.refAngleKey,
      ];
    case "BeltFollowsTangent":
      return [
        link.pivotKey,
        link.drivenKey,
        ...link.gearPosKeys,
        ...link.gearAngleKeys,
        link.refAngleKey,
      ];
    case "BeltSegmentNoSlip":
      return [
        link.posKeyA,
        link.posKeyB,
        ...(link.angleKeyA ? [link.angleKeyA] : []),
        ...(link.angleKeyB ? [link.angleKeyB] : []),
      ];
    case "BeltSubChainAggregate":
      return [
        ...link.gearPosKeys,
        ...(link.startKey ? [link.startKey] : []),
        ...(link.endKey ? [link.endKey] : []),
        ...(link.angleKeyStart ? [link.angleKeyStart] : []),
        ...(link.angleKeyEnd ? [link.angleKeyEnd] : []),
      ];
    case "HandleGrab":
      return [link.grabbedKey];
  }
}

const is_driver = (l: Link) =>
  l.type === "MotorBeam" || l.type === "MotorAngle";

/**
 * One strand law per **closed** belt: the loop's own redundancy, not the design's.
 *
 * Each strand of a belt carries a no-slip law tying two consecutive pulleys. Walk a closed
 * loop and those laws compose back into the identity, so `N` strands only ever carry `N − 1`
 * independent rows. Counted whole they invent one degree of hyperstaticity per belt, which
 * the panel would then report on a perfectly sound mechanism — measured on four of the
 * gallery's belt drives, and each of them falls to `h = 0` once this row is dropped, with
 * the mobility unchanged.
 *
 * Same family as `BeltSubChainAggregate`: the solver wants every strand for conditioning,
 * the rank count must not have them all. Open belts have no loop to close and keep theirs.
 *
 * Which one goes is decided by `segIndex`, a property of the belt's own geometry — never by
 * the order links happen to be parsed in.
 */
function closed_loop_surplus(links: Link[]): Set<Link> {
  const strongest = new Map<ID, Link & { type: "BeltSegmentNoSlip" }>();
  for (const link of links) {
    if (link.type !== "BeltSegmentNoSlip" || !link.closed) continue;
    if (link.owner === undefined) continue;
    const held = strongest.get(link.owner);
    if (!held || link.segIndex > held.segIndex) strongest.set(link.owner, link);
  }
  return new Set(strongest.values());
}

/**
 * Carry a belt's lost pulleys into the freshly compiled model.
 *
 * `compile_simulation_model` always builds a belt whole: which pulleys it has come off is
 * simulation state, seeded from a snapshot rather than something a mechanism carries into a
 * compile. The analysis, though, reads the pose on screen — which in a paused recording is
 * one where the belt may run straight past a pulley. Keeping that pulley's strand law both
 * hides the freedom the belt has just released and constrains an angle nothing touches any
 * more: measured on `Déconnexion courroie`, `m = 1` where the mechanism plainly has 2.
 *
 * Rewired through the simulation's own `rewire_belts`, not by a rule of our own: the strands
 * of a shortened belt are rebuilt and re-baked, never patched, and the analysis has no
 * business holding a second opinion on what a belt is.
 */
function apply_belt_disconnections(
  mechanism: Mechanism,
  model: SimulationModel,
): void {
  const dropped = new Map<ID, Set<number>>();
  for (const element of mechanism.mechanicalElements)
    if (element.type === "belt" && element.disconnectedGearIndices?.length)
      dropped.set(element.id, new Set(element.disconnectedGearIndices));
  if (dropped.size === 0) return;

  const detached: Extract<Link, { type: "BeltLength" }>[] = [];
  for (const link of model.links) {
    if (link.type !== "BeltLength" || link.owner === undefined) continue;
    const off = dropped.get(link.owner);
    if (!off) continue;
    // `gearPosKeys` keeps the order and length of `attachedGearsIDs`, which is what the
    // element's indices name — coincidence fusion rewrites the keys, never their order.
    link.disconnected = link.gearPosKeys.map((_, i) => off.has(i));
    detached.push(link);
  }
  rewire_belts(model, detached);
}

/**
 * Canonical form of a solver key.
 *
 * Coincidence fusion names a merged node by joining its parts in the order the links were
 * parsed, so the same mechanism loaded with its elements in another order yields a
 * different *string* for the same node. Sorting the parts makes the name depend on the
 * node alone. Never use it to read `nodes` — only to order and to identify.
 */
export function canonical_key(key: string): string {
  return key.includes(",") ? key.split(",").sort().join(",") : key;
}

/** Elements a variable key belongs to. A fused key names each of its parts; a `:start` / `:end` suffix names the edge. */
export function elements_of_key(key: string): ID[] {
  return key.split(",").map((part) => part.split(":")[0] as ID);
}

/** Union-find over free variable keys. */
class Partition {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression, so a long chain is not walked twice.
    let walk = key;
    while (this.parent.get(walk) !== root) {
      const next = this.parent.get(walk)!;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Build the analysis model for a mechanism at its current configuration.
 *
 * The chain graph spans **free variables only**: an anchored node is not a variable, so it
 * is not a vertex, and two assemblies that merely hang off the same frame stay separate —
 * which is what independence means here, since moving one does not move the other. A
 * grounded node shared by two assemblies therefore splits them rather than joining them.
 *
 * Its edges are the links, **and the elements**: a part is one body, so the unknowns filed
 * under it belong together even where no link ties them. That is the only thing holding a
 * gear's spin to its own centre.
 *
 * A group with no free variable at all — a beam pinned to the frame at both ends, a lone
 * grounded join nothing else touches — still gets its own chain: trivial (`DDL = 0`,
 * nothing to probe), but present. An element the file holds is never left unaccounted for.
 *
 * Canonical throughout: keys are sorted, and fused keys are compared through
 * `canonical_key`, so two loads of the same mechanism produce the same model.
 */
export function build_analysis_model(mechanism: Mechanism): AnalysisModel {
  const compiled = compile_simulation_model(mechanism);
  apply_belt_disconnections(mechanism, compiled);
  const { nodes, links: allLinks, gearRadii } = compiled;

  const anchored = new Set(
    [...nodes.posMasses.entries()]
      .filter(([, mass]) => mass === 0)
      .map(([key]) => key),
  );
  const isVariable = (key: string) =>
    nodes.positions.has(key) || nodes.angles.has(key);
  const isFree = (key: string) => isVariable(key) && !anchored.has(key);
  const byCanonical = (a: string, b: string) =>
    canonical_key(a).localeCompare(canonical_key(b));

  // ── Split the links: what constrains a free variable, and what does not ──
  const links: Link[] = [];
  const pruned: PrunedLink[] = [];
  const loopSurplus = closed_loop_surplus(allLinks);
  for (const link of allLinks) {
    if (is_driver(link)) {
      pruned.push({ link, reason: "driver" });
      continue;
    }
    if (link.type === "HandleGrab" || link.ddl === 0) {
      pruned.push({ link, reason: "transient" });
      continue;
    }
    if (link.type === "BeltSubChainAggregate" || loopSurplus.has(link)) {
      pruned.push({ link, reason: "conditioning" });
      continue;
    }
    // Angles are never anchored, so a link touching one is never inert — testing
    // positions alone would drop a GearMeshAngle between two grounded axles.
    const keys = variable_keys_of(link).filter(isVariable);
    if (keys.length > 0 && keys.every((key) => anchored.has(key)))
      pruned.push({ link, reason: "inert" });
    else links.push(link);
  }

  // ── Canonical variable order ─────────────────────────────────────────────
  const freePositions = [...nodes.positions.keys()]
    .filter(isFree)
    .sort(byCanonical);
  const angleKeys = [...nodes.angles.keys()].sort(byCanonical);
  const variableOrder: Variable[] = [
    ...freePositions.flatMap((key): Variable[] => [
      { key, component: "x" },
      { key, component: "y" },
    ]),
    ...angleKeys.map((key): Variable => ({ key, component: "angle" })),
  ];

  // ── Which keys each element owns ─────────────────────────────────────────
  // A part is one body whatever the solver files under it, and links are not the only
  // thing that ties its unknowns together: nothing constrains a gear's spin to its own
  // centre, yet a gear carried by a chain is not a mechanism of its own.
  const keysByElement = new Map<ID, { free: string[]; anchored: string[] }>();
  // Which list a key goes in is the caller's to say, never read back off the key: a gear's
  // centre and its spin share one bare id, so a grounded gear would file its free angle as
  // anchored.
  const noteKey = (key: string, into: "free" | "anchored") => {
    for (const el of elements_of_key(key)) {
      let held = keysByElement.get(el);
      if (!held) keysByElement.set(el, (held = { free: [], anchored: [] }));
      held[into].push(key);
    }
  };
  for (const key of freePositions) noteKey(key, "free");
  for (const key of angleKeys) noteKey(key, "free");
  for (const key of anchored) noteKey(key, "anchored");

  // ── Partition the free variables into chains ─────────────────────────────
  const partition = new Partition();
  for (const key of freePositions) partition.add(key);
  for (const key of angleKeys) partition.add(key);
  for (const link of links) {
    const free = variable_keys_of(link).filter(isFree);
    for (let i = 1; i < free.length; i++) partition.union(free[0], free[i]);
  }
  for (const { free } of keysByElement.values())
    for (let i = 1; i < free.length; i++) partition.union(free[0], free[i]);

  // ── Partition the anchored keys among themselves, via the rigidity welds that
  // pruned their links as inert ────────────────────────────────────────────
  // A key entirely pinned to the frame carries no mobility, but a group of them welded
  // together — a beam between two grounded joins, say — is still a physical object the
  // file holds. This is what lets it keep its own identity instead of dissolving.
  const anchoredPartition = new Partition();
  for (const key of anchored) anchoredPartition.add(key);
  for (const { link, reason } of pruned) {
    if (reason !== "inert") continue;
    const keys = variable_keys_of(link).filter(isVariable);
    for (let i = 1; i < keys.length; i++)
      anchoredPartition.union(keys[0], keys[i]);
  }

  type Bucket = {
    variableKeys: string[];
    variables: Variable[];
    freeVariables: number;
    links: Link[];
    motors: Link[];
    grounded: boolean;
    elements: Set<ID>;
  };
  const buckets = new Map<string, Bucket>();
  const bucketOf = (root: string): Bucket => {
    let bucket = buckets.get(root);
    if (!bucket)
      buckets.set(
        root,
        (bucket = {
          variableKeys: [],
          variables: [],
          freeVariables: 0,
          links: [],
          motors: [],
          grounded: false,
          elements: new Set(),
        }),
      );
    return bucket;
  };

  for (const key of freePositions) {
    const bucket = bucketOf(partition.find(key));
    bucket.variableKeys.push(key);
    bucket.variables.push({ key, component: "x" }, { key, component: "y" });
    bucket.freeVariables += 2;
    for (const el of elements_of_key(key)) bucket.elements.add(el);
  }
  for (const key of angleKeys) {
    const bucket = bucketOf(partition.find(key));
    bucket.variableKeys.push(key);
    bucket.variables.push({ key, component: "angle" });
    bucket.freeVariables += 1;
    for (const el of elements_of_key(key)) bucket.elements.add(el);
  }

  // Anchored keys directly reached by a link that also touches a free variable,
  // mapped to that chain's root.
  const claimedAnchors = new Map<string, string>();
  for (const link of links) {
    const keys = variable_keys_of(link).filter(isVariable);
    const free = keys.filter(isFree);
    if (free.length === 0) continue;
    const root = partition.find(free[0]);
    for (const key of keys)
      if (anchored.has(key)) claimedAnchors.set(key, root);
  }

  // An element holding a free key and an anchored one is mounted on the frame, whether or
  // not a link says so: a gear pinned to a grounded axle spins freely, and its chain is
  // held all the same. Without this the spin reads as an unanchored chain adrift, next to
  // a second, trivial one for the axle it turns on.
  for (const { free, anchored: pinned } of keysByElement.values()) {
    if (free.length === 0 || pinned.length === 0) continue;
    const root = partition.find(free[0]);
    bucketOf(root).grounded = true;
    for (const key of pinned) claimedAnchors.set(key, root);
  }

  // A claim on one member of a welded anchored group covers the whole group: it is
  // one physical object, reached from a free chain wherever it touches it. A join
  // fixed to the middle of an otherwise-moving beam, say, is only ever mentioned
  // together with the beam's two (also anchored) ends — its `FixedOnSegment` is
  // itself inert — so it is never directly claimed, only through this propagation.
  // Everything left unclaimed after it is genuinely spoken for by no free chain.
  const claimedGroups = new Map<string, string>();
  for (const [key, root] of claimedAnchors)
    claimedGroups.set(anchoredPartition.find(key), root);

  // Unclaimed anchored groups: no free variable anywhere in them, so nothing above
  // ever visits them. Each becomes its own short, indicative chain — DDL = 0, nothing
  // to probe, just the fact that it is there and going nowhere.
  for (const key of anchored) {
    if (claimedGroups.has(anchoredPartition.find(key))) continue;
    const bucket = bucketOf(`anchor:${anchoredPartition.find(key)}`);
    bucket.grounded = true;
    for (const el of elements_of_key(key)) bucket.elements.add(el);
  }

  /** A link belongs to the chain of the free variables it touches, and grounds it when it also touches an anchor. */
  const assign = (link: Link, into: (bucket: Bucket) => void) => {
    const keys = variable_keys_of(link).filter(isVariable);
    const free = keys.filter(isFree);
    if (free.length > 0) {
      const bucket = bucketOf(partition.find(free[0]));
      if (keys.some((key) => anchored.has(key))) bucket.grounded = true;
      into(bucket);
      return;
    }
    // Nothing free here: the link still belongs to whichever anchored group it
    // touches, claimed or not — a motor turning a pivot welded only to the frame,
    // say, must not be dropped just because that pivot owns no free variable.
    const anchorKey = keys.find((key) => anchored.has(key));
    if (anchorKey === undefined) return;
    const claimedRoot = claimedGroups.get(anchoredPartition.find(anchorKey));
    const bucket = claimedRoot
      ? bucketOf(claimedRoot)
      : bucketOf(`anchor:${anchoredPartition.find(anchorKey)}`);
    bucket.grounded = true;
    into(bucket);
  };
  for (const link of links)
    assign(link, (bucket) => bucket.links.push(link));
  for (const { link } of pruned.filter((p) => p.reason === "driver"))
    assign(link, (bucket) => {
      bucket.motors.push(link);
      // A motor turns about an anchored pivot, so it owns no free variable of its own.
      if (link.owner !== undefined) bucket.elements.add(link.owner);
    });

  const chains: AnalysisChain[] = [...buckets.values()]
    .map((bucket) => {
      const constraintRows = bucket.links.reduce((sum, l) => sum + l.ddl, 0);
      const elements = [...bucket.elements].sort();
      return {
        // A trivial chain owns no variable to name it after — its first element does,
        // under a prefix, since that element may well hold a free variable elsewhere and
        // two chains sharing an id would share a React key and a cached audit.
        id: bucket.variableKeys[0]
          ? canonical_key(bucket.variableKeys[0])
          : `anchor:${elements[0] ?? ""}`,
        variableKeys: bucket.variableKeys,
        variables: bucket.variables,
        freeVariables: bucket.freeVariables,
        links: bucket.links,
        constraintRows,
        motors: bucket.motors,
        grounded: bucket.grounded,
        grublerCount: bucket.freeVariables - constraintRows,
        elements,
      };
    })
    // A chain with a variable to report first — grounded before floating, largest
    // before small — and every trivial, fully anchored group last: it is there for
    // completeness, not because it is what the design is about.
    .sort(
      (a, b) =>
        Number(a.freeVariables === 0) - Number(b.freeVariables === 0) ||
        Number(b.grounded) - Number(a.grounded) ||
        b.freeVariables - a.freeVariables ||
        a.id.localeCompare(b.id),
    );

  return { nodes, links, pruned, anchored, variableOrder, chains, gearRadii };
}
