/**
 * The geometry the rows of an element's page share — its readings, its loads — so that they line up whatever they belong to.
 * Kept out of the components themselves because each lives in a component of its own and still has to line up with the others.
 */

/**
 * The height of a header's icon buttons: a `medium` `ElementDisplay`'s own height (its 28 px glyph plus its border), so the buttons line up with the card they end.
 */
export const HEADER_HEIGHT = 30;

/**
 * Every icon button sitting at the end of a row: the eye of a layer.
 * One rule for all of them, since two buttons of different sizes side by side on the same row is what reads as a mistake.
 */
export const ROW_ICON_BUTTON_SX = { p: 0.5, borderRadius: 1.5 } as const;

/** Marks a control sitting on a row — a field, a button — so that pointing at it does not tint the row (see `ReadingRow`). */
export const ROW_CONTROL_CLASS = "row-control";

/**
 * The icon buttons at the end of a header, held together as one block against its right edge.
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
