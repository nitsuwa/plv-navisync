# Event feature verification report

**Date:** 2026-10-01

**Verdict:** **PARTIALLY VERIFIED — NOT READY to claim full end-to-end functionality.**

**Scope:** Student organization proposal UI, event map tooling, admin review/publication, student preview, and Supabase protections in the supplied plan.

## What changed during this verification

The proposal's **Published campus** field was still a native browser `<select>`, which violated the system's themed-control requirement. I replaced it with the shared themed Radix Select, preserved the confirmation before clearing selected locations, and added regression coverage for changing campuses and building lists. The regression failed against the old native picker and passed after the fix.

Files changed for this verification:

- [EventProposalModal.tsx](../src/components/events/EventProposalModal.tsx)
- [EventProposalModal.test.tsx](../src/components/events/__tests__/EventProposalModal.test.tsx)
- [browser-observations.md](verification/event-2026-10-01/browser-observations.md)
- This report

The two source/test files were already locally modified before this verification began. Only the campus-picker portion and its regression coverage were added here. The repository also contains many other pre-existing local changes; none were reset, stashed, or staged.

## Verification results

| Case | Role/environment | Expected | Observed | Status | Evidence | Fix/retest |
| --- | --- | --- | --- | --- | --- | --- |
| Automated event suite | Local | Event regression suite passes | Before the fix: 34 files / 283 tests passed. After the fix: proposal file passed 12/12. Two post-fix aggregate runs each had failures in the Campus Map test file (first 1 failure, then 2). Between them, the previously failing toggle test passed alone and its full 18-test file passed. | BLOCKED (aggregate instability) | [Automated-check evidence](verification/event-2026-10-01/automated-checks.md) | Investigate nondeterministic Campus Map test failures; the changed proposal file is green |
| C01 campus choice | Demo Student Org, local UI backed by remote Supabase | Only eligible campuses; each campus shows its own buildings/floors | Themed picker showed three choices. Switching campuses changed the building/floor list. Eligibility of unpublished/archived campuses could not be established from this account. | BLOCKED (eligibility) | [Browser observations](verification/event-2026-10-01/browser-observations.md) | Verify with staged published, unpublished, and archived fixtures |
| C02 campus-change safeguard | Demo Student Org, unsaved modal | Cancel preserves prior locations; confirm clears incompatible locations | Selected floor remained after **Keep campus**. **Change and clear** selected the new campus and removed the old floor. Grounds plus two floors, search, duplicate prevention, and add/remove coverage were not completed in the browser. | BLOCKED (partial workflow) | [Browser observations](verification/event-2026-10-01/browser-observations.md); proposal regression test | Retest full list operations in staging |
| C03 student schedule fields | Demo Student Org, local UI | Student form has no event dates/publication controls; payload carries no admin schedule | Step 1 said the administrator sets the schedule after review and showed no date/time field. Request payload was not inspected because submit would write to an unverified remote database. | BLOCKED (payload) | [Browser observations](verification/event-2026-10-01/browser-observations.md); proposal tests | Inspect payload using a disposable staging account |
| C04–C06 proposal confirmation and persistence | Student organization | Accurate summary, one draft on confirmation, recoverable create failure | Zero selected locations kept **Create & design maps** disabled. Unit tests cover review/cancel and failed creation. Browser confirmation, rapid submit, and persisted create/failure checks were not run. | BLOCKED (remote writes) | `EventProposalModal.test.tsx` | Retest only after identifying a disposable test database |
| E01–E09 editor, sizing, Arrange, seating, and placement | Student organization | Map editor and all six Arrange operations behave correctly, assets persist per location, invalid placements are safe | Plan's editor, geometry, seating, placement, and fixed-inspector tests ran in the automated suite. Actual canvas gestures, all six Arrange actions, mobile layout, chair rows, authored access regions, undo/redo, and saved-map isolation were not exercised in a browser. | BLOCKED (browser draft required) | Test command below | Use a staged multi-location draft and verify each case in the plan |
| S01–S06 autosave, tab return, tutorial, submit, isolation | Student organization | New edits survive in-flight saves; tutorial highlights each target; submission is safe and isolated | Autosave, tutorial replay/completion, submission summary, and pending-draft tests ran. No safe event draft was available for browser editing. Tutorial tests emit a React ref warning; exact spotlight alignment was not verified in a browser. | BLOCKED (browser draft required) | Event component/hook/page tests; [browser observations](verification/event-2026-10-01/browser-observations.md) | Verify with a staged draft, including tab switch and each highlighted target |
| A01–A08 administrator review | Admin | Themed schedule validation, feedback, overlap checks, approvals, and publication persist correctly | Date/publication/service tests ran. No admin test identity or verified staging target was available, so review UI and persisted approval were not exercised. | BLOCKED (role/database) | Admin event-layout and publication tests | Use a staging admin account and test proposals |
| D01–D08 database authorization/publication | Supabase roles | RLS, trigger, RPC, snapshots, and actual role visibility prevent leaks/bypass | Migration and assertion SQL were inspected, but not applied or executed. No `supabase/config.toml`, Supabase CLI, `psql`, Docker, or verified test connection is available. `.env.local` points to a remote Supabase host; its value is intentionally omitted and it was not mutated. | BLOCKED | `supabase/migrations/20260930140000_event_publication_visibility.sql`; `supabase/tests/event_publication_assertions.sql` | Provide/designate isolated staging or local Supabase and run D01–D08 |
| V01–V05 student/guest Event Map | Ordinary student/guest | Published events appear on schedule; navigation stays usable; private/future/ended events stay hidden | Automated Campus Map preview tests ran. The browser session was the student-organization role, and there was no staged publish-now or scheduled event to inspect as a student/guest. | BLOCKED (role/data) | Campus Map and EventPreviewLayer tests | Verify with ordinary student and guest contexts in staging |

