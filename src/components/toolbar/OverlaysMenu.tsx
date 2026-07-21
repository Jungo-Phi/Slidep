import React from "react";
import {
  Box,
  Button,
  IconButton,
  Menu,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  KeyboardArrowDown,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  MechanicalElement,
  OVERLAY_KIND_ORDER,
  OverlayKind,
} from "../../types";
import {
  OVERLAY_LABELS,
  any_overlay_shown,
  overlay_count,
  set_all_overlays,
} from "../properties-panel/overlay-actions";

interface OverlaysMenuProps {
  mechanicalElements: MechanicalElement[];
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  /** Drops the "Afficher" label, keeping the eye and the caret. */
  condensed?: boolean;
}

interface OverlayMenuRowProps {
  kind: OverlayKind;
  shown: number;
  total: number;
  onSetAll: (show: boolean) => void;
}

/**
 * One layer: label, n/total counter, and the two bulk commands as bare icons.
 * The counter carries the ternary state (none / some / all) — which is what
 * makes the pair legible as two commands rather than one toggle — so the icons
 * only have to carry the action, not the state.
 */
const OverlayMenuRow: React.FC<OverlayMenuRowProps> = ({
  kind,
  shown,
  total,
  onSetAll,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.5,
      px: 1.5,
      py: 0.25,
      opacity: total === 0 ? 0.4 : 1,
    }}
  >
    <Typography variant="body2" sx={{ flex: 1, whiteSpace: "nowrap" }}>
      {OVERLAY_LABELS[kind]}
    </Typography>
    <Typography
      variant="caption"
      color="inherit"
      sx={{
        pr: 0.5,
        minWidth: 30,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {shown}/{total}
    </Typography>
    <Tooltip disableInteractive title="Tout afficher">
      <span>
        <IconButton
          size="small"
          color="inherit"
          onClick={() => onSetAll(true)}
          disabled={total === 0 || shown === total}
          sx={{ p: 0.5 }}
        >
          <Visibility fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
    <Tooltip disableInteractive title="Tout cacher">
      <span>
        <IconButton
          size="small"
          color="inherit"
          onClick={() => onSetAll(false)}
          disabled={total === 0 || shown === 0}
          sx={{ p: 0.5 }}
        >
          <VisibilityOff fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  </Box>
);

/**
 * The "Afficher ▾" top-bar button: the bulk commands for the display layers.
 * Per-element control lives on the element itself (its panel switch); this menu
 * only does what an element cannot — act on all of them at once.
 *
 * The button's eye is open as soon as one layer shows one element, shut when
 * nothing is drawn: a single unambiguous bit ("something is superposed on my
 * canvas"), carried by the icon itself rather than by a colour change.
 */
export const OverlaysMenu: React.FC<OverlaysMenuProps> = ({
  mechanicalElements,
  applyActions,
  condensed = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const anyShown = any_overlay_shown(mechanicalElements);

  const setAll = (kind: OverlayKind, show: boolean) => {
    const actions = set_all_overlays(mechanicalElements, kind, show);
    if (actions.length > 0) applyActions(actions, "Other");
  };

  return (
    <>
      <Tooltip
        disableInteractive
        title={condensed ? "Afficher les calques" : ""}
      >
        <Button
          color="inherit"
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          startIcon={
            anyShown ? (
              <Visibility sx={{ fontSize: "18px !important" }} />
            ) : (
              <VisibilityOff sx={{ fontSize: "18px !important" }} />
            )
          }
          endIcon={
            <KeyboardArrowDown
              sx={{ ml: -0.5, fontSize: "16px !important", opacity: 0.7 }}
            />
          }
          sx={{
            fontSize: "0.72rem",
            fontWeight: 600,
            textTransform: "none",
            px: 0.75,
            py: 0.25,
            minWidth: 0,
            letterSpacing: 0,
            // Icon-only: the label's slot would otherwise keep its gap.
            "& .MuiButton-startIcon": { mr: condensed ? 0 : undefined },
          }}
        >
          {condensed ? null : "Afficher"}
        </Button>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box sx={{ py: 0.5 }}>
          {OVERLAY_KIND_ORDER.map((kind) => {
            const { shown, total } = overlay_count(mechanicalElements, kind);
            return (
              <OverlayMenuRow
                key={kind}
                kind={kind}
                shown={shown}
                total={total}
                onSetAll={(show) => setAll(kind, show)}
              />
            );
          })}
        </Box>
      </Menu>
    </>
  );
};

export default OverlaysMenu;
