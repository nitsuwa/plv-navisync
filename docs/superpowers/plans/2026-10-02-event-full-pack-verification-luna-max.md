# Event Full Pack Verification and Final Review — Luna / Max → Sol

> Run after implementation. Use `executing-plans`, `verification-before-completion` and correct browser-tool instructions. Record fresh case outcomes. No production writes, automatic commits, pushes, deployment, new chats or model changes.

**Implementation:** `docs/superpowers/plans/2026-10-02-event-full-pack-implementation-luna-max.md`.
**Implementation report:** `docs/2026-10-02-event-full-pack-implementation-report.md`.
**Design:** `docs/superpowers/specs/2026-10-02-event-full-pack-design.md`.
**Verifier:** User-selected GPT-6 Luna / Max.
**Final reviewer:** User later selects GPT-6.1 Sol / High or Medium.

## Readiness review from the implementation result (2026-10-02)

Luna may start independent local verification and scoped repairs now. Full staging acceptance requires a verified isolated project, installed migration history, dedicated role accounts, and a browser app explicitly connected to that same staging project. Missing prerequisites block their dependent cases, not the independent local checks.

- The implementation report records 8 focused suites / 51 tests and a successful production build. These are historical implementation results; rerun V1 and record fresh outputs.
- The expanded aggregate run failed: 112 tests passed and one map search-wheel test failed. Its isolated retry passed, which does not make the aggregate run pass. Reproduce under AUTO04 and repair the cause when confirmed.
- The reported 10 TypeScript diagnostics are filtered `CampusMapPage` output, not a count of all repository errors. Capture the full compiler output and exit code before repairs; retain baseline vs introduced classification with evidence.
- All 30 explicitly named test files in V1 currently exist, as does the event-component test directory. This path check is not a test run or a passing verdict.
- **ADM10 source gap repaired during this verification pass:** a visible → future schedule now shows a themed confirmation describing the temporary student-map hide. The regression was observed failing before the implementation change; keep ADM10's full lifecycle/database expectations for staging.
- **DB07/DB08 remain unexecuted high-risk regressions:** invalid/null review decisions and arbitrary nested `assetConfig.owner` disclosure were patched in source, but only client regressions ran. Exercise the actual SQL/RPC paths.
- **Preflight harness safety repaired locally:** the verifier now requires exact recorded owner, published-positive-control, and inactive disposable-probe event UUIDs; reads only the named probe; confirms it is approved, inactive, unarchived, and on the selected campus; sends a demonstrably stale revision; and compares the row plus event activity history after both denied-org and stale-admin commands. The probe remains mutation-shaped and has not been run against staging.

## Evidence

Report: `docs/2026-10-02-event-full-pack-verification-report.md`.
Sanitized logs/screenshots: `docs/verification/event-full-pack-2026-10-02/`.

Every case records role/environment, initial state/steps, expected/observed result, PASS/FAIL/BLOCKED, evidence and fix/retest. Historical checked boxes are not current observations. Mocks do not prove SQL; screenshots do not prove persistence; build does not prove TypeScript. A failing aggregate suite is still failed when isolated reruns pass.

## V0: Environment

