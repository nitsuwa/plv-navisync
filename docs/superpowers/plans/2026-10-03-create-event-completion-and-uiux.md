# Create Event completion, verification, and UI/UX implementation plan

> **For agentic workers:** Use the `executing-plans` skill to execute this plan inline, one task at a time. Track the checkboxes and evidence below. Read the companion acceptance matrix before implementing. Do not spawn agents or create another chat unless the user requests it.

**Goal:** Finish and verify the existing Student Org → GSO event workflow, make map review and feedback resolution easy to use, and deliver a consistent responsive interface from event creation through publication.

**Architecture:** Keep the existing React event pages, shared map editor, Supabase event metadata, protected commands, and revision history. Improve the current components in small increments; extract shared feedback/preview controls where necessary rather than building a second editor or lifecycle. Database changes require a new forward migration because the user has already applied the current migrations.

**Tech stack:** React, TypeScript, Vite, Tailwind, Radix dialogs, Vitest/Testing Library, Supabase/PostgreSQL, existing browser tooling.

**Prepared/executed:** October 3, 2026, Asia/Manila. Main implementation executed inline; acceptance remains PARTIAL. Current evidence and exact remaining cases: `docs/verification/create-event-2026-10-03/results.md` and companion matrix. Optional roadmap excluded.

**Continuation checkpoint:** Actual poster form/failure/retry/removal and available storage permissions, two owner browser sessions, later feedback acknowledgement retry/reopen, mobile rejected duplication/withdrawal/resubmit and creation keyboard focus/scroll checks now PASS. Fixed stale caller-version overwrites, missing poster removal and focus return. Fresh core 266 PASS; unchanged helpers 156 PASS; final affected proposal 14 PASS; build PASS. Catalog SQL, unavailable roles, safely retireable positive publication and remaining manual acceptance permutations remain explicit gates.

## 1. Evidence and current scope

Source of truth: this conversation, the current working tree, and the actual migration/test files. Historical reports describe intermediate implementations and are not proof of the current integrated behavior.

| Area | Already implemented | Evidence and remaining work |
|---|---|---|
| Proposal creation | Event information + requested locations, published campus/floor selection, duplicate layout, draft editing | Existing components/tests; run current create/edit/duplicate flows and check incomplete/legacy data |
| Map design | Event furniture/labels over a locked published map, selection, placement, inspector, undo/redo, save/recovery/autosave | Existing implementation and tests; verify with current feedback panels and responsive layout |
| Student lifecycle | Next-step guidance, pending edits, Review & update GSO, withdrawal to Draft, rejection/revision/resubmit | Code present; verify persistence, original submission time on pending updates, race/failure behavior |
| Admin list/review | Queue/search/status filters, review dialog, per-location preview, totals, creator disclosure, schedule/publication | Code present; assess final hierarchy and actual keyboard/mobile behavior |
| Time controls | 12-hour AM/PM; hour/minute columns; Asia/Manila storage conversion | Related tests previously passed; verify all minutes, midnight/noon and scheduling in a real browser |
| History | Server revisions, actor/action/time, location changes, changes since submission | Implemented; resolution-specific entries and baseline/cutoff clarity still need improvement |
| Preview | In-place modal, scroll containment, explicit Pan, Space/H/0 shortcuts, focus items, furniture summary | Implemented; verify both entry points, mouse/touch/keyboard interaction, focus return and no scroll leakage |
| Feedback pins | Draft marker before save, numbered location pins, comments, staged feedback during admin review | Implemented; unsaved comment handling, pan/pin transitions and pin capacity need testing/polish |
| Resolution checklist | Owner marks addressed/reopens, optional note, server actor/time, preserved feedback on resubmit, open-pin gate, admin read view | Implemented locally; full role-to-role browser cycle and concurrency checks still pending |
| Database | Publication/review, revision history, feedback resolution migrations | User supplied successful SQL Editor screenshots for application and history/resolution assertions. Do not blindly reapply |
| Verification | Most recent related runs: 29 + 17 = 46 tests passed and Vite built before the final null-compatibility tweak | Final focused rerun was declined. Previous filtered runs skipped many tests. Establish a fresh unfiltered baseline |
| Delivery | Many modified and untracked files remain in the current checkout | Preserve all work; no new push/deployment has been confirmed |

