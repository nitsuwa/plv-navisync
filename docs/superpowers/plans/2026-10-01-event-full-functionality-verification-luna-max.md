# Event Full Functionality Verification Plan — Luna / Max

> **For agentic workers:** Use the available `executing-plans` skill to execute this plan task by task. Use checkbox tracking. Run in the current chat/workspace; this document does not authorize creating another chat, production database changes, pushes, or deployment.

**Goal:** Determine whether the entire event feature works through real student organization, administrator, student, guest, browser, and database flows; fix confirmed event defects and report evidence and remaining blockers.

**Architecture:** Verify three layers independently: pure/application tests, real browser workflows, and Supabase authorization/persistence. Connect those layers using the same uniquely named test events. A mocked database response or successful Vite build cannot establish real database behavior.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Supabase/Postgres, existing themed UI, browser automation available to the executing agent.

**Intended executor:** Luna model with Max reasoning, selected by the user in the current chat. Do not change model settings or dispatch another task automatically.

## Global constraints

- Focus on the event feature and necessary shared integration points.
- Preserve every existing local change. The working tree contains substantial prior event work and unrelated edits. Do not reset, stash blindly, stage everything, or overwrite another change.
- Student organizations do not set event start/end or publication dates. Administrators set those during review.
- Event date/time/calendar/select dialogs must use the system theme. Do not introduce native date, time, datetime-local, select popups, alert, confirm, or prompt dialogs in event workflows.
- Use Asia/Manila for user-facing dates; save valid ISO timestamps consistently.
- Published campus/base map geometry remains unchanged by event editing and review.
- Keep normal student navigation available when an Event Map preview is enabled.
- Fixed canvas asset dimensions and geometric chair fit do not establish physical venue capacity. Real-world calibration requires measured scale and venue data.
- Use isolated local/staging data and test accounts for writes. Identify and verify the database target before any database mutation. Do not touch production under this verification plan.
- Read `supabase-postgres-best-practices` before changing migrations, SQL functions, policies, or SQL tests. Read browser tooling instructions before browser automation.
- Missing database access or unavailable browser automation is a recorded blocker, never a passed check.
- Do not commit, push, or deploy under this plan. Make fixes reviewable in the local diff and report them.

## Evidence and files

Create the report at `docs/2026-10-01-event-full-functionality-verification-report.md`. Store sanitized screenshots/log excerpts under `docs/verification/event-2026-10-01/`. Do not capture credentials, tokens, personal student data, or environment file contents.

For each case record: case ID, tested role/environment, initial state, steps, expected result, actual result, PASS/FAIL/BLOCKED, evidence path, and any fix/retest. Every passed workflow must have observed behavior, not only a source-code reference.

Inspect and modify only when a confirmed defect requires it:

| Area | Relevant source | Existing tests / possible added test |
| --- | --- | --- |
| Proposal and campus/location selection | `src/components/events/EventProposalModal.tsx`, `EventLocationPicker.tsx`, `EventLocationSwitcher.tsx`, `src/pages/StudentMyEventsPage.tsx`, `src/lib/eventLocationData.ts` | Tests under `src/components/events/__tests__/`; `src/pages/__tests__/StudentMyEventsAccess.test.tsx` |
| Editor, Arrange, furniture, seating | `src/components/events/EventFloorEditor.tsx`, `EventItemInspector.tsx`, `eventAssets.tsx`, `src/lib/eventLayoutGeometry.ts`, `eventLayoutPresets.ts`, `eventLayoutValidation.ts` | `EventFloorEditor.test.tsx`, `EventItemInspector.fixed.test.tsx`, `src/lib/__tests__/eventLayoutGeometry.test.ts`, `eventSeating.test.ts`, `eventProtectedAccess.test.ts` |
| Save/refresh/isolation | `src/pages/StudentEventEditPage.tsx`, `src/hooks/useEventAutosave.ts`, `src/lib/eventDraftPersistence.ts`, `src/components/layout/PublicLayout.tsx` | `StudentEventEditPage.pendingDraft.test.tsx`, `useEventAutosave.test.tsx`, `eventDraftPersistence.test.ts`, `PublicLayout.test.tsx` |
| Tutorial and submission | `src/components/events/EventEditorTutorial.tsx`, `EventSubmissionReview.tsx` | Corresponding component tests |
| Admin dates, approval, publication | `src/pages/AdminEventLayoutsPage.tsx`, `src/components/ui/ThemedDateTimeField.tsx`, `src/services/eventOverlayService.ts`, `src/lib/eventPublication.ts` | Existing service/publication/date-field tests; create `src/pages/__tests__/AdminEventLayoutsPage.review.test.tsx` if review interaction coverage is missing |
| Student preview and navigation | `src/pages/CampusMapPage.tsx`, `src/components/map/EventPreviewLayer.tsx`, `EventInfoPanel.tsx`, `src/services/campusService.ts` | `CampusMapPage.eventOverlayService.test.tsx`, `EventPreviewLayer.test.tsx`, `campusService.test.ts` |
| Database protections | `supabase/migrations/20260930140000_event_publication_visibility.sql`, prior schema/event migrations | `supabase/tests/event_publication_assertions.sql`; create `supabase/tests/event_publication_roles_assertions.sql` for actual role/trigger checks if needed |

