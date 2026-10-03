# Event Full Pack Implementation Report

**Date:** 2026-10-02  
**Implementation status:** Client and SQL source changes are present. Integrated acceptance remains incomplete until the migration and real-role checks run against an isolated staging project and desktop/mobile browser flows are exercised.

## Delivered

- Student organizations choose a published campus and request campus grounds and/or building floors. Changing campus with selected locations asks before clearing them. The proposal summary confirms the selected areas, and the organization no longer supplies event dates; the administrator sets those during review.
- The editor retains the map locations in one proposal, provides first-run event-editor guidance, preserves work through autosave behavior, and includes fixed-size furniture, seating arrangement and validation, plus the broader Arrange operations.
- Admin review uses the system-themed date/time control for the event occurrence and offers publish immediately after approval or schedule a later publication. Approved events have a separate **Manage publication** action to publish, reschedule, or unpublish without another approval.
- Student map browsing has an **Event map** entry point, **All / Ongoing / Upcoming** filters, event details in the map panel, and one event card covering its requested locations. Selecting a location previews only that approved location's event layout; opening a venue explicitly changes the viewed floor/map while ordinary navigation remains available.
- The public feed is an allowlisted projection, including a nested allowlist for furniture, labels, and markers. Furniture `assetConfig` exposes only the render-safe `style` string; other arbitrary primitive fields are removed. The SQL source adds admin-only atomic review/publication RPCs, revision checks, event classification guards, explicit rejection of invalid/null decisions, and public-feed restrictions. The client uses the feed's server clock for visibility decisions and avoids falling back to mocked or raw-table event data.
- A staging preflight script requires an explicit staging-only opt-in and refuses non-staging targets or secret/service-role keys. It reads process environment only and does not load `.env.local`. Its publication-command probe uses a stale revision and is expected to be rejected; it is not unconditionally read-only if the guard being tested is broken.

## Where to try the flows

1. Sign in as a student-organization user and open **My Events → Create event**. Choose a published campus, select grounds/building floors, review the location confirmation, then create and design the maps. Save the draft and submit it to GSO.
2. Sign in as an administrator and open **Event Layouts**. Review the whole proposal, enter event start/end using the themed controls, choose immediate or scheduled student publication, and approve. For an already approved card, use **Manage publication** to change publication timing or unpublish it.
3. Sign in as a student and open **Map → Event map**. Filter Upcoming/Ongoing, open an event, inspect its short details and requested venues, then preview a grounds or floor layout. Confirm the ordinary map navigation still works after closing the panel.

The implementation does not contain calibrated physical dimensions or real-world attendee capacity. Furniture dimensions remain map units, and the chair-count checks are layout guardrails rather than a certified capacity estimate.

## Verification evidence

| Check | Result |
| --- | --- |
| Focused unit/component run: service, admin review/publication, tutorial, themed date/time, event lifecycle/map view, and feed hook (8 test files) | **PASS** — 8 files, 51 tests |
| Public asset configuration leak regression | **RED → GREEN** — the focused test first exposed that the public parser retained a primitive `owner` field; after both client and SQL projections were allowlisted, the focused event suite passed. SQL execution remains blocked, so this verifies the client path only. |
| Invalid/null admin review decision regression | **RED → GREEN** — runtime validation now rejects invalid decisions in the client service and SQL RPC. The client regression passed; the SQL branch remains unexecuted until staging. |
| Expanded event integration run (16 test files) | **FAIL aggregate; isolated retry passed** — 112 passed, 1 failed on a CampusMap search-wheel zoom expectation; rerunning that wheel test in isolation passed. That retry does not establish an aggregate-suite PASS. The same flaky map test was observed in earlier aggregate runs. |
| Production Vite build | **PASS** — 2,746 modules transformed. Existing large-chunk warning remains for the map-builder bundle. |
| Staging verifier syntax (`node --check scripts/verify-event-full-pack.mjs`) | **PASS** |
| Staging verifier invocation without explicit staging configuration | **BLOCKED as designed** — stopped before network access because `EVENT_TEST_ENVIRONMENT=staging` is required. No credentials or local env files were read. |
| `git diff --check` | **PASS** — only working-copy LF/CRLF notices were emitted. |
| TypeScript (`tsc --noEmit`) | **FAIL on known baseline map-page diagnostics** — filtered output contains 10 errors in `CampusMapPage.tsx` at the existing route/map integration blocks (around lines 1850, 2998, and 3185–3203). No filtered diagnostics were reported for the new event preview, publication, hook, or themed date/time modules. A clean repository-wide typecheck is not established. |
| Supabase migration/assertion execution with real JWT roles | **BLOCKED** — no `psql`, Supabase CLI, or Docker executable is installed/configured in this workspace, and no isolated staging credentials were provided. The SQL source has not been applied or executed. |
| Desktop/mobile browser workflow and visual checks | **NOT RUN** — no authenticated staging browser session was available. |
| Independent Luna/Max verification and Sol review | **NOT RUN** — implementation-time checks do not replace the separate verification plan or the requested independent review. |

No database write, push, commit, or deployment was performed. The migration is not active in Supabase until it is deliberately applied to a verified staging project.

## Plan-readiness review (2026-10-02)

Source inspection for the next verification pass found that moving an already visible event to future publication currently saves immediately in `AdminEventPublicationDialog.tsx`; the approved design requires a themed confirmation that explains the temporary removal from student view. The verification plan retains ADM10 as a required case and includes scoped repair when reproduced. The plan also requires hardening the preflight's arbitrary first-row probe, verifies that the Vite app and verifier target the same staging project, and treats the previous aggregate run as failed. This documentation/source review did not rerun automated, browser, or database tests; the counts above remain implementation-run evidence.

## Staging continuation

First create or select an isolated Supabase staging project and dedicated test users for anon, student, owner organization, second organization, and admin. Then provide the verifier with the exact staging project reference, a publishable/anon key, and role credentials through process environment variables. Do not use production credentials or a service-role key for student authorization checks.

After confirming the project reference and applied migration history, install only missing forward migrations on staging and run `supabase/tests/event_publication_assertions.sql` and `supabase/tests/event_publication_management_assertions.sql`. These assertions check helpers/projections/grants; actual JWT role and lifecycle cases still need separate execution. Before running the preflight publication-command probe, follow the verification plan's harness repair so it targets only a recorded disposable fixture and compares before/after state. The existing script selects the first admin event row, which is unsuitable as an arbitrary probe target. Configure its explicit `EVENT_TEST_*` staging settings and dedicated role credentials as specified in the verification plan, and separately bind the Vite app's `VITE_SUPABASE_*` settings to that same staging project. The preflight refuses service-role and secret keys; its stale command is expected to fail without mutation, which must be checked rather than assumed. Capture the output and run the separate verification plan at `docs/superpowers/plans/2026-10-02-event-full-pack-verification-luna-max.md` from fresh test state.

The verifier currently provides role, public-feed, isolation, and stale-revision preflight checks. The full create → submit → approve → publish → multi-location student-preview lifecycle, cleanup of disposable fixtures, and base-map immutability comparison still require the dedicated staging/browser pass.
