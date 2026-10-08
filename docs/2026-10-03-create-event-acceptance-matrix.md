# Create Event acceptance matrix

Companion to `docs/superpowers/plans/2026-10-03-create-event-completion-and-uiux.md`.

Execution status October 4: **PARTIAL acceptance**. Latest event core 268 PASS across 25 files; unchanged helper/public suite 156 PASS, combined coverage 424. Focus-return browser regression and keyboard retry evidence are in `docs/verification/create-event-2026-10-03/results.md`. Missing evidence remains explicit; no new identities provisioned.

## Current execution coverage

“Automated PASS” refers to the complete component/helper/service suites; it does not assert the companion browser/live requirement passed.

| IDs | Current evidence | Remaining acceptance |
|---|---|---|
| C01, C03 | Automated PASS; actual missing-title validation and two-location creation PASS | Remaining organizer/location-error, Back/campus-change browser permutations |
| C02, E01, E02 | Automated PASS; actual two-location create, chair/label placement, save/reload/admin preview PASS | Remaining move/rotate/resize/delete/undo browser permutations |
| C05, E03–E05 | Automated PASS; actual mobile rejected duplicate/withdraw/resubmit and competing saves PASS | Approved duplicate fixture, recovery/blocker permutations |
| C04 | Actual poster create/reload/replace/remove, upload/save failures, lost committed response, cached retry/one draft and available storage permissions PASS; catalog assertions user-verified PASS | Another Org identity and remaining response permutations |
| L01, L03 | Automated/live API PASS; actual UI initial submission and cancel/confirm withdrawal preserving both layouts PASS | Covered exercised cases; additional rapid/network permutations remain |
| L02, L04 | Automated PASS + disposable live API lifecycle PASS | Corresponding entire browser journeys J2/J3 |
| L05 | Automated duplicate-transition/race PASS + live resubmit evidence | Real rapid/double browser retry |
| A01 | Automated PASS + actual queue/count/timestamp/browser inspection | Full interactive search/filter permutations |
| A02 | Shared preview implementation/test PASS; both card/review entry browser PASS; nested preview now returns focus to its opener | Verify focus return from a non-pending standalone card preview |
| A03–A05 | Actual Space+drag, H, 0, Ctrl+wheel, Focus items, shortcut scope, comment typing, nested preview/review focus return and scroll restoration PASS | Physical touch/pinch/pointer-cancel and native 200% zoom; full dialog/screen keyboard matrix |
| A06 | Component PASS + actual nested furniture summary/browser screenshot | Real multi-location totals and hidden-item browser inspection |
| F01–F03 | Actual admin UI places two pins, saves to review draft without server change, then disapproves/persists both; owner sees them PASS | Additional zoom/pan/mobile placement permutations |
| F04, F05 | Actual notes/reload/resubmit/admin inspection, failed acknowledgement retaining note/state, keyboard retry and reopen PASS; keyboard retry is separately exercised in J7 | Complete keyboard-only journey across map authoring and admin pin creation |
| F06, F07 | Parser/service/capacity suites PASS; live stale acknowledgement rejected | Full later feedback-round browser, SQL malformed/30/31 functional fixtures |
| F08 | Deferred tests, stale commands and two independent owner browser sessions PASS; caller version enforced | Additional acknowledgement/admin overlap permutations |
| H01–H03 | History/baseline component PASS + actual live audit entries PASS | Actual expanded-history empty/error/retry/100-entry browser screenshots |
| T01 | Helpers/time component PASS; actual minute59/12 PM desktop/mobile picker PASS | Full midnight/stored timestamp browser/DB permutations |
| T02, P01 | Automated service/controlled-clock PASS | Positive live approval/publication NOT RUN; lasting approved QA row avoided |
| P02 | Recursive privacy tests + anonymous live feed/draft exclusion PASS | Positive eligible fixture privacy requires publication fixture path |
| X01 | Service/page failure and stale version tests PASS; real missing poster bucket error confirmed | Browser offline/auth-expiry/timeout/failure recovery journey |
| J1 | Actual UI create → two locations → chair/labels → save → reload → submit → admin second-map preview PASS | No poster in this journey; C04 gate remains separate |
| J2 | Two owner browser saves and stale admin decision preserve newest pending layout/submittedAt PASS | Explicit confirm-update/newest-map refresh permutations |
| J4 | Later feedback invalidation, failed acknowledgement preserving note/state, keyboard retry and reopen PASS | Review entered through API; full admin-UI round remains |
| J5 | Mobile rejected duplicate, submit/withdraw/continue/resubmit PASS | Approved duplicate needs safely retireable approved fixture |
| J6 | Controlled-clock/public-feed tests PASS | Live positive approval/publication needs a safely retireable approved fixture |
| J7 | Keyboard-driven owner resolution, open-pin gate, refresh, injected acknowledgement and submit failures, retry and one-event assertion PASS; mobile resolution/resubmit is covered by J3 | Initial review/pins were API-seeded for keyboard run; physical touch and full keyboard map-pin authoring not verified |
| J3 | Actual admin UI pin placement/rejection → owner note → blocked partial submit → mobile second acknowledgement → reload/resubmit → admin notes PASS | Initial map/submission API-seeded; first creation/design remains separately verified J1 |

