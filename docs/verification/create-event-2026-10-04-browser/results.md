# Create Event actual browser QA — October 4, 2026

## Current run metadata

- Commit: `d1b0667d3b858ec3c243dd80e426045ec575c0e4`.
- Local frontend: Vite 6.3.5 at `http://127.0.0.1:5173/`.
- Browser: installed Microsoft Edge driven by bundled Playwright, headless, 1440×900 for the exercised journeys.
- Roles used: configured existing Student Org owner and admin. Both authenticated successfully for the disposable create/submission/preview journeys.
- Project: existing configured Supabase project (hostname omitted here); no accounts or projects created.
- Fixture alias `QA browser create 84230ac5`: created via Student Org UI, submitted and reviewed read-only by admin, withdrawn via UI, then deleted by owner-guarded cleanup. Cleanup confirmed `true`; audit rows remain as designed.
- Poster fixture alias `QA poster 284080ab`: UI upload/retry/edit/replace/remove flow, then event and owned upload cleanup confirmed `true/true`.
- No migration, product code, account or existing user event was modified.

## Environment findings

- Built-in browser connector failed with `failed to write kernel assets: The system cannot find the path specified`. Edge + Playwright fallback worked.
- Initial `node node_modules/vite/bin/vite.js --host 127.0.0.1` failed in the sandbox with filesystem Access denied; elevated server start succeeded and left Vite listening at port 5173.
- Vite started and served the Create Event route. Dependency scanning reported existing errors in `src/pages/CampusMapPage.tsx`: duplicate `campusHint` and `targetId` declarations at lines 2802–2805 and a malformed conditional at line 2822. They did not block the tested My Events/editor/admin event routes. This pre-existing issue remains out of scope and is a blocker for separately testing the campus map route.
- First unauthed reconnaissance navigation timed out during dependency optimization. Subsequent authenticated UI test completed with no recorded Playwright page exceptions.
- Migration state for `supabase/migrations/20261004120000_event_review_integrity_forward_fixes.sql` was not queried because this pass forbids SQL execution and no supported read-only migration-status route was available. Prior handoff said it was unapplied; server assertions depending on it remain unverified.

## Fresh actual UI results

### Create and two-map submission journey

- **PASS C01 title validation:** empty required title showed an inline alert; data entry continued in the same actual UI flow. Organizer/location/whitespace/long-field cases remain NOT RUN.
- **PASS C02 location selection (partial):** selected Campus Grounds and published Student Center Building — Ground Floor through visible checkboxes. Duplicate, Back/Continue, campus-change and unavailable-floor permutations remain NOT RUN.
- **PASS C03 creation (partial):** created one owned proposal with both locations through the form; verified metadata/owner/location count using a read-only database result. This specific event did not include a poster.
- **PASS E01 (partial):** through editor tools placed one chair and one label on Campus Grounds, one label on Student Center Ground Floor; counts persisted. Move/rotate/resize/delete/undo/redo were not exercised.
- **PASS E02 two-location persistence:** saved each map, verified the first map was not erased by the second save, reloaded and compared saved location payload. Final counts: grounds 1 furniture/1 label; floor 0 furniture/1 label.
- **PASS L01 / J1 segment:** submission review visibly listed both maps, counts and passed layout checks; Confirm submission yielded one Pending event and preserved layouts. Admin opened the submitted event and inspected the second floor label. This proves the create/design/save/reload/submit/admin-inspection segment only; it does not prove the poster-inclusive full J1.
- **PASS L03:** cancel withdrawal left Pending; confirm returned the same event to Draft and preserved both maps. The fixture was then removed after status verification.
- Screenshots: `evidence/create-two-locations.png`, `evidence/create-submission-review.png`, `evidence/create-admin-second-map.png`. All three were opened and visually inspected. The submission modal showed 2 requested maps, 1 furniture asset and 2 labels; each location had “Layout checks passed”. The admin preview showed the actual second floor map and event label.
- No browser page errors on this flow (`evidence/create-browser.json`, `errors: []`).

### Poster create/retry/edit journey

