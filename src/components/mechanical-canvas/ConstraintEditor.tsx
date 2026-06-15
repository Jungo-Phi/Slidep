import React, { useState, useEffect, useRef } from "react";
import { TextField, Typography, Box } from "@mui/material";
import { ConstraintElement } from "../../types/element";
import { Point2 } from "../../types/point2";
import { COLORS } from "../../constants/rendering-specs";
import { value_to_ratio_parts } from "../../utils";

interface ConstraintEditorProps {
  constraint: ConstraintElement;
  position: Point2;
  onCommit: (newValue: number) => void;
  onCancel: (constraint: ConstraintElement) => void;
}

export const ConstraintEditor: React.FC<ConstraintEditorProps> = ({
  constraint,
  position,
  onCommit,
  onCancel,
}) => {
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");

  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ("value" in constraint) {
      if (constraint.type === "gear-ratio") {
        const [n, d] = value_to_ratio_parts(constraint.value);
        setVal1(n);
        setVal2(d);
      } else {
        setVal1((Math.round(constraint.value * 10) / 10).toString());
      }
    }
    setTimeout(() => {
      inputRef1.current?.focus();
      inputRef1.current?.select();
    }, 10);
  }, [constraint]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const v1 = parseFloat(val1);
      if (v1 === 0) {
        onCancel(constraint);
        return;
      }
      const v2 = constraint.type === "gear-ratio" ? parseFloat(val2) : 1;
      if (!isNaN(v1) && !isNaN(v2) && v2 !== 0) {
        onCommit(v1 / v2);
      } else {
        onCancel(constraint);
      }
    } else if (e.key === "Escape") {
      onCancel(constraint);
    } else if (constraint.type === "gear-ratio") {
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
      color: COLORS.STROKE,
      fontSize: "16px", // Match canvas font size & family
      fontFamily: "Arial",
      caretColor: COLORS.STROKE,
    },
  };

  const renderContent = () => {
    if (constraint.type === "gear-ratio") {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            height: "36px",
            border: `2px solid ${COLORS.STROKE}`,
            borderRadius: "18px",
            backgroundColor: "white",
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
                onCancel(constraint);
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
              color: COLORS.STROKE,
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
                onCancel(constraint);
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
          border: `2px solid ${COLORS.STROKE}`,
          borderRadius: "6px",
          backgroundColor: "white",
          padding: "0 4px",
        }}
      >
        <TextField
          size="small"
          value={val1}
          onChange={(e) => setVal1(filterInput(e.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={() => onCancel(constraint)}
          inputRef={inputRef1}
          autoComplete="off"
          sx={{
            ...commonInputStyles,
            width: `${Math.max(30, val1.length * 9 + 10)}px`,
          }}
        />
        {constraint.type === "dimension-angle" && (
          <Typography
            sx={{
              color: COLORS.STROKE,
              ml: -0.5,
              mr: 0.5,
              userSelect: "none",
              fontSize: "16px",
              fontFamily: "Arial",
            }}
          >
            °
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
        borderRadius: constraint.type === "gear-ratio" ? "18px" : "6px",
      }}
    >
      {renderContent()}
    </Box>
  );
};
export { value_to_ratio_parts as valueToRatioParts };
