import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

import type { WorldPoint } from "../../types";
import { QuantityUnit, to_mantissa } from "../../utils/quantity-format";

const BLANK = "—";

/** Line height of each stacked component, ordinary and `dense`. */
const COMPONENT_LEADING = { normal: 1.2, dense: 1 };
/** How far the bracket is drawn over the text's own size, so it reaches around both components. */
const BRACKET_SCALE = { normal: 2, dense: 1.7 };

/** A parenthesis sized to bracket the stacked components below it. */
const Bracket = ({
  children,
  dense,
}: {
  children: ReactNode;
  dense: boolean;
}) => (
  <Typography
    variant="caption"
    lineHeight={1.2}
    sx={{
      fontSize: `${BRACKET_SCALE[dense ? "dense" : "normal"]}em`,
      fontWeight: 200,
    }}
  >
    {children}
  </Typography>
);

/**
 * A planar vector — a force, a point — as its two components stacked between parentheses, x above y.
 * `null` reads as a blank pair rather than a hidden vector, so a value still pending keeps the layout it will have once it lands.
 *
 * `unit` only picks the mantissas' scale: several vectors sharing one line often share one unit too, so the symbol itself is the caller's to place.
 *
 * `dense` closes the stack up, for a list that sets vectors and scalars in the same run of rows: at its ordinary leading a vector stands twice as tall as a scalar, and a block of them reads as a different kind of statement than the block beside it.
 */
export const Vector = ({
  value,
  unit,
  dense = false,
}: {
  value: WorldPoint | null;
  unit: QuantityUnit;
  dense?: boolean;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", mt: -0.5, mb: -0.3 }}>
    <Bracket dense={dense}>(</Bracket>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Typography
        variant="caption"
        lineHeight={COMPONENT_LEADING[dense ? "dense" : "normal"]}
      >
        {value ? to_mantissa(value.x, unit, 1) : BLANK}
      </Typography>
      <Typography
        variant="caption"
        lineHeight={COMPONENT_LEADING[dense ? "dense" : "normal"]}
      >
        {value ? to_mantissa(value.y, unit, 1) : BLANK}
      </Typography>
    </Box>
    <Bracket dense={dense}>)</Bracket>
  </Box>
);

/**
 * The styles {@link BareVector} reads, to spread once into the `sx` of an ancestor.
 * Written from the same constants as {@link Vector}, so the two read alike.
 */
export const BARE_VECTOR_SX = {
  "& .vec": { display: "flex", alignItems: "center", mt: -0.5, mb: -0.3 },
  "& .vec-bracket": {
    typography: "caption",
    lineHeight: 1.2,
    fontSize: `${BRACKET_SCALE.normal}em`,
    fontWeight: 200,
  },
  "& .vec-dense .vec-bracket": { fontSize: `${BRACKET_SCALE.dense}em` },
  "& .vec-stack": {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontVariantNumeric: "tabular-nums",
  },
  "& .vec-component": { typography: "caption", lineHeight: COMPONENT_LEADING.normal },
  "& .vec-dense .vec-component": { lineHeight: COMPONENT_LEADING.dense },
} as const;

/**
 * {@link Vector} as plain elements with no style of their own: the styles live once on an ancestor carrying {@link BARE_VECTOR_SX}.
 * For a list that shows many vectors and redraws them at every instant: a styled vector costs several style resolutions per render, this one none.
 */
export const BareVector = ({
  value,
  unit,
  dense = false,
}: {
  value: WorldPoint | null;
  unit: QuantityUnit;
  dense?: boolean;
}) => (
  <div className={dense ? "vec vec-dense" : "vec"}>
    <span className="vec-bracket">(</span>
    <div className="vec-stack">
      <span className="vec-component">
        {value ? to_mantissa(value.x, unit, 1) : BLANK}
      </span>
      <span className="vec-component">
        {value ? to_mantissa(value.y, unit, 1) : BLANK}
      </span>
    </div>
    <span className="vec-bracket">)</span>
  </div>
);

export default Vector;
