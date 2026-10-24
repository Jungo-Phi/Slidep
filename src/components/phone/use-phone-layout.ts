import { useMediaQuery } from "@mui/material";
import { PHONE_LAYOUT } from "../../constants/layout-specs";

/**
 * Whether the screen calls for the phone layout: its smallest side is under `PHONE_LAYOUT.MAX_SIDE`, or its width under `PHONE_LAYOUT.MAX_WIDTH`.
 * The smallest side, so a phone turned landscape stays a phone; the width, so a tablet held upright or a narrow window gets the whole width for its canvas.
 * Read on the first render, so the app never mounts the other layout for a frame.
 */
export function usePhoneLayout(): boolean {
  const side = PHONE_LAYOUT.MAX_SIDE - 0.05;
  const width = PHONE_LAYOUT.MAX_WIDTH - 0.05;
  return useMediaQuery(`(max-width:${width}px), (max-height:${side}px)`, {
    noSsr: true,
  });
}