- **PASS B01.6 upload failure:** forced the first poster storage POST to return 503; visible error retained proposal data; event was not created.
- **PASS B01.6 save failure:** forced create POST to fail after upload; form remained retryable.
- **PASS B01.6 lost response retry:** allowed create to commit then returned a simulated lost-response error; UI retry reused cached poster, found exactly one draft and did not upload a duplicate object.
- **PASS B01.5 poster reload:** created poster remained selected in Edit details after navigation/reload.
- **PASS B01.5 replace retry:** injected details-save failure after replacement upload; old saved URL remained until retry, retry reused the uploaded replacement, then reload displayed new poster.
- **PASS B01.5 removal:** removal saved and stayed removed after reload; the shared image object remained readable until explicit owned-object cleanup.
- Poster fixture/event and uploaded objects cleanup confirmed `true/true`; no browser page errors (`evidence/poster-browser.json`). `evidence/poster-details-removed.png` inspected; poster slot and edit form fit in screenshot at 1440×900.
- Still NOT RUN: invalid MIME, >5 MB UI rejection, JPEG/WebP selection, cancel/create reopen state, separate storage role matrix in this fresh run.

### Feedback pins, student resolution, concurrency, and recovery

- **PASS F01–F03 segments:** through admin browser UI, added two pins/comments, confirmed neither appeared in persisted metadata before decision, then Disapprove saved both. Admin feedback was staged in the review dialog first. Event setup was API-seeded; the pin-placement and decision actions were UI-driven.
- **PASS F04/J3 segment:** owner UI selected Show on map, wrote a resolution note, and addressed pin one. Submitting with pin two still open was blocked. At 390×844, owner addressed pin two, reloaded, and resubmitted. Admin UI then displayed both student notes. Initial proposal/submission was API-seeded, so the complete J3 journey remains NOT RUN.
- **PASS F08/J2 concurrency segment:** two independent Student Org browser contexts edited the same pending event. Newer map save remained after stale second context attempted its save. Stale admin decision was rejected through an RPC call, not by clicking the stale decision in the UI. Full J2 remains NOT RUN.
- **PASS J4 recovery segment:** changed feedback through admin RPC; owner UI showed it reopened. Injected 503 while acknowledging retained note and persisted state; keyboard retry succeeded once; reopening restored the open state. The later admin change was API-seeded, so full J4 remains NOT RUN.
- All feedback fixture changes were confined to a generated QA event and cleanup confirmed `true`; no existing event was modified. No page errors (`evidence/feedback-browser.json`).
- Visually inspected `evidence/feedback-admin-review.png`, `evidence/feedback-editor-mobile.png`, and `evidence/feedback-submission-mobile.png`. Admin review showed pin statuses, notes, and `2/2 addressed`; mobile submission showed the 2/2 readiness summary. The admin card also rendered `Event Furniture 1 items` (singular grammar mismatch): tracked as UI-01 in `defects.md`. The mobile editor image is a full-page capture containing fixed notifications at multiple vertical positions; it is not reliable proof of duplicate toast UI. A viewport-only follow-up is required before classifying that visual concern.
### Rejected duplicate and withdrawal/resubmission lifecycle

- **PASS C05:** a disposable rejected source was API-seeded with a label and review feedback; from 390×844 the owner duplicated it through the My Events UI. The copy was a different owner-owned Draft, retained the label and did not inherit submitted/reviewed timestamps, schedule, admin comment, feedback, or resolutions.
- **PASS J5 segment:** through UI the owner submitted the copy, withdrew it, continued the draft and resubmitted with the label intact. The source and copy rows were both withdrawn/deleted during cleanup (`Cleaned 2 rows`).
- Source setup/rejection used API; duplicate and owner lifecycle actions used actual UI. Approved-source duplication is BLOCKED with the existing approved-event cleanup gate. Evidence `evidence/duplicate-browser.json`; script reported no page errors.
### Admin preview controls and pin visibility

