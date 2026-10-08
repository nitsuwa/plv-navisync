# Create Event browser QA execution checklist

Plan: `docs/superpowers/plans/2026-10-04-create-event-browser-acceptance.md`. Original browser pass ran October 4; the latest-main revalidation ran October 6. Historical and current evidence are identified separately. A checked box means an outcome and evidence were recorded; the Result column distinguishes PASS/FAIL/BLOCKED/NOT RUN.

Metadata: revalidated commit `4ea2618` (same as fetched `origin/main` after fast-forward); local Vite `http://127.0.0.1:5173`; bundled Playwright driving installed Edge, headless 1440×900 with 390×844 viewport checks; existing Org, regular student, admin and anonymous test clients; run date 2026-10-06 PHT. See results.md. No secrets stored.

| Accounted for | Case | Scenario | Result | Evidence / actual result / blocker | Cleanup |
|---|---|---|---|---|---|
| [x] | B00.1a | Commit and dirty-tree baseline | PASS | Fetched GitHub `main`; fast-forwarded local branch from `d1b0667` to `4ea2618` (`origin/main`); existing uncommitted QA/docs changes preserved. See results.md | No fixture |
| [x] | B00.1b | Existing roles and published locations | PASS | Existing Org/admin authenticated in UI; regular student/anonymous used for poster-storage denial checks; two published locations selected through UI. Event-row UI restrictions for regular student remain NOT RUN | No fixture |
| [x] | B00.1c | Forward migration state | BLOCKED | Database migration catalog status could not be checked because SQL execution was explicitly out of scope; prior handoff said `supabase/migrations/20261004120000_event_review_integrity_forward_fixes.sql` was unapplied | No DB writes |
| [x] | B00.4a | UI fixture and cleanup | PASS | Merged-main UI-created J1, J3, pending-update and poster fixtures were withdrawn/deleted; uniquely owned poster objects removed; the storage-role object test cleaned its random paths. No personal or account data in fixture titles | All reported clean |
| [x] | B00.4b | Invalid/oversize poster input | PASS | Revalidated on merged main: in-memory GIF + 5 MiB+1 PNG selected through actual file input; both were rejected, title retained, and no storage POST or proposal row occurred. See current `evidence/poster-constraints-browser.json` and inspected `poster-invalid-type.png` | No fixture persisted |
| [x] | B01.1a | Missing-title validation | PASS | Empty title triggered inline alert; completed creation after filling title | Fixture cleaned |
| [ ] | B01.1b | Other required fields/whitespace/long text | NOT RUN | Organizer/location/whitespace/long-field validation not exercised | No fixture |
| [x] | B01.2a | Grounds + published floor | PASS | Visible UI selected Campus Grounds and Student Center Ground Floor; both appeared in proposal/review | Fixture cleaned |
| [ ] | B01.2b | Back/continue/duplicate/campus switch/unavailable floor | NOT RUN | These location selection permutations remain untested in current pass | No fixture |
| [x] | B02.1a | Place furniture and labels | PASS | UI placed a chair + label on grounds and label on second floor; per-location persistence checked | Fixture cleaned |
| [ ] | B02.1b | Move/rotate/resize/delete/undo/redo/base-map lock | NOT RUN | Transform/undo and base-layer immutability not exercised | No fixture |
| [x] | B06.4a | Feedback acknowledgement failure/retry | PASS | Re-run on merged main: injected 503 preserved the typed note and server state; Enter-key retry saved once, then reopen returned it to open. See `evidence/feedback-recheck-main/feedback-browser.json` | Fixture cleaned |
| [ ] | B06.4b | Offline/timeout/expired-session/missing-RPC | NOT RUN | These failures were not exercised in current fresh pass | No fixture |
| [x] | B00.2 | Startup | PASS | Merged-main Vite started cleanly; `CampusMapPage.tsx` transformed with HTTP 200/no Vite error; Create Event, editor and admin routes completed UI flows. The prior parser errors are resolved in merged source | Stopped after testing; port 5173 is closed |
| [x] | B00.3 | Browser | PASS | Built-in connector failed kernel assets; installed Edge + bundled Playwright completed current merged-main UI journeys. Browser page errors were empty for the completed runners | Contexts closed |
| [x] | B00.5 | Publication gate | BLOCKED | No supported retirement path known for approved event in production project; approved row must not be left behind | No fixture |
| [x] | B01.3 | Full UI creation | PASS | Revalidated after fast-forward to `4ea2618`: UI uploaded a poster, selected two published locations, placed chair/labels on separate maps, saved/reloaded, submitted, and admin inspected the second map. Poster URL fetched successfully. See current `evidence/create-browser.json` | Event deleted and owned poster removed |
| [x] | B01.4 | Poster constraints | PASS | Revalidated on merged main: create form rejected GIF and 5 MiB+1 PNG; accepted genuine browser-generated JPEG/WebP; remove, Keep editing, discard, and reopen left no stale title/poster. Zero uploads/event rows. See current `evidence/poster-constraints-browser.json` and inspected poster screenshots | No fixture persisted |
| [x] | B01.5 | Edit details/poster | PASS | Revalidated on merged main: Edit details poster replacement/removal and save/reload passed; cancel-edit behavior remains untested. See current `evidence/poster-browser.json`; inspected `poster-details-removed.png` | Poster fixture/object cleaned |
| [x] | B01.6 | Poster retry | PASS | Revalidated on merged main: upload 503, save 503 after upload, lost committed response with one-event retry, replacement fail/retry all passed. See current `evidence/poster-browser.json` | Poster fixture/object cleaned |
| [x] | B02.2 | Two-location persistence | PASS | Revalidated on merged main: two maps saved separately; first remained intact after second save; reload payload equality passed. See current `evidence/create-browser.json` | Fixture cleaned |
| [ ] | B02.3 | Autosave | NOT RUN | Rapid autosave response ordering not tested in current browser run | No fixture |
| [ ] | B02.4 | Dirty navigation | NOT RUN | Unsaved-work Save/Discard/Cancel on location switch, Back, route exit, and reload were not fully exercised | No fixture |
| [x] | B02.4a | Switch after saved state | PASS | Revalidated on merged main: after visible Saved and read-only server readback, owner switched maps three seconds later without a Leave event editor prompt; label persisted. See current `evidence/location-switch-after-save.json` | Fixture cleaned |
| [ ] | B02.5 | Readiness | NOT RUN | No critical blocker vs advisory warning pair exercised | No fixture |
| [x] | B03.1 | First submit | PASS | Revalidated on merged main with UI-uploaded poster: review listed both maps/counts and checks; one Pending submission preserved layouts; admin inspected second map. See current `evidence/create-browser.json`, `create-submission-review.png`, `create-admin-second-map.png` | Fixture withdrawn/deleted; poster object removed |
| [x] | B03.2 | Pending update | PASS | Revalidated on merged main through UI: owner submitted, edited/saved a map, reviewed and confirmed the update; status stayed Pending, original submittedAt stayed unchanged, label persisted; admin preview showed the same chair + label. See current `evidence/pending-update-browser.json`, `pending-update-review.png`, and `pending-update-admin-preview.png` | Fixture withdrawn/deleted |
| [x] | B03.3 | Withdrawal | PASS | Revalidated on merged main: cancel kept Pending; confirmation withdrew same event to Draft with both maps intact. See current `evidence/create-browser.json` | Fixture cleaned |
| [x] | B03.4 | Rejected duplicate | PASS | Revalidated on merged main: disapproved source was API-seeded as a precondition; duplicate, new Draft inspection, submit, withdraw, continue and resubmit all used mobile UI. Copy had distinct ID and did not inherit review state; both QA rows cleaned. See current `evidence/duplicate-browser.json` | Fixtures cleaned |
| [ ] | B03.5 | Rapid/retry | NOT RUN | Double-click/retry transitions not tested in current browser run | No fixture |
| [ ] | B03.6 | Delete/empty list | NOT RUN | Owner UI delete-confirm path passed on merged-main rerun; cancel and empty-list/load failure states remain NOT RUN, so aggregate case is incomplete | Fixture cleaned by UI |
| [x] | B03.6a | Confirm deletion | PASS | After withdrawing the resubmitted J3 fixture to Draft, owner opened the actual delete confirmation and confirmed `Delete event`; read-only lookup confirmed the row was absent. See `evidence/feedback-full-ui-browser.json` and `evidence/feedback-full-ui-failure.png` (modal visible; earlier runner selector mismatch only) | Fixture deleted by owner UI; audit history retained |
| [ ] | B03.6b | Cancel/empty states | NOT RUN | Delete cancel, final empty-list and list-load failure states not exercised | No fixture |
| [x] | B04.1 | Queue | PASS | Revalidated on merged main: queue fields and All count matched; exact title and partial organizer searches filtered correctly; no-match state was distinct; Pending/Approved/Disapproved counts and empty states matched their rows. See current `evidence/admin-queue-browser.json`, `admin-queue-desktop.png`, `admin-queue-empty-search.png` | Read-only; no fixture |
| [x] | B04.2 | Entry parity | PASS | Revalidated on merged main: nested Preview requested maps showed the same two locations, chair and labels; close returned to review without a new page/window. See current `evidence/create-admin-second-map.png` and `create-browser.json` | Fixture cleaned |
| [x] | B04.3 | Pan/zoom | PASS | Revalidated on merged main: Space+drag pans without toggling Pan; Ctrl+wheel zoomed map (0.619203→0.677395) without outer scroll; Focus items and 0 refit; H is canvas-scoped. See current `evidence/preview-controls-browser.json`, `preview-controls-desktop.png` | No server changes; staged review discarded |
| [x] | B04.5 | Summary | PASS | Revalidated on merged main: actual admin Furniture summary showed per-location counts and event items only; no permanent campus furniture included. See current `evidence/create-admin-second-map.png` and `create-browser.json` | Fixture cleaned |
| [ ] | B05.2 | Accidental actions | NOT RUN | Accidental drag/toolbar/cancel/location-switch pin behavior not exercised | No fixture |
| [x] | B05.3 | Persist review | PASS | Revalidated on merged-main code with an event created/submitted through Student Org UI: admin staged two visible pins; readback confirmed neither persisted until Disapprove; both then persisted. See `evidence/feedback-full-ui-browser.json` and `feedback-full-admin-pin-draft.png` | Fixture deleted by owner UI |
| [x] | B05.4 | Owner resolves | PASS | Revalidated end-to-end from UI-created event: owner added Table, wrote note, acknowledged pin 1; open pin 2 blocked submit; mobile owner added Chair, acknowledged pin 2, reloaded, confirmed 2/2 and resubmitted; admin saw both notes. See `evidence/feedback-full-ui-browser.json`, `feedback-full-owner-mobile-map.png`, `feedback-full-owner-mobile-addressed.png`, `feedback-full-resubmit-mobile.png`, `feedback-full-admin-followup.png` | Fixture deleted by owner UI |
| [ ] | B05.5 | Reopen/failure aggregate | NOT RUN | Current recheck covered acknowledgement failure/retry/reopen (B05.5a); double-click address/reopen and the full reopen-before-resubmission sequence remain untested | Fixture cleaned |
| [x] | B05.5a | Acknowledgement failure/retry/reopen | PASS | Merged-main supplemental run: 503 retained typed note and persisted state unchanged; keyboard Enter retry saved the note once; reopen restored the open state. See `evidence/feedback-recheck-main/feedback-browser.json` | Fixture cleaned |
| [ ] | B05.6 | Later round | NOT RUN | Merged-main recheck changed feedback through RPC and confirmed owner UI invalidated prior acknowledgments; actual admin UI authoring/edit of a later feedback round remains untested | Fixture cleaned |
| [ ] | B05.7 | Limits/legacy | NOT RUN | 30-pin/legacy/malformed/31-valid-pin UI and server cases not exercised; forward migration state is also unresolved | No fixture |
| [ ] | B05.8 | Keyboard path | NOT RUN | Owner keyboard acknowledgement retry passed; full keyboard-only admin pin authoring and owner map editing were not exercised | No fixture |
| [ ] | B06.1 | Competing owners aggregate | NOT RUN | Newest-map preservation passed in two UI contexts (B06.1a); stale-owner recovery guidance and refresh/retry were not verified | Fixture cleaned |
| [x] | B06.1a | Competing UI saves | PASS | Current merged-main supplemental run: two independent owner editor contexts saved different labels; the newer server map remained after the second stale save. Initial event was API-fixture setup; both edits were UI-driven. See `evidence/feedback-recheck-main/feedback-browser.json` | Fixture cleaned |
| [ ] | B06.1b | Stale owner recovery | NOT RUN | UI guidance, preserving stale local work, and deliberate refresh/retry after conflict were not asserted | No fixture |
| [ ] | B06.2 | Stale admin aggregate | NOT RUN | Stale review RPC rejection passed (B06.2a); actual admin stale-review UI, refresh, and re-entry remain untested | Fixture cleaned |
| [x] | B06.2a | Stale decision guard (RPC corroboration) | PASS | Merged-main supplemental run submitted the original `updated_at` after two UI map saves; the stale `review_event_layout` RPC rejected it. This is API corroboration only, not a UI stale-review PASS. See `evidence/feedback-recheck-main/feedback-browser.json` | Fixture cleaned |
| [ ] | B06.2b | Stale admin review UI | NOT RUN | The admin did not act from an already-open stale review screen or refresh/re-enter the current comments | No fixture |
| [ ] | B06.3 | Overlap | NOT RUN | Autosave/acknowledgement/submit overlapping response ordering not tested in UI | No fixture |
| [ ] | B06.5 | History | NOT RUN | Actual history rows not reconciled against the mutations in this run; the admin screenshot did show the history summary, but no action/actor/revision reconciliation was performed | No fixture |
| [ ] | B06.6 | History edge states | NOT RUN | History empty/error/retry/older-than-100/missing-baseline UI states not tested | No fixture |
| [x] | B07.1 | Time inputs | PASS | Revalidated on merged main: actual admin review picker selected 12:00 AM and 12:59 PM desktop; 11:59 PM at 390×844. Hour/minute columns, AM/PM and Done were visible; review was discarded without schedule persistence. See current `evidence/time-picker-desktop.png` and `time-picker-mobile.png` | Fixture withdrawn/deleted |
| [ ] | B07.2 | Invalid schedule | NOT RUN | Invalid schedule and Now/Scheduled admin validation not tested | No fixture |
| [x] | B07.3 | Live publication | BLOCKED | Positive live approval would leave a protected permanent QA event; prior attempt confirmed approved delete guard; no supported cleanup exists | No approval fixture |
| [x] | B07.3a | Regular-student event panel and filters | PASS | Signed in with existing regular-student account, opened `/map` → `Open event map`, and clicked All/Ongoing/Upcoming in the actual Campus Events panel. Each button became active and rendered the correct empty state; all counts were 0; no page errors. See `evidence/student-published-events-ui/student-published-events-ui.json` and the three filter screenshots | Read-only; no fixture |
| [x] | B07.3b | Positive published-event visibility and detail | PASS | After local UI corrections, existing published sample was inspected by regular student through actual desktop/mobile/landscape UI: event card, both locations, grounds/floor assets, regular-map restoration and admin parity passed. See `../create-event-2026-10-06-ui/publication-and-student-map-results.md`. Approval was user-created; this pass was read-only, and future publication boundaries were controlled tests only | Existing sample unchanged; no fixture |
| [ ] | B07.4 | Privacy | NOT RUN | Fresh recursive student/anonymous feed privacy checks not performed in this run | No fixture |
| [ ] | B07.5 | Role access | NOT RUN | Student and other available role UI access restrictions not freshly tested | No fixture |
| [ ] | B07.6 | Permission corroboration | NOT RUN | Poster-storage role subcase PASS below; full event-row/API role matrix and other-campus access remain NOT RUN | All storage objects cleaned |
| [x] | B07.6a | Poster storage roles | PASS | Revalidated with existing Org, regular student, super admin and anonymous clients: owner upload/list/delete allowed; anonymous/student/wrong-owner upload, owner overwrite/delete and private-folder listings denied; public object read remained available. All 12 checks passed; unique objects cleaned. See current `evidence/poster-permissions-browser.json` | Cleaned true |
| [ ] | B08.1 | Screens | NOT RUN | Revalidated mobile feedback checklist/map, 2/2 resubmit review, and admin follow-up screenshots on merged main; My Events history and loading/empty/error screens remain uninspected, so aggregate screen case is incomplete | Owned QA evidence only |
| [ ] | B08.2 | Viewports/themes | NOT RUN | Revalidated J3 at 390×844 and desktop admin at 1440×900; full screen/theme matrix remains NOT RUN | Owned QA evidence only |
| [x] | B08.3 | Visual assertions | FAIL | Duplicate `Draft saved` notifications remain visible simultaneously in the ordinary mobile viewport capture `feedback-full-owner-mobile-addressed.png`; the new feedback-recheck mobile image is full-page and is not counted as toast evidence. UI-01 `Event Furniture 1 items` was recaptured in `feedback-recheck-main/feedback-admin-review.png`. Full bounds/overflow, long text, all breakpoints, 30-pin list and viewport/theme matrix remain NOT RUN. See defects.md | Owned QA evidence only |
| [x] | B08.5 | Device limits | BLOCKED | Native 200% zoom and physical touchscreen/pinch unavailable in headless Edge; viewport resize is not equivalent | No fixture |
| [ ] | B08.6 | Full journeys | NOT RUN | See J1–J7 summary below: relevant segments pass, but complete UI journeys not all run | Fixtures cleaned |
| [x] | B08.7 | Cleanup | PASS | J3 feedback fixture withdrawn and deleted through owner UI; final read-only lookup confirmed absent. Prior poster/event fixtures were also cleaned. Audit history intentionally retained. Local Vite server stopped and port 5173 is closed | All QA fixtures accounted for |
| [x] | B08.8 | Report | PASS | October 6 merged-main evidence and the 74-row detailed ledger are reconciled below; acceptance remains PARTIAL | N/A |

