import React from "react";
import { Box, Typography } from "@mui/material";
import { Action, CanvasState, ID, MechanicalElement } from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "./ElementDisplay";
import { SUBJECT_VALUES_INSET } from "../inspector-metrics";

/** What the card is told the selection holds: the subject is the load or the reading, never the element under it. */
const NOTHING_SELECTED: ID[] = [];

interface HostRowProps {
  /** Names the tie, not the element: "applied on", "read from". */
  label: string;
  element: MechanicalElement;
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

/**
 * The element a subject hangs off: the beam a load is applied on, the element a reading is read from.
 * Laid out the way the elements tab lays out a connection (`ConnectionsContainer`) — the tie named on the left, the element itself in a sunken well on the right — so that "this points at something else" reads the same wherever it appears.
 * A link, never a second subject: the card is small, stays outside the selection, and clicking it moves the selection there.
 */
export const HostRow: React.FC<HostRowProps> = ({
  label,
  element,
  hoveredPart,
  setHoveredPart,
  setCanvasState,
  applyActions,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 2,
      minHeight: 34,
      ...SUBJECT_VALUES_INSET,
    }}
  >
    <Typography variant="subtitle2" color="text.secondary" noWrap>
      {label}
    </Typography>
    <Box
      sx={{
        minHeight: 28,
        borderRadius: 3,
        padding: "2px",
        backgroundColor: "background.sunken",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
      }}
    >
      <ElementDisplay
        element={element}
        hoveredPart={hoveredPart}
        setHoveredPart={setHoveredPart}
        selectedIds={NOTHING_SELECTED}
        setCanvasState={setCanvasState}
        applyActions={applyActions}
        size="small"
        editable={false}
        staysWithinInspector
      />
    </Box>
  </Box>
);

export default HostRow;
