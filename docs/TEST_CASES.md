# TEST_CASES.md — End-to-end acceptance test plan

This document is the **acceptance test plan** for the full Scheduling Assistant submission. It exercises every backend endpoint via the frontend UI **and** via direct curl, and verifies the load-bearing architectural claims (conflict prevention, transactional rollback, idempotent reads, authorisation).

You should be able to run through this list and tick every box before submission.

## Prerequisites

```bash
# From repo root
docker compose up -d
# Wait ~10 seconds for MySQL health check
docker compose ps   # expect both 'scheduling-mysql' and 'scheduling-backend' as 'healthy' / 'running'
```

- **Backend:** http://localhost:4000 (Swagger UI at http://localhost:4000/docs)
- **Frontend:** http://localhost:3000
- **MySQL:** localhost:3306 (user `dev`, password `dev`, db `scheduling`)
- **Seed:** 5 managers, 5 technicians, 10 unscheduled quotes (idempotent — re-running won't duplicate).

If you need to wipe and re-seed: `docker compose down -v && docker compose up -d`.

---

## Section A — Backend smoke (run after every backend rebuild)

| # | Test | Command | Expected |
|---|---|---|---|
| A1 | Health | `curl http://localhost:4000/health` | `200 {"status":"ok","database":"reachable","dbPingMs":<n>}` |
| A2 | Managers | `curl http://localhost:4000/api/managers` | `200`, array of 5 managers |
| A3 | Technicians | `curl http://localhost:4000/api/technicians` | `200`, array of 5 technicians |
| A4 | Quotes (all) | `curl http://localhost:4000/api/quotes` | `200`, array of 10 |
| A5 | Quotes (unscheduled only) | `curl 'http://localhost:4000/api/quotes?status=unscheduled'` | `200`, all 10 initially |
| A6 | Empty schedule | `curl http://localhost:4000/api/technicians/1/schedule` | `200 []` (no jobs assigned yet) |
| A7 | Bad technician schedule | `curl -i http://localhost:4000/api/technicians/9999/schedule` | `404` with `{"error":"NOT_FOUND","message":"Technician 9999 not found"}` |
| A8 | Swagger UI | open http://localhost:4000/docs in browser | Renders 8+ endpoints, can expand each |

---

## Section B — Backend integration tests (automated)

```bash
cd backend && npm test
```

| # | Suite | Expected |
|---|---|---|
| B1 | `tests/integration/conflict.test.ts` | 4/4 green, ~700ms |
| B2 | `tests/integration/job-complete.test.ts` | 4/4 green, ~400ms |
| B3 | Run `npm test` 5 times in a row | 8/8 green every time (deterministic; race test is lock-based, not timing-based) |
| B4 | After test run, DB has zero orphan rows | Run: `docker exec scheduling-mysql mysql -udev -pdev scheduling -e "SELECT 'jobs' t, COUNT(*) c FROM jobs UNION ALL SELECT 'notifications', COUNT(*) FROM notifications UNION ALL SELECT 'managers', COUNT(*) FROM managers WHERE email LIKE 'mgr_%@test.local'"`. Expect all zero. |

---

## Section C — Assignment path (POST /api/jobs)

### C1 — Happy path

**Via curl:**
```bash
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":1,"managerId":1,"scheduledDate":"2026-12-01","slot":"09:00-11:00"}'
```
- [ ] `201` returned
- [ ] Response body has `id`, `status:"scheduled"`, `assignedAt` (ISO string), `completedAt:null`
- [ ] Re-fetch quote: `curl http://localhost:4000/api/quotes/...` (or in unscheduled-list, quote 1 is gone). Use `curl 'http://localhost:4000/api/quotes?status=unscheduled' | grep -c '"id"'` → expect `9`.

**Via frontend (Manager dashboard at http://localhost:3000):**
- [ ] Select Technician (any), Date `2026-12-02`, Slot `09:00-11:00`, an unscheduled Quote, Manager (any) → click **Assign**
- [ ] Success toast appears
- [ ] Assigned quote disappears from the unscheduled-quotes dropdown without reloading the page
- [ ] Bell-icon badge for the chosen technician now reads "1"

### C2 — Slot conflict (the load-bearing test)

After C1, fire a *second* assignment with the same `(technicianId, scheduledDate, slot)` but a different quote:

**Via curl:**
```bash
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":2,"managerId":1,"scheduledDate":"2026-12-01","slot":"09:00-11:00"}'
```
- [ ] `409` returned
- [ ] Response body: `{"error":"TIME_SLOT_CONFLICT","message":"This time slot is already taken for this technician"}`
- [ ] Quote 2 is **still** in unscheduled list (transaction rolled back — quote status not flipped)
- [ ] Only one job row exists for that slot: `docker exec scheduling-mysql mysql -udev -pdev scheduling -e "SELECT COUNT(*) FROM jobs WHERE technician_id=1 AND scheduled_date='2026-12-01' AND slot='09:00-11:00'"` → expect `1`

**Via frontend:**
- [ ] Repeating C1's UI flow on the same `(tech, date, slot)` shows an inline error: "This time slot is already taken for this technician"
- [ ] Form does not clear; user can adjust slot and resubmit
- [ ] No spurious "success" toast

### C3 — Quote already scheduled

Try to re-assign quote 1 (already scheduled from C1) to a different slot:

**Via curl:**
```bash
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":2,"quoteId":1,"managerId":1,"scheduledDate":"2026-12-02","slot":"11:00-13:00"}'
```
- [ ] `409` returned
- [ ] Response body: `{"error":"QUOTE_ALREADY_SCHEDULED","message":"This quote is already scheduled"}`

**Via frontend:**
- [ ] The Quote dropdown should not show already-scheduled quotes in the first place. If a user somehow submits a stale id (race with another user), they see "This quote is already scheduled".

### C4 — Invalid FK references

```bash
# Missing technician
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":9999,"quoteId":3,"managerId":1,"scheduledDate":"2026-12-03","slot":"09:00-11:00"}'
```
- [ ] `404 NOT_FOUND` with message containing "Technician (referenced) not found"

```bash
# Missing quote
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":9999,"managerId":1,"scheduledDate":"2026-12-03","slot":"09:00-11:00"}'
```
- [ ] `404 NOT_FOUND` with message containing "Quote (referenced) not found"

```bash
# Missing manager
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":3,"managerId":9999,"scheduledDate":"2026-12-03","slot":"09:00-11:00"}'
```
- [ ] `404 NOT_FOUND` with message containing "Manager (referenced) not found"

### C5 — Zod body validation

```bash
# Bad slot enum
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":3,"managerId":1,"scheduledDate":"2026-12-03","slot":"10:00-12:00"}'
```
- [ ] `400 Bad Request` with Zod validation message mentioning `slot`

```bash
# Bad date format
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":3,"managerId":1,"scheduledDate":"01/12/2026","slot":"09:00-11:00"}'
```
- [ ] `400` with message mentioning `expected YYYY-MM-DD`

```bash
# Missing field
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1}'
```
- [ ] `400` listing every missing required field

```bash
# Negative id
curl -i -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"technicianId":-1,"quoteId":1,"managerId":1,"scheduledDate":"2026-12-03","slot":"09:00-11:00"}'
```
- [ ] `400` (positive int required)

---

## Section D — Schedule view (GET /api/technicians/:id/schedule)

Assume C1 ran successfully (technician 1 has a job on 2026-12-01).

### D1 — All-time schedule

```bash
curl http://localhost:4000/api/technicians/1/schedule | jq .
```
- [ ] `200`, array with at least 1 element from C1
- [ ] Each row has `quoteReference`, `quoteSummary`, `managerName` (JOIN data)
- [ ] Ordered by `scheduledDate` then `slot`

### D2 — Schedule filtered by date

```bash
curl 'http://localhost:4000/api/technicians/1/schedule?date=2026-12-01' | jq .
```
- [ ] `200`, array with exactly the C1 job
- [ ] `?date=2026-12-25` → `200 []` (no jobs)

### D3 — Bad date format

```bash
curl -i 'http://localhost:4000/api/technicians/1/schedule?date=2026-13-01'
```
- [ ] `400` (Zod regex rejects out-of-range months too — verify with the actual regex behaviour; if it accepts but DB returns empty, that's also fine but document)

### D4 — Frontend technician schedule page

- [ ] Pick technician 1, date 2026-12-01 → see the job from C1
- [ ] Each slot row shows: time slot, quote reference, quote summary, manager name
- [ ] Empty slots show "Available" (or equivalent)
- [ ] "Mark complete" button visible only on scheduled (not yet completed) rows

---

## Section E — Completion path (POST /api/jobs/:id/complete)

Use the job from C1 (assume `id` was captured — call it `$JOB_ID`).

### E1 — Wrong technician (403)

```bash
curl -i -X POST http://localhost:4000/api/jobs/$JOB_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"technicianId":2}'
```
- [ ] `403`
- [ ] Body: `{"error":"WRONG_TECHNICIAN","message":"This job is assigned to a different technician"}`
- [ ] DB: job still `status='scheduled'`, no completion notification created

### E2 — Right technician (200)

```bash
curl -i -X POST http://localhost:4000/api/jobs/$JOB_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1}'
```
- [ ] `200`
- [ ] Response body has `status:"completed"`, non-null `completedAt`
- [ ] Manager 1 now has a `job_completed` notification: `curl 'http://localhost:4000/api/notifications?recipientType=manager&recipientId=1'`

### E3 — Already completed (409, idempotent-friendly)

Repeat E2 against the same job id:
- [ ] `409`
- [ ] Body: `{"error":"JOB_ALREADY_COMPLETED","message":"Job <id> is already completed"}`
- [ ] Manager 1 **still** has exactly 1 completion notification (transaction rolled back, not double-fired)

### E4 — Job not found (404)

```bash
curl -i -X POST http://localhost:4000/api/jobs/999999/complete \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1}'
```
- [ ] `404 NOT_FOUND` with message "Job 999999 not found"

### E5 — Bad body

```bash
curl -i -X POST http://localhost:4000/api/jobs/$JOB_ID/complete \
  -H "Content-Type: application/json" \
  -d '{}'
```
- [ ] `400` (missing `technicianId`)

```bash
curl -i -X POST http://localhost:4000/api/jobs/abc/complete \
  -H "Content-Type: application/json" \
  -d '{"technicianId":1}'
```
- [ ] `400` (path param can't coerce to int)

### E6 — Frontend completion flow

- [ ] On technician 1's schedule page (date with a scheduled job), click "Mark complete"
- [ ] Optimistic UI: row shows completed status immediately (or after a single roundtrip)
- [ ] No spurious "Mark complete" button on already-completed rows after the flip
- [ ] If technician 2's schedule is open in another tab and you Mark Complete on technician 1's job from technician 2's session, the response is 403 (frontend should hardcode the schedule's technicianId; this is a defensive check)

---

## Section F — Notifications (GET / POST read)

### F1 — List by recipient

After C1, C2 (failed), and E2:

```bash
curl 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1' | jq .
```
- [ ] `200`, array with **2** entries (job_assigned from C1 + job_assigned from C2 happy-side if any; actually just from C1)
- [ ] Each row has `id`, `type`, `recipientType`, `recipientId`, `jobId`, `message`, `createdAt`, `readAt` (initially null)
- [ ] Ordered by `createdAt DESC`

```bash
curl 'http://localhost:4000/api/notifications?recipientType=manager&recipientId=1' | jq .
```
- [ ] `200`, array with 1 `job_completed` entry from E2

### F2 — Unread-only filter (THIS IS THE FIX FROM THE QUICK-REVIEW PASS)

```bash
# unreadOnly=true → only unread
curl 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1&unreadOnly=true' | jq 'length'
# expect: same count as F1 list initially, since all are unread
```
- [ ] Matches F1 count (no rows have been read yet)

After marking one read (F3), repeat:
- [ ] Count is **F1's count minus 1**

```bash
# unreadOnly=false → ALL (was previously buggy)
curl 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1&unreadOnly=false' | jq 'length'
```
- [ ] Returns the **full** list (matches F1 count), including read ones — this is the bug fix verification

```bash
# unreadOnly=yes → 400 (Zod rejects, not silent-coerce)
curl -i 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1&unreadOnly=yes'
```
- [ ] `400 Bad Request` with message containing `Invalid enum value`

```bash
# unreadOnly=1 → 400
curl -i 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1&unreadOnly=1'
```
- [ ] `400`

### F3 — Mark notification as read

```bash
# Get an id first
NOTIF_ID=$(curl -s 'http://localhost:4000/api/notifications?recipientType=technician&recipientId=1' | jq '.[0].id')

# Mark read
curl -i -X POST "http://localhost:4000/api/notifications/$NOTIF_ID/read"
```
- [ ] `200`
- [ ] Response body has `readAt` populated (ISO timestamp)

### F4 — Idempotent re-read

Repeat F3 against the same id:
- [ ] `200`
- [ ] `readAt` is the **same** value as before (not updated to NOW) — this is the `COALESCE(read_at, CURRENT_TIMESTAMP)` working

### F5 — Mark missing (404)

```bash
curl -i -X POST http://localhost:4000/api/notifications/999999/read
```
- [ ] `404 NOT_FOUND`

### F6 — Required filters

```bash
# Missing recipientId
curl -i 'http://localhost:4000/api/notifications?recipientType=technician'
```
- [ ] `400`

```bash
# Missing both
curl -i 'http://localhost:4000/api/notifications'
```
- [ ] `400` (both required)

```bash
# Bad recipientType
curl -i 'http://localhost:4000/api/notifications?recipientType=admin&recipientId=1'
```
- [ ] `400` (only `technician` or `manager` valid)

### F7 — 50-row cap

If you want to verify the cap: assign 51 jobs to the same technician across different (date, slot) combinations. The list response should top out at 50, ordered by `createdAt DESC` (so the *most recent* 50 — the one missing is the oldest). This is hard to set up manually; not a required test.

### F8 — Frontend bell-icon

- [ ] Bell icon visible in top-right header on every page
- [ ] Badge shows unread count for the currently-viewed user (whichever role/id the page's context implies)
- [ ] After C1 + E2, manager 1's bell shows "1" (the completion notification)
- [ ] Click bell → Popover opens with last 10 notifications, scrollable
- [ ] Click a notification → it greys out (read), badge decrements by 1 without a page reload
- [ ] Click outside the Popover → it closes

---

## Section G — Concurrency claims

These prove the load-bearing architectural decisions. Some are exercised by the integration tests; some are smoke-test-only.

### G1 — Two concurrent assignments on the same slot

The conflict.test.ts test already covers this. The smoke equivalent:

```bash
# In two separate terminals, run *simultaneously* (best-effort):
curl -X POST http://localhost:4000/api/jobs -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":3,"managerId":1,"scheduledDate":"2026-12-10","slot":"13:00-15:00"}' &
curl -X POST http://localhost:4000/api/jobs -H "Content-Type: application/json" \
  -d '{"technicianId":1,"quoteId":4,"managerId":1,"scheduledDate":"2026-12-10","slot":"13:00-15:00"}' &
wait
```
- [ ] Exactly one returns 201, exactly one returns 409 — every time, no flakiness

### G2 — Two concurrent completions on the same job

Set up a fresh assigned job, then:

```bash
JOB_ID=...  # from a fresh assignment
curl -X POST "http://localhost:4000/api/jobs/$JOB_ID/complete" -H "Content-Type: application/json" -d '{"technicianId":1}' &
curl -X POST "http://localhost:4000/api/jobs/$JOB_ID/complete" -H "Content-Type: application/json" -d '{"technicianId":1}' &
wait
```
- [ ] Exactly one returns 200, exactly one returns 409 — InnoDB row lock arbitrates
- [ ] DB: only **one** manager notification for that job_id

### G3 — Rollback on conflict (atomicity)

After C2 (the slot-conflict case):
- [ ] Quote 2 is still in `unscheduled` status (the failed transaction's UPDATE was rolled back)
- [ ] No notification exists for quote 2's would-be technician
- [ ] No jobs row exists for quote 2

---

## Section H — Frontend regression edge cases

### H1 — Empty states

- [ ] First-load Manager dashboard: dropdowns populate without errors
- [ ] First-load Technician schedule for a tech with no jobs: shows "No jobs scheduled" message, not a blank page
- [ ] First-load notification bell for a recipient with no notifications: badge hidden, panel shows "No notifications"

### H2 — Network errors

Stop the backend mid-session (`docker compose stop backend`):
- [ ] Frontend shows a non-cryptic error message ("Backend unreachable" or similar)
- [ ] User can recover by restarting the backend without reloading the page (after `docker compose start backend`, the next action succeeds)

### H3 — Stale data

- [ ] Open Manager dashboard in two browser tabs
- [ ] In tab 1, assign quote X to (tech 1, date, slot)
- [ ] In tab 2 (which still shows X as unscheduled), try to assign X to a different slot → response is 409 QUOTE_ALREADY_SCHEDULED, frontend shows clear error
- [ ] Tab 2's quote dropdown stays consistent (either auto-refresh after the error, or update on next manual refresh — document the choice)

### H4 — Visual

- [ ] Manager dashboard renders cleanly at desktop, tablet, mobile widths (MUI Grid)
- [ ] Schedule grid is readable (4 slot rows per day, alternating row colours OK)
- [ ] Bell icon Popover doesn't overflow the viewport on mobile
- [ ] No console errors in browser DevTools during normal flow

---

## Section I — Submission readiness

- [ ] `docker compose down -v && docker compose up -d` → full stack comes up clean from scratch
- [ ] Backend seeded successfully (`docker compose logs backend | grep "seed complete"`)
- [ ] Run Section A end-to-end on a fresh stack
- [ ] Run all of Section C → F via the **frontend UI only** (no curl) — verify the user-facing happy path works end-to-end without the API direct
- [ ] README.md at repo root has setup instructions matching this file
- [ ] `docs/ARCHITECTURE.md` documents the conflict-prevention claim with link to `conflict.test.ts`
- [ ] `docs/agentic-process/` has the agentic-process notes referenced in CLAUDE.md
- [ ] `npm test` from `backend/` → 8/8 green (run 3 times for confidence)
- [ ] No `console.log` in production code paths (`grep -r "console.log" backend/src` → empty)
- [ ] No `TODO`/`FIXME` markers in shipped code (`grep -rE "TODO|FIXME" backend/src frontend/src` → empty or only intentional ones)
- [ ] Git: every commit follows conventional-commits format, signed Co-Authored-By Claude
- [ ] Final `git log --oneline main` shows 6 squash-merged PRs

---

## Failure recovery

If anything in this list fails, **do not ship**. Triage:

1. If a backend integration test fails → fix before merging PR #6
2. If a frontend flow fails on the curl-passing backend → frontend bug, fix in PR #6
3. If the backend smoke fails on a freshly-stood-up stack → most likely seed or schema bootstrap; check `docker compose logs backend`
4. If a concurrency claim fails → STOP and read `domain/jobs.ts` carefully; the architectural claim is the value of the submission

Submission deadline: Friday 2026-05-15 10am Sydney.
