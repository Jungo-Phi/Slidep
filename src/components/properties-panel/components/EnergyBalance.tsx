import React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { compute_energy_balance } from "../../solver/analysis/energy-balance";
import { ENERGY, display_unit } from "../../../utils/quantity-format";
import { getStorageItem, setStorageItem } from "../../../utils/storage";
import ProbeChart, {
  ChartCurve,
  PROBE_ELEMENT_COLORS,
  probe_curve_colors,
} from "./ProbeChart";
import { StringKey, t } from "../../../i18n";

const ENERGY_COMPONENTS = [
  "kinetic",
  "potential",
  "mechanical",
  "netWorkIn",
] as const;
type EnergyComponent = (typeof ENERGY_COMPONENTS)[number];

const ENERGY_COMPONENT_LABEL_KEYS: Record<EnergyComponent, StringKey> = {
  kinetic: "energy_balance_kinetic",
  potential: "energy_balance_potential",
  mechanical: "energy_balance_mechanical",
  netWorkIn: "energy_balance_net_work",
};

/** What each curve actually is — on its own chip rather than a single header tooltip, since
 * the four are different enough (one is a rate integral, the rest are state) that a shared blurb either says too little about each or grows too long to skim. */
const ENERGY_COMPONENT_HINT_KEYS: Record<EnergyComponent, StringKey> = {
  kinetic: "energy_balance_kinetic_hint",
  potential: "energy_balance_potential_hint",
  mechanical: "energy_balance_mechanical_hint",
  netWorkIn: "energy_balance_net_work_hint",
};

/** "Totale" and "travail net" on: the pair the diagnostic is actually about; kinetic/potential are there to answer "where did it go", opted into like x/y/norm. */
const DEFAULT_COMPONENTS: Record<EnergyComponent, boolean> = {
  kinetic: false,
  potential: false,
  mechanical: true,
  netWorkIn: true,
};

/** Which curves are shown is a display preference, kept where the chart's own coming and going cannot lose it: selecting anything at all takes this off screen. */
const STORAGE_KEY = "energyBalanceComponents";

/**
 * The mechanism's own energy over the whole recording: what it holds, and the net work that should account for it.
 * A diagnostic of the solver's conservation rather than a measurement of the mechanism — which is exactly why it reads alone, with nothing selected: there is no element to hold it against (see `PropertiesPanel`).
 * Free to show: the solver never recomputes it (see `EnergySample`).
 */
export const EnergyBalance: React.FC<{
  snapshots: DynamicSnapshot[];
  currentTime: number;
  onSeek: (time: number) => void;
}> = ({ snapshots, currentTime, onSeek }) => {
  const palette = useTheme().palette;
  const [components, setComponents] = React.useState(() =>
    getStorageItem<Record<EnergyComponent, boolean>>(
      STORAGE_KEY,
      DEFAULT_COMPONENTS,
    ),
  );
  React.useEffect(() => {
    setStorageItem(STORAGE_KEY, components);
  }, [components]);

  const balance = React.useMemo(
    () => compute_energy_balance(snapshots),
    [snapshots],
  );
  const componentColors: Record<EnergyComponent, string> = {
    kinetic: PROBE_ELEMENT_COLORS[1],
    potential: PROBE_ELEMENT_COLORS[2],
    mechanical: probe_curve_colors(palette.primary.main).value,
    netWorkIn: PROBE_ELEMENT_COLORS[4],
  };
  const curves: ChartCurve[] = ENERGY_COMPONENTS.filter(
    (key) => components[key],
  ).map((key) => ({
    id: key,
    color: componentColors[key],
    t: balance.t,
    values: balance[key],
  }));
  const peak = curves.reduce(
    (highest, curve) =>
      curve.values.reduce((best, value) => Math.max(best, Math.abs(value)), highest),
    0,
  );
  const unit = display_unit(peak, ENERGY);

  return (
    <Box sx={{ px: 2 }}>
      <Typography variant="subtitle2" fontWeight={600}>
        {t("energy_balance_heading")}
        <Typography component="span" variant="subtitle2" color="text.secondary">
          {` (${unit.symbol})`}
        </Typography>
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 0.5,
          my: 0.5,
        }}
      >
        {ENERGY_COMPONENTS.map((key) => (
          <Tooltip key={key} title={t(ENERGY_COMPONENT_HINT_KEYS[key])}>
            <Chip
              label={t(ENERGY_COMPONENT_LABEL_KEYS[key])}
              size="small"
              clickable
              onClick={() =>
                setComponents((previous) => ({
                  ...previous,
                  [key]: !previous[key],
                }))
              }
              sx={{
                height: 20,
                "& .MuiChip-label": { px: 1 },
                fontSize: "0.7rem",
                fontWeight: 600,
                color: components[key] ? "common.white" : "text.secondary",
                backgroundColor: components[key]
                  ? componentColors[key]
                  : "background.sunken",
                "&:hover": {
                  backgroundColor: components[key]
                    ? componentColors[key]
                    : "action.hover",
                },
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <ProbeChart
        curves={curves}
        currentTime={currentTime}
        poolMax={0}
        ownFloor={0}
        unitFactor={unit.factor}
        // Never forced: `potential`/`mechanical` carry the drawing's own coordinate-origin offset (see `EnergyBalanceSeries`), so pulling 0 into view could squash their real excursion the way it would for a `position` chart — same reasoning as `metric_shows_zero`'s exceptions.
        showZero={false}
        emptyMessage={
          curves.length === 0 ? t("chart_no_component") : t("chart_waiting")
        }
        onSeek={onSeek}
      />
    </Box>
  );
};

export default EnergyBalance;
