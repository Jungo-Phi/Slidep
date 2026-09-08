import { useCallback, useEffect, useRef, useState } from "react";
import { AppMode, BeamStressLens } from "../../types";
import { HOVER_PREVIEW_DELAY_MS } from "../../constants/interaction-specs";

/**
 * The beam-fill lens the "Afficher" menu is trying on — the one hovered, not the one chosen, and `null` whenever the canvas is showing the chosen one.
 * Only the drawing reads it: the menu's own tick and the stored choice stay on what was actually picked.
 *
 * Armed in dynamic mode alone, where a cohesion field exists to colour: elsewhere the lens is armed for the run to come rather than drawn, so trying one on would repaint the canvas identically.
 */
export function useStressLensPreview(appMode: AppMode) {
  const [previewLens, setPreviewLens] = useState<BeamStressLens | null>(null);
  const previewTimer = useRef<number | null>(null);

  /** Arms the preview, or — with `null` — disarms it and drops the one showing.
   * The pointer must dwell: a lens swept over on the way to another is not a lens asked for. */
  const previewLensLater = useCallback(
    (lens: BeamStressLens | null) => {
      if (previewTimer.current !== null) clearTimeout(previewTimer.current);
      if (lens === null || appMode !== "dynamic") {
        previewTimer.current = null;
        setPreviewLens(null);
        return;
      }
      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null;
        setPreviewLens(lens);
      }, HOVER_PREVIEW_DELAY_MS);
    },
    [appMode],
  );

  // Leaving dynamic mode takes a showing preview down with it, without waiting for the pointer to move.
  useEffect(() => {
    if (appMode !== "dynamic") previewLensLater(null);
  }, [appMode, previewLensLater]);

  useEffect(
    () => () => {
      if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    },
    [],
  );

  return { previewLens, previewLensLater };
}