- **PASS A03/A04 control segment:** read-only actual admin preview. Space+drag panned with persistent Pan off; `Ctrl+wheel` changed canvas scale from 0.619203 to 0.677395 without changing outer-page scroll; Focus items and `0` refit; `H` only acted with map focus and text entry still accepted `h` and Space. No page exceptions.
- **PASS F01 placement visibility:** placed a draft marker in the actual preview and asserted the accessible `Unsaved feedback pin position` appeared before any save. Opened both `evidence/preview-controls-desktop.png` and `evidence/preview-pin-draft.png`; marker was visibly aligned with the clicked point. The staged pin and review changes were discarded; server record was not changed.
- **PASS A05/B08 nested close:** closing preview restored focus to its open button; closing review restored focus to queue button and body scroll. This does not cover every dialog/popup.
- **BLOCKED native zoom:** Edge headless metrics stayed DPR=1, innerWidth=1440, visualViewport scale=1 after zoom shortcuts. No claim of 200% browser zoom. Evidence `evidence/preview-controls-browser.json`.
- Physical touch/pinch and pointer cancellation remain untested.

### Same-event preview parity, furniture summary, and schedule-time controls

- **PASS B04.2 same-event entry parity:** on a single pending, two-location proposal, opened the admin card preview, inspected the second map, closed it, then used the still-open Review Event Layout dialog's `Preview requested maps`. The nested preview showed the same event and both locations with the same submitted chair/labels; no page or new window opened. The close button returned to the review dialog. Screenshot: `evidence/same-event-review-preview.png`.
- **PASS B04.5 available furniture summary:** actual admin `Furniture summary` modal displayed `1 furniture · 2 labels · 2 locations`, grounds `Chair × 1`, and the second location's zero furniture/one label. It identified requested event items only and excluded permanent campus furniture. This summary has no hide-item control, so the conditional hide-item behavior is not applicable. Screenshot: `evidence/furniture-summary-desktop.png`.
- **PASS B07.1 time-picker UI:** actual admin review picker selected 12:00 AM and 12:59 PM at 1440×900, then 11:59 PM at 390×844. The minute list, hour list, AM/PM and Done action were visible and selections were reflected in the input. Screenshots: `evidence/time-picker-desktop.png`, `evidence/time-picker-mobile.png`. Admin review was canceled and its discard confirmation accepted; schedule values were not persisted. Schedule persistence/approval remains governed by the B07.3 publication gate.
- No page errors occurred; event was withdrawn/deleted and its newly uploaded owned poster was removed and confirmed absent.

### Complete create-with-poster end-to-end journey

- **PASS J1 / B01.3:** one new event created through the actual Student Org UI with a PNG poster, two published locations, a chair and label on Campus Grounds, and a label on Student Center Ground Floor. Saved each map, reloaded the editor, verified independent map payloads, submitted once, then used the existing admin account to inspect the submitted second location. The saved poster URL returned successfully. The owner canceled then confirmed withdrawal; cleanup deleted the QA event and removed the uniquely owned poster object (`cleaned: true`, `posterObjectCleaned: true`). The test reported no page errors. Evidence: `evidence/create-browser.json`, `evidence/create-two-locations.png`, `evidence/create-submission-review.png`, `evidence/create-admin-second-map.png`.
- The first rerun of the extended QA harness failed after opening the nested Review Event Layout modal because the harness attempted to reopen `Review submission` on the background card. The actual UI was already in the parent review modal; that test-only click was removed. The next run passed parity, summary, time and cleanup checks. No product code changed for this correction.

### Saved location switch observation

- A focused owner UI test switched location immediately after the editor displayed `Saved` and a read-only server readback confirmed persistence; the second switch test with an added wait also passed. One earlier combined attempt displayed `Leave event editor?` once at this point, while the same map's label was already saved. It was not reproduced in the two focused checks. Record as an intermittent, unconfirmed behavior; dirty unsaved navigation choices remain NOT RUN. Evidence: `evidence/location-switch-after-save.json` and the earlier `evidence/create-browser-failure.png` (QA fixture only, already cleaned).

### Poster validation and create-modal recovery

