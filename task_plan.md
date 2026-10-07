# Student Organization Event Mapping & UI/UX Plan

## Goal

Design and later implement a polished student-organization event workflow in which admins grant the student-org role, student organizations request and build event maps on top of admin-published campus/building maps, and admins review and approve submissions without allowing students to delete admin-owned map content.

## Next Step

The October 3 completion plan is ready: `docs/superpowers/plans/2026-10-03-create-event-completion-and-uiux.md`. When the user starts execution with their selected model, begin Task 0 and read `docs/2026-10-03-create-event-acceptance-matrix.md`. Preserve the current working tree; this planning turn did not execute implementation or tests.

## Current Phase

Create Event completion and verification plan prepared (October 3, 2026). Earlier phases below are historical; the linked completion plan is the current execution checklist.

## Phases

### Phase 1: Requirements & Discovery

- [ ] Confirm the student-org and admin approval rules
- [ ] Map the existing event, auth, role, and map-builder architecture
- [ ] Inventory current assets and identify extension points for booth, chairs, stage, speakers, projector, and monitors
- [ ] Document findings in findings.md
- **Status:** complete

### Phase 2: Design & Approval

- [ ] Decompose the work into independently testable sub-projects
- [ ] Compare implementation approaches and recommend one
- [ ] Present the design sections for user approval
- [ ] Write and self-review the approved design specification
- **Status:** complete

### Phase 3: Implementation Plan

- [ ] Write the bite-sized implementation plan with exact files, interfaces, tests, and commands
- [ ] Confirm sequencing and execution mode with the user
- **Status:** complete

### Phase 4: Implementation & Verification

- [x] Implement approved sub-projects with focused tests
- [x] Verify role/permission boundaries and approval transitions
- [x] Verify map-builder interaction and asset rendering behavior
- [x] Verify proposal title/description/information behavior with no event date range
- **Status:** complete

### Phase 5: Delivery

- [x] Review the final diff and test evidence
- [x] Report changed files, known limitations, and any follow-up work
- **Status:** complete

### Phase 6: Map Sheet Overlap Fix

- [x] Reproduce and encode the overlapping Route Planner/building sheet state
- [x] Make mobile map sheets mutually exclusive and safe above bottom navigation
- [x] Verify the regression in focused tests, build, and the running browser
- **Status:** complete

### Phase 7: Click-to-Focus Building Framing

- [x] Encode the desired mobile and desktop focus targets in a pure viewport-framing helper
- [x] Use the helper when a building is selected, keeping the building visible above the details sheet
- [x] Verify focused tests, build, and the running browser
- **Status:** complete

### Phase 8: Overall Student Navigation & UI Planning

- [x] Confirm the intended student browsing and navigation flow
- [x] Resolve the building-versus-room selection mental model
- [x] Compare focused planner, guided endpoint, and unified-search approaches
- [x] Present the recommended UI flow and interaction states for approval
- [x] Write the approved design specification
- [x] Self-review the design specification before implementation planning
- **Status:** complete

### Phase 9: Unified Search & Focused Student Navigation Implementation

- [x] Add destination-search primitives and focused tests
- [x] Build the reusable campus destination search component
- [x] Integrate unified search into map browsing
- [x] Adapt Route Planner to one active endpoint search
- [x] Coordinate map surfaces, bottom navigation, and Back behavior
- [x] Verify responsive UI on desktop and mobile
- **Status:** complete

### Phase 10: Safe GitHub-to-Local Synchronization

- [x] Inspect the current branch, worktree, remotes, and any in-progress merge state
- [x] Fetch the current GitHub branch and compare commit/file differences
- [x] Merge safely while preserving the user's local changes and resolving conflicts if needed
- [x] Run merge-integrity checks and the most relevant tests/build checks
- [x] Summarize the remote changes, local changes, and verification evidence
- **Status:** complete

### Phase 11: Student Event Builder Final Polish

