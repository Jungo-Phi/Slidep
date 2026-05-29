import React, { useRef, useCallback, useState, useEffect } from "react";
import { TextField, IconButton, Box } from "@mui/material";
import { KeyboardArrowUp, KeyboardArrowDown } from "@mui/icons-material";

function round_value(value: number, rounding: number): string {
  return (
    Math.round(value * Math.pow(10, rounding)) / Math.pow(10, rounding)
  ).toString(); // .toFixed(rounding);
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  large?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  step = 1,
  large = false,
}) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdDelay = 400;
  const longHoldDelay = 2000;
  const holdInterval = 60;
  const width = large ? 106 : 75;
  const rounding = 1; // Arrondi à 1 chiffre après la virgule = au dixième

  const [localValue, setLocalValue] = useState<string>(
    round_value(value, rounding),
  );
  useEffect(() => {
    setLocalValue(round_value(value, rounding));
  }, [value]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  return (
    <TextField
      label={label}
      type="number"
      value={localValue}
      onChange={handleChange}
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
        width,
        "& input[type=number]": {
          "-moz-appearance": "textfield",
          paddingY: "7px",
          paddingLeft: "8px",
          paddingRight: "-6px",
        },
        "& .MuiInputBase-root": {
          marginY: "-2px",
        },
      }}
      InputProps={{
        endAdornment: (
          <Box sx={{ display: "flex", flexDirection: "column", mr: -1.6 }}>
            <IconButton
              size="small"
              color="secondary"
              onMouseDown={() => startRepeating(1)}
              onMouseUp={stopRepeating}
              onMouseLeave={stopRepeating}
              sx={{
                p: 0.25,
                pb: 0,
                fontSize: "18px",
                "&:hover": {
                  backgroundColor: "#00000025",
                },
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
                fontSize: "18px",
                "&:hover": {
                  backgroundColor: "#00000025",
                },
              }}
            >
              <KeyboardArrowDown fontSize="inherit" sx={{ my: -0.25 }} />
            </IconButton>
          </Box>
        ),
      }}
    />
  );
};

export default NumberInput;
