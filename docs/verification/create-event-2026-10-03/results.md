# Create Event execution evidence

Execution started October 3, 2026 (Asia/Manila). Branch: main, continuing the user-authorized existing dirty checkout. Existing changes preserved. Optional roadmap excluded.

## Latest continuation — poster and remaining browser cases

- Fresh event core **266 tests / 24 files PASS** (`core-continuation.log`). Unchanged helper/public suite previously verified **156 PASS**, combined coverage 422. After the final focus-only fix, affected proposal suite **14 PASS** (`poster-keyboard-final.log`). Final build PASS (`build-continuation.log`). Full TypeScript still FAIL with **1,005 baseline diagnostics**; no errors in changed runtime files or newly added event tests.
- `poster-browser.json`: actual PNG create, upload failure, save failure after upload, lost committed-create response, cached retry with exactly one draft, saved poster reload, replacement save failure/retry without reupload, replace/reload and remove/reload PASS. Fixture `200a718a-10f2-4092-a663-fbfadf0c1688` and QA images cleaned. Removal clears the event reference without deleting potentially shared contents.
- `poster-permissions.json`: **12 live checks PASS**. Org own-folder upload/list/delete and admin inspection; anonymous/student upload and listing denial, no unauthorized deletion; Org wrong-owner-folder upload denial and overwrite denial. Authoritative listing verifies deletion; public URLs may briefly retain cached bytes. No unrelated Org account invented.
- `feedback-browser.json`: actual admin UI places two pins and saves only to the review draft; disapproval then persists both; owner/mobile acknowledgement/resubmit/admin-note cycle PASS. Two independent owner browsers/stale admin review and later feedback invalidation, failed acknowledgement retaining note/state, keyboard retry/reopen PASS. All QA fixtures cleaned. Initial map/submission and later review were API-seeded; initial pin/rejection decision is actual UI. The later keyboard-only owner recovery segment is recorded below; admin pin authoring itself was not keyboard-driven.
- `duplicate-browser.json`: mobile rejected duplicate creates an owned fresh Draft with copied labels and no inherited feedback/resolutions/approval/schedule; submit → withdraw → continue → resubmit retains layout PASS. Source `af548063-fdd8-45c7-b8cb-e45c36b0af6a` and copy `10dca388-217d-45db-a9d5-d65228204ac9` cleaned.
- `keyboard-browser.json`: mobile creation Tab/Shift+Tab trap, dark layout containment, Escape focus return and body-scroll restoration PASS. Initial failure retained in `keyboard-browser-red.json`.
- Fixed missing persisted-poster removal, stale editor/form/submission writes and creation focus return. Save checks receive the version originally displayed to the caller and retain database compare-and-swap protection. Stale callers retain local edits and get a reload instruction. RED/GREEN evidence: `stale-editor-*`, `stale-form-*`, `poster-remove-*`.
- Earlier failed probes cleaned their own rows/images; a no-ID failed-create probe created no event. Audit/history remains. No new migration/account/existing-event mutation, commit, push or deploy.

## Environment and fixtures

- Current Supabase screenshots show a PRODUCTION branch; user confirmed migrations/helper assertions through successful SQL screenshots.
- The user explicitly authorized the existing project and accounts after the staging question. Functional authenticated tests used only disposable new QA events. No users/projects provisioned, passwords reset, or existing events mutated.
- Browser UI connector initialization failed: missing kernel assets path. Actual browser inspection used installed headless Edge through bundled Playwright.
- API fixture `b7a0654c-7140-450b-9d6b-b2fcd2463cb4`: created and cleaned successfully. Browser fixture `1b45abc6-49b7-44d9-a738-def8fe3afef4`: created and cleaned successfully. Two earlier tour-related browser timeouts also cleaned their QA rows. Audit/history records retained as designed.

## Baseline

- Final full core suite: 24 files, **263 passing tests** (`core-final.log`). Helper/public-preview suite: 23 files, **156 passing tests** (`helpers-final.log`). Both unfiltered command groups are from section 7 of the main plan.
- TypeScript: **FAIL**, 1,005 diagnostics versus 1,010 in the baseline. Pre-existing repository issues remain in map-builder/generated contracts/test fixtures. No diagnostics in changed event runtime files. Vite does not replace type checking.
- Existing feature evidence: user migration/catalog screenshots; previous 46 related tests/build before the final compatibility adjustment. These are historical, not this run's acceptance results.

## Task ledger

