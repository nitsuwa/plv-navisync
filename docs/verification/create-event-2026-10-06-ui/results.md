# October 6 Create Event UI fixes and verification

Verified locally on top of commit `4ea2618`, using existing Student Org and super-admin accounts. Product changes are uncommitted. Installed Edge was driven through actual Playwright UI actions at 1440×900, 390×660, and 740×480. No SQL, migration, account creation, approval/publication, commit, push, or deployment was performed.

| Requested correction | Outcome | Evidence |
|---|---|---|
| Place multiple toggle | PASS: compact control; thumb stays within its track in both states | `evidence/editor/placement-switch.png`, `editor-queue.json` |
| Placement warnings without generated IDs | PASS: entrance UUID stays internal; warning still blocks access and gives a simple instruction to move the item | `src/lib/__tests__/eventLayoutValidation.test.ts` |
| Drag existing furniture in Label mode | PASS: actual mouse drag moved the chair and left exactly one label; no stray text was placed | `evidence/editor/editor-queue.json` |
| Direct label editing | PASS: actual double-click, Enter, undo/redo, Escape, blur/Save, and reload | `evidence/editor/inline-label.png`, `editor-queue.json` |
| Submitter identity | PASS: admin sees the authenticated profile name separately from the organizer; name lookup is confined to the private admin UI | `evidence/fixed/admin-queue.png`, `evidence/editor/editor-queue.json` |
| Queue after withdrawal/deletion | PASS: owner withdrew through the UI; fixture disappeared from the already-open admin queue without page reload; owner deleted it through the UI and readback confirmed absence | `evidence/editor/editor-queue.json` |
| Feedback pin presentation | PASS: 24px draft marker and numbered pin, with a subtle halo/tip and larger saved-pin hit area; local pin was discarded without committing feedback | `evidence/editor/compact-draft-pin.png`, `compact-saved-pin.png` |
| Event/publication date and time | PASS: start date, explicit calendar-day selection, scheduled publication date/time, hour 12, minute 00/59, AM/PM, mobile Done visibility, short-landscape selection, and Escape focus restoration | `evidence/fixed/review-controls.json`, `calendar.png`, `time-desktop.png`, `time-mobile.png`, `time-landscape.png` |

## Findings that affected the fixes

- Text-mode furniture displayed a movement cursor, but its pointer handler refused the drag. The editor now selects/moves its existing objects in placement tools; only blank map space places a new item/label. Item/chrome presses remain distinguished from blank canvas clicks even when no drag starts.
- Real browser pointer capture sends the synthesized double-click to the stable canvas rather than the original label. A stationary recorded label press now routes that event to the inline editor. Both a failing browser journey and a failing captured-pointer regression test reproduced this before correction. Locked/read-only labels remain protected.
- Desktop date/time selection worked in the initial read-only baseline, so the entire reported selection problem was not reproduced at that size. A short-landscape run did reproduce inaccessible minute buttons: available popup height collapsed the scrolling columns under the header/footer. Short viewports now use a centered nested time dialog; normal heights keep a popup. The final five review-control checks passed.
- The legacy `TEST` and `TEST: College Week 2026 (sample)` are distinct database records with different owners. Legacy `TEST` remains Pending, has no recorded submission timestamp, and belongs to the Demo Student account; the sample belongs to the current Demo Student Org. Neither existing event was altered or deleted. Title/organizer similarity is not treated as identity.
- Admin refreshes on focus, becoming visible, and every 15 seconds while visible. Background refresh preserves the page and current queue if a read fails, excludes drafts, and closes withdrawn/deleted targets. Profile names use existing RLS-protected reads of only ID/first/last name; unknown names get an honest fallback and are not persisted into public event metadata.

## Verification and cleanup

- Five affected regression suites passed: **168 tests** across the editor, layout validation, admin queue/publication controls, date/time field, and event service. Initial tests reproduced missing inline editing, text-mode furniture drag, exposed entrance IDs, missing submitter names, and stale queues. Captured-pointer double-click was separately observed failing before its fix and passing afterward.
- Actual UI authoring/submit/preview/withdraw/delete runner: **8/8 PASS**, `errors: []`, `cleaned: true`. All earlier attempts also cleaned their uniquely owned QA rows; retained audit history was not removed. Harness corrections involved waiting for the tour and matching the actual owner article/button labels. One deliberately moved chair hit a building and was correctly blocked at submission; the final test kept it on open grounds.
- Read-only review control runner: **5/5 PASS**, `pageErrors: []`. Schedule choices and staged pins were discarded. Screenshots listed above were visually inspected.
- Final production build passed, with the existing large-chunk advisory.
- Full repository TypeScript check remains FAIL with errors in unrelated modules/tests. The final diagnostic file `typescript.txt` contains no diagnostics for the modified production event/UI files. This is separate from the passing production build and targeted regressions.
- Earlier acceptance-matrix gaps, including positive live publication, are not marked complete by this UI-fix pass.

To review the fixes locally: Student Org → edit a draft → Label → drag an existing item, double-click its label, type, Enter, save/reload. Admin → Event Layouts → verify Submitted by; review the event dates/time on desktop and a small viewport. Owner withdrawal should remove that same event from an already-open admin queue within the next visible refresh.
