/**
 * MUI Theme configuration for Slidep
 */

import { alpha, createTheme, Theme, ThemeOptions } from "@mui/material/styles";
import {
  PHYSICS_OVERLAY_KINDS,
  PHYSICS_OVERLAY_SPEC,
  PhysicsOverlayKind,
} from "../constants/physics-display-specs";

declare module "@mui/material/styles" {
  interface TypeBackground {
    toolbar: string;
    sunken: string;
    hoverOpaque: string;
    sunkenOpaque: string;
  }
  /** `palette.divider` is the one for `paper`; these name the other surfaces. */
  interface Palette {
    dividers: { ground: string; paper: string; toolbar: string };
    /** The ruler's own hue, for the interface it puts over the canvas. */
    measure: string;
    /** The overlay readings, in the very colours the canvas draws them (`canvas_palette`) — a figure in the panel and its arrow on the drawing are one reading.
     * Printed as text or laid on `paper` rather than on the drawing's ground, it goes through `readable_on` first. */
    overlay: Record<PhysicsOverlayKind, string>;
    /** `error.main`, thinned to a background tint — for a row or chip flagged as wrong without hiding what's printed on it. */
    errorSoft: string;
  }
  interface PaletteOptions {
    dividers?: { ground: string; paper: string; toolbar: string };
    measure?: string;
    overlay?: Record<PhysicsOverlayKind, string>;
    errorSoft?: string;
  }
}

/** Colors that name the parts of a mechanical drawing, not UI roles. */
export interface CanvasPalette {
  BACKGROUND: string;
  GRID: string;
  GRID_AXIS: string;
  /** Every snap indicator: the grid line a point landed on, the guides holding it. */
  SNAP: string;

  ELEMENT_STROKE: string;
  FILL_BODY: string;
  FILL_NODE: string;
  ACCENT: string;
  ACCENT_DARK: string;

  BADGE_STROKE: string;
  BADGE_FILL: string;
  BADGE_FILL_SELECTED: string;

  SELECTION_STROKE: string;
  SELECTION_BOX: string;
  SELECTION_ACCENT: string;
  /** Everything the ruler draws. A register of its own: a measurement is neither part of the
   * drawing, nor a selection, nor something acting on the mechanism. */
  MEASURE: string;
  DELETION_STROKE: string;
  DELETION_BOX: string;
  /** The measured readings drawn over the mechanism, one colour per quantity — see `PHYSICS_OVERLAY_SPEC` for what fixes them and `overlay_colors` for what this theme made of it. */
  OVERLAY: Record<PhysicsOverlayKind, string>;

  RECOLOR_ICONS: boolean;
}

/** A theme is described by this small spec, from which both the MUI and the canvas palettes are derived. */
export interface ThemeSpec {
  family: string;
  mode: "light" | "dark";

  accent: string;
  accentDark: string;
  onAccent: string;

  ink: string;

  paper: string;
  appBackground: string;
  toolbar: string;

  fillBody: string;
  fillNode: string;

  selectionStroke: string;
  selectionBox: string;

  deletionStroke?: string;
  deletionBox?: string;
  measure?: string;

  gridContrast?: number;
  /** Mixes grid steps toward this colour instead of pure black/white — for a theme whose grid is meant to read as the same ink as everything else drawn on it. */
  gridTint?: string;
  recolorIcons?: boolean;
}

export const THEME_TRANSITION_MS = 300;
export const THEME_TRANSITION_CLASS = "theme-fading";

