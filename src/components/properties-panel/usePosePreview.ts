import React from "react";
import { ID, Link, Mechanism } from "../../types";
import { AnalysisModel } from "../solver/analysis-model";
import { animate_mode } from "../solver/mode-animation";
import { animate_strain } from "../solver/strain-animation";
import { ChainAnalysis } from "./useDofAnalysis";

/**
 * What the canvas is being asked to show instead of the resting pose, if anything.
 *
 * One state for both animations rather than one each: they write the same ref, and only one
 * of them can ever be right. A union makes that exclusive by construction.
 */
export type PosePreview =
  /** A degree of freedom, swung to and fro. */
  | { kind: "mode"; chainIndex: number; modeIndex: number }
  /** A redundant constraint, lied to until the mechanism strains against it. */
  | { kind: "strain"; chainIndex: number; owner: ID; link: Link }
  | null;

/**
 * Play `preview` on the canvas while it is pointed at.
 *
 * Publishes a pose per frame into `previewRef`, which the canvas reads instead of the resting
 * mechanism. Stopping restores the resting pose by clearing the ref — neither animation
 * touches the mechanism itself, so there is nothing to undo.
 *
 * `enabled` is what makes the feature coherent rather than conditional: it holds while the
 * mechanism is **still**, in edition or in a paused simulation. While the simulation plays,
 * the mechanism is already in motion and anything swung on top of it would say nothing —
 * which is why nothing needs to be said about it either.
 *
 * Returns whether something is actually playing. Not the same question as "is one pointed
 * at": a strain has nothing to show when the mechanism cannot answer the lie in any direction
 * anything can move, and a row that marked itself as playing then would be promising a
 * motion nobody is going to see.
 */
export function usePosePreview(
  previewRef: React.MutableRefObject<Mechanism | null>,
  mechanism: Mechanism,
  model: AnalysisModel | undefined,
  chains: ChainAnalysis[],
  preview: PosePreview,
  enabled: boolean,
): boolean {
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !preview || !model) return;
    const chain = chains[preview.chainIndex];
    if (!chain) return;

    const animation =
      preview.kind === "mode"
        ? mode_animation(mechanism, model, chain, preview.modeIndex)
        : animate_strain(mechanism, model, chain.chain, preview.link);
    if (!animation) return;
    setPlaying(true);

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
      setPlaying(false);
    };
  }, [previewRef, mechanism, model, chains, preview, enabled]);

  return playing;
}

const mode_animation = (
  mechanism: Mechanism,
  model: AnalysisModel,
  chain: ChainAnalysis,
  modeIndex: number,
) => {
  const mode = chain.modes[modeIndex];
  return mode ? animate_mode(mechanism, model, chain.chain, mode) : undefined;
};
