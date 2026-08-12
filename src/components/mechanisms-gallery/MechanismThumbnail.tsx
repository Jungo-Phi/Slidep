import React, { useEffect, useMemo, useRef } from "react";
import { Box, useTheme } from "@mui/material";
import { SerializedMechanism } from "../../types";
import { load_mechanism } from "../../utils";
import { draw_thumbnail } from "../canvas/render-thumbnail";
import { animate_mode } from "../solver/mode-animation";
import { THUMBNAIL_MODE_ANIMATION } from "../../constants/rendering-specs";
import { thumbnail_mode } from "./thumbnail-mode";

/** Résolution du rendu, en 4:3. Bien au-dessus de la taille d'affichage, pour
 *  rester net sur un écran à forte densité. */
const RENDER_WIDTH = 512;
const RENDER_HEIGHT = 512;

interface MechanismThumbnailProps {
  record: SerializedMechanism;
  /** Swings the mechanism along its first mode while true; a mechanism with no
   *  freedom simply stays put. */
  hovered: boolean;
}

/**
 * Miniature d'un mécanisme, redessinée plutôt que chargée depuis une image
 * stockée : elle suit donc le thème courant, et la sauvegarde n'a plus à encoder
 * quoi que ce soit.
 */
export const MechanismThumbnail: React.FC<MechanismThumbnailProps> = ({
  record,
  hovered,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Redessiner quand le thème change : les couleurs du dessin en dépendent.
  const theme = useTheme();
  // Repairs silently: a card is no place to report damage, but a broken record
  // must not take the gallery down with it.
  const mechanism = useMemo(() => load_mechanism(record).mechanism, [record]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const rest = () => {
      ctx.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
      draw_thumbnail(ctx, mechanism, RENDER_WIDTH, RENDER_HEIGHT);
    };

    const found = hovered ? thumbnail_mode(mechanism) : null;
    if (!found) {
      rest();
      return;
    }

    const animation = animate_mode(
      mechanism,
      found.model,
      found.chain,
      found.mode,
      {
        amplitudeRatio: THUMBNAIL_MODE_ANIMATION.AMPLITUDE_RATIO,
        periodS: THUMBNAIL_MODE_ANIMATION.PERIOD_S,
      },
    );
    let frame = 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      // A tab left in the background hands back a huge delta; clamping keeps the
      // swing from jumping half a period on the frame the window comes back.
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      ctx.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
      draw_thumbnail(ctx, animation.advance(dt), RENDER_WIDTH, RENDER_HEIGHT);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [mechanism, theme, hovered]);

  return (
    // The ground the drawing sits on, as on the canvas itself: a preview is a
    // small view of the app's own surface, not of the card carrying it.
    <Box
      sx={{
        position: "relative",
        paddingTop: "100%",
        backgroundColor: "background.default",
      }}
    >
      {/* A plain <canvas>, not a Box: MUI would swallow `width`/`height` as
          style props, leaving the bitmap at its default 300×150 while the
          drawing code frames for RENDER_WIDTH/RENDER_HEIGHT — the drawing
          would be cropped. */}
      <canvas
        ref={canvasRef}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </Box>
  );
};

export default MechanismThumbnail;
