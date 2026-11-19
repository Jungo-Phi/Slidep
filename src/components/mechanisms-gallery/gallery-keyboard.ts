/**
 * Where the arrow keys lead between the cards of the gallery.
 * The cards stand in columns of uneven heights, so a row index means nothing across columns: sideways, the arrows go to the card of the next column whose middle is nearest in height.
 */

/** A card as the keyboard sees it: its column, its rank in that column, and its vertical middle on screen. */
export interface CardSpot {
  column: number;
  row: number;
  middle: number;
}

export type GalleryKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End";

export const GALLERY_KEYS: ReadonlySet<string> = new Set<GalleryKey>([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

/**
 * The card `key` leads to from `from`, or `undefined` at an edge: the focus stays where it is rather than wrapping round.
 * Home and End go to the first and last cards in reading order, row by row.
 */
export function card_neighbour<T extends CardSpot>(
  cards: T[],
  from: CardSpot,
  key: GalleryKey,
): T | undefined {
  if (key === "Home" || key === "End") {
    const reading = [...cards].sort((a, b) => a.row - b.row || a.column - b.column);
    return key === "Home" ? reading[0] : reading[reading.length - 1];
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const row = from.row + (key === "ArrowDown" ? 1 : -1);
    return cards.find((card) => card.column === from.column && card.row === row);
  }
  const column = from.column + (key === "ArrowRight" ? 1 : -1);
  let nearest: T | undefined;
  for (const card of cards) {
    if (card.column !== column) continue;
    if (
      !nearest ||
      Math.abs(card.middle - from.middle) < Math.abs(nearest.middle - from.middle)
    )
      nearest = card;
  }
  return nearest;
}