| [x] | B04.4a | Map wheel containment | PASS | Revalidated on merged main: Ctrl+wheel zoom left outer page scroll unchanged; preview body scroll lock restored after close. See current `evidence/preview-controls-browser.json` | Staged review discarded |
| [ ] | B04.4b | Other nested scroll regions | NOT RUN | Feedback list/summary/modal-body scroll boundaries and physical touch scrolling not fully exercised | No fixture |
| [x] | B05.1a | Visible unsaved marker | PASS | Revalidated on merged main: actual map click showed the draft feedback pin before saving; inspected current `evidence/preview-pin-draft.png` | Unsaved review draft discarded |
| [ ] | B05.1b | Marker coordinate across pan/zoom and saved coordinate | NOT RUN | Marker was visible at one viewport; coordinate parity across transforms and persisted placement not measured | No fixture |
| [x] | B08.4a | Nested preview focus/scroll restoration | PASS | Revalidated on merged main: nested preview close restored focus to its opener, closing review restored focus to Review submission, and document scrolling returned. See current `evidence/preview-controls-browser.json` | No server changes |
| [ ] | B08.4b | Full modal keyboard matrix | NOT RUN | Every modal/popover, Tab/Shift+Tab, Escape and unsaved guard not exercised | No fixture |

## Integrated journeys

