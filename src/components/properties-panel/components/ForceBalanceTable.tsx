import React from "react";
import { Box, Popover, Tooltip, Typography, useTheme } from "@mui/material";
import { WorldPoint } from "../../../types";
import { Vector } from "../../common/Vector";
import VectorInput from "./VectorInput";
import { useNonModalPopup } from "../../common/use-non-modal-popup";
import { balance_term_color } from "../../../constants/physics-display-specs";
import { readable_on } from "../../../theme/mui-theme";
import {
  BalanceTerm,
  ForceBalance,
  MomentBalanceReference,
  moment_balance_reference_glyph,
} from "../../solver/analysis/force-balance";
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

/** Told what the cursor rests on: one term of a law's left-hand sum, that whole sum (`"total"`), the law's right-hand member (`"inertia"`), or nothing.
 * `quantity` says which of the two laws is being read — a force points at a vector, a moment at a couple, and the canvas does not show the two the same way. */
export type BalanceTermHover = (
  target: BalanceTerm | "total" | "inertia" | null,
  quantity: "force" | "moment",
) => void;

/**
 * The free body's balance written as the two laws it checks — `ΣF = m·a` and `ΣM = J·α` — see `compute_force_balance` for what the terms are and why the right-hand side comes from the solver rather than from here.
 *
 * Each law is a block of two rows: the law itself, its two members named and read side by side with the unit and the gap that says whether it closes; and under it, indented to start beneath the left-hand member's own value, what that member adds up.
 * No term is named: what a term stands for is answered by pointing at it, which lights its own vector on the canvas, and a column of labels beside an equation reads as a table rather than as a sum.
 * A measurement tool like `CohesionDiagrams`: it reads the frame under the cursor, so pausing anywhere shows that instant's own figures.
 */

/** Width a member's own name is given on the law line (`ΣF`, `m·a`), held fixed so the itemisation below can be indented to land under the value it adds up to. */
const MEMBER_LABEL_WIDTH = 20;

/** Height every row of every block is given, a moment's single figure as much as a force's stacked pair.
 * Set by the taller of the two, so the block of scalars gets the air rather than the block of vectors getting cramped. */
const ROW_HEIGHT = 22;

/** One unit for a whole block, chosen on its largest reading: a law is one quantity compared with itself, so a member switching to its own prefix would make the block unreadable as arithmetic. */
function block_unit(values: number[], kind: QuantityKind): QuantityUnit {
  return display_unit(
    Math.max(...values.map((value) => Math.abs(value)), 0),
    kind,
  );
}

/** A word set beside a figure rather than read as one — a member's name, an operator, a unit. */
const Aside: React.FC<{ children: React.ReactNode; width?: number }> = ({
  children,
  width,
}) => (
  <Typography
    variant="caption"
    color="text.secondary"
    lineHeight={1.2}
    sx={{ minWidth: width }}
  >
    {children}
  </Typography>
);

/** A moment, or any other reading that is a plain scalar where it sits. */
const Scalar: React.FC<{
  value: number;
  unit: QuantityUnit;
  color?: string;
}> = ({ value, unit, color }) => (
  <Typography
    variant="caption"
    lineHeight={1.2}
    sx={{ px: 0.25, minWidth: 12, textAlign: "center", color, fontVariantNumeric: "tabular-nums" }}
  >
    {to_mantissa(value, unit, 1)}
  </Typography>
);

/** A planar reading, stacked between parentheses like every other vector in the interface — `dense`, and against `ROW_HEIGHT`, so a row of the force law stands as tall as one of the moment law and the two blocks read as one thing. */
const Pair: React.FC<{
  value: WorldPoint;
  unit: QuantityUnit;
  color?: string;
}> = ({ value, unit, color }) => (
  <Box sx={{ color, py: 0.15 }}>
    <Vector value={value} unit={unit} dense />
  </Box>
);

/**
 * One member of a law, named and read as one thing — `ΣF (1.2 ; 0.0)`.
 * Both members are pointed at the same way, though only one of them is a sum: what the cursor names is the reading, and each of them has one the canvas can show.
 */
