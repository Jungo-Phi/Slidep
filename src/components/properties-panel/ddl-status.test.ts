import { describe, expect, it } from "vitest";
import { set_language } from "../../i18n";
import { AppMode } from "../../types";
import { ddl_status } from "./ddl-status";

/** Label only: the colours are a rendering choice, the wording is the statement. */
const label = (m: number, drivers: number, mode: AppMode) =>
  ddl_status(m, drivers, mode).label;

describe("ddl_status", () => {
  set_language("fr");

  it("édition : même lecture qu'en cinématique", () => {
    // Le rapport entre mobilité et moteurs est un fait de conception, vrai quel
    // que soit le mode ; une phrase qui disparaissait en entrant en simulation
    // se lisait comme une panne.
    for (let m = 0; m <= 3; m++)
      for (let drivers = 0; drivers <= 2; drivers++)
        expect(label(m, drivers, "edition")).toBe(label(m, drivers, "kinematic"));
    // Ce qu'elle ne fait plus : répéter le chiffre affiché juste au-dessus.
    expect(label(1, 0, "edition")).not.toMatch(/1 ddl/);
  });

  it("statique : une mobilité non pilotée rend la structure instable", () => {
    expect(label(0, 0, "static")).toBe("Isostatique");
    expect(label(1, 0, "static")).toBe("Instable");
    // Pilotée, elle est tenue : le moteur bloque le degré.
    expect(label(1, 1, "static")).toBe("Isostatique");
  });

  it("cinématique : compare mobilités et moteurs", () => {
    expect(label(0, 0, "kinematic")).toBe("Structure rigide");
    expect(label(1, 0, "kinematic")).toBe("Aucun moteur");
    expect(label(1, 1, "kinematic")).toBe("Mouvement déterminé");
    expect(label(2, 1, "kinematic")).toBe("Sous-motorisé");
    expect(label(1, 2, "kinematic")).toBe("Sur-motorisé");
  });

  it("dynamique : un degré libre est normal, le mouvement vient des efforts", () => {
    expect(label(0, 0, "dynamic")).toBe("Structure rigide");
    expect(label(2, 0, "dynamic")).toBe("Mouvement libre");
    expect(label(1, 1, "dynamic")).toBe("Mouvement déterminé");
  });

  it("le décompte vit dans l'explication, pas dans le verdict", () => {
    // Le verdict partage sa ligne avec le chiffre de DDL : il tient en deux mots et
    // renvoie le détail au survol. Le nombre de mobilités non pilotées, lui, ne doit
    // pas se perdre en route — et il s'accorde.
    const underdriven = (n: number) => ddl_status(n + 1, 1, "kinematic");
    expect(underdriven(1).label).not.toMatch(/\d/);
    expect(underdriven(1).hint).toMatch(/^1 mobilité n'est/);
    expect(underdriven(2).hint).toMatch(/^2 mobilités ne sont/);
  });

  it("aucun mode n'annonce jamais un DDL négatif", () => {
    // L'hyperstatisme se dit dans son propre bloc, il n'est pas une mobilité
    // négative — c'est toute la raison de la séparation m / h.
    const modes: AppMode[] = ["edition", "static", "kinematic", "dynamic"];
    for (const mode of modes)
      for (let drivers = 0; drivers <= 3; drivers++)
        for (let m = 0; m <= 3; m++)
          expect(label(m, drivers, mode)).not.toMatch(/-\d|−\d/);
  });
});