## Task 1: Establish the baseline and test environment

- [x] Run `git status --short`, `git diff --stat`, and `git diff --check`. Record branch/HEAD and existing edits without exposing secret files. Keep a list of files changed during this verification so the final report distinguishes newly fixed issues from prior work. Branch `main`, HEAD `869d9957`; the working tree was already substantially modified. No secret values were printed.
- [x] Read applicable `AGENTS.md`, current event source, `package.json`, and `docs/2026-09-30-event-feature-testing.md`. Treat that older guide as historical: its instructions for student-set event dates are superseded by this plan. No repository `AGENTS.md` was found.
- [x] Discover installed Node/package manager/browser/Supabase/Postgres tooling. Do not install a CLI or reset a database merely to make a test run. Node and pnpm are present, local Vite is running, and CUA browser automation is available; Supabase CLI, psql, Docker, and `supabase/config.toml` are absent.
- [x] Identify whether the app is using demo data or real Supabase. Record the environment without printing keys. A demo-only run does not verify persistence or role protection. `.env.local` points to a remote Supabase host; the value was not printed.
- [ ] Identify a disposable local or staging database. The checkout previously lacked `supabase/config.toml`; confirm current state and configure an isolated local setup or use an already configured staging connection. Inspect migration history and the canonical baseline before applying anything: this repo includes legacy and baseline migration files, so blindly replaying all SQL is unsafe.
- [ ] Prepare two published campuses with different buildings/floors, one unpublished campus, one archived campus, two student organization accounts (A/B), an admin, an ordinary student, and a guest context. Create fixtures only in the verified test environment.
- [ ] Capture a base-map snapshot/hash before event edits. Seed authored doorway/access geometry for obstruction checks. Missing authored access geometry must be reported as a limitation.

**Deliverable:** Known environment, reusable fixtures, preserved local changes, and explicit database/browser blockers.

## Task 2: Run automated baseline checks

Run from the repository root in PowerShell. Use the installed runtime; preserve full exit codes and concise failure output.

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__ src/components/ui/__tests__/ThemedDateTimeField.test.tsx src/hooks/__tests__/useEventAutosave.test.tsx src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventSeating.test.ts src/lib/__tests__/eventProtectedAccess.test.ts src/lib/__tests__/eventPlacementGuides.test.ts src/lib/__tests__/eventPublication.test.ts src/lib/__tests__/eventOverlayModel.test.ts src/lib/__tests__/eventLocationData.test.ts src/lib/__tests__/eventDraftPersistence.test.ts src/lib/__tests__/eventSubmissionTime.test.ts src/lib/__tests__/eventGestureCoordinates.test.ts src/lib/__tests__/eventViewport.test.ts src/services/__tests__/eventOverlayService.test.ts src/services/__tests__/eventService.test.ts src/services/__tests__/campusService.test.ts src/pages/__tests__/StudentMyEventsAccess.test.tsx src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx src/components/layout/__tests__/PublicLayout.test.tsx --reporter=dot --maxWorkers=1
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

- [x] Verify paths still exist and adapt commands only to actual current files. Record test totals and failures from this run; do not reuse historical totals. See the verification report; aggregate Campus Map failures were intermittent and did not reproduce in the isolated file run.
- [x] Record TypeScript failures separately. Vite building successfully does not imply TypeScript is clean. Establish whether diagnostics were present before this verification and whether touched event files introduce new ones. The global output remains capped at 1,000; event-specific files changed here have no diagnostics. Existing diagnostics remain in the already-modified shared `CampusMapPage.tsx`.
- [x] For confirmed event failures, add a regression for the user-visible failure, observe it fail, make the smallest fix, and rerun relevant checks. Avoid asserting implementation details instead of observable behavior. The campus-picker regression failed while the native select was present and passed after switching to the themed Select.