const Member: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  onHoverChange: (hovered: boolean) => void;
  /**
   * Whether hovering the label also answers `onHoverChange`, together with the value — the default, since a plain-text label ("ΣF", "m·a", "Jα") carries no interaction of its own to compete with it.
   * `false` keeps the label OUT of this hover region entirely: ΣM's label is `ForceBalanceTable`'s `reference`, its own clickable control with its own hover — nesting it inside this one would answer both gestures from the same patch of screen.
   */
  labelHoversToo?: boolean;
}> = ({ label, children, onHoverChange, labelHoversToo = true }) => {
  const { palette } = useTheme();
  const valueSx = {
    display: "flex",
    alignItems: "center",
    minHeight: ROW_HEIGHT,
    borderRadius: 1,
    // The default arrow, not a pointer: this box only ever answers a hover (it lights the reading on the canvas), nothing here is bound to a click.
    cursor: "default",
    "&:hover": { backgroundColor: palette.action.hover },
  } as const;

  if (!labelHoversToo)
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: ROW_HEIGHT,
          pl: 0.25,
        }}
      >
        <Aside width={MEMBER_LABEL_WIDTH}>{label}</Aside>
        <Box
          onMouseEnter={() => onHoverChange(true)}
          onMouseLeave={() => onHoverChange(false)}
          sx={valueSx}
        >
          {children}
        </Box>
      </Box>
    );

  return (
    <Box
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      sx={{ ...valueSx, pl: 0.25 }}
    >
      <Aside width={MEMBER_LABEL_WIDTH}>{label}</Aside>
      {children}
    </Box>
  );
};

interface TermsRowProps {
  terms: BalanceTerm[];
  /** Which of the two quantities this itemisation reads — a term points at a different thing on the canvas depending on it. */
  quantity: "force" | "moment";
  render: (term: BalanceTerm, color: string) => React.ReactNode;
  onHoverTerm?: BalanceTermHover;
  /** A term clicked — selects the reading it stands for, exactly as clicking its arrow on the canvas already does. */
  onClickTerm?: (term: BalanceTerm) => void;
}

/**
 * `t₁ + t₂ + …`, indented to start under the value of the member it adds up — which names it, so it carries no label of its own.
 * Only that indent is given up, so the terms keep nearly the whole width to wrap in: a mechanism carrying more actions grows this row downwards and moves nothing else.
 */
const TermsRow: React.FC<TermsRowProps> = ({
  terms,
  quantity,
  render,
  onHoverTerm,
  onClickTerm,
}) => {
  const { palette } = useTheme();
  const color_of = (term: BalanceTerm) =>
    readable_on(
      balance_term_color(term.kind, palette.primary.main, palette.overlay),
      palette.background.paper,
    );
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        pl: `${MEMBER_LABEL_WIDTH}px`,
      }}
    >
      {terms.map((term, index) => (
        <React.Fragment key={term.id}>
          {index > 0 && (
            <Aside>+</Aside>
          )}
          <Box
            onMouseEnter={() => onHoverTerm?.(term, quantity)}
            onMouseLeave={() => onHoverTerm?.(null, quantity)}
            onClick={() => onClickTerm?.(term)}
            sx={{
              display: "flex",
              alignItems: "center",
              minHeight: ROW_HEIGHT,
              borderRadius: 1,
              // A pointer only where a click actually selects something — `onClickTerm` is optional, and without it this box is exactly as inert as `Member`'s own value.
              cursor: onClickTerm ? "pointer" : "default",
              "&:hover": { backgroundColor: palette.action.hover },
            }}
          >
            {render(term, color_of(term))}
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
};

/**
 * A law, written as the two members it equates and the figures they read — `ΣF (1.2 ; 0.0) = m·a (1.1 ; 0.0) + écart (0.1 ; 0.0) N`.
 * The law is the line rather than a heading above it: with each member named where it is read, the line states the law and verifies it at once, and the heading that would only repeat it is the room the itemisation needs below.
 * The gap is a term of that line and not a note beside it: it is what the right-hand member is missing for the arithmetic on screen to be exact, and set apart it reads as a verdict on the law rather than as the figure that completes it.
 * Unnamed, and absent altogether where it would print as zero: the tooltip says what it is for the reader who wonders, and a term that reads "+ 0.0" is one the law does not have.
 * The unit is named here and nowhere else: a law is one quantity compared with itself, so repeating the symbol on each member says the same thing twice.
 */
const LawRow: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  unit: QuantityUnit;
  gap: React.ReactNode;
  closed: boolean;
}> = ({ left, right, unit, gap, closed }) => (
  <Box
    sx={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      minHeight: ROW_HEIGHT,
      columnGap: 0.5,
    }}
  >
    {left}
    <Aside>=</Aside>
    {right}
    {!closed && (
      <>
        <Aside>+</Aside>
        <Tooltip title={t("balance_gap_meaning")}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              minHeight: ROW_HEIGHT,
              borderRadius: 1,
              // Same as a member's own reading: nothing here answers a click, only the hover that names it.
              cursor: "default",
              color: "error.main",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {gap}
          </Box>
        </Tooltip>
      </>
    )}
    <Aside>{unit.symbol}</Aside>
  </Box>
);