| Task | Status | Evidence |
|---|---|---|
| 0 baseline | Recorded | dirty main preserved; actual accounts, diagnostics and browser evidence |
| 1 parsing/persistence | Implemented/tested | invalid neighbors/timestamps; client/server resolution persistence; RPC types |
| 2 concurrent operations | Implemented/tested | mutation gates, deferred race tests, updated_at checks on draft/details/submit |
| 3 feedback workflow | Implemented/tested | filters, locate pin, first-open-issue focus; actual owner notes/reload/resubmit/admin inspection |
| 4 preview consistency | Implemented/inspected | stable Pan, unsaved-pin confirmations, 30-pin cap, toolbar/landscape, furniture summary |
| 5 create/event UX | Implemented; basic live poster storage PASS | stable retry UUID, validation/cache/remove, protected cleanup, list retry, approved inspection |
| 6 history/review | Implemented/tested | address/reopen history; missing baseline copy; discard guard; 12-hour minute59 browser check |
| 7 roles/publication | Partial | 19 live API checks; missing Org B/non-super admin; positive live approval not run |
| 8 integration | Evidence recorded; release gate PARTIAL | remaining full browser journeys and new poster migration below |

## Fresh verification and actual browser results

- Core **263 PASS** + helper/public **156 PASS** = **419 tests**. Last affected focus/editor/proposal suite: 32 PASS. Replacement-poster/admin controls suite: 18 PASS; included in the full run.
- Production build **PASS** (`build-final.log`), with bundle-size warnings. `git diff --check` PASS; line-ending warnings informational. No commit/push/deploy.
- Test-only React act and JSDOM scroll warnings remain. Successful browser runs captured no page exceptions on exercised screens.
- `live-fixture.json`: 19 passing authenticated API checks: private-data denial for student/anonymous, forged-audit denial, pending status/submittedAt preservation, stale review/ack rejection, reject with pin, open-pin submit gate, notes/actor/time, reopen, resubmit, history, withdraw retains furniture, recursive public privacy/draft exclusion.
- `current-session.json`: existing active `student_org`, `super_admin`, `student` sessions; creation dialog/queue/review, minute59 + 12 PM, shared preview, Pan/H/0, wheel containment, nested summary, visible draft marker, canceled discard retains comment, staged pin retained in review and outer discard guard. No persistent decisions in this inspection run.
- Screenshots inspected at 390×844, 768×1024, 1440×900, 1920×1080 and 844×390; preview light/dark. 720×450 is an effective constrained viewport, **not native 200% browser zoom**. Landscape canvas measured over 120 px after removing extra header rows.
- `feedback-browser.json`: actual owner UI locates/acknowledges pin one, submit is blocked while pin two remains open, acknowledges pin two on mobile, reloads/resubmits, then actual admin UI sees both notes. Initial rejection/map data were API-seeded: this is the feedback/resubmit segment of J3, not the entire journey from first creation.
- `create-browser.json`: J1 PASS through actual UI creation, two published locations, chair/labels, saving both locations, reload, submission and admin inspection of the second map. L03 PASS for cancel/confirm withdrawal preserving both layouts. Fixture `47cb6c43-2100-4f2a-b46b-0d0d2973ca1e` cleaned successfully; no browser page exceptions. Counts are checked after each location save, not only after submission.
- This browser journey exposed and verified fixes for JSONB object-key ordering causing false dirty states, an older save callback capturing the newly selected floor's editor snapshot and overwriting the previous location, and simultaneous nested-dialog mounting hiding the direct card preview from the accessibility tree. New deferred/key-order regressions failed before the fixes and passed afterward; both preview entry paths now have actual browser coverage.
- Existing project: `aaketmqvxqjgaznvclqc.supabase.co`. Local URL `http://127.0.0.1:5173`. Installed headless Edge through bundled Playwright. No credentials/session tokens persisted in evidence.

## Poster SQL — user applied; basic live storage PASS

The initial missing-bucket blocker is resolved. User supplied a successful migration screenshot; fresh `poster-storage.json` confirms existing Org upload, anonymous public read HTTP 200 with exact image bytes, and cleanup PASS. Both disposable probes were deleted; no event rows changed. Existing `event-images` remains admin-only. Do not rerun the migration's CREATE POLICY statements.

1. User applied `supabase/migrations/20261003213000_event_poster_storage.sql` in SQL Editor: public poster contents, 5 MB JPEG/PNG/WebP, owner-folder Org upload, owner/admin listing/deletion, no overwrite policy. BEGIN/COMMIT included.
2. User ran `supabase/tests/event_poster_storage_assertions.sql`: PASS shown in screenshot `codex-clipboard-8a80422c-b514-4366-aed8-598e1af363b2.png`. Bucket visibility, 5 MB limit, three MIME types and presence of the three named policies checked inside ROLLBACK. This is user-observed catalog evidence, separate from the authenticated functional tests.
3. Run `node scripts/verify-current-event-poster.mjs`: existing Org disposable upload/public-read/delete probe.

Poster catalog assertions now have user-observed PASS evidence. Actual poster form/retry and available identity storage permissions also PASS, as detailed in the latest continuation. Another Org identity remains unavailable. Retry reuses its upload and stable creation UUID. Cleanup reads the event's persisted poster URL before deletion so a lost successful-save response cannot remove a referenced image.

