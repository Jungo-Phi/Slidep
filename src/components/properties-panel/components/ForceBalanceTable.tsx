import React from "react";
import {
  Box,
  Chip,
  IconButton,
  Popover,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { GpsFixed, Visibility, VisibilityOff } from "@mui/icons-material";
import { WorldPoint } from "../../../types";
import { Vector } from "../../common/Vector";
import VectorInput from "./VectorInput";
import { useDismissOnShortcut } from "../../common/dismiss-popups";
import { BalanceTerm, ForceBalance } from "../../solver/analysis/force-balance";
import { OVERLAY_ICON_SIZE, reading_icon } from "../element-readings";
import {
  FORCE,
  LENGTH,
  MOMENT,
  QuantityKind,
  QuantityUnit,
  display_unit,
  to_mantissa,
} from "../../../utils/quantity-format";
import { t } from "../../../i18n";

/** Told which term the cursor rests on, and which of its two quantities the line was reading. */
export type BalanceTermHover = (
  term: BalanceTerm | null,
  quantity: "force" | "moment",
) => void;

/**
 * The free body's balance written as the two equations it is — `ΣF` and `ΣM`, each laid out term by term — see `compute_force_balance` for what the terms are and why the `m·a` they are weighed against comes from the solver rather than from here.
 *
 * No term is named: what a term stands for is answered by pointing at it, which lights its own vector on the canvas, and a column of labels beside an equation reads as a table rather than as a sum.
 * A measurement tool like `CohesionDiagrams`: it reads the frame under the cursor, so pausing anywhere shows that instant's own figures.
 */

/** One unit for a whole line, chosen on its largest reading: an equation is one quantity added
 * up, so a term switching to its own prefix mid-sum would make the line unreadable as arithmetic. */
function line_unit(values: number[], kind: QuantityKind): QuantityUnit {
  return display_unit(
    Math.max(...values.map((value) => Math.abs(value)), 0),
    kind,
  );
}

const Operator: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="caption"
    color="text.secondary"
    lineHeight={1.2}
    sx={{ px: 0.25 }}
  >
    {children}
  </Typography>
);

interface LineProps {
  label: string;
  terms: BalanceTerm[];
  unit: QuantityUnit;
  render: (term: BalanceTerm) => React.ReactNode;
  total: React.ReactNode;
  /** Which of the two quantities this line reads — a term points at a different thing on the canvas depending on it. */
  quantity: "force" | "moment";
  onHoverTerm?: BalanceTermHover;
  /** A term clicked — selects the reading it stands for, exactly as clicking its arrow on the
   * canvas already does. */
  onClickTerm?: (term: BalanceTerm) => void;
}

/** `label  t₁ + t₂ + … = total   unit`, wrapping where it must. */
const EquationLine: React.FC<LineProps> = ({
  label,
  terms,
  unit,
  render,
  total,
  quantity,
  onHoverTerm,
  onClickTerm,
}) => {
  const { palette } = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        rowGap: 0.5,
        py: 0.25,
      }}
    >
      <Typography
        variant="caption"
        fontWeight={600}
        lineHeight={1.2}
        sx={{ minWidth: 36 }}
      >
        {label}
      </Typography>
      {terms.map((term, index) => (
        <React.Fragment key={term.id}>
          {index > 0 && <Operator>+</Operator>}
          <Box
            onMouseEnter={() => onHoverTerm?.(term, quantity)}
            onMouseLeave={() => onHoverTerm?.(null, quantity)}
            onClick={() => onClickTerm?.(term)}
            sx={{
              display: "flex",
              alignItems: "center",
              borderRadius: 1,
              cursor: "pointer",
              "&:hover": { backgroundColor: palette.action.hover },
            }}
          >
            {render(term)}
          </Box>
        </React.Fragment>
      ))}
      <Operator>=</Operator>
      {total}
      <Typography
        variant="caption"
        color="text.secondary"
        lineHeight={1.2}
        sx={{ pl: 0.5 }}
      >
        {unit.symbol}
      </Typography>
    </Box>
  );
};

/** A moment, or any other reading that is a plain scalar on its line. */
const ScalarTerm: React.FC<{ value: number; unit: QuantityUnit }> = ({
  value,
  unit,
}) => (
  <Typography
    variant="caption"
    lineHeight={1.2}
    sx={{ px: 0.25, fontVariantNumeric: "tabular-nums" }}
  >
    {to_mantissa(value, unit, 1)}
  </Typography>
);

interface ForceBalanceTableProps {
  balance: ForceBalance;
  /** The term the cursor rests on, so the canvas can show the very reading it stands for. */
  onHoverTerm?: BalanceTermHover;
  /** A term clicked — see `LineProps`' own. */
  onClickTerm?: (term: BalanceTerm) => void;
  /** What the chip beside the picker reads — absent while the reference is a typed point, whose own chip reads its coordinates instead. */
  referenceLabel?: string;
  /** The reference resolved to a point — what the coordinate chip reads and its popover's `VectorInput` edits while the reference is a typed point. */
  referencePoint: WorldPoint;
  /** Whether the canvas is currently waiting for the next click to name the reference. */
  pickingReference: boolean;
  onArmPicking: () => void;
  onSetPoint: (point: WorldPoint) => void;
  /** The picker button is hovered — previews the reference marker on the canvas without
   * arming anything. */
  onReferenceHoverChange: (hovered: boolean) => void;
  /** The reference is a typed point right now, so a coordinate chip reads it — true by default, since the origin is one too. */
  isCustomPoint: boolean;
  /** The mechanism-wide free-body switch, offered here as a shortcut: every anchored node's support reaction is one of the terms this table sums.
   * Its home stays the "Afficher" menu, the only place that turns every layer off at once — see `OverlaysMenu`. */
  supportReactions: boolean;
  onChangeSupportReactions: (on: boolean) => void;
}