| Journey | Result | Actual UI vs seeded setup | Evidence |
|---|---|---|---|
| J1 Create/poster/two maps/submit/preview | PASS | Revalidated on merged-main `4ea2618`: actual UI-created event had uploaded poster, two locations, furniture/labels, map reload, submission and admin second-map preview; owner withdrew to Draft and removed event/poster. No browser page errors | `evidence/create-browser.json`; inspected `create-submission-review.png`, `create-admin-second-map.png`, `time-picker-mobile.png` |
| J2 Pending update/stale admin/refresh | NOT RUN | Pending-update confirm and two-owner UI save segments passed; stale decision RPC rejection also passed, but stale admin-screen refresh/re-entry is not tested | `evidence/pending-update-browser.json`, `evidence/feedback-recheck-main/feedback-browser.json` |
| J3 Admin pins/reject/owner fixes/resubmit/admin notes | PASS | Revalidated on merged-main `4ea2618` with a UI-created event; all admin and owner steps used actual UI, including two pins, reject, map corrections, 2/2 acknowledgments, mobile reload/resubmit and admin note review. Fixture withdrawn/deleted through owner UI | `evidence/feedback-full-ui-browser.json`; inspected mobile/admin screenshots |
| J4 Reopen/retry/later feedback | NOT RUN | Owner UI verified changed feedback reopens acknowledgments, injected 503, keyboard retry and reopen; later admin feedback change was RPC-seeded, so complete admin-authored UI round is not run | `evidence/feedback-recheck-main/feedback-browser.json` |
| J5 Withdraw/edit/resubmit/duplicate | PASS | Revalidated on merged main: rejected source was API-seeded only as a precondition; actual UI duplicated to a distinct Draft, then submitted, withdrew, continued and resubmitted with layout preserved. Both rows cleaned. Approved-source duplicate remains separately BLOCKED by cleanup gate | `evidence/duplicate-browser.json` |
| J6 Approve/public eligibility/privacy | BLOCKED | Live approval has no safe QA-row retirement path; public feed privacy not freshly tested | No fixture |
| J7 Keyboard/mobile/recovery | NOT RUN | Mobile address/resubmit and keyboard acknowledgement retry segments PASS; full keyboard-only author/review journey not run | `evidence/feedback-full-ui-browser.json`, `evidence/feedback-recheck-main/feedback-browser.json` |

