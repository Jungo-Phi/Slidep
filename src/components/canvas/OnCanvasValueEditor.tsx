import React, { useState, useEffect, useRef } from "react";
import { TextField, Typography, Box } from "@mui/material";
import { Point2 } from "../../types/point2";
import { COLORS } from "../../constants/rendering-specs";
import { value2ratio } from "../../utils";

/**
 * How the editor lays out its inputs.
 * - "single": one numeric field, committing the raw value.
 * - "ratio": two numeric fields separated by ":", committing `num / den`.
 */
type ValueEditorMode = "single" | "ratio";

interface OnCanvasValueEditorProps {
  /** Field layout — decoupled from any element/load type. */
  mode: ValueEditorMode;
  /** Value shown when the editor opens. In "ratio" mode it is split into parts. */
  initialValue: number;
  /** Screen-space anchor (the editor centers itself on this point). */
  position: Point2;
  /** Text drawn after the input (e.g. "°", "N"). "single" mode only. */
  suffix?: string;
  /**
   * Accept a leading minus. The field always opens on a magnitude — a load's
   * sign is a direction, and reading a "-" off a label helps nobody — but
   * typing one is how the user turns that direction around from here. What the
   * sign then means is the caller's business. "single" mode only.
   */
  signed?: boolean;
  /**
   * Commit a zero instead of reading it as "cancel". Zero is nonsense for most
   * quantities an editor opens on (a dimension, a force, a ratio), but it is a
   * real value for one end of a distributed load: it is what makes it
   * triangular. Callers pass it only when zero leaves something behind.
   */
  allowZero?: boolean;
  onCommit: (newValue: number) => void;
  onCancel: () => void;
}

export const OnCanvasValueEditor: React.FC<OnCanvasValueEditorProps> = ({
  mode,
  initialValue,
  position,
  suffix,
  signed = false,
  allowZero = false,
  onCommit,
  onCancel,
}) => {
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");

  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "ratio") {
      const [n, d] = value2ratio(initialValue);
      setVal1(n);
      setVal2(d);
    } else {
      setVal1((Math.round(initialValue * 10) / 10).toString());
    }
    setTimeout(() => {
      inputRef1.current?.focus();
      inputRef1.current?.select();
    }, 10);
  }, [mode, initialValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const v1 = parseFloat(val1);
      if (v1 === 0 && !allowZero) {
        onCancel();
        return;
      }
      const v2 = mode === "ratio" ? parseFloat(val2) : 1;
      if (!isNaN(v1) && !isNaN(v2) && v2 !== 0) {
        onCommit(v1 / v2);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    } else if (mode === "ratio") {
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
    const digits = val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    // The minus is read from the head of the raw input rather than kept in the
    // filtered string, so it can only ever sit in front of the number — and
    // typing it alone leaves "-" on screen while the user finishes the value.
    return signed && val.trimStart().startsWith("-") ? `-${digits}` : digits;
  };

  const commonInputStyles = {
    "& .MuiOutlinedInput-notchedOutline": {
      border: "none",
    },
    "& .MuiOutlinedInput-input": {
      padding: "4px 2px",
      textAlign: "center",
      color: "text.primary",
      fontSize: "16px", // Match canvas font size & family
      fontFamily: "Arial",
      // Not a theme-resolvable key in `sx`, so it takes the canvas value; it is
      // the same navy as `text.primary`.
      caretColor: COLORS.ELEMENT_STROKE,
    },
  };

  const renderContent = () => {
    if (mode === "ratio") {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            height: "36px",
            border: "2px solid",
            borderColor: "text.primary",
            borderRadius: "18px",
            backgroundColor: "primary.contrastText",
            padding: "0 6px",
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
                onCancel();
            }}
            inputRef={inputRef1}
            autoComplete="off"
            sx={{
              ...commonInputStyles,
              width: `${Math.max(18, val1.length * 9 + 10)}px`,
            }}
          />
          <Typography
            sx={{
              color: "text.primary",
              mx: -0.3,
              userSelect: "none",
              fontSize: "16px",
              fontFamily: "Arial",
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
                onCancel();
            }}
            inputRef={inputRef2}
            autoComplete="off"
            sx={{
              ...commonInputStyles,
              width: `${Math.max(18, val2.length * 9 + 10)}px`,
            }}
          />
        </Box>
      );
    }

    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          border: "2px solid",
          borderColor: "text.primary",
          borderRadius: "6px",
          backgroundColor: "primary.contrastText",
          padding: "0 4px",
        }}
      >
        <TextField
          size="small"
          value={val1}
          onChange={(e) => setVal1(filterInput(e.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={() => onCancel()}
          inputRef={inputRef1}
          autoComplete="off"
          sx={{
            ...commonInputStyles,
            width: `${Math.max(30, val1.length * 9 + 10)}px`,
          }}
        />
        {suffix && (
          <Typography
            sx={{
              color: "text.primary",
              ml: -0.5,
              mr: 0.5,
              userSelect: "none",
              fontSize: "16px",
              fontFamily: "Arial",
            }}
          >
            {suffix}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        position: "absolute",
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        boxShadow: 4,
        borderRadius: mode === "ratio" ? "18px" : "6px",
      }}
    >
      {renderContent()}
    </Box>
  );
};
export { value2ratio as valueToRatioParts };
