/**
 * MUI Theme configuration for SlideP
 * Based on UX visual identity guide.
 */

import { createTheme, ThemeOptions } from "@mui/material/styles";

const palette = {
  primary: {
    main: "oklch(0.85 0.11 64)",
  },
  secondary: { main: "oklch(0.9 0.06 230)" },

  classic: {
    background: "oklch(0.95 0.05 86)",
    primary_fill: "oklch(0.85 0.11 64)",
    primary_border: "oklch(0.61 0.18 42)",
    secondary_fill: "oklch(0.9 0.06 230)",
    secondary_border: "oklch(0.28 0.1 260)",
  },
  light: {
    background: "oklch(1 0 0)",
    primary_fill: "oklch(0.6 0 0)",
    primary_border: "oklch(0.35 0 0)",
    secondary_fill: "oklch(0.85 0 0)",
    secondary_border: "oklch(0 0 0)",
  },
  dark: {
    background: "oklch(0.25 0 0)",
    primary_fill: "oklch(0.61 0.18 42)",
    primary_border: "oklch(0.85 0.11 64)",
    secondary_border: "oklch(0.9 0.06 230)",
    secondary_fill: "oklch(0.28 0.1 260)",
  },
  high_contrast: {
    background: "oklch(1 0 0)",
    primary_fill: "oklch(0.95 0.11 64)",
    primary_border: "oklch(0.41 0.18 42)",
    secondary_fill: "oklch(0.96 0.06 230)",
    secondary_border: "oklch(0 0 0)",
  },
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
      root: {
        borderRadius: 6,
        backgroundImage: "none",
        border: `2px solid ${palette.classic.primary_border}`,
        boxShadow: "4px 4px 4px rgba(0,0,0,0.2)",
      },
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
      root: {
        backgroundImage: "none",
        backgroundColor: palette.classic.background,
        color: palette.classic.secondary_border,
        borderBottom: `4px solid ${palette.classic.primary_border}`,
      },
    },
  },
};

/**
 * Light theme (default)
 */
export const lightTheme = createTheme({
  palette: {
    mode: "light",
    ...palette,
  },
  typography,
  spacing,
  components,
  shape: {
    borderRadius: 6,
  },
});

/**
 * Dark theme
 */
export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    ...palette,
  },
  typography,
  spacing,
  components,
  shape: {
    borderRadius: 6,
  },
});

/**
 * High contrast theme for accessibility
 */
export const highContrastTheme = createTheme({
  palette: {
    mode: "light",
    ...palette,
  },
  typography,
  spacing,
  components: {
    ...components,
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundImage: "none",
          border: `4px solid #000000`,
          boxShadow: "4px 4px 4px rgba(0,0,0,0.5)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#ffffff",
          color: "#000000",
          borderBottom: `4px solid #000000`,
        },
      },
    },
  },
  shape: {
    borderRadius: 6,
  },
});

/**
 * Default theme export
 */
export const theme = lightTheme;