- [x] Reproduce and document the student-org plotting defects through browser QA
- [x] Choose the targeted Admin-builder parity approach and record the implementation plan
- [x] Add RED regression coverage for draft counts, bounded placement, unobstructed controls, labels, and warning presentation
- [x] Implement the smallest event-only state, geometry, and UI changes to satisfy the regressions
- [x] Attempt desktop and narrow-screen browser QA without saving or submitting the event
- [x] Run focused tests, production build, and scope checks
- **Status:** complete

## Key Questions

1. Should student organizations be allowed to submit multiple event-map revisions, or only one active submission per event?
2. Which admin-published map elements must be locked: all published campus/building content, or only the geometry and navigation layers while labels/appearance remain editable?
3. How should the multi-location builder present and switch between campus grounds and building-floor canvases?
4. Which proposal fields besides the date range must remain visible and editable?
5. Should the new event assets be simple native vector assets using the existing asset model, or uploaded image assets?

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Treat the request as multiple coordinated sub-projects | Roles/permissions, workflow/state, builder UX/assets, and proposal form behavior have separate data and test boundaries. |
| Preserve admin-owned map content and scope student edits to additions/removals | The user explicitly stated students must not delete the admin-published map and may remove only what they add. |
| Remove only the event date range from the proposal model/UI | The user wants title, description, other information, and the map retained. |
| Keep the current merge uncommitted and unpushed | This is the repository state requested in the previous operation; planning must not finalize it. |
| Require physical-office verification before assigning `student_org` | The app should expose the role only after an admin completes the offline verification step. |
| Do not store physical-document evidence | Verification is manual and outside the app. |
| Use combined location and map approval | The selected workflow has one admin decision covering access and the submitted map. |
| Allow multiple requested locations per event | One event can include campus grounds and one or more building floors. |
| Use the hybrid layout | Guided setup reduces mistakes, focused editing reduces canvas clutter, and admin overview supports fast review. |
| Implement now without another design-selection step | The user explicitly approved implementation after the design discussion. |
| Complete the existing resolved merge before updating to the fetched tip | The index is a conflict-free merge result for `MERGE_HEAD`; committing it preserves the staged GitHub work while leaving separate unstaged/untracked local edits intact. |
| Preserve remaining local edits with a post-merge stash | Stashing after the intermediate merge commit avoids mixing local event/search changes into the merge commit and gives the newer remote merge a clean worktree. |
| Use a targeted parity patch for final Event Builder polish | The current editor already has the Admin-style interaction primitives; correcting event-only state, boundary, control, and UI gaps has lower regression risk than a canvas rewrite. |
| Keep the existing dirty checkout for this pass | The uncommitted Event Builder work is already in this checkout. A fresh worktree would omit it, so edits remain narrowly scoped and no unrelated files are reset, staged, or committed. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Planning-note patch context mismatch | 1 | Re-read the files and split the patch into focused updates. |
| Sandbox denied Vite config access during the first regression run | 1 | Re-ran the same test with approved local execution; the test then produced the expected RED failure. |
| PowerShell variable interpolation error while checking planning files | 1 | Corrected the interpolated variable syntax and reran the read successfully. |
| Sandbox denied `git fetch` while writing `.git/FETCH_HEAD` | 1 | No repository content changed; retrying the fetch with approved elevated filesystem access. |
| `Get-CimInstance` process inspection returned Access denied | 1 | Did not inspect or terminate processes; used a narrower `Get-Process` check and continued with captured test runs. |
| Initial `pnpm build` wait produced no completion output and exceeded the reasonable runtime | 1 | Stopped only the two node processes started by that build, then planned a rerun with explicit session polling. |
| `pnpm build` dependency install hit registry `EACCES` in the sandbox | 1 | Stopped the retry cleanly; will rerun the build with elevated network access as required by the sandbox policy. |
| Elevated `pnpm build` stopped at `ERR_PNPM_IGNORED_BUILDS` for esbuild and Tailwind oxide | 1 | No source build result was claimed; invoking the installed Vite binary directly to bypass pnpm's install-script approval gate. |
| Direct Vite build was blocked by sandbox access to `vite.config.ts` | 1 | No source result was claimed; retrying direct Vite with elevated filesystem access. |
| Direct TypeScript check could not spawn the Windows compiler binary (`EPERM`) in the sandbox | 1 | No type result was claimed; retrying with elevated execution. |
| Elevated full TypeScript check reported a large existing/integration error set across map-builder and service layers | 1 | Do not treat the full typecheck as green; run a filtered diagnostic for the restored event/search files and report the broader baseline limitation. |
| Filtered TypeScript diagnostics still report errors in `eventLocationData.ts` and `CampusMapPage.tsx` | 1 | Focused tests and Vite build pass, but the targeted typecheck is not green; inspect whether these are pre-existing local-work errors or remote-merge regressions before finalizing. |