const HEX = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Linear blend of two hex colors. */
const mix = (from: string, to: string, t: number): string => {
  const a = HEX.exec(from);
  const b = HEX.exec(to);
  if (!a || !b) throw new Error(`mix() needs #rrggbb, got ${from} / ${to}`);
  const k = clamp(t, 0, 1);
  const channel = (i: number) => {
    const v = parseInt(a[i], 16) * (1 - k) + parseInt(b[i], 16) * k;
    return clamp(Math.round(v), 0, 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${channel(1)}${channel(2)}${channel(3)}`;
};

type Hsl = { h: number; s: number; l: number };

const to_hsl = (hex: string): Hsl => {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`to_hsl() needs #rrggbb, got ${hex}`);
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
};

const to_hex = ({ h, s, l }: Hsl): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    )
    .join("")}`;
};

/**
 * The colour a selected accent element takes: the theme's accent, turned up.
 * Same hue — a selection must still read as the same part — but saturated to the hilt and lifted in value, so it separates from the accent it sits next to.
 */
export const selection_accent = (accent: string): string => {
  const { h, s, l } = to_hsl(accent);
  return to_hex({ h, s: Math.min(1, s + 0.1), l: Math.min(0.66, l + 0.15) });
};

/** How much saturation a selected overlay reading gains over its own colour. */
const SELECTION_SATURATION_GAIN = 0.25;

/**
 * The colour a selected overlay reading takes: its own, wound up.
 * Saturation alone, where `selection_accent` lifts the lightness too — a reading's lightness is what holds it at its own contrast off the ground (`PHYSICS_OVERLAY_SPEC`), so moving it would both undo that and walk the reading towards whatever colour sits above it.
 * The halo and the extra width a selected reading already carries are what this leans on for the hues that have no saturation left to give.
 */
export const selection_reading = (color: string): string => {
  const { h, s, l } = to_hsl(color);
  return to_hex({ h, s: Math.min(1, s + SELECTION_SATURATION_GAIN), l });
};

const GRID_RAMP = {
  light: { GRID: 0.15, GRID_AXIS: 0.2 },
  dark: { GRID: 0.22, GRID_AXIS: 0.3 },
};

/** The four steps of the grid, each a notch further off the canvas ground. */
const grid_colors = (s: ThemeSpec) => {
  const ramp = GRID_RAMP[s.mode];
  const contrast = s.gridContrast ?? 1;
  // Darken a light ground, lighten a dark one — either way the ground keeps its own hue, unless a theme opts into a tinted grid via `gridTint`.
  const towards = s.gridTint ?? (s.mode === "dark" ? "#FFFFFF" : "#000000");
  const step = (v: number) => mix(s.appBackground, towards, v * contrast);
  const axis = step(ramp.GRID_AXIS);
  return {
    GRID: step(ramp.GRID),
    GRID_AXIS: axis,
    SNAP: snap_color(s, axis),
  };
};

/** How much of the body hue a snap indicator carries: enough to be another statement than the grid, not enough to shout over the drawing. */
const SNAP_SATURATION = 0.33;

/**
 * How far off the paper a snap indicator stands, as a WCAG contrast ratio.
 *
 * One figure for every theme, and deliberately **not** the grid's own: the grid ramp is far heavier on a dark ground than on a light one, and heavier again on the blueprints, so an indicator pegged to it inherited a weight that swung by three to one across the set.
 * What it has to be is the same discreet mark everywhere.
 */
const SNAP_CONTRAST = 1.5;

/**
 * Where a theme drives its grid harder than the rest, the share of that excess the indicator keeps.
 *
 * A blueprint draws its grid near-white on blue, five times off the paper where the other themes sit under three: held to the common figure there, the indicator was fainter than the lines it has to stand out from.
 * This is a floor, never a ceiling — every theme whose grid is ordinary stays on `SNAP_CONTRAST` exactly.
 */
const SNAP_GRID_SHARE = 0.25;

/**
 * The colour every snap indicator is drawn in: the body's hue, at a weight fixed once for all themes.
 *
 * The grid's family says « here is the paper », and a hold on it has to be a different statement — drawn in a step of the grid ramp it read as one more grid line, and vanished where it fell on an axis.
 * Hence the hue.
 *
 * The weight is set by **contrast**, not by lightness: a tinted colour reads stronger than a grey of the same lightness, and by a different amount on a dark ground than on a light one.
 * So the lightness is solved for, on the side the theme's own grid steps towards.
 */
const snap_color = (s: ThemeSpec, axis: string): string => {
  const { h } = to_hsl(s.fillBody);
  const ground = s.appBackground;
  const target = Math.max(
    SNAP_CONTRAST,
    1 + SNAP_GRID_SHARE * (contrast_ratio(axis, ground) - 1),
  );
  const shade = (l: number) => to_hex({ h, s: SNAP_SATURATION, l });
  // Contrast is monotone in lightness on either side of the ground, so a bisection on one side finds it.
  // Twenty halvings take the interval well under one 8-bit level.
  const lighter = s.mode === "dark";
  let lo = lighter ? to_hsl(ground).l : 0;
  let hi = lighter ? 1 : to_hsl(ground).l;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrast_ratio(shade(mid), ground) < target === lighter) lo = mid;
    else hi = mid;
  }
  return shade((lo + hi) / 2);
};

/**
 * How far a rule steps off the surface it is drawn on.
 * One step, applied to each surface in turn: a divider is only ever read against what it lies on, so a single colour for all of them is right on one surface and wrong on the others.
 */
const DIVIDER_STEP = { light: 0.2, dark: 0.26 };

/** The rules of the interface, one per surface they can be drawn on. */
const divider_colors = (s: ThemeSpec) => {
  const towards = s.mode === "dark" ? "#FFFFFF" : "#000000";
  const step = (surface: string) => mix(surface, towards, DIVIDER_STEP[s.mode]);
  return {
    ground: step(s.appBackground),
    paper: step(s.paper),
    toolbar: step(s.toolbar),
  };
};

/** Deletion reads as a warning in every theme, so it never varies. */
const DELETION_STROKE = "#A4315D";
const DELETION_BOX = "#ED5E71";
/** Green-leaning, to stay clear of the selection cyans a theme may reach for. */
const MEASURE_LIGHT = "#0A8A72";
const MEASURE_DARK = "#2FD3AA";

const measure_color = (s: ThemeSpec) =>
  s.measure ?? (s.mode === "dark" ? MEASURE_DARK : MEASURE_LIGHT);

const SPECS = {
  "slidep-light": {
    family: "Slidep",
    mode: "light",
    accent: "#D7530B",
    accentDark: "#9C4211",
    onAccent: "#FFFFFF",
    ink: "#001D59",
    paper: "#fff3d6",
    appBackground: "#FDECC9",
    toolbar: "#FFBE80",
    fillBody: "#B7E2FF",
    fillNode: "#FFBE80",
    selectionStroke: "#6595D0",
    selectionBox: "#7190E5",
    recolorIcons: false,
  },

  "slidep-dark": {
    family: "Slidep",
    mode: "dark",
    accent: "#FF7A33",
    accentDark: "#C9541C",
    onAccent: "#1E1712",
    ink: "#f2e1bc",
    paper: "#2a2827",
    appBackground: "#212121",
    toolbar: "#303030",
    fillBody: "#5387a1",
    fillNode: "#c98456",
    selectionStroke: "#44b3dc",
    selectionBox: "#3c7fae",
  },

  "classic-light": {
    family: "Classique",
    mode: "light",
    accent: "#E2530B",
    accentDark: "#A83D08",
    onAccent: "#FFFFFF",
    ink: "#000000",
    paper: "#fffbf7",
    appBackground: "#FFFFFF",
    toolbar: "#e2e9f2",
    fillBody: "#c5e2ff",
    fillNode: "#f5b567",
    selectionStroke: "#4ca0ee",
    selectionBox: "#5B9BDD",
    recolorIcons: false,
  },

  "classic-dark": {
    family: "Classique",
    mode: "dark",
    accent: "#FF8A3D",
    accentDark: "#E2600C",
    onAccent: "#10171C",
    ink: "#DDE8EE",
    paper: "#0b0b0b",
    appBackground: "#151515",
    toolbar: "#1F2E38",
    fillBody: "#2E4E63",
    fillNode: "#6292c5",
    selectionStroke: "#6FC3F5",
    selectionBox: "#487bbe",
  },
  "blueprint-light": {
    family: "Blueprint",
    mode: "light",
    accent: "#E2530B",
    accentDark: "#A83D08",
    onAccent: "#FFFFFF",
    ink: "#1D3F73",
    paper: "#f5f0e5",
    appBackground: "#EFE8D4",
    toolbar: "#e4d9c2",
    fillBody: "#c5dfff",
    fillNode: "#e8a774",
    selectionStroke: "#2F7DDA",
    selectionBox: "#4C8FE0",
    gridContrast: 4,
    gridTint: "#1D3F73",
  },
  "blueprint-dark": {
    family: "Blueprint",
    mode: "dark",
    accent: "#e07942",
    accentDark: "#c5612b",
    onAccent: "#38110e",
    ink: "#eeeeee",
    paper: "#1464b5",
    appBackground: "#216eb1",
    toolbar: "#2b5db4",
    fillBody: "#4b76cb",
    fillNode: "#ce9681",
    selectionStroke: "#62e5ff",
    selectionBox: "#5AA9FF",
    gridContrast: 3,
  },
} as const satisfies Record<string, ThemeSpec>;

export type ThemeName = keyof typeof SPECS;

/** Status hues brighten on a dark ground, where the light-theme ones go muddy. */
const STATUS = {
  light: {
    success: { main: "#2E7D32" },
    warning: { main: "#ED6C02" },
    error: { main: "#D32F2F" },
    info: { main: "#0288D1" },
  },
  dark: {
    success: { main: "#66BB6A" },
    warning: { main: "#FFA726" },
    error: { main: "#F44336" },
    info: { main: "#29B6F6" },
  },
};

const luminance = (hex: string): number => {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`luminance() needs #rrggbb, got ${hex}`);
  const [r, g, b] = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio, from 1 (same colour) to 21 (black on white). */