- [ ] **ENV01:** Capture branch/HEAD/dirty paths and starting command results; preserve unrelated work.
- [ ] **ENV02:** Verify isolated DB/migration history/accounts before writes. Never use production as fallback.
- [ ] **ENV03:** Published campuses A/B with different floors, unpublished/coming-soon/archived fixtures; org A/B, admin A/B, ordinary student and anon guest.
- [ ] **ENV04:** E1 grounds+two building floors, E2 floor-only, E3 sharing E1 venue, legacy one-location event. Use event/location-distinct asset names.
- [ ] **ENV05:** Record canonical non-event map/snapshot/graph hashes and created fixture IDs, no private profile/secret export.
- [ ] **ENV06:** Viewports 1440x900, 1280x720, 768x1024, 390x844, 360x800, 320x568, 844x390 landscape; light/dark and touch run.
- [ ] **ENV07:** Launch the browser app with explicit staging `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy `VITE_SUPABASE_ANON_KEY` is a fallback). Restart the app and confirm Auth/RPC network requests target the allowed staging host. `EVENT_TEST_*` configures the verifier only; it does not redirect the Vite browser client. Never silently use `.env.local`, an already-running production-connected app, or mock mode for persistence/authorization proof.
- [ ] **ENV08:** Create/record a separate approved, inactive, unarchived disposable probe event ID on the selected staging campus. The repaired verifier requires this exact ID, a separate org A-owned event ID, and a known published-event ID; no fixture cleanup against arbitrary first rows or unknown IDs.

## V1: Fresh automated/build checks

Run from repo root. If an expected new test is missing, investigate rather than silently dropping it.

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__ src/components/map/__tests__/EventMapPanel.test.tsx src/components/map/__tests__/EventVenueLayer.test.tsx src/components/map/__tests__/EventPreviewLayer.test.tsx src/components/ui/__tests__/ThemedDateTimeField.test.tsx src/hooks/__tests__/useEventAutosave.test.tsx src/hooks/__tests__/useEventMapPreviews.test.tsx src/lib/__tests__/eventPublication.test.ts src/lib/__tests__/eventMapView.test.ts src/lib/__tests__/eventOverlayModel.test.ts src/lib/__tests__/eventLocationData.test.ts src/lib/__tests__/eventDraftPersistence.test.ts src/lib/__tests__/eventLayoutGeometry.test.ts src/lib/__tests__/eventLayoutPresets.test.ts src/lib/__tests__/eventLayoutValidation.test.ts src/lib/__tests__/eventSeating.test.ts src/lib/__tests__/eventProtectedAccess.test.ts src/lib/__tests__/eventPlacementGuides.test.ts src/lib/__tests__/eventGestureCoordinates.test.ts src/lib/__tests__/eventSubmissionTime.test.ts src/lib/__tests__/eventViewport.test.ts src/services/__tests__/eventOverlayService.test.ts src/services/__tests__/eventService.test.ts src/services/__tests__/campusService.test.ts src/services/__tests__/adminActivityPresentation.test.ts src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx src/pages/__tests__/StudentMyEventsAccess.test.tsx src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx src/components/layout/__tests__/PublicLayout.test.tsx --reporter=dot --maxWorkers=1
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Also run the harness-safety regression added during this pass:

```powershell
node node_modules/vitest/vitest.mjs run scripts/__tests__/event-full-pack-verifier-safety.test.ts --reporter=dot --maxWorkers=1
```

- [ ] **AUTO01:** Fresh totals/exit codes/failures/build warnings.
- [ ] **AUTO02:** Baseline vs introduced TypeScript errors; fix introduced diagnostics. Document compiler output cap if present.
- [ ] **AUTO03:** Source/browser audit native date/time/select and alert/confirm/prompt popups; ordinary text inputs are allowed.
- [ ] **AUTO04:** Cleanup/settings mocks/timers/async ordering; reproduce aggregate flakiness, no retries to conceal failures.
- [ ] **AUTO05:** No unrelated dependency/lockfile churn.

Retain full sanitized aggregate-test and compiler logs plus their actual exit codes. A PowerShell filter or logging pipeline succeeding is not proof that the underlying compiler/test command exited zero. In this already dirty workspace, compare dependency/lockfile changes to the recorded starting state; do not discard pre-existing changes just to make AUTO05 look clean.

## V2: Organization creation/editor

- [ ] **ORG01:** Published campus eligibility; campus switch changes floors; unpublished/coming-soon/archived absent.
- [ ] **ORG02:** Grounds+two floors, search/add/remove, duplicate prevention, switch cancel preserves, confirm clears stale.
- [ ] **ORG03:** No org dates/publication controls or payload fields; accurate confirmation campus/locations/count.
- [ ] **ORG04:** Cancel retains form; repeated confirm creates one draft; failure preserves inputs and no invalid navigation.
- [ ] **ORG05:** Per-location distinctive assets save/reload in actual DB with test local recovery cleared; no base-map change.
- [ ] **ORG06:** Viewport editor, navbar hidden only on editor route, no outer scroll; narrow/short controls usable.
- [ ] **ORG07:** Fixed new furniture dimensions; move/rotate, no resize field/handle/touch; legacy dimensions preserved.
- [ ] **ORG08:** All six Arrange actions with 2/3 unequal rotated assets and grouped/overlapping/edge cases; undo/redo; invalid fit no partial mutation.
- [ ] **ORG09:** 12 chairs/5 per row=5/5/2; invalid counts/noninteger/excessive/geometric fit reject atomically; no physical-capacity claim.
- [ ] **ORG10:** Tutorial target highlights precisely on desktop/mobile; Next/Back/Skip/Finish/Help/account isolation.
- [ ] **ORG11:** In-flight newer edits, save failure/retry, tab return and unsaved Back; canvas/camera/selection retained without full loading.
- [ ] **ORG12:** All-map submit summary, cancel, duplicate submit prevention; owner freeze pending/approved; rejected revision/duplicate strip protected fields.
- [ ] **ORG13:** Org B cannot access A's private URL/API/local recovery; schedule/approval bypass fails server-side.

## V3: Administrator

- [ ] **ADM01:** Pending Review has all layouts/read-only previews; no validation-bypassing approval action.
- [ ] **ADM02:** Themed controls on desktop/mobile/light/dark, no clipping/native popups.
- [ ] **ADM03:** Missing/invalid/impossible dates, start>=end, ended event, publication>=end, schedule<=serverNow rejected clearly.
- [ ] **ADM04:** Publish-now approval stores correct occurrence/server-publication, one activity, unchanged locations/layouts; reload proves persistence.
- [ ] **ADM05:** Future approval hidden before publication; admin Scheduled; actual transition from initially empty student list.
- [ ] **ADM06:** Disapproval trimmed comment/per-location feedback persists for owner, absent public feed.
- [ ] **ADM07:** Approved Manage publication prefills Manila; dates/layout read-only, no second Approve.
- [ ] **ADM08:** After-approval future→future schedule persists same event/status/layout; old time does not publish.
- [ ] **ADM09:** Future→Publish now visible within refresh bound.
- [ ] **ADM10:** Visible→future confirmation cancel unchanged; confirm hides until new time, history/approval retained.
- [ ] **ADM11:** Unpublish cancel/confirm/reload/republish; no deletion; ended cannot revive.
- [ ] **ADM12:** Two admins same revision: winner preserved, loser conflict; also concurrent approve/disapprove; one activity for winner.
- [ ] **ADM13:** Network/write/log failure no partial success; input retained; repeated click one write.
- [ ] **ADM14:** Venue overlap warning; adjacent times/different floors/campuses no false positives; failed conflict query disclosed.
- [ ] **ADM15:** Manila display/persisted instants including UTC-day rollover.

## V4: Student events and all requested locations

- [ ] **MAP01:** Off default; enabled trigger present even zero events; setting off clears layers without map break.
- [ ] **MAP02:** E1 one card/three locations; floor-only E2 discoverable outdoors; title/organizer/dates/text phase/count.
- [ ] **MAP03:** All/Ongoing/Upcoming filters, ongoing-first order, stable ties, empty states.
- [ ] **MAP04:** Same-panel details with all locations, no second blocking modal.
- [ ] **MAP05:** Grounds/building markers, shared venue count/chooser, correct event selection, no unreadable duplicates.
- [ ] **MAP06:** Grounds→floor A→floor B→grounds: correct authored map/assets, no nonrequested-floor furniture or indoor chairs outdoors.
- [ ] **MAP07:** One full layout; choose E3 removes E1 assets rather than combines them.
- [ ] **MAP08:** Correct transform/anchors through zoom/pan; >=44 CSSpx touch targets.
- [ ] **MAP09:** Legacy one-location normalization after valid publication, saved dimensions retained.
- [ ] **MAP10:** Long details, broken poster, many events/locations, empty assets and missing published floor; scrolling/clear unavailable state.
- [ ] **MAP11:** Close removes markers/assets/details and returns focus, preserves route and explicit floor choice.
- [ ] **MAP12:** Campus/account switches and late responses never restore wrong events/selection.

## V5: Desktop/mobile and normal navigation

- [ ] **UX01:** Desktop compact dock/internal scroll; map/search/zoom/navigation reachable.
- [ ] **UX02:** Mobile Peek/List/Expanded, landscape, safe areas, reachable Close/Collapse/location action and exposed pannable map.
- [ ] **UX03:** No horizontal overflow at 320px, full-map scrim or nonmodal background lock.
- [ ] **UX04:** One panel with building/directions/account; open directions closes Events and retains route.
- [ ] **UX05:** Active route survives toggle/filter/details/refresh/close; path/destination/accessibility/camera not reset.
- [ ] **UX06:** Explicit location viewing changes displayed map/floor only, not graph or route start/end.
- [ ] **UX07:** Keyboard focus/filter/Tab/Enter/Space/Escape; nearest event control closes before map floor exit; input avoids map shortcuts.
- [ ] **UX08:** Light/dark, long labels, 200% browser zoom; visible focus/readable badges.
- [ ] **UX09:** Touch pan/pinch outside sheet, internal list scrolling and marker taps; no accidental map gestures from controls.

## V6: Actual timing/refresh

Use short staging schedules and record server instants plus observation times. Fake-clock tests supplement, not replace real cases.

- [ ] **TIME01:** Initially empty foreground list populates after publication within 30 seconds plus request time; no reload/deploy/manual refresh.
- [ ] **TIME02:** Upcoming→Ongoing at start; selected event assets/details/markers expire at end; base map mounted.
- [ ] **TIME03:** Other-client admin unpublish/future-reschedule propagates within bound without reapproval.
- [ ] **TIME04:** Hidden tab crosses time boundaries; return refresh correct state without full-map loading.
- [ ] **TIME05:** Client clock +/-2 hours compensated by serverNow; DB does not use client visibility clock.
- [ ] **TIME06:** Empty polling, close/unmount cleanup, no whole-campus refetch; feature disable immediate clear.
- [ ] **TIME07:** Network error clears stale previews, Retry recovers current public events only; map usable.

## V7: Executed Supabase security/persistence

After ENV checks and the harness repair, verify the applied schema/migration history and install only the missing forward migrations through the project's existing migration process. Inspect the pending `20260930140000_event_publication_visibility.sql` and `20261002090000_event_publication_management.sql` against that history; do not blindly replay the bootstrap schema or migrations already applied. If PostgreSQL tooling or a verified SQL-editor session is unavailable, mark execution blocked and continue local checks.

Required preflight process environment (never put values or passwords in the report):

| Variable | Required value/source |
| --- | --- |
| `EVENT_TEST_ENVIRONMENT` | `staging` |
| `EVENT_TEST_ALLOW_WRITES` | `staging-only`; explicit isolated-target confirmation, not evidence that an RPC cannot write |
| `EVENT_TEST_ALLOWED_PROJECT_REF` | Exact allowed hosted Supabase project reference |
| `EVENT_TEST_SUPABASE_URL` | HTTPS URL for exactly that reference |
| `EVENT_TEST_SUPABASE_PUBLISHABLE_KEY` | That project's publishable/anon key; no secret/service-role key |
| `EVENT_TEST_CAMPUS_ID` | Recorded published staging campus UUID |
| `EVENT_TEST_EXPECT_ORG_A_EVENT_ID` | Exact private event row owned by org A; admin and org A positive controls, student/anon/org B denial checks |
| `EVENT_TEST_ADMIN_EMAIL`, `EVENT_TEST_ADMIN_PASSWORD` | Dedicated active admin A |
| `EVENT_TEST_STUDENT_EMAIL`, `EVENT_TEST_STUDENT_PASSWORD` | Dedicated active ordinary student |
| `EVENT_TEST_ORG_A_EMAIL`, `EVENT_TEST_ORG_A_PASSWORD` | Dedicated active organization A |
| `EVENT_TEST_ORG_B_EMAIL`, `EVENT_TEST_ORG_B_PASSWORD` | Separate active organization B |
| `EVENT_TEST_PROBE_EVENT_ID` | Separate approved, inactive, unarchived disposable probe event on the selected campus; never inferred from a list query |
| `EVENT_TEST_EXPECT_PUBLISHED_EVENT_ID` | Required known visible event in this positive-control run so an empty feed cannot prove public visibility |
| `EVENT_TEST_DATABASE_URL` | Private connection to the verified isolated DB for SQL assertions |

Admin B needs a separate authenticated client/browser session for ADM12; the current preflight does not consume a second administrator's credentials. Anonymous means an unauthenticated client, not a provisioned account. The current verifier accepts hosted `https://<project-ref>.supabase.co` only and refuses localhost; local SQL checks do not substitute for the hosted-staging JWT/browser run or justify weakening this guard. The verifier now requires an exact org A-owned raw-row positive control, verifies admin and owner can read it, then verifies anonymous/student/unrelated org B cannot; unknown query errors do not count as denials. Its command-shaped checks only target the separate, recorded inactive disposable probe and compare both event and activity rows before/after.

