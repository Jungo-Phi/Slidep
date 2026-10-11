import React, { useCallback, useEffect, useState } from "react";
import { TextField, Typography } from "@mui/material";

interface EditableNameProps {
  name: string;
  /** Called with the name typed, once confirmed — Enter or leaving the field — and only if it changed. */
  onRename: (name: string) => void;
  fontSize: string;
  fontWeight: number;
  /** Says when the field opens and closes, for a row that must not react to the pointer meanwhile. */
  onEditingChange?: (editing: boolean) => void;
  /** Says when the pointer rests on the name, for a row whose own tooltip must then step aside. */
  onHoverChange?: (hovered: boolean) => void;
}

/**
 * A name renamed in place: a click on it opens a field exactly as wide as what is typed, Enter or leaving confirms, Escape gives up.
 * The click stops there, so a row around the name keeps its own click for everything else.
 * Shared by the element cards and the rows of an element's page.
 */
export const EditableName: React.FC<EditableNameProps> = ({
  name,
  onRename,
  fontSize,
  fontWeight,
  onEditingChange,
  onHoverChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [width, setWidth] = useState(0);

  const setOpen = (open: boolean) => {
    setEditing(open);
    onEditingChange?.(open);
  };

  // The field grows with what is typed: measured off a hidden span in the same font, since an input has no width of its own content.
  const measure = useCallback(
    (text: string) => {
      const span = document.createElement("span");
      span.style.visibility = "hidden";
      span.style.position = "absolute";
      span.style.whiteSpace = "nowrap";
      span.style.fontWeight = fontWeight.toString();
      span.style.fontSize = fontSize;
      span.style.lineHeight = "1.5";
      span.textContent = text;
      document.body.appendChild(span);
      const measured = span.offsetWidth;
      document.body.removeChild(span);
      setWidth(Math.max(8, measured + 2));
    },
    [fontSize, fontWeight],
  );

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) measure(draft);
  }, [draft, editing, measure]);

  const commit = () => {
    if (draft !== name) onRename(draft);
    setOpen(false);
  };

  const textSx = {
    fontWeight,
    fontSize,
    color: "text.primary",
    lineHeight: 1.5,
    whiteSpace: "nowrap" as const,
  };

  if (editing)
    return (
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            commit();
          } else if (e.key === "Escape") {
            setDraft(name);
            setOpen(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        variant="standard"
        autoFocus
        sx={{
          width: `${width}px`,
          minWidth: 0,
          "& .MuiInputBase-input": {
            ...textSx,
            padding: 0,
            margin: 0,
            textOverflow: "clip",
            backgroundColor: "primary.contrastText",
            borderRadius: "2px",
            cursor: "text",
            overflow: "hidden",
            boxSizing: "content-box",
          },
          "& .MuiInput-underline:before": { borderBottom: "none" },
          "& .MuiInput-underline:hover:not(.Mui-disabled):before": {
            borderBottom: "none",
          },
          "& .MuiInput-underline:after": { borderBottom: "none" },
        }}
      />
    );

  return (
    <Typography
      onClick={(e) => {
        e.stopPropagation();
        measure(name);
        setOpen(true);
      }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      sx={{
        ...textSx,
        cursor: "text",
        userSelect: "none",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "inline-block",
        minWidth: 0,
      }}
    >
      {name}
    </Typography>
  );
};

export default EditableName;