const contrast_ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * How far a tinted figure has to stand off the surface it is printed on, as a WCAG contrast ratio.
 *
 * The 3:1 floor, not body text's 4.5: a figure tinted this way is always read on a row that already names it, so the hue identifies which reading it is rather than carrying any of it.
 * A mid-toned paper — a blueprint's blue — leaves no room for both: everything taken to 4.5 on it lands in the same corner of near-white, and four quantities that read as one colour have lost the very thing the tint is for.
 */
const READING_CONTRAST = 3;

const readable_cache = new Map<string, string>();

/**
 * `color` at whatever lightness clears `ground` by `READING_CONTRAST` — and `color` itself where it already does, which on most papers is every hue but one.
 *
 * What a canvas hue needs before it can be printed as a figure in the interface: `palette.overlay` is solved against the drawing's ground, where a weight's yellow carries, and that same yellow set as text on a pale panel is barely there.
 * The hue is what must survive — it is the whole point of tinting the figure — so the lightness is what gives, solved on the side of `ground` that gains contrast: darker ink on a pale surface, lighter on a dark one.
 *
 * Saturation rises to hold the colourfulness the lightness costs (HSL chroma, `(1 − |2l − 1|)·s`, kept where the gamut allows).
 * Without it a hue driven toward either end washes out on the way, which is how four distinct readings end up as four pastels.
 */