interface ForceBalanceTableProps {
  balance: ForceBalance;
  /** What the cursor rests on, so the canvas can show the very readings it stands for. */
  onHoverTerm?: BalanceTermHover;
  /** A term clicked — see `TermsRowProps`' own. */
  onClickTerm?: (term: BalanceTerm) => void;
  /** Which glyph the reference reads as beside "ΣM" — see `moment_balance_reference_glyph`. */
  referenceKind: MomentBalanceReference["kind"];
  /** What the reference names, for the tooltip alone: absent while it is a point of its own, which the tooltip reads as coordinates instead. Never shown inline — the glyph is what the row itself carries. */
  referenceLabel?: string;
  /** The reference resolved to a point — what the tooltip reads with no label to show, and what the editor's `VectorInput` edits. */
  referencePoint: WorldPoint;
  /** Whether the canvas is currently waiting for the next click to name the reference. */
  pickingReference: boolean;
  onArmPicking: () => void;
  onStopPicking: () => void;
  onSetPoint: (point: WorldPoint) => void;
  /** The reference glyph is hovered — previews the reference marker on the canvas without
   * arming anything. */
  onReferenceHoverChange: (hovered: boolean) => void;
}

/** Below this, a gap reads as the rounding of the figures shown rather than as a balance that fails to close, and the law is written without it. */
const CLOSED_GAP = 0.05;

