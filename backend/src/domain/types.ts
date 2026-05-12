import { z } from "zod";

// Shared primitive schemas — referenced by routes and domain helpers.

export const SlotEnum = z.enum([
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "15:00-17:00",
]);
export type Slot = z.infer<typeof SlotEnum>;

export const JobStatusEnum = z.enum(["scheduled", "completed"]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const NotificationTypeEnum = z.enum(["job_assigned", "job_completed"]);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const RecipientTypeEnum = z.enum(["technician", "manager"]);
export type RecipientType = z.infer<typeof RecipientTypeEnum>;

// Resource shapes — what the API returns. Match db/001_schema.sql column types.

export const ManagerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
});
export type Manager = z.infer<typeof ManagerSchema>;

export const TechnicianSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  trade: z.string(),
  createdAt: z.string(),
});
export type Technician = z.infer<typeof TechnicianSchema>;

export const QuoteStatusEnum = z.enum(["unscheduled", "scheduled"]);
export type QuoteStatus = z.infer<typeof QuoteStatusEnum>;

export const QuoteSchema = z.object({
  id: z.number().int().positive(),
  reference: z.string(),
  summary: z.string(),
  status: QuoteStatusEnum,
  createdAt: z.string(),
});
export type Quote = z.infer<typeof QuoteSchema>;

// A job joined with display data — used in the technician schedule response.
export const ScheduledJobSchema = z.object({
  id: z.number().int().positive(),
  technicianId: z.number().int().positive(),
  quoteId: z.number().int().positive(),
  managerId: z.number().int().positive(),
  scheduledDate: z.string(),
  slot: SlotEnum,
  status: JobStatusEnum,
  assignedAt: z.string(),
  completedAt: z.string().nullable(),
  quoteReference: z.string(),
  quoteSummary: z.string(),
  managerName: z.string(),
});
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;

// A bare job row — what assignJob returns. Distinct from ScheduledJobSchema,
// which is the joined-with-display-data shape used by GET /technicians/:id/schedule.
// Keeping them separate avoids a JOIN in the assignment path's response.
export const JobSchema = z.object({
  id: z.number().int().positive(),
  technicianId: z.number().int().positive(),
  quoteId: z.number().int().positive(),
  managerId: z.number().int().positive(),
  scheduledDate: z.string(),
  slot: SlotEnum,
  status: JobStatusEnum,
  assignedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

// Input to assignJob — the domain helper. Routes parse the HTTP body with
// AssignJobRequestSchema (below) and pass the result through.
export const AssignJobInputSchema = z.object({
  technicianId: z.number().int().positive(),
  quoteId: z.number().int().positive(),
  managerId: z.number().int().positive(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  slot: SlotEnum,
});
export type AssignJobInput = z.infer<typeof AssignJobInputSchema>;

// The HTTP request body shape for POST /api/jobs. Currently identical to
// AssignJobInputSchema but kept as a separate export so the route boundary
// is explicit and either side can evolve without dragging the other.
export const AssignJobRequestSchema = AssignJobInputSchema;
export type AssignJobRequest = AssignJobInput;

// Error envelope per backend/CLAUDE.md.
export const ErrorEnvelope = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ErrorEnvelope>;
