import React from "react";
import { MechanicalElement, Mechanism } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  build_analysis_model,
} from "../solver/analysis/analysis-model";
import { ChainMobility, probe_mobility } from "../solver/analysis/mobility-probe";
import {
  canonical_modes,
  chain_highlight,
  MotionMode,
} from "../solver/analysis/motion-modes";
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
type Measurement = {
  mechanism: Mechanism;
  model: AnalysisModel;
  chains: ChainAnalysis[];
};

export type DofAnalysis = {
  /** The model the figures were measured on, or undefined before the first pass. */
  model: AnalysisModel | undefined;
  /**
   * The pose the model describes — which the debounce, and a playing simulation, let fall behind the one on screen.
   *
   * Handed out so an animation swings the mechanism the model actually knows: swinging the newer pose along an older model moves the chain from its earlier position and leaves everything else where it is, a hybrid pose belonging to no instant.
   */
  mechanism: Mechanism | undefined;
  chains: ChainAnalysis[];
  /** False until the first measurement lands — distinct from "measured, and empty". */
  ready: boolean;
};

/**
 * Measurements already made, by the element list they describe.
 *
 * Outliving the component is the point: the panel is mounted by its tab, so leaving it and coming back would otherwise re-measure a mechanism nobody has touched, and the figures would blink back in.
 * Keyed weakly, so a superseded edit's element list is collected with the entry that describes it.
 */
const MEASURED = new WeakMap<MechanicalElement[], Measurement>();

/**
 * How long a *change* must settle before it is measured.
 * First display never waits.
 *
 * Not the autosave's 1.5 s: that delay suits a background write nobody watches, whereas these figures answer the edit just made.
 * The measurement costs up to ~27 ms on the heaviest mechanism of the gallery — nothing at all once, too much per frame of a burst.
 */
const CHANGE_DEBOUNCE_MS = 200;

/**
 * Degrees of freedom of `mechanism`, per kinematic chain.
 *
 * Keyed on `mechanicalElements`, never on the mechanism itself: a viewport pan or zoom rebuilds the mechanism object every frame while leaving that array untouched, and the analysis reads nothing else — loads, metadata and history do not enter it.
 *
 * Only call it from a component mounted when the figures are on screen: the analysis runs the solver several times.
 * `AnalysisPanel` is mounted by its tab, so mounting is the gate.
 *
 * While `frozen`, nothing new is measured and the last figures stay on screen; the pose reached meanwhile is measured once it thaws.
 * A playing simulation freezes it: the pose changes at every instant, and a measurement landing between two of them blocks the display for hundreds of milliseconds on a large mechanism.
 * A first display is still measured, frozen or not: the panel must not open blank.
 */
export function useDofAnalysis(mechanism: Mechanism, frozen = false): DofAnalysis {
  const elements = mechanism.mechanicalElements;
  const cached = MEASURED.get(elements);
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);
  /** Kept so a change does not blank the panel while the next measurement runs. */
  const shown = React.useRef<Measurement | undefined>(undefined);

  // Any mechanism carrying this element list yields the same analysis, so reading the latest one at measurement time cannot pick up a mismatched pair.
  const latest = React.useRef(mechanism);
  latest.current = mechanism;

  React.useEffect(() => {
    const hit = MEASURED.get(elements);
    if (hit) {
      shown.current = hit;
      return;
    }
    if (frozen && shown.current !== undefined) return;
    const measure = () => {
      const measured = latest.current;
      const model = build_analysis_model(measured);
      const mobilities = probe_mobility(model);
      const result: Measurement = {
        mechanism: measured,
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
  }, [elements, frozen]);

  const measurement = cached ?? shown.current;
  return {
    model: measurement?.model,
    mechanism: measurement?.mechanism,
    chains: measurement?.chains ?? [],
    ready: measurement !== undefined,
  };
}
