"use client";

import Link from "next/link";
import {
  AppBar,
  Box,
  Container,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { RoleStrip } from "@/components/RoleStrip";
import { NotificationBell } from "@/components/NotificationBell";

// Visible application shell wrapping every page. Three pieces:
//   1. Top AppBar with the app title (links back to /).
//   2. RoleStrip — visible "Viewing as: …" indicator + dropdown to switch.
//      Visible on every authenticated-looking page so the no-auth situation
//      is explicit. On the home page (/), the strip shows nothing (the page
//      itself is the picker, so duplicating it in the header is noise).
//   3. NotificationBell — owns its own React Query subscription. Hidden when
//      no role is selected (the bell would have nothing to query).

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        color="primary"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "rgba(255,255,255,0.12)" }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h6"
            component={Link}
            href="/"
            sx={{
              fontWeight: 700,
              color: "inherit",
              textDecoration: "none",
              flexGrow: 0,
            }}
          >
            Scheduling Assistant
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <RoleStrip />

          <NotificationBell>
            {(unreadCount) => (
              <IconButton
                color="inherit"
                aria-label={`${unreadCount} unread notifications`}
                sx={{ ml: 1 }}
              >
                <NotificationsNoneIcon />
              </IconButton>
            )}
          </NotificationBell>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        {children}
      </Container>
    </Box>
  );
}
