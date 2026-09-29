import { describe, it, expect } from "vitest";
import coreXY2 from "../../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import testSlider from "../../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Mechanism, Point2 } from "../../../types";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  apply_dynamic_snapshot_to_mechanism,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  dynamic_snapshot_at,
  effort_snapshot_at,
  snapshot_at,
  snapshot_index_at,
  step_dynamic_simulation,
  step_simulation,
} from "../dynamics/simulation-engine";
import { compute_force_balance } from "../analysis/force-balance";
import { DynamicSnapshot, KinematicSnapshot, LinkReaction } from "../../../types/runtime-state";
import {
  make_snapshot_layout,
  snapshot_angle,
  snapshot_belt_detached,
  snapshot_point,
} from "../snapshot";

/**
 * Interpolating between two snapshots is a drawing, not a solve: the average of two states that each satisfy the constraints does not satisfy them.
 * What this measures is how much that costs on the one thing it can visibly break — a rigid beam's length — against the error already present in the recorded snapshots themselves.
 */

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Vilbrequin", vilbrequin],
];

/** Rest lengths of the rigid edges, read from the edit-time mechanism. */
function beamLengths(m: Mechanism): Map<string, number> {
  const out = new Map<string, number>();
  for (const el of m.mechanicalElements)
    if (el.type === "beam")
      out.set(el.id, el.positionStart.distance_to(el.positionEnd));
  return out;
}

/** Worst |drawn length − rest length| over the rigid edges of a drawn mechanism. */
function worstBeamError(drawn: Mechanism, rest: Map<string, number>): number {
  let worst = 0;
  for (const el of drawn.mechanicalElements) {
    if (el.type !== "beam") continue;
    const target = rest.get(el.id);
    if (target === undefined) continue;
    const d = Math.abs(el.positionStart.distance_to(el.positionEnd) - target);
    if (d > worst) worst = d;
  }
  return worst;
}

function record(json: string, frames: number) {
  const mechanism = loadFixture(json);
  const model = compile_simulation_model(mechanism);
  const snaps: KinematicSnapshot[] = [];
  let prev: KinematicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    prev = step_simulation(model, i * RECORD_DT, prev, RECORD_DT);
    snaps.push(prev);
  }
  return { mechanism, snaps };
}

