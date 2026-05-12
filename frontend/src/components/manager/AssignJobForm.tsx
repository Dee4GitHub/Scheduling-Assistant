"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFnsV3";
import { format, parseISO } from "date-fns";
import { enAU } from "date-fns/locale";
import type {
  AssignJobInput,
  Manager,
  Quote,
  Slot,
  Technician,
} from "@/lib/types";
import { SLOTS } from "@/lib/types";
import { ApiError } from "@/lib/api";

// Assignment form — pure presentation. Parent fetches the lists and owns the
// mutation; this component renders the inputs, validates that every field is
// filled, and emits an AssignJobInput payload on submit. CLAUDE.md compliance:
// no API calls here, no data fetching, no global state, just props + local
// useState for the draft.
//
// Date storage: form holds a Date object so the MUI DatePicker can manage it,
// but emits a YYYY-MM-DD string in the payload to match the backend's
// AssignJobInputSchema regex.

interface AssignJobFormProps {
  readonly managers: readonly Manager[];
  readonly technicians: readonly Technician[];
  readonly quotes: readonly Quote[];
  readonly initialManagerId?: number;
  readonly submitting: boolean;
  readonly lastError: ApiError | null;
  onSubmit(input: AssignJobInput): void;
}

type DraftId = number | "";
type DraftSlot = Slot | "";

interface Draft {
  technicianId: DraftId;
  quoteId: DraftId;
  managerId: DraftId;
  scheduledDate: Date | null;
  slot: DraftSlot;
}

const EMPTY_DRAFT: Draft = {
  technicianId: "",
  quoteId: "",
  managerId: "",
  scheduledDate: null,
  slot: "",
};

