import { describe, it, expect } from "vitest";
import fixtureJson from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import { Point2 } from "../../types/point2";
import { Link, Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { belt_pieces, BeltVia } from "../../utils/belt-path";

/**
 * Reproduces the reported slip on the "Core XY modifié" mechanism: drive it, grab
 * the central carriage, move it out and back, and see what fails to return.
 * Measures only — nothing is modified.
 */

const f = (x: number, n = 4) => x.toFixed(n);
const P = (x: number, y: number) => new Point2(x, y);

/** The carriage both belts terminate on (their four end joins bracket it). */
const CARRIAGE = "4771336b-875c-4970-945f-f131754bd813";

/** The grounded join welded onto pulley 695de818's body. */
const GROUNDED_ON_PULLEY = "e8e3059a-bb45-4896-b2d3-7d91152854c0";

const loadFixture = (unground = false): Mechanism => {
  const { mechanism } = load_mechanism(JSON.parse(fixtureJson));
  if (unground)
    for (const el of mechanism.mechanicalElements)
      if (el.id === GROUNDED_ON_PULLEY && "isGrounded" in el)
        (el as { isGrounded: boolean }).isGrounded = false;
  return mechanism;
};

/** Snapshot positions are decoupled; a link may still name a fused key. */
const at = (positions: Map<string, Point2>, key: string) =>
  positions.get(key) ?? positions.get(key.split(",")[0]);

/** Drawn length of a BeltLength link's path, the same chain the constraint uses. */
const drawnLength = (
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
): number | null => {
  const vias: BeltVia[] = [];
  if (!link.closed) {
    const s = at(positions, link.startKey);
    if (!s) return null;
    vias.push({ pos: s, radius: 0, direction: false });
  }
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    if (link.disconnected?.[i]) continue;
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], direction: link.directions[i] });
  }
  if (!link.closed) {
    const e = at(positions, link.endKey);
    if (!e) return null;
    vias.push({ pos: e, radius: 0, direction: false });
  }
  return belt_pieces(vias, link.closed).reduce((a, p) => a + p.length, 0);
};

/**
 * The loose belt's no-slip differential, transcribed from the constraint
 * (constraint-functions.ts:1192-1218): h = the terminal's belt arc-length in its
 * pulley's frame, and C_diff = (h_S − h_E) − (diff0 − nFree·φ). Raw arrival
 * angles (no 2π-continuity tracking), so a ±2π jump would show as a step.
 */
const differential = (
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
  phi: number,
): { hS: number; hE: number; cdiff: number } | null => {
  const vias: BeltVia[] = [];
  const s = at(positions, link.startKey);
  const e = at(positions, link.endKey);
  if (!s || !e) return null;
  vias.push({ pos: s, radius: 0, direction: false });
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    if (link.disconnected?.[i]) continue;
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], direction: link.directions[i] });
  }
  vias.push({ pos: e, radius: 0, direction: false });
  const last = vias.length - 1;
  const pieces = belt_pieces(vias, false);
  let fsStart = 0;
  let fsEnd = 0;
  for (const pc of pieces) {
    if (pc.kind !== "segment") continue;
    if (pc.gearIndexA === 0) fsStart = pc.length;
    if (pc.gearIndexB === last) fsEnd = pc.length;
  }
  const arcAt = (v: number) => {
    const a = pieces.find((p) => p.kind === "arc" && p.gearIndex === v);
    return a && a.kind === "arc" ? a : null;
  };
  const signOf = (v: number) => (vias[v].direction ? -1 : 1);
  const arcS = arcAt(1);
  const arcE = arcAt(last - 1);
  const hS = arcS
    ? fsStart - vias[1].radius * signOf(1) * arcS.startAngle
    : fsStart;
  const hE = arcE
    ? fsEnd +
      vias[last - 1].radius *
        signOf(last - 1) *
        (arcE.startAngle + signOf(last - 1) * arcE.wrap)
    : fsEnd;
  const nFree = (link.startWound ? 0 : 1) + (link.endWound ? 0 : 1);
  return { hS, hE, cdiff: hS - hE - ((link.diff0 ?? 0) - nFree * phi) };
};