The earlier claim that explicit resubmission clears `locationFeedback` is superseded: the current implementation retains original location feedback and resolution data. The annotation's earlier pending-update, modal-preview, time-picker and changes-since-submission work belongs in regression coverage, not a reimplementation task.

## 2. Global constraints

- Keep all existing uncommitted event work. Inspect `git status` and diffs before editing; never reset or clean the checkout.
- Student Org edits only its own event additions. Published base maps, ownership, admin schedule, publication, feedback text and server audit fields remain protected.
- “Addressed” means the student reports a fix. GSO verifies and makes the approval decision.
- Pending saves retain Pending and the original submission timestamp. Withdrawal retains furniture/labels. Resubmission after revision is a new submission with a new timestamp and preserved feedback evidence.
- A draft save after rejection currently changes storage status to Draft while preserving feedback. Present unresolved feedback clearly; do not quietly invent a new database status.
- UI displays 12-hour time with AM/PM and a concise Philippine-time label; storage remains canonical. Students do not set the administrator-owned schedule.
- Both pending preview entry points must share data and review context. Approved/rejected previews remain inspection surfaces as appropriate.
- Preserve the PLV navy palette, existing fonts, theme tokens and component conventions. Avoid extra banners, duplicate headings and competing primary buttons.
- Test-only fixtures must be isolated. The project name `plv-navisync-dev` is not evidence that the connected database is staging: the screenshot shows a PRODUCTION branch.
- The user's later explicit instruction authorized the existing project and existing Org/student/super-admin accounts. Only new disposable QA events were mutated and cleaned. No account provisioning, credentials output or staging-verifier execution against production. Missing unrelated Org/non-super-admin identities remain blocked.
- New SQL must load the Supabase skill and use a new timestamped migration. Do not edit already-applied migration behavior as the delivery mechanism.
- No new package, state-management framework, broad editor rewrite, push or production deployment is required by this plan. Follow the user's later explicit instructions for delivery.
- Record PASS / FAIL / BLOCKED / NOT RUN separately, with command, environment, evidence and cause. A build, mocked test or SQL catalog check does not prove browser or authenticated database behavior.

## 3. Recommended execution model

**Default: GPT-6.1 Sol, Medium.** This is a workload-based recommendation for coupled UI, async saving, authorization, SQL and regression analysis. Official documentation describes Sol as suitable for complex coding and supports Low/Medium; it describes Luna as efficient for focused tasks. There is no repository-specific measured comparison between Luna Max and Sol Medium.

| Option | Use in this plan |
|---|---|
| GPT-6.1 Sol Medium | Execute Tasks 0–8; particularly lifecycle, concurrency, SQL, shared preview and final integration |
| GPT-6.1 Sol Low | Bounded copy, spacing and presentation fixes after the behavior/tests are pinned down. “Light” should be interpreted as Low if that is the selector label available |
| GPT-6 Luna Max | Budget-oriented execution of one well-defined task at a time: regression runs, evidence recording, isolated components and test additions; use Sol for ambiguous failures and review of database/lifecycle changes |

Do not assume Luna Max has equivalent behavior to Sol Medium merely because its reasoning setting is higher. Do not estimate Codex subscription usage from API prices. Sources checked October 3, 2026: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

## 4. Execution order and checkpoints

Tasks 0–2 establish correctness. Tasks 3–6 improve the user experience in working increments. Task 7 validates roles/publication, and Task 8 performs final integration. A regression test must reproduce a behavior defect before the fix. Pure spacing/copy changes need browser inspection rather than implementation-mirroring tests.

### Task 0 — Reconcile the baseline and collect current evidence

**Read:** this plan; `docs/2026-10-03-create-event-acceptance-matrix.md`; the four `docs/2026-10-03-event-*.md` reports; `task_plan.md`, `findings.md`, `progress.md`; applicable repository instructions.

