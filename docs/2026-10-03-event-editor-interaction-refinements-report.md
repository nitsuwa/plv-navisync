# Event editor interaction refinements

## Changes

- Collapsed Locations uses a 64px rail with clickable icons for every requested map, current-location styling, numbered indicators, themed hover/focus tooltips, and scrollable overflow. Removed the clipped label. Width transition respects reduced motion; the existing mobile sheet and tutorial target remain.
- Spacing hints use a footprint-relative threshold capped at four map units instead of twelve. Adjacent chairs do not create proximity hints; intersecting chairs still produce overlap warnings. Building, access, boundary, and actual intersection checks remain.
- Informational spacing hints no longer inflate the issue count or display “Review before submitting.” Actual warnings appear before optional tips.
- Confirm & design shows an animated preparation status during the actual request. Duplicate-submit protection and error recovery remain; no artificial timeout or completion percentage was added. The editor fades in on arrival, respecting reduced motion.
- Back opens the themed animated confirmation even when the draft is saved. Unsaved drafts offer Save draft & leave, Leave without saving, and Continue Editing. Saved drafts explain that they are saved and offer Back to My Events or Continue Editing. Pending autosave is paused while the confirmation is open; save failure keeps the editor open. Leave without saving discards only edits since the last successful save, not already autosaved changes.
- The existing shared leave dialog now respects reduced motion for its scale/slide transition.

## Verification

Pre-push verification: all 226 tests across 20 event/palette suites passed in one run, and the production build passed. This supersedes the narrower implementation checks below.

New seating and hints-only regressions failed against the previous behavior, then passed after implementation.

Seven focused suites cover 157 tests: EventFloorEditor, EventProposalModal, EventLocationSwitcher, EventLayoutIssues, StudentEventEditPage.pendingDraft, eventLayoutValidation, and eventPlacementCandidate. The combined run had one test-query ambiguity in the new creation-status assertion; the assertion was scoped to the review dialog, then both affected UI suites passed (17 tests). The other six suites in the combined run passed, including save/discard/failure protection and placement validation. No product-code failure remained.

Production build passed. Vite still reports its existing large-chunk advisory. Git whitespace validation passed. This is component/service-mock regression coverage, not a fresh authenticated Supabase end-to-end or visual browser run. Existing repository-wide TypeScript baseline errors were documented in the earlier review-fixes report; this work does not claim a clean repository-wide type check.

## Manual checks on localhost

1. Student Org → My Events → Create event → choose published campus and locations → Review → Confirm & design. During the request, observe preparation status; the map fades in. Slow requests can make the status easier to inspect.
2. In the desktop editor, collapse Locations. Hover/focus icons to see location names, switch between maps, and expand again. On mobile, use the location sheet.
3. Place chairs side by side without overlap: no proximity issue should appear. Overlap them: the actual warning must remain. Move an item into a building, access region, or beyond the canvas: corresponding checks must remain.
4. Click Back with unsaved edits. Continue Editing stays; Save draft & leave persists before exit; Leave without saving drops only edits since the last successful save.
5. Save the draft first, then Back: the saved-draft confirmation appears. Cancel or return to My Events.
6. Simulate a failed save in a disposable test session: Save draft & leave must keep the editor and its draft visible with the failure message.

No authentication, environment, database, publication, Git push, or deployment changes were made. Pre-existing local edits were preserved.
