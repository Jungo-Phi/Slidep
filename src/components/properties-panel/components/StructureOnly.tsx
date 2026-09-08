import React from "react";
import { Box } from "@mui/material";
import { Action } from "../../../types";
import { is_structure_action } from "../../mechanism/action-kind";
import { useSimulating } from "../simulation-lock";

interface StructureOnlyProps {
  /** What the wrapped controls emit. Naming the actions rather than the verdict is what
   * keeps this in step with `action-kind`, the one place that decides what a running simulation can absorb. */
  actions: Action["type"][];
  /** Lay the children out in a row (for the header's trailing controls, which
   * the ElementDisplay would otherwise flow itself). */
  row?: boolean;
  children: React.ReactNode;
}

/**
 * Greys out its children while a simulation runs, if what they emit is a structure edit — one that would exit to edition and lose the recording.
 *
 * The panel itself is what teaches which quantities can change mid-run: a live mass next to a greyed bar length says "this one, not that one" without any badge or text.
 */
export const StructureOnly: React.FC<StructureOnlyProps> = ({
  actions,
  row = false,
  children,
}) => {
  const disabled = useSimulating() && actions.some(is_structure_action);
  const ref = React.useRef<HTMLDivElement>(null);

  // `inert` is what takes the subtree out of the tab order as well — greyed controls a user can still reach by keyboard would fire the very edit this is refusing.
  // React 18 does not pass it as a prop, hence the ref.
  React.useEffect(() => {
    if (ref.current) ref.current.inert = disabled;
  }, [disabled]);

  return (
    <Box
      ref={ref}
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
};

export default StructureOnly;