**Create:** `docs/verification/create-event-2026-10-03/results.md` for current evidence and a fixture manifest listing test-only IDs and environment. Keep credentials out of these files.

- [x] Record the current branch, changed/untracked files, local app URL, available test users/roles and database target identity.
- [x] Run the baseline command groups in section 7 without name filters. Record existing failures and warnings separately from new regressions.
- [x] Run TypeScript diagnostics and distinguish pre-existing errors from event-feature errors. Vite does not replace a type check.
- [ ] Inventory SQL application state read-only. Credit the user's success screenshots as user-observed execution evidence; do not label them full authorization tests.
- [ ] Capture current desktop/mobile screenshots of My Events, creation, editor, submission review, admin list/review, preview, history, furniture summary and feedback checklist.
- [ ] Correct outdated report wording about feedback clearing and pending-button behavior; retain historical test evidence with its date.

**Checkpoint:** The executor knows exactly which behavior is implemented and which checks actually pass on the current files. No speculative feature additions yet.

### Task 1 — Close feedback parsing and persistence gaps

**Modify:** `src/lib/eventFeedbackPins.ts`, `src/services/eventOverlayService.ts`, `src/components/map-builder/types.ts` only as needed.

**Tests:** `src/lib/__tests__/eventFeedbackPins.test.ts`, `src/services/__tests__/eventOverlayService.test.ts`, `supabase/tests/event_feedback_resolution_assertions.sql`. If SQL decoder/guard changes are necessary, create a new migration after `20261003180000_event_feedback_resolution.sql`.

**Current interfaces:** `readEventFeedback(value?)`, `countOpenFeedbackPins(feedback?, resolutions?)`, `feedbackPinsWithStatus(value?, resolutions?)`, and `setEventFeedbackPinAddressed(overlay, locationId, pinId, addressed, note): Promise<CampusEventOverlay>`.

- [ ] Add cases for null/missing metadata, legacy comments, invalid encoded JSON, null/non-object pin entries, invalid coordinates, blank comments, 30/31 pins, stale resolutions and malformed timestamps. A bad pin must not make a valid neighbor disappear or cause client/server disagreement.
- [ ] Example RED case to add to the existing helper suite:

```ts
const raw = '@event-feedback/v1:' + JSON.stringify({
  text: '',
  pins: [null, { id: 'valid', x: 10, y: 20, comment: 'Clear the gate' }],
});
expect(readEventFeedback(raw).pins.map(pin => pin.id)).toEqual(['valid']);
```

- [x] Align client decoding with server decoding. Validate individual entries; keep legacy text readable; show recoverable errors for data that cannot safely be interpreted.
- [ ] Test addressed/reopen RPC payloads, response hydration, failure propagation, refreshed row version, stale-feedback rejection, actor/time preservation, and note length limits. Exercise actual service behavior instead of just asserting a mock returns a value.
- [ ] Verify that reload, save, duplicate and submission retain or clear only the appropriate fields. A duplicate starts a fresh Draft and must not inherit someone else's review/resolution history, approval or schedule.
- [ ] Verify newly added/changed feedback invalidates the relevant current acknowledgement. Current behavior invalidates all acknowledgements for the location when its encoded feedback changes; keep that explicit in this increment.

**Checkpoint:** No invisible open pins, bypassed resubmissions, exposed encoding or lost student notes. Relevant helper/service tests and matching SQL cases pass in the available test environment.

### Task 2 — Make saves, acknowledgements and submissions cooperate

**Modify:** `src/pages/StudentEventEditPage.tsx`, `src/hooks/useEventAutosave.ts`, `src/services/eventOverlayService.ts` as necessary.

**Tests:** `src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx`, `src/hooks/__tests__/useEventAutosave.test.tsx`, `src/services/__tests__/eventOverlayService.test.ts`.

