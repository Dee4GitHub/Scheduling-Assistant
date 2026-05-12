import { Box, Paper, Stack, Typography } from "@mui/material";
import { RolePicker } from "@/components/role/RolePicker";

// Home page (/). Landing point for the demo. Renders the role picker —
// fetches managers and technicians, lets the user pick one, and navigates
// to /manager or /technician/[id]. The persisted role from localStorage
// is deliberately ignored on this route so the picker is the first thing
// a reviewer sees on a direct visit; in-app navigation between roles
// uses the same picker via the header RoleStrip.

export default function HomePage() {
  return (
    <Stack spacing={4} sx={{ maxWidth: 560, mx: "auto", pt: { xs: 1, sm: 3 } }}>
      <Box>
        <Typography
          component="h1"
          sx={{
            fontWeight: 600,
            fontSize: { xs: "1.75rem", sm: "2rem" },
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            mb: 1.5,
            color: "text.primary",
          }}
        >
          Welcome to the Scheduling Assistant
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: "text.secondary" }}
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
        }}
      >
        <Typography
          component="h2"
          sx={{
            fontWeight: 600,
            fontSize: "1.05rem",
            letterSpacing: "-0.005em",
            color: "text.primary",
            mb: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          Identify
        </Typography>
        <RolePicker />
      </Paper>
    </Stack>
  );
}
