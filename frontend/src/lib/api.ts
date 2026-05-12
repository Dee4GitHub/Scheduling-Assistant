import type {
  AssignJobInput,
  CompleteJobInput,
  DomainErrorCode,
  Job,
  ListNotificationsQuery,
  Manager,
  Notification,
  Quote,
  QuoteStatus,
  ScheduledJob,
  Technician,
} from "@/lib/types";

// Single typed entry point to the backend. Every endpoint has a thin wrapper
// that calls `request()`, which centralises URL construction, JSON parsing,
// error-envelope handling, and the typed-error throw path. Routes never call
// `fetch` directly — they call these wrappers, and they catch ApiError.
//
// Base URL: NEXT_PUBLIC_API_BASE_URL at build time (Next inlines NEXT_PUBLIC_*
// into the client bundle), defaults to localhost:4000 for dev. In the docker
// compose wiring (PR #6 follow-up), the env will point to the backend
// service name inside the network.

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  public readonly code: DomainErrorCode | string;
  public readonly status: number;

  constructor(code: DomainErrorCode | string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly body?: unknown;
  readonly query?: Record<string, string | number | boolean | undefined>;
  // Vercel/Next deduplicates fetches via a request-scoped cache. For mutations
  // and stale-sensitive reads, callers can pass cache:'no-store' explicitly.
  readonly cache?: RequestCache;
  readonly signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers:
      opts.body !== undefined
        ? { "Content-Type": "application/json" }
        : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache,
    signal: opts.signal,
  };

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    // Network-level failure — DNS, TLS, server down. Distinguishable from a
    // 4xx/5xx with envelope by the synthetic 0 status and INTERNAL_ERROR
    // code, so the UI can show "Backend unreachable" specifically.
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError("INTERNAL_ERROR", `Network error: ${message}`, 0);
  }

  // 204 No Content path: no body to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(
        "INTERNAL_ERROR",
        `Unexpected non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`,
        response.status,
      );
    }
  }

  if (!response.ok) {
    // Error envelope per backend/CLAUDE.md: { error: 'CODE', message: '...' }
    // Some Fastify-level errors (Zod validation) use { error, message, statusCode, code }
    // — the same envelope shape with extra fields, so the same path works.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      "message" in parsed &&
      typeof (parsed as { error: unknown }).error === "string" &&
      typeof (parsed as { message: unknown }).message === "string"
    ) {
      const envelope = parsed as { error: string; message: string };
      throw new ApiError(envelope.error, envelope.message, response.status);
    }
    throw new ApiError(
      "INTERNAL_ERROR",
      `HTTP ${response.status} with unexpected body shape`,
      response.status,
    );
  }

  return parsed as T;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ---------- Endpoint wrappers ----------

export function listManagers(signal?: AbortSignal): Promise<readonly Manager[]> {
  return request<readonly Manager[]>("/api/managers", { signal });
}

export function listTechnicians(signal?: AbortSignal): Promise<readonly Technician[]> {
  return request<readonly Technician[]>("/api/technicians", { signal });
}

export function listQuotes(
  status?: QuoteStatus,
  signal?: AbortSignal,
): Promise<readonly Quote[]> {
  return request<readonly Quote[]>("/api/quotes", {
    query: status ? { status } : undefined,
    signal,
  });
}

export function getTechnicianSchedule(
  technicianId: number,
  date?: string,
  signal?: AbortSignal,
): Promise<readonly ScheduledJob[]> {
  return request<readonly ScheduledJob[]>(
    `/api/technicians/${technicianId}/schedule`,
    {
      query: date ? { date } : undefined,
      signal,
    },
  );
}

export function assignJob(input: AssignJobInput, signal?: AbortSignal): Promise<Job> {
  return request<Job>("/api/jobs", {
    method: "POST",
    body: input,
    cache: "no-store",
    signal,
  });
}

export function completeJob(
  jobId: number,
  input: CompleteJobInput,
  signal?: AbortSignal,
): Promise<Job> {
  return request<Job>(`/api/jobs/${jobId}/complete`, {
    method: "POST",
    body: input,
    cache: "no-store",
    signal,
  });
}

export function listNotifications(
  query: ListNotificationsQuery,
  signal?: AbortSignal,
): Promise<readonly Notification[]> {
  // unreadOnly is sent as the literal string "true" or "false" — the
  // backend deliberately rejects z.coerce.boolean()-style values (PR #5's
  // bug fix). Passing a boolean here gets stringified by URLSearchParams
  // to exactly "true" or "false", which is what the backend's
  // z.enum(["true","false"]) expects.
  return request<readonly Notification[]>("/api/notifications", {
    query: {
      recipientType: query.recipientType,
      recipientId: query.recipientId,
      unreadOnly: query.unreadOnly ?? false,
    },
    signal,
  });
}

export function markNotificationRead(
  notificationId: number,
  signal?: AbortSignal,
): Promise<Notification> {
  return request<Notification>(
    `/api/notifications/${notificationId}/read`,
    {
      method: "POST",
      cache: "no-store",
      signal,
    },
  );
}
