"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, assignJob, listManagers, listQuotes, listTechnicians } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { AssignJobInput, Job } from "@/lib/types";
import { useRole } from "@/components/role/RoleContext";
import { AssignJobForm } from "@/components/manager/AssignJobForm";

// Manager dashboard. Composition root for the assignment flow:
//   1. Guards against missing role context (redirects to / if user
//      navigated here directly without picking a role first).
//   2. Fetches managers, technicians, and the unscheduled quotes list
//      via React Query. The form is purely presentational — see
//      components/manager/AssignJobForm.tsx.
//   3. Owns the assignJob mutation and on success invalidates the affected
//      caches (quotes, schedule) so the dropdowns and recent-assignments
//      panel refresh without a manual reload.
//   4. Surfaces typed ApiError back to the form via lastError prop so the
//      form can render code-specific inline alerts.

export default function ManagerDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { current } = useRole();

  // Hydration-safe redirect. The RoleContext starts as null on first render
  // (localStorage is read in useEffect inside RoleProvider), so we wait one
  // tick before deciding whether to redirect. Otherwise direct landings on
  // /manager flash the redirect even when localStorage has a manager role.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (current === null) {
      router.replace("/");
    }
  }, [hydrated, current, router]);

  const managersQuery = useQuery({
    queryKey: queryKeys.managers(),
    queryFn: ({ signal }) => listManagers(signal),
  });

  const techniciansQuery = useQuery({
    queryKey: queryKeys.technicians(),
    queryFn: ({ signal }) => listTechnicians(signal),
  });

  const unscheduledQuotesQuery = useQuery({
    queryKey: queryKeys.quotesByStatus("unscheduled"),
    queryFn: ({ signal }) => listQuotes("unscheduled", signal),
  });

  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [lastAssigned, setLastAssigned] = useState<Job | null>(null);
  // Bumped after each successful assignment to clear the form draft.
  // Counter rather than boolean so consecutive successes still fire the
  // reset effect — toggling true→true wouldn't.
  const [resetCounter, setResetCounter] = useState(0);

  const mutation = useMutation({
    mutationFn: (input: AssignJobInput) => assignJob(input),
    onSuccess: (job) => {
      setLastAssigned(job);
      setSubmitError(null);
      setResetCounter((n) => n + 1);
      // Refresh the unscheduled-quotes dropdown immediately so the assigned
      // quote disappears, and refresh the technician's schedule so the new
      // job appears in any open schedule view. The prefix queryKeys.quotes()
      // and queryKeys.schedule(..., undefined) wouldn't match here — we have
      // to invalidate the exact keys we care about, or use a prefix.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.schedule(job.technicianId, undefined),
      });
      // Also invalidate notifications for the technician — the assignment
      // emitted a job_assigned notification that the bell-icon should pick up.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notificationsForRecipient(
          "technician",
          job.technicianId,
        ),
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setSubmitError(err);
      } else {
        setSubmitError(
          new ApiError(
            "INTERNAL_ERROR",
            err instanceof Error ? err.message : String(err),
            0,
          ),
        );
      }
    },
  });

  // Render guards. Three phases:
  //   - pre-hydration: blank (avoids the redirect flash)
  //   - no role: blank (the redirect effect will kick in)
  //   - loading the lists: spinner
  //   - load error: alert with retry
  if (!hydrated || current === null) {
    return null;
  }

  const isLoading =
    managersQuery.isLoading ||
    techniciansQuery.isLoading ||
    unscheduledQuotesQuery.isLoading;

  const loadError =
    managersQuery.error ??
    techniciansQuery.error ??
    unscheduledQuotesQuery.error;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Alert severity="error">
        {loadError instanceof ApiError && loadError.status === 0
          ? "Could not reach the backend. Is the API running on port 4000?"
          : loadError.message}
      </Alert>
    );
  }

  const technicians = techniciansQuery.data ?? [];
  const quotes = unscheduledQuotesQuery.data ?? [];

  // managerId for the assignment is implied by the viewing role. A technician
  // viewing the manager page falls back to the first available manager so the
  // demo's no-auth flow still works for them.
  const managers = managersQuery.data ?? [];
  const managerId =
    current.role === "manager" ? current.id : (managers[0]?.id ?? 0);

  return (
    <Stack spacing={4}>
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
          New job assignment
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Allocate an unscheduled quote to a technician on a fixed two-hour
          slot. Conflicts on the same technician, date and slot are rejected
          at the database level.
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
            fontWeight: 700,
            fontSize: "1.25rem",
            letterSpacing: "-0.01em",
            color: "text.primary",
            mb: 3,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          Work order draft
        </Typography>
        <AssignJobForm
          technicians={technicians}
          quotes={quotes}
          managerId={managerId}
          submitting={mutation.isPending}
          lastError={submitError}
          resetCounter={resetCounter}
          onSubmit={(input) => mutation.mutate(input)}
        />
      </Paper>

      {lastAssigned !== null && (
        <Snackbar
          open
          autoHideDuration={4000}
          onClose={() => setLastAssigned(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            severity="success"
            onClose={() => setLastAssigned(null)}
            sx={{ width: "100%" }}
          >
            Job #{lastAssigned.id} assigned for {lastAssigned.scheduledDate}{" "}
            {lastAssigned.slot}.
          </Alert>
        </Snackbar>
      )}
    </Stack>
  );
}
