import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, InputBase, Tooltip } from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { t } from "../../../i18n";

/** Two digits: more turns than that is no longer a winch anyone draws, and the field stays as narrow as its neighbours. */
const MAX_TURNS = 99;
const clamp = (turns: number) => Math.min(MAX_TURNS, Math.max(0, turns));

interface TurnsInputProps {
  /** Whole turns, from 0 to `MAX_TURNS`. */
  value: number;
  onChange: (turns: number) => void;
}

/**
 * The whole turns a belt winds a pulley by, edited in place on the connection row that names the pair.
 * A count, so it holds integers only: typed, stepped with the arrow keys, or with the two chevrons beside it — the stepper every number field carries, at the size of the row's buttons.
 */
export const TurnsInput: React.FC<TurnsInputProps> = ({ value, onChange }) => {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const turns = clamp(Math.round(Number(raw)));
    if (raw !== "" && Number.isFinite(turns) && turns !== value) onChange(turns);
    else setText(String(value));
  };
  const step = (by: 1 | -1) => {
    const next = clamp(value + by);
    if (next !== value) onChange(next);
  };
  const chevron = (by: 1 | -1) => (
    <IconButton
      size="small"
      color="secondary"
      aria-label={by > 0 ? "+1" : "-1"}
      // Kept from taking the focus, so an entry being typed is not committed by the step that follows it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        step(by);
      }}
      sx={{
        p: 0,
        pb: by > 0 ? 0 : 0.25,
        mb: by > 0 ? 0 : -0.25,
        pt: by > 0 ? 0.25 : 0,
        mt: by > 0 ? -0.25 : 0,
        height: 11,
        borderRadius: 1,
        // The button keeps its reach; only the chevron drawn inside it is small.
        width: 15,
        fontSize: "11px",
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      {by > 0 ? (
        <KeyboardArrowUp fontSize="inherit" />
      ) : (
        <KeyboardArrowDown fontSize="inherit" />
      )}
    </IconButton>
  );

  return (
    <Tooltip title={t("wound_turns")}>
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          borderTopLeftRadius: 20,
          borderBottomLeftRadius: 20,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
          my: -0.5,
          ml: -0.25,
          mr: 0.25,
          pl: 0.5,
          "&:hover, &:focus-within": { backgroundColor: "action.hover" },
        }}
      >
        <InputBase
          value={text}
          inputRef={inputRef}
          inputProps={{
            inputMode: "numeric",
            "aria-label": t("wound_turns"),
            style: { textAlign: "center", padding: 0 },
          }}
          onFocus={() => {
            setFocused(true);
            // Deferred: a focus from a click still has its mouseup to come, which would collapse the selection to the click point.
            setTimeout(() => inputRef.current?.select(), 10);
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") {
              setText(String(value));
              setFocused(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              step(e.key === "ArrowUp" ? 1 : -1);
            }
          }}
          sx={{
            // As wide as the number shown, no wider: a single digit centred in room for two leaves a gap on its left, and the whole field reads as pushed right.
            width: `${Math.max(1, text.length)}ch`,
            fontSize: "1rem",
            fontWeight: 500,
            color: "secondary.main",
          }}
        />
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {chevron(1)}
          {chevron(-1)}
        </Box>
      </Box>
    </Tooltip>
  );
};

export default TurnsInput;