export const readable_on = (color: string, ground: string): string => {
  const key = `${color}|${ground}`;
  const cached = readable_cache.get(key);
  if (cached !== undefined) return cached;
  const solved = solve_readable(color, ground);
  readable_cache.set(key, solved);
  return solved;
};

/** `readable_on` without its memo — see it for what this answers.
 * The memo is what lets a panel call this per figure per frame: the pairs it is ever asked about are a palette against a surface, a handful in all. */
const solve_readable = (color: string, ground: string): string => {
  if (contrast_ratio(color, ground) >= READING_CONTRAST) return color;
  const { h, s, l } = to_hsl(color);
  return solve_contrast(
    h,
    (1 - Math.abs(2 * l - 1)) * s,
    ground,
    READING_CONTRAST,
  );
};

/**
 * `h` at the lightness nearest the ground's own that still stands `target` off it, carrying `chroma` as far as the gamut allows — see `readable_on` for why colourfulness is what is held.
 * Where no lightness reaches the target — a saturated hue on a mid-toned ground — it comes back at that side's extreme, as close as the colour gets.
 */
const solve_contrast = (
  h: number,
  chroma: number,
  ground: string,
  target: number,
): string => {
  const shade = (lightness: number) =>
    to_hex({
      h,
      s: Math.min(1, chroma / Math.max(1e-6, 1 - Math.abs(2 * lightness - 1))),
      l: lightness,
    });
  const groundLightness = to_hsl(ground).l;
  const lighten = groundLightness < 0.5;
  const enough = (l: number) => contrast_ratio(shade(l), ground) >= target;
  // Contrast is monotone in the distance from the ground's own lightness, so a bisection on the gaining side finds the smallest move that clears it.
  // `hi` holds the clearing end throughout when lightening, `lo` when darkening; twenty halvings take the interval well under one 8-bit level.
  let [lo, hi] = lighten ? [groundLightness, 1] : [0, groundLightness];
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (enough(mid) === lighten) hi = mid;
    else lo = mid;
  }
  return shade(lighten ? hi : lo);
};