## Visual matrix (fresh run)

| Screen | 390×844 light | 768×1024 light | 1440×900 light | 1440×900 dark | 1920×1080 light | 844×390 light | 200% zoom |
|---|---|---|---|---|---|---|---|
| Create event details | NOT RUN | NOT RUN | PASS evidence/poster-selected-create.png, poster-invalid-type.png, poster-oversize.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Create locations | NOT RUN | NOT RUN | PASS evidence/create-two-locations.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| My Events cards | NOT RUN | NOT RUN | PASS evidence/pending-update-failure.png (actual Pending card visible; screenshot was captured after a QA locator failure; fixture cleaned) | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Editor | PASS evidence/feedback-editor-mobile.png (full-page) | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Submission review | PASS evidence/feedback-submission-mobile.png | NOT RUN | PASS evidence/create-submission-review.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Admin queue | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Admin review | PASS evidence/time-picker-mobile.png (390×844) | PASS evidence/feedback-admin-review.png (mobile width full-page capture; no viewport check) | PASS evidence/feedback-recheck-main/feedback-admin-review.png, pending-update-review.png, time-picker-desktop.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Requested map preview | NOT RUN | NOT RUN | PASS evidence/preview-controls-desktop.png, preview-pin-draft.png, same-event-review-preview.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Furniture summary | NOT RUN | NOT RUN | PASS evidence/furniture-summary-desktop.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Feedback checklist | PASS evidence/feedback-editor-mobile.png (full-page) | NOT RUN | PASS evidence/feedback-admin-review.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| History | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | BLOCKED |
| Error/confirmation dialogs | NOT RUN | NOT RUN | PASS evidence/poster-invalid-type.png, poster-oversize.png, poster-discard-confirmation.png | NOT RUN | NOT RUN | NOT RUN | BLOCKED |

