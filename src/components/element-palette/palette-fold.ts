/**
 * Which groups of the desktop palette fold into a single button, for the width the bar has.
 * Worked out from the bar's fixed metrics rather than measured: every tool is the same square, so the widths are known in advance.
 */

export const PALETTE_METRICS = {
  /** A tool's icon (px). */
  SIZE: 28,
  /** Around the icon, inside its button (px). */
  PADDING: 2,
  /** Between two tools of a group (px). */
  GAP: 2,
  /** On each side of the rule between two groups (px). */
  DIVIDER_MARGIN: 10,
  /** The button that opens a folded group's menu, next to its tool (px). */
  CARET: 16,
  /**
   * Each end of the bar: the history buttons and their margins on the right, on the left the tools used only at rest, or in simulation the way back to rest (px).
   * Room enough for the longest name a button on the left takes, "Bearbeiten".
   */
  SIDE_WIDTH: 120,
  /** The icon of a button of the left end, smaller than a tool's to leave its name room (px). */
  SLOT_ICON: 20,
  /** The bar's own padding, both sides together (px). */
  BAR_PADDING: 8,
} as const;

const BUTTON = PALETTE_METRICS.SIZE + 2 * PALETTE_METRICS.PADDING;

const group_width = (count: number) =>
  count * BUTTON + (count - 1) * PALETTE_METRICS.GAP;

/** The tool and its menu button touch, with no gap between them. */
const FOLDED_WIDTH = BUTTON + PALETTE_METRICS.CARET;

/** The selection tools are always at hand: they are the ones every other tool hands back to. */
const NEVER_FOLDED = "interface";

/**
 * The groups to fold, taken from the right until the rest fits: the end of the bar goes first, the beginning, where the drawing starts, last.
 * Nothing folds before the bar's width is known.
 */
export function folded_groups(
  groups: { titleKey: string; count: number }[],
  barWidth: number | null,
): Set<string> {
  const folded = new Set<string>();
  if (barWidth === null) return folded;
  const available =
    barWidth - 2 * PALETTE_METRICS.SIDE_WIDTH - PALETTE_METRICS.BAR_PADDING;
  const dividers =
    Math.max(groups.length - 1, 0) * (2 * PALETTE_METRICS.DIVIDER_MARGIN + 1);
  let width =
    dividers + groups.reduce((sum, group) => sum + group_width(group.count), 0);
  for (let i = groups.length - 1; i >= 0 && width > available; i--) {
    const group = groups[i];
    if (group.titleKey === NEVER_FOLDED || group.count < 2) continue;
    folded.add(group.titleKey);
    width -= group_width(group.count) - FOLDED_WIDTH;
  }
  return folded;
}