Role coverage: existing owner Org, regular student, super admin and anonymous API checks PASS for cases in `live-fixture.json`. Unrelated Org B and separate non-super admin identities **BLOCKED** (not configured; user requested existing accounts only). Positive live approved-layout/publication cases **NOT RUN**. No claim that all role restrictions passed.

Visual: actual screenshots at 390×844, 768×1024, 1440×900, 1920×1080, 844×390; preview light/dark, toolbar containment, short-landscape canvas >120px. Headless Edge did not expose native 200% zoom (BLOCKED), and no effective viewport is counted as a substitute. Complete all-screens/theme and physical touch matrix remains **NOT RUN**.

## Latest GitHub main revalidation — October 6, 2026

Fetched GitHub `origin/main`; it had two commits beyond the local base (`012e028` and merge `4ea2618`). The current local testing branch was fast-forwarded to `4ea2618`; no commit, push, deployment, SQL, schema migration, or product-code edit was made. The uncommitted QA/docs work was preserved.

| IDs / flows | Result on `4ea2618` | Evidence | Remaining |
|---|---|---|---|
| C01–C04, B01.3–B01.6, E01–E02, L01/L03, J1 | **PASS** actual UI create with poster, two locations, furniture/labels, separate saves, reload, submit, admin preview, picker boundary values, cancel/confirm withdrawal; poster 503/save-failure/lost-response retry, replace/remove and reload also passed | `docs/verification/create-event-2026-10-04-browser/evidence/create-browser.json`, `poster-browser.json`, screenshots; fixtures and owned poster objects cleaned | Back/campus-switch permutations, transforms/undo, rapid request overlap, and broader field validation remain NOT RUN |
| B00.4b / B01.4 | **PASS** actual create-form GIF and >5 MiB rejection; browser-generated JPEG/WebP accepted; remove/keep/discard/reopen reset state; no upload or event row | `poster-constraints-browser.json`, inspected poster screenshots | Additional malformed image decode cases NOT RUN |
| L02 / B03.2 | **PASS** actual owner submit, map edit, review/confirm update, Pending and original submission time retained; admin preview showed the saved map | `pending-update-browser.json` and screenshots | Stale-admin decision/refresh race NOT RUN in this rerun |
| A01 / B04.1 | **PASS** queue counts, search by exact title and partial organizer, no-match state and status filters/empty tabs | `admin-queue-browser.json`, inspected queue screenshots | Load failure/retry NOT RUN |
| C05 / B03.4 / J5 | **PASS** rejected source was API-seeded as a precondition; duplicate and mobile submit/withdraw/continue/resubmit were actual UI actions. Copy was a distinct owner Draft with no inherited review state; both QA rows cleaned | `duplicate-browser.json` | Approved-source duplicate remains BLOCKED by the safe-cleanup gate |
| A02–A05, F01, B05.1a, B08.4a | **PASS** read-only preview parity, pan/zoom/focus/shortcuts, wheel containment, draft pin visibility, keyboard scope, nested close focus/scroll restoration | `preview-controls-browser.json`, inspected screenshots | Physical touch/pinch, pointer cancel, native 200% zoom BLOCKED; full dialog keyboard matrix NOT RUN |
| A06 / B04.5 | **PASS** furniture summary reflected requested items by location and excluded published base assets | `create-browser.json` and existing inspected summary evidence | Hidden-item handling is not applicable to the read-only summary |
| F01–F04 / J3 | **PASS full UI journey** actual UI-created/submitted event; admin placed two draft pins and saved them with rejection; owner placed requested Table and Chair, wrote notes, acknowledged both, saw the open-pin gate, reloaded at mobile viewport, resubmitted; admin saw both notes; owner withdrew/deleted its QA event through UI | `feedback-full-ui-browser.json`, inspected mobile map/acknowledgment/resubmit and admin review screenshots; `cleanedByUI: true` | Later-round feedback invalidation, pin capacity/legacy data, failure/reopen/concurrency are not all covered by this journey |
| B05.5a / B06.1a / B06.2a / B06.4a | **PASS subcases** fresh merged-main supplemental run: two UI owner sessions preserved the newest map; stale admin RPC decision rejected; feedback 503 retained note/state, keyboard retry and reopen passed; owner UI reflected API-seeded later feedback | `docs/verification/create-event-2026-10-04-browser/evidence/feedback-recheck-main/feedback-browser.json` and screenshots; fixture cleaned | Full stale-owner/admin recovery UI, later feedback authored from admin UI, double-click, and complete reopen path remain NOT RUN |
| T01 / B07.1 | **PASS** admin time picker selected 12:00 AM, 12:59 PM, and 11:59 PM with visible hour/minute columns at desktop/mobile; review was canceled | `create-browser.json`, inspected `time-picker-mobile.png` | Schedule persistence and positive live approval are not run |
| Poster storage role checks / B07.6a | **PASS** existing Org, regular student, admin, and anonymous clients: owner upload/list/delete allowed, invalid role/folder writes and overwrite/deletion/listing denied, public object read worked; all QA objects cleaned | `poster-permissions-browser.json` | Event-row privacy, unrelated Org, and other-campus access remain NOT RUN or BLOCKED where accounts are unavailable |
| B08.3 visual | **FAIL** duplicate student save notification was reconfirmed after the merge at 390×844; same toast appears twice in one viewport. Admin review also still says `Event Furniture 1 items` in a fresh merged-main review screenshot | `feedback-full-owner-mobile-addressed.png`, `feedback-recheck-main/feedback-admin-review.png`; UI-01/UI-02 in `docs/verification/create-event-2026-10-04-browser/defects.md` | No UI fix was authorized in this test/report-only pass |