**Deliverable:** Fresh automated baseline, with existing versus introduced failures distinguished.

## Task 3: Proposal and location selection in the browser

- [ ] **C01:** Sign in as organization A. Create event; verify only published eligible campuses are selectable. Select campus A and then B; building/floor options must follow the chosen campus. Unpublished/archived campuses must be absent.
- [ ] **C02:** Select grounds plus two floors. Add/remove/search locations; duplicates cannot be added. Switch campus and cancel clearing incompatible locations: selections must remain. Confirm switching: stale floor IDs must be removed.
- [ ] **C03:** Verify student organization event forms contain no event start/end/publication controls. Inspect request payloads as well; approval metadata must not be inherited or assigned by creation.
- [ ] **C04:** Leave title/required information or locations missing; no proposal is created. Valid selections open a confirmation summary with the correct campus, building, floor, and location count before entering the designer.
- [ ] **C05:** Cancel confirmation and verify inputs remain. Confirm using rapid repeated clicks: exactly one draft is created, with all selected locations, not duplicate proposals.
- [ ] **C06:** Simulate failed creation/save; show an actionable error, retain inputs, and avoid navigation to a nonexistent event.

**Deliverable:** One persisted multi-location test draft and evidence for C01–C06.

## Task 4: Map editing, asset sizing, Arrange, and seating

- [ ] **E01:** Enter the designer. The site navbar is hidden; Back is the route exit; editor Save/Submit/Help controls remain usable. The map fills the available viewport and the document does not scroll outside it. Verify a narrow mobile viewport and desktop.
- [ ] **E02:** Add furniture/labels on each location, switch locations and return, save/reload. Each location retains its own assets; base-map geometry and other campuses remain unchanged.
- [ ] **E03:** Furniture supports movement/rotation but no resizing via handles, inspector, keyboard, or touch controls. New chairs use fixed sizes consistently. Legacy saved dimensions survive opening/reloading. Labels retain intentional formatting controls.
- [ ] **E04:** Details is compact/collapsible, opens for the intended selection, closes predictably, and does not permanently consume the map width. Test multi-selection and mobile UI.
- [ ] **E05:** Select two then three unequal-size assets, including an item rotated 90 degrees and another rotated 30 degrees. Run all six Arrange actions, undo between runs: visible left edges match; horizontal centers share a vertical line; visible tops match; vertical centers share a horizontal line; horizontal distribution forms an even row; vertical distribution forms an even column. Sizes/rotations and unselected assets remain unchanged.
- [ ] **E06:** Repeat Arrange near each map edge, with overlapping items and grouped selections. Gaps must not be negative; fully containable items must remain within bounds. If the selection cannot fit, give clear feedback or leave it unchanged; record silent no-ops as a usability defect. Undo/redo must restore positions exactly and saves must persist the result.
- [ ] **E07:** Arrange 12 chairs with 5 per row: expect 5/5/2, smaller consistent chairs, predictable spacing/rotation and a preview. Test 0, negative, noninteger, excessive counts, rows exceeding total chairs, and a valid count that cannot geometrically fit.
- [ ] **E08:** Attempt placement off-map, overlapping furniture, or blocking an authored doorway/access region. Reject invalid placement atomically with useful feedback; no partial chairs are added. A valid nearby placement works after the error.
- [ ] **E09:** Test select/pan, zoom, snap and spacing/alignment guides, rotate/group/ungroup/duplicate/delete, keyboard shortcuts and undo/redo. Typing in an input must not trigger canvas delete/shortcuts.

**Deliverable:** All Arrange actions and editor operations observed in-browser, plus persisted location isolation.

## Task 5: Autosave, tab switching, tutorial, and submission

- [ ] **S01:** Edit while a manual save is in flight under network throttling. The newer edit remains dirty and is subsequently saved; an older response must not overwrite it. Save failure preserves work and allows retry.
- [ ] **S02:** Alt-tab/switch browser tabs repeatedly while editing. The canvas is not replaced by a loading screen and assets/selection/viewport remain usable. Check focus refresh network behavior, not only screenshots.
- [ ] **S03:** Reload/close and reopen a saved draft; verify actual database persistence separately from local draft restoration. Test Back with unsaved work and account switching so organization B cannot restore A's local draft.
- [ ] **S04:** First use shows the tutorial per account. Each step spotlights the exact element discussed: locations, Furniture/asset palette, Arrange or relevant plotting controls, Details/Objects, Save/status, Submit. Highlight and popover do not obscure the target. Test Next/Back/Skip/Finish, Help replay, mobile resizing and tool restoration.
- [ ] **S05:** Submit a valid multi-location proposal. The summary includes every map and correct furniture/label counts. Cancel retains work; repeated confirmation submits once. Empty/critical layouts block submission with the offending location identified.
- [ ] **S06:** Submitted proposals obey edit restrictions. Organization B cannot read/edit A's private draft by guessing its URL. Duplicating a proposal produces a new owned draft with layouts but without inherited approval, schedule, publication, or admin feedback.