## Commands and outcomes

- **Focused regression:** `EventProposalModal.test.tsx` — **12/12 passed** after the fix. The new themed-picker assertion failed before the production change because a native `<select>` remained, then passed after using the shared Select.
- **Plan event suite:** before the fix, 34/34 files and 283/283 tests passed. After the fix, the first aggregate run reported 33/34 files and 283/284 tests passed, with the Campus Map preview toggle test as the failure. That test passed alone (1/1), and its full file passed (18/18). A second aggregate run reported 33/34 files and 282/284 tests passed, with two failures in that same Campus Map test file. The full aggregate is therefore not clean; failures were not reproduced by the isolated test/file run.
- **Production build:** passed after the code change. Existing Vite chunk warning remains; `AdminMapBuilderPage` is about 1.7 MB minified.
- **TypeScript:** `tsc --noEmit` exits 1 with the compiler's 1,000-error output cap. A wider event-related path filter found 10 diagnostics in the already-modified shared `CampusMapPage.tsx` (floor-scene props, existing navigation union handling, and a map-mode comparison); none point to the event-preview toggle or the files changed in this verification. The event-specific source, hook, service, and library paths had no diagnostics. Because the tree was already dirty, this does not establish a clean-HEAD TypeScript baseline.
- **Diff check:** `git diff --check` passed; Git reported only existing LF/CRLF conversion notices.
- **Native-control scan:** event UI source has no native `<select>`, date, time, or datetime-local inputs after the campus-picker fix. Date/time controls are implemented with the custom themed component; browser rendering on admin desktop/mobile remains unverified.

## Environment and limits

The checkout is on branch `main` at `869d9957b3b701de075c33b2e8b7c064b8fb011d`, with substantial modified and untracked local work. A local Vite server was available, but `.env.local` points to a remote Supabase host. There is no configured local Supabase project or confirmed staging database, and the only existing browser role available during this check was Demo Student Org. I did not create, submit, approve, edit, or delete remote event records. An unsaved UI-only proposal was discarded. No base-map geometry was changed.

The migration and SQL assertions remain local and untested against PostgreSQL. No migration was applied. Physical venue capacity remains **uncalibrated** because map scale, measured asset footprints, aisle clearances, and approved occupancy limits were not supplied. No commit, push, or deployment was made.

## Manual retest for the fix

1. Open **My Events → Create event** as a student organization and enter the event information.
2. Continue to **Requested locations**. Open **Published campus** and choose another available campus; confirm its building and floor list changes.
3. Select a floor, choose another campus, then select **Keep campus**. The original campus and selected floor should remain.
4. Repeat and select **Change and clear**. The new campus should be selected and the incompatible old floor should be removed.
5. Do not submit against production. For the remaining end-to-end plan, use a verified disposable Supabase environment with student-organization A/B, admin, ordinary-student, and guest test accounts; then follow the plan cases and record real persisted outcomes.
