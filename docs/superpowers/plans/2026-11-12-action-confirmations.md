# Action Confirmations Implementation Plan

**Goal:** Add confirmation to the eight action groups identified in the audit.

**Architecture:** Reuse the existing confirmation dialog and existing mutation handlers. Gate each action before its service call; keep authentication and persistence logic unchanged. Use dirty-form protection for losing edits, coordinating it with logout and existing editor guards.

**Tech stack:** React, TypeScript, React Router, existing dialog components, Vitest and React Testing Library.

## Scope and constraints

- Only confirmation behavior, necessary guard integration, and focused tests are included.
- No redesign, database changes, dependency additions, unrelated refactors, feature expansion, commit, push, or deployment.
- Existing confirmations remain intact; avoid stacking duplicate prompts for the same decision.
- Scope excludes optional extra confirmations for event-map review/publication dialogs that already provide deliberate review.
- Implement sequentially; recheck current source and existing tests before modifying each area.

## Shared interaction rules

- Initial action opens a dialog without executing the action.
- Cancel, Escape, or permitted backdrop dismissal leaves data and session unchanged.
- Confirmation identifies the action and affected item, and offers explicit Cancel and action buttons.
- Default focus goes to the safe action. Trap focus, label the dialog, and restore focus on cancellation.
- While executing, block duplicate submissions and dismissal that could conceal an in-flight operation.
- On failure retain the pending action, display an error, and allow retry or cancellation.
- Reuse ConfirmDialog where its current API supports these requirements; make only necessary compatible additions.

## 1. Shared dialog and sign-out

**Files:** `src/components/ui/ConfirmDialog.tsx`, `src/components/layout/AdminSidebar.tsx`, `src/components/layout/Navbar.tsx`, `src/components/ui/MoreSheet.tsx`, `src/components/map/MobileMapAccountMenu.tsx`; existing unsaved-change context and student event editor integration only where needed.

- [ ] Add focused tests proving each account menu leaves authentication untouched until confirmation.
- [ ] Introduce reusable sign-out confirmation behavior for Student, Student Organization, Admin, and Super Admin.
- [ ] Use “Sign out?” with Cancel / Sign out actions.
- [ ] Coordinate dirty-state resolution before calling signOut: save successfully or explicitly discard, then complete the confirmed sign-out. Cancellation or failed save must retain the session.
- [ ] Preserve the Map Builder's existing unsaved/unpublished guard. Ensure the Student Organization editor resolves changes before authentication clearing; a router blocker after signOut is too late.
- [ ] Verify clean logout, dirty logout, cancelled logout, failed save, repeated clicks, and sign-out failure.

## 2. Campus event listing publication

**File:** `src/pages/AdminEventsPage.tsx`.

- [ ] Cover the listing Publish button and Create/Save when the form changes visibility to Published.
- [ ] Confirm with event title, schedule, and visibility consequence before creating/updating the published record.
- [ ] Also guard a Published-to-Draft status change through the form, explaining that students will no longer see the listing.
- [ ] Cancel keeps form values; confirmation calls the existing save/publish handler once.
- [ ] Test both entry paths, cancellation, failure/retry, and ordinary draft saves without publication prompts.

## 3. Announcement publication

**File:** `src/pages/AdminAnnouncementsPage.tsx`.

- [ ] Gate direct Publish and form-based transitions to Published with the announcement title and visibility consequence.
- [ ] Guard form-based transitions away from Published; preserve the existing archive confirmation.
- [ ] Keep unchanged-status edits and draft saves as ordinary saves.
- [ ] Test direct and form publication, cancellation preserving edits, and failure/retry.

## 4. Organization activation changes

**File:** `src/components/events/AdminOrganizationsPanel.tsx`.

- [ ] When an existing organization's active status changes, require confirmation before Save applies it.
- [ ] Explain that deactivation blocks access to event drafts, or that reactivation restores eligibility subject to existing assignment rules.
- [ ] Keep name/code-only edits and creation on their existing save path.
- [ ] Test both status directions, cancellation, and persistence failure.

## 5. Report archiving

**File:** `src/pages/AdminReportsPage.tsx`.

