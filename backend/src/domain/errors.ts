// Typed domain errors. Thrown from domain helpers (domain/jobs.ts,
// future domain/notifications.ts, etc.) and mapped to HTTP responses by
// route handlers. Route handlers catch these by class identity, not by
// string matching — they're cheap to extend without churning callers.
//
// Pattern: every domain error has a stable `code` string that matches the
// `error` field in the API error envelope from backend/CLAUDE.md
// ({ error: 'CODE', message: '...' }). Route handlers read `err.code` to
// build the envelope; tests assert on `err.code`, never on the message
// string.

export type DomainErrorCode =
  | "TIME_SLOT_CONFLICT"
  | "QUOTE_ALREADY_SCHEDULED"
  | "NOT_FOUND"
  | "INVALID_REFERENCE";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    // Preserve V8 stack trace pointing at the throw site, not this ctor.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }
}

// Composite-UNIQUE violation on uniq_tech_date_slot: another job already
// occupies that (technician, date, slot). Route handler maps to 409.
export class TimeSlotConflictError extends DomainError {
  constructor(message = "This time slot is already taken for this technician") {
    super("TIME_SLOT_CONFLICT", message);
    this.name = "TimeSlotConflictError";
  }
}

// UNIQUE violation on uniq_quote: the quote is already scheduled by some
// other job. Distinct from a time-slot conflict because the failure mode
// and the user-facing remediation are different (pick a different quote
// vs pick a different slot). Route handler maps to 409.
export class QuoteAlreadyScheduledError extends DomainError {
  constructor(message = "This quote is already scheduled") {
    super("QUOTE_ALREADY_SCHEDULED", message);
    this.name = "QuoteAlreadyScheduledError";
  }
}

// FK violation (errno 1452) or explicit existence check: one of the referenced
// IDs (technician, quote, manager, job) does not exist. Route handler maps
// to 404.
export class NotFoundError extends DomainError {
  constructor(resource: string, id: number | string) {
    super("NOT_FOUND", `${resource} ${id} not found`);
    this.name = "NotFoundError";
  }
}

// FK violation that we couldn't attribute to a specific resource (rare —
// MySQL gives us the constraint name, so we usually know). Distinct from
// NOT_FOUND because we're being honest about partial information. Route
// handler maps to 400.
export class InvalidReferenceError extends DomainError {
  constructor(message = "One or more referenced entities do not exist") {
    super("INVALID_REFERENCE", message);
    this.name = "InvalidReferenceError";
  }
}
