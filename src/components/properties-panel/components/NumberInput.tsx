import React, {
  useRef,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
} from "react";
import { TextField, IconButton, Box, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { KeyboardArrowUp, KeyboardArrowDown } from "@mui/icons-material";
import {
  QuantityKind,
  QuantityUnit,
  display_unit,
  filter_quantity_input,
  is_entry_in_progress,
  parse_quantity,
  to_mantissa,
} from "../../../utils/quantity-format";
import { t } from "../../../i18n";
import { useHistorySeal } from "../../mechanism/history-seal";

const RAW_UNIT: QuantityUnit = { symbol: "", factor: 1 };

/** Icon button docked inside the field, right of the stepper arrows. */
export interface NumberInputAdornment {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  color?: "primary" | "secondary" | "inherit";
  /** Greyed out and unclickable, the field's value being already what a click would set it to. */
  disabled?: boolean;
}

interface NumberInputProps {
  label: string;
  /** Tooltip shown on hover, explaining the field to someone who doesn't know it yet. */
  title: string;
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
  /** The increment the arrows snap to between two whole numbers, in the displayed unit.
   * Defaults to the last decimal `precision` shows, which is what a spinner conventionally steps; give it where the two disagree, a field showing three decimals of a value read in units being unusable at a thousandth per click. */
  fineStep?: number;
  /** Formats and parses `value` (always SI) as a physical quantity instead of a bare number.
   * The unit is plain text alongside the digits — part of what is shown and edited, not a decoration next to it — so typing over it ("12mm", "3cm", "150kN") is how a unit is overridden for that one entry. */
  kind?: QuantityKind;
  /** A read-only view of `value` — the catalogue's own entries, never a mechanism's own. No
   * focus, no stepper, no edits reach `onChange`. */
  disabled?: boolean;
  /** `value` is not stored on the element: it is derived from something else the panel already
   * shows, and the element follows that as long as nothing is typed here.
   * Shown in italics, so a field standing for a default reads as one. */
  implicit?: boolean;
  /** `value` is one arbitrary member of a multi-selection that doesn't actually agree on it — the
   * field says so instead of showing a value that would look settled when it isn't. Typing still works as normal and is read the same way by `onChange`. */
  mixed?: boolean;
  /** What the field commands is not happening — a motor the mechanism will not follow.
   * The value itself is valid, so the field is painted like a refusal without being one, and stays editable: changing it is how one gets out. */
  alert?: boolean;
  /** The value is the bound currently being hit — a motor giving its whole torque.
   * Information rather than a fault, so a softer tint than `alert`, which wins over it. */
  atLimit?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  title,
  value,
  onChange,
  step = 1,
  large = false,
  accent = false,
  unsigned = false,
  adornment,
  pillAdornment = false,
  precision = 1,
  fineStep,
  kind,
  disabled = false,
  implicit = false,
  mixed = false,
  alert = false,
  atLimit = false,
}) => {
  const unit = kind ? display_unit(value, kind, precision) : RAW_UNIT;
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
  // Hovering the adornment bubbles up into the field's own Tooltip (mouseover bubbles), which would otherwise stack the field's title on top of the adornment's own — blank the field's out for as long as the adornment's shows.
  const [adornmentHovered, setAdornmentHovered] = useState(false);
  // One key per field, so a run of steps here ends the one another field had open.
  const seal = useHistorySeal();
  const sealKey = React.useId();

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
  const grain = fineStep ?? Math.pow(10, -rounding);
  // Pill-shaped right edge for the direction adornment (SignedNumberInput only).
  const adornmentRadius = (height + 4) / 2;

  const [localValue, setLocalValue] = useState<string>(format(value));

  useEffect(() => {
    // A field being typed into owns its text; a live-updating `value` (a running simulation's reading, say) must not overwrite it mid-edit — onFocus already primed `localValue` once, and onBlur reads it back through `commitLocalValue`.
    if (focused) return;
    setLocalValue(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rounding, unit.factor, focused]);

  const inputRef = useRef<HTMLInputElement>(null);
  // Caret position to restore once a filtered keystroke's reformatted text reaches the DOM.
  const pendingCaretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [localValue]);

  // Out of focus the field is a view of the value, never of a leftover edit — except `mixed`, which has no single value to show and starts blank instead.
  const displayed = focused ? localValue : mixed ? "" : format(value);

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
      const step_once = () => {
        seal.arm(sealKey);
        onChange(getSteppedValue() * unit.factor);
      };
      step_once();
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(step_once, holdInterval);
      }, holdDelay);
    },
    [
      baseValue,
      grain,
      holdDelay,
      holdInterval,
      onChange,
      seal,
      sealKey,
      step,
      unit.factor,
    ],
  );

  const filterInput = (val: string) =>
    filter_quantity_input(val, { unit: !!kind, signed: !unsigned });

  const parseLocal = (text: string): number | null => {
    const parsed = kind ? parse_quantity(text, kind, unit) : parseFloat(text);
    return parsed === null || isNaN(parsed) ? null : parsed;
  };
  const entered = parseLocal(localValue);
  // A refusal shows up while typing rather than only at blur, so leaving the field on an unusable entry isn't a silent discard.
  // A field still being filled stays neutral.
  const refused =
    focused &&
    localValue.trim() !== "" &&
    !is_entry_in_progress(localValue) &&
    entered === null;

  // Leaving the field validates the entry; an unreadable one is dropped and the field goes back to showing the value.
  // Entering what it already showed changes nothing — unless it showed nothing to begin with, `value` then being one element's among several that differ, and typing it the value the others are being given.
  // Text first, value second: the two say different things.
  // Out and back in without an edit leaves text the field itself wrote, whatever junk the last bits of `value` carry; a unit retyped over an equal value ("15 T/m³" for "15 g/cm³") is a different text for the very same double, and is as much of a non-edit.
  const commitLocalValue = () => {
    if (!mixed && localValue === format(value)) return;
    if (entered === null) return;
    if (!mixed && entered === value) return;
    onChange(entered);
    seal.close();
  };

  return (
    <Tooltip title={adornmentHovered ? "" : title}>
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
          placeholder={mixed ? t("mixed_value") : undefined}
          // An empty field would otherwise keep its label sitting on the placeholder.
          InputLabelProps={mixed ? { shrink: true } : undefined}
          inputProps={{ inputMode: "decimal" }}
          value={displayed}
          onChange={(e) => {
            const raw = e.target.value;
            const cursor = e.target.selectionStart ?? raw.length;
            // Filtering can reshape the typed text (comma to dot, a stray sign dropped…), so the caret's post-keystroke offset must be recomputed on the filtered prefix rather than reused as-is.
            pendingCaretRef.current = filterInput(raw.slice(0, cursor)).length;
            setLocalValue(filterInput(raw));
          }}
          inputRef={inputRef}
          onFocus={() => {
            setLocalValue(mixed ? "" : format(value));
            setFocused(true);
            // The unit suffix is part of the displayed text but not something a user overwriting the number wants swept up with it — select just the digits.
            // Deferred: a focus from a click still has its mouseup to come, which would otherwise collapse the selection to the click point right after this.
            // Mixed starts blank, so there's nothing to select.
            if (!mixed) {
              const mantissaLength = to_mantissa(value, unit, precision).toString().length;
              setTimeout(() => inputRef.current?.setSelectionRange(0, mantissaLength), 10);
            }
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
              ...(implicit &&
                !focused && { fontStyle: "italic", color: "text.secondary" }),
            },
            "& .MuiInputBase-root": {
              marginY: "-2px",
              overflow: "hidden",
              ...(pillAdornment && {
                borderTopRightRadius: adornmentRadius,
                borderBottomRightRadius: adornmentRadius,
              }),
              ...(accent && {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.15),
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "primary.main",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "primary.main",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: (theme) => alpha(theme.palette.primary.main, 0.5),
                },
              }),
              ...(atLimit && {
                backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.15),
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "warning.main",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "warning.main",
                },
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "warning.main",
                },
              }),
              // Wins over `accent`'s tint above it: what is wrong is worth surfacing even on an already-coloured field like the motor's torque or speed.
              ...((refused || alert) && {
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
            "& .MuiInputLabel-root": {
              fontSize: large ? "1em" : "0.92em",
              pl: large ? 0 : 0.4,
              // Colour only: the accent must never shift a label's size or position, or two neighbouring fields stop lining up.
              ...(accent && { color: "primary.main", fontWeight: 500 }),
              ...(atLimit && { color: "warning.main", fontWeight: 500 }),
              ...(alert && { color: "error.main", fontWeight: 500 }),
            },
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
                  <Tooltip title={adornment.title}>
                    {/* The hover lives on the wrapper, not the button: a disabled
                        button takes no pointer event, and would leave both the
                        tooltip and the field's own title unswapped. */}
                    <Box
                      component="span"
                      sx={{ display: "flex" }}
                      onMouseEnter={() => {
                        setAdornmentHovered(true);
                        adornment.onMouseEnter?.();
                      }}
                      onMouseLeave={() => {
                        setAdornmentHovered(false);
                        adornment.onMouseLeave?.();
                      }}
                    >
                      <IconButton
                        color={adornment.color}
                        // A click on the icon is a decision, like a typed value: its own entry, and it ends whatever run the arrows had open.
                        onClick={() => {
                          adornment.onClick();
                          seal.close();
                        }}
                        disabled={adornment.disabled}
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
                          // Nothing shared to state: the icon says what a click would do, not where the elements currently stand.
                          ...(mixed && { opacity: 0.45 }),
                        }}
                      >
                        <adornment.icon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  </Tooltip>
                )}
              </Box>
            ),
          }}
        />
      </Box>
    </Tooltip>
  );
};

export default NumberInput;