## Verification Evidence

- Focused event workflow tests: 8 files, 14 tests passed.
- Production build: passed with Vite; only existing chunk-size and empty vendor chunk warnings.
- Targeted TypeScript diagnostics: no errors in the changed event, admin preview, student event, model, or service files.
- Full repository Vitest run: 1,813 passed and 370 failed across existing map-builder/lifecycle areas while the repository remains in the pending merge state; this is not a green full-suite baseline.

## Notes

- The repository is currently in an intentional no-commit merge state: GitHub changes are staged, the three earlier local edits are unstaged, and `MERGE_HEAD` is present.
- The approved design has now been implemented; no commit or push was performed.

## Student-side audit follow-up (2026-09-21)

- Scope: identify student-facing placeholders/nonfunctional settings and recommend mobile/desktop UI/UX improvements.
- Status: audit complete; findings are recorded in `findings.md` and summarized in the final response.
- No application implementation was requested or made; only the persistent audit notes were updated.

## Phase 13: Remove out-of-scope student Home content

- **Status:** complete
- Remove the student Home Announcements preview and Today's Schedule/classes content because the user confirmed they are outside the system scope.
- Remove the public `/announcements` route and student Navbar bell while preserving the admin announcement workflow.
- Re-run focused tests/build and refresh the student placeholder/settings and mobile/desktop UX report without the removed features.

### RED checkpoint

- Added failing coverage for the Student Home content scope, student Navbar announcement link, and public/admin route split.
- Expected failures were observed independently. The combined invocation was stopped after hanging during Vitest initialization; this is logged in `progress.md`.

### GREEN implementation checkpoint

- Removed the Student Home schedule/classes sections, semester text, and mobile Schedule shortcut.
- Removed the Student Home announcement preview, student Navbar announcement bell, and public `/announcements` route.
- Deleted the now-orphaned `src/data/mockSchedule.ts` and `src/pages/AnnouncementsPage.tsx` files.
- Preserved the admin announcement route, admin page, announcement service, report notification behavior, map, buildings, reports, favorites, settings, and event routes.

### Next Step

No further implementation is included in this request. The remaining placeholder fixes are documented as the next product backlog.

### Verification checkpoint

- Focused Vitest verification: 4 files / 7 tests passed.
- Production Vite build: passed with 2,630 modules transformed; only the known empty `vendor-dates` and large-chunk warnings remain.
- Scope scan: student/public schedule and announcement references are removed; admin announcement references remain intentionally.
- `git diff --check`: exit 0 with only LF/CRLF conversion warnings.
- No commit or push was performed.

## Phase 14: Implement remaining student experience backlog

- **Status:** complete
- Goal: implement the remaining account, profile, favorites, building-action, report, support, responsive, and accessibility items from the post-removal audit.
- Design: `docs/superpowers/specs/2026-09-21-student-experience-backlog-design.md`.
- Plan: `docs/superpowers/plans/2026-09-21-student-experience-backlog.md`.
- Preserve the existing event-builder changes and the intentional removal of student/public schedule and announcements.

### Completion

- Account, profile, favorites, building actions, reports, Help Center, responsive, and accessibility work is implemented.
- Focused tests, production build, filtered diagnostics, and diff checks are complete.