- [ ] Reproduce with deferred promises: autosave starts → owner edits again → acknowledgement starts/finishes → older save completes. The newest local map edits and newest persisted resolution must both survive.
- [ ] Cover rapid double-click on Mark as addressed, Save, Confirm update and Confirm submission. Serialize mutations for the same event or reject overlapping actions with visible progress; do not rely only on disabled styling.
- [x] Include `feedbackSaving` in submission/navigation busy behavior where needed. Preserve unsaved map changes and unsubmitted note text after a failed command.
- [ ] Audit direct draft/resubmission writes for stale overwrites. If a failing test proves a missing server revision check, add a protected atomic command in a new migration; do not silently downgrade to an unprotected write.
- [x] Verify pending edits keep `submittedAt`, withdrawal keeps all locations/assets, and a resubmission gets the proper new server timestamp.
- [ ] Add an actionable retry/refresh path for changed server feedback or concurrent admin decisions. A refresh must not silently discard unsaved map edits.
- [ ] Test error states for offline/timeout, expired authentication, missing RPC, stale revision and approval arriving while the editor is open.

**Checkpoint:** Network ordering does not erase map work or resolution state; users can recover and understand whether their change was saved.

### Task 3 — Turn the feedback checklist into a usable revision workflow

**Modify:** `EventFeedbackChecklist.tsx`, `EventFloorEditor.tsx`, `StudentEventEditPage.tsx`, `StudentMyEventsPage.tsx`, `AdminEventLayoutsPage.tsx`, `EventSubmissionReview.tsx` under their existing directories.

**Tests:** existing checklist, editor, submission-review, StudentMyEventsAccess and StudentEventEditPage suites.

**New UI contract:** optional `onLocatePin(locationId: string, pinId: string): void` on the checklist; implement location switching through the existing unsaved-change handling and then focus the saved pin coordinates. A locate action must never mark the pin addressed.

- [ ] Group feedback by location with Open / Addressed filters and compact progress, e.g. “2 of 3 addressed”. Add text/icon status so color alone never carries the meaning.
- [ ] Add “Show on map” for each pin. Switch to its location, focus it and visibly select its associated comment. Keep map panning independent of pin status actions.
- [x] Make a submit attempt with open pins open the checklist and focus the first outstanding issue instead of showing only a toast.
- [ ] Keep optional resolution notes next to the issue, show per-action saving/error state, and allow reopening before resubmission. Avoid a full-width permanent banner above the canvas.
- [x] Show checklist readiness and a link back to unresolved issues in the existing submission summary. Reuse the same readiness rules; do not create a competing validation system.
- [ ] Admin review shows student-reported notes and times, identifies the submitted revision and keeps final Approve/Needs revision controls clearly separate.
- [ ] Verify reopening, note retention on failure, keyboard operation, long comments, 30 pins and two locations on desktop/mobile.

**Checkpoint:** A user can find an issue, fix the layout, record the fix and resubmit without guessing which point or location the comment refers to.

### Task 4 — Finish a consistent, map-first admin preview

**Modify:** `src/components/events/AdminEventMapPreviewDialog.tsx`, `src/pages/AdminEventLayoutPreviewPage.tsx`, `src/components/events/EventFloorEditor.tsx`, `src/pages/AdminEventLayoutsPage.tsx`, `src/components/events/EventFurnitureSummary.tsx`.

**Tests:** existing preview-page/editor/furniture-summary/admin-review suites; create `src/components/events/__tests__/AdminEventMapPreviewDialog.test.tsx` for nested focus and dismissal behavior if not already covered.

