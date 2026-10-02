# Progress Log

## Session: 2026-09-12

### Phase 1: Requirements & Discovery

- **Status:** complete
- **Started:** 2026-09-12 Asia/Manila
- Actions taken:
  - Confirmed the request is a multi-subsystem planning task.
  - Read the required brainstorming, planning-with-files, and writing-plans instructions.
  - Confirmed no prior planning files existed.
  - Recorded the user requirements and initial source/migration inventory.
  - Inspected the existing student-org role assignment, event overlay schema/RLS, student event pages, admin review page, map-builder asset model, and published-campus persistence path.
  - Identified that location permission requests are not currently modeled separately from event overlays.
  - Identified that removing dates affects the overlay type, forms, review UI, and approved-overlay visibility selectors.
  - Confirmed the physical-document prerequisite for `student_org` promotion and selected the combined location-plus-map approval workflow.
  - Confirmed physical-document verification is manual/offline only and will not be represented as an upload or tracked document record.
  - Confirmed a single event can request multiple locations, including campus grounds and multiple building floors.
  - Presented visual layout options; the user clarified that no option had been intentionally selected, so the browser interaction was not treated as a decision.
  - Recommended and received approval for the hybrid layout: guided setup, focused location-switching editor, and all-location admin preview.
  - Received explicit approval to implement now.
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (created)
  - `docs/superpowers/specs/2026-09-12-student-org-event-workflow-design.md` (created)
  - `docs/superpowers/plans/2026-09-12-student-org-event-workflow.md` (created)

## Test Results

| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Planning-file discovery | Project root listing | No prior plan files or their contents identified | No prior plan files found | ✓ |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
|           |       | 1       |             |

## Session: 2026-09-17

### Phase 10: Safe GitHub-to-Local Synchronization

- **Status:** in_progress
- Goal: inspect the current GitHub remote and safely merge it into the local repository without losing existing local work, then verify and summarize the resulting changes.
- Initial planning-file read hit a PowerShell interpolation error; the command was corrected and no repository state was changed by that failed read.
- Local inspection found `main` at `af7d5a6`, tracking `origin/main`, with the stored ref 4 commits ahead and 12 behind.
- An in-progress merge is present (`MERGE_HEAD=eeba653e332dbc13b13a3f26ee7c9302d3c16489`) with no unmerged paths. The index contains staged merge results while many local edits remain unstaged or untracked, so all subsequent operations must preserve both layers.
- First `git fetch origin main` attempt was blocked before network/update work because the sandbox could not write `.git/FETCH_HEAD`; retrying with elevated filesystem access.
- Elevated fetch succeeded; `origin/main` is now `9133d95`.
- The fetched tip is six commits beyond the existing `MERGE_HEAD=eeba653`. The pending index is conflict-free, but it covers only the older remote tip. There are 122 staged paths, 37 unstaged tracked paths, and 80 untracked paths, including the local event/search work; these must be preserved while bringing in the six newer GitHub commits.
- Safe merge sequence selected: commit only the already-staged conflict-free merge, stash the remaining local tracked/untracked work after that commit, merge `origin/main` at `9133d95`, then reapply the stash and verify. This avoids reset/clean operations and avoids accidentally including local work in the merge commit.
- The existing merge was recorded as local commit `d6b2124` (`Merge remote-tracking branch 'origin/main'`). The commit completed without conflicts and left the separate local modifications/untracked files in the worktree as intended.

## Current implementation phase

- Phase 2 (Design & Approval): complete.
- Phase 3 (Implementation Plan): complete.
- Phase 4 (Implementation & Verification): complete.
- Phase 5 (Delivery): complete.

## Follow-up: overlapping mobile map sheets