- **PASS B00.4b / B01.4:** the actual create form rejected an unsupported GIF MIME and a PNG of 5 MiB + 1 byte with the expected messages, retained the title, and did not replace the empty poster selection. Actual browser-generated valid JPEG and WebP files were accepted. Remove selected poster reset the selection. `Keep editing` retained the current JPEG and left the proposal open; `Discard changes` then closed it; reopening showed blank title and no stale poster. Network interception recorded 0 poster storage POSTs, and a read-only query found 0 proposal rows for the unique alias. Evidence: `evidence/poster-constraints-browser.json`, `poster-invalid-type.png`, `poster-oversize.png`, `poster-selected-create.png`, `poster-keep-editing.png`, `poster-discard-confirmation.png`.
- Earlier runs stopped only because the QA script tried to click `Discard changes` after reopening a clean form (which closes directly because it is not dirty). Corrected runner completed the intended assertions; no product defect was found in this path.

### Pending map update and admin parity

- **PASS B03.2:** actual Student Org UI created and submitted a new one-map event, then opened `Edit maps` as a Pending event, added a label, saved, selected `Review & update GSO`, and confirmed. Readback confirmed status remained Pending, the original `submittedAt` was unchanged, and the added label persisted. The admin account opened the same submission and previewed the actual updated Chair + Event Label. Review was canceled; the QA event was withdrawn and deleted. Evidence: `evidence/pending-update-browser.json`, `pending-update-review.png`, `pending-update-admin-preview.png`.
- Two first attempts ended at the test harness selector because `Edit maps` is rendered as a link, not a button, and the title's nearest rounded wrapper does not contain the footer. The actual card showed the expected action; after matching the real link semantics, the complete flow passed. Both earlier QA events were cleaned.

### Confirmed visual defects

- **FAIL B08.3 / UI-02:** the Pending update review screenshot shows the same `Submission maps saved` toast twice in one 1440×900 viewport, once at the top right and once near the bottom center. This is consistent with both `App.tsx` and the student `PublicLayout.tsx` mounting a Sonner toaster. The full screenshot is `evidence/pending-update-review.png`. This is an app rendering defect, not a full-page screenshot artifact. No product fix was made because this task is testing/reporting only.
- **FAIL B08.3 / UI-01:** admin review uses `Event Furniture 1 items` for a one-item event; see `evidence/feedback-admin-review.png` and `defects.md`.
## Historical evidence

The October 3 results in `docs/verification/create-event-2026-10-03/results.md` are historical and are not counted as fresh October 4 PASS here. They include actual UI cases and API-seeded segments, clearly distinguished in that report. The fresh checklist remains the source of current-case status.

## Initial-pass gaps (October 4)

The initial-pass environment diagnostic and NOT RUN cases below are historical snapshots. The merged-main revalidation after the section above resolves the CampusMap transform issue and adds fresh evidence for admin search/filter, poster storage roles, time picker, pan/zoom, focus restoration, and end-to-end feedback pins. Remaining current gaps are listed in the October 6 section below and in `checklist.md`.

## Latest GitHub main browser revalidation — October 6, 2026

Fetched `origin/main` and fast-forwarded the local testing branch from `d1b0667` to `4ea2618` (`Merge pull request #45 from nitsuwa/codex/sync-main-student-navigation`, including `012e028`). The working tree's existing uncommitted QA/documentation files were retained. No product source was edited, no SQL or migration was executed, and there was no commit, push, or deployment.

The local Vite app started at `http://127.0.0.1:5173`. `/student/events` returned HTTP 200, and the transformed `CampusMapPage.tsx` module returned HTTP 200 without a Vite parser error. The browser connector could not load its kernel assets, so installed Edge driven by the bundled Playwright runtime was used. The merged-main journeys ran at 1440×900, with mobile checks at 390×844. Existing Student Org, student, super-admin and anonymous identities were used; no secrets were written to evidence.

Fresh merged-main evidence:

