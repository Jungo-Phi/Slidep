import React from "react";
import {
  Box,
  Button,
  Divider,
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
import CommandCountRow from "../properties-panel/components/CommandCountRow";
import {
  OVERLAY_ICON_SIZE,
  overlay_icon,
  reading_icon,
} from "../properties-panel/element-readings";
import { useNonModalPopup } from "../common/use-non-modal-popup";
import { TOP_BAR_CONTROL_HEIGHT } from "./toolbar-metrics";
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
   * (docs/plan-efforts-interieurs.md phase 9).
   * Lives here, not in `mechanicalElements`' own `OverlayFlags`: unlike trajectories/forces/velocities, the four readings share one physical slot (a beam's own fill), so this is a single choice, not a checkbox. */
  beamStressLens: BeamStressLens;
  onChangeBeamStressLens: (lens: BeamStressLens) => void;
  /** Resting on a lens tries it on, as resting on a theme does in the settings menu — `null` puts the chosen one back.
   * Only the beams and the legend follow: the tick below stays on the lens actually chosen. */
  onPreviewBeamStressLens: (lens: BeamStressLens | null) => void;
  /** Trajectory overlay style: dots at fixed spacing versus one continuous stroke. */
  trajectoryDotted: boolean;
  onChangeTrajectoryDotted: (dotted: boolean) => void;
  /** The whole system's free body: every support reaction and every applied load marked at once (docs/plan-efforts-interieurs.md phase 8).
   * Here rather than on the elements for the same reason the lens is: a support reaction is a property of the problem, not of the element it happens to sit on. */
  supportReactions: boolean;
  onChangeSupportReactions: (on: boolean) => void;
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

/** One layer of the menu: the bulk pair, under the layer's own name. */
const OverlayMenuRow: React.FC<OverlayMenuRowProps> = ({
  kind,
  shown,
  total,
  labelCount,
  onSetAll,
  children,
}) => (
  <CommandCountRow
    icon={overlay_icon(kind)}
    label={tn(OVERLAY_LABEL_KEYS[kind], labelCount)}
    on={shown}
    total={total}
    onSetAll={onSetAll}
  >
    {children}
  </CommandCountRow>
);

/**
 * The "Afficher ▾" top-bar button: the bulk commands for the display layers.
 * Per-element control lives on the element itself (its panel switch); this menu only does what an element cannot — act on all of them at once.
 *
 * The button's eye is open as soon as one layer shows one element, shut when nothing is drawn: a single unambiguous bit ("something is superposed on my canvas"), carried by the icon itself rather than by a colour change.
 */
export const OverlaysMenu: React.FC<OverlaysMenuProps> = ({
  mechanicalElements,
  applyActions,
  beamStressLens,
  onChangeBeamStressLens,
  onPreviewBeamStressLens,
  trajectoryDotted,
  onChangeTrajectoryDotted,
  supportReactions,
  onChangeSupportReactions,
  condensed = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const popup = useNonModalPopup(!!anchorEl, anchorEl, () => {
    onPreviewBeamStressLens(null);
    setAnchorEl(null);
  });
  const anyShown =
    any_overlay_shown(mechanicalElements) ||
    beamStressLens !== "none" ||
    supportReactions;

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
          onClick={(e) => {
            const button = e.currentTarget;
            setAnchorEl((current) => (current ? null : button));
          }}
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
            py: 0,
            // Held explicitly because the label carries the height: dropping it in `condensed` would otherwise shrink the button.
            minHeight: TOP_BAR_CONTROL_HEIGHT,
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
        {...popup}
        anchorEl={anchorEl}
        open={!!anchorEl}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        // Leaving the list drops the preview, armed or showing, and puts the chosen lens back.
        MenuListProps={{ onMouseLeave: () => onPreviewBeamStressLens(null) }}
      >
        {/* Coming back up to the layers is leaving the lenses, the pointer never having left the list. */}
        <Box
          sx={{ py: 0.5 }}
          onMouseEnter={() => onPreviewBeamStressLens(null)}
        >
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
                    sx={{
                      ml: 0.5,
                      "& .MuiToggleButton-root": { p: 0 },
                    }}
                  >
                    <Tooltip title={t("trajectory_style_continuous")}>
                      <ToggleButton value="continuous">
                        <Remove fontSize="small" />
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title={t("trajectory_style_dotted")}>
                      <ToggleButton value="dotted">
                        <MoreHoriz fontSize="small" />
                      </ToggleButton>
                    </Tooltip>
                  </ToggleButtonGroup>
                )}
              </OverlayMenuRow>
            );
          })}
          <Divider sx={{ my: 0.5 }} />
          {/* A fourth layer, but one switch for the whole mechanism rather than a bulk pair over a set — so it reads as an element's own overlay switch does (`ProbesSection`), not as the rows above. */}
          <Box
            component="button"
            type="button"
            role="switch"
            aria-checked={supportReactions}
            onClick={() => onChangeSupportReactions(!supportReactions)}
            sx={(theme) => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              pl: 1.5,
              pr: 4,
              py: 0.5,
              border: 0,
              cursor: "pointer",
              color: supportReactions ? "text.primary" : "text.secondary",
              backgroundColor: "transparent",
              "&:hover": { backgroundColor: theme.palette.action.hover },
            })}
          >
            <Box sx={{ display: "flex", direction: "row", gap: 0.5 }}>
              <Box
                component="img"
                src={reading_icon("reaction-support")}
                alt=""
                sx={{ width: OVERLAY_ICON_SIZE, height: OVERLAY_ICON_SIZE }}
              />
              <Typography variant="body2">{t("support_reactions")}</Typography>
            </Box>
            {supportReactions ? (
              <Visibility fontSize="small" />
            ) : (
              <VisibilityOff fontSize="small" />
            )}
          </Box>
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
              onClick={() => {
                onPreviewBeamStressLens(null);
                onChangeBeamStressLens(lens);
              }}
              onMouseEnter={() => onPreviewBeamStressLens(lens)}
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
