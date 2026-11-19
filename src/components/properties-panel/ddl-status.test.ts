import { describe, expect, it } from "vitest";
import { set_language, t, tn } from "../../i18n";
import { AppMode } from "../../types";
import { ddl_status } from "./ddl-status";

/** Label only: the colours are a rendering choice, the wording is the statement. */
const label = (m: number, drivers: number, mode: AppMode) =>
  ddl_status(m, drivers, mode).label;

describe("ddl_status", () => {
  set_language("fr");

  it("au repos : même lecture qu'en cinématique", () => {
    // How a mobility stands against its motors is a fact about the design, true whatever the mode; a sentence that vanished on entering simulation would read as something breaking.
    for (let m = 0; m <= 3; m++)
      for (let drivers = 0; drivers <= 2; drivers++)
        expect(label(m, drivers, "static")).toBe(
          label(m, drivers, "kinematic"),
        );
    // The verdict never restates the figure shown just above it.
    expect(label(1, 0, "static")).not.toMatch(/1 ddl/);
  });

  it("cinématique : compare mobilités et moteurs", () => {
    expect(label(0, 0, "kinematic")).toBe(t("ddl_rigid"));
    expect(label(1, 0, "kinematic")).toBe(t("ddl_free_motion"));
    expect(label(1, 1, "kinematic")).toBe(t("ddl_determined"));
    expect(label(2, 1, "kinematic")).toBe(t("ddl_underdriven"));
    expect(label(1, 2, "kinematic")).toBe(t("ddl_overdriven"));
  });

  it("dynamique : un degré libre est normal, le mouvement vient des efforts", () => {
    expect(label(0, 0, "dynamic")).toBe(t("ddl_rigid"));
    expect(label(2, 0, "dynamic")).toBe(t("ddl_free_motion"));
    expect(label(1, 1, "dynamic")).toBe(t("ddl_determined"));
  });

  it("le décompte vit dans l'explication, pas dans le verdict", () => {
    // The verdict shares its row with the DOF figure: two words, the detail left to the hover.
    // The count of undriven mobilities must still reach the reader, with its plural agreement.
    const underdriven = (n: number) => ddl_status(n + 1, 1, "kinematic");
    expect(underdriven(1).label).not.toMatch(/\d/);
    expect(underdriven(1).hint).toMatch(tn("ddl_underdriven_hint", 1));
    expect(underdriven(2).hint).toMatch(tn("ddl_underdriven_hint", 2));
  });

  it("aucun mode n'annonce jamais un DDL négatif", () => {
    // Hyperstaticity has its own block and is not a negative mobility: that is the whole point of keeping m and h apart.
    const modes: AppMode[] = ["static", "kinematic", "dynamic"];
    for (const mode of modes)
      for (let drivers = 0; drivers <= 3; drivers++)
        for (let m = 0; m <= 3; m++)
          expect(label(m, drivers, mode)).not.toMatch(/-\d|−\d/);
  });
});
