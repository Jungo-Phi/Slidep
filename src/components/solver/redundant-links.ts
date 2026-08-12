/**
 * Which joints of an over-constrained chain say something another joint already said.
 *
 * `h` counts redundant constraint rows but names none of them. Leave-one-out does: drop one
 * link, measure the mobility again, and if it has not risen the link was holding nothing the
 * others were not already holding.
 *
 * **What this can and cannot say.** Two joints that repeat each other are *both* dispensable
 * and both come back in the list — the honest statement is "one of these is one too many",
 * never which one. And the test is per *link*, while `h` counts *rows*: a two-row joint with
 * one dependent row is not dispensable as a whole, so a chain can be hyperstatic with nothing
 * in this list. That outcome is a real answer, not a failure to find.
 *
 * Costs one mobility measurement per link, so it runs on demand and never on the edit path.
 */

import { ID, Link } from "../../types";
import { AnalysisChain, AnalysisModel } from "./analysis-model";
import { constraint_elements } from "./constraint-parts";
import { ChainMobility, probe_chain_mobility } from "./mobility-probe";

/** Every element the given constraints hold, canonical order. */
function held_elements(links: Link[]): ID[] {
  const held = new Set<ID>();
  for (const link of links)
    for (const id of constraint_elements(link)) held.add(id);
  return [...held].sort();
}

/**
 * The dispensable constraints of one element, shown as a single finding.
 *
 * Grouping by owner is what makes the answer readable. A belt is the case that forces it:
 * its no-slip law is one `BeltSegmentNoSlip` per strand, so a belt whose model repeats
 * itself reports a dozen links that a reader can do exactly nothing about individually —
 * the belt is the thing they drew, and the belt is what the panel names.
 */
export type RedundancyGroup = {
  owner: ID;
  links: Link[];
  /**
   * Everything the group's constraints hold, `owner` included.
   *
   * A constraint is between parts, and the owner is only the one the parser happened to
   * file it under: a joint's angle lock belongs as much to the beam it holds as to the node
   * holding it. Pointing at one side alone left the reader looking for what it was fighting.
   */
  elements: ID[];
};

export type Redundancy = {
  chainId: string;
  /**
   * Links that can each be removed on their own without freeing any motion.
   *
   * Candidates, not culprits: removing one fixes nothing about the others until it is
   * actually removed, and the list is generally longer than `h` — "dispensable" means
   * "takes part in some dependency", which on a heavily over-constrained chain is most of it.
   */
  links: Link[];
  /** The same links, by owning element, canonical order. This is what the panel lists. */
  groups: RedundancyGroup[];
  /** Solves spent. Reported so a caller can tell a slow answer from a stuck one. */
  solves: number;
};

/**
 * Find the dispensable links of one chain, at the model's current configuration.
 *
 * `mobility` must be the chain's own measurement — the comparison is against it, and
 * re-measuring it here would only risk answering against a different pose.
 */
export function find_redundant_links(
  model: AnalysisModel,
  chain: AnalysisChain,
  mobility: ChainMobility,
): Redundancy {
  const links: Link[] = [];
  let solves = 0;

  for (const link of chain.links) {
    // Grübler follows the link out: the probe's `m ≥ G` guard reads it, and leaving it
    // stale would send every dispensable link down the exhaustive fallback.
    const without: AnalysisChain = {
      ...chain,
      links: chain.links.filter((other) => other !== link),
      constraintRows: chain.constraintRows - link.ddl,
      grublerCount: chain.grublerCount + link.ddl,
    };
    const probed = probe_chain_mobility(model, without);
    solves += probed.solves;
    if (probed.mobility === mobility.mobility) links.push(link);
  }

  // An ownerless link is internal to the solver and has nothing to show the reader; it stays
  // in `links`, where a count still tells the truth, and out of the list.
  const byOwner = new Map<ID, Link[]>();
  for (const link of links) {
    if (link.owner === undefined) continue;
    const held = byOwner.get(link.owner);
    if (held) held.push(link);
    else byOwner.set(link.owner, [link]);
  }
  const groups = [...byOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, owned]) => ({
      owner,
      links: owned,
      elements: held_elements(owned),
    }));

  return { chainId: chain.id, links, groups, solves };
}
