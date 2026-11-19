import { describe, expect, it } from "vitest";
import { card_neighbour, CardSpot } from "./gallery-keyboard";

// Two columns of uneven cards: the left one tall, the right one short.
const CARDS: (CardSpot & { id: string })[] = [
  { id: "a", column: 0, row: 0, middle: 100 },
  { id: "b", column: 0, row: 1, middle: 400 },
  { id: "c", column: 1, row: 0, middle: 60 },
  { id: "d", column: 1, row: 1, middle: 180 },
  { id: "e", column: 1, row: 2, middle: 330 },
];
const at = (id: string) => CARDS.find((card) => card.id === id)!;

describe("card_neighbour", () => {
  it("moves up and down within the column, stopping at its ends", () => {
    expect(card_neighbour(CARDS, at("a"), "ArrowDown")?.id).toBe("b");
    expect(card_neighbour(CARDS, at("e"), "ArrowUp")?.id).toBe("d");
    expect(card_neighbour(CARDS, at("b"), "ArrowDown")).toBeUndefined();
    expect(card_neighbour(CARDS, at("c"), "ArrowUp")).toBeUndefined();
  });

  it("moves sideways to the card nearest in height, stopping at the edges", () => {
    expect(card_neighbour(CARDS, at("b"), "ArrowRight")?.id).toBe("e");
    expect(card_neighbour(CARDS, at("d"), "ArrowLeft")?.id).toBe("a");
    expect(card_neighbour(CARDS, at("c"), "ArrowRight")).toBeUndefined();
    expect(card_neighbour(CARDS, at("a"), "ArrowLeft")).toBeUndefined();
  });

  it("goes to the first and last cards in reading order", () => {
    expect(card_neighbour(CARDS, at("e"), "Home")?.id).toBe("a");
    expect(card_neighbour(CARDS, at("a"), "End")?.id).toBe("e");
  });
});