describe("interpolation des snapshots", () => {
  it("l'erreur ajoutée reste sous celle déjà présente dans les snapshots", () => {
    const FRAMES = 120;
    console.log(
      "\n  | mécanisme | erreur des snapshots | erreur interpolée (u=0.5) | ajouté |",
    );
    console.log("  |---|---|---|---|");

    let worstAdded = 0;
    for (const [name, json] of MECHANISMS) {
      const { mechanism, snaps } = record(json, FRAMES);
      const rest = beamLengths(mechanism);
      if (rest.size === 0) {
        console.log(`  | ${name} | (aucune poutre) | — | — |`);
        continue;
      }

      let atNodes = 0; // error already carried by the recorded snapshots
      let interpolated = 0; // error of the half-way drawing
      for (let i = 0; i < snaps.length - 1; i++) {
        atNodes = Math.max(
          atNodes,
          worstBeamError(apply_snapshot_to_mechanism(mechanism, snaps[i]), rest),
        );
        const mid = snapshot_at(snaps, (i + 0.5) * RECORD_DT);
        if (!mid) continue;
        interpolated = Math.max(
          interpolated,
          worstBeamError(apply_snapshot_to_mechanism(mechanism, mid), rest),
        );
      }
      const added = Math.max(0, interpolated - atNodes);
      worstAdded = Math.max(worstAdded, added);
      console.log(
        `  | ${name} | ${atNodes.toExponential(2)} px | ${interpolated.toExponential(2)} px | ${added.toExponential(2)} px |`,
      );
    }

    console.log(`\n  pire ajout : ${worstAdded.toExponential(3)} px`);
    // A tenth of a pixel is the scale at which a beam's length change becomes visible on a canvas; the interpolation must stay well under it to be a free smoothing.
    expect(worstAdded).toBeLessThan(0.1);
  }, 300_000);

  it("au pas RÉELLEMENT enregistré, l'erreur reste sous le même seuil", () => {
    // The recorder solves at RECORD_DT and keeps one instant in two, so what the app interpolates across is twice the step measured above — and the error of a linear interpolation is second order in it, so this is where it is expected to quadruple.
    const FRAMES = 120;
    console.log("\n  | mécanisme | pas 1/120 | pas retenu 1/60 | rapport |");
    console.log("  |---|---|---|---|");

    let worstAdded = 0;
    for (const [name, json] of MECHANISMS) {
      const { mechanism, snaps } = record(json, FRAMES);
      const rest = beamLengths(mechanism);
      if (rest.size === 0) continue;
      const kept = snaps.filter((_, i) => i % 2 === 0);

      const added = (series: KinematicSnapshot[], step: number) => {
        let atNodes = 0;
        let interpolated = 0;
        for (let i = 0; i < series.length - 1; i++) {
          atNodes = Math.max(
            atNodes,
            worstBeamError(apply_snapshot_to_mechanism(mechanism, series[i]), rest),
          );
          const mid = snapshot_at(series, (i + 0.5) * step);
          if (!mid) continue;
          interpolated = Math.max(
            interpolated,
            worstBeamError(apply_snapshot_to_mechanism(mechanism, mid), rest),
          );
        }
        return Math.max(0, interpolated - atNodes);
      };

      const fine = added(snaps, RECORD_DT);
      const coarse = added(kept, 2 * RECORD_DT);
      worstAdded = Math.max(worstAdded, coarse);
      console.log(
        `  | ${name} | ${fine.toExponential(2)} px | ${coarse.toExponential(2)} px | ` +
          `${fine > 0 ? (coarse / fine).toFixed(1) : "—"}× |`,
      );
    }
    console.log(`\n  pire ajout au pas retenu : ${worstAdded.toExponential(3)} px`);
    expect(worstAdded).toBeLessThan(0.1);
  }, 300_000);

  it("aux instants enregistrés, elle rend le snapshot lui-même", () => {
    const { snaps } = record(jansen, 20);
    for (let i = 0; i < snaps.length; i++) {
      const got = snapshot_at(snaps, i * RECORD_DT);
      expect(got).toBe(snaps[i]);
    }
  }, 60_000);

  it("ne franchit pas un changement de topologie de courroie", () => {
    // `Déconnexion courroie` drops a pulley mid-run: across that frame the earlier snapshot must be held, never a half-detached belt.
    const { snaps } = record(disconnect, 400);
    const detached = (s: KinematicSnapshot) =>
      s.layout.belts
        .map((id) => `${id}:${snapshot_belt_detached(s, id) ?? ""}`)
        .join("|");
    let transitions = 0;
    for (let i = 0; i < snaps.length - 1; i++) {
      if (detached(snaps[i]) === detached(snaps[i + 1])) continue;
      transitions++;
      expect(snapshot_at(snaps, (i + 0.5) * RECORD_DT)).toBe(snaps[i]);
    }
    console.log(`  ${transitions} transition(s) de topologie traversée(s)`);
    expect(transitions).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * Everything that reads a snapshot by time searches the axis rather than dividing by the step.
 * Recording is uniform today, so these hold nothing up on their own — they are what keeps the readers correct if a variable step ever comes back.
 */
describe("axe de temps non uniforme", () => {
  /** Snapshots at the given times, carrying one node that moves with time. They share one
   * layout, as the snapshots of a single recording do. */
  const at = (times: number[]): KinematicSnapshot[] => {
    const layout = make_snapshot_layout(["n"], ["g"]);
    return times.map((t) => {
      const positions = new Float64Array(layout.keys.length * 2).fill(NaN);
      positions[0] = t;
      positions[1] = 0;
      return { t, layout, positions, angles: Float64Array.of(t) };
    });
  };

  it("encadre l'instant demandé quel que soit l'espacement", () => {
    const snaps = at([0, 1, 1.25, 5, 5.5]);
    expect(snapshot_index_at(snaps, -3)).toBe(0);
    expect(snapshot_index_at(snaps, 0)).toBe(0);
    expect(snapshot_index_at(snaps, 1.2)).toBe(1);
    expect(snapshot_index_at(snaps, 1.25)).toBe(2);
    expect(snapshot_index_at(snaps, 4.9)).toBe(2);
    expect(snapshot_index_at(snaps, 5.5)).toBe(4);
    expect(snapshot_index_at(snaps, 99)).toBe(4);
  });

  it("interpole sur la durée réelle de l'intervalle, pas sur RECORD_DT", () => {
    // A gap of 4 s followed by one of 0.5 s: half-way across each is the midpoint of that gap, which fixed-step arithmetic would place elsewhere entirely.
    const snaps = at([0, 4, 4.5]);
    const x = (t: number) => snapshot_point(snapshot_at(snaps, t)!, "n")?.x;
    expect(x(2)).toBeCloseTo(2, 12);
    expect(x(4.25)).toBeCloseTo(4.25, 12);
    expect(snapshot_angle(snapshot_at(snaps, 4.25)!, "g")).toBeCloseTo(4.25, 12);
    // Recorded instants still hand back the snapshot itself, untouched.
    expect(snapshot_at(snaps, 4)).toBe(snaps[1]);
  });

});

describe("réactions à travers l'interpolation dynamique", () => {
  const layout = make_snapshot_layout(["n"], []);
  const dynSnap = (t: number, reactions: LinkReaction[]): DynamicSnapshot => ({
    t,
    layout,
    positions: Float64Array.of(t, 0),
    angles: new Float64Array(0),
    velocities: Float64Array.of(0, 0),
    accelerations: Float64Array.of(0, 0),
    angleVelocities: new Float64Array(0),
    angleAccelerations: new Float64Array(0),
    reactions,
  });

  it("un instant interpolé mélange une réaction stable en signe", () => {
    // A frame drawn between two recorded ticks is most of what playback shows — if it dropped `reactions` there, every overlay arrow would read empty except at an exact tick or the very last frame (what a grab draws).
    const a = dynSnap(0, [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx: 1, fy: 2 }]);
    const b = dynSnap(1, [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx: 3, fy: 6 }]);
    const mid = dynamic_snapshot_at([a, b], 0.5);
    expect(mid?.reactions).toEqual([
      { type: "Distance", key: "n", atAnchor: true, kind: "force", fx: 2, fy: 4 },
    ]);
  });

  it("une réaction qui change de signe tient l'instant le plus proche plutôt que de mélanger", () => {
    const a = dynSnap(0, [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx: 10, fy: 0 }]);
    const b = dynSnap(1, [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx: -10, fy: 0 }]);
    // Nearer a: a's own value.
    expect(dynamic_snapshot_at([a, b], 0.25)?.reactions).toEqual(a.reactions);
    // Nearer b: b's own value, never a blend that crosses zero.
    expect(dynamic_snapshot_at([a, b], 0.75)?.reactions).toEqual(b.reactions);
  });

  it("une réaction absente d'un côté est exclue plutôt qu'inventée", () => {
    const reactions: LinkReaction[] = [
      { type: "Distance", key: "n", atAnchor: true, kind: "force", fx: 1, fy: 2 },
    ];
    const a = dynSnap(0, reactions);
    const b = dynSnap(1, []);
    expect(dynamic_snapshot_at([a, b], 0.5)?.reactions).toEqual([]);
  });
});

