"use client";

import { createTheme } from "@mui/material/styles";

// Theme tokens per frontend/CLAUDE.md:
//   - Dark teal primary
//   - Warm off-white background
//   - 10px border-radius across components
//
// Aesthetic direction: industrial-editorial. This is an HVAC trades dispatch
// tool — work orders, time slots, technician schedules. The visual language
// borrows from technical documents and job tickets: tabular UPPERCASE labels
// with letter-spacing, monospaced numerals for time slots and IDs, left-edge
// colour stripes for status, restrained palette anchored by dark teal with
// a sharp warm accent (terracotta) on primary CTAs.
//
// Typography: IBM Plex Sans (display + body, industrial gravitas), IBM Plex
// Mono (time slots, codes, IDs). Both loaded via next/font in layout.tsx and
// exposed to MUI via the CSS variables --font-display, --font-mono.

const FONT_DISPLAY = "var(--font-display), -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "var(--font-mono), ui-monospace, SFMono-Regular, monospace";

// Custom palette tokens accessible via theme.palette.<name>. Augmented via
// module declaration below so TS knows about them.
const PRIMARY_MAIN = "#0F4C5C";
const PRIMARY_DARK = "#0A3744";
const PRIMARY_LIGHT = "#5E8C99";
const ACCENT_MAIN = "#C2410C"; // warm terracotta, slightly more grounded than the original #E36414
const ACCENT_DARK = "#9A2D08";
const SUCCESS_MAIN = "#15803D";
const SUCCESS_LIGHT = "#86EFAC";
const WARNING_MAIN = "#A16207";
const ERROR_MAIN = "#991B1B";
const PAPER_WARM = "#FDFBF6";
const BG_WARM = "#F5F1E9";
const INK_PRIMARY = "#1A1A1A";
const INK_SECONDARY = "#525252";
const INK_MUTED = "#737373";
const RULE_HAIRLINE = "rgba(15, 76, 92, 0.12)";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: PRIMARY_MAIN,
      dark: PRIMARY_DARK,
      light: PRIMARY_LIGHT,
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: ACCENT_MAIN,
      dark: ACCENT_DARK,
      contrastText: "#FFFFFF",
    },
    background: {
      default: BG_WARM,
      paper: PAPER_WARM,
    },
    success: { main: SUCCESS_MAIN, light: SUCCESS_LIGHT },
    error: { main: ERROR_MAIN },
    warning: { main: WARNING_MAIN },
    text: {
      primary: INK_PRIMARY,
      secondary: INK_SECONDARY,
      disabled: INK_MUTED,
    },
    divider: RULE_HAIRLINE,
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: FONT_DISPLAY,
    // Editorial display hierarchy: H1 is hero-size, H4 is page-title, H6 is
    // section-header. Letter-spacing tightens as size grows for the
    // sharper-than-default editorial feel.
    h1: { fontWeight: 600, letterSpacing: "-0.025em" },
    h2: { fontWeight: 600, letterSpacing: "-0.02em" },
    h3: { fontWeight: 600, letterSpacing: "-0.015em" },
    h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "2rem", lineHeight: 1.15 },
    h5: { fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 },
    h6: { fontWeight: 600, letterSpacing: "-0.005em" },
    subtitle1: { fontWeight: 600, letterSpacing: "0" },
    subtitle2: { fontWeight: 600, letterSpacing: "0.01em" },
    body1: { lineHeight: 1.55 },
    body2: { lineHeight: 1.5 },
    // Overline is the editorial workhorse — UPPERCASE field labels, section
    // markers, status badges. Tracked widely so it reads as data not body.
    overline: {
      fontWeight: 700,
      letterSpacing: "0.12em",
      fontSize: "0.7rem",
      lineHeight: 1.5,
    },
    caption: {
      fontWeight: 500,
      letterSpacing: "0.01em",
      fontSize: "0.75rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: "0.005em",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Subtle radial atmosphere on the warm background — gives the
          // page depth without competing with content. Two cool teal
          // washes fade out from the top corners. Renders as paper that
          // caught light from a window, not a flat fill.
          backgroundImage: `
            radial-gradient(ellipse 800px 600px at 15% -10%, rgba(15, 76, 92, 0.04), transparent 60%),
            radial-gradient(ellipse 1000px 700px at 85% -5%, rgba(194, 65, 12, 0.025), transparent 55%)
          `,
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 20,
          paddingRight: 20,
          transition: "transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease",
        },
        sizeSmall: {
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 14,
          paddingRight: 14,
        },
        sizeLarge: {
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 22,
          paddingRight: 22,
          fontSize: "0.875rem",
        },
        containedPrimary: {
          backgroundColor: ACCENT_MAIN,
          boxShadow: `0 1px 0 ${ACCENT_DARK} inset, 0 1px 2px rgba(154, 45, 8, 0.2)`,
          "&:hover": {
            backgroundColor: ACCENT_DARK,
            boxShadow: `0 1px 0 ${ACCENT_DARK} inset, 0 2px 6px rgba(154, 45, 8, 0.28)`,
          },
          "&:active": {
            transform: "translateY(1px)",
            boxShadow: `0 1px 0 ${ACCENT_DARK} inset`,
          },
          "&.Mui-disabled": {
            backgroundColor: "#D8D2C5",
            color: "#A19A88",
          },
        },
        outlinedInherit: {
          borderColor: RULE_HAIRLINE,
          color: INK_SECONDARY,
          "&:hover": {
            borderColor: PRIMARY_MAIN,
            backgroundColor: "rgba(15, 76, 92, 0.04)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: {
          borderColor: RULE_HAIRLINE,
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderColor: RULE_HAIRLINE,
          backgroundImage: "none",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: PAPER_WARM,
          fontSize: "0.9rem",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: RULE_HAIRLINE,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: PRIMARY_LIGHT,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1.5,
          },
        },
        input: {
          fontSize: "0.9rem",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          minHeight: 40,
          fontSize: "0.9rem",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          letterSpacing: "0.02em",
          height: 22,
          fontSize: "0.7rem",
        },
        sizeSmall: {
          height: 20,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: `linear-gradient(180deg, ${PRIMARY_MAIN} 0%, ${PRIMARY_DARK} 100%)`,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: INK_PRIMARY,
          fontSize: "0.75rem",
          fontWeight: 500,
          padding: "6px 10px",
        },
      },
    },
  },
});

// Export the mono font stack so components can reach for it without
// duplicating the CSS variable name. Used for slot times, IDs, references.
export const FONT_MONO_STACK = FONT_MONO;