## Final checklist

- [x] All planned cases have an explicit current-run outcome; partial subflows and aggregate journeys are recorded separately.
- [ ] All visual cells passed; many are NOT RUN and native zoom is BLOCKED.
- [ ] Full acceptance matrix passed; release gate remains PARTIAL.
- [x] Historical, actual UI, API-seeded, and simulated evidence are distinguished in results.md.
- [x] Confirmed UI-01/UI-02 have merged-main evidence; ENV-01 parser blocker is resolved at `4ea2618`.
- [x] Update dated evidence links into the October 3 acceptance matrix after current pass is complete.
- [x] QA fixture cleanup verified; normal audit rows retained.
- [x] The original browser-only passes made no product code changes, account creation, SQL execution, commit, push, or deployment; no credentials were recorded. The subsequently authorized UI correction pass is recorded below.

## Authorized UI corrections — October 6

These results describe the local source fixes requested after the manual test screenshots, separately from the earlier merged-main acceptance ledger. Detailed changes, limits, and screenshots: [October 6 UI verification](../create-event-2026-10-06-ui/results.md).

- [x] Placement switch, simple entrance warnings without IDs, furniture drag in Label mode, and direct double-click label editing corrected.
- [x] Actual UI editor/save/reload/submit/admin preview/withdraw/delete journey: 8/8 PASS, no page errors, own fixture cleaned.
- [x] Actual start/end calendar day and scheduled-publication date/time controls, AM/PM, minute 00/59, mobile and short landscape, Done/Escape focus: 5/5 PASS; local review changes discarded.
- [x] Compact draft/numbered pin screenshots inspected; staged feedback discarded without a server decision.
- [x] Actual authenticated submitter names visible in admin queue; legacy TEST and sample are different records/owners and were preserved.
- [x] Five affected regression suites: 168 tests PASS. Final admin-only async-test cleanup recheck: 9/9 PASS without act warnings. Production build PASS.
- [ ] Full repository TypeScript check remains failing in unrelated modules; no diagnostics were found in the modified event/UI production or test files.
- [ ] Remaining original acceptance gaps, including positive live publication, are still open. This correction pass does not mark the whole plan complete.

