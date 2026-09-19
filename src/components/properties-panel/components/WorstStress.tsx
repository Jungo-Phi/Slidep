import React from "react";
import {
  Box,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { MaterialDef, MechanicalElement, ProfileDef } from "../../../types";
import type { BeamElement } from "../../../types/element";
import type { HoveredAbscissa } from "../../../types/hovered-part";
import type { StressScaleCache, WorstBeamSeries } from "../../../types/runtime-state";
import { shear_admissible_stress } from "../../solver/recording/cohesion-field";
import { beam_strength } from "../../../utils/section-properties";
import { PERCENT, STRESS, display_unit } from "../../../utils/quantity-format";
import { getStorageItem, setStorageItem } from "../../../utils/storage";
import ProbeChart, { ChartCurve, PROBE_ELEMENT_COLORS } from "./ProbeChart";
import { StringKey, t } from "../../../i18n";

const MODES = ["stress", "shear"] as const;
type Mode = (typeof MODES)[number];

/** Named exactly as the beam-fill lenses are, because they rank the same two things: the chart and the calque have to be one vocabulary or the reader has to learn two. */
const MODE_LABEL_KEYS: Record<Mode, StringKey> = {
  stress: "beam_stress_lens_utilization",
  shear: "beam_stress_lens_shear",
};

const MODE_HINT_KEYS: Record<Mode, StringKey> = {
  stress: "worst_stress_normal_hint",
  shear: "worst_stress_shear_hint",
};

const STORAGE_KEY = "worstStressMode";

/** Which series of the cache each mode reads. */
const MODE_SERIES: Record<Mode, keyof Pick<StressScaleCache, "worstStress" | "worstShear">> = {
  stress: "worstStress",
  shear: "worstShear",
};

/**
 * The limit one mode is measured against, on one beam: `Re` for a normal stress, `τ_adm` for a shear one.
 * `undefined` where the beam's material or profile does not resolve, which is also when it contributes no reading at all.
 */
function limit_of(
  beam: BeamElement,
  mode: Mode,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): number | undefined {
  const strength = beam_strength(beam.materialID, beam.profileID, materials, profiles);
  if (!strength) return undefined;
  return mode === "stress" ? strength.Re : shear_admissible_stress(strength.Re);
}

/**
 * The one limit every contributing beam shares, or `undefined` when they differ.
 *
 * The test is on the LIMIT rather than on "a single material": two materials can happen to share an `Re`, and two profiles of one material always do — so this is both wider and more exact than asking about the material.
 * Where there is one, the ratios the cache holds can be shown as real stresses, since they are then that limit times the ratio and nothing has to be guessed.
 */
function shared_limit(
  beams: BeamElement[],
  mode: Mode,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): number | undefined {
  let shared: number | undefined;
  for (const beam of beams) {
    const limit = limit_of(beam, mode, materials, profiles);
    if (limit === undefined) continue;
    if (shared === undefined) shared = limit;
    else if (Math.abs(limit - shared) > 1e-9 * Math.max(limit, shared)) return undefined;
  }
  return shared;
}

/** One mode's curve over the recording, skipping the instants where no beam could be read. */
function mode_curve(worst: WorstBeamSeries, cache: StressScaleCache, scale: number) {
  const time: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < cache.count; i++) {
    const ratio = worst.ratio[i];
    if (Number.isNaN(ratio)) continue;
    time.push(cache.t[i]);
    values.push(ratio * scale);
  }
  return { t: time, values };
}

/** The recorded instant nearest `time`, or `-1` on an empty recording — always called with the instant the canvas is posed at, never with the one under the pointer. */
function instant_at(cache: StressScaleCache, time: number): number {
  if (cache.count === 0) return -1;
  let best = 0;
  for (let i = 1; i < cache.count; i++)
    if (Math.abs(cache.t[i] - time) < Math.abs(cache.t[best] - time)) best = i;
  return best;
}

/**
 * How close the whole mechanism is to giving way — the reading that has no element to hold it against, so it reads with nothing selected (see `EnergyBalance`, which shares the region).
 *
 * Always ranked by the ratio to each beam's own limit, never by the stress itself: those two do not name the same beam (`WorstBeamSeries`).
 * Shown in pascals against its limit where every contributing beam shares one, and as a bare fraction of the limit otherwise — the case where a stress in pascals would be comparing beams that cannot be compared.
 *
 * Which beam the curve is about is answered on the canvas rather than here: reading this chart marks the point of the beam the worst reading comes from, which names it and places it at once.
 * That mark is always taken at the instant the canvas is posed at, so scrubbing is what walks it from beam to beam.
 */