- **Status:** complete
- Reproduced from the supplied screenshot: `RoutePlannerDialog` and `MobileBuildingSheet` can both render as fixed bottom sheets at the same time because opening Directions from the map controls only sets `directionsMode` and leaves `selected` populated.
- Recommended design: a single active mobile sheet; opening Directions clears the selected building, and selecting a building closes Directions. Preserve the existing sheet content while moving it above the bottom-nav safe area.
- Added a failing regression test, then implemented a shared `openDirections` action that clears selected-building state, search state, and campus selector state before opening the planner.
- Added render guards so neither desktop nor mobile building details can render while directions mode is active.
- Added a `mobile-building-sheet` test id and safe-area-aware planner sheet sizing/offset so the planner remains above the bottom navigation on mobile devices.
- Focused verification passed: 3 files / 24 tests.
- Production build passed; Vite emitted only the existing empty `vendor-dates` and large admin chunk warnings.
- `git diff --check` passed; output contained only existing LF/CRLF conversion warnings.
- Browser verification passed on `/map`: opening a building then top-level Directions leaves only Route Planner; closing it returns to the map, and opening a building shows only the building sheet.
- No commit or push was performed.

## Follow-up: click-to-focus building framing

- **Status:** complete
- The existing selected-building effect centers against the full SVG canvas and applies a fixed mobile offset. The new behavior should center the selected building in the visible map area above the mobile details sheet, while keeping the desktop right panel offset.
- Added `getBuildingFocusPan` in `src/lib/mapViewport.ts`; it derives the authored canvas center and rendered scale from the published campus dimensions, with a mobile safe focus target above the detail sheet.
- Updated the selected-building pan effect in `CampusMapPage` to use the actual active campus canvas dimensions and rendered map size.
- Added unit coverage for published-canvas centering and mobile safe framing.
- Browser verification passed: selecting BLDG-08 moves it into the visible center area above the building details sheet.
- Final focused verification passed: 4 files / 26 tests.
- Production build passed; existing empty `vendor-dates` and large admin chunk warnings remain.
- `git diff --check` passed; output contained only existing LF/CRLF conversion warnings.
- No commit or push was performed.

## Implementation & Verification Results

- Added multi-location event overlay normalization and persistence while retaining legacy read compatibility.
- Removed event date inputs and display from the student proposal, student map editor, admin review, and public event information surfaces. New writes strip legacy date fields.
- Added guided details/location setup, campus/building-floor location requests, duplicate prevention, and location removal.
- Added a focused event map editor with a location switcher, read-only published base map, and event-owned additions only.
- Added native vector assets for Booth, Chair, Stage, Speaker, Projector, Monitor, Tent, Table, Barrier, and Signage.
- Added admin read-only multi-location preview and combined event-level approve/disapprove review.
- Added offline-verification guidance wherever the admin assigns the Student Org role; the existing role/RLS migrations remain the enforcement boundary.
- Focused tests passed: 8 files / 14 tests.
- Production build passed.
- Targeted TypeScript diagnostics found no errors in changed feature files.
- Full repository test run completed with 1,813 passing and 370 failing tests in existing map-builder/lifecycle areas; no focused event workflow test failed.
- No commit or push was performed. The pending merge state remains intentional.

## Follow-up bugfix: map route error

- Reproduced the reported `eventOverlayService is not defined` error in `CampusMapPage` with a failing regression test.
- Added the missing `eventOverlayService` import to `src/pages/CampusMapPage.tsx`.
- Regression test now passes and the running `/map` browser page renders the campus map after reload.

## Follow-up: Overall Student Navigation & UI Planning

- **Status:** in_progress
- Recorded the screenshot-based UX findings for the Route Planner: bottom navigation competes with the full-height planner, and building/room controls appear as equal choices.
- Recommended a focused navigation mode plus a guided destination-type flow: destination-first, “You are here” as the default origin when available, and only one building-or-room picker visible at a time.
- No production code changed in this planning phase; no commit or push was performed.

### Direction revision

- The user requested the best end state immediately rather than a smaller incremental cleanup.
- Revised recommendation: implement the unified campus destination search as the target UX, with type filters and building/floor context for room results, while retaining focused mobile navigation mode and mutually exclusive map presentation states.
- Awaiting approval of this best-first design before writing the design specification or implementation plan; no production code changed.

