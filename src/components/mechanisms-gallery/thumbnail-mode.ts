import { MechanicalElement, Mechanism } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  build_analysis_model,
} from "../solver/analysis-model";
import { probe_chain_mobility } from "../solver/mobility-probe";
import { canonical_modes, MotionMode } from "../solver/motion-modes";

export type ThumbnailMode = {
  model: AnalysisModel;
  chain: AnalysisChain;
  mode: MotionMode;
};

/**
 * The first mode of a mechanism's first chain, for a gallery card to swing on hover — `null`
 * if the mechanism has no freedom to show.
 *
 * Cached per element list: hovering the same card twice costs nothing after the first time,
 * and cards nobody hovers never pay for an analysis nobody sees.
 */
const ANALYZED = new WeakMap<MechanicalElement[], ThumbnailMode | null>();

export function thumbnail_mode(mechanism: Mechanism): ThumbnailMode | null {
  const elements = mechanism.mechanicalElements;
  const cached = ANALYZED.get(elements);
  if (cached !== undefined) return cached;

  const model = build_analysis_model(mechanism);
  const chain = model.chains[0];
  const mode = chain
    ? canonical_modes(model, chain, probe_chain_mobility(model, chain))[0]
    : undefined;
  const result = chain && mode ? { model, chain, mode } : null;
  ANALYZED.set(elements, result);
  return result;
}