export const WorstStress: React.FC<{
  cache: StressScaleCache;
  elements: MechanicalElement[];
  materials: MaterialDef[];
  profiles: ProfileDef[];
  currentTime: number;
  onSeek: (time: number) => void;
  /** Where the worst reading of the instant ON SCREEN was taken, for the canvas to mark while this chart is being read — the same channel the selection inspector's own diagrams use. */
  setHoveredAbscissa: (hovered: HoveredAbscissa | null) => void;
}> = ({
  cache,
  elements,
  materials,
  profiles,
  currentTime,
  onSeek,
  setHoveredAbscissa,
}) => {
  const [mode, setMode] = React.useState<Mode>(() =>
    getStorageItem<Mode>(STORAGE_KEY, "stress"),
  );
  React.useEffect(() => {
    setStorageItem(STORAGE_KEY, mode);
  }, [mode]);

  // Withdrawn when the card goes away: a mark outliving the chart that named it would point at nothing.
  React.useEffect(() => () => setHoveredAbscissa(null), [setHoveredAbscissa]);

  // Only the beams the cache actually folded in: one added since the last recording has nothing to say yet, and would drag a limit into the comparison that no reading here was measured against.
  const beams = React.useMemo(
    () =>
      elements.filter(
        (el): el is BeamElement => el.type === "beam" && cache.beams.has(el.id),
      ),
    [elements, cache.beams],
  );

  const worst = cache[MODE_SERIES[mode]];
  const limit = shared_limit(beams, mode, materials, profiles);
  // Pascals need one limit behind the whole comparison; without one, only the fraction of each beam's own limit means anything.
  const curve = mode_curve(worst, cache, limit ?? 1);
  const peak = curve.values.reduce((best, v) => Math.max(best, v), 0);
  const unit = display_unit(peak, limit === undefined ? PERCENT : STRESS);

  const curves: ChartCurve[] = [
    {
      id: mode,
      color: PROBE_ELEMENT_COLORS[mode === "stress" ? 0 : 1],
      t: curve.t,
      values: curve.values,
    },
  ];

  const reference =
    limit === undefined
      ? { value: 1, label: t("worst_stress_limit") }
      : { value: limit, label: mode === "shear" ? "τ adm" : "Re" };

  // The caveat belongs to the whole curve, not to one instant: it says some of what is plotted is an attribution rather than a measurement, which stays true wherever the cursor sits.
  const anyIndeterminate = React.useMemo(() => {
    for (let i = 0; i < cache.count; i++)
      if (!Number.isNaN(worst.ratio[i]) && worst.determinate[i] === 0) return true;
    return false;
  }, [cache.count, worst]);

  return (
    <Box sx={{ px: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {t("worst_stress_heading")}
          <Typography component="span" variant="subtitle2" color="text.secondary">
            {` (${unit.symbol})`}
          </Typography>
        </Typography>
        {anyIndeterminate && (
          <Tooltip title={t("worst_stress_indeterminate_hint")}>
            <Chip
              label={t("worst_stress_indeterminate")}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 18, "& .MuiChip-label": { px: 0.75 }, fontSize: "0.65rem" }}
            />
          </Tooltip>
        )}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center", my: 0.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_e, value: Mode | null) => {
            if (value) setMode(value);
          }}
        >
          {MODES.map((candidate) => (
            <Tooltip key={candidate} title={t(MODE_HINT_KEYS[candidate])}>
              <ToggleButton
                value={candidate}
                sx={{ py: 0, px: 1, fontSize: "0.7rem", textTransform: "none" }}
              >
                {t(MODE_LABEL_KEYS[candidate])}
              </ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      </Box>
      <ProbeChart
        curves={curves}
        currentTime={currentTime}
        poolMax={0}
        ownFloor={0}
        unitFactor={unit.factor}
        showZero
        reference={reference}
        emptyMessage={t("chart_waiting")}
        onSeek={onSeek}
        onHover={(inside) => {
          const at = inside ? instant_at(cache, currentTime) : -1;
          const id = at < 0 ? null : worst.beamID[at];
          setHoveredAbscissa(
            at < 0 || id === null || id === undefined || Number.isNaN(worst.ratio[at])
              ? null
              : { beamID: id, s: worst.s[at] },
          );
        }}
      />
    </Box>
  );
};

export default WorstStress;
