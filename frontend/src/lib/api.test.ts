import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, assignJob, listQuotes, listNotifications } from "./api";

// Tests for the request() pipeline + a few representative endpoint
// wrappers. We mock global.fetch so the assertions stay deterministic
// and don't depend on a running backend. The shape of the error
// envelope here mirrors backend/CLAUDE.md so a backend change would
// require updating both sides deliberately.

const ORIGINAL_FETCH = global.fetch;

interface MockResponse {
  readonly status?: number;
  readonly ok?: boolean;
  readonly json?: unknown;
}

function mockFetch(response: MockResponse) {
  const status = response.status ?? 200;
  const ok = response.ok ?? (status >= 200 && status < 300);
  const body = response.json !== undefined ? JSON.stringify(response.json) : "";
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response) as typeof fetch;
}

function mockFetchReject(error: Error) {
  global.fetch = vi.fn().mockRejectedValue(error) as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("api request pipeline", () => {
  it("parses a typed error envelope into ApiError with code, message, and status", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: { error: "TIME_SLOT_CONFLICT", message: "Slot already taken" },
    });

    await expect(
      assignJob({
        technicianId: 1,
        quoteId: 2,
        managerId: 3,
        scheduledDate: "2026-05-15",
        slot: "09:00-11:00",
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "TIME_SLOT_CONFLICT",
      message: "Slot already taken",
      status: 409,
    });
  });

  it("maps a network-level fetch rejection to ApiError INTERNAL_ERROR with status 0", async () => {
    mockFetchReject(new TypeError("Failed to fetch"));

    await expect(listQuotes()).rejects.toMatchObject({
      name: "ApiError",
      code: "INTERNAL_ERROR",
      status: 0,
    });
  });

  it("returns the parsed JSON body on a 200 response", async () => {
    const payload = [
      {
        id: 1,
        reference: "Q-1042",
        summary: "Replace condenser",
        status: "unscheduled",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    mockFetch({ ok: true, status: 200, json: payload });

    await expect(listQuotes()).resolves.toEqual(payload);
  });

  it("sends unreadOnly as a literal 'true' / 'false' string in the query", async () => {
    mockFetch({ ok: true, status: 200, json: [] });

    await listNotifications({
      recipientType: "technician",
      recipientId: 7,
      unreadOnly: true,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const calledUrl = String(firstCall?.[0]);
    expect(calledUrl).toContain("recipientType=technician");
    expect(calledUrl).toContain("recipientId=7");
    expect(calledUrl).toContain("unreadOnly=true");
  });

  it("throws INTERNAL_ERROR when an error response body is not the typed envelope", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: { something: "unexpected" },
    });

    await expect(listQuotes()).rejects.toMatchObject({
      name: "ApiError",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  it("ApiError preserves its public API for switch-on-code error handling", () => {
    const err = new ApiError("QUOTE_ALREADY_SCHEDULED", "Already taken", 409);
    expect(err.code).toBe("QUOTE_ALREADY_SCHEDULED");
    expect(err.message).toBe("Already taken");
    expect(err.status).toBe(409);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});
