import { Box, Paper, Stack, Typography } from "@mui/material";
import { RolePicker } from "@/components/role/RolePicker";

// Home page (/). Landing point for the demo. Renders the role picker —
// which fetches managers and technicians, lets the user pick one, and
// navigates them to /manager or /technician/[id]. Deliberately ignores
// any persisted role in localStorage so the picker is the first thing a
// reviewer sees on a direct visit; in-app navigation between roles uses
// the same picker via the header RoleStrip.

export default function HomePage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: "auto" }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Welcome
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          This is a no-authentication demo of the Scheduling Assistant. Pick the
          user you would like to view the app as.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
        <RolePicker />
      </Paper>
    </Stack>
  );
}