- [ ] Replace immediate Archive execution with a confirmation showing the report identity.
- [ ] Describe actual archive behavior from the existing service; do not imply permanent deletion or a restore feature that does not exist.
- [ ] Confirm invokes the existing archive handler; Cancel leaves the report detail open.
- [ ] Test cancellation, one successful archive, and error/retry.

## 6. Shared platform settings

**File:** `src/pages/AdminSettingsPage.tsx`.

- [ ] Before saving changed public platform settings, show a concise before/after summary and explain the effect on students.
- [ ] Include changes such as hiding approved event overlays, campus defaults, and route defaults.
- [ ] Personal notification-only changes retain the existing ordinary Save behavior.
- [ ] Confirmation saves the reviewed values through the existing handler; cancellation preserves the draft.
- [ ] Test public-only, notification-only, mixed changes, cancellation, and failure.

## 7. Ending active navigation

**Files:** `src/components/map/UnifiedRoutePlannerDialog.tsx`, `src/pages/CampusMapPage.tsx`.

- [ ] Gate End Navigation with “End navigation?” and Keep navigating / End navigation.
- [ ] For SOS guidance, explain that ending stops the current emergency directions.
- [ ] Keep the route and its clocks running until confirmation; then execute the existing cleanup callback once.
- [ ] Preserve existing campus-switch and tour confirmations; avoid a second prompt on those confirmed paths.
- [ ] Test regular and SOS navigation, cancellation preserving route state, and confirmed cleanup. Arrival Done remains its existing action.

## 8. Discarding unfinished forms

**Files:** `src/pages/AdminAnnouncementsPage.tsx`, `src/pages/AdminEventsPage.tsx`, `src/pages/AdminUsersPage.tsx`, `src/components/events/AdminOrganizationsPanel.tsx`, `src/components/map/ReportModal.tsx`, `src/pages/AdminSettingsPage.tsx`.

- [ ] Track each form against its opened or last successfully saved baseline, including report text, selection, and attached photo.
- [ ] Guard Cancel, close button, Escape, backdrop, and navigation away when they would discard edited values.
- [ ] Use “Discard unsaved changes?” with Keep editing / Discard changes.
- [ ] Integrate the same dirty state into sign-out so declining discard retains authentication.
- [ ] Use React Router blocking for route exits and beforeunload for reload/tab close. The browser controls unload prompt wording.
- [ ] Reset the baseline after successful save; successful submission/close must not trigger a discard prompt.
- [ ] Reuse existing editor guards rather than replacing them. Limit shared guard additions to these forms and sign-out integration.
- [ ] Test unchanged forms, edited forms, reverted edits, every supported dismissal path, successful save, failed save, and sign-out cancellation.

## Verification and completion

- [ ] For each task, first add behavior tests that reproduce its missing protection, run them to observe failure, implement the minimum change, and rerun.
- [ ] Assert that service calls and session clearing do not occur before confirmation or after cancellation; confirmation triggers exactly one call.
- [ ] Run the affected existing suites and the production build. Report unrelated baseline failures separately without expanding scope.
- [ ] Check desktop/mobile dialog fit, keyboard focus, Escape, safe default focus, and focus restoration using local fixtures or mocked services.
- [ ] Exercise all four roles for sign-out and authorized roles for each protected module without mutating live production data.
- [ ] Review the final diff for only scoped confirmation changes and tests.
- [ ] Report completion against all eight groups, verification results, and any remaining limitations.

**Acceptance:** All eight audited action groups have the specified protection; cancellation preserves data, drafts, navigation, and sessions; existing confirmed workflows continue to work.

## Implementation record

- Implemented the eight groups on `codex/action-confirmations` using the shared confirmation helper and unsaved-form registry.
- Public mutation confirmations retain errors for retry; sign-out preserves the existing session-clearing/error path after user confirmation and draft resolution.
- Automated coverage includes cancellation, mutation gating, navigation, reload guards, and event-editor prelogout save/discard decisions.
- Production build passes with the existing large-chunk warning. No live database writes were needed.
- Pre-merge browser smoke verification passes in headless Edge at 1440px and 390px: cancellation, confirmation, retained failure and retry. External requests were blocked; physical-device checks remain unperformed.
