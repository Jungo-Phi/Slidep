import React from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Check,
  MoreHoriz,
  Remove,
  Visibility,
  VisibilityOff,
  KeyboardArrowDown,
} from "@mui/icons-material";
import {
  Action,
  BEAM_STRESS_LENS_ORDER,
  BeamStressLens,
  MechanicalElement,
  OVERLAY_KIND_ORDER,
  OverlayKind,
} from "../../types";
import {
  OVERLAY_LABEL_KEYS,
  any_overlay_shown,
  overlay_count,
  overlay_label_count,
  overlay_targets,
  set_all_overlays,
} from "../properties-panel/overlay-actions";
import { t, tn } from "../../i18n";

const BEAM_STRESS_LENS_LABEL_KEYS = {
  none: "beam_stress_lens_none",
  normal: "beam_stress_lens_normal",
  bending: "beam_stress_lens_bending",
  utilization: "beam_stress_lens_utilization",
  shear: "beam_stress_lens_shear",
} as const;

interface OverlaysMenuProps {
  mechanicalElements: MechanicalElement[];
  applyActions: (actions: Action[]) => void;
  /** Which reading tints every beam's fill, mechanism-wide — see `BeamStressLens`'s own doc
   *  (docs/plan-efforts-interieurs.md phase 9). Lives here, not in `mechanicalElements`'
   *  own `OverlayFlags`: unlike trajectories/forces/velocities, the four readings share one
   *  physical slot (a beam's own fill), so this is a single choice, not a checkbox. */
  beamStressLens: BeamStressLens;
  onChangeBeamStressLens: (lens: BeamStressLens) => void;
  /** Trajectory overlay style: dots at fixed spacing versus one continuous stroke. */
  trajectoryDotted: boolean;
  onChangeTrajectoryDotted: (dotted: boolean) => void;
  /** Drops the button's label, keeping the eye and the caret. */
  condensed?: boolean;
}

interface OverlayMenuRowProps {
  kind: OverlayKind;
  shown: number;
  total: number;
  /** Passed to `tn` for the row's label — not `total`, see `overlay_label_count`. */
  labelCount: number;
  onSetAll: (show: boolean) => void;
  /** Extra control rendered between the counter and the show/hide icons — the trajectory row's style toggle. */
  children?: React.ReactNode;
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
  labelCount,
  onSetAll,
  children,
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
      {tn(OVERLAY_LABEL_KEYS[kind], labelCount)}
    </Typography>
    {children}
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
    <Tooltip title={t("show_all")}>
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
    <Tooltip title={t("hide_all")}>
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
  beamStressLens,
  onChangeBeamStressLens,
  trajectoryDotted,
  onChangeTrajectoryDotted,
  condensed = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const anyShown =
    any_overlay_shown(mechanicalElements) || beamStressLens !== "none";

  const setAll = (kind: OverlayKind, show: boolean) => {
    const actions = set_all_overlays(mechanicalElements, kind, show);
    if (actions.length > 0) applyActions(actions);
  };

  return (
    <>
      <Tooltip title={condensed ? t("show_tooltip") : ""}>
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
          {condensed ? null : t("show")}
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
            const labelCount = overlay_label_count(
              overlay_targets(mechanicalElements, kind),
              kind,
            );
            return (
              <OverlayMenuRow
                key={kind}
                kind={kind}
                shown={shown}
                total={total}
                labelCount={labelCount}
                onSetAll={(show) => setAll(kind, show)}
              >
                {kind === "trajectory" && (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={trajectoryDotted ? "dotted" : "continuous"}
                    onChange={(_e, value) => {
                      if (value) onChangeTrajectoryDotted(value === "dotted");
                    }}
                    sx={{ ml: 0.5, "& .MuiToggleButton-root": { p: 0.5 } }}
                  >
                    <Tooltip
                      title={t("trajectory_style_continuous")}
                    >
                      <ToggleButton value="continuous">
                        <Remove fontSize="small" />
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip
                      title={t("trajectory_style_dotted")}
                    >
                      <ToggleButton value="dotted">
                        <MoreHoriz fontSize="small" />
                      </ToggleButton>
                    </Tooltip>
                  </ToggleButtonGroup>
                )}
              </OverlayMenuRow>
            );
          })}
        </Box>
        <Divider />
        <Box sx={{ py: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ px: 1.5, display: "block" }}
          >
            {t("beam_stress_lens")}
          </Typography>
          {BEAM_STRESS_LENS_ORDER.map((lens) => (
            <MenuItem
              key={lens}
              dense
              selected={lens === beamStressLens}
              onClick={() => onChangeBeamStressLens(lens)}
            >
              <ListItemIcon>
                {lens === beamStressLens && <Check sx={{ fontSize: 18 }} />}
              </ListItemIcon>
              <Typography variant="body2">
                {t(BEAM_STRESS_LENS_LABEL_KEYS[lens])}
              </Typography>
            </MenuItem>
          ))}
        </Box>
      </Menu>
    </>
  );
};

export default OverlaysMenu;
