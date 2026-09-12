import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  Box,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

import { Vector } from "../common/Vector";
import { icon } from "../element-palette/iconDataUris";
import { shortcut_label } from "../../constants/shortcuts";
import { t } from "../../i18n";
import type { CanvasState, MeasureReadout, WorldPoint } from "../../types";
import {
  ANGLE,
  LENGTH,
  default_unit,
  format_mantissa,
  format_quantity,
} from "../../utils/quantity-format";

/** The readings, pushed in from the canvas's animation loop. `null` blanks them.
 * `centerOfMass` is independent of `readout` — the mechanism's own, not the measurement in progress — and is shown for as long as the ruler is out, `waiting` included. */
export interface MeasureReadoutHandle {
  update(readout: MeasureReadout | null, centerOfMass?: WorldPoint): void;
}

interface MeasureWidgetProps {
  canvasState: CanvasState;
  onArm: () => void;
  onDisarm: () => void;
}

/** The canvas states the ruler is out in, and whether it has anything to show yet. */
function ruler_phase(state: CanvasState): "away" | "waiting" | "reading" {
  switch (state.type) {
    case "Measuring":
      return "waiting";
    case "MeasuringFrom":
    case "Measured":
      return "reading";
    default:
      return "away";
  }
}

const ROWS = ["distance", "radius", "dx", "dy", "angle"] as const;
type Row = (typeof ROWS)[number];

/** The rows each kind of reading has something to say in; the others step aside. */
const SHOWN: Record<MeasureReadout["kind"], readonly Row[]> = {
  distance: ["distance", "dx", "dy", "angle"],
  angle: ["angle"],
  radius: ["radius"],
};

const row_label = (row: Row): string => {
  switch (row) {
    case "distance":
      return t("ruler_distance");
    case "radius":
      return t("ruler_radius");
    case "angle":
      return t("ruler_angle");
    default:
      return row === "dx" ? "Δx" : "Δy";
  }
};

const BLANK = "—";
const LENGTH_UNIT = default_unit(LENGTH);

const degrees = (radians: number) => `${format_mantissa(radians, ANGLE, 1)}°`;

/** The classic centre-of-mass symbol, matching `draw_center_of_mass` on the canvas: a circle quartered by a cross, two opposite quadrants filled. */
const CenterOfMassIcon = () => (
  <Box
    component="svg"
    viewBox="0 0 20 20"
    sx={{
      width: 14,
      height: 14,
      display: "block",
      flexShrink: 0,
      color: "measure",
    }}
  >
    <path d="M10,10 L18,10 A8,8 0 0 1 10,18 Z" fill="currentColor" />
    <path d="M10,10 L2,10 A8,8 0 0 1 10,2 Z" fill="currentColor" />
    <circle
      cx="10"
      cy="10"
      r="8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </Box>
);

/** Every row's text for a reading, blank where that reading has nothing to say. */
function row_texts(readout: MeasureReadout | null): Record<Row, string> {
  const blank = {
    distance: BLANK,
    radius: BLANK,
    dx: BLANK,
    dy: BLANK,
    angle: BLANK,
  };
  if (!readout) return blank;
  switch (readout.kind) {
    case "angle":
      return { ...blank, angle: degrees(readout.angle) };
    case "radius":
      return { ...blank, radius: format_quantity(readout.radius, LENGTH) };
    case "distance":
      return {
        ...blank,
        distance: format_quantity(readout.distance, LENGTH),
        dx: format_quantity(readout.dx, LENGTH),
        dy: format_quantity(readout.dy, LENGTH),
        angle: degrees(readout.angle),
      };
  }
}

/**
 * The ruler's corner of the canvas: the button that takes it out, and — in the same place, once it is out — what it reads.
 *
 * The five row numbers are written straight into the DOM rather than held in React state: under a running simulation they change every frame, and re-rendering this widget sixty times a second to move five numbers is not a trade worth making. The centre of mass below them is the one exception — see its own state below.
 */
