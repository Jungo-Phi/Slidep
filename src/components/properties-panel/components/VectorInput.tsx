/**
 * VectorInput component
 * Displays and edits X/Y coordinates of an element
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import NumberInput from "./NumberInput";
import { Point2 } from "../../../types";

interface VectorInputProps {
  x: number;
  y: number;
  setPos: (pos: Point2) => void;
  label: string;
}

export const VectorInput: React.FC<VectorInputProps> = ({
  x,
  y,
  setPos,
  label,
}) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Typography variant="body2" sx={{ mr: 1 }}>
        {label}
      </Typography>

      <Box>
        <Box sx={{ mb: 1 }}>
          <NumberInput
            label="X"
            value={x}
            onChange={(newX) => setPos(new Point2(newX, y))}
          />
        </Box>

        <Box sx={{ mb: 1 }}>
          <NumberInput
            label="Y"
            value={y}
            onChange={(newY) => setPos(new Point2(x, newY))}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default VectorInput;
