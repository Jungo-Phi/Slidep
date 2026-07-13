/**
 * MUI Theme configuration for SlideP
 * Based on UX visual identity guide.
 */

import { alpha, createTheme, Theme, ThemeOptions } from "@mui/material/styles";

// `toolbar`: the top bar and the timeline pill. `sunken`: the recessed blocks
// that hold a list — a permanent tint, lighter than the transient `action.hover`.
declare module "@mui/material/styles" {
  interface TypeBackground {
    toolbar: string;
    sunken: string;
  }
}

/**
 * Single source of truth for the app's colors. Each theme is one entry in
 * `THEMES`, built from a `ThemeSpec` below.
 *
 * `light` / `dark` colour variants are left out where unused: MUI derives them
 * from `main`. Only the accent's `dark` is pinned, since hovers rely on it.
 */

/** Colors that name the parts of a mechanical drawing, not UI roles. */
export interface CanvasPalette {
  BACKGROUND: string;
  GRID: string;
  GRID_MAJOR: string;
  GRID_LARGER: string;
  GRID_AXIS: string;

  /** Outline of an element — must contrast with BACKGROUND. */
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

  /**
   * The icon SVGs were authored in the classic hues (navy stroke, sky fill…),
   * which are illegible on a dark canvas. When true, `iconDataUris` swaps those
   * hues for the ones above. Left false for the classic theme, whose icons are
   * already correct — recoloring them would only shift them a shade.
   */
  RECOLOR_ICONS: boolean;
}

/**
 * A theme is described by this small spec, from which both palettes are derived:
 * the MUI one used by the panels and the canvas one used by the drawing. Keeping
 * them as two hand-written objects is how they drifted apart in the first place.
 *
 * Every theme rests on one deliberate hue relationship, and two rules learned
 * the hard way:
 *
 *  - the ground is a real colour, never an off-white or an off-black. Slidep's
 *    cream (#FDECC9) is a saturated colour; that is why the classic theme has
 *    body. A #FAFBFC ground is white in disguise, and everything laid on it
 *    looks washed out;
 *  - the fills carry chroma. A pale tint on a pale ground reads as a greyscale
 *    filter, not as a point of view.
 */
interface ThemeSpec {
  /** Grouping shown in the settings menu. */
  family: string;
  label: string;
  mode: "light" | "dark";

  /** Accent. `accentDark` is the pressed/hover state; it must stay legible. */
  accent: string;
  accentDark: string;
  /** Text drawn *on* the accent. */
  onAccent: string;

  /** The ink: element strokes and body text. Must contrast with `paper`. */
  ink: string;

  /** UI surfaces. `paper` doubles as the canvas ground. */
  appBackground: string;
  paper: string;
  toolbar: string;

  /**
   * The two element fills. This pair carries the theme, and each theme opposes
   * them differently — by temperature, by saturation, or by value within a
   * single hue. What matters is that they be *opposed*, not that one be warm.
   */
  fillBody: string;
  fillNode: string;

  selectionStroke: string;
  selectionBox: string;
  selectionAccent: string;

  /**
   * Deletion is a safety signal and stays red by default, in every theme. Only a
   * theme whose whole premise forbids colour should override it.
   */
  deletionStroke?: string;
  deletionBox?: string;

  /** Icons ship in the classic hues; every theme but the classic one repaints. */
  recolorIcons?: boolean;
}

const HEX = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i;