Run the assertions only after the migrations are installed on the verified test target:

```powershell
psql "$env:EVENT_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/event_publication_assertions.sql
psql "$env:EVENT_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/event_publication_management_assertions.sql
node scripts/verify-event-full-pack.mjs
```

The SQL files cover helper/projection/grant contracts; the verifier covers identities, limited raw-read/feed isolation, denied org publication, and a stale-command probe. Neither executes the complete authenticated creation/approval/publication lifecycle, successful concurrent writes, or navigation/UI cases. Run those separately and attach case-level evidence. A setup/connectivity/missing-function error does not count as an authorization denial. Establish positive controls: admin/owner can read the exact recorded row, a known published event is present, and clients target the same campus/project; then test denied access to those exact IDs with the expected response/code. Compare before/after state even when a forbidden RPC returns an error.

- [ ] **DB01:** Installed migrations/verified target/errors exit nonzero; no credentials logged.
- [ ] **DB02:** Raw known event IDs private to owner/admin; ordinary student/anon/unrelated org no private data; public feed allowlisted.
- [ ] **DB03:** Visibility matrix draft/pending/rejected/inactive/future/ended/malformed/missing-date/missing-publication hidden; valid Upcoming/Ongoing visible, exact campus.
- [ ] **DB04:** Guest public RPC works without broad anon table grants; guest and student actual browser runs.
- [ ] **DB05:** Direct forbidden date/publication/status/review/ownership/campus/classification changes fail, including null/missing JSON.
- [ ] **DB06:** Legitimate owner draft edit/submit/rejected revision works; frozen owner update/delete and unrelated B mutations denied; admin works.
- [ ] **DB07:** Server invalid-schedule and invalid/null review-decision rejection (expected validation error, unchanged row/activity); atomic 40001 CAS with actual admin A/B concurrent successful-vs-stale calls; final row/activity winner only. A stale probe alone does not prove concurrent-write safety.
- [ ] **DB08:** No creator/adminComment/locationFeedback or arbitrary primitive `assetConfig.owner` in the actual public RPC, including nested location/furniture/label/marker shapes; allowlisted string `style` retained, unknown/nested config removed. Legacy normalization safe and no wrong-floor substitution.
- [ ] **DB09:** Projection strips embedded events only; non-event geometry/order and historical storage unchanged; absent/null paths safe.
- [ ] **DB10:** Safe campus RPC excludes draft/unpublished/coming-soon/archived; latest eligible only; lifecycle permissions unchanged.
- [ ] **DB11:** Fresh no-cache reload proves real saves/approval/publication/all locations, not mock/local recovery.
- [ ] **DB12:** Search_path/definer/grants/active-role checks/activity atomicity; no server keys in frontend/bundle/evidence.
- [ ] **DB13:** Direct public RPC enforces future-reschedule/unpublish/expiry independently of UI filters.
- [ ] **DB14:** Before/after base/non-event/graph hashes match; cleanup recorded fixtures only.

