"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFnsV3";
import { format } from "date-fns";
import { enAU } from "date-fns/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  completeJob,
  getTechnicianSchedule,
  listTechnicians,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { Job } from "@/lib/types";
import { useRole } from "@/components/role/RoleContext";
import { ScheduleGrid } from "@/components/technician/ScheduleGrid";

// Technician schedule page. Composition root:
//   1. Redirects to / if no role context yet (same hydration-safe pattern
//      as the manager dashboard).
//   2. Resolves the technician id from the route param.
//   3. Owns three queries: schedule for (technicianId, date), the
//      technicians list (to display the name), and a completeJob mutation.
//   4. Invalidates schedule + notification caches on successful completion
//      so the row updates and the manager's bell-icon picks up the new
//      notification when they look.
//
// Authorisation: only the technician viewing their own page can click
// "Mark complete". Managers (or other technicians) see the schedule
// read-only. Mirrors the backend's WrongTechnicianError without forcing
// the user to click and hit a 403.

export default function TechnicianSchedulePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { current } = useRole();

  const technicianId = parseRouteId(params.id);
  const [date, setDate] = useState<Date>(() => new Date());
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [lastCompletedJob, setLastCompletedJob] = useState<Job | null>(null);

  // Hydration-safe redirect: wait one tick before deciding what to do with
  // a null role context, since RoleProvider reads localStorage in useEffect.
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

  // Also redirect if the route id is malformed (NaN, zero, negative). The
  // backend would 404 it anyway, but a frontend-side check produces a clean
  // home redirect instead of an Alert deep on the page.
  useEffect(() => {
    if (!hydrated) return;
    if (technicianId === null) {
      router.replace("/");
    }
  }, [hydrated, technicianId, router]);

  const dateStr = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  const scheduleQuery = useQuery({
    queryKey:
      technicianId !== null
        ? queryKeys.schedule(technicianId, dateStr)
        : ["schedule", "invalid"],
    queryFn: ({ signal }) => {
      if (technicianId === null) throw new Error("invalid technician id");
      return getTechnicianSchedule(technicianId, dateStr, signal);
    },
    enabled: technicianId !== null && hydrated,
  });

  // For the page heading: which technician is this? We could thread the
  // name through the role context but that only works when viewing as that
  // technician. Looking it up from the technicians list works regardless of
  // who's viewing and is cached from RoleStrip/RolePicker.
  const techniciansQuery = useQuery({
    queryKey: queryKeys.technicians(),
    queryFn: ({ signal }) => listTechnicians(signal),
    refetchOnWindowFocus: false,
  });

  const completeMutation = useMutation({
    mutationFn: ({ jobId, actorTechnicianId }: { jobId: number; actorTechnicianId: number }) =>
      completeJob(jobId, { technicianId: actorTechnicianId }),
    onSuccess: (job) => {
      setLastCompletedJob(job);
      setSubmitError(null);
      // The completed job's schedule row needs to re-render. Invalidate
      // all schedule keys for this technician so any open dates refetch
      // (the user might have been browsing other days).
      if (technicianId !== null) {
        void queryClient.invalidateQueries({
          queryKey: ["schedule", technicianId],
        });
      }
      // The completion fired a notification to the assigning manager.
      // Invalidate the manager's notification cache so their bell-icon
      // refreshes on next focus.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notificationsForRecipient("manager", job.managerId),
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

  if (!hydrated || current === null || technicianId === null) {
    return null;
  }

  const technician = (techniciansQuery.data ?? []).find((t) => t.id === technicianId);
  const technicianLabel = technician
    ? `${technician.name} (${technician.trade})`
    : `Technician #${technicianId}`;

  // Authorisation: only the technician viewing their own page sees Mark
  // complete buttons. Managers can browse; the buttons disappear for
  // anyone who isn't this technician.
  const canComplete =
    current.role === "technician" && current.id === technicianId;

  const isLoading = scheduleQuery.isLoading;
  const loadError = scheduleQuery.error;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enAU}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {technicianLabel}
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary" }}>
            {canComplete
              ? "Your schedule. Click \"Mark complete\" when a job is done."
              : "Viewing this technician's schedule. Only the assigned technician can mark a job complete."}
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ mb: 2 }}
          >
            <DatePicker
              label="Date"
              value={date}
              onChange={(d) => {
                if (d !== null) setDate(d);
              }}
              slotProps={{ textField: { size: "small", sx: { minWidth: 200 } } }}
            />
          </Stack>

          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : loadError ? (
            <Alert severity="error">
              {loadError instanceof ApiError && loadError.code === "NOT_FOUND"
                ? loadError.message
                : loadError instanceof ApiError && loadError.status === 0
                  ? "Could not reach the backend. Is the API running on port 4000?"
                  : loadError instanceof Error
                    ? loadError.message
                    : "Failed to load schedule."}
            </Alert>
          ) : (
            <ScheduleGrid
              date={date}
              jobs={scheduleQuery.data ?? []}
              canComplete={canComplete}
              completingJobId={
                completeMutation.isPending && completeMutation.variables
                  ? completeMutation.variables.jobId
                  : null
              }
              lastError={submitError}
              onComplete={(jobId) => {
                if (!canComplete) return;
                completeMutation.mutate({
                  jobId,
                  actorTechnicianId: technicianId,
                });
              }}
            />
          )}
        </Paper>

        {lastCompletedJob !== null && (
          <Snackbar
            open
            autoHideDuration={4000}
            onClose={() => setLastCompletedJob(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          >
            <Alert
              severity="success"
              onClose={() => setLastCompletedJob(null)}
              sx={{ width: "100%" }}
            >
              Job #{lastCompletedJob.id} marked complete.
            </Alert>
          </Snackbar>
        )}
      </Stack>
    </LocalizationProvider>
  );
}

function parseRouteId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
