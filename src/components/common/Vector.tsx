import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

import type { WorldPoint } from "../../types";
import { QuantityUnit, to_mantissa } from "../../utils/quantity-format";

const BLANK = "—";

/** A parenthesis sized to bracket the stacked components below it. */
const Bracket = ({ children }: { children: ReactNode }) => (
  <Typography
    variant="caption"
    lineHeight={1.2}
    sx={{ fontSize: "2em", fontWeight: 200 }}
  >
    {children}
  </Typography>
);

/**
 * A planar vector — a force, a point — as its two components stacked between parentheses, x above y.
 * `null` reads as a blank pair rather than a hidden vector, so a value still pending keeps the layout it will have once it lands.
 *
 * `unit` only picks the mantissas' scale: several vectors sharing one line often share one unit too, so the symbol itself is the caller's to place.
 */
export const Vector = ({
  value,
  unit,
}: {
  value: WorldPoint | null;
  unit: QuantityUnit;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", mt: -0.5, mb: -0.25 }}>
    <Bracket>(</Bracket>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontVariantNumeric: "tabular-nums",
        px: 0.25,
      }}
    >
      <Typography variant="caption" lineHeight={1.2}>
        {value ? to_mantissa(value.x, unit, 1) : BLANK}
      </Typography>
      <Typography variant="caption" lineHeight={1.2}>
        {value ? to_mantissa(value.y, unit, 1) : BLANK}
      </Typography>
    </Box>
    <Bracket>)</Bracket>
  </Box>
);

export default Vector;