/** Lab chroma: how much colour a colour carries, 0 for any grey. */
const chroma_of = (hex: string): number => {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`chroma_of() needs #rrggbb, got ${hex}`);
  const [r, g, b] = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return Math.hypot(500 * (x - y), 200 * (y - z));
};

/** The most colour this hue carries at this saturation, over every lightness — the measure `OVERLAY_CHROMA_KEEP` is a share of. */
const peak_chroma = (h: number, saturation: number): number => {
  let peak = 0;
  for (let l = 0.06; l <= 0.94; l += 0.02) {
    const c = Math.min(
      1,
      saturation / Math.max(1e-6, 1 - Math.abs(2 * l - 1)),
    );
    peak = Math.max(peak, chroma_of(to_hex({ h, s: c, l })));
  }
  return peak;
};

/** What a dark ground adds to every reading's asked-for contrast: the same ratio that reads as ink on paper reads as a shadow on a dark canvas, and a reading has to be lit to be a colour at all. */
const OVERLAY_DARK_GAIN = 1.3;

/** The share of its own colour a reading keeps. Under it, the contrast it asked for costs more colour than it is worth — a blueprint's mid-toned blue bleaches a violet to lavender to reach 3.6 — and the ask gives way instead. */
const OVERLAY_CHROMA_KEEP = 0.62;

/** No reading stands off its ground by less than this, however much colour that costs. */
const OVERLAY_MIN_CONTRAST = 2.4;

/**
 * Every overlay reading in the colour this theme draws it: its own hue and colourfulness (`PHYSICS_OVERLAY_SPEC`), at the lightness that stands its own contrast off the ground the mechanism is drawn on.
 * Solved per theme rather than written down once, because a hue that carries on a dark ground is barely there on a pale one — and because what tells the two reactions apart is how far each stands off that ground, which nothing but a solve holds steady from one theme to the next.
 * The asked-for contrast is the starting point, not the answer: a dark ground gains `OVERLAY_DARK_GAIN`, and a ground that would bleach the hue to reach it gives the contrast back, a fifth at a time, down to `OVERLAY_MIN_CONTRAST`.
 */
const overlay_colors = (s: ThemeSpec): Record<PhysicsOverlayKind, string> => {
  const solved = {} as Record<PhysicsOverlayKind, string>;
  const dark = to_hsl(s.appBackground).l < 0.5;
  for (const kind of PHYSICS_OVERLAY_KINDS) {
    const spec = PHYSICS_OVERLAY_SPEC[kind];
    const keep = OVERLAY_CHROMA_KEEP * peak_chroma(spec.hue, spec.saturation);
    let target = spec.contrast + (dark ? OVERLAY_DARK_GAIN : 0);
    let colour = solve_contrast(
      spec.hue,
      spec.saturation,
      s.appBackground,
      target,
    );
    while (chroma_of(colour) < keep && target > OVERLAY_MIN_CONTRAST) {
      target = Math.max(OVERLAY_MIN_CONTRAST, target - 0.2);
      colour = solve_contrast(
        spec.hue,
        spec.saturation,
        s.appBackground,
        target,
      );
    }
    solved[kind] = colour;
  }
  return solved;
};