const MeasureWidget = forwardRef<MeasureReadoutHandle, MeasureWidgetProps>(
  ({ canvasState, onArm, onDisarm }, ref) => {
    const valueRefs = useRef<Partial<Record<Row, HTMLElement | null>>>({});
    const rowRefs = useRef<Partial<Record<Row, HTMLElement | null>>>({});
    // Unlike the rows above, driven through React state: it's two numbers, not five, and the re-render it costs each frame is cheap enough to trade for reusing `Vector` as-is.
    const [centerOfMass, setCenterOfMass] = useState<WorldPoint | null>(null);

    useImperativeHandle(ref, () => ({
      update(readout, nextCenterOfMass) {
        const texts = row_texts(readout);
        // A reading only shows the rows it can fill — an angle has no span, a radius no direction — rather than leaving them struck through.
        // Hidden from here rather than from a render: which reading a gesture is building follows the cursor, frame by frame.
        const shown: readonly Row[] = readout
          ? SHOWN[readout.kind]
          : SHOWN.distance;
        for (const row of ROWS) {
          const line = rowRefs.current[row];
          const hidden = !shown.includes(row);
          if (line && line.hidden !== hidden) line.hidden = hidden;
          const node = valueRefs.current[row];
          // Only on a change: this runs every frame, and writing an unchanged string still costs a layout invalidation.
          if (node && node.textContent !== texts[row])
            node.textContent = texts[row];
        }
        setCenterOfMass(nextCenterOfMass ?? null);
      },
    }));

    const phase = ruler_phase(canvasState);
    const label = `${t("tool_ruler")} (${shortcut_label("Measuring")})`;

    if (phase === "away")
      return (
        <Tooltip title={label} placement="left">
          <IconButton
            aria-label={label}
            onClick={onArm}
            sx={{
              position: "absolute",
              right: 12,
              bottom: 12,
              zIndex: 900,
              backgroundColor: (theme) =>
                alpha(theme.palette.text.primary, 0.07),
              transition: "background-color 120ms",
              "&:hover": {
                backgroundColor: (theme) =>
                  alpha(theme.palette.text.primary, 0.14),
              },
            }}
          >
            <Box
              component="img"
              src={icon("ruler")}
              alt=""
              sx={{
                width: 24,
                height: 24,
                display: "block",
                // The fade is on the glyph alone: the ground under it is what makes the button findable, and fading both together hid it altogether.
                opacity: 0.5,
                transition: "opacity 120ms",
              }}
            />
          </IconButton>
        </Tooltip>
      );

    return (
      <Paper
        sx={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 900,
          width: 200,
          px: 1.5,
          py: 1,
          boxShadow: 4,
          borderRadius: 1.5,
          borderColor: "measure",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 0.5,
          }}
        >
          <Box
            component="img"
            src={icon("ruler")}
            alt=""
            sx={{ width: 20, height: 20, display: "block" }}
          />
          <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }}>
            {t("tool_ruler")}
          </Typography>
          <IconButton
            size="small"
            aria-label={t("ruler_close")}
            onClick={onDisarm}
            sx={{ mr: -0.5 }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {phase === "waiting" ? (
          <Typography variant="caption" color="text.secondary">
            {t("ruler_hint")}
          </Typography>
        ) : (
          ROWS.map((row) => (
            <Box
              key={row}
              ref={(node: HTMLElement | null) => {
                rowRefs.current[row] = node;
              }}
              sx={{
                display: "flex",
                // An explicit `display` outranks the `hidden` attribute's own rule, so the rows a reading has nothing to say in would stay on screen without this.
                "&[hidden]": { display: "none" },
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {row_label(row)}
              </Typography>
              <Typography
                variant="caption"
                ref={(node: HTMLElement | null) => {
                  valueRefs.current[row] = node;
                }}
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {BLANK}
              </Typography>
            </Box>
          ))
        )}

        {/* Negative margin cancels the panel's own padding, so the rule spans its full width. */}
        <Divider sx={{ my: 1, mx: -1.5 }} />

        {/* The mechanism's own centre of mass — independent of whatever the ruler above is measuring, so it stays put whether that's a hint or a reading. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mx: -0.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <CenterOfMassIcon />
            <Typography variant="caption" color="text.secondary">
              {t("balance_reference_center_of_mass")}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Vector value={centerOfMass} unit={LENGTH_UNIT} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ pl: 0.5 }}
            >
              {LENGTH_UNIT.symbol}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  },
);
MeasureWidget.displayName = "MeasureWidget";

export default MeasureWidget;
