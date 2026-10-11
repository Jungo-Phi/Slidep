/**
 * VectorInput component Displays and edits X/Y coordinates of an element
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import NumberInput from "./NumberInput";
import { Point2 } from "../../../types";
import { LENGTH } from "../../../utils/quantity-format";

interface VectorInputProps {
  value: Point2;
  onChange: (vector: Point2) => void;
  label?: string;
  /** The pose on screen, read-only (see `NumberInput`'s own `live`). */
  live?: boolean;
}

export const VectorInput: React.FC<VectorInputProps> = ({
  value,
  onChange,
  label = "",
  live = false,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      {label && (
        <Typography variant="body2" marginBottom={-0.5}>
          {label}
        </Typography>
      )}
      <NumberInput
        label="X"
        title=""
        kind={LENGTH}
        value={value.x}
        onChange={(newX) => onChange(new Point2(newX, value.y))}
        live={live}
      />
      <NumberInput
        label="Y"
        title=""
        kind={LENGTH}
        value={value.y}
        onChange={(newY) => onChange(new Point2(value.x, newY))}
        live={live}
      />
    </Box>
  );
};

export default VectorInput;
