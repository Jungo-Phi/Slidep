import React from "react";
import { Mechanism } from "../../types";
import { AnalysisModel } from "../solver/analysis-model";
import { animate_mode } from "../solver/mode-animation";
import { ChainAnalysis } from "./useDofAnalysis";

/** Which mode is being shown, if any. */
export type AnimatedMode = { chainIndex: number; modeIndex: number } | null;

/**
 * Swing the canvas along one motion mode while it is pointed at.
 *
 * Publishes a pose per frame into `previewRef`, which the canvas reads instead of the resting
 * mechanism. Stopping restores the resting pose by clearing the ref — the animation never
 * touches the mechanism itself, so there is nothing to undo.
 *
 * `mechanism` must be the very pose `model` was built from, not the one on screen: the two
 * part company for the length of the analysis's debounce, and swinging the newer one along
 * the older model would move the chain from where it used to be while leaving everything
 * else where it is.
 *
 * `enabled` is what makes the feature coherent rather than conditional: it holds while the
 * mechanism is **still**, in edition or in a paused simulation. While the simulation plays,
 * the mechanism is already in motion and a mode swinging on top of it would say nothing —
 * which is why nothing needs to be said about it either.
 */
export function useModeAnimation(
  previewRef: React.MutableRefObject<Mechanism | null>,
  mechanism: Mechanism | undefined,
  model: AnalysisModel | undefined,
  chains: ChainAnalysis[],
  animated: AnimatedMode,
  enabled: boolean,
): void {
  React.useEffect(() => {
    if (!enabled || !animated || !model || !mechanism) return;
    const chain = chains[animated.chainIndex];
    const mode = chain?.modes[animated.modeIndex];
    if (!chain || !mode) return;

    const animation = animate_mode(mechanism, model, chain.chain, mode);
    let frame = 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      // A tab left in the background hands back a huge delta; clamping keeps the swing
      // from jumping half a period on the frame the window comes back.
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      previewRef.current = animation.advance(dt);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      previewRef.current = null;
    };
  }, [previewRef, mechanism, model, chains, animated, enabled]);
}