The full acceptance gate remains **PARTIAL**, not all PASS. The companion 74-case ledger currently records **37 PASS, 1 FAIL, 4 BLOCKED, and 32 NOT RUN**. Migration catalog state for `20261004120000_event_review_integrity_forward_fixes.sql` is still unverified because this pass forbids SQL execution; do not infer it from the poster migration result. Live approved publication, native 200% zoom, and physical touch remain blocked or untested.

## Existing features: regression requirements

| ID | Scenario | Expected result | Required evidence |
|---|---|---|---|
| C01 | Create with missing title/organizer/locations | Inline actionable errors; inputs remain; no event created | Component + browser |
| C02 | Create with campus grounds and published building floor | One Draft with two distinct stable locations; opens correct base maps | Service + authenticated browser |
| C03 | Back/Continue, campus change, unavailable floor | Inputs persist where valid; invalid/duplicate locations cannot submit | Component + browser |
| C04 | Poster upload fails or create fails after upload | Honest error; retry does not duplicate event; no fake success | Service/component + browser |
| C05 | Duplicate rejected/approved layout | Fresh owner Draft, copied layout, no inherited approval/review/audit state | Service + browser |
| E01 | Place/move/rotate/resize/delete furniture and labels | Correct coordinates and counts; undo/redo; base map unchanged | Editor + browser |
| E02 | Save and refresh, two locations | Both location layouts persist accurately | Service + authenticated browser |
| E03 | Rapid edits during autosave | Latest edits survive older response; no update loop | Deferred-promise test + browser |
| E04 | Navigate away, switch location, reload dirty editor | Save/discard/cancel and recovery behave correctly | Page + browser |
| E05 | Critical layout blocker versus warning | Critical blocker prevents submit; advisory warning does not | Submission review + browser |
| L01 | First submission | One Pending event; all requested maps together; server timestamp recorded | Service + DB + browser |
| L02 | Pending edit and Review & update GSO | Updated map, still Pending, original submittedAt preserved | Service + DB + browser |
| L03 | Confirm/cancel withdrawal | Confirm returns same assets to Draft; cancel changes nothing | Page + DB + browser |
| L04 | Rejection → save draft → resubmit | Feedback retained, open pins block; addressed pins/notes survive resubmit | Service + DB + browser |
| L05 | Double-click/retry submission | No duplicate transition/event; feedback state consistent | Deferred-promise + DB |
| A01 | Admin search/filter/counts/empty list | Accurate queue/counts; legacy timestamps truthful | Page + browser |
| A02 | Both pending preview entry points | Same event/location/pin data; close returns to review context | Integration + browser |
| A03 | Pan on blank map/base building/event asset | Drag works; no map changes or accidental pin | Editor + mouse/touch browser |
| A04 | H, 0, Space, Ctrl/⌘ scroll and Focus | Correct viewport behavior; no shortcuts in text input/background modal | Editor + keyboard browser |
| A05 | Scroll map/feedback/summary; open/close nested dialogs | No background scroll leak; focused/top dialog behaves correctly | Real browser |
| A06 | Furniture summary across locations | Accurate total/type/name counts; excludes base assets; hidden/label meaning clear | Component + browser |
| F01 | Add pin at different zoom/pan | Draft marker visible before commit; saved coordinate matches point | Geometry + browser |
| F02 | Cancel placement, drag, switch location, toolbar click | No accidental pin; unsaved comment handled explicitly | Editor/preview + browser |
| F03 | Save pin to review, close preview, finalize decision | Draft remains in review; server save occurs with decision; student sees it | Integration + DB + browser |
| F04 | Mark addressed with optional note and refresh | Same pin turns green with text status; actor/time/note persisted | Component + RPC + browser |
| F05 | Reopen addressed pin | Returns Open; resubmission gate restored | Service + DB + browser |
| F06 | Changed feedback after acknowledgement | Stale acknowledgement does not count; current location-wide rule explained | Helper + SQL + browser |
| F07 | Null/malformed/legacy feedback; 30/31 pins | Compatible decoding, visible recoverable states, no silently lost valid pin | Helper + SQL + UI |
| F08 | Acknowledgement overlaps autosave/submit/admin review | No lost edits, forged success or overwritten decision | Deferred-promise + two sessions |
| H01 | History load/empty/error/retry | Readable actor/action/time; no identifiers dominating UI | Component + browser |
| H02 | Added/removed/moved item, address/reopen, second resubmit | Accurate history and correct submission baseline | Helper/history + DB |
| H03 | History older than 100 entries or no baseline | Honest unavailable/limited-baseline message, not “no changes” | Fixture test + browser |
| T01 | 12 AM, 12 PM, 11:59 PM, minute 00/59 | Correct Philippine display and stored timestamp | Time helper/component + browser/DB |
| T02 | Invalid end/start or publication schedule | Approval blocked with specific field error; entered values retained | Service + DB + browser |
| P01 | Publish now/scheduled/exact boundary/expired/inactive | Correct public eligibility and confirmation copy | Controlled-clock + DB + browser |
| P02 | Public feed inspected recursively | No feedback, resolutions, actor/owner IDs or private notes | API/service + DB |
| X01 | Offline, expired session, missing RPC, timeout | Honest error, preserved work, explicit retry/reauthentication path | Service/page + browser |

