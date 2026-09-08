/** How a physical quantity becomes something visible: the rulers that turn a force or a moment into a drawn length, and the palettes that turn a stress or a reaction into a colour. */

export const LOAD_SCALING = {
  /** Value a load is drawn at while being placed, before a drag has given it one (N). */
  PREVIEW_VALUE: 100,
  /** Smallest force value that counts as real (N): floor of the snap ladder, and the seed the negligibility pool judges a recorded force against. */
  MIN_VALUE: 0.1,
  /** The value drawn at `MIN_PX` — the bottom of the ruler, below which every load draws the same length (N). */
  FLOOR_VALUE: 1,
  /** Drawn length (screen px) of a `FLOOR_VALUE` load. Never below the arrow head's own length, or the arrow stops reading as one. */
  MIN_PX: 30,
  /** Drawn length (screen px) each decade of magnitude adds. Sets both how far apart two loads read and how coarse a value drag feels: the `SNAP_MANTISSAS` rungs land about a third of it apart. */
  PX_PER_DECADE: 35,
  /** Mantissas of the round values a load drag snaps to, one set per decade
   * (…, 1, 2, 5, 10, 20, 50, 100, …).
   * Pure powers of ten would leave most of a drag with no rung nearby. */
  SNAP_MANTISSAS: [1, 2, 5],
};

/** The same ruler as `LOAD_SCALING`, on a moment's own range: torques are commonly tenths of
 * N·m, not hundreds of N. Halved, because a moment's footprint is its arc's DIAMETER — it is drawn around a node instead of pointing away from one — so that diameter reads on the very ruler a force arrow's length does. */
export const MOMENT_SCALING = {
  ...LOAD_SCALING,
  /** Value a moment is drawn at while being placed (N·m). */
  PREVIEW_VALUE: 1,
  /** Smallest moment value that counts as real (N·m). */
  MIN_VALUE: 0.01,
  /** The value drawn at `MIN_PX` (N·m). */
  FLOOR_VALUE: 0.01,
  /** Minimal drawn arc radius (screen px). */
  MIN_PX: LOAD_SCALING.MIN_PX / 2,
  /** Arc radius (screen px) each decade of magnitude adds. */
  PX_PER_DECADE: LOAD_SCALING.PX_PER_DECADE / 2,
};

/** The physics-overlay quantities drawn on the canvas: a probed velocity, and the two flavours of reaction force/moment a constraint can carry. */
export type PhysicsOverlayKind =
  | "velocity"
  | "reaction-support"
  | "reaction-internal";

/**
 * Distinguishable from a user-placed load's `COLORS.ACCENT` on purpose — an arrow here is measured, not authored.
 * Reuses entries of `PROBE_ELEMENT_COLORS` rather than inventing new ones, so a physics overlay reads as the same family as a probe chart; the two reaction kinds share the warm half of the palette (support/internal), apart from velocity's cool blue.
 */
export const PHYSICS_OVERLAY_COLOR: Record<PhysicsOverlayKind, string> = {
  velocity: "#2F81F7",
  "reaction-support": "#B8410D",
  "reaction-internal": "#60A45F",
};

/** The three internal-force diagrams of one beam, shown together in the analysis panel
 * (docs/plan-efforts-interieurs.md phase 5bis). */
export type CohesionQuantity = "N" | "T" | "Mf";

/**
 * Its own hue family, deliberately clear of both `PHYSICS_OVERLAY_COLOR` (measured, not drawn-as-a-field — a diagram and a reaction arrow can be on the same beam at once) and `COLORS.DELETION_STROKE` (redundancy symbol): a violet/pink/teal trio reads as "diagram" on sight, never as "error" or "reaction".
 */
export const COHESION_DIAGRAM_COLOR: Record<CohesionQuantity, string> = {
  N: "#8B5CF6",
  T: "#EC4899",
  Mf: "#14B8A6",
};

/**
 * Tension vs compression, for the `normal`/`bending` beam-fill lenses (docs/plan-efforts- interieurs.md phase 9) — unlike the panel's `COHESION_DIAGRAM_COLOR.N` (one curve, sign read off its own axis), a beam's fill has no axis, so the sign has to be the color.
 * The standard mechanics-textbook pairing (warm = pulling, cool = pushing), not `COHESION_DIAGRAM_COLOR`'s violet family: this reads on sight without a legend, which a shade of violet would not.
 */
