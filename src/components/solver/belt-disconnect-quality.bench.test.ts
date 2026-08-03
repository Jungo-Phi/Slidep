import { describe, it } from "vitest";
import disconnectJson from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { Link } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  beltContact,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";

/**
 * What the DISCONNECTION looks like from the outside, which is how the defect was seen:
 * how far the mechanism jumps on the transition frame, and which constraints stay
 * unsatisfied afterwards — every family, not just the belt's own.
 *
 * The q-link rebuild is switched on and off in the same process, so the two columns are
 * comparable.
 */

const loadFixture = () => load_mechanism(JSON.parse(disconnectJson)).mechanism;

/** Largest single-node move between two frames, in px: the jump one actually sees. */
function biggestMove(
  a: KinematicSnapshot,
  b: KinematicSnapshot,
): { key: string; d: number } {
  let key = "";
  let d = 0;
  for (let i = 0; i < b.layout.keys.length; i++) {
    // A slot with no value gives NaN, which never wins the comparison.
    const move = Math.hypot(
      b.positions[2 * i] - a.positions[2 * i],
      b.positions[2 * i + 1] - a.positions[2 * i + 1],
    );
    if (move > d) {
      d = move;
      key = b.layout.keys[i];
    }
  }
  return { key, d };
}

function run(rebuild: boolean, frames: number, dt = 1 / 60) {
  beltContact.rebuildQLinks = rebuild;
  const model = compile_simulation_model(loadFixture());
  const belt = model.links.find(
    (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
  )!;

  let prev: KinematicSnapshot | null = null;
  const lines: string[] = [];
  let detachFrame = -1;

  for (let frame = 0; frame < frames; frame++) {
    const snap = step_simulation(model, frame * dt, prev, dt);
    const move = prev ? biggestMove(prev, snap) : { key: "", d: 0 };
    prev = snap;

    const detached = (belt.disconnected ?? []).some(Boolean);
    if (detached && detachFrame < 0) detachFrame = frame;
    if (detachFrame < 0 || frame > detachFrame + 10) continue;

    const bad = (snap.unsatisfied ?? [])
      .slice()
      .sort((x, y) => y.residual - x.residual)
      .slice(0, 3)
      .map((r) => `${r.type} ${r.residual.toExponential(1)}`)
      .join(", ");
    lines.push(
      `    f${frame} saut ${move.d.toFixed(2)} px (${move.key.slice(0, 8)}) | ${(snap.unsatisfied ?? []).length} contraintes violées | ${bad}`,
    );
  }

  // Where it settles, well after the event.
  const tail = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      const snap = step_simulation(model, i * dt, prev, dt);
      prev = snap;
      if (i === frames - 1) return snap.unsatisfied ?? [];
    }
    return [];
  };
  const settled = tail(60)
    .slice()
    .sort((x, y) => y.residual - x.residual)
    .slice(0, 3)
    .map((r) => `${r.type} ${r.residual.toExponential(1)}`)
    .join(", ");

  beltContact.rebuildQLinks = true;
  return { lines, detachFrame, settled };
}

