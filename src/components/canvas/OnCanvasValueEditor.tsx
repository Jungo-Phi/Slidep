import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { TextField, Typography, Box } from "@mui/material";
import { COLORS } from "../../theme/canvas-theme";
import { value2ratio } from "../../utils";
import { ScreenPoint } from "../../types";
import {
  QuantityKind,
  QuantityUnit,
  display_unit,
  filter_quantity_input,
  is_entry_in_progress,
  parse_quantity,
  to_mantissa,
} from "../../utils/quantity-format";
import { useHistorySeal } from "../mechanism/history-seal";

const RAW_UNIT: QuantityUnit = { symbol: "", factor: 1 };
/** Decimal places a canvas edit rounds to — the same as `NumberInput`'s own default. */
const PRECISION = 1;

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
  position: ScreenPoint;
  /** Formats and parses the field as a physical quantity instead of a bare number — the same
   * unit `NumberInput`'s `kind` would pick for `initialValue`, fixed for the life of this editor rather than re-picked as the user types, and part of the editable text itself rather than a decoration next to it.
   * "single" mode only. */
  kind?: QuantityKind;
  /**
   * Accept a leading minus.
   * The field always opens on a magnitude — a load's sign is a direction, and reading a "-" off a label helps nobody — but typing one is how the user turns that direction around from here.
   * What the sign then means is the caller's business.
   * "single" mode only.
   */
  signed: boolean;
  /**
   * Commit a zero instead of reading it as "cancel".
   * Zero is nonsense for most quantities an editor opens on (a dimension, a force, a ratio), but it is a real value for one end of a distributed load: it is what makes it triangular.
   * Callers pass it only when zero leaves something behind.
   */
  allowZero: boolean;
  onCommit: (newValue: number) => void;
  onCancel: () => void;
}