/** Linear blend of two hex colors; `t` = 0 gives `from`, 1 gives `to`. */
const mix = (from: string, to: string, t: number): string => {
  const a = HEX.exec(from);
  const b = HEX.exec(to);
  if (!a || !b) throw new Error(`mix() needs #rrggbb, got ${from} / ${to}`);
  const channel = (i: number) => {
    const v = Math.round(parseInt(a[i], 16) * (1 - t) + parseInt(b[i], 16) * t);
    return v.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${channel(1)}${channel(2)}${channel(3)}`;
};

/**
 * The grid is derived from the canvas ground rather than spelled out per theme,
 * so it can never fall out of step with what it is drawn on.
 *
 * Each line is the ground pushed towards black — or towards white on a dark
 * theme, where darkening would only bury it. Pushing towards black keeps the
 * ground's own hue: pulling it towards the *ink* instead would drag the classic
 * theme's warm grid towards navy and grey it out.
 *
 * The steps are calibrated so the classic theme lands back within a shade of the
 * grid it had when these were hand-written. Dark grounds take larger steps —
 * the same nudge reads as less on a dark surface.
 */
const GRID_RAMP = {
  light: { GRID: 0.03, GRID_MAJOR: 0.08, GRID_LARGER: 0.13, GRID_AXIS: 0.17 },
  dark: { GRID: 0.06, GRID_MAJOR: 0.13, GRID_LARGER: 0.21, GRID_AXIS: 0.28 },
};

/** Deletion reads as a warning in every theme, so it never varies. */
const DELETION_STROKE = "#A4315D";
const DELETION_BOX = "#ED5E71";

const SPECS = {
  classic: {
    family: "Slidep",
    label: "Classique",
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
    selectionAccent: "#FF621E",
    recolorIcons: false,
  },

  // Bleu d'atelier — the technical-drawing tradition, opposed by TEMPERATURE.
  // "Cyanotype" is a true inverted print: a Prussian ground carrying pale lines.
  // "Calque" is the tracing paper it came from — a blue-grey sheet, not a white
  // one. Orange sits opposite blue on the wheel, so the accent rings out.
  "blueprint-light": {
    family: "Bleu d'atelier",
    label: "Calque",
    mode: "light",
    accent: "#E2530B",
    accentDark: "#A83D08",
    onAccent: "#FFFFFF",
    ink: "#0F3563",
    appBackground: "#E6EEF6",
    paper: "#DCE8F3",
    toolbar: "#C7DBEC",
    fillBody: "#A3C9F8",
    fillNode: "#F79782",
    selectionStroke: "#1E6FB8",
    selectionBox: "#6FA9DC",
    selectionAccent: "#FF7A2E",
  },
  // Here the pair is opposed by SATURATION rather than temperature: a saturated
  // azure body against an unsaturated bone node. Both are cool-to-neutral; what
  // separates them is how much colour they carry.
  "blueprint-dark": {
    family: "Bleu d'atelier",
    label: "Cyanotype",
    mode: "dark",
    accent: "#FF7A2E",
    accentDark: "#D95A12",
    onAccent: "#08243F",
    ink: "#EAF4FF",
    appBackground: "#08243F",
    paper: "#0B2E52",
    toolbar: "#114270",
    fillBody: "#2E7FC2",
    fillNode: "#F19489",
    selectionStroke: "#6FC3F5",
    selectionBox: "#4FA8E8",
    selectionAccent: "#FFA766",
  },

  // Terre & Sève — earth and sap. A genuinely tan ground, and a teal body fill
  // that is its near-complement: the drawing is the one cool thing in a warm
  // room. Both fills are saturated; the opposition is HUE, and a strong one.
  "earth-light": {
    family: "Terre & Sève",
    label: "Sépia",
    mode: "light",
    accent: "#B33B1E",
    accentDark: "#8A2C14",
    onAccent: "#FFFFFF",
    ink: "#2B2018",
    appBackground: "#F0E3CC",
    paper: "#E9D9BC",
    toolbar: "#DCC9A6",
    fillBody: "#3E8C80",
    fillNode: "#E8A33D",
    selectionStroke: "#2F6E64",
    selectionBox: "#6FB0A6",
    selectionAccent: "#E0552B",
  },
  "earth-dark": {
    family: "Terre & Sève",
    label: "Forge",
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
    selectionAccent: "#FFA05C",
  },

  // Acier — the strictest of the set. Both fills are the same steel-blue hue,
  // opposed only by VALUE: a pale body, a deep node (and the reverse in the dark
  // theme). Nothing else in the palette is warm, which leaves the orange accent
  // as the single point of heat — every selection, every active control.
  "steel-light": {
    family: "Acier",
    label: "Acier clair",
    mode: "light",
    accent: "#E2600C",
    accentDark: "#A8460A",
    onAccent: "#FFFFFF",
    ink: "#1F2E38",
    appBackground: "#E4EAEE",
    paper: "#D8E1E7",
    toolbar: "#C4D2DA",
    fillBody: "#9DBDD0",
    fillNode: "#3E6F8E",
    selectionStroke: "#4A8AAE",
    selectionBox: "#7FB2CE",
    selectionAccent: "#FF7A2E",
  },
  "steel-dark": {
    family: "Acier",
    label: "Nuit d'atelier",
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
    selectionAccent: "#FFA766",
  },

  // Contraste — the drawing is black ink on white paper, and the parts are told
  // apart by VALUE alone: two greys, a clear step apart. Colour is not absent,
  // it is *rationed* — it appears only where it carries meaning (active,
  // selected, doomed). Nothing is coloured merely to look nice, which is what
  // makes the three signals impossible to miss.
  mono: {
    family: "Contraste",
    label: "Noir & Blanc",
    mode: "light",
    // The only colours in the theme, and they are never decorative: orange means
    // active, blue means selected, red means about to be destroyed. Everything a
    // colour touches here is a signal.
    accent: "#E2530B",
    accentDark: "#A83D08",
    onAccent: "#FFFFFF",
    ink: "#000000",
    appBackground: "#FFFFFF",
    paper: "#FFFFFF",
    toolbar: "#F2F2F2",
    // Two greys, a clear step apart. A pure-white body would exist only by its
    // outline and dissolve into the ground.
    fillBody: "#F8F8F8",
    fillNode: "#D0D0D0",
    selectionStroke: "#1565C0",
    selectionBox: "#5B9BDD",
    selectionAccent: "#FF621E",
  },

  // Synthwave — a night drive. Deep violet ground, and fills that are frankly
  // neon: an electric indigo body against a turquoise node, with magenta as the
  // accent. The one theme where the fills out-saturate the accent.
  synthwave: {
    family: "Fantaisie",
    label: "Synthwave",
    mode: "dark",
    accent: "#FF3D9A",
    accentDark: "#C9106E",
    onAccent: "#1B0B33",
    ink: "#F0E6FF",
    appBackground: "#150826",
    paper: "#1B0B33",
    toolbar: "#2A1152",
    fillBody: "#7B3FE4",
    fillNode: "#00E5C0",
    selectionStroke: "#00D3FF",
    selectionBox: "#5AA9FF",
    selectionAccent: "#FF6FBE",
  },

  // Sorbet — the same idea in broad daylight. A rose ground, mint and lemon
  // fills, raspberry accent. Aubergine ink keeps it from turning saccharine:
  // without a dark line holding the parts, candy colours dissolve into mush.
  sorbet: {
    family: "Fantaisie",
    label: "Sorbet",
    mode: "light",
    accent: "#FF4F81",
    accentDark: "#D62E5F",
    onAccent: "#FFFFFF",
    ink: "#4A2545",
    appBackground: "#FFF2F6",
    paper: "#FDE8EF",
    toolbar: "#F9D2E0",
    fillBody: "#56D2C1",
    fillNode: "#FFC93C",
    selectionStroke: "#A76BE0",
    selectionBox: "#C79BEC",
    selectionAccent: "#FF7AA5",
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

const mui_palette = (s: ThemeSpec) => {
  const dark = s.mode === "dark";
  // The veil darkens a light ground and lightens a dark one: a black veil on a
  // dark background is invisible.
  const veil = dark ? "255, 255, 255" : "0, 0, 0";
  return {
    primary: { main: s.accent, dark: s.accentDark, contrastText: s.onAccent },
    secondary: { main: s.ink, contrastText: s.onAccent },
    ...STATUS[s.mode],
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

const canvas_palette = (s: ThemeSpec): CanvasPalette => {
  const ramp = GRID_RAMP[s.mode];
  // Darken a light ground, lighten a dark one — either way the ground keeps its
  // own hue, which is what a mix towards the ink would have destroyed.
  const towards = s.mode === "dark" ? "#FFFFFF" : "#000000";
  const grid = (step: number) => mix(s.paper, towards, step);

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
    SELECTION_ACCENT: s.selectionAccent,
    DELETION_STROKE: s.deletionStroke ?? DELETION_STROKE,
    DELETION_BOX: s.deletionBox ?? DELETION_BOX,

    RECOLOR_ICONS: s.recolorIcons ?? true,
  };
};

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
  // The page chrome CSS-in-JS cannot otherwise reach. It lives here rather than
  // in index.css so that it follows the theme instead of staying cream-on-light.
  MuiCssBaseline: {
    styleOverrides: ({ palette }: Theme) => ({
      // Tells the browser to tint its own widgets (form controls, scrollbar
      // gutters) to match.
      ":root": { colorScheme: palette.mode },
      body: { backgroundColor: palette.background.default },
      "::selection": { backgroundColor: alpha(palette.primary.main, 0.2) },
      ":focus-visible": {
        outline: `2px solid ${palette.primary.main}`,
        outlineOffset: 2,
      },
      // Tinted with the theme's own ink rather than a fixed grey, which would
      // sit as a foreign smudge on a Prussian-blue or slate ground.
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
  mui: Theme;
  canvas: CanvasPalette;
}

/**
 * The themes offered in the settings menu. Each pairs the MUI theme used by the
 * panels with the palette used to draw the canvas — the two always move
 * together, so a dark ground can never keep a dark element stroke.
 */
export const THEMES = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [
    name,
    {
      family: spec.family,
      label: spec.label,
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

export const DEFAULT_THEME: ThemeName = "classic";