/** Every span of a belt, labelled by the vias it joins: `S`/`E` for the terminals,
 *  the pulley's short id otherwise. Arcs are labelled `arc <id>`. */
const spans = (
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
): { label: string; length: number }[] | null => {
  const vias: BeltVia[] = [];
  const labels: string[] = [];
  const s = at(positions, link.startKey);
  const e = at(positions, link.endKey);
  if (!s || !e) return null;
  vias.push({ pos: s, radius: 0, direction: false });
  labels.push("S");
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    if (link.disconnected?.[i]) continue;
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], direction: link.directions[i] });
    labels.push(link.gearPosKeys[i].split(",")[0].slice(0, 8));
  }
  vias.push({ pos: e, radius: 0, direction: false });
  labels.push("E");
  return belt_pieces(vias, false).map((p) => ({
    label:
      p.kind === "segment"
        ? `${labels[p.gearIndexA]}→${labels[p.gearIndexB]}`
        : `arc ${labels[p.gearIndex]}`,
    length: p.length,
  }));
};

type Frame = {
  frame: number;
  carriage: Point2;
  phi: number[];
  slack: (number | null)[];
  unsatisfied: string;
};

/** One run: recompiles the model (step_simulation mutates it), optionally drops
 *  the motor, and follows `path` with a grab (or no grab when `path` is null). */
const run = (opts: {
  motor: boolean;
  path: Point2[] | null;
  frames?: number;
  drop?: Link["type"][];
  unground?: boolean;
}): {
  frames: Frame[];
  first: Map<string, number>;
  last: Map<string, number>;
  lastPositions: Map<string, Point2>;
  belts: Extract<Link, { type: "BeltLength" }>[];
  startPos: Point2;
  key: string;
  positionsAt: Map<string, Point2>[];
} => {
  const model = compile_simulation_model(loadFixture(opts.unground));
  // Captured BEFORE any filtering: the belts stay measurable even when their
  // constraint is dropped from the solve.
  const belts = model.links.filter(
    (l): l is Extract<Link, { type: "BeltLength" }> => l.type === "BeltLength",
  );
  if (!opts.motor)
    model.links = model.links.filter((l) => l.type !== "MotorAngle");
  if (opts.drop?.length)
    model.links = model.links.filter((l) => !opts.drop!.includes(l.type));
  const key = model.keyMap.get(CARRIAGE) ?? CARRIAGE;
  const startPos = model.nodes.positions.get(key)!.clone();
  const phiKeys = [...model.nodes.angles.keys()].filter((k) =>
    k.endsWith(":phi"),
  );

  const n = opts.path ? opts.path.length : (opts.frames ?? 60);
  let prevPositions: Map<string, Point2> | null = null;
  let prevAngles: Map<string, number> | null = null;
  let first: Map<string, number> | null = null;
  const frames: Frame[] = [];
  const positionsAt: Map<string, Point2>[] = [];

  for (let i = 0; i < n; i++) {
    const snap = step_simulation(
      model,
      i / 60,
      prevPositions,
      prevAngles,
      1 / 60,
      opts.path ? { key: CARRIAGE, target: opts.path[i] } : undefined,
    );
    prevPositions = snap.positions;
    prevAngles = snap.angles;
    if (first === null && i === 4) first = new Map(snap.angles);
    positionsAt.push(snap.positions);
    frames.push({
      frame: i,
      carriage: at(snap.positions, key)!.clone(),
      phi: phiKeys.map((k) => snap.angles.get(k)!),
      slack: belts.map((b) => {
        const L = drawnLength(b, snap.positions);
        return L === null ? null : L - b.length;
      }),
      unsatisfied:
        snap.unsatisfied
          ?.map((u) => `${u.type} ${f(u.residual, 2)}`)
          .join("; ") ?? "—",
    });
  }
  return {
    frames,
    first: first ?? new Map(),
    last: prevAngles!,
    lastPositions: prevPositions!,
    belts,
    startPos,
    key,
    positionsAt,
  };
};

