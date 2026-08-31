import React, { useRef, useCallback, useState, useEffect } from "react";
import { TextField, IconButton, Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { KeyboardArrowUp, KeyboardArrowDown } from "@mui/icons-material";
import { COLORS } from "../../../constants/rendering-specs";
import {
  QuantityKind,
  QuantityUnit,
  display_unit,
  parse_quantity,
  to_mantissa,
} from "../../../utils/quantity-format";

const RAW_UNIT: QuantityUnit = { symbol: "", factor: 1 };

/** Icon button docked inside the field, right of the stepper arrows. */
export interface NumberInputAdornment {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  color?: "primary" | "secondary" | "inherit";
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  large?: boolean;
  accent?: boolean;
  /** Unsigned, which means always positive */
  unsigned?: boolean;
  adornment?: NumberInputAdornment;
  /** Rounds the field's right edge into a pill matching the adornment (SignedNumberInput's direction icon). */
  pillAdornment?: boolean;
  /** Decimal places shown and stepped to. Defaults to 1, fine for every value at unit scale (kg, N/m…); friction-like coefficients need more. */
  precision?: number;
  /** Formats and parses `value` (always SI) as a physical quantity instead of a bare number.
   *  The unit is plain text alongside the digits — part of what is shown and edited, not a
   *  decoration next to it — so typing over it ("12mm", "3cm", "150kN") is how a unit is
   *  overridden for that one entry. */
  kind?: QuantityKind;
  /** A read-only view of `value` — the catalogue's own entries, never a mechanism's own. No
   *  focus, no stepper, no edits reach `onChange`. */
  disabled?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  step = 1,
  large = false,
  accent = false,
  unsigned = false,
  adornment,
  pillAdornment = false,
  precision = 1,
  kind,
  disabled = false,
}) => {
  const unit = kind ? display_unit(value, kind) : RAW_UNIT;
  const format = (v: number) => {
    const mantissa = to_mantissa(v, unit, precision).toString();
    return unit.symbol ? `${mantissa} ${unit.symbol}` : mantissa;
  };

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const [focused, setFocused] = useState(false);
  // Set by Escape so the blur it triggers discards instead of committing.
  const discardRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdDelay = 400;
  const longHoldDelay = 2000;
  const holdInterval = 60;
  // The adornment eats into the text zone, so the field grows to keep it intact.
  const height = large ? 32 : 24;
  const adornmentWidth = adornment ? height - 8 : 0;
  const width = (large ? 100 : 96) + adornmentWidth;
  const rounding = precision;
  // The finest step the up/down arrows snap to before falling back to `step`.
  const grain = Math.pow(10, -rounding);
  // Pill-shaped right edge for the direction adornment (SignedNumberInput only).
  const adornmentRadius = (height + 4) / 2;

  const [localValue, setLocalValue] = useState<string>(format(value));

  useEffect(() => {
    setLocalValue(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rounding, unit.factor]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Out of focus the field is a view of the value, never of a leftover edit.
  const displayed = focused ? localValue : format(value);

  const stopRepeating = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    holdStartRef.current = null;
  }, []);

  // The arrows keep the focus in the field, so an edit in progress is what they step from.
  // In the unit `format` currently displays, matching what `step`/`grain` are stepping in.
  const baseValue = useCallback(() => {
    if (document.activeElement !== inputRef.current)
      return valueRef.current / unit.factor;
    const pending = parseFloat(inputRef.current?.value ?? "");
    return isNaN(pending) ? valueRef.current / unit.factor : pending;
  }, [unit.factor]);

  const startRepeating = useCallback(
    (direction: 1 | -1) => {
      holdStartRef.current = Date.now();

      const getSteppedValue = () => {
        const actualStep =
          Date.now() - (holdStartRef.current ?? 0) > longHoldDelay
            ? step * 5
            : step;
        const current = baseValue();
        const snapped = Math.round(current / grain) * grain;
        return direction === 1
          ? snapped > current
            ? snapped
            : snapped === Math.round(current)
              ? snapped + actualStep
              : snapped + grain
          : snapped < current
            ? snapped
            : snapped === Math.round(current)
              ? snapped - actualStep
              : snapped - grain;
      };
      onChange(getSteppedValue() * unit.factor);
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          onChange(getSteppedValue() * unit.factor);
        }, holdInterval);
      }, holdDelay);
    },
    [baseValue, grain, holdDelay, holdInterval, onChange, step, unit.factor],
  );

  const filterInput = (val: string) => {
    const negative = !unsigned && val.startsWith("-");
    // Stripped off before filtering, and alone allowed to survive it: a leading sign is the
    // field's own, but a `-` past it belongs to a unit's exponent ("s-1", "min-1") and must
    // stay legible through the same pass that strips everything else unrecognised.
    const rest = negative ? val.slice(1) : val;
    // A `kind` field accepts unit letters typed inline ("12mm", "150kN"), stand-ins `loose`
    // folds back to the real symbol ("N*m", "Nm" for "N·m"; "m2" for "m²"), and the
    // physicist's superscript exponent ("s⁻¹"); a plain one stays digits-only.
    const pattern = kind ? /[^0-9.a-zA-Zµμ°·²³⁻¹*^/ -]/g : /[^0-9.]/g;
    const body = rest.replace(pattern, "").replace(/(\.[^.]*)\./g, "$1");
    return (negative ? "-" : "") + body;
  };

  const parseLocal = (text: string): number | null => {
    const parsed = kind ? parse_quantity(text, kind, unit) : parseFloat(text);
    return parsed === null || isNaN(parsed) ? null : parsed;
  };
  const entered = parseLocal(localValue);
  // A refusal shows up while typing rather than only at blur, so leaving the field on an
  // unusable entry isn't a silent discard. A field still being filled stays neutral.
  const refused = focused && localValue.trim() !== "" && entered === null;

  // Leaving the field validates the entry; an unreadable one is dropped and the field
  // goes back to showing the value.
  const commitLocalValue = () => {
    if (localValue === format(value)) return;
    if (entered !== null) onChange(entered);
  };

  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-block",
        minWidth: width,
        width,
      }}
    >
      <TextField
        label={label}
        type="text"
        disabled={disabled}
        inputProps={{ inputMode: "decimal" }}
        value={displayed}
        onChange={(e) => setLocalValue(filterInput(e.target.value))}
        inputRef={inputRef}
        onFocus={() => {
          setLocalValue(format(value));
          setFocused(true);
          // The unit suffix is part of the displayed text but not something a user
          // overwriting the number wants swept up with it — select just the digits.
          // Deferred: a focus from a click still has its mouseup to come, which would
          // otherwise collapse the selection to the click point right after this.
          const mantissaLength = to_mantissa(value, unit, precision).toString().length;
          setTimeout(() => inputRef.current?.setSelectionRange(0, mantissaLength), 10);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            discardRef.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          setFocused(false);
          if (discardRef.current) discardRef.current = false;
          else commitLocalValue();
        }}
        size="small"
        sx={{
          width: "100%",
          "& input": {
            paddingY: "7px",
            paddingLeft: "8px",
            paddingRight: "-6px",
          },
          "& .MuiInputBase-root": {
            marginY: "-2px",
            overflow: "hidden",
            ...(pillAdornment && {
              borderTopRightRadius: adornmentRadius,
              borderBottomRightRadius: adornmentRadius,
            }),
            ...(accent && {
              backgroundColor: COLORS.FILL_NODE + COLORS.HALF_TRANSPARENCY,
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "primary.main",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "primary.main",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: COLORS.FILL_NODE,
              },
            }),
            // Wins over `accent`'s tint below it: a refusal is worth surfacing even on an
            // already-coloured field like the motor's torque or speed.
            ...(refused && {
              backgroundColor: (theme) => alpha(theme.palette.error.main, 0.15),
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "error.main",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "error.main",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "error.main",
              },
            }),
          },
          ...(pillAdornment && {
            "& .MuiOutlinedInput-notchedOutline": {
              borderTopRightRadius: adornmentRadius,
              borderBottomRightRadius: adornmentRadius,
            },
          }),
          "& .MuiInputLabel-root": accent
            ? {
                color: "primary.main",
                fontWeight: 500,
                fontSize: large ? "1em" : "0.92em",
                pl: large ? 0 : 0.4,
              }
            : {},
          height,
        }}
        InputProps={{
          endAdornment: disabled ? undefined : (
            <Box sx={{ display: "flex", alignItems: "center", mr: -1.6 }}>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <IconButton
                  size="small"
                  color="secondary"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startRepeating(1);
                  }}
                  onMouseUp={stopRepeating}
                  onMouseLeave={stopRepeating}
                  sx={{
                    p: 0.25,
                    pb: 0,
                    borderRadius: 1,
                    fontSize: "18px",
                    "&:hover": { backgroundColor: "action.hover" },
                  }}
                >
                  <KeyboardArrowUp fontSize="inherit" sx={{ my: -0.25 }} />
                </IconButton>
                <IconButton
                  size="small"
                  color="secondary"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startRepeating(-1);
                  }}
                  onMouseUp={stopRepeating}
                  onMouseLeave={stopRepeating}
                  sx={{
                    p: 0.25,
                    pt: 0,
                    borderRadius: 1,
                    fontSize: "18px",
                    "&:hover": { backgroundColor: "action.hover" },
                  }}
                >
                  <KeyboardArrowDown fontSize="inherit" sx={{ my: -0.25 }} />
                </IconButton>
              </Box>
              {adornment && (
                <IconButton
                  color={adornment.color}
                  onClick={adornment.onClick}
                  onMouseEnter={adornment.onMouseEnter}
                  onMouseLeave={adornment.onMouseLeave}
                  title={adornment.title}
                  sx={{
                    height: height + 2,
                    ...(pillAdornment
                      ? {
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0,
                          borderTopRightRadius: adornmentRadius,
                          borderBottomRightRadius: adornmentRadius,
                        }
                      : { borderRadius: 0.75 }),
                    px: 0.5,
                    ml: -0.25,
                    fontSize: large ? "20px" : "16px",
                  }}
                >
                  <adornment.icon fontSize="inherit" />
                </IconButton>
              )}
            </Box>
          ),
        }}
      />
    </Box>
  );
};

export default NumberInput;
