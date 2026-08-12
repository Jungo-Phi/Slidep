import React from "react";
import { Box } from "@mui/material";

interface StructureOnlyProps {
  disabled: boolean;
  /** Lay the children out in a row (for the header's trailing controls, which
   *  the ElementDisplay would otherwise flow itself). */
  row?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps the controls that only make sense at design time (geometry, dimensions,
 * ground, connections, deletion). In simulation they are greyed out: the panel
 * itself teaches which quantities can change mid-run — a live load magnitude next
 * to a greyed bar length says "this one, not that one" without any badge or text.
 */
export const StructureOnly: React.FC<StructureOnlyProps> = ({
  disabled,
  row = false,
  children,
}) => (
  <Box
    sx={{
      ...(row && { display: "flex", alignItems: "center" }),
      opacity: disabled ? 0.3 : 1,
      pointerEvents: disabled ? "none" : "auto",
      transition: "opacity 0.2s ease",
    }}
    aria-disabled={disabled}
  >
    {children}
  </Box>
);

export default StructureOnly;
