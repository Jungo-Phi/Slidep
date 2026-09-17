/**
 * The geometry `SelectionInspector` and the cards it hosts share, so that the panel reads the same whatever kind of subject it is showing.
 * Kept out of the components themselves because the load's own card lives in a component of its own (`LoadInspector`) and still has to line up with the others.
 */

/**
 * Brings the header back out to 8 px from the panel's edges, against the 16 px its body keeps.
 * The subject's own card sits wider than what it introduces, the way a title does.
 */
export const HEADER_INSET = { mx: -1 } as const;

/**
 * The height every subject's header takes, whatever the subject is: an element's card, a load's card, a reading's row.
 * A `medium` `ElementDisplay`'s own height (its 28 px glyph plus its border), which the reading's row is held to so the panel does not change stature with the kind of thing it is showing.
 */
export const HEADER_HEIGHT = 30;

/**
 * Undoes the panel's own side padding, for what has to reach its edges: the separators, which read as a rule across the panel rather than as one more indented row.
 */
export const FULL_BLEED = { mx: -2 } as const;

/**
 * Every icon button sitting at the end of a row: the eye of a layer, the way out of the selection.
 * One rule for all of them, since two buttons of different sizes side by side on the same row is what reads as a mistake.
 */
export const ROW_ICON_BUTTON_SX = { p: 0.5, borderRadius: 1.5 } as const;

/** The same button on a card rather than on a row, where the surrounding shapes are round. */
export const CARD_ICON_BUTTON_SX = { p: 0.5, borderRadius: 3 } as const;

/**
 * The icon buttons at the end of a header, held together as one block against its right edge: the subject's own tool, then the way out of it.
 * Squares them off to the header's height here rather than in `ElementDisplay`: a rule living there cannot tell a button of its own from one a `NumberInput` dropped beside it brought along, which is how the spinners ended up oversized once already.
 * A live parameter stays outside the block, where the header's own `space-between` puts it.
 */
export const ICON_GROUP_SX = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  "& .MuiIconButton-root": { width: HEADER_HEIGHT, height: HEADER_HEIGHT },
} as const;

/**
 * How far the values of a load or a reading are pulled in from the panel's edges.
 * Their labels are short where an element's are not, so the gap a full-width row leaves between a name and its figure reads as a hole; narrowing the row closes it and centres the pair.
 * One number to tune by eye — too much and a long label starts truncating against a wide value.
 */
export const SUBJECT_VALUES_INSET = { px: 2 } as const;