const STATUS_CONTRAST = 7;
const STATUS_MAX_LIGHTNESS = 0.8;

/** The status colour, lightened until it clears the ground, at constant hue and saturation. */
const lift = (color: string, ground: string): string => {
  const { h, s, l } = to_hsl(color);
  for (let step = l; step < STATUS_MAX_LIGHTNESS; step += 0.01) {
    const candidate = to_hex({ h, s, l: step });
    if (contrast_ratio(candidate, ground) >= STATUS_CONTRAST) return candidate;
  }
  return to_hex({ h, s, l: STATUS_MAX_LIGHTNESS });
};

/**
 * A theme's status colours, readable on its own ground.
 *
 * The light table is taken as-is: its hues are MUI's own, tuned for a near-white background.
 */
const status_palette = (s: ThemeSpec) => {
  const base = STATUS[s.mode];
  if (s.mode === "light") return base;
  return {
    success: { main: lift(base.success.main, s.paper) },
    warning: { main: lift(base.warning.main, s.paper) },
    error: { main: lift(base.error.main, s.paper) },
    info: { main: lift(base.info.main, s.paper) },
  };
};

const mui_palette = (s: ThemeSpec) => {
  const dark = s.mode === "dark";
  // The veil darkens a light ground and lightens a dark one: a black veil on a dark background is invisible.
  const veil = dark ? "255, 255, 255" : "0, 0, 0";
  const towards = dark ? "#FFFFFF" : "#000000";
  const status = status_palette(s);
  return {
    primary: { main: s.accent, dark: s.accentDark, contrastText: s.onAccent },
    secondary: { main: s.ink, contrastText: s.onAccent },
    ...status,
    errorSoft: alpha(status.error.main, 0.12),
    background: {
      default: s.appBackground,
      paper: s.paper,
      toolbar: s.toolbar,
      sunken: `rgba(${veil}, 0.04)`,
      hover: `rgba(${veil}, 0.08)`,
      // Opaque equivalent of `background.default` under `action.hover`'s veil, for surfaces that must hide what's beneath rather than tint it.
      hoverOpaque: mix(s.appBackground, towards, 0.1),
      // Same idea for `background.sunken`, mixed onto `paper` rather than `appBackground` — `sunken` is normally used as a CSS background stacked over a card's own paper, which an SVG fill can't reproduce by referencing the translucent token directly.
      sunkenOpaque: mix(s.paper, towards, 0.04),
    },
    text: {
      primary: s.ink,
      secondary: alpha(s.ink, 0.7),
      disabled: alpha(s.ink, 0.38),
    },
    // The default lands on `paper`, which is what most of the interface is made of.
    divider: divider_colors(s).paper,
    dividers: divider_colors(s),
    measure: measure_color(s),
    overlay: overlay_colors(s),
    action: {
      hover: `rgba(${veil}, 0.1)`,
      hoverOpacity: 0.1,
      selected: `rgba(${veil}, 0.16)`,
      selectedOpacity: 0.16,
    },
  };
};

export const canvas_palette = (s: ThemeSpec): CanvasPalette => {
  const towards = s.mode === "dark" ? "#FFFFFF" : "#000000";
  // The drawing sits on the app's own ground; `paper` belongs to what floats above it — badges included, small labels laid over the drawing.
  const ground = s.appBackground;

  return {
    BACKGROUND: ground,
    ...grid_colors(s),

    ELEMENT_STROKE: s.ink,
    FILL_BODY: s.fillBody,
    FILL_NODE: s.fillNode,
    ACCENT: s.accent,
    ACCENT_DARK: s.accentDark,

    // A step off the ground, like the grid, but deliberately outside `gridContrast`: a theme that wants a loud grid does not want a loud badge outline.
    BADGE_STROKE: mix(ground, towards, 0.4),
    BADGE_FILL: s.paper,
    // Selection pushes the paper further into its own tone — the opposite of `towards`, which pulls against it.
    // A theme whose paper already sits at the extreme gets no lift and leans on the outline alone.
    BADGE_FILL_SELECTED: mix(
      s.paper,
      s.mode === "dark" ? "#000000" : "#FFFFFF",
      0.75,
    ),

    SELECTION_STROKE: s.selectionStroke,
    SELECTION_BOX: s.selectionBox,
    SELECTION_ACCENT: selection_accent(s.accent),
    DELETION_STROKE: s.deletionStroke ?? DELETION_STROKE,
    DELETION_BOX: s.deletionBox ?? DELETION_BOX,
    MEASURE: measure_color(s),
    OVERLAY: overlay_colors(s),

    RECOLOR_ICONS: s.recolorIcons ?? true,
  };
};