export const SIGNED_STRESS_COLOR = {
  tension: "#DC2626",
  compression: "#2563EB",
} as const;

/**
 * `SIGNED_STRESS_COLOR`'s two hues as a diverging ramp, for interpolating a beam-fill gradient (`signed_stress_color`, `drawing-functions.ts`): compression at `t = -1`, a neutral "nothing to show" tone at `t = 0` (an unstressed span reads as no color at all, not as a third hue competing with the other two), tension at `t = 1`.
 */
export const SIGNED_STRESS_RAMP: readonly {
  t: number;
  rgb: readonly [number, number, number];
}[] = [
  { t: -1, rgb: [0x25, 0x63, 0xeb] },
  { t: 0, rgb: [0xe5, 0xe7, 0xeb] },
  { t: 1, rgb: [0xdc, 0x26, 0x26] },
] as const;

/**
 * The stress overlay's own scale (canvas, phase 6): a beam's fill, colored along its axis by `|σ|max(s)/Re`.
 * The classic FEM post-processor "rainbow" — blue (low) through cyan, green, yellow, to red — read on sight by anyone who has used a stress plot before.
 * The two ends deliberately match `SIGNED_STRESS_COLOR`'s tension/compression hues, tying the beam-fill lenses to the same palette family without being the same read.
 *
 * `t = 1` is NOT "at the elastic limit" — it is `StressScaleCache.max`, the highest ratio ever RECORDED (`cohesion-field.ts`), so the full spectrum stays legible even when nothing in the mechanism comes close to `Re`.
 * A ratio that actually reaches 1 draws in `STRESS_OVERSTRESS_COLOR` instead, off this scale entirely.
 */
export const STRESS_RAMP: readonly {
  t: number;
  rgb: readonly [number, number, number];
}[] = [
  { t: 0, rgb: [0x25, 0x63, 0xeb] },
  { t: 0.25, rgb: [0x0e, 0xa5, 0xe9] },
  { t: 0.5, rgb: [0x22, 0xc5, 0x5e] },
  { t: 0.75, rgb: [0xea, 0xb3, 0x08] },
  { t: 1, rgb: [0xdc, 0x26, 0x26] },
] as const;

/**
 * A ratio at or past 1 — the section has reached or exceeded `Re` somewhere along it.
 * Deliberately outside `STRESS_RAMP`'s own hue range (its own red is a relative "worst point recorded", not an absolute "over the limit") so the two can never be confused for one another.
 */
export const STRESS_OVERSTRESS_COLOR = "#000000";

/**
 * A beam whose cohesion torsor is not determined by its own equilibrium (`BeamCohesion.determinate`): the solver attributed its share of the load rather than deriving it, so the whole field along that beam is indicative and no point of it means what the ramp would say.
 * Drawn FLAT in this one colour instead of ramped — a gradient would state a variation along the beam that is not known.
 *
 * Outside `STRESS_RAMP`'s blue→red range, and distinct from `STRESS_OVERSTRESS_COLOR`'s black, so the three reads never collapse into one another.
 */
export const STRESS_INDETERMINATE_COLOR = "#ec4899";

/**
 * Floor for the `normal`/`bending` beam-fill lenses' own scale (`StressScaleCache.maxNormal`/ `.maxBending`, `cohesion-field.ts`), as a fraction of that beam's own `Re`.
 * Unlike `utilization`/`shear`, `normal` and `bending` have no admissible-limit ratio of their own to fall back on — their scale is purely "highest ever recorded", so a mechanism where nothing is genuinely loaded (only self-weight, or a numerical residual near the solver's own noise floor) would otherwise stretch that noise across the FULL ramp, same contrast as a real load.
 * Below this fraction of `Re`, the lens reads flat/neutral instead of manufacturing contrast out of nothing to show.
 */
export const NEGLIGIBLE_STRESS_FRACTION = 0.01;

/**
 * The stress overlay's legend: screen-anchored bottom-left, drawn only while at least one beam shows the overlay.
 * A recalibrated ramp reads as arbitrary color without one — the whole reason it exists (revised after seeing the overlay drawn without it).
 */
export const STRESS_LEGEND = {
  MARGIN: 16,
  BAR_WIDTH: 240,
  BAR_HEIGHT: 10,
  GAP: 6,
  FONT: "11px Arial",
} as const;
