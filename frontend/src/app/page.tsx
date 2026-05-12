import { Box, Paper, Stack, Typography } from "@mui/material";

// Home page (/). Landing point for the demo. Will house the role picker once
// the API client is in place. Server component — no client interactivity here
// yet, so it stays out of the client bundle.

export default function HomePage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          Welcome
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          This is a no-authentication demo of the Scheduling Assistant. Pick the user
          you would like to view the app as.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Role picker will load here once the API client is wired up.
        </Typography>
      </Paper>
    </Stack>
  );
}