## Publication and public map correction pass — October 6

See [publication and student-map verification](../create-event-2026-10-06-ui/publication-and-student-map-results.md). This pass used local uncommitted corrections on top of `4ea2618`, actual existing published data for visual/role comparison, and the user-approved controlled scheduling/clock cases.

- [x] Published state and expired/past-time guidance corrected; footer/modal checked on desktop, portrait mobile and short landscape.
- [x] Content-fitting event panel, full titles, location priority, mobile peek/expand, regular-search restoration and no event-overlay leakage verified.
- [x] Actual grounds monument anchor and admin/student artwork/color/coordinate parity verified.
- [x] Scheduled → Upcoming → Ongoing → expiry verified with controlled server-time responses; real schedule command was intercepted.
- [x] Browser 10/10 PASS; affected regressions 132 PASS; production build PASS; existing event unchanged and zero retained fixtures.
- [ ] Actual future database publication/persistence was deliberately not exercised, per the user's controlled-test choice.

The detailed B-case ledger now has 76 rows: 39 PASS, 1 FAIL, 4 BLOCKED and 32 NOT RUN. B07.3b positive student visibility is no longer blocked by an empty feed. The wider acceptance gate remains PARTIAL.

## Shared time spinner correction — October 6

See [time spinner verification](../create-event-2026-10-06-ui/time-spinner-results.md). This replaces the earlier scrolling minute/hour grids; the wider B-case ledger and untested flows remain unchanged.

