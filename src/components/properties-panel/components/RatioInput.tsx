import React, { useRef, useState, useEffect, useCallback } from "react";
import { TextField, Box, Typography } from "@mui/material";
import { value2ratio } from "../../../utils";

interface RatioInputProps {
  value: number;
  onChange: (value: number) => void;
}

export const RatioInput: React.FC<RatioInputProps> = ({ value, onChange }) => {
  const [val1, setVal1] = useState(() => value2ratio(value)[0]);
  const [val2, setVal2] = useState(() => value2ratio(value)[1]);

  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const [n, d] = value2ratio(value);
    setVal1(n);
    setVal2(d);
  }, [value]);

  const resetToValue = useCallback(() => {
    const [n, d] = value2ratio(value);
    setVal1(n);
    setVal2(d);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const v1 = parseFloat(val1);
      const v2 = parseFloat(val2);
      if (!isNaN(v1) && !isNaN(v2) && v1 !== 0 && v2 !== 0) {
        onChange(v1 / v2);
      }
      inputRef1.current?.blur();
      inputRef2.current?.blur();
    } else if (e.key === "Escape") {
      resetToValue();
      inputRef1.current?.blur();
      inputRef2.current?.blur();
    } else {
      if (e.key === "ArrowRight") {
        const isAtEnd =
          inputRef1.current?.selectionStart === val1.length &&
          inputRef1.current?.selectionEnd === val1.length;
        if (document.activeElement === inputRef1.current && isAtEnd) {
          e.preventDefault();
          inputRef2.current?.focus();
          inputRef2.current?.setSelectionRange(0, 0);
        }
      } else if (e.key === "ArrowLeft") {
        const isAtStart =
          inputRef2.current?.selectionStart === 0 &&
          inputRef2.current?.selectionEnd === 0;
        if (document.activeElement === inputRef2.current && isAtStart) {
          e.preventDefault();
          inputRef1.current?.focus();
          const len = val1.length;
          inputRef1.current?.setSelectionRange(len, len);
        }
      }
    }
  };

  const filterInput = (val: string) => {
    return val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  };

  const commonInputStyles = {
    "& .MuiOutlinedInput-notchedOutline": {
      border: "none",
    },
    "& .MuiOutlinedInput-input": {
      padding: "4px 2px",
      textAlign: "center",
      color: "text.primary",
    },
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: "32px",
        border: "1px solid",
        borderColor: "divider",
        "&:hover": {
          borderColor: "text.primary",
        },
        "&:focus-within": {
          // Thicker on focus; the extra pixel is taken out of the padding so the
          // content does not shift.
          border: "2px solid",
          borderColor: "primary.main",
          padding: "0 3px",
        },
        borderRadius: "16px",
        padding: "0 4px",
      }}
    >
      <TextField
        size="small"
        value={val1}
        onChange={(e) => setVal1(filterInput(e.target.value))}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          if (
            !e.relatedTarget ||
            (e.relatedTarget !== inputRef2.current &&
              !inputRef2.current?.contains(e.relatedTarget as Node))
          )
            resetToValue();
        }}
        inputRef={inputRef1}
        autoComplete="off"
        sx={{
          ...commonInputStyles,
          width: `${Math.max(20, val1.length * 9 + 10)}px`,
        }}
      />
      <Typography
        sx={{
          color: "text.primary",
          mx: -0.3,
        }}
      >
        :
      </Typography>
      <TextField
        size="small"
        value={val2}
        onChange={(e) => setVal2(filterInput(e.target.value))}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          if (
            !e.relatedTarget ||
            (e.relatedTarget !== inputRef1.current &&
              !inputRef1.current?.contains(e.relatedTarget as Node))
          )
            resetToValue();
        }}
        inputRef={inputRef2}
        autoComplete="off"
        sx={{
          ...commonInputStyles,
          width: `${Math.max(20, val2.length * 9 + 10)}px`,
        }}
      />
    </Box>
  );
};

export default RatioInput;
