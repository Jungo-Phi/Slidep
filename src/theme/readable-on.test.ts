import { describe, it, expect } from "vitest";
import {
  canvas_palette,
  readable_on,
  THEME_SPECS,
  ThemeName,
} from "./mui-theme";

/**
 * `readable_on` exists so a hue calibrated against the canvas can be printed as a figure on a panel.
 * What is checked is the promise it makes, on the palettes it is actually asked about - not the constant it is written with.
 */

/** WCAG AA for a graphical object carrying meaning, the external standard the helper answers to. */
const AA_NON_TEXT = 3;

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Each theme, with the paper a figure is printed on and the overlay colours that theme draws on the canvas. */
const themes = Object.entries(THEME_SPECS).map(
  ([name, spec]) =>
    [name as ThemeName, spec.paper, canvas_palette(spec).OVERLAY] as const,
);

describe("readable_on", () => {
  it("porte chaque teinte d'overlay au-dessus du plancher de lisibilité, sur le papier de tous les thèmes", () => {
    for (const [theme, paper, overlay] of themes)
      for (const [kind, hue] of Object.entries(overlay)) {
        const ink = readable_on(hue, paper);
        expect(
          contrast(ink, paper),
          `${kind} sur ${theme}`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
  });

  it("rend la couleur telle quelle quand elle passe déjà", () => {
    // Black on white clears every floor there is, so nothing is left to solve.
    expect(readable_on("#000000", "#FFFFFF")).toBe("#000000");
  });
});