### Approved design specification

- The user approved the best-first direction: unified Google Maps-style destination search with building/room context, focused map surfaces, and role-aware navigation.
- Added `docs/superpowers/specs/2026-09-12-student-navigation-unified-search-design.md` covering user flow, search contract, map surface state machine, responsive UI, back behavior, errors, boundaries, and acceptance criteria.
- No production code changed and no commit or push was performed.

### Design/plan self-review

- Checked the design and implementation plan for placeholders, contradictory endpoint names, missing acceptance coverage, and scope drift; no issues found.
- Added `docs/superpowers/plans/2026-09-12-student-navigation-unified-search.md` with seven test-first implementation tasks and exact verification commands.
- Phase 9 is now in progress; no production code changed and no commit or push was performed.

### Phase 9 Task 1: destination-search primitives

- Added `src/lib/destinationSearch.ts` with deterministic destination filters, user-facing kind labels, context labels, and collision-safe result keys.
- Added `src/lib/__tests__/destinationSearch.test.ts` covering building/room/office filters, room building/floor context, same-named room identity, and non-room labels.
- TDD evidence: the focused RED run failed because `destinationSearch` did not exist; the GREEN run passed 1 file / 4 tests.
- No commit or push was performed.

### Phase 9 Tasks 2–3: shared search and map browsing

- Added `src/components/map/CampusDestinationSearch.tsx` with shared result presentation, type filters, accessible labels, keyboard Escape handling, clear action, and touch-safe list scrolling.
- Added `src/components/map/__tests__/CampusDestinationSearch.test.tsx`; the RED run failed on the missing component, then GREEN passed 1 file / 3 tests.
- Replaced duplicated search-result markup in `StudentMapControls` with the shared search component while preserving recent places, campus shortcuts, map modes, Drop pin, Reset map view, and Directions.
- Updated map-control regression coverage to require the unified destination filter and user-facing Building result label.
- Combined focused verification passed: 2 files / 9 tests.
- No commit or push was performed.

### Phase 9 Tasks 4–7: route planner, map surfaces, and responsive verification

- Replaced the old split building/room planner interaction with `UnifiedRoutePlannerDialog`: one active endpoint search at a time, explicit Start/Destination cards, room results that retain building/floor context, and a clear route-ready summary.
- Added `src/lib/routeEndpoints.ts` to resolve shared search results into safe building, room, or manual-pin route endpoints; added 4 focused tests.
- Wired the shared search catalog into `CampusMapPage` for both map browsing and route planning. Selecting a room automatically selects its containing building and floor; the existing manual Drop pin remains the student’s location action.
- Added `src/lib/mapSurface.ts` and coordinated `CampusMapPage`, `MobileBuildingSheet`, and `MobileBottomNav` so browse, building details, floor plan, route planner, and active-route surfaces are mutually exclusive on mobile.
- Added browser Back reconciliation: Back closes an open search/surface first and restores `/map` before clearing the surface, preventing Home content from rendering at the map URL.
- Focused verification passed: 7 files / 32 tests.
- Production build passed: 2,607 modules transformed; Vite emitted only the existing empty `vendor-dates` and large admin chunk warnings.
- Running browser verification passed on mobile (390×698) and desktop (1280×800): unified search results, building selection, floor-plan isolation, route planner isolation, room destination selection, route-ready summary, and safe Back behavior were visibly confirmed.
- No commit or push was performed.

## 5-Question Reboot Check

| Question | Answer |
|----------|--------|
| Where am I? | Phase 4: Implementation & Verification |
| Where am I going? | Implement the approved hybrid workflow test-first and verify it without committing or pushing. |
| What's the goal? | Design a safe student-organization event-map workflow with improved UX, controlled permissions, new assets, and no event date range. |
| What have I learned? | See `findings.md`; the repository already contains event pages, event overlay services, a student-org migration, and map-builder asset primitives. |
| What have I done? | Created persistent planning files and captured the initial requirements and architecture inventory. |