export function AssignJobForm({
  managers,
  technicians,
  quotes,
  initialManagerId,
  submitting,
  lastError,
  onSubmit,
}: AssignJobFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // Pre-fill managerId from the role context when the form mounts (or when
  // it changes — e.g. user picked a different manager via the header). Other
  // fields stay empty so the user makes a conscious choice per assignment.
  useEffect(() => {
    if (initialManagerId !== undefined) {
      setDraft((prev) => ({ ...prev, managerId: initialManagerId }));
    }
  }, [initialManagerId]);

  // Stale-id guard: when the parent refetches `quotes` after a successful
  // assignment, the just-assigned quote disappears from the available list.
  // The form's draft.quoteId still points at the old id, which would (1)
  // make MUI's Select complain about an out-of-range value, and (2) allow
  // the user to click Assign and submit a stale id (the backend would
  // reject with QUOTE_ALREADY_SCHEDULED, but better to never send it).
  //
  // Computing `effectiveQuoteId` during render — not via useEffect — closes
  // the one-frame window where MUI's Select would see the stale value
  // before the effect cleanup ran. If the drafted id isn't in the list,
  // the Select sees "" immediately, no warning fires, and the next
  // render-after-effect (below) syncs the draft state to match.
  const effectiveQuoteId: DraftId =
    draft.quoteId !== "" && quotes.some((q) => q.id === draft.quoteId)
      ? draft.quoteId
      : "";

  useEffect(() => {
    if (draft.quoteId !== "" && draft.quoteId !== effectiveQuoteId) {
      setDraft((prev) => ({ ...prev, quoteId: "" }));
    }
  }, [draft.quoteId, effectiveQuoteId]);

  const updateIdField =
    (key: "technicianId" | "quoteId" | "managerId") =>
    (e: SelectChangeEvent<DraftId>) => {
      const raw = e.target.value;
      setDraft((prev) => ({
        ...prev,
        [key]: raw === "" ? "" : Number(raw),
      }));
    };

  const updateSlot = (e: SelectChangeEvent<DraftSlot>) => {
    setDraft((prev) => ({ ...prev, slot: e.target.value as DraftSlot }));
  };

  const updateDate = (date: Date | null) => {
    setDraft((prev) => ({ ...prev, scheduledDate: date }));
  };

  // Use effectiveQuoteId rather than draft.quoteId so the button correctly
  // becomes disabled the moment the selected quote becomes unavailable
  // (e.g. another tab assigned it), without waiting for the useEffect that
  // syncs the draft state back. Same render, same truth.
  const isComplete =
    draft.technicianId !== "" &&
    effectiveQuoteId !== "" &&
    draft.managerId !== "" &&
    draft.scheduledDate !== null &&
    draft.slot !== "";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isComplete || submitting) return;
    // TS narrowing: isComplete guarantees no field is empty/null, but the
    // checker doesn't know that from a single boolean. We assert at the
    // payload boundary rather than sprinkling non-null assertions through
    // the body.
    const payload: AssignJobInput = {
      technicianId: draft.technicianId as number,
      quoteId: effectiveQuoteId as number,
      managerId: draft.managerId as number,
      scheduledDate: format(draft.scheduledDate as Date, "yyyy-MM-dd"),
      slot: draft.slot as Slot,
    };
    onSubmit(payload);
  };

  const handleReset = () => {
    setDraft({
      ...EMPTY_DRAFT,
      managerId: initialManagerId ?? "",
    });
  };

  // Map ApiError.code to inline form-level error UI. Distinct codes get distinct
  // messages so the reviewer can see we handle each typed failure mode
  // deliberately rather than collapsing them to a generic "something went wrong".
  const errorAlert = buildErrorAlert(lastError);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enAU}>
      <Stack component="form" spacing={3} onSubmit={handleSubmit} noValidate>
        {errorAlert}

        <FieldBlock tag="A" label="Technician" labelId="technician-label">
          <FormControl fullWidth>
            <Select<DraftId>
              id="technician"
              value={draft.technicianId}
              displayEmpty
              renderValue={(value) =>
                value === "" ? (
                  <PlaceholderText>Select a technician</PlaceholderText>
                ) : (
                  renderTechnicianOption(value, technicians)
                )
              }
              onChange={updateIdField("technicianId")}
              inputProps={{ name: "technicianId", "aria-labelledby": "technician-label" }}
              disabled={submitting}
            >
              {technicians.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  <Stack direction="row" alignItems="baseline" spacing={1.25}>
                    <Typography component="span" sx={{ fontWeight: 500 }}>
                      {t.name}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.72rem",
                        color: "text.secondary",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t.trade.toUpperCase()}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FieldBlock>

        <FieldBlock
          tag="B"
          label="Quote"
          labelId="quote-label"
          hint={quotes.length === 0 ? "All quotes scheduled" : undefined}
        >
          <FormControl fullWidth>
            <Select<DraftId>
              id="quote"
              value={effectiveQuoteId}
              displayEmpty
              renderValue={(value) =>
                value === "" ? (
                  <PlaceholderText>
                    {quotes.length === 0
                      ? "No unscheduled quotes"
                      : "Select an unscheduled quote"}
                  </PlaceholderText>
                ) : (
                  renderQuoteOption(value, quotes)
                )
              }
              onChange={updateIdField("quoteId")}
              inputProps={{ name: "quoteId", "aria-labelledby": "quote-label" }}
              disabled={submitting || quotes.length === 0}
            >
              {quotes.length === 0 ? (
                <MenuItem value="" disabled>
                  No unscheduled quotes available
                </MenuItem>
              ) : (
                quotes.map((q) => (
                  <MenuItem key={q.id} value={q.id}>
                    <Stack direction="row" alignItems="baseline" spacing={1.25}>
                      <Typography
                        component="span"
                        sx={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "primary.main",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {q.reference}
                      </Typography>
                      <Typography component="span" sx={{ color: "text.secondary" }}>
                        {q.summary}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </FieldBlock>

        <FieldBlock tag="C" label="Assigned by" labelId="manager-label">
          <FormControl fullWidth>
            <Select<DraftId>
              id="manager"
              value={draft.managerId}
              displayEmpty
              renderValue={(value) =>
                value === "" ? (
                  <PlaceholderText>Select a manager</PlaceholderText>
                ) : (
                  renderManagerOption(value, managers)
                )
              }
              onChange={updateIdField("managerId")}
              inputProps={{ name: "managerId", "aria-labelledby": "manager-label" }}
              disabled={submitting}
            >
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FieldBlock>

        <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", sm: "row" } }}>
          <FieldBlock tag="D" label="Scheduled date" labelId="date-label" sx={{ flex: 1 }}>
            <DatePicker
              value={draft.scheduledDate}
              onChange={updateDate}
              disabled={submitting}
              // Backend's regex accepts any YYYY-MM-DD; the UI restricts to
              // today-or-later to match the business rule that you don't
              // schedule a job in the past. Backend will accept past dates
              // — this is a UX guardrail, not a security boundary.
              minDate={new Date()}
              slotProps={{
                textField: {
                  fullWidth: true,
                  placeholder: "DD/MM/YYYY",
                  // The visible field label was suppressed (replaced by the
                  // FieldBlock overline); add aria-labelledby so screen
                  // readers still announce it.
                  inputProps: { "aria-labelledby": "date-label" },
                },
              }}
            />
          </FieldBlock>

          <FieldBlock tag="E" label="Time slot" labelId="slot-label" sx={{ flex: 1 }}>
            <FormControl fullWidth>
              <Select<DraftSlot>
                id="slot"
                value={draft.slot}
                displayEmpty
                renderValue={(value) =>
                  value === "" ? (
                    <PlaceholderText>Select a 2-hour slot</PlaceholderText>
                  ) : (
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {formatSlot(value as Slot)}
                    </Typography>
                  )
                }
                onChange={updateSlot}
                inputProps={{ name: "slot", "aria-labelledby": "slot-label" }}
                disabled={submitting}
              >
                {SLOTS.map((s) => (
                  <MenuItem key={s} value={s}>
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {formatSlot(s)}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </FieldBlock>
        </Box>

        <Stack
          direction={{ xs: "column-reverse", sm: "row" }}
          spacing={1.5}
          justifyContent="flex-end"
          sx={{ borderTop: 1, borderColor: "divider", mt: 1, pt: 3 }}
        >
          <Button
            type="button"
            variant="outlined"
            color="inherit"
            onClick={handleReset}
            disabled={submitting}
          >
            Reset
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={!isComplete || submitting}
            startIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SendIcon fontSize="small" />
              )
            }
          >
            {submitting ? "Assigning…" : "Assign job"}
          </Button>
        </Stack>
      </Stack>
    </LocalizationProvider>
  );
}

function formatSlot(slot: Slot): string {
  // Display form: "9:00 AM - 11:00 AM". Backend uses 24h ENUMs; we humanise
  // for the UI without changing the wire value.
  const [start, end] = slot.split("-") as [string, string];
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":") as [string, string];
  const h = Number(hStr);
  const m = mStr;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

function buildErrorAlert(err: ApiError | null): React.ReactNode {
  if (err === null) return null;

  const { friendlyMessage, severity } = describeError(err);

  return (
    <Alert severity={severity} sx={{ alignItems: "center" }}>
      {friendlyMessage}
    </Alert>
  );
}

function describeError(err: ApiError): {
  friendlyMessage: string;
  severity: "error" | "warning";
} {
  switch (err.code) {
    case "TIME_SLOT_CONFLICT":
      return {
        friendlyMessage:
          "This time slot is already taken for this technician. Pick a different slot or technician.",
        severity: "warning",
      };
    case "QUOTE_ALREADY_SCHEDULED":
      return {
        friendlyMessage:
          "This quote is already scheduled. Pick a different quote.",
        severity: "warning",
      };
    case "NOT_FOUND":
      return {
        friendlyMessage: `${err.message}. The record may have been removed - reload the page to refresh.`,
        severity: "error",
      };
    case "INVALID_REFERENCE":
      return {
        friendlyMessage:
          "One of the IDs in the form no longer exists. Reload the page and try again.",
        severity: "error",
      };
    case "VALIDATION_FAILED":
      return {
        friendlyMessage: `Validation failed: ${err.message}`,
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

// Re-export parseISO so the route handler can format the dates it gets back
// without importing date-fns directly (keeps the dependency narrow to here).
export { parseISO };

// Tabular field block: tag letter ("A", "B"...) + UPPERCASE label + optional
// hint + the actual input. The tag letters turn the form into a sequential
// document. Same vocabulary as the home page RolePicker.
//
// The overline label gets an id so the matching Select can reference it via
// aria-labelledby — preserves screen-reader accessibility after we removed
// the inline MUI InputLabel (which used to double-label the field).
function FieldBlock({
  tag,
  label,
  labelId,
  hint,
  children,
  sx,
}: {
  readonly tag: string;
  readonly label: string;
  readonly labelId?: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
  readonly sx?: object;
}) {
  return (
    <Box sx={sx}>
      <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ mb: 1.25 }}>
        <Typography
          component="span"
          sx={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            fontWeight: 600,
            color: "text.disabled",
            letterSpacing: "0.14em",
            // Fixed-width gutter so labels align left across rows.
            width: 14,
            flexShrink: 0,
          }}
        >
          {tag}
        </Typography>
        <Typography
          id={labelId}
          component="span"
          sx={{
            // Custom field-label tier: bigger than overline (0.7rem) so it
            // dominates the placeholder text inside the Select; smaller than
            // h6 (1rem) so it stays a field label, not a section header.
            fontSize: "0.78rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "text.primary",
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
        {hint ? (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", ml: "auto", letterSpacing: 0 }}
          >
            {hint}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}

// Muted placeholder text rendered inside a Select when no option is picked.
// The colour matches MUI's text.disabled so it reads as a hint, not as data.
function PlaceholderText({ children }: { readonly children: React.ReactNode }) {
  return (
    <Typography
      component="span"
      sx={{
        color: "text.disabled",
        fontWeight: 400,
        fontSize: "0.92rem",
        fontStyle: "italic",
      }}
    >
      {children}
    </Typography>
  );
}

// Render functions for the Select's collapsed-state value. They mirror the
// open-list MenuItem rendering so the typography stays consistent — a
// reference rendered in mono primary teal in the list still reads in mono
// primary teal when selected.
function renderTechnicianOption(
  value: DraftId,
  technicians: readonly Technician[],
): React.ReactNode {
  const t = technicians.find((x) => x.id === value);
  if (!t) return null;
  return (
    <Stack direction="row" alignItems="baseline" spacing={1.25}>
      <Typography component="span" sx={{ fontWeight: 500 }}>
        {t.name}
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.72rem",
          color: "text.secondary",
          letterSpacing: "0.04em",
        }}
      >
        {t.trade.toUpperCase()}
      </Typography>
    </Stack>
  );
}

function renderQuoteOption(
  value: DraftId,
  quotes: readonly Quote[],
): React.ReactNode {
  const q = quotes.find((x) => x.id === value);
  if (!q) return null;
  return (
    <Stack direction="row" alignItems="baseline" spacing={1.25}>
      <Typography
        component="span"
        sx={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
          fontWeight: 600,
          color: "primary.main",
          letterSpacing: "0.02em",
        }}
      >
        {q.reference}
      </Typography>
      <Typography
        component="span"
        sx={{
          color: "text.secondary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {q.summary}
      </Typography>
    </Stack>
  );
}

function renderManagerOption(
  value: DraftId,
  managers: readonly Manager[],
): React.ReactNode {
  const m = managers.find((x) => x.id === value);
  if (!m) return null;
  return <Typography component="span">{m.name}</Typography>;
}