describe("qualité de la déconnexion", () => {
  it("saut et contraintes violées, avec et sans rebuild", () => {
    for (const rebuild of [false, true]) {
      const r = run(rebuild, 460, 1 / 120);
      console.log(
        `\n  ${rebuild ? "AVEC" : "SANS"} rebuild des liens q — détachement f${r.detachFrame}`,
      );
      for (const line of r.lines) console.log(line);
      console.log(`    60 frames plus tard : ${r.settled}`);
    }
  }, 600_000);

  /**
   * Le saut de la frame de transition, en fonction du moment où la poulie est lâchée.
   * Détacher à l'arc EXACTEMENT nul, c'est la lâcher quand elle ne tient déjà plus rien
   * mais que le mécanisme est déjà contraint par elle.
   */
  it("seuil de détachement contre saut de transition", () => {
    for (const detach of [0, 0.5, 1, 2, 5, 10]) {
      beltContact.detachArc = detach;
      const r = run(true, 460, 1 / 120);
      console.log(
        `  détachement à ${detach} px d'arc — f${r.detachFrame} : ${r.lines[0] ?? "—"}`,
      );
      beltContact.detachArc = 0.5;
    }
  }, 600_000);

  /**
   * Témoin : le moteur repart en arrière AVANT la tangence, donc rien ne se détache
   * jamais. Ce qui reste violé ici est le fond de ce mécanisme, pas le rattachement.
   */
  it("témoin sans détachement", () => {
    const dt = 1 / 120;
    const model = compile_simulation_model(loadFixture());
    const motor = model.links.find(
      (l): l is Extract<Link, { type: "MotorAngle" }> => l.type === "MotorAngle",
    )!;
    let prev: KinematicSnapshot | null = null;
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 200) motor.omega = -motor.omega;
      const snap = step_simulation(model, frame * dt, prev, dt);
      prev = snap;
      if (frame === 899)
        console.log(
          `    témoin, fin : ${(snap.unsatisfied ?? []).length} violées | ` +
            (snap.unsatisfied ?? [])
              .slice()
              .sort((x, y) => y.residual - x.residual)
              .slice(0, 3)
              .map((r) => `${r.type} ${r.residual.toExponential(1)}`)
              .join(", "),
        );
    }
  }, 600_000);

  /** La bande de contact complète : quand on lâche, quand on reprend. */
  it("bande de contact — détachement 0.5 px, hystérésis variable", () => {
    const dt = 1 / 120;
    for (const [detach, reattach] of [
      [0.5, 1],
      [0.5, 2],
      [0.5, 3],
    ] as const) {
      beltContact.detachArc = detach;
      beltContact.reattachArc = reattach;
      const model = compile_simulation_model(loadFixture());
      const belt = model.links.find(
        (l): l is Extract<Link, { type: "BeltLength" }> =>
          l.type === "BeltLength",
      )!;
      const motor = model.links.find(
        (l): l is Extract<Link, { type: "MotorAngle" }> =>
          l.type === "MotorAngle",
      )!;
      let prev: KinematicSnapshot | null = null;
      let attached = true;
      let flips = 0;
      let worstJump = 0;
      const events: string[] = [];

      for (let frame = 0; frame < 900; frame++) {
        if (frame === 460) motor.omega = -motor.omega;
        const snap = step_simulation(model, frame * dt, prev, dt);
        const move = prev ? biggestMove(prev, snap) : { key: "", d: 0 };
        prev = snap;
        const now = !belt.disconnected?.some(Boolean);
        if (now !== attached) {
          attached = now;
          flips++;
          worstJump = Math.max(worstJump, move.d);
          events.push(`${now ? "reprise" : "lâchée"} f${frame} (${move.d.toFixed(2)} px)`);
        }
      }
      console.log(
        `  lâcher ${detach} / reprendre ${reattach} px — ${flips} bascules : ${events.join(", ")}`,
      );
      beltContact.detachArc = 0.5;
      beltContact.reattachArc = 1.0;
    }
  }, 600_000);

  /** Le retour : moteur inversé, poulie reprise, et ce qui reste violé ensuite. */
  it("après reconnexion", () => {
    const dt = 1 / 120;
    const model = compile_simulation_model(loadFixture());
    const belt = model.links.find(
      (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
    )!;
    const motor = model.links.find(
      (l): l is Extract<Link, { type: "MotorAngle" }> => l.type === "MotorAngle",
    )!;

    let prev: KinematicSnapshot | null = null;
    let attached = true;
    let reattachFrame = -1;

    for (let frame = 0; frame < 900; frame++) {
      if (frame === 460) motor.omega = -motor.omega;
      const snap = step_simulation(model, frame * dt, prev, dt);
      const move = prev ? biggestMove(prev, snap) : { key: "", d: 0 };
      prev = snap;

      const now = !belt.disconnected?.some(Boolean);
      if (now !== attached) {
        attached = now;
        if (now) reattachFrame = frame;
        console.log(
          `    f${frame} ${now ? "RATTACHÉE" : "détachée"} — saut ${move.d.toFixed(2)} px`,
        );
      }
      if (reattachFrame > 0 && frame > reattachFrame && frame <= reattachFrame + 4)
        console.log(
          `    f${frame} saut ${move.d.toFixed(2)} px | ${(snap.unsatisfied ?? []).length} violées | ` +
            (snap.unsatisfied ?? [])
              .slice()
              .sort((x, y) => y.residual - x.residual)
              .slice(0, 3)
              .map((r) => `${r.type} ${r.residual.toExponential(1)}`)
              .join(", "),
        );
      if (frame === 899)
        console.log(
          `    fin : ${(snap.unsatisfied ?? []).length} violées | ` +
            (snap.unsatisfied ?? [])
              .slice()
              .sort((x, y) => y.residual - x.residual)
              .slice(0, 3)
              .map((r) => `${r.type} ${r.residual.toExponential(1)}`)
              .join(", "),
        );
    }
  }, 600_000);
});