## Session: 2026-09-17 (continued)

### Phase 10: Safe GitHub-to-Local Synchronization

- The existing conflict-free merge was recorded as local commit `d6b2124` (`Merge remote-tracking branch 'origin/main'`); the separate local modifications and untracked files were not included.
- The remaining local tracked and untracked work was saved in the named stash `preserve local work before syncing origin/main` so the fetched GitHub tip can be merged cleanly.
- Because the planning files were untracked, they were also captured; only `task_plan.md`, `findings.md`, and `progress.md` were restored from the stash's untracked snapshot. The rest of the local-work stash remains intact.
- The fetched GitHub tip merged automatically as local commit `d574e8b` with no conflicts or unresolved paths. Its parents are the intermediate local merge `d6b2124` and GitHub `9133d95`.
- Local `main` now contains the fetched GitHub tip and is ahead of `origin/main` by the six intended local commits; the remaining local feature work is still in the named stash and will be restored next.
- The named stash reapplied cleanly on top of `d574e8b`; all local tracked and untracked work returned with no conflicts. The temporary planning backup was hash-verified and removed, while the stash remains available as a safety copy.
- Fresh merge-integrity checks passed: `origin/main` is an ancestor of `HEAD`, there are no unmerged paths, both `git diff --check` variants are clean, and `HEAD` is `d574e8b` with parents `d6b2124` and `9133d95`.
- Focused event-component verification passed: 5 test files / 36 tests (`src/components/events/__tests__`).
- The first broad focused-test invocation did not yield a complete result within the orchestration window; it was not counted as evidence. A narrower rerun produced the complete result above.
- Focused canvas/map verification passed: 9 files / 36 tests.
- Focused event/search library verification passed: 11 files / 45 tests.
- Focused event page/service verification passed: 5 files / 19 tests.
- Focused fetched floor-editor/template verification passed: 11 files / 57 tests. `EditorTutorial.test.tsx` emitted a React `ref` warning from `framer-motion`, but no test failed.
- The first `pnpm build` attempt did not produce a completion result after an extended wait; its two exact build-started node processes were stopped. This attempt is not counted as build evidence.
- The explicit build rerun reached pnpm's dependency-install step but registry requests were denied with `EACCES`; the session was stopped cleanly and will be retried with elevated network access.
- Elevated pnpm dependency setup completed, but `pnpm build` exited with `ERR_PNPM_IGNORED_BUILDS` because esbuild and Tailwind oxide install scripts were not approved. No build-pass claim is made; direct Vite execution is the next check.
- Direct Vite execution reached config loading but the sandbox denied `vite.config.ts`; retrying with elevated filesystem access.
- Direct Vite production verification passed with elevated filesystem access: 2,629 modules transformed and `✓ built in 46.82s`. Output retained only the existing empty `vendor-dates` chunk and large-chunk warnings.
- The first direct TypeScript check was blocked before compilation because spawning `tsc.exe` returned `EPERM`; retrying with elevated execution.
- Elevated full `tsc --noEmit` completed with exit 1 and 1,341 diagnostic lines, concentrated across map-builder, generated/database types, and services. This is not a clean full-repository type baseline; a filtered check for restored event/search files is next.
- Filtered diagnostics for restored event/search paths exited 1 with errors in `src/lib/eventLocationData.ts` and `src/pages/CampusMapPage.tsx`; no filtered errors were emitted for the new search components/libs. These must be classified before the final summary.
- The same diagnostic blocks are present in the pre-remote stash copy of those files, so the targeted type errors predate the fetched GitHub merge rather than being merge-conflict regressions.
- Final VCS state: `HEAD=d574e8b`, `origin/main` is an ancestor, `MERGE_HEAD` is absent, unmerged entries are 0, both diff checks exit 0, the worktree has the expected 37 modified tracked paths and 82 untracked entries, and `stash@{0}` remains as a safety copy.

