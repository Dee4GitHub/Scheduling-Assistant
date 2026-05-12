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

  const mutation = useMutation({
    mutationFn: (input: AssignJobInput) => assignJob(input),
    onSuccess: (job) => {
      setLastAssigned(job);
      setSubmitError(null);
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

  const managers = managersQuery.data ?? [];
  const technicians = techniciansQuery.data ?? [];
  const quotes = unscheduledQuotesQuery.data ?? [];

  // If the active role is a manager, pre-fill the form's manager field with
  // that id. If the active role is a technician (they're viewing the manager
  // page anyway), leave it unset.
  const initialManagerId =
    current.role === "manager" ? current.id : undefined;

  return (
    <Stack spacing={4}>
      <Box>
        <Typography
          variant="overline"
          sx={{
            display: "block",
            color: "secondary.main",
            mb: 1.5,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.22em",
          }}
        >
          Manager · Dispatch
        </Typography>
        <Typography
          component="h1"
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1.5,
            color: "text.primary",
          }}
        >
          New job assignment
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 640 }}>
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
          position: "relative",
          // Left-edge accent stripe in primary teal — work-order document
          // motif. Echoes the home page card and the scheduled-slot rows.
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
          sx={{ mb: 3 }}
        >
          <Typography
            component="span"
            sx={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "secondary.main",
              letterSpacing: "0.12em",
            }}
          >
            WO-{String(initialManagerId ?? 0).padStart(3, "0")}
          </Typography>
          <Typography variant="overline" sx={{ color: "text.primary" }}>
            Work order draft
          </Typography>
        </Stack>
        <AssignJobForm
          managers={managers}
          technicians={technicians}
          quotes={quotes}
          initialManagerId={initialManagerId}
          submitting={mutation.isPending}
          lastError={submitError}
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
