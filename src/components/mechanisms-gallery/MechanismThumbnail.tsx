import React, { useEffect, useMemo, useRef } from "react";
import { Box, useTheme } from "@mui/material";
import { SerializedMechanism } from "../../types";
import { deserialize_mechanism } from "../../utils";
import { draw_thumbnail } from "../canvas/render-thumbnail";

/** Résolution du rendu. Bien au-dessus de la taille d'affichage, pour rester net
 *  sur un écran à forte densité. */
const RENDER_SIZE = 512;

interface MechanismThumbnailProps {
  record: SerializedMechanism;
}

/**
 * Miniature d'un mécanisme, redessinée plutôt que chargée depuis une image
 * stockée : elle suit donc le thème courant, et la sauvegarde n'a plus à encoder
 * quoi que ce soit.
 */
export const MechanismThumbnail: React.FC<MechanismThumbnailProps> = ({
  record,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Redessiner quand le thème change : les couleurs du dessin en dépendent.
  const theme = useTheme();
  const mechanism = useMemo(() => deserialize_mechanism(record), [record]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    draw_thumbnail(ctx, mechanism, RENDER_SIZE);
  }, [mechanism, theme]);

  return (
    <Box sx={{ position: "relative", paddingTop: "100%" }}>
      {/* A plain <canvas>, not a Box: MUI would swallow `width`/`height` as
          style props, leaving the bitmap at its default 300×150 while the
          drawing code frames for RENDER_SIZE — the drawing would be cropped. */}
      <canvas
        ref={canvasRef}
        width={RENDER_SIZE}
        height={RENDER_SIZE}
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