## Session: 2026-09-21 — Student Event Builder Final Polish

### Phase 11: Student Event Builder Final Polish

- **Status:** in_progress
- The user approved implementation of the final event-editor polish pass and requested the strongest recommended Codex setup. Recommended GPT-6 Astra at xhigh reasoning for the combined UI, gesture, and browser-QA work; GPT-5.6 Sol at high remains the faster alternative.
- Re-read the existing design, plan, persistent findings, relevant event editor/page components, draft persistence, validation, transform geometry, and current event-editor tests.
- The current checkout is a normal dirty `main` workspace. It contains the relevant uncommitted Event Builder implementation; no worktree is created because it would exclude that work. No files are reset, staged, committed, or pushed.
- Manual QA defects have been recorded in `findings.md`. The next action is RED regression coverage for draft-count synchronization, bounded click/drop placement, direct-control collision avoidance, labels, and warnings.
- Added and observed RED regressions for: an initial click-placement outside the floor, missing parent draft notifications, a top-edge action bubble collision, missing label editing, and a non-wrapping warning strip.
- Implemented the GREEN changes: creation now uses `constrainFurnitureToFloor`; the editor reports drafts to `StudentEventEditPage`, which renders its current per-location draft in the switcher; top-edge single-item actions move below the selected item; labels have selectable details/editing and Text mode does not duplicate an existing label; warnings wrap and expose a status role.
- Focused verification passed: 5 files / 55 tests. Production build passed: Vite 6.3.5 transformed 2,633 modules. `git diff --check` passed; output contained only LF/CRLF conversion warnings.
- The local dev server initially failed inside the sandbox because it could not read `vite.config.ts`; the approved local retry started successfully. The fresh in-app browser session reached the app but was unauthenticated, so it could not enter the student-org event route. No login, Save Draft, or Submit action was attempted. The dev server was stopped.
- The Vite deprecation warning supplied by the user could not be reproduced in this checkout: local Vite is 6.3.5 and `vite.config.ts` contains no deprecated `esbuild` or `optimizeDeps.esbuildOptions` configuration. Do not apply a speculative plugin/dependency upgrade without reproducing it in the environment that shows the warning.

## Session: 2026-09-21 — Student-side Placeholder and UX Audit

### Phase 12: Source Audit and Recommendations

- Audited the current student routes, pages, map surfaces, account/report services, announcements, help center, and student-organization event flow.
- Confirmed clear placeholder or non-persistent behavior in student settings, profile editing/activity, home schedule/announcements, announcements page data wiring, building-detail actions, saved-building defaults, report status/location metadata, Help Center assistant behavior, and cross-page map deep links.
- Confirmed that the map's in-panel directions/save/report flow, QR generation, theme persistence, and student-organization event CRUD are wired, with documented fallback/data-sync caveats.
- Attempted a fresh browser pass; local development-server setup/network access prevented reaching an authenticated student session. No application source files were changed for this audit.

## Session: 2026-09-21 - Remove Out-of-Scope Student Content

### Phase 13: RED regression coverage

- User approved removing Announcements from the student/public UI and removing schedule/classes from Student Home, while preserving admin announcements.
- Added failing assertions to `Navbar.test.tsx`, created `StudentHomePage.scope.test.tsx`, and created `studentScopeRoutes.test.tsx`.
- RED evidence: Student Home still rendered `Today's Schedule`; Navbar still rendered the student Announcements bell; the public root still contained the `announcements` route.
- The combined three-file Vitest invocation stalled during initialization and was stopped. Separate focused invocations each produced the expected RED failure, so the tests are valid and implementation can proceed.

### Phase 13: GREEN implementation and final verification