- [ ] Use one preview header and one close control; place location navigation, furniture summary and feedback access in a compact toolbar. Keep the canvas usable when panels are open.
- [ ] Reproduce both entry points with the same pending event and current staged pins. Verify identical locations, markers, totals and review context; inspect approved/rejected states separately.
- [x] Test Pan toggle persistence while typing a pin comment. The current effect depends on the `onFeedbackPoint` callback identity; stabilize mode changes if rerenders reset the user's selected mode.
- [x] Headless Edge verifies Space+drag, H/0, Ctrl+wheel and Focus items; H is scoped to the map and comment inputs still accept H/Space.
- [ ] Still verify pointer cancellation, physical touch/pinch and additional map drag targets.
- [ ] Draft marker must appear at the intended map coordinate before saving and remain correct after zoom/pan. Dragging, opening menus and clicking toolbar controls must never add a pin.
- [x] Browser verifies map wheel containment, nested preview/review focus return, and restored body scrolling.
- [ ] Still verify physical touch scrolling and Escape/Tab behavior across every modal.
- [x] Warn before discarding a typed unsaved pin or staged review feedback; closing the nested preview retains the review draft. Show “Saved to review draft; sent with decision” accurately.
- [x] At 30 pins, show a visible limit and disable adding another; do not silently slice away a newly saved pin.
- [ ] Furniture summary: totals per location and type, specific names, correct handling of hidden items and labels, and exclusion of permanent base-map assets.

**Checkpoint:** Both previews behave consistently; navigation and feedback placement work with mouse, touch and keyboard without scrolling the outer page.

### Task 5 — Polish Create Event and My Events as one flow

**Modify:** `src/components/events/EventProposalModal.tsx`, `EventLocationPicker.tsx`, `EventLocationSwitcher.tsx`, `EventSubmissionReview.tsx`; `src/pages/StudentMyEventsPage.tsx`, `StudentEventEditPage.tsx`.

**Tests:** their existing component/page suites plus autosave/recovery helpers where behavior changes.

- [ ] Retain the current two-step creation dialog. Improve required-field labels, inline error placement, Back/Continue behavior, selected-location count and review of campus/floor choices.
- [ ] Verify input survives validation errors and Back/Continue; duplicate locations cannot be added; unavailable/unpublished locations have clear states; campus changes do not retain invalid floor selections.
- [ ] Test optional poster upload success, file rejection and upload/create failure without duplicate event creation. Clarify file constraints using the existing storage rules rather than inventing new limits.
- [ ] Keep one primary action per status: Continue draft, Revise maps, Edit maps for pending, View for approved. Use a secondary menu/disclosure for Duplicate/Delete where appropriate; withdrawal remains a clear secondary action with confirmation.
- [ ] Reduce competing Next step/history/feedback sections: compact guidance, visible unresolved count, expandable history and feedback. Keep organizer, campus, locations and current state easy to scan.
- [ ] Label pending saves accurately as updates to the existing submission; preserve Review & update GSO. Add one compact readiness indicator covering locations, layout blockers, unresolved feedback and save status.
- [ ] Add useful empty/loading/error states, consistent labels and grammar, responsive action placement and dark-mode styles using existing tokens.
- [ ] Regression-test first create, duplicate, edit details, unsaved navigation, refresh recovery, submission with warnings versus blockers, and failed submit retry.

**Checkpoint:** A new Student Org can create, design and submit a multi-location proposal with clear next actions and no lost inputs.

### Task 6 — Improve the admin decision and history experience

**Modify:** `src/pages/AdminEventLayoutsPage.tsx`, `src/components/events/EventRevisionHistory.tsx`, `src/components/ui/ThemedDateTimeField.tsx` only where review identifies a defect; service/history hydration if required.

**Tests:** admin-publication, history, date/time and service suites.

- [ ] Keep the queue compact: title/organizer, state, locations, submission time and changed-since-submission cue. Put review first; disclose raw account IDs rather than using them as primary identity.
- [ ] Check search, counts, filters, empty results and Pending priority without hiding older submissions or inventing submission dates.
- [ ] Arrange review as proposal summary → map/feedback inspection → decision/schedule. Keep history collapsed by default and footer actions visible without covering inputs.
- [x] Improve history labels for pin addressed/reopened, feedback updates, submission updates and withdrawal. Derive from recorded before/after data; do not fabricate historical events.
- [x] Clarify “Changes since submission” baseline. Distinguish no changes from missing/older-than-loaded-history baseline; the current RPC loads at most 100 entries.
- [ ] Verify 12 AM/PM conversion, minute 00/59 selection, start/end ordering, schedule-now versus scheduled publication, time-zone display and neutral initial guidance.
- [ ] Protect stale-review decisions after a student edit or acknowledgement. Show a readable refresh/review action and preserve unsaved admin comments when feasible.
- [x] Confirm publication summary shows when the event occurs and when students can see it. Success copy must distinguish approved/scheduled from currently visible.