## V8: Repair and Luna verdict

- [ ] Record failure reproduction/severity/cause/files. Add regression, observe fail, fix scoped behavior, rerun original scenario.
- [ ] Rerun final full commands/build/TypeScript/diff after edits; report remaining aggregate failures honestly.
- [ ] Report separate automated, browser, database, integrated, physical-calibration and deployment verdicts.
- [ ] **VERIFIED IN STAGING** only with all required real integrated checks passing; **PARTIALLY VERIFIED** for blocked prerequisites; **NOT READY** for required behavior/security failures.
- [ ] Include where to see/test org creation, admin approve/schedule/manage/unpublish and student Events/all locations.
- [ ] Production migration/commit/push/deploy remain separate not-performed actions unless user later requests.

| Case | Role/environment | Initial state/steps | Expected | Observed | PASS/FAIL/BLOCKED | Evidence | Fix/retest |
| --- | --- | --- | --- | --- | --- | --- | --- |

## S: Independent Sol final review

User switches model and submits handoff; this plan does not message/create a model/chat automatically.

- [ ] **SOL01:** Read design/plans/reports; inspect actual diff, not just Luna narrative.
- [ ] **SOL02:** Verify scope/dirty-tree preservation and whole-event/multi-location contracts.
- [ ] **SOL03:** Independent SQL/RLS/trigger/CAS/definer/grant review; rerun real high-risk roles; identify blocked checks.
- [ ] **SOL04:** Reproduce publish-now, empty-list scheduled release, after-approval reschedule/unpublish and all-location viewer.
- [ ] **SOL05:** Actual desktop/mobile interactions/screenshots: one panel, correct floors, no scrim, normal navigation.
- [ ] **SOL06:** Rerun affected tests/build/diff, scrutinize TypeScript baseline and aggregate instability.
- [ ] **SOL07:** Evidence proves outcomes rather than matching implementation or relying on service-role access.
- [ ] **SOL08:** Write `docs/2026-10-02-event-full-pack-sol-review.md` with severity-ranked findings/reproduction/evidence/blockers/verdict. Fix confirmed event defects with regressions where authorized and rerun affected checks.
- [ ] **SOL09:** No production-ready verdict with unexecuted authorization/time tests or unexplained required failures. Staging is not live deployment.

