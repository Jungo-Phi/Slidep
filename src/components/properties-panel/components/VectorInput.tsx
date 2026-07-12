/**
 * VectorInput component
 * Displays and edits X/Y coordinates of an element
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import NumberInput from "./NumberInput";
import { Point2 } from "../../../types";

interface VectorInputProps {
  value: Point2;
  onChange: (vector: Point2) => void;
  label?: string;
  accent?: boolean;
}

export const VectorInput: React.FC<VectorInputProps> = ({
  value,
  onChange,
  label = "",
  accent = false,
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
        value={value.x}
        onChange={(newX) => onChange(new Point2(newX, value.y))}
        accent={accent}
      />
      <NumberInput
        label="Y"
        value={value.y}
        onChange={(newY) => onChange(new Point2(value.x, newY))}
        accent={accent}
      />
    </Box>
  );
};

export default VectorInput;
