"use client";

import { createTheme } from "@mui/material/styles";

// Theme tokens per frontend/CLAUDE.md:
//   - Dark teal primary
//   - Warm off-white background
//   - 10px border-radius across components
//
// Kept lightweight — only override what actually appears in the UI. MUI's
// defaults are good enough for everything else and overriding for the sake
// of overriding makes the diff harder to read for the reviewer.

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0F4C5C",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#E36414",
    },
    background: {
      default: "#FAF7F2",
      paper: "#FFFFFF",
    },
    success: { main: "#2D6A4F" },
    error: { main: "#9B2226" },
    warning: { main: "#BC6C25" },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderColor: "rgba(15, 76, 92, 0.12)",
        },
      },
    },
  },
});