## Database roles: functional checks beyond catalog assertions

Use transaction-isolated fixtures or an explicitly verified disposable test project. Supabase SQL Editor superuser execution is not a substitute for these roles.

| Role | Allowed | Must be denied |
|---|---|---|
| Owner Student Org A | Own draft/pending edits, resolution/reopen, valid submit/withdraw, own history | Approval, admin feedback/schedule changes, audit writes, forged resolution actor/time, approved-layout edits, bypassing open pins |
| Unrelated Student Org B | Its own events | Read/write/history/resolution/withdraw of A's private event |
| Regular student | Published public previews | Organization-only mutation and private feedback/history |
| Admin / Super Admin | Authorized review/publication and private inspection | Stale revision decision; silent direct-write bypass of protected review command |
| Anonymous | Eligible public feed only | Resolution/review/history/write RPCs and private metadata |

For every denied mutation: compare the complete row and history before/after and assert they remain unchanged. Include missing pin, wrong location, archived event, stale updatedAt, non-owner and approved-event cases for the resolution RPC.

## Integrated journeys

| ID | Journey | Completion evidence |
|---|---|---|
| J1 | Create → two locations → furniture/labels → save → refresh → submit → admin preview | Original layouts/counts preserved across both roles |
| J2 | Pending edit → autosave → confirm update → admin stale review fails → refresh | Pending/submittedAt preserved; newest map reviewed |
| J3 | Admin rejects with two pins → owner fixes one → submit blocked → addresses both → refresh → resubmit → admin verifies | Original feedback and resolution notes survive; admin still makes decision |
| J4 | Reopen issue → retry failed acknowledgement → admin changes feedback in a later round | No false addressed status; new feedback requires attention |
| J5 | Withdraw → edit → submit again; duplicate a separate approved/rejected event | No lost furniture, wrong ownership, inherited approval or review state |
| J6 | Approve now / schedule → public preview before and after eligibility boundary | Correct visibility and no private data in public responses |
| J7 | Repeat J3 on mobile and keyboard-only desktop with network failure during save | Reachable controls, visible pin, no scroll leak and recoverable work |