const ForceBalanceTable: React.FC<ForceBalanceTableProps> = ({
  balance,
  onHoverTerm,
  onClickTerm,
  referenceLabel,
  referencePoint,
  pickingReference,
  onArmPicking,
  onSetPoint,
  onReferenceHoverChange,
  isCustomPoint,
  supportReactions,
  onChangeSupportReactions,
}) => {
  const [pointEditorAnchor, setPointEditorAnchor] =
    React.useState<HTMLElement | null>(null);
  useDismissOnShortcut(pointEditorAnchor !== null, () =>
    setPointEditorAnchor(null),
  );
  const { actions, sum, sumMoment, inertia, inertiaMoment, gap, gapMoment } =
    balance;
  const referencePointUnit = display_unit(
    Math.max(Math.abs(referencePoint.x), Math.abs(referencePoint.y)),
    LENGTH,
  );
  const forceUnit = line_unit(
    actions
      .flatMap((action) => [action.force.x, action.force.y])
      .concat([sum.x, sum.y, inertia.x, inertia.y, gap.x, gap.y]),
    FORCE,
  );
  const momentUnit = line_unit(
    actions
      .map((action) => action.moment)
      .concat([sumMoment, inertiaMoment, gapMoment]),
    MOMENT,
  );

  return (
    <Box sx={{ mx: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {t("force_balance")}
        </Typography>
        {/* The layer's own glyph rides along with the eye: an eye alone in a section header reads as "fold this away" rather than as "draw these on the canvas". */}
        <Tooltip title={t("support_reactions")}>
          <IconButton
            size="small"
            role="switch"
            aria-checked={supportReactions}
            onClick={() => onChangeSupportReactions(!supportReactions)}
            sx={{
              gap: 0.25,
              borderRadius: 1.5,
              color: supportReactions ? "text.primary" : "text.disabled",
            }}
          >
            {supportReactions ? (
              <Visibility fontSize="inherit" />
            ) : (
              <VisibilityOff fontSize="inherit" />
            )}
            <Box
              component="img"
              src={reading_icon("reaction-support")}
              alt=""
              sx={{
                width: OVERLAY_ICON_SIZE,
                height: OVERLAY_ICON_SIZE,
                opacity: supportReactions ? 1 : 0.5,
              }}
            />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={t(
            pickingReference
              ? "balance_reference_picking"
              : "balance_reference_pick",
          )}
        >
          <IconButton
            size="small"
            color={pickingReference ? "primary" : "default"}
            onClick={onArmPicking}
            onMouseEnter={() => onReferenceHoverChange(true)}
            onMouseLeave={() => onReferenceHoverChange(false)}
          >
            <GpsFixed fontSize="inherit" />
          </IconButton>
        </Tooltip>
        {referenceLabel && <Chip size="small" label={referenceLabel} />}
        {isCustomPoint && (
          <Chip
            size="small"
            label={`(${to_mantissa(referencePoint.x, referencePointUnit, 1)}; ${to_mantissa(
              referencePoint.y,
              referencePointUnit,
              1,
            )}) ${referencePointUnit.symbol}`}
            onClick={(event) => setPointEditorAnchor(event.currentTarget)}
          />
        )}
        <Popover
          open={pointEditorAnchor !== null}
          anchorEl={pointEditorAnchor}
          onClose={() => setPointEditorAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 2 }}>
            <VectorInput value={referencePoint} onChange={onSetPoint} />
          </Box>
        </Popover>
      </Box>
      <EquationLine
        label={t("balance_sum")}
        terms={actions}
        unit={forceUnit}
        render={(term) => <Vector value={term.force} unit={forceUnit} />}
        total={<Vector value={sum} unit={forceUnit} />}
        quantity="force"
        onHoverTerm={onHoverTerm}
        onClickTerm={onClickTerm}
      />
      <EquationLine
        label={t("balance_sum_moment")}
        terms={actions}
        unit={momentUnit}
        render={(term) => <ScalarTerm value={term.moment} unit={momentUnit} />}
        total={<ScalarTerm value={sumMoment} unit={momentUnit} />}
        quantity="moment"
        onHoverTerm={onHoverTerm}
        onClickTerm={onClickTerm}
      />
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          py: 0.25,
        }}
      >
        <Typography variant="caption" fontWeight={600} sx={{ minWidth: 36 }}>
          {t("balance_inertia")}
        </Typography>
        <Vector value={inertia} unit={forceUnit} />
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          {forceUnit.symbol}
        </Typography>
        <ScalarTerm value={inertiaMoment} unit={momentUnit} />
        <Typography variant="caption" color="text.secondary">
          {momentUnit.symbol}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          py: 0.25,
        }}
      >
        <Typography variant="caption" fontWeight={600} sx={{ minWidth: 36 }}>
          {t("balance_gap")}
        </Typography>
        <Vector value={gap} unit={forceUnit} />
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          {forceUnit.symbol}
        </Typography>
        <ScalarTerm value={gapMoment} unit={momentUnit} />
        <Typography variant="caption" color="text.secondary">
          {momentUnit.symbol}
        </Typography>
      </Box>
    </Box>
  );
};

export default ForceBalanceTable;
