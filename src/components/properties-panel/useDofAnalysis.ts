import React from "react";
import { MechanicalElement, Mechanism } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  build_analysis_model,
} from "../solver/analysis-model";
import { ChainMobility, probe_mobility } from "../solver/mobility-probe";
import {
  canonical_modes,
  chain_highlight,
  MotionMode,
} from "../solver/motion-modes";
import { ID } from "../../types";

/** One chain, with what the counting says, what the solver measured, and the motions it found. */
export type ChainAnalysis = {
  chain: AnalysisChain;
  mobility: ChainMobility;
  modes: MotionMode[];
  /** Elements to light when the chain is pointed at: the union of its modes'. */
  highlight: ID[];
};

/** Everything one measurement produced, kept together: animating a mode needs the model too. */
type Measurement = { model: AnalysisModel; chains: ChainAnalysis[] };

export type DofAnalysis = {
  /** The model the figures were measured on, or undefined before the first pass. */
  model: AnalysisModel | undefined;
  chains: ChainAnalysis[];
  /** False until the first measurement lands — distinct from "measured, and empty". */
  ready: boolean;
};

/**
 * Measurements already made, by the element list they describe.
 *
 * Outliving the component is the point: the panel is mounted by its tab, so leaving it and
 * coming back would otherwise re-measure a mechanism nobody has touched, and the figures
 * would blink back in. Keyed weakly, so a superseded edit's element list is collected with
 * the entry that describes it.
 */
const MEASURED = new WeakMap<MechanicalElement[], Measurement>();

/**
 * How long a *change* must settle before it is measured. First display never waits.
 *
 * Not the autosave's 1.5 s: that delay suits a background write nobody watches, whereas
 * these figures answer the edit just made. The measurement costs up to ~27 ms on the
 * heaviest mechanism of the gallery — nothing at all once, too much per frame of a burst.
 */
const CHANGE_DEBOUNCE_MS = 200;

/**
 * Degrees of freedom of `mechanism`, per kinematic chain.
 *
 * Keyed on `mechanicalElements`, never on the mechanism itself: a viewport pan or zoom
 * rebuilds the mechanism object every frame while leaving that array untouched, and the
 * analysis reads nothing else — loads, metadata and history do not enter it.
 *
 * Only call it from a component mounted when the figures are on screen: the analysis runs
 * the solver several times. `AnalysisPanel` is mounted by its tab, so mounting is the gate.
 */
export function useDofAnalysis(mechanism: Mechanism): DofAnalysis {
  const elements = mechanism.mechanicalElements;
  const cached = MEASURED.get(elements);
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);
  /** Kept so a change does not blank the panel while the next measurement runs. */
  const shown = React.useRef<Measurement | undefined>(undefined);

  // Any mechanism carrying this element list yields the same analysis, so reading the
  // latest one at measurement time cannot pick up a mismatched pair.
  const latest = React.useRef(mechanism);
  latest.current = mechanism;

  React.useEffect(() => {
    const hit = MEASURED.get(elements);
    if (hit) {
      shown.current = hit;
      return;
    }
    const measure = () => {
      const model = build_analysis_model(latest.current);
      const mobilities = probe_mobility(model);
      const result: Measurement = {
        model,
        chains: model.chains.map((chain, i) => {
          const modes = canonical_modes(model, chain, mobilities[i]);
          return {
            chain,
            mobility: mobilities[i],
            modes,
            highlight: chain_highlight(chain, modes),
          };
        }),
      };
      MEASURED.set(elements, result);
      shown.current = result;
      redraw();
    };
    // Nothing on screen yet — the tab must not open on a blank panel and then fill in.
    if (shown.current === undefined) {
      measure();
      return;
    }
    const timer = setTimeout(measure, CHANGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [elements]);

  const measurement = cached ?? shown.current;
  return {
    model: measurement?.model,
    chains: measurement?.chains ?? [],
    ready: measurement !== undefined,
  };
}