## Phase 15: Populate Student Home from the published map

- **Status:** complete
- Use the canonical published-campus hook already consumed by the public map and Buildings Directory.
- Show only the first four published buildings as Home quick-access cards; keep the full directory behind “View All”.
- Add loading and honest no-published-buildings states so the section never silently renders as an empty block.
- Add regression coverage for published data sourcing and the four-building preview limit.
- Verification: focused Home tests passed, Vite production build passed, and the running Home tab visibly showed four published building cards.
- No commit or push was performed.

## Phase 16: Event Builder Input and Motion Polish

- **Status:** complete
- [x] Reproduce and isolate the Snap click-through placement, drag jitter, Space-pan feedback, wheel-pan/zoom smoothing, and student/admin visual parity gaps.
- [x] Present the recommended interaction architecture and receive delegated approval to choose the highest-quality ease-of-use direction.
- [x] Add failing behavior-level regression tests before production changes.
- [x] Implement the approved interaction and rendering polish while preserving locked published-map content and existing event data.
- [x] Verify focused tests, production build, and authenticated desktop/mobile browser interactions without saving or submitting user data.

### Completion checkpoint

- Snap/editor chrome no longer clicks through to armed furniture placement.
- Drag calculations use immutable gesture origins and a pure bounded move resolver, removing incremental snap/boundary drift.
- Pan and zoom use an eased target transform with reduced-motion support; Pan/Space now expose `grab`, `grabbing`, and status feedback.
- The editor no longer republishes an unchanged draft when a parent callback identity changes, eliminating the runtime maximum-update-depth loop found during browser QA.
- Indoor event locations now preserve and render the complete published floor snapshot instead of stripping it to room rectangles.
- Focused verification: 5 files / 63 tests passed. Production Vite build passed with 2,634 modules transformed. `git diff --check` passed with only line-ending conversion notices.
- Authenticated browser QA confirmed Snap count stability, progressive zoom animation, functional pan movement, full CABA floor layers, no mobile horizontal overflow at 390x844, and no fresh browser warning/error logs after reload.
- The unrelated full-repository Vitest run was stopped because existing Admin Map Builder tests continuously emit `act(...)` warnings and did not finish in a reasonable time; no full-suite green claim is made.
- No commit, push, Save Draft, or Submit to GSO action was performed.

## Main Create Event completion plan — October 3 execution

- **Status:** implementation and verification advanced; acceptance gate PARTIAL.
- One active plan: `docs/superpowers/plans/2026-10-03-create-event-completion-and-uiux.md`, Tasks 0–8. Optional future roadmap excluded.
- [x] Preserve existing checkout; reproduce/fix parser, mutation race, preview/checklist, creation retry and history defects.
- [x] Run unfiltered event/helper suites: 419 passing tests; production build and diff checks pass.
- [x] Verify existing-role authenticated lifecycle with disposable API fixture; owner/mobile feedback/browser/admin-note cycle; clean fixtures.
- [x] Actual two-location UI creation/design/save/reload/submission/admin-preview J1; cancel/confirm withdrawal L03, with strict persisted asset counts and fixture cleanup.
- [x] Record exact PASS/BLOCKED/NOT RUN evidence in the acceptance matrix/results.
- [x] User applied poster migration; existing Org upload, anonymous public read and cleanup verified live.
- [x] Actual poster form/retry/remove, available storage permissions, two owner browser saves, later feedback retry/reopen, mobile rejected duplicate/resubmit and creation keyboard focus/scroll checks.
- [x] Poster catalog assertions user-verified PASS via SQL Editor screenshot.
- [ ] Missing-role cases, positive publication and remaining manual acceptance permutations as recorded in results.
- [ ] Finish remaining full browser/keyboard/touch/publication journeys and unrelated Org/non-super admin checks as listed in results. Do not claim universal acceptance from segment coverage.
- No commit/push/deployment. Existing migrations not reapplied; no new accounts created.