- [x] Navy-themed hour/minute spinner, up/down buttons, numeric typing, keyboard arrows, independent AM/PM, invalid-time protection and Done.
- [x] Actual publication modal, controlled pending-review UI and unsaved admin create form: desktop 1440×900, portrait 390×660 and landscape 740×390; all 9 browser cases PASS.
- [x] Inspected final screenshots; controls and Done fit the tested viewports, Escape preserves the parent form and focus returns to the picker trigger.
- [x] Existing approved sample unchanged; zero page errors, event write attempts or retained QA fixtures. No approval, SQL, account creation, commit, push or deployment.
- [x] Final affected regression retry: 30 tests across four suites PASS, exit 0; final production build PASS, exit 0.
- [ ] Physical-phone keyboard/touch and the remaining original acceptance gaps were not exercised in this focused pass.

## Admin pin cursor correction — October 6

See [pin cursor verification](../create-event-2026-10-06-ui/pin-cursor-results.md). This focused change preserves existing feedback-save and review-decision semantics.

- [x] Pin preview follows the pointer on valid Grounds/floor map areas while placement is armed; hover creates no feedback.
- [x] Preview hides over controls, outside map bounds, during Pan/Space, on cancel/location switch, and after the draft is positioned. Touch retains the visible tap-to-place draft workflow.
- [x] Short landscape retains usable map area and an unclipped draft pin while typing its comment; contextual headers return after save/cancel.
- [x] Actual browser actions with controlled pending GET data: 5/5 PASS; portrait/landscape screenshots inspected. No page errors, event-write attempts or retained fixtures; existing event unchanged.
- [x] Three affected regression suites: 128 tests PASS, exit 0.
- [x] Final production build PASS, exit 0.
- [ ] Original full acceptance and physical-phone keyboard/hardware coverage remain incomplete.