**Deliverable:** Stable saves and one submitted multi-location proposal.

## Task 6: Admin review, themed scheduling, and persistence

- [ ] **A01:** Admin sees pending proposals and all requested locations/counts. Open read-only previews for every map; review cannot mutate furniture/base maps.
- [ ] **A02:** Event start/end fields use custom themed controls on desktop/mobile. No native browser picker appears. Event dates belong exclusively to admin review. Long labels/calendar popovers must be readable and unclipped.
- [ ] **A03:** Empty dates/times, malformed 24-hour time, end equal to/before start and expired event end cannot be approved. The disabled action and validation explain what is missing. Choose valid times such as 09:00 and 17:00 and verify the stored ISO instants represent Asia/Manila correctly.
- [ ] **A04:** Publish now after approval: save valid schedule, approve once, inspect persisted metadata and reload. Status is approved, dateStart/dateEnd are correct, publicationAt reflects approval time. Failed writes leave the review open and do not show a success toast.
- [ ] **A05:** Schedule publication: selecting it reveals the themed Publish on field; missing/invalid timestamp blocks approval. Publication at/after event end is rejected. Approve a future publication timestamp a few minutes ahead and verify it survives reload.
- [ ] **A06:** Set distinct feedback for both locations. Disapproval requires a meaningful comment; feedback persists and organization A can read it. Blank/whitespace comments cannot satisfy the requirement.
- [ ] **A07:** Compare two approved events at the same campus/location with overlapping intervals: warn clearly. Adjacent nonoverlapping times, different campuses, and different floors must not falsely conflict. A failed conflict query must display its uncertainty.
- [ ] **A08:** Test repeated approval, double clicks, a proposal already reviewed by another admin, and stale review data. Prevent duplicate review side effects or silent overwrite of a conflicting decision.

**Deliverable:** Browser and persisted evidence for immediate approval, scheduled approval, disapproval, and review validation. Add review-modal interaction tests if only service tests exist.

## Task 7: Real Supabase publication and authorization checks

- [ ] **D01:** Read the migration, prior schema/policies and existing assertions. Identify dependencies including `public.is_admin()`, auth roles, map_elements, campus_versions and campuses. Confirm the isolated target and migration history. Apply the event migration once through that environment's established migration process.
- [ ] **D02:** Execute the existing assertions with SQL errors causing a nonzero exit. If psql and a verified test connection are available, use the following without logging connection details:

```powershell
psql "$env:EVENT_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/event_publication_assertions.sql
```

- [ ] **D03:** Expand real role tests: anonymous, ordinary student, organization owner A, unrelated organization B, admin, and trusted server/service role. Use real JWT-backed requests or transaction-scoped role/JWT claims in the isolated database. Service-role-only queries do not verify student RLS. Roll back SQL fixtures or remove only recorded test-created data.
- [ ] **D04:** For anon/student/B, directly query event rows by known IDs. Draft, pending, disapproved, inactive, future-publication, ended and malformed/undated approved events must remain hidden. A valid approved published event is visible. Owner A and admin retain appropriate private-review access.
- [ ] **D05:** Owner A attempts direct approval/disapproval, publication timestamp/date modification, owner/campus reassignment, review feedback changes, and editing approved data. Verify admin-only schedule policy at the database layer, not just disabled UI. Attempt to bypass protection by changing/removing element_type or metadata.kind/status or by using null/missing JSON values. Non-owner B cannot update/delete A's proposal.
- [ ] **D06:** Direct admin approval rejects missing/invalid dates, end <= start, or publication >= end. Verify malformed metadata fails safely and cannot accidentally expose an event.
- [ ] **D07:** Query published-campus RPC/snapshots as anon/student. Historical snapshots containing draft events must not leak them. The safe projection must preserve base-map geometry and provide the published campus normally. Check grants and returned campus eligibility; retain compatibility fallback only as compatibility, not proof of security.
- [ ] **D08:** After any SQL fix rerun existing assertions plus role/trigger tests, then rerun browser approval and student preview against that database. Record database version, target type, migration applied, test counts and sanitized outcomes.

