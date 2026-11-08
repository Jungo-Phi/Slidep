import React, { useEffect, useRef, useState } from "react";
import { Point2 } from "../../../types";
import { element_to_hovered_part } from "../utils";
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  SvgIconProps,
} from "@mui/material";
import {
  AddToPhotos,
  CenterFocusStrong,
  Check,
  ChevronRight,
  ContentCopy,
  ContentCut,
  ContentPaste,
  Delete,
  Flip,
  Link,
  LinkOff,
  RotateLeft,
  RotateRight,
  SelectAll,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { useNonModalPopup } from "../../common/use-non-modal-popup";
import { OVERLAY_ICON_SIZE } from "../../properties-panel/element-readings";
import { ContextEntries, ContextEntry, ContextHost } from "./context-entries";

/** `Flip` draws a vertical line with a shape on each side: turned, it says top and bottom. */
const FlipVertical: React.FC<SvgIconProps> = (props) => (
  <Flip {...props} sx={{ transform: "rotate(90deg)" }} />
);

const ICONS: Record<string, React.ElementType> = {
  "mirror-horizontal": Flip,
  "mirror-vertical": FlipVertical,
  copy: ContentCopy,
  cut: ContentCut,
  paste: ContentPaste,
  duplicate: AddToPhotos,
  delete: Delete,
  disconnect: LinkOff,
  "open-belt": LinkOff,
  "close-belt": Link,
  "reverse-motor-clockwise": RotateRight,
  "reverse-motor-counter": RotateLeft,
  "select-all": SelectAll,
  recenter: CenterFocusStrong,
  overlays: Visibility,
};

/** Where a menu opens: at a point on screen, or against an element. */
export type ContextMenuAnchor =
  | { kind: "position"; top: number; left: number }
  | { kind: "element"; element: HTMLElement };

function anchor_props(anchor: ContextMenuAnchor) {
  return anchor.kind === "position"
    ? {
        anchorReference: "anchorPosition" as const,
        anchorPosition: { top: anchor.top, left: anchor.left },
      }
    : { anchorEl: anchor.element };
}

const Row: React.FC<{
  entry: ContextEntry;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  onHover?: (hovered: boolean) => void;
}> = ({ entry, onClick, onHover }) => {
  const Icon = ICONS[entry.id];
  const dangerSx = entry.danger ? { color: "error.main" } : undefined;
  const EyeIcon = entry.shown ? Visibility : VisibilityOff;
  return (
    <MenuItem
      dense
      disabled={entry.disabled}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      role={entry.shown === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={entry.shown}
      aria-haspopup={entry.submenu ? "menu" : undefined}
      selected={entry.selected}
      sx={dangerSx}
    >
      <ListItemIcon sx={dangerSx}>
        {entry.iconSrc ? (
          <Box
            component="img"
            src={entry.iconSrc}
            alt=""
            sx={{ width: OVERLAY_ICON_SIZE, height: OVERLAY_ICON_SIZE }}
          />
        ) : (
          Icon && <Icon fontSize="small" />
        )}
      </ListItemIcon>
      <ListItemText>
        {entry.shortcut ? `${entry.label} (${entry.shortcut})` : entry.label}
      </ListItemText>
      {entry.shown !== undefined && (
        <EyeIcon
          fontSize="small"
          sx={{ ml: 2, color: entry.shown ? "text.primary" : "text.disabled" }}
        />
      )}
      {entry.selected && <Check fontSize="small" sx={{ ml: 2 }} />}
      {entry.submenu && <ChevronRight fontSize="small" sx={{ ml: 2, mr: -0.5 }} />}
    </MenuItem>
  );
};

interface ContextMenuProps {
  anchor: ContextMenuAnchor;
  entries: ContextEntries;
  host: ContextHost;
  onClose: () => void;
}

/**
 * The list of `context-entries`, wherever it was opened from.
 * The canvas underneath stays live: a press elsewhere dismisses the menu and is read as usual, so a second right click opens a new one straight away.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  anchor,
  entries,
  host,
  onClose,
}) => {
  const [submenu, setSubmenu] = useState<{
    id: string;
    element: HTMLElement;
  } | null>(null);
  const popup = useNonModalPopup(
    true,
    anchor.kind === "element" ? anchor.element : null,
    onClose,
  );

  // The canvas hears nothing while the pointer is on a menu, so a highlight left on would stay until it comes back.
  const highlightedRef = useRef(false);
  const setHoveredPartRef = useRef(host.setHoveredPart);
  setHoveredPartRef.current = host.setHoveredPart;
  const highlight = (entry: ContextEntry | undefined) => {
    if (entry?.highlights) {
      highlightedRef.current = true;
      setHoveredPartRef.current?.(
        element_to_hovered_part(entry.highlights, false),
      );
    } else if (highlightedRef.current) {
      highlightedRef.current = false;
      setHoveredPartRef.current?.({ type: "Void", position: new Point2(0, 0) });
    }
  };
  useEffect(
    () => () => {
      if (highlightedRef.current)
        setHoveredPartRef.current?.({ type: "Void", position: new Point2(0, 0) });
    },
    [],
  );

  const act = (entry: ContextEntry, element: HTMLElement) => {
    if (entry.submenu) {
      setSubmenu(submenu?.id === entry.id ? null : { id: entry.id, element });
      return;
    }
    entry.run?.(host);
    // An eye stays open, so that several can be flipped and each one seen to take.
    if (entry.shown === undefined) onClose();
  };

  const opened = entries.flat().find((entry) => entry.id === submenu?.id);
  return (
    <>
      <Menu open {...popup} {...anchor_props(anchor)}>
        {entries.flatMap((group, index) => [
          ...(index > 0 ? [<Divider key={`divider-${index}`} />] : []),
          ...group.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              onClick={(event) => act(entry, event.currentTarget)}
            />
          )),
        ])}
      </Menu>
      {submenu && opened?.submenu && (
        <Menu
          open
          {...popup}
          onClose={() => setSubmenu(null)}
          anchorEl={submenu.element}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          {opened.submenu.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              onClick={(event) => act(entry, event.currentTarget)}
              onHover={(hovered) => highlight(hovered ? entry : undefined)}
            />
          ))}
        </Menu>
      )}
    </>
  );
};