- **PASS J1 / B01.3 / B02.2:** actual Student Org UI created one event with an uploaded poster, selected Campus Grounds and Student Center Ground Floor, placed furniture and labels, saved both maps, reloaded and compared persisted map contents, submitted once, then admin previewed the second map. Poster URL was retrievable. The owner confirmed withdrawal and removed the event; the owned poster object was removed. No page errors. Evidence: `evidence/create-browser.json`, `create-submission-review.png`, `create-admin-second-map.png`.
- **PASS B01.4–B01.6:** actual create form rejected GIF and a PNG over 5 MiB, accepted browser-generated JPEG/WebP, and handled remove/keep/discard/reopen without stale state or upload. Actual poster upload failure, save failure after upload, lost-response retry, reload, replacement failure/retry, and removal-after-reload all passed. Exactly one event remained after create retry; owned test event and poster objects were cleaned. Evidence: `evidence/poster-constraints-browser.json`, `evidence/poster-browser.json`, inspected poster screenshots.
- **PASS B03.2:** actual owner UI edited a Pending map and confirmed an update; Pending state and original submission time remained intact, and the admin saw the saved chair and label. Fixture withdrawn/deleted.
- **PASS B04.1 / A01:** admin queue search by exact title and partial organizer, no-match state, visible fields/count, and Pending/Approved/Disapproved filters matched the displayed rows. Read-only; no fixture mutation.
- **PASS C05 / B03.4 / J5 (seeded precondition):** the rejected source was set up as a disposable fixture, while duplicate, review-state inspection, submit, withdraw, continue and resubmit were performed through mobile UI. The copy had a distinct ID and clean Draft state. Both fixtures were cleaned. Approved-source duplication remains blocked by the no-retained-approved-fixture rule.
- **PASS B04.3–B04.4a / B08.4a:** Space+drag panned, Ctrl+wheel zoomed from 0.619203 to 0.677395 without scrolling the outer page, Focus items/0 refit the map, map-only shortcuts did not intercept comment typing, and closing nested preview/review restored focus and body scrolling. **BLOCKED:** headless Edge did not expose a reliable native 200% zoom change, so viewport resize was not treated as equivalent.
- **PASS J3 / B05.1a / B05.3–B05.4:** UI-created event; admin staged two visible pins and verified they were draft-only until Disapprove; owner fixed both locations, added notes, acknowledged 2/2, reloaded and resubmitted; admin saw both student notes. One unresolved pin blocked submission. Owner deleted the event through its actual UI after withdrawal. All seven J3 checks passed, no page errors, cleanup was confirmed. Screenshots inspected: `feedback-full-admin-pin-draft.png`, `feedback-full-owner-mobile-map.png`, `feedback-full-owner-mobile-addressed.png`, `feedback-full-resubmit-mobile.png`, `feedback-full-admin-followup.png`.
- **PASS B07.1:** desktop 12:00 AM and 12:59 PM, mobile 11:59 PM; hour/minute columns, AM/PM, and Done were visible. The admin review was discarded, so no schedule change was persisted.
- **PASS B07.6a:** 12 poster Storage role checks using existing Org, regular student, super-admin and anonymous clients. Owner upload/list/delete passed; anonymous/student/wrong-owner upload, overwrite, unauthorized delete, and private listing were denied; all unique objects were cleaned. Current copy: `evidence/poster-permissions-browser.json`.
- **PASS B07.3a — regular-student Campus Events filters:** signed in through the actual regular-student browser session, opened `/map` → `Open event map`, and selected All, Ongoing, and Upcoming. Each filter became active and displayed its matching empty-state copy; all three showed 0 event cards. No browser page errors occurred. Screenshots: `evidence/student-published-events-ui/student-events-all.png`, `student-events-ongoing.png`, `student-events-upcoming.png`; structured output: `evidence/student-published-events-ui/student-published-events-ui.json`. The local server was stopped after the run.
- **BLOCKED B07.3b — positive student visibility/detail:** the published feed returned zero events, so visibility of an eligible card, event detail, and location action could not be confirmed. The approved-fixture cleanup gate B00.5 still prevents creating and approving a QA event because there is no supported retirement path. The test was read-only and created no fixture.
- **PASS B02.4a:** after visible Saved and server readback, switching maps three seconds later caused no unsaved-navigation prompt; data remained persisted.
- **PASS subcases B05.5a, B06.1a, B06.2a, B06.4a:** an additional merged-main browser run used a disposable API-seeded proposal to test edge cases. Two owner browser contexts made UI map saves; the newer map survived the stale save. A stale admin RPC decision was rejected (RPC corroboration only). Feedback acknowledgment 503 preserved the typed note and server state; keyboard Enter retry succeeded once and reopen returned the issue to Open. A later feedback revision was seeded through RPC and the owner UI showed prior acknowledgments invalidated. Full UI stale-owner recovery, stale-admin refresh/re-entry, double-click behavior, and actual admin UI authorship of the later feedback remain NOT RUN. All seven recorded checks passed; the event was cleaned and the report has `errors: []`. Evidence: `evidence/feedback-recheck-main/feedback-browser.json` and its screenshots.
- **FAIL B08.3 / UI-02:** the same `Draft saved` notification was visible twice in one ordinary 390×844 viewport in `evidence/feedback-full-owner-mobile-addressed.png`. No product fix was made during the test-only task. The newer `feedback-recheck-main/feedback-editor-mobile.png` is a full-page screenshot and is not used to claim duplicate toasts.
- **FAIL B08.3 / UI-01:** the admin review summary still renders `Event Furniture 1 items` in the merged-main screenshot `evidence/feedback-recheck-main/feedback-admin-review.png`. No product fix was made during the test-only task.