const table = (frames: Frame[], every: number) => {
  console.log(
    "| frame | chariot | φ par courroie | L − L0 par courroie | insatisfaits |",
  );
  console.log("|---|---|---|---|---|");
  frames.forEach((r) => {
    if (r.frame % every !== 0 && r.frame !== frames.length - 1) return;
    console.log(
      `| ${r.frame} | (${f(r.carriage.x, 1)}, ${f(r.carriage.y, 1)}) | ${r.phi
        .map((p) => f(p, 2))
        .join(" / ")} | ${r.slack
        .map((s) => (s === null ? "n/a" : f(s, 3)))
        .join(" / ")} | ${r.unsatisfied} |`,
    );
  });
};

describe("Core XY modifié — slip on the central carriage", () => {
  it("reports the mechanism it is driving", () => {
    const model = compile_simulation_model(loadFixture());
    const key = model.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const byType = new Map<string, number>();
    for (const l of model.links)
      byType.set(l.type, (byType.get(l.type) ?? 0) + 1);
    console.log("\n### Core XY modifié — le mécanisme\n");
    console.log(
      `- chariot ${key.slice(0, 8)} en (${f(
        model.nodes.positions.get(key)!.x,
        2,
      )}, ${f(model.nodes.positions.get(key)!.y, 2)}), mobilité ${model.nodes.posMasses.get(key)}`,
    );
    console.log(
      `- liens : ${[...byType].map(([t, n]) => `${t}×${n}`).join(", ")}`,
    );
    for (const l of model.links)
      if (l.type === "BeltLength")
        console.log(
          `- courroie ${l.owner?.slice(0, 8)} : closed = ${l.closed}, ${
            l.gearPosKeys.length
          } poulies, L0 = ${f(l.length, 2)}, phaseKey = ${
            l.phaseKey ? "oui" : "NON"
          }, diff0 = ${l.diff0 === undefined ? "—" : f(l.diff0, 2)}`,
        );
      else if (l.type === "MotorAngle")
        console.log(`- moteur sur ${l.angleKey.slice(0, 8)}, ω = ${l.omega}`);
    expect(model.links.length).toBeGreaterThan(0);
  });

  it("runs the motor alone: does the carriage move at all?", () => {
    const r = run({ motor: true, path: null, frames: 120 });
    console.log("\n### Moteur seul (ω = 2), pas de saisie\n");
    table(r.frames, 20);
    const moved = r.frames[r.frames.length - 1].carriage.distance_to(
      r.startPos,
    );
    console.log(`\n- déplacement total du chariot : ${f(moved, 4)} px`);
    expect(r.frames.length).toBe(120);
  });

  it("bisects: which link family immobilises the carriage?", () => {
    const model0 = compile_simulation_model(loadFixture());
    const key0 = model0.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model0.nodes.positions.get(key0)!.clone();
    const target = start.add(P(-120, 0));
    const path = Array.from({ length: 60 }, (_, i) =>
      start.add(P(-2 * Math.min(i, 60), 0)),
    );

    const sets: { name: string; drop: Link["type"][] }[] = [
      { name: "aucun (référence)", drop: [] },
      { name: "− BeltLength", drop: ["BeltLength"] },
      { name: "− BeltPhaseGear", drop: ["BeltPhaseGear"] },
      {
        name: "− BeltLength − BeltPhaseGear",
        drop: ["BeltLength", "BeltPhaseGear"],
      },
      { name: "− GearPerimeterPin", drop: ["GearPerimeterPin"] },
      { name: "− Angle", drop: ["Angle"] },
      { name: "− Distance", drop: ["Distance"] },
      { name: "− FixedOnSegment", drop: ["FixedOnSegment"] },
      { name: "− SlideOnSegment", drop: ["SlideOnSegment"] },
    ];

    console.log("\n### Bissection : qui immobilise le chariot ?\n");
    console.log(
      `Consigne : ${f(start.x, 1)} → ${f(target.x, 1)} (−120 px), 60 frames.\n`,
    );
    console.log("| liens retirés | x final | suivi | insatisfaits en fin |");
    console.log("|---|---|---|---|");
    for (const s of sets) {
      const r = run({ motor: false, path, drop: s.drop });
      const last = r.frames[r.frames.length - 1];
      const follow = (100 * (start.x - last.carriage.x)) / 120;
      console.log(
        `| ${s.name} | ${f(last.carriage.x, 1)} | ${f(follow, 1)} % | ${last.unsatisfied} |`,
      );
    }
    expect(sets.length).toBeGreaterThan(0);
  });

  it("shows where the belt redistributes while the carriage goes up", () => {
    // The grounded pulley is DELIBERATE: with one motor locked, a Core XY carriage
    // should only be able to move diagonally. It moves straight up instead. So:
    // when it goes up, which spans of the belt actually change length?
    const model0 = compile_simulation_model(loadFixture());
    const key0 = model0.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model0.nodes.positions.get(key0)!.clone();
    const path: Point2[] = [];
    for (let i = 0; i < 5; i++) path.push(start.clone());
    for (let d = 4; d <= 120; d += 4) path.push(start.add(P(0, -d)));

    const r = run({ motor: false, path });
    for (let b = 0; b < r.belts.length; b++) {
      const ref = spans(r.belts[b], r.positionsAt[4]);
      const end = spans(r.belts[b], r.positionsAt[r.positionsAt.length - 1]);
      if (!ref || !end) continue;
      const dy =
        r.frames[r.frames.length - 1].carriage.y - r.frames[4].carriage.y;
      console.log(
        `\n### Courroie ${r.belts[b].owner?.slice(0, 8)} — brins pendant une montée de ${f(
          -dy,
          1,
        )} px\n`,
      );
      console.log("| pièce | longueur au repos | après | Δ |");
      console.log("|---|---|---|---|");
      ref.forEach((piece, i) => {
        const d = end[i].length - piece.length;
        console.log(
          `| ${piece.label} | ${f(piece.length, 2)} | ${f(end[i].length, 2)} | ${
            Math.abs(d) < 0.005 ? "—" : `**${f(d, 2)}**`
          } |`,
        );
      });
      console.log(
        `\nSomme des Δ : ${f(
          end.reduce((a, p, i) => a + p.length - ref[i].length, 0),
          3,
        )} px (la longueur totale est conservée).`,
      );

      // Material balance. No belt is stored on a pulley (its arc is constant), so
      // the flow through pulley k and the flow through pulley k+1 differ by exactly
      // the length change of the span between them:
      //     ΔL(span k) = q_k − q_{k+1},  with q = 0 at both terminals.
      // Solving forward gives the travel EACH pulley must carry. A single shared φ
      // can only represent a UNIFORM q.
      const segIdx = ref
        .map((p, i) => (p.label.includes("→") ? i : -1))
        .filter((i) => i >= 0);
      let q = 0;
      const flows: { pulley: string; q: number; turn: number }[] = [];
      segIdx.forEach((i, j) => {
        q = q - (end[i].length - ref[i].length);
        const nextArc = ref[i + 1];
        if (nextArc && nextArc.label.startsWith("arc "))
          flows.push({
            pulley: nextArc.label.slice(4),
            q,
            turn: q / r.belts[b].radii[j],
          });
      });
      console.log("\nFlux de matière requis (0 aux deux extrémités) :\n");
      console.log("| poulie | flux requis (px) | rotation requise (rad) |");
      console.log("|---|---|---|");
      flows.forEach((fl) =>
        console.log(`| ${fl.pulley} | ${f(fl.q, 2)} | ${f(fl.turn, 3)} |`),
      );
      console.log(
        `\nFlux uniforme ? ${
          new Set(flows.map((fl) => f(fl.q, 1))).size === 1 ? "oui" : "**NON**"
        } — φ partagé n'en représente qu'un seul.`,
      );
    }
    expect(r.frames.length).toBe(path.length);
  });

  it("confirms the cause: one grounded node freezes a pulley, hence its belt", () => {
    // Pulley 695de818 carries body join e8e3059a, which is GROUNDED. Its
    // GearPerimeterPin therefore pins that pulley's angle to the ground, and
    // BeltPhaseGear (r·ε·θ = φ) pins the whole belt's travel φ with it. A belt
    // that cannot travel cannot let the carriage move along the rail.
    const model0 = compile_simulation_model(loadFixture());
    const key0 = model0.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model0.nodes.positions.get(key0)!.clone();
    const path: Point2[] = [];
    for (let i = 0; i < 5; i++) path.push(start.clone());
    for (let d = 4; d <= 120; d += 4) path.push(start.add(P(-d, 0)));

    console.log("\n### Cause : un nœud ancré sur la poulie 695de818\n");
    console.log(
      "| mécanisme | x final | suivi | φ courroie 0 | φ courroie 1 |",
    );
    console.log("|---|---|---|---|---|");
    for (const unground of [false, true]) {
      const r = run({ motor: false, path, unground });
      const last = r.frames[r.frames.length - 1];
      console.log(
        `| ${unground ? "e8e3059a dé-ancré" : "tel quel"} | ${f(
          last.carriage.x,
          1,
        )} | ${f((100 * (start.x - last.carriage.x)) / 120, 1)} % | ${f(
          last.phi[0],
          2,
        )} | ${f(last.phi[1], 2)} |`,
      );
    }
    expect(path.length).toBeGreaterThan(0);
  });

  it("measures each belt's drawn length as the carriage moves (constraint off)", () => {
    // With BeltLength removed the carriage follows the grab freely. The belts are
    // still DRAWN — so we can ask the question the constraint asks: does moving the
    // carriage change the path length? If it does, an inextensible belt must lock
    // it, and travel (φ) cannot help: with both ends on the carriage, φ changes no
    // geometry at all.
    const model0 = compile_simulation_model(loadFixture());
    const key0 = model0.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model0.nodes.positions.get(key0)!.clone();

    for (const axis of ["x (le long du rail)", "y (le rail monte)"]) {
      const dir = axis.startsWith("x") ? P(-1, 0) : P(0, -1);
      const path: Point2[] = [];
      for (let i = 0; i < 5; i++) path.push(start.clone());
      for (let d = 2; d <= 120; d += 2) path.push(start.add(dir.mul(d)));

      const r = run({ motor: false, path, drop: ["BeltLength"] });
      console.log(
        `\n### Longueur tracée vs déplacement du chariot en ${axis} (BeltLength retirée)\n`,
      );
      console.log(
        "| chariot | déplacement | ΔL courroie 0 | ΔL courroie 1 | ΔL₀+ΔL₁ |",
      );
      console.log("|---|---|---|---|---|");
      const ref = r.frames[4];
      r.frames.forEach((fr) => {
        if (fr.frame % 8 !== 0 && fr.frame !== r.frames.length - 1) return;
        const d0 = fr.slack[0]! - ref.slack[0]!;
        const d1 = fr.slack[1]! - ref.slack[1]!;
        console.log(
          `| (${f(fr.carriage.x, 1)}, ${f(fr.carriage.y, 1)}) | ${f(
            fr.carriage.sub(ref.carriage).length(),
            1,
          )} | ${f(d0, 3)} | ${f(d1, 3)} | ${f(d0 + d1, 3)} |`,
        );
      });
      const last = r.frames[r.frames.length - 1];
      const moved = last.carriage.sub(ref.carriage).length();
      const d0 = last.slack[0]! - ref.slack[0]!;
      const d1 = last.slack[1]! - ref.slack[1]!;
      console.log(
        `\nSensibilité dL/d(déplacement) : ${f(d0 / moved, 4)} et ${f(
          d1 / moved,
          4,
        )} px/px (0 = la courroie n'empêche rien).\n`,
      );
    }
    expect(true).toBe(true);
  });

  it.each([
    ["x (le long du rail)", P(-1, 0)],
    ["y (le rail monte)", P(0, -1)],
  ])("tracks the no-slip differential while moving in %s", (axis, dir) => {
    const model0 = compile_simulation_model(loadFixture());
    const key0 = model0.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model0.nodes.positions.get(key0)!.clone();
    const path: Point2[] = [];
    for (let i = 0; i < 5; i++) path.push(start.clone());
    for (let d = 4; d <= 120; d += 4)
      path.push(start.add((dir as Point2).mul(d)));

    const r = run({ motor: false, path });
    console.log(
      `\n### Différentiel no-slip pendant un déplacement en ${axis}\n`,
    );
    console.log(
      "C_diff = (h_S − h_E) − (diff0 − 2φ) : ce que la courroie doit convertir en voyage φ.\n",
    );
    console.log(
      "Courroie 0, écarts depuis le repos. Le mode COMMUN est Δh_S + Δh_E ; le différentiel ne voit que Δh_S − Δh_E.\n",
    );
    console.log(
      "| déplacement | φ₀ | Δh_S | Δh_E | Δ(h_S−h_E) | Δ(h_S+h_E) | C_diff₀ | ΔL |",
    );
    console.log("|---|---|---|---|---|---|---|---|");
    const ref = r.frames[4];
    const d0ref = differential(
      r.belts[0],
      r.positionsAt[4],
      r.frames[4].phi[0],
    )!;
    r.frames.forEach((fr, i) => {
      if (i % 6 !== 0 && i !== r.frames.length - 1) return;
      const d0 = differential(r.belts[0], r.positionsAt[i], fr.phi[0]);
      if (!d0) return;
      const dS = d0.hS - d0ref.hS;
      const dE = d0.hE - d0ref.hE;
      console.log(
        `| ${f(fr.carriage.sub(ref.carriage).length(), 1)} | ${f(
          fr.phi[0],
          3,
        )} | ${f(dS, 3)} | ${f(dE, 3)} | ${f(dS - dE, 3)} | ${f(dS + dE, 3)} | ${f(
          d0.cdiff,
          3,
        )} | ${f(fr.slack[0]! - ref.slack[0]!, 3)} |`,
      );
    });
    expect(r.frames.length).toBe(path.length);
  });

  it.each([
    ["x (le long du rail)", P(-1, 0)],
    ["y (le rail monte)", P(0, -1)],
  ])("grabs the carriage in %s (motor removed), out and back", (axis, dir) => {
    const model = compile_simulation_model(loadFixture());
    const key = model.keyMap.get(CARRIAGE) ?? CARRIAGE;
    const start = model.nodes.positions.get(key)!;
    const STEP = 4;
    const AMPLITUDE = 120;
    const path: Point2[] = [];
    for (let i = 0; i < 5; i++) path.push(start.clone());
    for (let d = STEP; d <= AMPLITUDE; d += STEP)
      path.push(start.add((dir as Point2).mul(d)));
    for (let d = AMPLITUDE - STEP; d >= 0; d -= STEP)
      path.push(start.add((dir as Point2).mul(d)));
    for (let i = 0; i < 10; i++) path.push(start.clone());

    const r = run({ motor: false, path });
    console.log(`\n### Saisie du chariot : −120 px en ${axis}, puis retour\n`);
    table(r.frames, 10);

    const far = r.frames[Math.floor(path.length / 2)];
    const wanted = path[far.frame].distance_to(r.startPos);
    const got = far.carriage.distance_to(r.startPos);
    console.log(
      `\n- au point le plus éloigné (frame ${far.frame}) : chariot à ${f(
        got,
        2,
      )} px du départ pour une consigne de ${f(wanted, 2)} px → suivi ${f(
        (100 * got) / wanted,
        1,
      )} %`,
    );

    console.log("\n#### Hystérésis après retour\n");
    console.log("| clé | θ départ | θ retour | Δ |");
    console.log("|---|---|---|---|");
    let worstGear = 0;
    let worstPhi = 0;
    for (const [k, a0] of r.first) {
      const d = r.last.get(k)! - a0;
      if (k.endsWith(":phi")) worstPhi = Math.max(worstPhi, Math.abs(d));
      else worstGear = Math.max(worstGear, Math.abs(d));
      console.log(
        `| ${k.slice(0, 8)}${k.endsWith(":phi") ? " (φ)" : ""} | ${f(
          a0,
          5,
        )} | ${f(r.last.get(k)!, 5)} | ${f(d, 5)} |`,
      );
    }
    const back = at(r.lastPositions, r.key)!;
    console.log(
      `\n- chariot revenu à (${f(back.x, 3)}, ${f(back.y, 3)}), écart = ${f(
        back.distance_to(r.startPos),
        4,
      )} px`,
    );
    console.log(`- pire dérive d'une poulie : ${f(worstGear, 5)} rad`);
    console.log(`- pire dérive d'un φ : ${f(worstPhi, 4)} px`);
    r.belts.forEach((b) => {
      const L = drawnLength(b, r.lastPositions);
      if (L !== null)
        console.log(
          `- courroie ${b.owner?.slice(0, 8)} : L − L0 = ${f(L - b.length, 4)} px`,
        );
    });
    expect(r.frames.length).toBe(path.length);
  });
});
