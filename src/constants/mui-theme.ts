/**
 * MUI Theme configuration for Slidep
 */

import { alpha, createTheme, Theme, ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypeBackground {
    toolbar: string;
    sunken: string;
  }
}

/** Colors that name the parts of a mechanical drawing, not UI roles. */
export interface CanvasPalette {
  BACKGROUND: string;
  GRID: string;
  GRID_MAJOR: string;
  GRID_LARGER: string;
  GRID_AXIS: string;

  ELEMENT_STROKE: string;
  FILL_BODY: string;
  FILL_NODE: string;
  ACCENT: string;
  ACCENT_DARK: string;

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

  appBackground: string;
  paper: string;
  toolbar: string;

  fillBody: string;
  fillNode: string;

  selectionStroke: string;
  selectionBox: string;

  deletionStroke?: string;
  deletionBox?: string;

  gridContrast?: number;
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
  light: { GRID: 0.03, GRID_MAJOR: 0.08, GRID_LARGER: 0.13, GRID_AXIS: 0.17 },
  dark: { GRID: 0.06, GRID_MAJOR: 0.13, GRID_LARGER: 0.21, GRID_AXIS: 0.28 },
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
    appBackground: "#FFF9EB",
    paper: "#FDECC9",
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
    appBackground: "#1E1712",
    paper: "#261D16",
    toolbar: "#33261C",
    fillBody: "#2E7A6E",
    fillNode: "#E09A3C",
    selectionStroke: "#4FB3A2",
    selectionBox: "#3E8C80",
  },

  "classic-light": {
    family: "Classique",
    mode: "light",
    accent: "#E2530B",
    accentDark: "#A83D08",
    onAccent: "#FFFFFF",
    ink: "#000000",
    appBackground: "#FFFFFF",
    paper: "#FFFFFF",
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
    appBackground: "#10171C",
    paper: "#162027",
    toolbar: "#1F2E38",
    fillBody: "#2E4E63",
    fillNode: "#7FB2CE",
    selectionStroke: "#6FC3F5",
    selectionBox: "#4A8AAE",
  },
  sorbet: {
    family: "Blueprint",
    mode: "light",
    accent: "#D81B60",
    accentDark: "#A0114A",
    onAccent: "#FFFFFF",
    ink: "#381a34",
    appBackground: "#FFF2F6",
    paper: "#FDE8EF",
    toolbar: "#F9D2E0",
    fillBody: "#56D2C1",
    fillNode: "#FFC93C",
    selectionStroke: "#A76BE0",
    selectionBox: "#C79BEC",
  },
  blueprint: {
    family: "Blueprint",
    mode: "dark",
    accent: "#d98da4",
    accentDark: "#b76468",
    onAccent: "#580f1e",
    ink: "#eeeeee",
    appBackground: "#517cb5",
    paper: "#2467bd",
    toolbar: "#4a97e5",
    fillBody: "#398ae5",
    fillNode: "#b0d4e9",
    selectionStroke: "#62e5ff",
    selectionBox: "#5AA9FF",
    gridContrast: 4,
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
  return {
    primary: { main: s.accent, dark: s.accentDark, contrastText: s.onAccent },
    secondary: { main: s.ink, contrastText: s.onAccent },
    ...status_palette(s),
    background: {
      default: s.appBackground,
      paper: s.paper,
      toolbar: s.toolbar,
      sunken: `rgba(${veil}, 0.04)`,
    },
    text: {
      primary: s.ink,
      secondary: alpha(s.ink, 0.7),
      disabled: alpha(s.ink, 0.38),
    },
    divider: `rgba(${veil}, ${dark ? 0.14 : 0.12})`,
    action: {
      hover: `rgba(${veil}, 0.1)`,
      hoverOpacity: 0.1,
      selected: `rgba(${veil}, 0.16)`,
      selectedOpacity: 0.16,
    },
  };
};

export const canvas_palette = (s: ThemeSpec): CanvasPalette => {
  const ramp = GRID_RAMP[s.mode];
  const contrast = s.gridContrast ?? 1;
  // Darken a light ground, lighten a dark one — either way the ground keeps its
  // own hue, which is what a mix towards the ink would have destroyed.
  const towards = s.mode === "dark" ? "#FFFFFF" : "#000000";
  const grid = (step: number) => mix(s.paper, towards, step * contrast);

  return {
    BACKGROUND: s.paper,
    GRID: grid(ramp.GRID),
    GRID_MAJOR: grid(ramp.GRID_MAJOR),
    GRID_LARGER: grid(ramp.GRID_LARGER),
    GRID_AXIS: grid(ramp.GRID_AXIS),

    ELEMENT_STROKE: s.ink,
    FILL_BODY: s.fillBody,
    FILL_NODE: s.fillNode,
    ACCENT: s.accent,
    ACCENT_DARK: s.accentDark,

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
      "::-webkit-scrollbar": { width: 8, height: 8 },
      "::-webkit-scrollbar-track": { background: palette.background.sunken },
      "::-webkit-scrollbar-thumb": {
        background: alpha(palette.text.primary, 0.25),
        borderRadius: 4,
      },
      "::-webkit-scrollbar-thumb:hover": {
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