- Removed the Student Home schedule/classes sections, semester text, and mobile Schedule shortcut.
- Removed the Student Home announcement preview, student Navbar announcement bell, and public `/announcements` route.
- Deleted the orphaned `src/data/mockSchedule.ts` and `src/pages/AnnouncementsPage.tsx` files.
- Preserved the admin announcement route/page/service, report notifications, map, buildings, reports, favorites, settings, and student-organization event routes.
- Focused verification passed after the deletions: 4 files / 7 tests, covering Navbar, MobileBottomNav, Student Home scope, and the public/admin route split.
- Production Vite build passed with 2,630 modules transformed. The known empty `vendor-dates` chunk and large-chunk warning remain; no build error occurred.
- Scope scan found no student/public `AnnouncementsPage`, `/announcements`, `MOCK_SCHEDULE`, schedule/class section, or Schedule shortcut references. Admin announcement references remain intentionally.
- `git diff --check` exited 0; Git emitted only LF/CRLF conversion warnings for the dirty worktree.
- Refreshed the post-removal student placeholder/settings audit and mobile/desktop UX recommendations in `findings.md`.
- No commit or push was performed. Existing event-builder, lockfile, workspace, and planning changes were preserved.

## Session: 2026-09-21 - Published Building Preview on Student Home

### Phase 15: GREEN implementation and verification

- The Student Home previously read the legacy `CampusDataContext`, while the map and Buildings Directory read `usePublishedCampus`; this mismatch left Home's Buildings section empty even when the published map contained buildings.
- Switched Home to the canonical published-campus source and retained a four-building quick-access preview. The full published set is still available through “View All”.
- Added a published-data loading skeleton and an explicit empty state with a link to the Campus Map.
- Added `StudentHomePage.publishedBuildings.test.tsx`; it verifies that published buildings render and the fifth building is not included in the Home preview.
- Focused verification: 2 files / 2 tests passed.
- Production Vite build passed: 2,633 modules transformed; only the existing large-chunk warnings remain.
- Browser verification: the running Home tab visibly displayed four published building cards (`CABA`, `STUDCENTBLDG`, `COED`, `CEIT`) and no fifth card.
- Browser QA setup could not run the temporary Python Playwright script because the environment lacks the Python Playwright package; the in-app browser was used instead. The temporary QA script and screenshots were removed.
- No commit or push was performed.

## Session: 2026-09-21 - Event Builder Input and Motion Polish

### Phase 16: Discovery and design

- User supplied four screenshots and reported Snap click-through placement, jittery furniture drag, unclear Space-pan state, rough wheel pan/zoom, and visual differences from the Admin Map Builder.
- Chosen discovery direction: audit the event editor's pointer/click/wheel pipeline and compare its locked base-map renderer with the Admin renderer before proposing changes.
- The landing-page design-taste skill is not applicable to this dense product editor. The work will preserve the current PLV design system and focus on interaction feedback, input correctness, performance, and published-map visual parity.
- No production code has been changed in this phase.
- Confirmed the Snap defect is root-canvas click-through from the floating viewport controls, not an asset-catalog selection error.
- Confirmed the event editor uses incremental React-state dragging and immediate wheel transforms, while the Admin editor already has target-based animation patterns that can be adapted safely.
- Confirmed the floor visual difference is caused by a separate simplified renderer in `EventFloorEditor`, despite the project already having richer read-only floor-plan visuals.
- Next checkpoint: obtain the user's intended parity level, then present the recommended interaction/render design for approval before the RED test cycle.

### Phase 16: GREEN implementation and verification