**Checkpoint:** GSO can see what changed, inspect student fixes and make a valid decision without searching through oversized panels.

### Task 7 — Verify database roles, audit and publication behavior

**Read/extend:** `supabase/tests/event_revision_history_assertions.sql`, `event_feedback_resolution_assertions.sql`, `event_publication_management_assertions.sql`, `event_revision_readiness.sql`; `scripts/verify-event-full-pack.mjs`, `scripts/event-full-pack-verifier-safety.mjs` and its test.

**Create if needed:** `supabase/tests/event_feedback_resolution_roles.sql` for transaction-isolated role/ownership/concurrency assertions; use real authenticated test-role context, not SQL Editor superuser success as a substitute.

- [x] Extend public-feed checks to explicitly reject `feedbackResolutions`, `addressedBy`, resolution notes, actor IDs and nested private metadata as well as existing feedback/owner fields.
- [ ] Run the role and lifecycle cases in the acceptance matrix against a verified test database. Use owner Org A, unrelated Org B, regular student, admin, super admin and anonymous access.
- [ ] Validate writes cannot forge actor/time, edit feedback text, alter approved layouts, bypass open-pin resubmission checks or directly rewrite audit rows.
- [ ] Verify authenticated successful mark/reopen/resubmit/review commands persist and audit correctly; compare complete event metadata before/after failed commands.
- [ ] Test publication eligibility at controlled times: before scheduled publication, exact boundary, after event end, inactive event and missing/unpublished campus. Use injected clocks or fixtures rather than waiting in real time.
- [ ] Verify public previews exclude drafts, pending/rejected/private review metadata; check map locations and furniture against the published base snapshot.
- [x] Add a forward migration only for confirmed defects; document apply order, testing and remaining deployment step.

**Checkpoint:** Catalog checks, functional authorization checks and public visibility tests each have explicit results. If test credentials/environment are unavailable, mark only those checks BLOCKED and continue local/browser work.

### Task 8 — Integrated regression, visual acceptance and handoff

**Update:** `docs/verification/create-event-2026-10-03/results.md`, this checklist, acceptance matrix evidence column, and the current feature reports.

- [x] Run the full event test groups after the final implementation changes, then type diagnostics and production build. Fix introduced failures; explain existing unrelated diagnostics without changing unrelated features.
- [x] Verify the keyboard-driven owner feedback/retry journey: address both pins, block submit while one remains open, refresh, inject acknowledgement and submit 503 failures, retry without duplicate event or lost notes. Evidence: `keyboard-recovery-browser.json`.
- [ ] Complete all remaining J1–J7 permutations and the responsive/accessibility matrix, including live publication and keyboard pin authoring. Capture screenshots and console/network evidence for uncovered cases.
- [ ] Inspect browser screenshots, not just DOM snapshots: no clipped minutes, hidden actions, duplicate banners/headings, overlapping panels, missing pin markers or unreadable dark-mode colors.
- [x] Latest exercised browser paths recorded no page exceptions; React act/Radix warnings in tests are listed separately in the results.
- [ ] Review the combined diff for lost existing work, changed contracts, public/private data leakage and accidental schema rewrites. Check `git diff --check`.
- [x] Publish a concise implementation report with exact passed tests, database/browser evidence, unapplied migrations, blocked items and manual test steps. Leave commit/push/deployment to the user's explicit delivery instruction.

**Release gate:** All required implemented flow cases pass or are explicitly blocked with owner/next action. Do not label the entire event feature fully verified while required role tests or browser acceptance remain unrun.

## 5. Follow-up roadmap after the main gate

These are proposed improvements, not claims about existing functionality and not prerequisites to the current verification pass. Rank after Task 8 using the user's observed needs.

