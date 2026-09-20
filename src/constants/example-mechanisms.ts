/**
 * Mechanisms seeded into a fresh library (see `use-mechanism-library.ts`) and offered back by "Restore examples" if the user deletes one.
 * Each entry is a real exported `.slidep`, history already cleared — edit the asset file and re-export from the app rather than patching this list.
 */

import cantilever from "../assets/example-mechanisms/cantilever.slidep?raw";
import crankshaft from "../assets/example-mechanisms/crankshaft.slidep?raw";
import hoist from "../assets/example-mechanisms/hoist.slidep?raw";
import massSpringDamper from "../assets/example-mechanisms/mass-spring-damper.slidep?raw";
import jansensLinkage from "../assets/example-mechanisms/jansens-linkage.slidep?raw";
import { SerializedMechanism } from "../types";

export const EXAMPLE_MECHANISMS: SerializedMechanism[] = [
  cantilever,
  crankshaft,
  hoist,
  massSpringDamper,
  jansensLinkage,
].map((raw) => JSON.parse(raw));