## Remaining acceptance work — main plan only

- Another Org identity for cross-Org storage cases. Poster catalog, actual create/edit/retry and available storage permission cases now PASS.
- Positive live approval/publication J6 and approved duplication remain blocked; the keyboard-driven owner recovery/retry segment of J7 now PASS, while admin pin authoring remains API-seeded. Actual admin-UI pin decision round, J2 competing saves, J4 retry/reopen/later-round segments and rejected duplicate/J5 withdrawal-resubmission PASS.
- Real touch/pinch/pointer cancellation, native 200% zoom, remaining dialogs' focus-return/Tab trap and every listed screen in both themes remain unverified. Current preview/editor/review evidence is not universal a11y certification.
- Unrelated Org B and separate non-super admin functional checks: existing configured identities unavailable. No additional accounts created, per user instruction.
- Positive live approval fixture: applied event guard blocks deleting approved rows, including administrators. Controlled-clock automated coverage passed. A transaction/SQL-administration connection or supported fixture-retirement command is needed to avoid a lasting approved QA event; no bypass introduced.

Release gate is **PARTIAL**, not a claim that Tasks 0–8 and J1–J7 have all passed. Optional future roadmap was not implemented.

## Manual checks after SQL

1. Org: create with poster and two published locations → design each → save/reload → review/submit.
2. Admin: either preview entry → Pan/H/Space/0, zoom, summary → position visible draft pin → save to review → request revision.
3. Org: Show on map → fix → note/Mark as addressed. Submit with one Open pin must reveal/focus it; address all → reload → resubmit.
4. Admin: inspect notes/latest map; stale review must fail; validate Philippine 12 AM/PM, minute59 and schedule/publication ordering.
5. Student/anonymous: only eligible public event, no private feedback/resolutions/audit metadata. Test unrelated identities when configured.

## October 4 continuation — keyboard recovery, map shortcuts, focus restoration

- A fresh event-core regression run passed **268 tests in 25 files** (previous total 266 + two focus-restoration regressions). The final affected admin modal/page suites passed **7/7** after the last ref wiring adjustment. The `act(...)`/Radix presence warnings are test-harness warnings; the browser journeys recorded no page exceptions.
- Found and fixed a real keyboard usability defect: closing the requested-map preview or admin review left focus on `<body>` because each controlled dialog has no Radix trigger of its own. Both dialogs now explicitly return focus to the button that opened them. The new regression tests first failed with focus on `<body>`, then passed. Headless Edge also verified focus return after discarding an unsaved map pin and closing the parent review; body scrolling is restored.
- `preview-controls-browser.json`: `Space + drag` temporarily pans with persistent Pan off; `Ctrl + wheel` zooms the map (0.619203 → 0.649726) without scrolling the outer page; Focus items and `0` refit work; `H` is ignored outside the map canvas and text fields still accept `h`/Space. No browser exceptions. A single pin remained local and was discarded; no database state changed.
- `keyboard-recovery-browser.json`: using the existing Student Org account and a disposable event, keyboard Tab/Enter/typing resolved feedback, an open pin blocked submission, refresh retained both resolutions, injected 503 acknowledgement and submission failures preserved notes/proposal state, retries succeeded, and exactly one event remained. The fixture was withdrawn/deleted by ID after the run (`cleaned: true`); normal audit history remains. Initial rejected state/pins were seeded through authenticated APIs, so this does not claim a fully keyboard-authored admin review.
- Final production build **PASS** (`vite build`, 1m34s); existing large-chunk warnings remain. `git diff --check` **PASS** with informational Windows line-ending warnings.
- Full TypeScript still exits non-zero with **1,005 diagnostics**, matching the recorded baseline count; zero diagnostics reference the changed admin focus files or their regression tests (`typecheck-final-focus.log`). This remains a repository-wide baseline issue.
- Headless Edge cannot measure browser-level zoom: Ctrl+Plus left `devicePixelRatio=1`, `innerWidth=1440`, and `visualViewport.scale=1` (`preview-controls-browser.json`). Native 200% zoom is **BLOCKED**, not passed; a real browser/window or user device is needed. Physical touch, pinch and pointer-cancel behavior also remain unverified.
- No additional accounts were created; no migration was rerun; no commit, push or deployment was made. No SQL is needed from the user for this continuation. Positive live publication remains unrun because a successful approval is protected from deletion and would leave a permanent approved QA event in this production project. Org B and separate non-super-admin checks remain blocked because those identities are not configured.

Release gate remains **PARTIAL**. Manual follow-up, if desired: inspect the preview at native 200% browser zoom and test touch/pinch on a touchscreen; provide already-existing Org B/non-super-admin accounts only if those role checks are required. Do not create them just for this run.
