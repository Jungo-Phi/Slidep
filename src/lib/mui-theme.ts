/**
 * MUI Theme configuration for SlideP
 * Based on UX visual identity guide.
 */

import { createTheme, ThemeOptions } from "@mui/material/styles";

/**
 * Colors from [`_bmad-output/ux-design/visual-identity-guide.md`](_bmad-output/ux-design/visual-identity-guide.md)
 * - Primary (accent): rgb(219, 80, 0) => #DB5000
 * - Secondary (navy): rgb(0, 29, 89) => #001D59
 * - Element fill: rgb(183, 226, 255) => #B7E2FF
 * - Panel background: rgb(255, 237, 198) => #FFEDC6
 */
const palette = {
  primary: {
    main: "#DB5000",
    light: "#FF6A00",
    dark: "#B34300",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#001D59",
    light: "#1A3B8C",
    dark: "#00143D",
    contrastText: "#ffffff",
  },
  success: {
    main: "#2e7d32",
    light: "#4caf50",
    dark: "#1b5e20",
    contrastText: "#ffffff",
  },
  warning: {
    // Keep warning distinct from primary accent
    main: "#ED6C02",
    light: "#FF9800",
    dark: "#E65100",
    contrastText: "#ffffff",
  },
  error: {
    main: "#d32f2f",
    light: "#ef5350",
    dark: "#c62828",
    contrastText: "#ffffff",
  },
  background: {
    default: "#FFF9EB",
    paper: "#FFEDC6",
  },
  text: {
    primary: "#001D59",
    secondary: "rgba(0, 29, 89, 0.7)",
    disabled: "rgba(0, 29, 89, 0.38)",
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
        border: `2px solid ${palette.primary.main}`,
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
        backgroundColor: palette.background.paper,
        color: palette.secondary.main,
        borderBottom: `4px solid ${palette.primary.main}`,
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
    primary: palette.primary,
    secondary: palette.secondary,
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    text: {
      primary: "rgba(255, 255, 255, 0.87)",
      secondary: "rgba(255, 255, 255, 0.6)",
      disabled: "rgba(255, 255, 255, 0.38)",
    },
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
    primary: {
      main: "#000000",
      light: "#333333",
      dark: "#000000",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#ffffff",
      light: "#ffffff",
      dark: "#cccccc",
      contrastText: "#000000",
    },
    success: {
      main: "#00ff00",
      light: "#66ff66",
      dark: "#00cc00",
      contrastText: "#000000",
    },
    warning: {
      main: "#ffff00",
      light: "#ffff66",
      dark: "#cccc00",
      contrastText: "#000000",
    },
    error: {
      main: "#ff0000",
      light: "#ff6666",
      dark: "#cc0000",
      contrastText: "#ffffff",
    },
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: "#000000",
      secondary: "#000000",
      disabled: "#666666",
    },
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
