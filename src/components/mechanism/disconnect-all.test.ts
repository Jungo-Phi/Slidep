import { describe, expect, it } from "vitest";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import { MechanicalElement, Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { apply_actions } from "./apply-actions";
import {
  disconnect_all,
  get_connection_types,
  get_connections,
} from "./connect-actions";

const load = (json: string): Mechanism => load_mechanism(JSON.parse(json)).mechanism;
const issues = (mechanism: Mechanism) =>
  (validate_mechanism(mechanism) ?? []).map((issue) => issue.code);

/** What `element` is still linked to, its axle aside. */
const links = (element: MechanicalElement) =>
  get_connection_types(element)
    .filter(
      (type) => type !== "ConnectsParentAxle" && type !== "ConnectsFixedGears",
    )
    .flatMap((type) => get_connections(element, type));

describe.each(Object.entries({ huygens, jansen, poulie }))(
  "disconnecting every element of %s in turn",
  (_, json) => {
    const mechanism = load(json);

    it("leaves it linked to nothing, in a mechanism still valid", () => {
      for (const { id } of mechanism.mechanicalElements) {
        const actions = disconnect_all(
          id,
          mechanism.mechanicalElements,
          mechanism.constraintElements,
          mechanism.loads,
        );
        if (actions.length === 0) continue;
        const after = apply_actions(mechanism, actions);
        const element = after.mechanicalElements.find((el) => el.id === id)!;
        expect(links(element)).toEqual([]);
        expect(issues(after)).toEqual(issues(mechanism));
      }
    });
  },
);