/** A spec halfway between two others, from which `canvas_palette` draws a theme fade's intermediate palette. */
export const mix_theme_specs = (
  from: ThemeSpec,
  to: ThemeSpec,
  t: number,
): ThemeSpec => ({
  ...to,
  mode: t < 0.5 ? from.mode : to.mode,

  accent: mix(from.accent, to.accent, t),
  accentDark: mix(from.accentDark, to.accentDark, t),
  onAccent: mix(from.onAccent, to.onAccent, t),
  ink: mix(from.ink, to.ink, t),

  appBackground: mix(from.appBackground, to.appBackground, t),
  paper: mix(from.paper, to.paper, t),
  toolbar: mix(from.toolbar, to.toolbar, t),

  fillBody: mix(from.fillBody, to.fillBody, t),
  fillNode: mix(from.fillNode, to.fillNode, t),

  selectionStroke: mix(from.selectionStroke, to.selectionStroke, t),
  selectionBox: mix(from.selectionBox, to.selectionBox, t),

  deletionStroke: mix(
    from.deletionStroke ?? DELETION_STROKE,
    to.deletionStroke ?? DELETION_STROKE,
    t,
  ),
  deletionBox: mix(
    from.deletionBox ?? DELETION_BOX,
    to.deletionBox ?? DELETION_BOX,
    t,
  ),

  gridContrast: (from.gridContrast ?? 1) * (1 - t) + (to.gridContrast ?? 1) * t,
  gridTint: mix(
    from.gridTint ?? (from.mode === "dark" ? "#FFFFFF" : "#000000"),
    to.gridTint ?? (to.mode === "dark" ? "#FFFFFF" : "#000000"),
    t,
  ),
});

/**
 * Typography configuration
 */
const typography = {
  fontFamily:
    '"Source Sans 3", "Source Sans Pro", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: {
    fontSize: "2.5rem",
    fontWeight: 500,
    lineHeight: 1.2,
  },
  h2: {
    fontSize: "2rem",
    fontWeight: 500,
    lineHeight: 1.3,
  },
  h3: {
    fontSize: "1.75rem",
    fontWeight: 500,
    lineHeight: 1.4,
  },
  h4: {
    fontSize: "1.5rem",
    fontWeight: 500,
    lineHeight: 1.4,
  },
  h5: {
    fontSize: "1.25rem",
    fontWeight: 500,
    lineHeight: 1.5,
  },
  h6: {
    fontSize: "1rem",
    fontWeight: 500,
    lineHeight: 1.5,
  },
  body1: {
    fontSize: "1rem",
    lineHeight: 1.5,
  },
  body2: {
    fontSize: "0.875rem",
    lineHeight: 1.43,
  },
  button: {
    textTransform: "none" as const,
    fontWeight: 500,
  },
};

/**
 * Spacing configuration Base unit: 8px (MUI default)
 */
const spacing = 8;

/**
 * Component overrides for consistent styling
 */
