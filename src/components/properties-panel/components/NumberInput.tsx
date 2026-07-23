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
  large?: boolean;
  suffix?: string;
  accent?: boolean;
  signed?: boolean;
  adornment?: NumberInputAdornment;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  step = 1,
  large = false,
  suffix,
  accent = false,
  signed = true,
  adornment,
}) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const rulerRef = useRef<HTMLSpanElement>(null);
  const [suffixLeft, setSuffixLeft] = useState<number>(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdDelay = 400;
  const longHoldDelay = 2000;
  const holdInterval = 60;
  // The adornment eats into the text zone, so the field grows to keep it intact.
  const height = large ? 32 : 24;
  const adornmentWidth = adornment ? height - 4 : 0;
  const width = (large ? 82 : 75) + adornmentWidth;
  const rounding = 1;

  const [localValue, setLocalValue] = useState<string>(
    round_value(value, rounding),
  );

  useEffect(() => {
    setLocalValue(round_value(value, rounding));
  }, [value]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rulerRef.current && inputRef.current) {
      // Copy the exact computed font from the real input so the ruler matches perfectly
      const style = window.getComputedStyle(inputRef.current);
      rulerRef.current.style.font = style.font;
      rulerRef.current.style.letterSpacing = style.letterSpacing;
      setSuffixLeft(rulerRef.current.offsetWidth);
    }
  }, [localValue]);

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

  const startRepeating = useCallback(
    (direction: 1 | -1) => {
      holdStartRef.current = Date.now();

      const getSteppedValue = () => {
        const actualStep =
          Date.now() - (holdStartRef.current ?? 0) > longHoldDelay
            ? step * 5
            : step;
        const snapped = Math.round(valueRef.current * 10) / 10;
        return direction === 1
          ? snapped > valueRef.current
            ? snapped
            : snapped === Math.round(valueRef.current)
              ? snapped + actualStep
              : snapped + 0.1
          : snapped < valueRef.current
            ? snapped
            : snapped === Math.round(valueRef.current)
              ? snapped - actualStep
              : snapped - 0.1;
      };
      onChange(getSteppedValue());
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          onChange(getSteppedValue());
        }, holdInterval);
      }, holdDelay);
    },
    [holdDelay, holdInterval, onChange, step],
  );

  const filterInput = (val: string) => {
    const negative = signed && val.startsWith("-");
    const digits = val.replace(/[^0-9.]/g, "").replace(/(\.[^.]*)\./g, "$1");
    return (negative ? "-" : "") + digits;
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
            {localValue}
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
        value={localValue}
        onChange={(e) => setLocalValue(filterInput(e.target.value))}
        inputRef={inputRef}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const parsed = parseFloat(localValue);
            if (!isNaN(parsed)) onChange(parsed);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setLocalValue(round_value(value, rounding));
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => setLocalValue(round_value(value, rounding))}
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
          "& .MuiInputLabel-root": accent
            ? { color: "primary.main", fontWeight: 500 }
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
                  onMouseDown={() => startRepeating(1)}
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
                  onMouseDown={() => startRepeating(-1)}
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
                    borderRadius: 0.75,
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
