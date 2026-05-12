"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import { RoleStrip } from "@/components/role/RoleStrip";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// Visible application shell wrapping every page. Three pieces:
//   1. AppBar wordmark linking back to the home / role-picker route.
//   2. RoleStrip — "Viewing as: …" indicator + dropdown. Hidden on the
//      home route because the page itself IS the role picker, so showing
//      a persisted role in the header would conflict with the user
//      identifying themselves below.
//   3. NotificationBell — same: hidden on the home route. There is no
//      "current viewer" yet, so a notification count for someone else
//      would be misleading.

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
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
            <Typography
              component="span"
              sx={{
                fontWeight: 600,
                fontSize: { xs: "1rem", sm: "1.1rem" },
                letterSpacing: "-0.005em",
                color: "#FFFFFF",
                lineHeight: 1.2,
              }}
            >
              Scheduling Assistant
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!isHome && <RoleStrip />}

          {!isHome && <NotificationBell />}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        {children}
      </Container>
    </Box>
  );
}
