"use client";

import Link from "next/link";
import { AppBar, Box, Container, Stack, Toolbar, Typography } from "@mui/material";
import { RoleStrip } from "@/components/role/RoleStrip";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// Visible application shell wrapping every page. Three pieces:
//   1. AppBar with a two-line wordmark: "SCHEDULING ASSISTANT" set as a
//      tracked uppercase title, "TRADES OPS" as a thin caption beneath. The
//      editorial pairing reads as a publication masthead rather than a
//      product logo.
//   2. RoleStrip — visible "Viewing as: …" indicator + dropdown to switch.
//   3. NotificationBell — owns its own React Query subscription.
//
// A hairline accent rule sits below the toolbar to anchor the AppBar
// against the page body; without it the deep teal floats and the
// transition into the warm paper background lacks definition.

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        color="primary"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "rgba(255,255,255,0.08)",
          // Sharp 1px accent rule in terracotta along the very bottom — a
          // single editorial flourish that ties the header to the primary
          // CTA colour without shouting.
          boxShadow: "inset 0 -2px 0 0 rgba(194, 65, 12, 0.45)",
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: { xs: 64, sm: 72 } }}>
          <Box
            component={Link}
            href="/"
            sx={{
              color: "inherit",
              textDecoration: "none",
              flexGrow: 0,
              display: "block",
              transition: "opacity 120ms ease",
              "&:hover": { opacity: 0.85 },
            }}
          >
            <Stack spacing={0}>
              <Typography
                component="span"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "0.95rem", sm: "1.05rem" },
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#FFFFFF",
                  lineHeight: 1.2,
                }}
              >
                Scheduling Assistant
              </Typography>
              <Typography
                component="span"
                sx={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.2,
                }}
              >
                Trades Ops · v0.1
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <RoleStrip />

          <NotificationBell />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        {children}
      </Container>
    </Box>
  );
}