export const OnCanvasValueEditor: React.FC<OnCanvasValueEditorProps> = ({
  mode,
  initialValue,
  position,
  kind,
  signed,
  allowZero,
  onCommit,
  onCancel,
}) => {
  const seal = useHistorySeal();
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");
  // The unit `initialValue` opened in, fixed for the editor's lifetime rather than re-picked on every keystroke — an adaptive kind mid-edit would otherwise change what a typed number means as its magnitude crossed a prefix boundary.
  const [unit, setUnit] = useState<QuantityUnit>(RAW_UNIT);

  const inputRef1 = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);
  // Caret position to restore once a filtered keystroke's reformatted text reaches the DOM.
  const pendingCaretRef1 = useRef<number | null>(null);
  const pendingCaretRef2 = useRef<number | null>(null);

  useEffect(() => {
    // The unit suffix opens as part of the editable text but should never be swept up by the initial select-all — only the digits the user is actually here to overwrite.
    // Ratio mode selects each field's full text instead: neither part carries a unit.
    let mantissaLength: number | null = null;
    if (mode === "ratio") {
      const [n, d] = value2ratio(initialValue);
      setVal1(n);
      setVal2(d);
    } else {
      const openedUnit = kind ? display_unit(initialValue, kind, PRECISION) : RAW_UNIT;
      setUnit(openedUnit);
      const mantissa = to_mantissa(initialValue, openedUnit, PRECISION).toString();
      mantissaLength = mantissa.length;
      setVal1(openedUnit.symbol ? `${mantissa} ${openedUnit.symbol}` : mantissa);
    }
    setTimeout(() => {
      inputRef1.current?.focus();
      if (mantissaLength === null) inputRef1.current?.select();
      else inputRef1.current?.setSelectionRange(0, mantissaLength);
    }, 10);
  }, [mode, initialValue, kind]);

  /** What the fields hold, or null when they make no value the editor can take. */
  const entered = ((): number | null => {
    if (mode === "ratio") {
      const v1 = parseFloat(val1);
      const v2 = parseFloat(val2);
      if (isNaN(v1) || isNaN(v2) || v2 === 0) return null;
      if (v1 === 0 && !allowZero) return null;
      return v1 / v2;
    }
    const v1 = kind ? parse_quantity(val1, kind, unit) : parseFloat(val1);
    if (v1 === null || isNaN(v1)) return null;
    if (v1 === 0 && !allowZero) return null;
    return v1;
  })();

  // A refusal shows up while typing rather than at Enter, so pressing it on a value the editor will not take is not a silent no-op.
  // A field still being filled stays neutral.
  const filled = (val: string) => val.trim() !== "" && !is_entry_in_progress(val);
  const refused =
    entered === null && filled(val1) && (mode === "single" || filled(val2));

  // A validated value stands alone in the history: what it replaced is one Ctrl+Z away, however long the editor stayed open.
  const commit = (newValue: number) => {
    onCommit(newValue);
    seal.close();
  };

  const handleLeave = () => {
    if (entered === null) onCancel();
    else commit(entered);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      // An unusable entry keeps the editor open, on the red field that says why.
      if (entered !== null) commit(entered);
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

  // Ratio mode's two fields are bare numbers: a unit on either half of a ratio would say nothing the ratio itself doesn't.
  const filterInput = (val: string) =>
    filter_quantity_input(val, { unit: mode === "single" && !!kind, signed });

  useLayoutEffect(() => {
    if (pendingCaretRef1.current !== null) {
      inputRef1.current?.setSelectionRange(pendingCaretRef1.current, pendingCaretRef1.current);
      pendingCaretRef1.current = null;
    }
  }, [val1]);
  useLayoutEffect(() => {
    if (pendingCaretRef2.current !== null) {
      inputRef2.current?.setSelectionRange(pendingCaretRef2.current, pendingCaretRef2.current);
      pendingCaretRef2.current = null;
    }
  }, [val2]);

  // Filtering can reshape the typed text (comma to dot, a stray sign dropped…), so the caret's post-keystroke offset must be recomputed on the filtered prefix rather than reused as-is.
  const changeVal1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cursor = e.target.selectionStart ?? raw.length;
    pendingCaretRef1.current = filterInput(raw.slice(0, cursor)).length;
    setVal1(filterInput(raw));
  };
  const changeVal2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cursor = e.target.selectionStart ?? raw.length;
    pendingCaretRef2.current = filterInput(raw.slice(0, cursor)).length;
    setVal2(filterInput(raw));
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
      // Not a theme-resolvable key in `sx`, so it takes the canvas value; it is the same navy as `text.primary`.
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
            borderColor: refused ? "error.main" : "text.primary",
            borderRadius: "18px",
            // Opaque, not `alpha`'d: a translucent tint would let whatever the canvas happens to be drawing underneath show through and shift the colour.
            backgroundColor: (theme) =>
              refused
                ? `color-mix(in srgb, ${theme.palette.error.main} 20%, ${theme.palette.primary.contrastText})`
                : theme.palette.primary.contrastText,
            padding: "0 6px",
          }}
        >
          <TextField
            size="small"
            value={val1}
            onChange={changeVal1}
            onKeyDown={handleKeyDown}
            onBlur={(e) => {
              if (
                !e.relatedTarget ||
                (e.relatedTarget !== inputRef2.current &&
                  !inputRef2.current?.contains(e.relatedTarget as Node))
              )
                handleLeave();
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
            onChange={changeVal2}
            onKeyDown={handleKeyDown}
            onBlur={(e) => {
              if (
                !e.relatedTarget ||
                (e.relatedTarget !== inputRef1.current &&
                  !inputRef1.current?.contains(e.relatedTarget as Node))
              )
                handleLeave();
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
          borderColor: refused ? "error.main" : "text.primary",
          borderRadius: "6px",
          // Opaque, not `alpha`'d: a translucent tint would let whatever the canvas happens to be drawing underneath show through and shift the colour.
          backgroundColor: (theme) =>
            refused
              ? `color-mix(in srgb, ${theme.palette.error.main} 20%, ${theme.palette.primary.contrastText})`
              : theme.palette.primary.contrastText,
          padding: "0 4px",
        }}
      >
        <TextField
          size="small"
          value={val1}
          onChange={(e) => setVal1(filterInput(e.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={handleLeave}
          inputRef={inputRef1}
          autoComplete="off"
          sx={{
            ...commonInputStyles,
            width: `${Math.max(30, val1.length * 9 + 10)}px`,
          }}
        />
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