describe("efforts intérieurs à travers l'interpolation dynamique", () => {
  it("entre deux images, les efforts sont ceux de l'instant enregistré le plus proche, et seul le mouvement est interpolé", () => {
    // Two recorded instants whose efforts differ as much as a frame across an impact can: a blend of the two would be a state the mechanism was never in.
    const layout = make_snapshot_layout(["n"], []);
    const recorded = (t: number, x: number, ax: number, fx: number): DynamicSnapshot => ({
      t,
      layout,
      positions: Float64Array.of(x, 0),
      angles: new Float64Array(0),
      // Constant, consistent with `x` itself moving from 0 to 1 over this test's one-second span — the Hermite position curve below reduces exactly to that same straight line once its tangent already IS the line's own slope.
      velocities: Float64Array.of(1, 0),
      accelerations: Float64Array.of(ax, 0),
      angleVelocities: new Float64Array(0),
      angleAccelerations: new Float64Array(0),
      reactions: [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx, fy: 0 }],
      beamCohesion: [
        {
          beamID: "00000000-0000-0000-0000-00000000000b",
          // Not a real beam endpoint pair ("n2" is not in `layout`): `beam_axis` cannot resolve, so this beam's torsor exercises the same nearest-instant fallback as a reaction that changes sign — nothing here models beam geometry.
          k0: "n",
          k1: "n2",
          start: { fx, fy: 0, m: 0 },
          end: { fx: -fx, fy: 0, m: 0 },
          attachedNodes: [],
          determinate: true,
        },
      ],
    });
    const a = recorded(0, 0, -1000, 50);
    const b = recorded(1, 1, 0, -5);
    const snaps = [a, b];

    for (const [t, nearest] of [[0.25, a], [0.5, a], [0.75, b]] as const) {
      const shown = dynamic_snapshot_at(snaps, t)!;
      // The motion follows the cursor: a constant velocity of 1 m/s, so position at time `t` is `t` itself, and the Hermite curve's own tangent reads back that same constant.
      expect(shown.positions[0]).toBeCloseTo(t, 12);
      expect(shown.velocities[0]).toBeCloseTo(1, 12);
      // Accelerations are a derivative of velocity, not a solved equilibrium share: they blend unconditionally, whatever their sign does.
      expect(shown.accelerations[0]).toBeCloseTo(-1000 + 1000 * t, 12);
      // `fx` runs 50 → -5, crossing zero: the reaction and the beam torsor it comes from both hold the nearest instant's own value instead of blending through the crossing.
      expect(shown.reactions).toEqual(nearest.reactions);
      expect(shown.beamCohesion).toEqual(nearest.beamCohesion);
      // A reading that needs the pose as well gets the whole of that instant.
      expect(effort_snapshot_at(snaps, t)).toBe(nearest);
    }
  });

  it("le torseur d'une poutre qui tourne suit sa direction, pas le repère monde", () => {
    // Two nodes at the beam's ends, rotating 90° between the two recorded instants — a world-frame lerp of `start.fx/fy` would point neither along the beam at u=0 nor at u=1, let alone in between.
    const layout = make_snapshot_layout(["k0", "k1"], []);
    const beam = (t: number, p0: Point2, p1: Point2, axialForce: number): DynamicSnapshot => ({
      t,
      layout,
      positions: Float64Array.of(p0.x, p0.y, p1.x, p1.y),
      angles: new Float64Array(0),
      velocities: new Float64Array(4),
      accelerations: new Float64Array(4),
      angleVelocities: new Float64Array(0),
      angleAccelerations: new Float64Array(0),
      beamCohesion: [
        {
          beamID: "00000000-0000-0000-0000-00000000000c",
          k0: "k0",
          k1: "k1",
          // Pure tension along the beam's own axis at each instant — no transverse component.
          start: { fx: -axialForce * (p1.x - p0.x), fy: -axialForce * (p1.y - p0.y), m: 0 },
          end: { fx: axialForce * (p1.x - p0.x), fy: axialForce * (p1.y - p0.y), m: 0 },
          attachedNodes: [],
          determinate: true,
        },
      ],
    });
    const a = beam(0, new Point2(0, 0), new Point2(1, 0), 10); // horizontal
    const b = beam(1, new Point2(0, 0), new Point2(0, 1), 10); // vertical, rotated 90°
    const shown = dynamic_snapshot_at([a, b], 0.5)!;
    const cohesion = shown.beamCohesion![0];
    // The beam sits at 45° half-way through the rotation: its end torsor should point along THAT axis, not blend the horizontal and vertical world vectors (which would average to a diagonal of a different length, and — for a beam turning further — could cancel out entirely).
    const axis = new Point2(1, 1).normalize();
    const f = new Point2(cohesion.end.fx, cohesion.end.fy);
    expect(f.normalize().dot(axis)).toBeCloseTo(1, 6);
  });

  it("suit la direction même quand k0/k1 est une clé fusionnée (jointe par des virgules)", () => {
    // A beam end coincident with something else (a join, a pin) is exactly `BeamCohesionSpec.k0`'s own doc case: the FUSED key, comma-joined, which `layout.index` never holds as one string — only its individual parts. This is the bug a real mechanism (any beam pinned to a join) hit and the synthetic "k0"/"k1" test above never could, since it never used a fused key.
    const layout = make_snapshot_layout(["k0", "k1"], []);
    const beam = (t: number, p0: Point2, p1: Point2, axialForce: number): DynamicSnapshot => ({
      t,
      layout,
      positions: Float64Array.of(p0.x, p0.y, p1.x, p1.y),
      angles: new Float64Array(0),
      velocities: new Float64Array(4),
      accelerations: new Float64Array(4),
      angleVelocities: new Float64Array(0),
      angleAccelerations: new Float64Array(0),
      beamCohesion: [
        {
          beamID: "00000000-0000-0000-0000-00000000000e",
          // "missing-join-id" resolves nowhere in `layout`; only the second, comma-joined part does — same shape as a real fused key where the beam's own natural key is not the one `layout.index` happens to carry.
          k0: "missing-join-id,k0",
          k1: "k1",
          start: { fx: -axialForce * (p1.x - p0.x), fy: -axialForce * (p1.y - p0.y), m: 0 },
          end: { fx: axialForce * (p1.x - p0.x), fy: axialForce * (p1.y - p0.y), m: 0 },
          attachedNodes: [],
          determinate: true,
        },
      ],
    });
    const a = beam(0, new Point2(0, 0), new Point2(1, 0), 10);
    const b = beam(1, new Point2(0, 0), new Point2(0, 1), 10);
    const shown = dynamic_snapshot_at([a, b], 0.5)!;
    const cohesion = shown.beamCohesion![0];
    const axis = new Point2(1, 1).normalize();
    const f = new Point2(cohesion.end.fx, cohesion.end.fy);
    expect(f.normalize().dot(axis)).toBeCloseTo(1, 6);
  });

  it("une poutre non déterminée tient son amplitude mais suit quand même sa direction", () => {
    // `k1` swings on a quarter-circle around a fixed `k0`, with the matching tangent velocity — real motion, not a hand-placed jump — but `determinate: false` on both sides refuses to blend the torsor's magnitude.
    const layout = make_snapshot_layout(["k0", "k1"], []);
    const R = 1;
    const omega = Math.PI / 2;
    const axialForce = 10;
    const beam = (t: number): DynamicSnapshot => {
      const theta = omega * t;
      const p1 = new Point2(R * Math.cos(theta), R * Math.sin(theta));
      return {
        t,
        layout,
        positions: Float64Array.of(0, 0, p1.x, p1.y),
        angles: new Float64Array(0),
        velocities: Float64Array.of(0, 0, -R * omega * Math.sin(theta), R * omega * Math.cos(theta)),
        accelerations: new Float64Array(4),
        angleVelocities: new Float64Array(0),
        angleAccelerations: new Float64Array(0),
        beamCohesion: [
          {
            beamID: "00000000-0000-0000-0000-00000000000d",
            k0: "k0",
            k1: "k1",
            start: { fx: -axialForce * p1.x, fy: -axialForce * p1.y, m: 0 },
            end: { fx: axialForce * p1.x, fy: axialForce * p1.y, m: 0 },
            attachedNodes: [],
            determinate: false,
          },
        ],
      };
    };
    const a = beam(0);
    const b = beam(1);
    const shown = dynamic_snapshot_at([a, b], 0.25)!;
    const cohesion = shown.beamCohesion![0];
    // Nearer a (u = 0.25): the direction must track wherever the beam is ITSELF currently drawn (its own interpolated k0→k1, whatever curve that turns out to be) — not the 0° it was solved at. The magnitude holds at `a`'s own reading instead of blending toward `b`'s.
    const k0 = new Point2(shown.positions[0], shown.positions[1]);
    const k1 = new Point2(shown.positions[2], shown.positions[3]);
    const axisU = k1.sub(k0).normalize();
    const f = new Point2(cohesion.end.fx, cohesion.end.fy);
    expect(f.normalize().dot(axisU)).toBeCloseTo(1, 6);
    expect(f.length()).toBeCloseTo(axialForce, 6);
    expect(cohesion.determinate).toBe(false);
  });

  it("la position suit la courbure entre deux instants, pas la corde", () => {
    // A point on a circle turning a quarter-turn between the two recorded instants — enough of the period per interval that a straight chord visibly cuts the arc, the exact case a fast-oscillating pendulum shows under a plain lerp.
    const layout = make_snapshot_layout(["p"], []);
    const R = 10;
    const omega = Math.PI / 2; // rad/s: a quarter turn over this one-second span
    const at = (t: number): DynamicSnapshot => {
      const theta = omega * t;
      return {
        t,
        layout,
        positions: Float64Array.of(R * Math.cos(theta), R * Math.sin(theta)),
        angles: new Float64Array(0),
        velocities: Float64Array.of(-R * omega * Math.sin(theta), R * omega * Math.cos(theta)),
        accelerations: new Float64Array(2),
        angleVelocities: new Float64Array(0),
        angleAccelerations: new Float64Array(0),
      };
    };
    const a = at(0);
    const b = at(1);
    const shown = dynamic_snapshot_at([a, b], 0.5)!;

    const trueMid = new Point2(R * Math.cos(omega * 0.5), R * Math.sin(omega * 0.5));
    const hermiteMid = new Point2(shown.positions[0], shown.positions[1]);
    const chordMid = new Point2(a.positions[0], a.positions[1]).lerp(
      new Point2(b.positions[0], b.positions[1]),
      0.5,
    );
    // The Hermite curve, which also matches each end's own velocity, cuts the true arc's error by well over half; the straight chord has no such guarantee and only matches the two endpoints.
    expect(hermiteMid.distance_to(trueMid)).toBeLessThan(chordMid.distance_to(trueMid) * 0.2);

    // The interpolated velocity is the drawn curve's own tangent, not an independent lerp: at the exact midpoint of a symmetric quarter-turn, that tangent points exactly along the true instantaneous velocity's own direction.
    const trueVelocityDir = new Point2(-Math.sin(omega * 0.5), Math.cos(omega * 0.5));
    const shownVelocity = new Point2(shown.velocities[0], shown.velocities[1]);
    expect(shownVelocity.normalize().dot(trueVelocityDir)).toBeCloseTo(1, 6);
  });

  it("entre deux images, une réaction stable en signe se mélange avec la position", () => {
    // Same shape as above, but `fx` stays positive on both sides: nothing here should ever hold.
    const layout = make_snapshot_layout(["n"], []);
    const recorded = (t: number, x: number, fx: number): DynamicSnapshot => ({
      t,
      layout,
      positions: Float64Array.of(x, 0),
      angles: new Float64Array(0),
      velocities: Float64Array.of(x, 0),
      accelerations: Float64Array.of(0, 0),
      angleVelocities: new Float64Array(0),
      angleAccelerations: new Float64Array(0),
      reactions: [{ type: "Distance", key: "n", atAnchor: true, kind: "force", fx, fy: 0 }],
    });
    const a = recorded(0, 0, 40);
    const b = recorded(1, 1, 60);
    const shown = dynamic_snapshot_at([a, b], 0.5)!;
    expect((shown.reactions![0] as { fx: number }).fx).toBeCloseTo(50, 12);
  });

  it("entre deux images, le bilan du corps libre se referme encore", () => {
    // Read the way the panel reads it: at the recorded instant nearest the one on screen, pose included.
    // Judged against the largest action of the instant, never against `ΣF` itself — that total is a small difference between big terms, and on a mechanism at rest it is zero while every term of it is not.
    const mechanism = loadFixture(testSlider);
    const model = compile_simulation_model(mechanism, true);
    const gravity = new Point2(0, -9.81);
    const snaps: DynamicSnapshot[] = [];
    let snap: DynamicSnapshot | null = null;
    for (let i = 0; i < 60; i++) {
      snap = step_dynamic_simulation(model, i * RECORD_DT, snap, RECORD_DT, gravity);
      snaps.push(snap);
    }

    let worst = 0;
    let peak = 0;
    for (let i = 0; i < snaps.length - 1; i++) {
      const shown = effort_snapshot_at(snaps, (snaps[i].t + snaps[i + 1].t) / 2)!;
      const balance = compute_force_balance(apply_dynamic_snapshot_to_mechanism(mechanism, shown), shown, gravity)!;
      let scale = Math.hypot(balance.inertia.x, balance.inertia.y);
      for (const action of balance.actions)
        scale = Math.max(scale, Math.hypot(action.force.x, action.force.y));
      peak = Math.max(peak, scale);
      worst = Math.max(worst, Math.hypot(balance.gap.x, balance.gap.y) / scale);
    }
    // Real actions to balance, or the check proves nothing.
    expect(peak).toBeGreaterThan(10);
    expect(worst).toBeLessThan(1e-2);
  }, 30_000);
});
