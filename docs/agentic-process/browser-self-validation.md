# Browser-driven self-validation

For UI work, typecheck and curl are not enough. UI claims need browser evidence.

I used the Chrome DevTools MCP integration to drive the live frontend after every UI change. The loop was:

1. Make the change.
2. `npm run typecheck` — does it compile?
3. Reload the page via MCP.
4. `list_console_messages` — any errors or warnings?
5. `take_snapshot` — read the accessibility tree to confirm the right elements rendered.
6. `take_screenshot` — visual check.
7. `evaluate_script` — measure actual rendered `getComputedStyle` font sizes when the user flagged a typography hierarchy issue.

Steps 4–7 caught regressions that typecheck never would:

- An em-dash in a UI string (compiles fine, looks fine in a typecheck-only loop, fails the project's no-em-dash style rule).
- A stale role-picker dropdown showing a persisted Marcus Lee while the user was actively identifying as Aisha Khan — the picker logic was right, but the AppShell hadn't been told to hide the role indicator on the home route.
- An MUI `<Select>` warning about an out-of-range `value` when a just-assigned quote disappeared from the unscheduled list — fixed via the stale-id guard, validated via the snapshot.
- Field labels rendering smaller than their selected values — typography hierarchy inverted, caught by measuring the `font-size` of both elements directly in the browser via `evaluate_script`.

## Why this matters

Without browser validation, the typecheck-and-claim-done loop produces UI that "should work" but doesn't survive contact with a real user. The brief grades UX as well as architecture. UX is what the user sees, not what the test asserts.

It also means every "done" claim has evidence. When I told the user "the field label now dominates the placeholder value," it was followed by a `getComputedStyle` measurement: label 15.2px / 600, value 14.4px / 400. Numbers, not vibes.

## Trade-off

It's slower than typecheck-only. Roughly 30–60 seconds extra per UI change for the reload + snapshot + screenshot loop. On a 5-hour build budget that adds up.

I traded the time because UI regressions are exactly the kind of thing typecheck doesn't catch, and the user kept finding ones I would have shipped otherwise. Worth the time.

At brix scale I'd replace some of this with Playwright snapshot tests on the assignment flow — same goal (catch regressions), different cost profile (slower to write, faster to run).

## Cross-reference

This pattern is named in my memory as `feedback_browser_self_validation.md` — established after this build, applies forward to any UI work.
