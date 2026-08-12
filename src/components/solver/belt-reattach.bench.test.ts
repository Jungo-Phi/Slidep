import { describe, it } from "vitest";
import disconnectJson from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { Link } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import { belt_pieces, BeltVia } from "../../utils/belt-path";
import {
  beltContact,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { snapshot_point } from "./snapshot";

/**
 * Chantier 5, sur `Déconnexion courroie.slidep`. Ce mécanisme ne TRAVERSE pas la limite
 * de tangence, il s'installe dessus : une fois la poulie lâchée, le brin fusionné passe
 * à travers elle de 0.8 à 5 px pendant cent frames. C'est donc le bon banc pour choisir
 * l'hystérésis — et le seul du dossier qui exerce le rattachement.
 *
 * Le seuil est balayé DANS LE MÊME PROCESSUS, jamais entre deux exécutions.
 */

const loadFixture = () => load_mechanism(JSON.parse(disconnectJson)).mechanism;

type Belt = Extract<Link, { type: "BeltLength" }>;

/** A snapshot may key a fused node by either of its parts. */
const at = (snapshot: KinematicSnapshot, key: string) =>
  snapshot_point(snapshot, key) ?? snapshot_point(snapshot, key.split(",")[0]);

/** Geometric length of the belt on its REDUCED loop, the only honest measurement. */
function beltLength(belt: Belt, snapshot: KinematicSnapshot): number {
  const vias: BeltVia[] = [];
  const wraps: number[] = [];
  for (let i = 0; i < belt.gearPosKeys.length; i++) {
    if (belt.disconnected?.[i]) continue;
    const pos = at(snapshot, belt.gearPosKeys[i]);
    if (!pos) return NaN;
    vias.push({ pos, radius: belt.radii[i], clockwise: belt.directions[i] });
    wraps.push(belt.wraps?.[i] ?? 0);
  }
  return belt_pieces(vias, belt.closed, wraps).reduce(
    (a, p) => a + p.length,
    0,
  );
}

/** Worst residual of the belt's no-slip family, in belt-px. */
function beltResidual(residuals: { type: string; residual: number }[]): number {
  return residuals
    .filter(
      (r) =>
        r.type === "BeltSegmentNoSlip" || r.type === "BeltSubChainAggregate",
    )
    .reduce((a, r) => Math.max(a, r.residual), 0);
}

/** One run at a given hysteresis, reporting what the contact state did. */
function run(reattachArc: number, frames: number) {
  beltContact.reattachArc = reattachArc;
  const model = compile_simulation_model(loadFixture());
  const belt = model.links.find((l): l is Belt => l.type === "BeltLength")!;

  let prev: KinematicSnapshot | null = null;
  let attached = belt.gearPosKeys.map(() => true);
  let flips = 0;
  let firstDetach = -1;
  let lengthMin = Infinity;
  let lengthMax = -Infinity;
  let worstResidual = 0;
  let residualAfter = 0;

  const trace: string[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const snap = step_simulation(model, frame / 60, prev, 1 / 60);
    prev = snap;

    const now = belt.gearPosKeys.map((_, i) => !belt.disconnected?.[i]);
    now.forEach((a, i) => {
      if (a === attached[i]) return;
      flips++;
      if (!a && firstDetach < 0) firstDetach = frame;
    });
    attached = now;

    const len = beltLength(belt, snap);
    if (frame > 5) {
      lengthMin = Math.min(lengthMin, len);
      lengthMax = Math.max(lengthMax, len);
    }
    const res = beltResidual(snap.unsatisfied ?? []);
    if (frame >= 190 && frame <= 240)
      trace.push(
        `    f${frame} len ${len.toFixed(2)} res ${res.toExponential(1)} det [${(belt.disconnected ?? []).map((d) => (d ? 1 : 0)).join("")}]`,
      );
    worstResidual = Math.max(worstResidual, res);
    if (frame === frames - 1) residualAfter = res;
  }
  beltContact.reattachArc = 1.0;
  return {
    trace,
    flips,
    firstDetach,
    lengthSpan: lengthMax - lengthMin,
    worstResidual,
    residualAfter,
    detachedAtEnd: (belt.disconnected ?? []).filter(Boolean).length,
  };
}

describe("chantier 5 — hystérésis de rattachement", () => {
  it("balayage du seuil sur Déconnexion courroie", () => {
    const rows: string[] = [];
    const traceOut: string[] = [];
    for (const arc of [0, 0.25, 0.5, 1, 2, 3, 5, 1e9]) {
      const r = run(arc, 320);
      if (arc === 1) traceOut.push(...r.trace);
      rows.push(
        `  | ${arc === 1e9 ? "jamais" : arc.toFixed(2)} | ${r.flips} | ${
          r.firstDetach
        } | ${r.detachedAtEnd} | ${r.lengthSpan.toFixed(3)} | ${r.worstResidual.toExponential(
          2,
        )} | ${r.residualAfter.toExponential(2)} |`,
      );
    }
    console.log(
      "\n  | seuil (px d'arc) | bascules | 1er détachement | détachées à la fin | amplitude longueur | pire résidu q | résidu final |",
    );
    console.log("  |---|---|---|---|---|---|---|");
    for (const row of rows) console.log(row);
    for (const line of traceOut) console.log(line);
  }, 600_000);

  /**
   * Aller-retour : le moteur repart en arrière une fois la poulie lâchée, donc la
   * géométrie repasse par où elle est venue et la poulie revient DU CÔTÉ par lequel elle
   * est partie — le seul cas où le rattachement peut se produire.
   */
  it("aller-retour moteur inversé", () => {
    for (const [arc, reverseAt] of [
      [0, 240],
      [0.25, 240],
      [1, 240],
      [3, 240],
      // Reversing right at the frontier is the chatter case: the geometry then hovers on
      // the tangency instead of walking through it.
      [0, 199],
      [0.25, 199],
      [1, 199],
      [3, 199],
      [0, 202],
      [1, 202],
    ] as const) {
      beltContact.reattachArc = arc;
      const model = compile_simulation_model(loadFixture());
      const belt = model.links.find((l): l is Belt => l.type === "BeltLength")!;
      const motor = model.links.find(
        (l): l is Extract<Link, { type: "MotorAngle" }> =>
          l.type === "MotorAngle",
      )!;

      let prev: KinematicSnapshot | null = null;
      let attached = true;
      let flips = 0;
      let detachFrame = -1;
      let reattachFrame = -1;
      let lengthMin = Infinity;
      let lengthMax = -Infinity;

      for (let frame = 0; frame < 480; frame++) {
        if (frame === reverseAt) motor.omega = -motor.omega;
        const snap = step_simulation(model, frame / 60, prev, 1 / 60);
        prev = snap;

        const now = !belt.disconnected?.some(Boolean);
        if (now !== attached) {
          flips++;
          if (now) reattachFrame = frame;
          else if (detachFrame < 0) detachFrame = frame;
          attached = now;
        }
        if (frame > 5) {
          const len = beltLength(belt, snap);
          lengthMin = Math.min(lengthMin, len);
          lengthMax = Math.max(lengthMax, len);
        }
      }
      console.log(
        `  seuil ${arc} px — détachée f${detachFrame}, rattachée f${reattachFrame}, ` +
          `${flips} bascules, longueur ${lengthMin.toFixed(2)}…${lengthMax.toFixed(2)} ` +
          `(amplitude ${(lengthMax - lengthMin).toFixed(3)})`,
      );
      beltContact.reattachArc = 1.0;
    }
  }, 600_000);
});