The ledger has 76 detailed B-case rows: **38 PASS, 1 FAIL, 5 BLOCKED, 32 NOT RUN**. The acceptance gate is still **PARTIAL**. The 32 NOT RUN rows are explicit in `checklist.md`; important remaining work includes full field/location permutations, map transforms and autosave/dirty navigation, delete cancel/empty/error states, stale-owner/admin UI recovery, later admin feedback rounds, full history, invalid schedule and feed privacy, event-role RLS, keyboard-only review, and the complete viewport/theme/device matrix. Positive event visibility and approval remain blocked because the current feed has no eligible published event and the project protects approved rows from retirement. Native 200% zoom and physical touch also remain unavailable in this headless session. The forward migration catalog state remains unverified because this pass forbids SQL execution; the prior handoff said `20261004120000_event_review_integrity_forward_fixes.sql` was unapplied, and this revalidation does not change that.

**Evidence-file note:** the existing permission verifier writes to `docs/verification/create-event-2026-10-03/poster-permissions.json`. The October 6 rerun overwrote that prior untracked report before it was copied to the new current evidence path, so the exact previous JSON contents are no longer available. The latest 12-check output is preserved at `evidence/poster-permissions-browser.json`; this did not affect a product file or database fixture.

See `checklist.md` for per-case results and `defects.md` for the current defect/environment log. No full acceptance claim is made.

## Later local publication and student-map corrections — October 6

The user subsequently approved/published the sample through their manual flow. A new read-only browser pass against that existing eligible sample verified event-card visibility, both location maps, admin/student artwork and label parity, the centered grounds venue, desktop/mobile/landscape panels, and return to regular map. B07.3b is now PASS on the local working tree corrections. The detailed ledger's latest totals are 39 PASS, 1 FAIL, 4 BLOCKED and 32 NOT RUN across 76 B-case rows; the earlier empty-feed blocker is historical.

The user selected controlled browser/clock tests for scheduled publication, with no retained approved QA event. Scheduled-to-Upcoming/ongoing/expiry and publication inputs/commands were verified with intercepted responses, while the actual existing event metadata and update timestamp were unchanged. This is not a fresh live scheduling/persistence test. Browser checks: 10/10 PASS, no page errors; regressions: 132 PASS across 12 affected suites; production build: PASS. See `../create-event-2026-10-06-ui/publication-and-student-map-results.md` for the exact evidence modes and screenshots. Remaining wider-plan gaps remain open.
