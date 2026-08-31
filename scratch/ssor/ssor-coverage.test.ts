import { describe, it } from "vitest";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { compile_simulation_model } from "../../src/components/solver/simulation-engine";

/**
 * Does per-chain classification ever actually SPLIT a mechanism? If every mechanism is
 * either wholly tree or wholly loop, "per chain" collapses to "alternate iff this
 * mechanism has no closed belt", and the union-find plumbing buys nothing.
 */
describe("SSOR coverage", () => {
  it("gallery", () => {
    const dir = resolve(__dirname, "../../test-mechanisms");
    const lines = ["### couverture par chaîne — galerie complète"];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".slidep"))) {
      let row: string;
      try {
        const mech = load_mechanism(
          JSON.parse(readFileSync(resolve(dir, file), "utf8")),
        ).mechanism;
        const model = compile_simulation_model(mech);
        const links = model.links;
        const tagged = links.filter(
          (l) => (l as unknown as Record<string, unknown>).ssorAlternate,
        ).length;
        // Untagged is NOT the same as "in a loop": a link every one of whose keys is
        // anchored holds no free key either, so it reads untagged too. Only a mechanism
        // that actually carries closed-belt machinery can be untagged FOR that reason.
        const belts = mech.mechanicalElements.filter(
          (e) => e.type === "belt" && e.closed,
        ).length;
        // Does the constraint graph over free keys carry a cycle? Union-find over the keys
        // each link names: an edge joining two keys already in the same set closes a loop.
        // Answers whether the gallery exercises "closed loop, no belt" at all.
        const parent = new Map<string, string>();
        const find = (k: string): string => {
          let r = parent.get(k) ?? k;
          if (r !== k) {
            r = find(r);
            parent.set(k, r);
          }
          return r;
        };
        let cyclic = false;
        for (const link of links) {
          const keys = [
            ...new Set(
              Object.entries(link as unknown as Record<string, unknown>)
                .filter(([k, v]) => /^key\d|Key$/.test(k) && typeof v === "string")
                .map(([, v]) => v as string)
                .filter((k) => model.nodes.posMasses.get(k) !== 0),
            ),
          ];
          for (let i = 1; i < keys.length; i++) {
            const a = find(keys[0]);
            const b = find(keys[i]);
            if (a === b) cyclic = true;
            else parent.set(a, b);
          }
        }
        row = `${file}\tliens=${links.length}\talternés=${tagged}\tcourroiesFermées=${belts}\tboucle=${cyclic ? "OUI" : "non"}`;
      } catch (e) {
        row = `${file}\tERREUR ${(e as Error).message.slice(0, 60)}`;
      }
      lines.push(row);
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 300_000);
});