**Deliverable:** Executed database evidence. If access/tooling is unavailable, mark D01–D08 BLOCKED, identify precisely what is missing, and continue independent browser/code checks. Never claim fully functional publication security with this task blocked.

## Task 8: Student Event Map visibility and navigation

- [ ] **V01:** As ordinary student, toggle Event map on/off. Preview is optional and normal campus/building/floor navigation, routing, zoom and accessible controls still work.
- [ ] **V02:** Immediately published approved event appears with short title, organizer, event start/end and requested locations. All approved location layouts can be viewed without editing them. Student view must never offer plotting/review controls.
- [ ] **V03:** Using a fresh student/guest session, confirm a future scheduled event is absent before publication. Observe the actual transition when wall-clock time reaches publication without deploying a scheduler workaround. Capture the documented refresh delay and verify by toggle/focus and background refresh.
- [ ] **V04:** An open event disappears or clearly expires at event end; the navigation/map remains stable. Inactive/disapproved events stay absent. Check campus switching and floor previews for leakage across campuses.
- [ ] **V05:** Test network failure/stale cache. No future or expired event remains erroneously visible. A student cannot fetch private layouts through a guessed URL or direct Supabase request even if the UI hides them.

**Deliverable:** One real approval-to-student-preview workflow for publish-now and one for scheduled publication, backed by database checks.

## Task 9: Fix confirmed failures and deliver the verdict

- [x] For each confirmed failure record a reproduction, affected role, severity, root cause, source/test files and scope. Fix only event-related defects; preserve existing local edits. See the verification report.
- [x] Verify the reproduction fails before the fix where practical, add meaningful regression coverage, implement the minimal fix, and repeat that browser/database scenario afterward. The picker regression went red before the UI change, then passed focused tests and the campus switch was verified in the unsaved browser flow.
- [x] Run the affected focused suite, all event baseline tests from Task 2, production build, TypeScript check and diff check after the final change. Results, including aggregate test instability, are recorded in the report.
- [x] Recompare the base-map snapshot/hash and verify no production/test account data was accidentally modified. Clean up only specifically recorded test-owned fixtures; preserve useful sanitized evidence. No map editor or database write was performed, so no map or server data changed; the unsaved browser-only proposal was discarded.
- [x] Finish `docs/2026-10-01-event-full-functionality-verification-report.md` with the following columns and explicit verdicts:

| Case | Role/environment | Expected | Observed | PASS / FAIL / BLOCKED | Evidence | Fix/retest |
| --- | --- | --- | --- | --- | --- | --- |

- [x] State separate verdicts for automated checks, real browser workflows, Supabase authorization/persistence, physical capacity calibration and release/deployment status. Describe any current gap without disguising it as a passed check.
- [x] Include changed files, where the user can see each fix, exact manual retest steps and current command results. Identify baseline TypeScript/build warnings separately.
- [x] Give an overall verdict of VERIFIED only if every required event case passes in the actual integrated test environment. If any browser/database case is unavailable or failing, say PARTIALLY VERIFIED or NOT READY and name the outstanding cases.

**Physical capacity:** Report UNCALIBRATED unless measured per-map scale, asset footprints, aisle clearances and approved venue limits were supplied and validated. Do not invent these values or present a 500-chair input limit as a venue capacity.

**Release status:** Successful local/staging verification does not mean the change is live. Record that production migration, push and deployment remain separate actions unless explicitly requested later.

## Copy/paste handoff for Luna / Max

```text
Use Luna with Max reasoning in this existing chat. Read and execute docs/superpowers/plans/2026-10-01-event-full-functionality-verification-luna-max.md. Verify the entire event feature through student org creation/design/submission, admin review/scheduling, student Event Map viewing, saves, all Arrange actions, themed controls, tutorial highlights and real Supabase authorization. Preserve the current dirty working tree. Use isolated test accounts/database, and fix confirmed event defects with regressions. Do not call mocked tests or a Vite build end-to-end proof. Do not change production data, commit, push or deploy. If database/browser access is missing, record the exact blocked cases and continue independent checks. Produce docs/2026-10-01-event-full-functionality-verification-report.md with PASS/FAIL/BLOCKED evidence, actual test results, fixes, where to see them and manual retest steps. Admin alone sets event dates/publication; real-world capacity stays uncalibrated without measured data. Finish only after completing every available check and reporting remaining blockers honestly.
```