const components: ThemeOptions["components"] = {
  MuiCssBaseline: {
    styleOverrides: ({ palette }: Theme) => ({
      // Tells the browser to tint its own widgets (form controls, scrollbar gutters) to match.
      ":root": { colorScheme: palette.mode },
      [`.${THEME_TRANSITION_CLASS} *, .${THEME_TRANSITION_CLASS} *::before, .${THEME_TRANSITION_CLASS} *::after`]:
        {
          transitionProperty: "background-color, border-color, color, fill",
          transitionDuration: `${THEME_TRANSITION_MS}ms`,
          transitionTimingFunction: "linear",
          // The fade wins over a component's own transition (hover, focus), which would otherwise win on specificity and let the element jump from one theme to the other mid-fade.
          transitionDelay: "0s",
        },
      body: { backgroundColor: palette.background.default },
      "::selection": {
        backgroundColor: alpha(
          palette.primary.main,
          palette.mode === "dark" ? 0.3 : 0.2,
        ),
      },
      ":focus-visible": {
        outline: `2px solid ${palette.primary.main}`,
        outlineOffset: 2,
      },
      "*": {
        scrollbarWidth: "thin",
        scrollbarColor: `${alpha(palette.text.primary, 0.25)} ${palette.background.sunken}`,
      },
      "*::-webkit-scrollbar": { width: 8, height: 8 },
      "*::-webkit-scrollbar-track": { background: palette.background.sunken },
      "*::-webkit-scrollbar-thumb": {
        background: alpha(palette.text.primary, 0.25),
        borderRadius: 4,
      },
      "*::-webkit-scrollbar-thumb:hover": {
        background: alpha(palette.text.primary, 0.45),
      },
    }),
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        padding: "8px 16px",
      },
    },
    defaultProps: {
      disableElevation: true,
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 6,
        backgroundImage: "none",
        border: `2px solid ${theme.palette.primary.main}`,
        boxShadow: "4px 4px 4px rgba(0,0,0,0.2)",
      }),
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 12,
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      arrow: true,
      disableInteractive: true,
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
      },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundImage: "none",
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: `4px solid ${theme.palette.primary.main}`,
      }),
    },
  },
};

const shape = { borderRadius: 6 };

export interface ThemeEntry {
  family: string;
  label: string;
  mode: "light" | "dark";
  mui: Theme;
  canvas: CanvasPalette;
}

/** The themes offered in the settings menu. */
export const THEMES = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [
    name,
    {
      family: spec.family,
      mode: spec.mode,
      mui: createTheme({
        palette: { mode: spec.mode, ...mui_palette(spec) },
        typography,
        spacing,
        components,
        shape,
      }),
      canvas: canvas_palette(spec),
    },
  ]),
) as Record<ThemeName, ThemeEntry>;

export const DEFAULT_THEME: ThemeName = "slidep-light";

/** The raw specs, from which `set_canvas_theme` draws a fade's palettes. */
export const THEME_SPECS: Record<ThemeName, ThemeSpec> = SPECS;

/**
 * What the user picks: a family and a mode.
 * "System" follows the browser's own preference, and keeps following it if it changes.
 */
export type ThemeMode = "light" | "dark" | "system";

/** One theme family and its two sides. */
export interface ThemeFamily {
  name: string;
  light: ThemeName;
  dark: ThemeName;
}

/** The families offered in the menu, in the specs' own declaration order. */
export const THEME_FAMILIES: ThemeFamily[] = (() => {
  const by_name = new Map<string, Partial<ThemeFamily>>();
  for (const [name, spec] of Object.entries(SPECS) as [
    ThemeName,
    ThemeSpec,
  ][]) {
    const family = by_name.get(spec.family) ?? { name: spec.family };
    family[spec.mode] = name;
    by_name.set(spec.family, family);
  }
  return [...by_name.values()].map((family) => {
    // The menu offers light/dark/system to every family: a one-eyed family would show a button there that leads nowhere.
    if (!family.light || !family.dark)
      throw new Error(`La famille « ${family.name} » n'a pas ses deux modes`);
    return family as ThemeFamily;
  });
})();

/** The theme a (family, mode) pair names, `system` read off the browser. */
export const resolve_theme = (
  family: string,
  mode: ThemeMode,
  system_dark: boolean,
): ThemeName => {
  const entry =
    THEME_FAMILIES.find((f) => f.name === family) ??
    THEME_FAMILIES.find((f) => f.name === SPECS[DEFAULT_THEME].family)!;
  const dark = mode === "system" ? system_dark : mode === "dark";
  return dark ? entry.dark : entry.light;
};
