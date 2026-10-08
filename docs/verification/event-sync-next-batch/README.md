# Event sync next batch — October 8, 2026

This batch is scoped to the Student Org → GSO/Admin → Org → public Student event workflow. It adds private read receipts, repairs the existing activity-history database contract used by Admin notifications, clarifies loading, and verifies revisions and publication clocks. Existing unrelated TypeScript diagnostics are outside this batch.

## Local implementation

- `supabase/migrations/20261008120000_event_notification_receipts.sql` is a **single, additive SQL Editor bundle**. It restores `admin_activity_preferences` and its guarded getter/clear command, then installs the private receipt table and read/acknowledgement RPCs.
- Admin submission and Org review notifications use server receipts when installed. A receipt matches the exact displayed semantic update. New revisions/comments are unread again; an old screen cannot acknowledge a newer update. Actor, role and ownership are checked server-side.
- Missing receipt RPCs are cached as unavailable until an explicit retry. Browser-only marks have an explicit notice. Failed installed-server acknowledgement stays unread. No JWT metadata or event records store receipt state.
- Publication/review buttons show the active action, block duplicate effective saves, retain inputs on failure and respect reduced-motion preferences. Public maps and Org/Admin lists retain cached content with a visible retry after background failures.
- Opening Org maps waits for acknowledgement before leaving the subscribed page. This fixes the teardown race found by independent code review. Server publication errors are normalized into actionable Errors rather than replaced by a generic message.

## Deployment — applied and verified

The user ran the SQL personally and supplied a successful SQL Editor result on October 8. Hosted API probes then confirmed the migration exists in the app's configured project. **10 hosted API checks and 10 real browser checks PASS**; evidence is in `live-api.json` and `live-evidence/results.json`.

The live Org test acknowledged one existing reviewed QA event in a desktop context. Its unread mark cleared in an independent mobile context on focus, with no local read receipt in that second context, and survived reload. The event metadata and row revision were byte-for-byte equivalent before/after; the only write was the private read receipt. No QA event was created, approved, scheduled or published.

The activity preferences endpoint and guarded getter no longer return 404. Expected actor mismatch, anonymous and regular Student access are denied; regular Students cannot SELECT private receipt rows.

**Admin follow-up completed:** With the user's explicit go-ahead, a Student Org created and submitted a temporary Campus Grounds layout through the real UI. **19 live Admin checks PASS** across independent desktop/mobile contexts. New red marks and bell number appeared in both; reading the QA notification cleared exactly one badge on the other session through the hosted receipt, with no local receipt there. Pending-review counts remained and the read mark survived reload. The proposal was then withdrawn and deleted through the Org UI; its receipt was removed by the event FK cascade. No approval/publication command ran, and existing events were untouched. Evidence: `admin-live-evidence/results.json` and screenshots.

That follow-up exposed an archived `TEST` record being included in the frontend pending list. `listEventOverlays` and `getEventOverlay` now filter `archived_at IS NULL`, matching the backend receipt eligibility. Two regressions failed before this fix, then the affected **4 files / 65 tests PASS** and production build PASS. The archived record itself was preserved. Earlier interrupted test runs also cleaned their owned temporary drafts.

**Remaining limit:** Mobile verification uses browser viewports, not physical devices.

If an already-open app still has the earlier missing-migration notice, reload it or choose **Retry sync / Retry read sync**.

Deployment/recheck procedure for reference:

1. In the existing project's Supabase SQL Editor, paste and run the entire `20261008120000_event_notification_receipts.sql` file, including its transaction.
2. On success, reload the local app or choose **Retry sync / Retry read sync**. Missing-migration messages should disappear.
3. Sign in as the same Admin in two independent browsers. Open one pending submission on device A; focus/reload device B. Only that submission's unread mark should clear; pending-review count remains.
4. Repeat with the same Student Org and an approved/disapproved layout. A new GSO comment or review must reappear unread. A different Org and an ordinary Student must not receive that private review notification.

No QA event needs to be created to install the migration. It changes private read state and activity-view preferences, not event status, layout, schedule, published campus maps, or append-only audit rows. Existing browser read marks are retained as fallback; when server sync first becomes available, its authoritative state may show an old review unread until opened again.

## Evidence and limits

- `validate-sql.mjs`: **26 PASS** checks in isolated PostgreSQL/PGlite, including role/owner rejection, direct-write rejection, private RLS, stale payloads, new updates, idempotency and preserved event/audit data. Minimal auth/schema fixtures model existing contracts. This does not replace installation or live verification against the complete hosted schema.
- Affected regression suite: **12 files / 128 PASS** before the final server-error regression. Covers read receipt stores/services, event service, feedback acknowledgement, pending edits, resubmission, stale review, retained drafts and public clock boundaries. Existing React act warnings are present in UI tests.
- TypeScript comparison: **1,010 diagnostics at HEAD and current, zero introduced** by per-file/code multiplicity. This is a preserved error baseline, not a clean typecheck.
- Final affected rechecks: **4 files / 63 PASS**, then **3 files / 30 PASS** after the last navigation fixes (overlapping suites, not additive counts). Production build passed; existing large-chunk warnings remain.
- `run-ui.mjs` uses the real rendered app at desktop 1440×900 and mobile 390×844 / 360×640, independent browser contexts, reduced motion, controlled responses and clocks. Demo sign-in and published-campus reads are real. Receipt RPCs and failing mutations are intercepted; no live event is created, approved, published or retained.
- **25 controlled browser checks PASS**, with zero page errors. The raw runner's `blockedLiveWrites: 6` field records six blocked **read-only POST RPCs** (`list_coming_soon_campuses`); no event mutation is among them. These are not six executed database writes.
- Actual hosted Org and Admin cross-session receipt sync are verified after installation. Physical devices were not tested. Public preview checks cover Upcoming → Ongoing → ended with no reload and a failed background feed.

Reproduce SQL validation with the isolated runtime installed using `npm install --prefix .tmp/event-sql-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14`, then run `node docs/verification/event-sync-next-batch/validate-sql.mjs`. This dependency is separate from the application's package manifest and lockfile.