## Copy/paste: Luna fresh verification

```text
Use the user-selected GPT-6 Luna with Max effort. Execute docs/superpowers/plans/2026-10-02-event-full-pack-verification-luna-max.md after reading its readiness review, approved design and implementation report. Start independent local checks now; record unavailable staging/browser cases as BLOCKED without abandoning available work. Do not convert an aggregate failure into PASS because an isolated retry passed. Reproduce and repair the visible-to-future publication confirmation gap at ADM10; harden the stale-CAS preflight to target only a recorded disposable fixture before using it. Bind the Vite browser client explicitly to the same verified staging project as the verifier. Run every available case from fresh state with actual desktop/mobile browser interaction and isolated Supabase anon/student/org/admin role clients. Do not reuse old PASS boxes or treat mocks/builds/preflight as end-to-end proof. Verify time boundaries, initially empty publication, after-approval reschedule/unpublish/republish, actual two-admin conflicts, null review decisions, nested asset allowlisting, all requested locations, one layout and navigation preservation, plus creation/editor regressions. Fix confirmed defects with regressions and rerun failed scenarios. Preserve unrelated changes; no commit/push/deploy/production mutation/model changes. Write docs/2026-10-02-event-full-pack-verification-report.md with case-level PASS/FAIL/BLOCKED and sanitized evidence. Prepare independent Sol review and state blockers honestly.
```

## Copy/paste: Sol final checking

```text
Use the user-selected GPT-6.1 Sol with High or Medium effort for independent checking. Read docs/superpowers/specs/2026-10-02-event-full-pack-design.md, both 2026-10-02 event-full-pack plans, and implementation/verification reports. Inspect actual diff/tests/SQL/browser evidence and execute Task S. Independently verify high-risk review/publication/reschedule/unpublish, student all-location viewing, database authorization/allowlisting/CAS and nonmodal mobile/desktop UI with navigation preserved. Fix confirmed event defects with regressions when possible and rerun affected checks. Preserve unrelated work; no production writes, automatic commits/push/deploy. Write docs/2026-10-02-event-full-pack-sol-review.md with severity-ranked findings/evidence/blockers/verdict. Claim integrated functionality only when real browser/database tests support it; distinguish baseline diagnostics, physical calibration and deployment.
```
