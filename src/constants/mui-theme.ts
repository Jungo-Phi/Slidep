/**
 * MUI Theme configuration for Slidep
 */

import { alpha, createTheme, Theme, ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypeBackground {
    toolbar: string;
    sunken: string;
    hoverOpaque: string;
  }
  /** `palette.divider` is the one for `paper`; these name the other surfaces. */
  interface Palette {
    dividers: { ground: string; paper: string; toolbar: string };
  }
  interface PaletteOptions {
    dividers?: { ground: string; paper: string; toolbar: string };
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
  DELETION_STROKE: string;
  DELETION_BOX: string;

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
const selection_accent = (accent: string): string => {
  const { h, s, l } = to_hsl(accent);
  return to_hex({ h, s: Math.min(1, s + 0.1), l: Math.min(0.66, l + 0.15) });
};

const GRID_RAMP = {
  light: { GRID: 0.15, GRID_AXIS: 0.2 },
  dark: { GRID: 0.22, GRID_AXIS: 0.3 },
};

/** The four steps of the grid, each a notch further off the canvas ground. */
const grid_colors = (s: ThemeSpec) => {
  const ramp = GRID_RAMP[s.mode];
  const contrast = s.gridContrast ?? 1;
  // Darken a light ground, lighten a dark one — either way the ground keeps its
  // own hue, unless a theme opts into a tinted grid via `gridTint`.
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
 * One figure for every theme, and deliberately **not** the grid's own: the grid ramp is far heavier on a dark ground than on a light one, and heavier again on the blueprints, so an indicator pegged to it inherited a weight that swung by three to one across the set. What it has to be is the same discreet mark everywhere.
 */
const SNAP_CONTRAST = 1.5;

/**
 * Where a theme drives its grid harder than the rest, the share of that excess the indicator keeps.
 *
 * A blueprint draws its grid near-white on blue, five times off the paper where the other themes sit under three: held to the common figure there, the indicator was fainter than the lines it has to stand out from. This is a floor, never a ceiling — every theme whose grid is ordinary stays on `SNAP_CONTRAST` exactly.
 */
const SNAP_GRID_SHARE = 0.25;

/**
 * The colour every snap indicator is drawn in: the body's hue, at a weight fixed once for all themes.
 *
 * The grid's family says « here is the paper », and a hold on it has to be a different statement — drawn in a step of the grid ramp it read as one more grid line, and vanished where it fell on an axis. Hence the hue.
 *
 * The weight is set by **contrast**, not by lightness: a tinted colour reads stronger than a grey of the same lightness, and by a different amount on a dark ground than on a light one. So the lightness is solved for, on the side the theme's own grid steps towards.
 */
const snap_color = (s: ThemeSpec, axis: string): string => {
  const { h } = to_hsl(s.fillBody);
  const ground = s.appBackground;
  const target = Math.max(
    SNAP_CONTRAST,
    1 + SNAP_GRID_SHARE * (contrast_ratio(axis, ground) - 1),
  );
  const shade = (l: number) => to_hex({ h, s: SNAP_SATURATION, l });
  // Contrast is monotone in lightness on either side of the ground, so a bisection on one side finds it. Twenty halvings take the interval well under one 8-bit level.
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
 * How far a rule steps off the surface it is drawn on. One step, applied to each
 * surface in turn: a divider is only ever read against what it lies on, so a
 * single colour for all of them is right on one surface and wrong on the others.
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
    ink: "#F2E6D4",
    paper: "#2d201a",
    appBackground: "#3e2d26",
    toolbar: "#33261C",
    fillBody: "#2474ad",
    fillNode: "#E09A3C",
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

const STATUS_CONTRAST = 7;
const STATUS_MAX_LIGHTNESS = 0.8;

/** La couleur de statut éclaircie jusqu'à se détacher du fond, à teinte et saturation constantes. */
const lift = (color: string, ground: string): string => {
  const { h, s, l } = to_hsl(color);
  for (let step = l; step < STATUS_MAX_LIGHTNESS; step += 0.01) {
    const candidate = to_hex({ h, s, l: step });
    if (contrast_ratio(candidate, ground) >= STATUS_CONTRAST) return candidate;
  }
  return to_hex({ h, s, l: STATUS_MAX_LIGHTNESS });
};

/**
 * Les statuts d'un thème, lisibles sur son papier.
 *
 * Le tableau clair est pris tel quel : ses teintes sont celles de MUI, réglées pour un fond quasi blanc.
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
  // The veil darkens a light ground and lightens a dark one: a black veil on a
  // dark background is invisible.
  const veil = dark ? "255, 255, 255" : "0, 0, 0";
  const towards = dark ? "#FFFFFF" : "#000000";
  return {
    primary: { main: s.accent, dark: s.accentDark, contrastText: s.onAccent },
    secondary: { main: s.ink, contrastText: s.onAccent },
    ...status_palette(s),
    background: {
      default: s.appBackground,
      paper: s.paper,
      toolbar: s.toolbar,
      sunken: `rgba(${veil}, 0.04)`,
      hover: `rgba(${veil}, 0.08)`,
      // Opaque equivalent of `background.default` under `action.hover`'s veil,
      // for surfaces that must hide what's beneath rather than tint it.
      hoverOpaque: mix(s.appBackground, towards, 0.1),
    },
    text: {
      primary: s.ink,
      secondary: alpha(s.ink, 0.7),
      disabled: alpha(s.ink, 0.38),
    },
    // The default lands on `paper`, which is what most of the interface is made of.
    divider: divider_colors(s).paper,
    dividers: divider_colors(s),
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
  // The drawing sits on the app's own ground; `paper` belongs to what floats
  // above it — badges included, small labels laid over the drawing.
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
    // Selection pushes the paper further into its own tone — the opposite of `towards`, which pulls against it. A theme whose paper already sits at the extreme gets no lift and leans on the outline alone.
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

    RECOLOR_ICONS: s.recolorIcons ?? true,
  };
};

/** Une spec à mi-chemin entre deux autres, dont `canvas_palette` tire la palette intermédiaire d'un fondu de thème. */
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
 * Spacing configuration
 * Base unit: 8px (MUI default)
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
          // Le fondu prime sur la transition propre du composant (survol, focus),
          // qui autrement gagnerait sur la spécificité et laisserait l'élément
          // sauter d'un thème à l'autre au milieu du fondu.
          transitionDelay: "0s",
        },
      body: { backgroundColor: palette.background.default },
      "::selection": { backgroundColor: alpha(palette.primary.main, 0.2) },
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

/** Les specs brutes, dont `set_canvas_theme` tire les palettes d'un fondu. */
export const THEME_SPECS: Record<ThemeName, ThemeSpec> = SPECS;

/**
 * Ce que l'utilisateur choisit : une famille et un mode. « Système » suit la
 * préférence du navigateur, et la suit encore si elle change.
 */
export type ThemeMode = "light" | "dark" | "system";

/** Une famille de thèmes et ses deux versants. */
export interface ThemeFamily {
  name: string;
  light: ThemeName;
  dark: ThemeName;
}

/** Les familles offertes dans le menu, dans l'ordre de déclaration des specs. */
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
    // Le menu propose clair/sombre/système à toute famille : une famille
    // borgne y afficherait un bouton qui ne mène nulle part.
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