- Added RED-to-GREEN coverage for Snap click-through, immutable/bounded drag geometry, smooth viewport motion and reduced-motion behavior, Space-pan feedback, full read-only floor rendering, complete published-floor layer preservation, and unstable parent draft-callback identities.
- Marked floating viewport controls as editor chrome so armed Furniture/Text tools cannot place through Snap/zoom/Fit controls.
- Added immutable gesture snapshots for drag and resize math. Furniture and labels now resolve every move from the gesture origin rather than from a changing rendered position.
- Added eased, target-based viewport motion for wheel pan, Ctrl/Cmd-wheel zoom, zoom buttons, and Fit. Direct drag/touch pan remains immediate. Pan mode now uses explicit armed/active cursors and status text.
- Reused `ReadonlyFloorPlanScene` in the Event Builder and corrected wall-relative door/window rotation plus architectural layer order.
- Corrected `resolveFloorPlanForEvent` so a live event floor keeps paths, walls, doors, windows, permanent furniture, stairs, ramps, elevators, labels, floor appearance, exterior zones, and entrance structures.
- Fixed a browser-discovered maximum-update-depth loop by storing the latest `onDraftChange` callback in a ref and publishing drafts only when the actual furniture/label state changes.
- Fresh focused result: 5 files / 63 tests passed. Fresh production build: 2,634 modules transformed and exit 0; only the existing Admin Map Builder chunk-size warning remains.
- Browser QA: Snap kept the item count unchanged; zoom changed across multiple animation frames before reaching its exact target; pan changed the transform; CABA rendered 32 walls, 14 doors, 4 stairs, 1 elevator, 1 label, and 12 rooms; the 390x844 layout had no horizontal overflow; a clean reload produced zero new warning/error logs.
- The full repository test command was attempted but stopped after the unrelated Admin Map Builder dirty-state suite repeatedly flooded existing React `act(...)` warnings without completing. Focused feature coverage and the production build are green; no full-suite claim is made.
- No application draft was saved or submitted, and no Git commit or push was made.

## Session: 2026-09-21 - Implement Student Experience Backlog

### Phase 14: Design and implementation plan

- User authorized implementation of all remaining items from the post-removal student report.
- Re-read the current student pages, account/report services, auth context, database-generated contracts, existing RLS/storage migrations, map deep-link handling, and Help Center flow.
- Confirmed the existing schema supports the requested persistence: `profiles`, `favorites`, `reports`, `report_history`, `report_images`, and private `avatars` storage.
- Chosen design: remote-first authenticated operations with truthful errors, account-scoped local/demo fallback, canonical `buildingId` deep links, report hydration, and a mailto/copy support handoff.
- Added the design specification and implementation plan under `docs/superpowers/`.
- Next action is the RED test cycle for account preferences, profile/password/avatar behavior, and account-scoped favorites.
- RED evidence: the new preference/profile modules were unresolved, the existing favorites service still returned `b_scb`/`b_caba`, remote favorite APIs were absent, and password updates had no implementation. The expected failures were observed in 4 test files (6 failed assertions plus 2 unresolved modules).
- Implemented and verified account primitives: account-scoped favorites with remote Supabase persistence, local guest fallback without seeded buildings, notification preferences through Auth metadata, safe profile updates, private avatar upload/signed URLs, and current-password verification before password changes. Focused RED-to-GREEN run: 4 files / 17 tests passed.

### Phase 14: Remaining student flows and header polish

- Added contextual report opening from `/student/reports?building=...`, canonical map links, `in_progress` status presentation, hydrated report metadata/timelines/photos, explicit report load-error retry UI, and campus-aware report submissions across map, building details, and student reports.
- Replaced the Help Center's simulated inquiry success state with a truthful email-draft handoff, corrected campus-service deep links, and rendered the previously unused Campus Guide, services, and final CTA sections. The guide is labeled as a local knowledge base rather than a live agent.
- Replaced the blank desktop auth-loading pill with a visible accessible account status, while keeping it compact on mobile. Added keyboard/focus semantics to key student controls and an honest Favorites load-error state.
- RED evidence: the contextual report, support mailto, canonical service-link, and auth-loading regression tests failed before their production fixes. GREEN evidence: all four focused files passed with 6 tests.
- Final focused verification after the guest-session/type-safety cleanup: 6 files / 16 tests passed with no unhandled errors.
- Production Vite build passed twice in this phase; the final run transformed 2,633 modules. Existing large-chunk warnings remain, with no build errors.
- Filtered TypeScript diagnostics for the student/report/support/header files returned no matching errors. Full repository TypeScript still reports the known pre-existing map-builder/generated-contract baseline errors.
- Final `git diff --check` passed. No commit or push was performed.
