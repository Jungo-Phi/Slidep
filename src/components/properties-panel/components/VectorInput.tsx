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
  label?: string;
}

export const VectorInput: React.FC<VectorInputProps> = ({
  x,
  y,
  setPos,
  label = "",
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        py: 1,
      }}
    >
      {label && (
        <Typography variant="body2" marginBottom={-0.5}>
          {label}
        </Typography>
      )}
      <NumberInput
        label="X"
        value={x}
        onChange={(newX) => setPos(new Point2(newX, y))}
      />
      <NumberInput
        label="Y"
        value={y}
        onChange={(newY) => setPos(new Point2(x, newY))}
      />
    </Box>
  );
};

export default VectorInput;
