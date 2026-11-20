import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import { INTERACTION_SPECS } from "../../constants/interaction-specs";

/**
 * The dress of a control standing on the canvas — the offer to link a paste, the ruler's button, the corner button of a phone, the panel's folded tabs.
 * Paper let slightly through and a halo of the ground, so it reads over the mechanism as the constraint badges do.
 */
export const CANVAS_CONTROL_SX: SystemStyleObject<Theme> = {
  color: "text.primary",
  backgroundColor: "badge.fill",
  boxShadow: (theme) =>
    `0 0 ${INTERACTION_SPECS.ICON_HALO_SIZE}px ${theme.palette.background.default}`,
  transition: "background-color 120ms",
  // A veil laid over the paper rather than in its place, which would let the canvas through.
  "&:hover, &.Mui-focusVisible": {
    backgroundColor: "badge.fill",
    backgroundImage: (theme) =>
      `linear-gradient(${theme.palette.action.hover}, ${theme.palette.action.hover})`,
  },
};