## Saved admin review pin reload recovery — October 6

See [review draft recovery verification](../create-event-2026-10-06-ui/review-recovery-results.md). The confirmed issue concerned a pin already added with Save pin.

- [x] Saved Grounds/floor pins, IDs, world coordinates and comments recover after actual reload; admin comment and occurrence/publication choices recover too.
- [x] Same-admin/same-submission recovery, visible local-only status, changed-revision guard, failed-review retention, acknowledged-review cleanup, explicit discard and removed-feedback behavior verified.
- [x] Browser 5/5 PASS, including portrait reload; existing event unchanged, no page errors, unexpected mutation attempts or retained fixtures. Review commands were intercepted for the in-memory proposal only.
- [x] Final affected regression: 153 tests across five suites PASS; final production build PASS, exit 0.
- [ ] Already lost in-memory pins cannot be reconstructed. Physical-device and original wider acceptance gaps remain open.

## Responsive pin rows and consistent indoor/outdoor events — October 6

See [event access and feedback UI verification](../create-event-2026-10-06-ui/event-access-results.md).

- [x] Compact admin pin cards, complete comment wrapping, accessible touch-size Remove action and correct keyboard deletion verified.
- [x] Normal building entry retains access to Event map; All/Ongoing/Upcoming is usable indoors. Floor changes and campus return retain the chosen filter, with regular/event map assets separated.
- [x] Floor picker/menu, campus return, account and map utility controls checked for viewport clipping and overlap.
- [x] Actual browser desktop, portrait, short landscape and tablet: 8/8 PASS; existing student Upcoming event was visible indoors. Admin review data was controlled and local changes discarded.
- [x] Affected regressions: 72 tests PASS across five suites. Production build PASS, exit 0. No actual event writes, page errors or retained fixtures.
- [ ] Original wider acceptance and physical-device/native keyboard coverage remain incomplete.

## Student Org review-update indicators — October 6

See [GSO update badge verification](../create-event-2026-10-06-ui/org-event-updates-results.md).

- [x] Shared red unread-layout count in desktop My Events/mobile Events and a targeted New GSO update marker on the affected card.
- [x] Explicit per-card read and View/Revise maps acknowledgment preserve other unread layouts and survive same-browser reload.
- [x] Changed GSO comments/verdicts and repeat review cycles re-notify; own edits/resolutions do not. Owner filtering, late-response and stale-read guards verified.
- [x] Desktop, portrait, landscape and tablet browser cases: 6/6 PASS; existing events unchanged, no page errors, event writes or retained fixtures. Admin updates were controlled GET responses.
- [x] Final regressions: 44 tests across seven suites PASS, including cross-tab and View maps acknowledgment; production build PASS, exit 0.
- [ ] Cross-device read receipts, physical hardware and original wider acceptance gaps are outside this client-side indicator pass.
