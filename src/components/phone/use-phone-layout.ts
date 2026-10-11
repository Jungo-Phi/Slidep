import { useMediaQuery } from "@mui/material";
import { PHONE_LAYOUT } from "../../constants/layout-specs";

/**
 * Whether the screen calls for the phone layout: its smallest side is under `PHONE_LAYOUT.MAX_SIDE`.
 * The smallest side and not the width, so a phone turned landscape stays a phone.
 * Read on the first render, so the app never mounts the other layout for a frame.
 */
export function usePhoneLayout(): boolean {
  const below = PHONE_LAYOUT.MAX_SIDE - 0.05;
  return useMediaQuery(`(max-width:${below}px), (max-height:${below}px)`, {
    noSsr: true,
  });
}