const ForceBalanceTable: React.FC<ForceBalanceTableProps> = ({
  balance,
  onHoverTerm,
  onClickTerm,
  referenceKind,
  referenceLabel,
  referencePoint,
  pickingReference,
  onArmPicking,
  onStopPicking,
  onSetPoint,
  onReferenceHoverChange,
}) => {
  const { palette } = useTheme();
  const [referenceAnchor, setReferenceAnchor] =
    React.useState<HTMLElement | null>(null);
  // The coordinate editor is the picker's accessory: arming opens it, and a click on the canvas closes it by answering the picker.
  const [editorOpen, setEditorOpen] = React.useState(false);
  React.useEffect(() => {
    if (!pickingReference) setEditorOpen(false);
  }, [pickingReference]);
  // A pointer going down on the canvas is the pick itself being aimed — the picker stays armed to answer it, and the canvas disarms it once it has.
  // A pointer anywhere else aims at nothing the picker can take, so it puts the picker away along with the editor.
  const editorPopup = useNonModalPopup(editorOpen, referenceAnchor, (event) => {
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
  const forceUnit = block_unit(
    actions
      .flatMap((action) => [action.force.x, action.force.y])
      .concat([sum.x, sum.y, inertia.x, inertia.y, gap.x, gap.y]),
    FORCE,
  );
  const momentUnit = block_unit(
    actions
      .map((action) => action.moment)
      .concat([sumMoment, inertiaMoment, gapMoment]),
    MOMENT,
  );
  // The right-hand member is the inertia overlay itself — `m·a` and `J·α` are the very arrows and couples that layer draws.
  const inertiaColor = readable_on(
    palette.overlay.inertia,
    palette.background.paper,
  );
  // Judged on the mantissas actually printed, not on the raw newtons: a gap the figures cannot show is one the reader has no way to check, and calling it an error would be calling the rounding an error.
  const closed = (value: number, unit: QuantityUnit) =>
    Math.abs(value / unit.factor) < CLOSED_GAP;

  // What the tooltip names: the label where there is one, the point itself otherwise — the only place either is spelled out, since the row itself carries only the glyph. Parenthesised like every other point in the interface, since read alone a bare pair of numbers is not obviously one.
  const referenceValue = referenceLabel
    ? referenceLabel
    : `(${to_mantissa(referencePoint.x, referencePointUnit, 1)}, ${to_mantissa(
        referencePoint.y,
        referencePointUnit,
        1,
      )}) ${referencePointUnit.symbol}`;

  /**
   * The reference is one control: what it currently is, and the way to change it.
   * Read as "ΣM" with a glyph subscripted onto it (`moment_balance_reference_glyph`), with the full value living in the tooltip alone: the equation line never grows past what "ΣM = Jα unit" already costs, whatever the reference happens to be.
   * Framed, and outside the value's own hover region (`Member`'s `labelHoversToo={false}`): the two are separate controls, each answering its own gesture, so neither box ever nests inside the other's.
   */
  const reference = (
    <>
      <Tooltip title={pickingReference ? "" : t("balance_reference_current", { value: referenceValue })}>
        <Box
          component="span"
          ref={setReferenceAnchor}
          onClick={() => {
            if (pickingReference) onStopPicking();
            else {
              onArmPicking();
              setEditorOpen(true);
            }
          }}
          onMouseEnter={() => onReferenceHoverChange(true)}
          onMouseLeave={() => onReferenceHoverChange(false)}
          sx={{
            display: "inline-flex",
            alignItems: "baseline",
            p: 0.4,
            borderRadius: 1,
            cursor: "pointer",
            color: pickingReference ? "primary.main" : "inherit",
            "&:hover": {
              color: pickingReference ?  "primary.dark" : "inherit",
              backgroundColor: "action.hover",
            },
          }}
        >
          {t("balance_sum_moment")}
          <Box
            component="span"
            sx={{
              fontSize: "0.7em",
              position: "relative",
              top: "0.35em",
              ml: "1px",
            }}
          >
            {moment_balance_reference_glyph(referenceKind, referencePoint)}
          </Box>
        </Box>
      </Tooltip>
      {/* Non-modal: the canvas underneath keeps the very clicks the armed picker is waiting for. */}
      <Popover
        {...editorPopup}
        open={editorOpen}
        anchorEl={referenceAnchor}
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
    </>
  );

  /** Points at a whole member: the left-hand sum with everything it adds up, or the right-hand inertia reading of every body. */
  const hover_member =
    (member: "total" | "inertia", quantity: "force" | "moment") =>
    (hovered: boolean) =>
      onHoverTerm?.(hovered ? member : null, quantity);

  return (
    <Box sx={{ mx: 2, display: "flex", flexDirection: "column" }}>
      <Typography variant="subtitle2" fontWeight={600}>
        {t("force_balance")}
      </Typography>
      <Box>
        <LawRow
          left={
            <Member
              label={t("balance_sum")}
              onHoverChange={hover_member("total", "force")}
            >
              <Pair value={sum} unit={forceUnit} />
            </Member>
          }
          right={
            <Member
              label={t("balance_inertia")}
              onHoverChange={hover_member("inertia", "force")}
            >
              <Pair value={inertia} unit={forceUnit} color={inertiaColor} />
            </Member>
          }
          unit={forceUnit}
          gap={<Pair value={gap} unit={forceUnit} />}
          closed={closed(gap.x, forceUnit) && closed(gap.y, forceUnit)}
        />
        <TermsRow
          terms={actions}
          quantity="force"
          render={(term, color) => (
            <Pair value={term.force} unit={forceUnit} color={color} />
          )}
          onHoverTerm={onHoverTerm}
          onClickTerm={onClickTerm}
        />
      </Box>

      <Box>
        <LawRow
          left={
            <Member
              label={reference}
              onHoverChange={hover_member("total", "moment")}
              labelHoversToo={false}
            >
              <Scalar value={sumMoment} unit={momentUnit} />
            </Member>
          }
          right={
            <Member
              label={t("balance_inertia_moment")}
              onHoverChange={hover_member("inertia", "moment")}
            >
              <Scalar
                value={inertiaMoment}
                unit={momentUnit}
                color={inertiaColor}
              />
            </Member>
          }
          unit={momentUnit}
          gap={<Scalar value={gapMoment} unit={momentUnit} />}
          closed={closed(gapMoment, momentUnit)}
        />
        <TermsRow
          terms={actions}
          quantity="moment"
          render={(term, color) => (
            <Scalar value={term.moment} unit={momentUnit} color={color} />
          )}
          onHoverTerm={onHoverTerm}
          onClickTerm={onClickTerm}
        />
      </Box>
    </Box>
  );
};

export default ForceBalanceTable;
