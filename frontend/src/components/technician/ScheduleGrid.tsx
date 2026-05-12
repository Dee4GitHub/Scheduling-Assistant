"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { format, parseISO } from "date-fns";
import type { ScheduledJob, Slot } from "@/lib/types";
import { SLOTS } from "@/lib/types";
import { ApiError } from "@/lib/api";

// Pure presentation grid for a technician's schedule on a given date.
// Renders all 4 fixed slots; each is either "assigned" (with job details
// and an optional Mark complete button) or "available" (placeholder).
// CLAUDE.md compliance: no fetching, no API calls — owns nothing beyond
// the props it's given.
//
// Date display uses dd/MM/yyyy per the AU convention; the underlying job
// dates remain ISO over the wire.

interface ScheduleGridProps {
  readonly date: Date;
  readonly jobs: readonly ScheduledJob[];
  readonly canComplete: boolean;
  readonly completingJobId: number | null;
  readonly lastError: ApiError | null;
  onComplete(jobId: number): void;
}

export function ScheduleGrid({
  date,
  jobs,
  canComplete,
  completingJobId,
  lastError,
  onComplete,
}: ScheduleGridProps) {
  // Build a lookup so SLOTS.map() can pluck the matching job O(1) — the
  // alternative is 4 .find() calls in render, which is fine at this scale
  // but the map reads more clearly when the row count grows.
  const jobBySlot = new Map<Slot, ScheduledJob>();
  for (const job of jobs) {
    jobBySlot.set(job.slot, job);
  }

  const errorAlert = lastError !== null ? <CompleteErrorAlert err={lastError} /> : null;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          Schedule for
        </Typography>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
          {format(date, "EEEE, d MMMM yyyy")}
        </Typography>
      </Box>

      {errorAlert}

      <Stack spacing={1.5}>
        {SLOTS.map((slot) => {
          const job = jobBySlot.get(slot);
          if (job === undefined) {
            return <AvailableSlotRow key={slot} slot={slot} />;
          }
          return (
            <AssignedSlotRow
              key={slot}
              slot={slot}
              job={job}
              canComplete={canComplete}
              completing={completingJobId === job.id}
              onComplete={onComplete}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}

function AvailableSlotRow({ slot }: { readonly slot: Slot }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: "background.default" }}>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <SlotLabel slot={slot} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Available
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AssignedSlotRow({
  slot,
  job,
  canComplete,
  completing,
  onComplete,
}: {
  readonly slot: Slot;
  readonly job: ScheduledJob;
  readonly canComplete: boolean;
  readonly completing: boolean;
  onComplete(jobId: number): void;
}) {
  const isCompleted = job.status === "completed";

  return (
    <Card
      variant="outlined"
      sx={{
        // Subtle visual lift for assigned vs available rows.
        bgcolor: "background.paper",
        borderColor: isCompleted ? "success.light" : "primary.light",
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={{ xs: 1, sm: 2 }}
        >
          <SlotLabel slot={slot} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {job.quoteReference}
              </Typography>
              {isCompleted ? (
                <Chip
                  size="small"
                  color="success"
                  label="Completed"
                  icon={<CheckCircleOutlineIcon />}
                />
              ) : null}
            </Stack>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {job.quoteSummary}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Assigned by {job.managerName}
              {isCompleted && job.completedAt
                ? ` - Completed ${formatDateTime(job.completedAt)}`
                : ""}
            </Typography>
          </Box>

          {!isCompleted && canComplete ? (
            <Button
              variant="contained"
              size="small"
              onClick={() => onComplete(job.id)}
              disabled={completing}
              startIcon={
                completing ? <CircularProgress size={14} color="inherit" /> : null
              }
              sx={{ alignSelf: { xs: "flex-end", sm: "center" }, flexShrink: 0 }}
            >
              {completing ? "Completing..." : "Mark complete"}
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SlotLabel({ slot }: { readonly slot: Slot }) {
  return (
    <Typography
      variant="body2"
      sx={{
        fontFamily: "monospace",
        fontWeight: 600,
        minWidth: 120,
        flexShrink: 0,
        color: "text.primary",
      }}
    >
      {formatSlot(slot)}
    </Typography>
  );
}

function formatSlot(slot: Slot): string {
  const [start, end] = slot.split("-") as [string, string];
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":") as [string, string];
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

function formatDateTime(iso: string): string {
  // Server returns "YYYY-MM-DD HH:mm:ss" (mysql2 with dateStrings:true).
  // Convert space to T so date-fns parseISO can read it. AU display.
  try {
    const normalised = iso.includes("T") ? iso : iso.replace(" ", "T");
    return format(parseISO(normalised), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
}

function CompleteErrorAlert({ err }: { readonly err: ApiError }) {
  const { friendlyMessage, severity } = describeError(err);
  return <Alert severity={severity}>{friendlyMessage}</Alert>;
}

function describeError(err: ApiError): {
  friendlyMessage: string;
  severity: "error" | "warning";
} {
  switch (err.code) {
    case "WRONG_TECHNICIAN":
      return {
        friendlyMessage:
          "This job is assigned to a different technician. You cannot complete it.",
        severity: "warning",
      };
    case "JOB_ALREADY_COMPLETED":
      return {
        friendlyMessage:
          "This job is already marked complete. Refresh the page to see the latest state.",
        severity: "warning",
      };
    case "NOT_FOUND":
      return {
        friendlyMessage: `${err.message}. The job may have been removed - refresh the page.`,
        severity: "error",
      };
    case "INTERNAL_ERROR":
      return {
        friendlyMessage:
          err.status === 0
            ? "Could not reach the backend. Is the API running on port 4000?"
            : "Something went wrong on the server. Please try again.",
        severity: "error",
      };
    default:
      return {
        friendlyMessage: err.message,
        severity: "error",
      };
  }
}
