// TypeScript types mirroring backend/src/domain/types.ts. Kept by hand rather
// than imported from the backend workspace — the frontend has no build-time
// dependency on the backend's src/, so a future change to one doesn't ripple
// through the other's CI. The shapes match by convention. A future shared
// package (e.g. @scheduling/types) would close that gap.
//
// Camel-cased to match the JSON shape the API returns, not the snake_case of
// the underlying MySQL columns. The backend's route handlers already do that
// transformation — these types live on the wire.

export type Slot =
  | "09:00-11:00"
  | "11:00-13:00"
  | "13:00-15:00"
  | "15:00-17:00";

export const SLOTS: readonly Slot[] = [
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "15:00-17:00",
];

export type JobStatus = "scheduled" | "completed";
export type QuoteStatus = "unscheduled" | "scheduled";
export type NotificationType = "job_assigned" | "job_completed";
export type RecipientType = "technician" | "manager";

export interface Manager {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface Technician {
  readonly id: number;
  readonly name: string;
  readonly trade: string;
  readonly createdAt: string;
}

export interface Quote {
  readonly id: number;
  readonly reference: string;
  readonly summary: string;
  readonly status: QuoteStatus;
  readonly createdAt: string;
}

// Bare job — returned by POST /api/jobs and POST /api/jobs/:id/complete.
export interface Job {
  readonly id: number;
  readonly technicianId: number;
  readonly quoteId: number;
  readonly managerId: number;
  readonly scheduledDate: string;
  readonly slot: Slot;
  readonly status: JobStatus;
  readonly assignedAt: string;
  readonly completedAt: string | null;
}

// Joined job with display data — returned by GET /api/technicians/:id/schedule.
export interface ScheduledJob extends Job {
  readonly quoteReference: string;
  readonly quoteSummary: string;
  readonly managerName: string;
}

export interface AssignJobInput {
  readonly technicianId: number;
  readonly quoteId: number;
  readonly managerId: number;
  readonly scheduledDate: string;
  readonly slot: Slot;
}

export interface CompleteJobInput {
  readonly technicianId: number;
}

export interface Notification {
  readonly id: number;
  readonly type: NotificationType;
  readonly recipientType: RecipientType;
  readonly recipientId: number;
  readonly jobId: number;
  readonly message: string;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface ListNotificationsQuery {
  readonly recipientType: RecipientType;
  readonly recipientId: number;
  readonly unreadOnly?: boolean;
}

// Stable domain error codes the API returns inside the error envelope.
// The frontend switches on `.code` (not the message string) to render
// the right inline UI per failure mode.
export type DomainErrorCode =
  | "TIME_SLOT_CONFLICT"
  | "QUOTE_ALREADY_SCHEDULED"
  | "NOT_FOUND"
  | "INVALID_REFERENCE"
  | "WRONG_TECHNICIAN"
  | "JOB_ALREADY_COMPLETED"
  // Catch-alls outside the typed domain hierarchy: Fastify's own validation
  // failures (Zod 400s) and any uncaught driver/Internal error (500).
  | "VALIDATION_FAILED"
  | "INTERNAL_ERROR";

export interface ApiErrorEnvelope {
  readonly error: string;
  readonly message: string;
}
