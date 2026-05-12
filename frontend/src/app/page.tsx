import { Box, Paper, Stack, Typography } from "@mui/material";
import { RolePicker } from "@/components/role/RolePicker";

// Home page (/). Landing point for the demo. Renders the role picker —
// which fetches managers and technicians, lets the user pick one, and
// navigates them to /manager or /technician/[id]. Deliberately ignores
// any persisted role in localStorage so the picker is the first thing a
// reviewer sees on a direct visit; in-app navigation between roles uses
// the same picker via the header RoleStrip.
//
// Editorial framing: large display title with a thin terracotta rule
// underneath (the same accent that anchors the CTAs). A monospace
// document-tag in the corner ("DEMO · NO AUTH") signals the
// no-authentication situation up front, so the reviewer doesn't wonder
// later why the role picker exists at all.

export default function HomePage() {
  return (
    <Stack spacing={5} sx={{ maxWidth: 560, mx: "auto", pt: { xs: 1, sm: 3 } }}>
      <Box>
        <Typography
          variant="overline"
          sx={{
            display: "block",
            color: "secondary.main",
            mb: 1,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.22em",
          }}
        >
          Demo · No Auth
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "2.25rem", sm: "3rem" },
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            mb: 2,
            color: "text.primary",
          }}
        >
          Welcome to the
          <Box
            component="span"
            sx={{
              display: "block",
              color: "primary.main",
              position: "relative",
              "&::after": {
                content: '""',
                display: "block",
                width: 64,
                height: 3,
                bgcolor: "secondary.main",
                mt: 2,
              },
            }}
          >
            Scheduling Assistant.
          </Box>
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: "text.secondary", maxWidth: 480 }}
        >
          Managers assign quotes to technicians on fixed two-hour slots.
          Technicians mark jobs complete from their schedule. There is no
          login: pick the user you want to view the app as.
        </Typography>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 3, sm: 4 },
          borderColor: "divider",
          position: "relative",
          // Left-edge accent stripe — picks up the work-order document
          // motif used on the schedule rows.
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 3,
            bgcolor: "primary.main",
            borderTopLeftRadius: "inherit",
            borderBottomLeftRadius: "inherit",
          },
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="baseline"
          sx={{ mb: 2.5, pb: 1.5, borderBottom: 1, borderColor: "divider" }}
        >
          <Typography
            component="h2"
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: "1.05rem",
              letterSpacing: "-0.005em",
              color: "text.primary",
            }}
          >
            Identify
          </Typography>
          <Typography
            component="span"
            sx={{
              ml: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              fontWeight: 600,
              color: "text.disabled",
              letterSpacing: "0.14em",
            }}
          >
            Step 01
          </Typography>
        </Stack>
        <RolePicker />
      </Paper>
    </Stack>
  );
}
