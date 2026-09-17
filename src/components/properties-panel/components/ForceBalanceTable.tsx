import React from "react";
import { Box, Chip, Popover, Tooltip, Typography, useTheme } from "@mui/material";
import { GpsFixed } from "@mui/icons-material";
import { WorldPoint } from "../../../types";
import { Vector } from "../../common/Vector";
import VectorInput from "./VectorInput";
import { useNonModalPopup } from "../../common/use-non-modal-popup";
import { BalanceTerm, ForceBalance } from "../../solver/analysis/force-balance";
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
  /** What the reference chip reads — absent while the reference is a point of its own, which the chip reads as coordinates instead. */
  referenceLabel?: string;
  /** The reference resolved to a point — what the chip reads with no label to show, and what the editor's `VectorInput` edits. */
  referencePoint: WorldPoint;
  /** Whether the canvas is currently waiting for the next click to name the reference. */
  pickingReference: boolean;
  onArmPicking: () => void;
  onStopPicking: () => void;
  onSetPoint: (point: WorldPoint) => void;
  /** The reference chip is hovered — previews the reference marker on the canvas without
   * arming anything. */
  onReferenceHoverChange: (hovered: boolean) => void;
}

const ForceBalanceTable: React.FC<ForceBalanceTableProps> = ({
  balance,
  onHoverTerm,
  onClickTerm,
  referenceLabel,
  referencePoint,
  pickingReference,
  onArmPicking,
  onStopPicking,
  onSetPoint,
  onReferenceHoverChange,
}) => {
  const [referenceChip, setReferenceChip] =
    React.useState<HTMLDivElement | null>(null);
  // The coordinate editor is the picker's accessory: arming opens it, and a click on the canvas closes it by answering the picker.
  const [editorOpen, setEditorOpen] = React.useState(false);
  React.useEffect(() => {
    if (!pickingReference) setEditorOpen(false);
  }, [pickingReference]);
  // A pointer going down on the canvas is the pick itself being aimed — the picker stays armed to answer it, and the canvas disarms it once it has.
  // A pointer anywhere else aims at nothing the picker can take, so it puts the picker away along with the editor.
  const editorPopup = useNonModalPopup(editorOpen, referenceChip, (event) => {
    setEditorOpen(false);
    const target = event?.target;
    if (!(target instanceof Element) || !target.closest("canvas"))
      onStopPicking();
  });
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
        {/* The reference is one control: what it currently is, and the way to change it. */}
        <Tooltip title={pickingReference ? "" : t("balance_reference_pick")}>
          <Chip
            ref={setReferenceChip}
            size="small"
            icon={<GpsFixed fontSize="inherit" />}
            color={pickingReference ? "primary" : "default"}
            variant="outlined"
            label={
              referenceLabel ??
              `(${to_mantissa(referencePoint.x, referencePointUnit, 1)}; ${to_mantissa(
                referencePoint.y,
                referencePointUnit,
                1,
              )}) ${referencePointUnit.symbol}`
            }
            onClick={() => {
              if (pickingReference) onStopPicking();
              else {
                onArmPicking();
                setEditorOpen(true);
              }
            }}
            onMouseEnter={() => onReferenceHoverChange(true)}
            onMouseLeave={() => onReferenceHoverChange(false)}
          />
        </Tooltip>
        {/* Non-modal: the canvas underneath keeps the very clicks the armed picker is waiting for. */}
        <Popover
          {...editorPopup}
          open={editorOpen}
          anchorEl={referenceChip}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box
            sx={{
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            {/* Says the canvas is the other way in: a box of coordinates alone reads as the only one. */}
            <Typography variant="caption" color="text.secondary">
              {t("balance_reference_picking")}
            </Typography>
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
