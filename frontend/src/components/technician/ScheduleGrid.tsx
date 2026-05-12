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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
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
// Visual treatment: work-order document. The slot time is the visual
// anchor — large monospaced numerals in a fixed-width gutter on the left.
// Status is signalled by a 3px left-edge stripe (primary teal for
// scheduled, success green for completed, neutral grey for available)
// — the same document-motif stripe used on the home page card and the
// manager dashboard. Available slots are dim and recessed so the
// scheduled rows command attention.

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
  const jobBySlot = new Map<Slot, ScheduledJob>();
  for (const job of jobs) {
    jobBySlot.set(job.slot, job);
  }

  const errorAlert = lastError !== null ? <CompleteErrorAlert err={lastError} /> : null;

  const scheduledCount = jobs.filter((j) => j.status === "scheduled").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "flex-end" }}
        justifyContent="space-between"
        spacing={1.5}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", display: "block" }}
          >
            Schedule for
          </Typography>
          <Typography
            variant="h5"
            component="h2"
            sx={{ fontWeight: 700, letterSpacing: "-0.015em" }}
          >
            {format(date, "EEEE, d MMMM yyyy")}
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={2.5}
          sx={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "text.secondary",
            letterSpacing: "0.04em",
          }}
        >
          <Box>
            <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
              {scheduledCount}
            </Box>
            {" SCHEDULED"}
          </Box>
          <Box>
            <Box component="span" sx={{ color: "success.main", fontWeight: 600 }}>
              {completedCount}
            </Box>
            {" DONE"}
          </Box>
          <Box>
            <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
              {SLOTS.length - scheduledCount - completedCount}
            </Box>
            {" OPEN"}
          </Box>
        </Stack>
      </Stack>

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
    <Card
      variant="outlined"
      sx={{
        bgcolor: "rgba(15, 76, 92, 0.015)",
        borderColor: "divider",
        borderStyle: "dashed",
        position: "relative",
        overflow: "hidden",
        // Left-edge status stripe: neutral muted grey for "open" slots.
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 3,
          bgcolor: "rgba(15, 76, 92, 0.18)",
        },
      }}
    >
      <CardContent sx={{ py: 2, "&:last-child": { pb: 2 }, pl: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2.5}>
          <SlotLabel slot={slot} muted />
          <Stack direction="row" alignItems="center" spacing={1}>
            <ScheduleIcon
              sx={{ fontSize: 14, color: "text.disabled" }}
            />
            <Typography
              variant="overline"
              sx={{ color: "text.disabled", letterSpacing: "0.14em" }}
            >
              Open
            </Typography>
          </Stack>
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
        bgcolor: "background.paper",
        borderColor: "divider",
        position: "relative",
        overflow: "hidden",
        transition: "box-shadow 150ms ease, transform 150ms ease",
        // Status stripe: success green for completed, primary teal for
        // active. Wider than the available-stripe (4px vs 3px) so
        // scheduled rows have more visual weight.
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 4,
          bgcolor: isCompleted ? "success.main" : "primary.main",
        },
        "&:hover": {
          boxShadow: isCompleted
            ? "0 1px 3px rgba(21, 128, 61, 0.12)"
            : "0 2px 8px rgba(15, 76, 92, 0.12)",
        },
      }}
    >
      <CardContent sx={{ py: 2, "&:last-child": { pb: 2 }, pl: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={{ xs: 1.5, sm: 2.5 }}
        >
          <SlotLabel slot={slot} muted={isCompleted} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{ mb: 0.5 }}
              flexWrap="wrap"
            >
              <Typography
                component="span"
                sx={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: isCompleted ? "text.secondary" : "primary.main",
                  letterSpacing: "0.02em",
                }}
              >
                {job.quoteReference}
              </Typography>
              {isCompleted ? (
                <Chip
                  size="small"
                  color="success"
                  label="Done"
                  icon={<CheckCircleIcon sx={{ fontSize: "14px !important" }} />}
                  sx={{ height: 22 }}
                />
              ) : (
                <Chip
                  size="small"
                  label="Scheduled"
                  sx={{
                    height: 22,
                    bgcolor: "rgba(15, 76, 92, 0.08)",
                    color: "primary.main",
                    border: 0,
                    fontWeight: 600,
                  }}
                />
              )}
            </Stack>
            <Typography
              variant="body2"
              sx={{
                color: isCompleted ? "text.disabled" : "text.primary",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                mb: 0.5,
                textDecoration: isCompleted ? "line-through" : "none",
                textDecorationColor: "rgba(0,0,0,0.18)",
              }}
            >
              {job.quoteSummary}
            </Typography>
            <Stack
              direction="row"
              spacing={1.25}
              divider={
                <Box
                  component="span"
                  sx={{ color: "text.disabled", fontSize: "0.7rem" }}
                >
                  ·
                </Box>
              }
              sx={{ flexWrap: "wrap" }}
            >
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", letterSpacing: "0.02em" }}
              >
                Assigned by{" "}
                <Box
                  component="span"
                  sx={{ color: "text.primary", fontWeight: 600 }}
                >
                  {job.managerName}
                </Box>
              </Typography>
              {isCompleted && job.completedAt ? (
                <Typography
                  variant="caption"
                  sx={{
                    color: "success.main",
                    letterSpacing: "0.02em",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  ✓ {formatDateTime(job.completedAt)}
                </Typography>
              ) : null}
            </Stack>
          </Box>

          {!isCompleted && canComplete ? (
            <Button
              variant="contained"
              size="small"
              onClick={() => onComplete(job.id)}
              disabled={completing}
              startIcon={
                completing ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <CheckCircleIcon sx={{ fontSize: 16 }} />
                )
              }
              sx={{ alignSelf: { xs: "flex-end", sm: "center" }, flexShrink: 0 }}
            >
              {completing ? "Completing…" : "Mark complete"}
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SlotLabel({ slot, muted }: { readonly slot: Slot; readonly muted: boolean }) {
  const [startRaw, endRaw] = slot.split("-") as [string, string];
  return (
    <Box
      sx={{
        minWidth: { xs: "auto", sm: 180 },
        flexShrink: 0,
        py: 0.25,
        pr: 1.5,
        borderRight: { xs: 0, sm: 1 },
        borderColor: "divider",
      }}
    >
      <Typography
        component="div"
        sx={{
          fontFamily: "var(--font-mono)",
          fontSize: { xs: "0.85rem", sm: "0.9rem" },
          fontWeight: 600,
          color: muted ? "text.secondary" : "text.primary",
          letterSpacing: "0.02em",
          lineHeight: 1.25,
          whiteSpace: "nowrap",
        }}
      >
        {formatTime(startRaw)}
        <Box
          component="span"
          sx={{ mx: 0.5, color: "text.disabled", fontWeight: 400 }}
        >
          to
        </Box>
        {formatTime(endRaw)}
      </Typography>
    </Box>
  );
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":") as [string, string];
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

function formatDateTime(iso: string): string {
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