1. **Per-pin acknowledgement invalidation:** Preserve addressed status on untouched pins when the admin edits a different pin in the same location. Requires coordinated client/server per-pin fingerprints and a forward compatibility migration. Test unchanged/edited/moved/deleted/re-added pins, general location-comment changes, two review rounds and old encoded feedback. Do not auto-mark old unresolved issues as addressed.
2. **Visual map changes since submission:** Toggle added/moved/removed overlays against an actual recorded submission snapshot. Keep removed items distinguishable from current furniture and exclude base-map edits. Test multiple locations, rotation, deleted labels, missing snapshots, long histories and empty diffs. This extends the current text summary.
3. **Approved-event revision request:** New revision request linked to the approved version; the currently published version stays stable until GSO approves a replacement. Requires explicit lifecycle/product decisions and separate SQL design before implementation. Test reject/withdraw revision leaves published version intact, approved swap is atomic and permissions/history remain correct.
4. **Convenience after measured need:** search within large furniture summaries, filter feedback by current location, export a review summary. These do not imply furniture availability/reservation tracking or new notification delivery systems.

## 6. Definition of good UI for this plan

- One obvious primary action, consistent language and a visible save/review state on each screen.
- At desktop width, map plus one manageable supporting panel; at mobile width, a compact drawer/sheet with a reliable return to the map. Avoid stacked nested scroll areas.
- Touch controls aim for 44 px; focus outlines and accessible names remain visible. Status uses text/icons as well as color.
- Support 390×844, 768×1024, 1440×900 and 1920×1080; additionally inspect 200% zoom and short landscape height. Use measured browser overflow/geometry checks alongside screenshots.
- No unexpectedly opened tabs/windows for map preview; preserve review data, selected location and focus on return.
- Schedule inputs always expose hours, minutes and AM/PM; timestamp strings are consistent and never fabricated for legacy records.
- A network failure leaves the user's map, comment and intended action recoverable.

## 7. Verification commands for execution

Run from `C:\Users\Rj\Documents\GitHub\plv-navisync`. Use the existing tooling; if Windows sandboxing prevents Vite from reading config or spawning its worker, use the normal permission flow rather than changing the application to work around it.

Core event tests (unfiltered):

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__ src/pages/__tests__/StudentEventEditPage.pendingDraft.test.tsx src/pages/__tests__/StudentMyEventsAccess.test.tsx src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx src/services/__tests__/eventOverlayService.test.ts src/hooks/__tests__/useEventAutosave.test.tsx src/components/ui/__tests__/ThemedDateTimeField.test.tsx --maxWorkers=1 --reporter=dot
```

Relevant helper/public-preview regressions (PowerShell array avoids uncertain shell glob expansion):

```powershell
$eventHelperTests = @(rg --files src/lib/__tests__ | Where-Object { [IO.Path]::GetFileName($_) -like 'event*.test.ts' })
node node_modules/vitest/vitest.mjs run @eventHelperTests src/hooks/__tests__/useEventMapPreviews.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx src/components/map/__tests__/EventPreviewLayer.test.tsx src/components/map/__tests__/EventVenueLayer.test.tsx src/components/map/__tests__/EventMapPanel.test.tsx scripts/__tests__/event-full-pack-verifier-safety.test.ts --maxWorkers=1 --reporter=dot
```

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
git diff --check
```

The old verifier is a staging preflight with a deliberately stale mutation-shaped request; read its safeguards before running it. It is not a complete browser or resolution-role test suite. No production SQL execution command is prescribed here.

## 8. Execution prompt

> Execute `docs/superpowers/plans/2026-10-03-create-event-completion-and-uiux.md` inline, starting with Task 0. Read the companion acceptance matrix and current dirty working tree first. Preserve all existing work. Complete each task with its tests and browser evidence, update the checklist and results, and continue through the main plan. Reproduce suspected issues before changing behavior. Use a verified local/staging target for database write tests; report missing access precisely while continuing independent work. Do not reapply migrations the user already ran, implement the optional roadmap, create another chat, push, or deploy unless I explicitly request it. Do not claim live verification from mocks or build success.
