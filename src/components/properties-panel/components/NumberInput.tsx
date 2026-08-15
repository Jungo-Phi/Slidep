import React, { useRef, useCallback, useState, useEffect } from "react";
import { TextField, IconButton, Box } from "@mui/material";
import { KeyboardArrowUp, KeyboardArrowDown } from "@mui/icons-material";
import { COLORS } from "../../../constants/rendering-specs";

function round_value(value: number, rounding: number): string {
  return (
    Math.round(value * Math.pow(10, rounding)) / Math.pow(10, rounding)
  ).toString();
}

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
  suffix?: string;
  large?: boolean;
  accent?: boolean;
  /** Unsigned, which means always positive */
  unsigned?: boolean;
  adornment?: NumberInputAdornment;
  /** Rounds the field's right edge into a pill matching the adornment (SignedNumberInput's direction icon). */
  pillAdornment?: boolean;
  /** Decimal places shown and stepped to. Defaults to 1, fine for every value at unit scale (kg, N/m…); friction-like coefficients need more. */
  precision?: number;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  step = 1,
  suffix,
  large = false,
  accent = false,
  unsigned = false,
  adornment,
  pillAdornment = false,
  precision = 1,
}) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const rulerRef = useRef<HTMLSpanElement>(null);
  const [suffixLeft, setSuffixLeft] = useState<number>(0);
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
  const width = (large ? 75 : 71) + adornmentWidth;
  const rounding = precision;
  // The finest step the up/down arrows snap to before falling back to `step`.
  const grain = Math.pow(10, -rounding);
  // Pill-shaped right edge for the direction adornment (SignedNumberInput only).
  const adornmentRadius = (height + 4) / 2;

  const [localValue, setLocalValue] = useState<string>(
    round_value(value, rounding),
  );

  useEffect(() => {
    setLocalValue(round_value(value, rounding));
  }, [value, rounding]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Out of focus the field is a view of the value, never of a leftover edit.
  const displayed = focused ? localValue : round_value(value, rounding);

  useEffect(() => {
    if (rulerRef.current && inputRef.current) {
      // Copy the exact computed font from the real input so the ruler matches perfectly
      const style = window.getComputedStyle(inputRef.current);
      rulerRef.current.style.font = style.font;
      rulerRef.current.style.letterSpacing = style.letterSpacing;
      setSuffixLeft(rulerRef.current.offsetWidth);
    }
  }, [displayed]);

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
  const baseValue = useCallback(() => {
    if (document.activeElement !== inputRef.current) return valueRef.current;
    const pending = parseFloat(inputRef.current?.value ?? "");
    return isNaN(pending) ? valueRef.current : pending;
  }, []);

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
      onChange(getSteppedValue());
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          onChange(getSteppedValue());
        }, holdInterval);
      }, holdDelay);
    },
    [baseValue, grain, holdDelay, holdInterval, onChange, step],
  );

  const filterInput = (val: string) => {
    const negative = !unsigned && val.startsWith("-");
    const digits = val.replace(/[^0-9.]/g, "").replace(/(\.[^.]*)\./g, "$1");
    return (negative ? "-" : "") + digits;
  };

  // Leaving the field validates the entry; an unreadable one is dropped and the field
  // goes back to showing the value.
  const commitLocalValue = () => {
    if (localValue === round_value(value, rounding)) return;
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) onChange(parsed);
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
      {suffix && (
        <>
          {/* Hidden ruler: measures rendered text width */}
          <Box
            component="span"
            ref={rulerRef}
            aria-hidden
            sx={{
              position: "absolute",
              visibility: "hidden",
              whiteSpace: "pre",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              letterSpacing: "inherit",
              pointerEvents: "none",
              top: "50%",
              left: "8px",
            }}
          >
            {displayed}
          </Box>

          {/* Suffix overlay, follows the text, clips before the arrows */}
          <Box
            component="span"
            aria-hidden
            sx={{
              position: "absolute",
              left: `calc(11px + ${suffixLeft}px)`,
              right: `${24 + adornmentWidth}px`,
              top: "50%",
              transform: "translateY(-50%)",
              overflow: "hidden",
            }}
          >
            {suffix}
          </Box>
        </>
      )}

      <TextField
        label={label}
        type="text"
        inputProps={{ inputMode: "decimal" }}
        value={displayed}
        onChange={(e) => setLocalValue(filterInput(e.target.value))}
        inputRef={inputRef}
        onFocus={() => {
          setLocalValue(round_value(value, rounding));
          setFocused(true);
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
          endAdornment: (
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