## Visual/frontend acceptance for each changed screen

Test 390×844, 768×1024, 1440×900, 1920×1080, short landscape, and 200% zoom. At least mobile/desktop in light and dark themes. Screens: creation, My Events cards, editor, submission review, admin queue, review/schedule, requested-map preview, history, furniture summary and feedback checklist.

- No document horizontal overflow, clipped minutes/AM-PM, obscured footer actions or canvas collapsing behind panels.
- One obvious primary action; secondary/destructive actions clearly separated; no repeated title/banner chains.
- Feedback and selection remain visible at different zooms; status has text/icon meaning beyond color.
- Tab/Shift+Tab stay in the active dialog; Escape closes one layer; closing restores focus and body scrolling.
- Long title, organizer, location, comments, empty content and 30-pin content remain readable without overwhelming the map.
- Loading, saving, success and failure states are visible and truthful; errors preserve entered work.
- Browser console/network inspected. Record API failures independently from frontend rendering errors.

## Tests required after proposed future increments

| Increment | Tests before it can be called done |
|---|---|
| Per-pin invalidation | Untouched pin stays addressed; edited/moved/recreated pin reopens; deleted pin stops blocking; general feedback change semantics explicit; old data compatibility |
| Visual changes since submission | Added/moved/removed overlays reflect real baseline; location switching correct; deleted-item ghost cannot be edited; missing baseline labelled; no base-map changes |
| Approved-event revision request | Published version stable during draft/rejection/withdrawal; approved replacement atomic; owner permissions and stale checks; history linkage; public feed switches at intended time |

Each implementation task must rerun its focused automated tests and affected browser cases, then join the final regression run. Do not only test newly added controls while leaving previously completed flows untested.
