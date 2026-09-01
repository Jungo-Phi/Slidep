import { describe, expect, it } from "vitest";
import {
  ScrollMetrics,
  rubber_band,
  scroll_top_for_thumb,
  thumb_geometry,
} from "./scrollbar-geometry";

const FLUSH = { minHeight: 20, minSqueezed: 6, margin: 0 };
const INSET = { minHeight: 20, minSqueezed: 6, margin: 10 };

/** A panel 400 px tall showing 1000 px of content, scrolled to `scrollTop`. */
const panel = (scrollTop: number): ScrollMetrics => ({
  scrollTop,
  scrollHeight: 1000,
  clientHeight: 400,
});

describe("thumb_geometry", () => {
  it("pas de pouce tant que le contenu tient", () => {
    expect(
      thumb_geometry(
        { scrollTop: 0, scrollHeight: 400, clientHeight: 400 },
        FLUSH,
      ),
    ).toBeNull();
    expect(
      thumb_geometry(
        { scrollTop: 0, scrollHeight: 200, clientHeight: 400 },
        FLUSH,
      ),
    ).toBeNull();
  });

  it("le pouce mesure la part visible du contenu", () => {
    // 400 px de fenêtre sur 1000 px de contenu : 40 % de la piste.
    expect(thumb_geometry(panel(0), FLUSH)?.height).toBeCloseTo(160);
  });

  it("parcourt la piste de bout en bout", () => {
    const height = 160;
    expect(thumb_geometry(panel(0), FLUSH)?.top).toBeCloseTo(0);
    expect(thumb_geometry(panel(300), FLUSH)?.top).toBeCloseTo(
      (400 - height) / 2,
    );
    expect(thumb_geometry(panel(600), FLUSH)?.top).toBeCloseTo(400 - height);
  });

  it("respecte la marge aux deux extrémités", () => {
    const track = 400 - 2 * 10;
    const height = (track * 400) / 1000;
    expect(thumb_geometry(panel(0), INSET)?.top).toBeCloseTo(10);
    expect(thumb_geometry(panel(600), INSET)).toEqual({
      top: 400 - 10 - height,
      height,
    });
  });

  it("pas de pouce quand la marge dévore la piste", () => {
    expect(
      thumb_geometry(
        { scrollTop: 0, scrollHeight: 1000, clientHeight: 16 },
        { minHeight: 20, minSqueezed: 6, margin: 10 },
      ),
    ).toBeNull();
  });

  it("garde une prise minimale sur un contenu très long", () => {
    const long = (scrollTop: number): ScrollMetrics => ({
      scrollTop,
      scrollHeight: 100000,
      clientHeight: 400,
    });
    expect(thumb_geometry(long(0), FLUSH)?.height).toBe(FLUSH.minHeight);
    // La piste reste parcourue en entier malgré la hauteur forcée.
    expect(thumb_geometry(long(99600), FLUSH)?.top).toBeCloseTo(
      400 - FLUSH.minHeight,
    );
  });

  it("borne un scrollTop hors limites", () => {
    // Le rebond élastique sort de [0, overflow] ; le pouce, lui, ne sort pas de la piste.
    expect(thumb_geometry(panel(-80), FLUSH)?.top).toBe(0);
    expect(thumb_geometry(panel(900), FLUSH)?.top).toBeCloseTo(400 - 160);
  });
});

describe("scroll_top_for_thumb", () => {
  it("inverse thumb_geometry", () => {
    for (const spec of [FLUSH, INSET])
      for (const scrollTop of [0, 137, 421, 600]) {
        const metrics = panel(scrollTop);
        const thumb = thumb_geometry(metrics, spec);
        expect(thumb).not.toBeNull();
        expect(
          scroll_top_for_thumb(thumb!.top, thumb!, metrics, spec),
        ).toBeCloseTo(scrollTop);
      }
  });

  it("borne aux extrémités du contenu", () => {
    const metrics = panel(0);
    const thumb = thumb_geometry(metrics, INSET)!;
    expect(scroll_top_for_thumb(-500, thumb, metrics, INSET)).toBe(0);
    expect(scroll_top_for_thumb(5000, thumb, metrics, INSET)).toBe(600);
  });

  it("reste à zéro quand rien ne déborde", () => {
    const metrics = { scrollTop: 0, scrollHeight: 400, clientHeight: 400 };
    expect(
      scroll_top_for_thumb(50, { top: 0, height: 400 }, metrics, FLUSH),
    ).toBe(0);
  });
});

describe("thumb_geometry sous étirement", () => {
  it("se comprime contre le bord retenu", () => {
    // Tiré de 30 px vers le bas : le pouce reste collé en haut et perd ces 30 px.
    expect(thumb_geometry(panel(0), INSET, 30)).toEqual({
      top: 10,
      height: (380 * 400) / 1000 - 30,
    });
  });

  it("se comprime vers le bas quand on tire par le bas", () => {
    const height = (380 * 400) / 1000 - 30;
    expect(thumb_geometry(panel(600), INSET, -30)).toEqual({
      top: 10 + 380 - height,
      height,
    });
  });

  it("garde une trace visible même écrasé", () => {
    const thumb = thumb_geometry(panel(0), INSET, 1000);
    expect(thumb?.height).toBe(INSET.minSqueezed);
    expect(thumb?.top).toBe(10);
  });
});

describe("rubber_band", () => {
  it("suit le geste au début, puis résiste", () => {
    // Les premiers pixels passent à `resistance` près ; 100 px de poussée en rendent moins de 40.
    expect(rubber_band(1, 40, 0.5)).toBeCloseTo(0.5, 1);
    expect(rubber_band(100, 40, 0.5)).toBeLessThan(30);
  });

  it("n'atteint jamais la limite", () => {
    for (const distance of [50, 500, 5000, 1e6])
      expect(rubber_band(distance, 40, 0.5)).toBeLessThan(40);
    expect(rubber_band(1e6, 40, 0.5)).toBeGreaterThan(39);
  });

  it("croît avec la poussée", () => {
    let previous = 0;
    for (let distance = 1; distance < 400; distance += 7) {
      const current = rubber_band(distance, 40, 0.5);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("ne rend rien pour une poussée nulle ou négative", () => {
    expect(rubber_band(0, 40, 0.5)).toBe(0);
    expect(rubber_band(-20, 40, 0.5)).toBe(0);
  });
});
