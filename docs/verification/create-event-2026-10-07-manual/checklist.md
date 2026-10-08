# Create Event — Manual Testing Checklist

**Prepared:** October 7, 2026 · Asia/Manila
**Audience:** Tester at project owner na susubok sa actual browser.
**Goal:** Isa-isang patunayan ang functions, persistence, UI/UX, modals, loading, at animations ng Student Org → Admin → Student Org → Student flow sa desktop at mobile.
**Execution status:** PARTIAL. Na-run ang core same-event flow sa aktuwal na rendered app gamit ang browser UI automation sa desktop at mobile viewport. Hindi pa kumpleto ang lahat ng checklist cases; ang mga hindi nakalista sa run record ay NOT RUN.

### Run record — October 7, 2026 (Asia/Manila)

**Fixture:** `QA TEST Event Flow 0487deca` · `db0da611-5738-4c55-a9c1-61d2714d77bc` · event time Nov 21, 2026, 9:30 AM–5:00 PM PHT. Ginawa ang event mula sa Student Org UI at ginamit ang parehong event sa bawat role. Evidence: [`live-flow-results.json`](evidence/live-flow-results.json) at screenshots sa [`evidence/`](evidence/).

| Run check | Result | Evidence covered |
|---|---|---|
| SET-03 | PASS | Hiwalay na Org, Admin, at Student sign-in sessions. |
| TOAST-01 | PASS (2 saves) | Hindi hinarangan ng Save Draft toast ang Review & submit action. |
| SUBMIT-GATE | PASS | Na-block ang submission habang walang event asset ang requested building map; ipinakita ang kailangang ayusin. |
| CRE-FLOW | PASS | Org gumawa ng event na may Grounds at Student Center Ground Floor, naglagay at nag-save ng furniture sa parehong map, nag-review, at nagsumite. |
| ADM-FLOW | PASS | Admin nag-preview, nag-save ng feedback pin/comment, nagtakda ng future schedule gamit ang mobile time picker, at nag-approve/publish. |
| ORG-UPDATE | PASS | Naipakita sa event card ang `New GSO update`, Approved status, at admin feedback sa mobile viewport. |
| ORG-ACK | PASS | Org nagbukas ng approved read-only maps, minarkahang addressed ang pin, at napanatili ang note matapos reload. |
| STU-FLOW | PASS | Student nakita ang event sa Upcoming sa desktop/mobile, nagbukas ng details, at tumingin sa parehong requested maps. |
| CLEANUP | PASS | Admin nag-unpublish sa UI; nawala ang event sa Student Upcoming matapos refresh. Approved record ay nanatili dahil unpublish ang supported cleanup path. |

**Console:** walang browser `pageerror`; may apat na 403 at dalawang 404 failed-resource console messages na hindi natukoy ang source sa run na ito. Itinuturing itong follow-up, hindi clean-console pass. **Hindi pa na-run:** disapprove/revision round, scheduled-publication clock boundary, invalid-time/overlap cases, failures/retries, physical-device touch/keyboard, reduced motion, at iba pang unlisted checklist cases. Desktop/mobile dito ay browser viewport emulation, hindi pisikal na device test.

## 1. Run rules at evidence

### Additional run — October 8, 2026: approved final responsive/context audit

Targeted browser audit and fixes are documented in [`event-final-audit/README.md`](../event-final-audit/README.md). The complete matrix recorded **573 PASS checks**, followed by **129 PASS checks** for complete floor/access-feature framing and a final mobile/desktop venue-context/reduced-motion retest. Runs overlap and counts include repeated Tab/viewport assertions; they do not certify all checklist cases.

| Checklist area | Updated status and exact scope |
|---|---|
| VIS-01/03/04/06/07/09 | PASS for tested proposal/summary, admin review/date/time/map preview/pin draft, and public event panel/map states at eight listed viewports. Other editor/catalog/inspector screens retain their earlier status. |
| VIS-08 | PASS for tested 320×320 focused-input reflow and landscape/tablet sizes; native phone keyboard/rotation remains BLOCKED by unavailable hardware. |
| VIS-10/11/12 | PARTIAL: dark/reduced-motion proposal and clear selected-location/control states checked; this is not a complete contrast/hardware-touch audit. |
| KEY-01/02/06 | PASS for tested dialog Tab containment, nested date/time/map Escape, discard/opener focus, meaningful names and status/alert DOM semantics; actual screen-reader speech remains BLOCKED. |
| KEY-05 | PASS for tested public keyboard zoom and preservation through details; untested placement shortcuts are not marked passed. |
| ROLE-03/04 | Controlled foreign-owner payload, same-URL actor switch and delayed previous-actor response PASS; live second Org sign-in remains BLOCKED because no second Org credentials are available. |
| ERR-02 | Controlled expired read PASS with sign-in guidance and no editor/save controls. Shared sessions were not revoked. |
| ERR-01/06 | Public offline/refresh failure/reconnect PASS; new live save/submit/approval/publication faults were not rerun here. |
| END-03/04/05/09 | Targeted retests, affected suites/build/diff and report complete; zero browser page errors and zero live event/content mutations. Existing TypeScript/test/build baselines remain documented. |
| END-01/06/07/08 | No new live QA event or poster was created. Previous live core/persistence evidence remains dated October 7; the existing approved fixture was read only. |

**Overall execution remains PARTIAL.** Keep unmatched cases and screen cells unverified; this audit does not turn template checkboxes into a blanket PASS.

Pinayagan ng user ang UI creation ng QA event, paglalagay ng admin pins at feedback, disapproval/revision testing, approval, at pag-view bilang org at regular student. Pinayagan din ang targeted frontend improvements at loading/animation enhancements kapag may aktuwal na nakitang issue. Ito ang current authorization para sa run; napalitan na ang dating restriction na controlled fixtures lang.

- Lahat ng writes ay para sa uniquely named QA events na ginawa sa run na ito. Huwag baguhin ang ibang existing events, accounts, campus structures, o published base maps.
- Ang pangunahing journey ay gagawin sa visible UI: form, upload, canvas placement, Save, Submit, Review, pins, decision, at public map. Hindi API seed o injected React state ang ebidensiya ng UI-created journey.
- Magkahiwalay na browser sessions para sa Org, Admin, at Student. Gumamit ng parehong QA event ID sa bawat role handoff.
- Ang controlled network/clock tests ay supplemental at lalagyan ng **SIMULATED**. Hindi ito kapalit ng actual save/approval/publication persistence.
- Walang commit/push, deployment, account creation, o database/schema migration na implied ng testing checklist.
- Kapag may defect: capture muna ang before screenshot, exact reproduction, actual/expected result; saka targeted fix, affected tests, at parehong desktop/mobile recheck.
- Kung approved QA event ay hindi puwedeng i-delete sa supported UI, **Unpublish** ito at itala ang retained approved QA record. Huwag mag-bypass ng database guard o mag-delete ng audit history.

### Result notation

Every case starts **NOT RUN**. Use **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** per viewport/role subcase. A checked box means all required subcases of that item are PASS, hindi basta na-click ang button.

Record bawat executed item: `Case ID · status · role · browser · viewport · theme · input · time/PHT · fixture alias · exact actions · expected/actual · screenshot/video · console/network findings · persistence/readback · defect ID · retest result`.

PASS requires visible UI evidence; saving/decision cases require reopening or reload. BLOCKED must name the unavailable account/device/backend prerequisite. Huwag gawing PASS ang unavailable o hindi nasubukang function.

### Test fixtures

| Alias | Purpose | Initial content |
|---|---|---|
| `QA-CE-<PHT timestamp>-DESKTOP` | Full desktop journey, including needs revision, resubmit, approval, and approved follow-up | Grounds + one published building floor; grounds: 2 chairs, 1 table, 1 label; floor: 1 chair, 1 label. Initial total: 4 furniture, 2 labels. |
| `QA-CE-<PHT timestamp>-MOBILE` | Repeat full core journey with mobile input | Same two-location structure, uniquely identifiable labels and comments. |
| `QA-CE-<PHT timestamp>-AUX` | Optional withdrawal, duplication, deletion, limits, and failure cases | Own disposable draft; create only when a separate fixture is needed. |

Record actual counts after intentional edits; do not continue asserting initial totals after duplication/deletion/preset changes. Use non-personal posters and comments. Record IDs privately without auth tokens or passwords.

### Viewport and input matrix

| Profile | Viewport | Required scope |
|---|---|---|
| Desktop | 1440 × 900 | Complete role journey, mouse and keyboard |
| Wide desktop | 1920 × 1080 | Cards, editor, admin preview, all modals, student map |
| Mobile portrait | 390 × 844 | Complete role journey with touch emulation; physical-device check separately |
| Small mobile | 360 × 640 and 320 × 568 | Forms, footer buttons, long text, feedback, date/time pickers, student sheet |
| Mobile landscape | 740 × 390 | Every modal, nested picker, keyboard-open state, editor and map overlays |
| Tablet | 768 × 1024 | Location switching, editor panels, review and student sheet |
| Browser zoom | Desktop at actual 200% zoom | Reflow, dialog controls, focus visibility, readable cards and feedback |
| Physical touch | Available Android/iOS device | Place/move, pan/pinch, software keyboard, scroll and rotate device; mark BLOCKED if no device |

Check light and dark themes on desktop and mobile. Repeat motion checks with OS/browser reduced motion enabled. Resizing a browser is not proof of physical touch or native 200% zoom.

## 2. Current behavior to verify

These expectations come from the current implementation, not a new feature proposal:

- Event title is required. Description, organization name, and poster are optional. Select at least one requested location; the org does not set the event schedule in Create event.
- Only published campuses/building floors are requestable. One proposal can contain several distinct locations.
- Posters accept JPEG, PNG, and WebP, up to 5 MB.
- Event furniture uses fixed catalog dimensions. Move and rotate it; furniture resize is not a supported editor action. Labels have text, font size, color, and rotation controls.
- The event overlay must not modify buildings, doors, permanent furniture, paths, or the admin-published base map.
- An admin **Save pin** stages the pin in the review draft. The browser can restore that draft on reload; the review decision is what persists feedback for the org. These states need distinct, honest wording.
- Org cards show Draft, Pending Review, Needs Revision, or Approved with the correct next action.
- Unresolved feedback pins block org resubmission. Addressing a pin is the org's reported resolution; the admin still makes the review decision.
- Approved layouts stay locked. The owner can mark approved follow-up pins addressed or reopen them without editing the approved map/schedule/publication.
- Addressed pins leave the owner's open-pin canvas list but remain in the Addressed checklist with their resolution note/time. The feedback record is not silently deleted.
- Changed admin feedback invalidates old acknowledgements for that location under the current location-wide rule; do not require future per-pin invalidation behavior.
- My Events unread marks are stored per owner/event/review fingerprint in the current browser. Read status is not promised to sync to another device. Approval, disapproval, or changed review comments/pins create a new unread update.
- A **scheduled publication** is hidden until its publication time. Upcoming means published before the event starts; Ongoing means the event has started and not yet ended. All dates display in Asia/Manila.

## 3. Setup and baseline

- [ ] **SET-01** Record current commit, branch, dirty files, app URL, browser, and PHT time. Expected: existing local changes are preserved and the run can be reproduced.
- [ ] **SET-02** Open the current dev server and event routes. Expected: no blank page, compilation overlay, route crash, or permanent loading screen.
- [ ] **SET-03** Sign in separately as existing Student Org, Admin/GSO, and regular Student. Expected: each session has the correct role/navigation and stays isolated while switching roles.
- [ ] **SET-04** Identify a published campus, grounds, and published building floor. Expected: maps load; missing prerequisites are recorded before creation.
- [ ] **SET-05** Record existing event list/counts and base map appearance. Expected: unrelated data can be compared after testing.
- [ ] **SET-06** Prepare unique fixture names, valid posters, unsupported file, and file above 5 MB. Expected: no real personal image/text needed.
- [ ] **SET-07** Inspect supported draft-delete and approved-unpublish paths. Expected: cleanup method is recorded before live mutation.
- [ ] **SET-08** Start console/page-error and sanitized network observation. Expected: credentials, cookies, auth headers, and private raw payloads are not written to evidence.

## 4. Student Org — My Events entry

- [ ] **ORG-01** Open My Events from Home, desktop nav, and mobile nav. Expected: correct route and active navigation state; primary Create event action is easy to find.
- [ ] **ORG-02** Observe first load and campus load. Expected: clear loading feedback, stable page layout, and Create event becomes available when published locations finish loading.
- [ ] **ORG-03** Test an empty list in an isolated response. Expected: helpful empty state and reachable Create event; distinguish empty results from request failure.
- [ ] **ORG-04** Fail list/campus loading, then retry. Expected: honest error, visible retry, no fake empty state or disabled button without explanation.
- [ ] **ORG-05** Inspect existing status cards. Expected: title, status, campus, locations, counts, edit time/history, and next-step text agree with saved data.
- [ ] **ORG-06** Resize with a long title and organizer. Expected: wrapping, no card overflow, status does not cover title, all actions remain usable.

## 5. Student Org — Create event details

- [ ] **CRE-01** Open Create event. Expected: one focused modal, clear title/progress, visible close/cancel, correctly dimmed background.
- [ ] **CRE-02** Click Continue with empty and whitespace-only title. Expected: title-required error, no draft created, other entered values preserved.
- [ ] **CRE-03** Enter title with punctuation, apostrophe, emoji, and a long unbroken string. Expected: safe text display and readable wrapping across all later consumers.
- [ ] **CRE-04** Enter multiline description and optional organization name. Expected: fields remain readable, entered line breaks persist, no unnecessary required validation.
- [ ] **CRE-05** Leave optional organization/description/poster empty and proceed. Expected: valid creation remains possible; fallback organizer is understandable.
- [ ] **CRE-06** Continue → Back → Continue. Expected: details and selected poster persist; progress reflects the current step.
- [ ] **CRE-07** Close/Escape/cancel after entering details. Expected: discard warning when dirty; Keep editing preserves inputs; confirmed discard clears only the unsaved form.
- [ ] **CRE-08** Open/close with a clean form. Expected: no unnecessary discard prompt, focus returns to Create event, page scroll is restored.
- [ ] **CRE-09** Type with mobile software keyboard open. Expected: active field and needed action can be reached, modal body scrolls, keyboard does not trap the footer permanently.

## 6. Student Org — Requested locations

- [ ] **LOC-01** Select Campus Grounds. Expected: readable selected state, correct campus, accurate selected count.
- [ ] **LOC-02** Expand a building and select a published floor. Expected: building and floor labels are clear; total becomes two distinct locations.
- [ ] **LOC-03** Toggle selected locations off/on and attempt duplicate selection. Expected: count is accurate, no duplicate location record.
- [ ] **LOC-04** Deselect all. Expected: Create & design maps is disabled with visible guidance, no empty proposal is created.
- [ ] **LOC-05** Inspect unavailable/unpublished floors. Expected: not selectable as usable maps; loading/error/empty floor states are understandable.
- [ ] **LOC-06** Change campus with selections. Expected: Keep campus preserves them; Change and clear removes old-campus locations while retaining event details.
- [ ] **LOC-07** Choose several locations and long building/floor names. Expected: scrollable list, readable labels, selected count and footer remain visible.
- [ ] **LOC-08** Use keyboard/touch selection. Expected: full clickable row/checkbox, focus feedback, selected state communicated beyond color.

## 7. Poster upload and details editing

- [ ] **POS-01** Select valid JPEG, PNG, and WebP in separate trials. Expected: file identity/preview as provided by UI; each supported type can save.
- [ ] **POS-02** Select unsupported file and image above 5 MB. Expected: actionable type/size error, no upload/success claim, other fields retained.
- [ ] **POS-03** Remove selected poster, replace it, cancel file chooser. Expected: correct current selection, no stale filename/image or unintended removal.
- [ ] **POS-04** Create the main QA event with poster and reload My Events. Expected: intended poster belongs to that event and remains accessible.
- [ ] **POS-05** Edit own draft details and replace/remove poster; Save changes and reload. Expected: exact saved title/description/organizer/image reference; old preview does not return.
- [ ] **POS-06** Cancel details edit. Expected: saved event unchanged, no misleading success toast.
- [ ] **POS-07** Simulate upload failure before request reaches server, restore connection, retry. Expected: visible progress/error, retained inputs, exactly one event after successful retry.
- [ ] **POS-08** Simulate lost save response after commit on own fixture. Expected: retry recovers the same creation rather than creating a duplicate; referenced poster is not deleted as unused.
- [ ] **POS-09** Inspect poster in org/admin/student consumers that implement a poster slot. Expected: no stretched image, broken-image icon, clipped content controls, or incorrect event image.

## 8. Confirmation and workspace creation

- [ ] **CONF-01** Click Create & design maps. Expected: confirmation shows exact title, organizer/campus, map count, and all selected location labels.
- [ ] **CONF-02** Inspect portrait and short landscape. Expected: Back to locations and Confirm & design stay visible; summary has its own scroll when needed.
- [ ] **CONF-03** Back to locations, adjust selection, reopen. Expected: latest locations/count; no stale confirmation data.
- [ ] **CONF-04** Confirm once under slow network. Expected: visible Creating/Preparing workspace state, disabled duplicate actions, no premature success/navigation.
- [ ] **CONF-05** Try double-click and repeated Enter. Expected: exactly one QA event and one workspace; busy controls prevent a second effective creation.
- [ ] **CONF-06** Reload My Events and reopen workspace after creation. Expected: Draft, correct owner/campus/poster/locations, all maps load the correct published base.
- [ ] **CONF-07** Fail creation before server mutation and retry. Expected: clear error, form retained, buttons recover, success toast only after confirmed success.
- [ ] **CONF-08** Inspect motion during modal open, loading, success, and route handoff. Expected: no flash, jarring jump, overlapping modal, or spinner that remains after completion.

## 9. Student Org — Map editor placement and navigation

- [ ] **EDIT-01** Open tutorial/help and dismiss/reopen if offered. Expected: readable steps, visible controls, no blocked map or repeated forced tutorial after saved dismissal.
- [ ] **EDIT-02** Switch grounds ↔ requested floor. Expected: active location label/base map are correct and event items remain independent.
- [ ] **EDIT-03** Place initial 2 chairs, 1 table, and label on grounds; 1 chair and label on floor through UI. Expected: correct catalog appearance, counts, and map coordinates.
- [ ] **EDIT-04** Select a catalog asset before clicking map. Expected: visible placement preview/cursor, clear cancel, no item created just by opening the palette.
- [ ] **EDIT-05** Toggle Place multiple and place several assets, then cancel. Expected: correct one-versus-repeat behavior, no accidental extra asset after leaving placement mode.
- [ ] **EDIT-06** On touch, use preview/Place here where offered. Expected: position can be adjusted before placement; tap and drag do not accidentally create duplicates.
- [ ] **EDIT-07** Move an item by drag and Move here. Expected: preview matches committed position at several zoom levels; Cancel move leaves prior position.
- [ ] **EDIT-08** Select/delete/undo/redo a QA item. Expected: correct item identity and counts; repeated undo/redo does not corrupt location data.
- [ ] **EDIT-09** Pan/zoom/fit/focus items. Expected: map can be explored without moving base/event items in pan mode; fit does not hide toolbars or selected item.
- [ ] **EDIT-10** Test wheel, supported Ctrl/Meta+wheel, touch pinch, and resize. Expected: intended scroll/zoom only, no stuck drag/pinch or page zoom claimed as canvas zoom.
- [ ] **EDIT-11** Select near map edge and behind overlapping items. Expected: reachable actions/selection outline; no inspector or floating toolbar clipped offscreen.
- [ ] **EDIT-12** Try dragging buildings, doors, permanent furniture, and paths. Expected: base map stays locked; only QA event overlay items change.
- [ ] **EDIT-13** Switch location while an item is selected or placement is active. Expected: no selection/preview from the previous location applied to the next map.
- [ ] **EDIT-14** Test event objects list search, filters, select, rename/save/cancel. Expected: exact matching item, updated readable name, no base assets editable through this list.

## 10. Item details, labels, multiple selection and layouts

- [ ] **ITEM-01** Open Details on desktop and mobile. Expected: desktop rail/mobile sheet fits, field labels visible, Done/Close reachable, map selection remains identifiable.
- [ ] **ITEM-02** Rotate furniture using both direction controls and rotation field. Expected: correct 15-degree increments and normalized saved angle; fixed width/height do not change.
- [ ] **ITEM-03** Lock/unlock furniture and label. Expected: locked geometry cannot move/rotate/edit; lock state survives save/reload; unlocking restores valid actions.
- [ ] **ITEM-04** Use Advanced X/Y fields at bounds and negative/extreme input. Expected: supported clamping/validation, no NaN position or item lost outside map.
- [ ] **ITEM-05** Hide/show, bring front/send back, and ungroup when available. Expected: intended visibility/layer/group change; summary meaning remains consistent.
- [ ] **ITEM-06** Edit label text inline and in Details. Expected: same saved text, multiline/long text handled, typing does not trigger map shortcuts.
- [ ] **ITEM-07** Change font size, rotation, color swatch, valid/invalid hex. Expected: supported font bounds (8–96), valid color updates, invalid hex guidance without corrupt color.
- [ ] **ITEM-08** Select multiple QA items, move/rotate/duplicate/delete/undo them. Expected: exact selection count and relative placement; locked items and base assets stay protected.
- [ ] **ITEM-09** Use Arrange where available. Expected: selected items arrange as requested, no unrelated item affected.
- [ ] **ITEM-10** Open ready-made layouts, change quantity/rows/spacing/gaps/aisle/rotation. Expected: live preview and validation agree with chosen values; controls fit mobile.
- [ ] **ITEM-11** Move/confirm preset preview, cancel, then Undo. Expected: no items before confirmation, exact generated count, atomic removal on Undo.
- [ ] **ITEM-12** Enter invalid preset quantity/spacing and place preview outside allowed area. Expected: clear reason, no invalid confirmation, entered valid fields retained.
- [ ] **ITEM-13** Toggle snapping and inspect placement guides. Expected: chosen snapping behavior, preview/committed positions agree; guides do not obscure action buttons.
- [ ] **ITEM-14** Open inspector/preset/object list together in supported combinations. Expected: only appropriate active panel, correct stacking/focus, no duplicated giant banners or lost canvas space.

## 11. Save, autosave, recovery and readiness

- [ ] **SAVE-01** Save each location manually. Expected: visible Saving → Saved/success, exactly one toast per action, accurate counts and coordinates after reload.
- [ ] **SAVE-02** Make changes and wait for autosave. Expected: honest dirty/saving/saved state, no permanent spinner or false Saved before latest work is persisted.
- [ ] **SAVE-03** Rapid edit while an older save is delayed, then make another edit. Expected: latest changes survive older response and final reload; no infinite save loop.
- [ ] **SAVE-04** Edit both locations, switch/reload/open from My Events. Expected: one location never overwrites the other; items/poster/details persist.
- [ ] **SAVE-05** Leave/back/switch route or location with unsaved work; choose Cancel. Expected: stay with exact current work and selection context.
- [ ] **SAVE-06** Repeat and choose Save & leave, then Don't Save. Expected: saved branch waits for success; discarded branch drops only intended unsaved changes.
- [ ] **SAVE-07** Reload during dirty work and use offered recovery. Expected: recover/discard choices are truthful; recovered draft does not silently replace newer server work.
- [ ] **SAVE-08** Trigger save failure/offline, restore connection, retry. Expected: work retained, clear error, retry available, one confirmed save and no false success.
- [ ] **READY-01** Attempt placement across a building/access/permanent asset or outside canvas. Expected: preview rejection or critical readiness blocker with item/location guidance.
- [ ] **READY-02** Produce furniture overlap or optional spacing hint. Expected: advisory warning is distinguished from critical blocker; current warning-only submission policy is respected.
- [ ] **READY-03** Fix a critical issue and reopen readiness. Expected: current geometry is rechecked; obsolete blocker disappears; valid submission becomes available.
- [ ] **READY-04** Inspect Furniture summary. Expected: correct per-location/type totals, labels counted separately, permanent base assets excluded, hidden-item policy clear.

## 12. Submit, pending edits and withdrawal

- [ ] **SUB-01** Open Submit to GSO review. Expected: all requested locations, totals, warnings/blockers, title, next step and footer visible.
- [ ] **SUB-02** Use review-location link and Keep editing/cancel. Expected: correct map opens, no submission occurs, edited work retained.
- [ ] **SUB-03** Confirm submit once. Expected: same event becomes Pending Review, actual submission timestamp recorded, one success message, all maps included.
- [ ] **SUB-04** Reload My Events and admin queue. Expected: org shows correct pending next step; admin sees the same saved locations/items.
- [ ] **SUB-05** Double-click submit under delay and retry a failed request. Expected: one effective transition, no duplicate event or submit record from accidental repeated action.
- [ ] **SUB-06** Edit a pending map, save, Review & update GSO, confirm. Expected: Pending remains, original submission timestamp retained, admin sees newest layout and update history.
- [ ] **SUB-07** Cancel Withdraw submission. Expected: pending event and admin queue unchanged.
- [ ] **SUB-08** On AUX fixture confirm Withdraw to draft, edit and submit again. Expected: same event ID/maps/poster, removed from pending queue then reappears with valid new submission state.
- [ ] **SUB-09** Fail submit/update/withdraw in isolated own-fixture requests. Expected: truthful error, no lost map or false transition, buttons recover for deliberate retry.

## 13. Admin — Queue and requested-map preview

- [ ] **ADM-01** Open Event Layouts and find exact QA event. Expected: clear Pending Review action and matching owner/organizer/title/location/time/counts.
- [ ] **ADM-02** Search, switch All/Pending/Approved/Disapproved filters, clear search. Expected: appropriate cards/counts/empty results; unrelated events untouched.
- [ ] **ADM-03** Open Open map preview, close, then Review submission → Preview requested maps. Expected: same event/maps/items/counts; preview returns to correct review context without a new tab.
- [ ] **ADM-04** Switch grounds/floor in preview. Expected: correct published base and QA assets per location; long location names readable.
- [ ] **ADM-05** Pan on blank space, a building, and event furniture; test fit/zoom/focus. Expected: viewport changes only, no editable object or accidental feedback pin.
- [ ] **ADM-06** Test supported shortcuts (H/Space/0 and displayed shortcuts). Expected: viewport behavior as advertised; typing in comment inputs does not trigger shortcuts.
- [ ] **ADM-07** Open Furniture summary from card/preview. Expected: accurate cross-location counts and actual item names; long list scrolls with close reachable.
- [ ] **ADM-08** Wheel/touch-scroll over canvas, feedback, summary, and review modal. Expected: only intended region scrolls; background page remains locked while modal open.
- [ ] **ADM-09** Close nested summary/preview/review in order. Expected: one layer closes at a time, correct focus restoration, unsent input retained or explicit discard choice.
- [ ] **ADM-10** Inspect owner identifier display and missing legacy timestamp simulation. Expected: readable organization identity; unavailable time not fabricated; UUID not dominant card text.

## 14. Admin — Pin placement, comment and review draft

- [ ] **PIN-01** Click Add pin/Drop pin. Expected: clear placement mode and pin preview following mouse on canvas; user immediately knows a click can place it.
- [ ] **PIN-02** Place at a recognizable grounds point and enter comment. Expected: preview marker at clicked map point, readable editor, visible Save pin/Cancel.
- [ ] **PIN-03** Save pin and add another on the building floor at another zoom. Expected: numbered location-scoped pins; coordinates remain correct after pan/zoom.
- [ ] **PIN-04** Drag canvas instead of click, click toolbar, move pointer outside canvas. Expected: no accidental placement; preview does not block toolbar or intercept clicks.
- [ ] **PIN-05** Cancel placement/comment and switch locations with unsaved comment. Expected: explicit preserved/discarded state; no ghost pin or lost text without guidance.
- [ ] **PIN-06** Save pin → close preview → reopen. Expected: staged pin and comment remain in the same review draft and correct location.
- [ ] **PIN-07** Reload app before decision and reopen the same review. Expected: browser-saved draft is restored with notice; saved pins/comments/schedule do not vanish silently.
- [ ] **PIN-08** Inspect feedback from org before decision. Expected: staged admin review changes are not represented as already delivered server feedback.
- [ ] **PIN-09** Remove one staged pin, cancel removal where confirmation exists, then finalize intended removal. Expected: compact row/action, correct pin removed, neighboring pins/comments intact.
- [ ] **PIN-10** Type long location feedback and admin comment. Expected: readable wrapping/scroll; Remove button does not create excessive empty row height.
- [ ] **PIN-11** Reach the 30-pin authoring limit on an AUX review if feasible. Expected: visible capacity, no silent loss/31st creation; long feedback list bounded and usable.
- [ ] **PIN-12** Cancel outer review with staged changes. Expected: discard prompt; Keep reviewing preserves draft, Discard review clears only that reviewer/event draft.
- [ ] **PIN-13** Open another QA event/reviewer context. Expected: local review drafts never leak to another event/account.
- [ ] **PIN-14** Owner updates pending event after admin draft saved. Expected: stale draft is flagged instead of silently applied to the newer revision.

## 15. Admin — Disapprove, then Org revise/resubmit

- [ ] **REV-01** Try Disapprove without required admin comment. Expected: disabled action or clear validation; no decision persisted.
- [ ] **REV-02** Enter meaningful reason plus grounds/floor pins and location feedback; Disapprove once. Expected: visible decision loading, exact feedback saved, Needs Revision for org.
- [ ] **REV-03** Reload admin and org after decision. Expected: decision/pins/comments persist; review draft is no longer mistaken for unsent work.
- [ ] **REV-04** Keep org Home/My Events open while admin decides. Expected: new review update appears on refresh/focus/poll; record observed delay against current 15-second poll behavior.
- [ ] **REV-05** Inspect desktop My Events and mobile nav badges. Expected: unread count reflects affected events; only the reviewed QA card gets its New GSO update mark.
- [ ] **REV-06** Read one event through Revise maps or Mark as read. Expected: only that event's unread mark/count clears; same-browser reload retains it.
- [ ] **REV-07** Create a later changed review update. Expected: unread mark returns; an old displayed revision cannot acknowledge an unseen newer review.
- [ ] **REV-08** Read general/location/pin feedback in org list/editor. Expected: correct text/status/location; no raw serialized feedback or giant duplicated panel.
- [ ] **REV-09** Show on map for each pin. Expected: correct location and point are focused; locating alone does not mark addressed.
- [ ] **REV-10** Fix actual QA furniture, add a resolution note, mark first pin addressed. Expected: progress/filter/status update; open canvas pin is hidden, addressed record/note remain readable.
- [ ] **REV-11** Try resubmit while another pin stays open. Expected: submission blocked with guidance; outstanding checklist opens/focuses the relevant control.
- [ ] **REV-12** Resolve remaining pin on mobile, reload and reopen. Expected: saved note/status/PHT time persists, progress equals resolved total.
- [ ] **REV-13** Reopen an addressed issue. Expected: Open status, canvas pin and resubmit gate return without changing its original comment/position.
- [ ] **REV-14** Fail Mark as addressed/Reopen request and retry. Expected: typed note/work retained, no false addressed success, one final persisted state.
- [ ] **REV-15** Address all, Review & resubmit, confirm. Expected: same event becomes Pending, revised maps and resolution notes available to admin.

## 16. Admin — Re-review, date/time, approval

- [ ] **APR-01** Open resubmitted QA event. Expected: newest layout, notes and addressed progress; clear distinction between org-reported fix and admin decision.
- [ ] **APR-02** Show fixes on each map and compare summary/history. Expected: actual moved/changed QA items, not just changed checklist labels.
- [ ] **APR-03** Change/add feedback in one location in a later round. Expected: old acknowledgements in that changed location do not satisfy changed feedback; other-location behavior matches current rule.
- [ ] **APR-04** Open event start/end date and time pickers. Expected: popup stays inside viewport, scrollable minute list, visible hour/AM/PM/Done, no background scroll trap.
- [ ] **APR-05** Choose minutes 00, 09, 10, 59; hours 1, 11, 12; AM and PM. Expected: clicked selection and reopened display agree; no inability to scroll to later minutes.
- [ ] **APR-06** Inspect 12:00 AM, 12:00 PM, 11:59 PM, and a cross-midnight schedule without saving unwanted dates. Expected: correct Asia/Manila interpretation and date rollover.
- [ ] **APR-07** Try missing dates, equal start/end, and end before start. Expected: Approve blocked with clear guidance, entered comments/pins retained.
- [ ] **APR-08** Set a QA-only overlapping venue/time, then a non-overlapping interval. Expected: conflict warning names actual conflict, clears when overlap removed; warning and schedule error are distinct.
- [ ] **APR-09** Fail conflict lookup. Expected: truthful cannot-check warning; absence of result is not called no conflict.
- [ ] **APR-10** Set valid event dates relative to current PHT time immediately before approval. Expected: sufficient time to test publication; start/end shown consistently in all roles.
- [ ] **APR-11** Select Publish now after approval. Expected: publication choice clear and separate from event start/end; future event becomes public Upcoming after approval.
- [ ] **APR-12** Test Schedule publication with past time and publication at/after end. Expected: specific validation, blocked save/approval, no false scheduled state.
- [ ] **APR-13** Add one intentional follow-up pin before final approval, with wording that does not require altering the approved layout. Expected: approval does not imply pin deletion; admin instructions explain owner follow-up.
- [ ] **APR-14** Approve once under slow request; try double-click. Expected: visible Approving/busy state, one decision, one success notification, correct approved card.
- [ ] **APR-15** Reload admin and org. Expected: Approved, exact maps/schedule/publication/feedback; local review draft cleared.
- [ ] **APR-16** Attempt stale review after owner updated submission in another session. Expected: recoverable conflict, no stale decision overwrites newest revision; refresh leads to correct current review.

## 17. Student Org — Approved result and follow-up

- [ ] **APPORG-01** Inspect new approval badge/unread/nav/card. Expected: same affected-event behavior as disapproval; Approved next-step guidance is accurate.
- [ ] **APPORG-02** Open View maps. Expected: approved read-only label; no furniture, title/location, schedule or publication edit affordance claiming it is editable.
- [ ] **APPORG-03** Inspect remaining approved follow-up pin. Expected: visible until owner marks addressed; instructions explain that approval and feedback are separate states.
- [ ] **APPORG-04** Enter note and Mark as addressed. Expected: persisted status/note, updated progress, open pin disappears from org canvas; approved furniture/labels/date/publication stay identical.
- [ ] **APPORG-05** Reload as org and re-open as admin. Expected: resolution remains visible; admin can inspect the follow-up status, original feedback retained.
- [ ] **APPORG-06** Reopen approved follow-up. Expected: status-only change is allowed for owner, pin returns, approved layout remains locked.
- [ ] **APPORG-07** Check there is no misleading Delete pin/Remove feedback action for org. Expected: resolving/reopening is clearly distinct from admin removing staged feedback.
- [ ] **APPORG-08** Review history after approved resolution/reopen. Expected: truthful actions/time, no fabricated content edit or approval revision.

## 18. Student — Published map and event panel

- [ ] **STU-01** Sign in as regular Student and open Map. Expected: no org/admin mutation controls; correct student navigation.
- [ ] **STU-02** Open Event map outside buildings. Expected: panel/sheet, All/Ongoing/Upcoming controls, readable counts, clear close/back.
- [ ] **STU-03** Open approved published future QA event in Upcoming and All. Expected: exact title/start time/organizer/location count and Upcoming badge; not in Ongoing yet.
- [ ] **STU-04** Open event details. Expected: full schedule/PHT context, description/poster where supplied, long titles accessible, every location View button reachable by scrolling.
- [ ] **STU-05** View grounds and floor through event locations. Expected: correct QA furniture/labels at saved coordinates over correct base; active View/Viewing state.
- [ ] **STU-06** Enter a building through normal map entrance without using event's View. Expected: Event map action remains available; filters/event context are accessible inside and outside buildings.
- [ ] **STU-07** Switch floor, exit to campus, change supported campus selection, then back. Expected: no stale overlay on wrong floor/campus; correct event filter behavior and navigation context.
- [ ] **STU-08** Test mobile peek/list/expanded event sheet controls. Expected: enough usable map, visible event actions, content scrolls without dragging canvas accidentally.
- [ ] **STU-09** Pan/zoom/select map while panel is open. Expected: no event furniture can be edited; panel, map utility buttons, and campus/floor selector do not overlap.
- [ ] **STU-10** Close/back/reopen panel. Expected: predictable filter/selection state, no stuck event overlay or broken map navigation.
- [ ] **STU-11** Reload student app during public preview. Expected: published event still discoverable; QA additions remain correct.
- [ ] **STU-12** Inspect public UI and sanitized public response. Expected: no admin feedback pins, private comments/resolutions/history, owner identifiers or review draft exposed.
- [ ] **STU-13** Simulate event-list/map load failure and retry. Expected: distinguish error from No upcoming events; retry and map remain usable.
- [ ] **STU-14** Open multiple eligible events if available. Expected: selected event's additions only; no mixing maps/items from another event.

## 19. Publication timing, reschedule, unpublish and expiry

For the timing fixture, set dates immediately before approval. Example: publication = current PHT + 3 minutes, start = + 10 minutes, end = + 20 minutes; account for date rollover and avoid conflicts. Record exact real server timestamps. Use real boundary observation where feasible; label clock simulation separately.

- [ ] **PUB-01** Approve with scheduled publication before start. Expected: admin Scheduled state; student cannot see it before publication even though Approved.
- [ ] **PUB-02** Observe publication boundary and refresh student feed. Expected: becomes Upcoming only after eligible server publication time; record actual refresh/poll latency.
- [ ] **PUB-03** Observe event start boundary. Expected: same event moves Upcoming → Ongoing, counts/labels agree, public layout unchanged.
- [ ] **PUB-04** Observe event end boundary. Expected: removed from Ongoing and All/public map; selected preview/pins are dismissed or updated cleanly without reload required for stale removal.
- [ ] **PUB-05** Open Manage publication on a currently visible QA event. Expected: Published status/action, configured publication and start/end readable; Publish now cannot repeatedly publish the already visible event.
- [ ] **PUB-06** Choose future schedule on visible event. Expected: confirmation explains it will hide until new time; Keep visible leaves it unchanged.
- [ ] **PUB-07** Confirm schedule and reload both roles. Expected: hidden from student until new publication; approved map and event dates stay the same.
- [ ] **PUB-08** Click Unpublish then Keep published. Expected: no data/public visibility change.
- [ ] **PUB-09** Confirm Unpublish. Expected: no public card/overlay after refresh; admin Unpublished state; Approved/maps/schedule/owner/history remain.
- [ ] **PUB-10** Publish now again before end. Expected: future-start fixture becomes Upcoming, already-started fixture becomes Ongoing; no duplicate public event.
- [ ] **PUB-11** Try publication after end or invalid timing. Expected: honest ended/unavailable guidance, no resurrected expired public event.
- [ ] **PUB-12** Test publication request failure/stale revision. Expected: visible error, no false Published/Unpublished claim, explicit refresh/retry; final state agrees after reload.

## 20. History, duplication, deletion and data consistency

- [ ] **HIS-01** Expand history after creation/edit/submit/update/reject/address/reopen/resubmit/approve/publication. Expected: order, actor, time, and action match recorded real operations.
- [ ] **HIS-02** Compare Changes since submission with a known add/remove/move. Expected: actual baseline and location; missing baseline is called unavailable rather than no changes.
- [ ] **HIS-03** Test history loading, empty, failed/retry and long-list states with isolated responses. Expected: distinct state text, readable rows, bounded scrolling, no hidden close/action.
- [ ] **HIS-04** Duplicate a QA rejected/approved event. Expected: new own Draft, distinct ID, copied intended content, no inherited decision/schedule/feedback resolutions/audit state; source unchanged.
- [ ] **HIS-05** Cancel then confirm Delete of own AUX draft. Expected: cancellation preserves it; confirmed delete disappears after reload; base map and other events unchanged.
- [ ] **HIS-06** Verify linked/shared poster reference before cleanup of a duplicate. Expected: deleting one fixture does not break another fixture's referenced image.
- [ ] **HIS-07** Compare same main fixture across org/admin/student. Expected: title, organizer, poster, campus/floor, furniture/labels, counts and coordinates agree where visible; private data excluded from student.
- [ ] **HIS-08** Return between My Events/editor/admin/student routes repeatedly. Expected: no stale previous event state, wrong labels, duplicated controls/toasts or growing overlay artifacts.

## 21. Role boundaries and recovery edge cases

- [ ] **ROLE-01** Regular student opens org Create/edit/admin routes directly. Expected: appropriate redirect/denial; no visible mutation success or private feedback.
- [ ] **ROLE-02** Owner attempts review/publication/schedule mutation through available UI. Expected: admin-only actions unavailable; approved owner actions limited to supported feedback status.
- [ ] **ROLE-03** Use unrelated existing org account if available. Expected: cannot view/edit/review/resolve main fixture's private event; otherwise record exact account prerequisite BLOCKED.
- [ ] **ROLE-04** Log out/login as another role in one isolated browser. Expected: no previous role's nav, unread badge, private event cache, or local review draft leaks.
- [ ] **ERR-01** Offline/timeout/server failure for own fixture's save, submit, decision and publication. Expected: truthful failure, entered work retained, visible retry, no duplicate or irreversible false success.
- [ ] **ERR-02** Expire only isolated test session. Expected: sign-in/retry guidance with recoverable work; shared account sessions not revoked.
- [ ] **ERR-03** Two owner sessions edit same QA event. Expected: stale update rejected or deliberate recovery; newer server map preserved and older local work not silently lost.
- [ ] **ERR-04** Overlap autosave, feedback resolution and submission. Expected: actions serialized/blocked or recoverable conflict; no lost map/status after reload.
- [ ] **ERR-05** Fail/miss required RPC in an intercepted own-fixture request. Expected: readable actionable error, no silent fallback that bypasses permissions; no migration is executed as part of testing.
- [ ] **ERR-06** Restore all interceptors/network and repeat normal save/action. Expected: normal behavior returns; simulated fault is not left active during final checks.

## 22. UI/UX checks on EVERY screen and modal

Apply each item to the screen matrix below, in desktop and mobile. Split FAIL/BLOCKED subcases rather than reporting the whole matrix PASS.

- [ ] **VIS-01** Scan all content, not only top of screen. Expected: title, status, helper/error text, full list, last field, footer and close button are reachable and readable.
- [ ] **VIS-02** Compare spacing, font sizes, radii, alignment and button styles. Expected: consistent established design; no oversized feedback checklist/card swallowing the map.
- [ ] **VIS-03** Check document overflow and modal/sheet dimensions. Expected: no unintended horizontal scrolling, clipped button/text, excessive blank area, or collapsed canvas.
- [ ] **VIS-04** Use long titles, organization names, building/floor names and comments. Expected: wrap or accessible full detail; truncation never hides the only useful identity or action.
- [ ] **VIS-05** Inspect action hierarchy. Expected: one obvious primary action, clear secondary/destructive actions, understandable disabled reason.
- [ ] **VIS-06** Open all nested dialogs/popovers near screen edges. Expected: correct stacking/portal, no picker hidden behind modal or outside viewport.
- [ ] **VIS-07** Scroll each modal body/list to bottom and back. Expected: footer/header as designed, last item visible, no scroll leak or trapped minutes column.
- [ ] **VIS-08** Resize/rotate while modal, inspector, keyboard or sheet is open. Expected: responsive repositioning, preserved input/state, reachable actions.
- [ ] **VIS-09** Inspect map overlays: toolbar, placement preview, pin editor, feedback list, event panel, floor selector and mobile navigation. Expected: no overlap/occlusion or invisible selected item.
- [ ] **VIS-10** Inspect light/dark contrast and status colors. Expected: text/icons readable; selected/error/status meaning not conveyed by color alone.
- [ ] **VIS-11** Check pointer hover, focus, active, disabled and busy states. Expected: consistent feedback, no layout shift caused by spinner or long button text.
- [ ] **VIS-12** Inspect mobile target spacing and touch areas. Expected: controls easy to hit without neighboring action; primary/form actions target about 44px or equivalent usable hit area.
- [ ] **VIS-13** Inspect empty, loading, error, success and content-heavy states. Expected: stable layout, no fake empty during load or success message while request is pending.
- [ ] **VIS-14** Inspect grammar/counts such as 1 pin vs pins, furniture vs labels, maps vs locations. Expected: truthful readable wording; no raw IDs dominating user-facing content.

### Screen coverage ledger

All cells begin **NOT RUN**. Desktop/mobile cells include light and dark states. Use separate entries for other viewport failures.

| Screen/modal | Desktop | Mobile | Landscape/small | Tablet/zoom |
|---|---|---|---|---|
| Org My Events + unread cards/nav | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Create details + dirty-discard | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Location picker + campus-change | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Proposal confirmation + creating | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Details/poster edit | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Grounds/floor editor + location switcher | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Item inspector / label editor | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Preset/layout settings + objects list | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Unsaved/recovery / leave editor | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Readiness / submission review | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Withdraw / delete confirmation | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Admin queue / filters / review | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Requested-map preview / pin comment | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Feedback rows / draft restore/discard | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Start/end / calendar / time picker | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Furniture summary / history | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Org feedback checklist + approved view | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Publication / schedule/unpublish confirm | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Student event list/details/sheet | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| Student campus/floor event overlay | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

## 23. Loading, animation and keyboard behavior

- [ ] **MOT-01** Observe route/list/campus/map loading normally and with controlled delay. Expected: identifiable progress, no permanent blank screen or false completed state.
- [ ] **MOT-02** Observe poster upload, create, save/autosave, submit/update/withdraw, address/reopen, approve/disapprove, publication and delete. Expected: visible busy label/indicator on active action, disabled duplicate mutation, completion/error clears it.
- [ ] **MOT-03** Open/close modal, sheet, dropdown, inspector and nested picker. Expected: smooth short transition where used, no double backdrop, flash or focus moving to hidden background.
- [ ] **MOT-04** Observe pin placement/focus, map fit/zoom and location switch. Expected: preview tracks input, animated movement ends at correct coordinate; no lagging cursor or accidental extra drop.
- [ ] **MOT-05** Inspect save/review success and failure feedback. Expected: one relevant toast/status, readable duration, no duplicated toast at desktop/mobile breakpoints.
- [ ] **MOT-06** Enable reduced motion and repeat transitions. Expected: nonessential movement reduced; loading meaning remains available through text/status; no functionality missing.
- [ ] **MOT-07** Rapid open/close/switch/back while transitions run. Expected: animations clean up, no frozen overlay, ghost panel or pointer-blocking invisible backdrop.
- [ ] **MOT-08** Assess missing animation only where state is unclear. Expected: record a concrete enhancement (for example visible Approving indicator), implement if needed, then repeat action success/failure/reduced-motion tests.
- [ ] **KEY-01** Tab/Shift+Tab through each modal and nested popup. Expected: active dialog focus stays contained, visible focus ring, all controls reachable in logical order.
- [ ] **KEY-02** Escape and close button through nested layers. Expected: one appropriate layer closes, input retained or discard prompt, focus returns to opener.
- [ ] **KEY-03** Enter/Space activate buttons/checkboxes without duplicate mutation. Expected: same result as click/touch.
- [ ] **KEY-04** Type H, V, T, Space, Delete and undo text in fields. Expected: ordinary typing does not invoke canvas shortcuts.
- [ ] **KEY-05** Test advertised canvas keyboard actions and keyboard placement where UI offers it. Expected: works as labelled; missing keyboard placement is recorded as an accessibility gap, not passed with scripted mouse coordinates.
- [ ] **KEY-06** Inspect loading/error announcements and field labels with available accessibility tools. Expected: actions and statuses have meaningful names; no unlabeled critical icon button.

## 24. Cleanup and completion gate

- [ ] **END-01** Complete desktop and mobile core journeys using recorded live UI-created fixtures. Expected: same-event handoff proven through all four role stages, with screenshots and reload evidence.
- [ ] **END-02** Reconcile all case IDs and screen cells. Expected: no omitted checks; FAIL/BLOCKED/NOT RUN are visible with reason and next action.
- [ ] **END-03** After each targeted enhancement, retest affected flow and neighboring modal/navigation states on desktop/mobile. Expected: original defect removed without new regression.
- [ ] **END-04** Run appropriate affected automated tests, production build, and diff/whitespace check after code changes. Expected: fresh command outputs and limitations recorded; tests do not replace manual evidence.
- [ ] **END-05** Inspect console/network throughout final journey. Expected: no unexplained rendering error/unhandled rejection; backend failures distinguished from frontend issues.
- [ ] **END-06** Delete only disposable own draft/AUX fixtures through supported UI; unpublish approved QA fixtures. Expected: no QA event visible to students after refresh, retained approved records explicitly listed.
- [ ] **END-07** Verify poster cleanup/references and local review/recovery drafts for removed fixtures. Expected: no broken referenced poster or unnecessary active test draft/interceptor.
- [ ] **END-08** Compare unrelated events and base maps with baseline. Expected: no unintended modification.
- [ ] **END-09** Produce final results and defect/enhancement list. Expected: state what passed, changed, failed, blocked, and remained untested; include desktop/mobile evidence and cleanup ledger.

**Completion criterion:** Mandatory core journeys, persistence, review/feedback, publication, and all applicable screen controls must pass on desktop and mobile. A critical bug, blocked required role path, or missing evidence keeps the run PARTIAL. Cosmetic improvements are accepted only after visible retest; no claim that “lahat maayos” from a build or a single screenshot.

## Source references used to prepare this checklist

- `src/components/events/EventProposalModal.tsx` — form, confirmation, poster and dirty-close behavior.
- `src/components/events/EventLocationPicker.tsx` — published-location selection.
- `src/components/events/EventFloorEditor.tsx`, `EventPlacementDock.tsx`, `EventItemInspector.tsx` — supported editor controls, fixed furniture dimensions, presets and feedback overlays.
- `src/pages/StudentMyEventsPage.tsx`, `StudentEventEditPage.tsx` — owner actions, pending update, feedback and approved lock.
- `src/pages/AdminEventLayoutsPage.tsx`, `src/components/events/AdminEventMapPreviewDialog.tsx`, `AdminEventPublicationDialog.tsx` — review, staged pins, schedule and publication.
- `src/components/events/EventFeedbackChecklist.tsx`, `src/lib/eventFeedbackPins.ts`, `eventReviewDraft.ts` — resolution and browser review-draft persistence.
- `src/hooks/useStudentOrgEventUpdates.ts`, `src/lib/studentEventUpdates.ts` — poll and per-event unread rules.
- `src/lib/eventPublication.ts`, `eventPosterStorage.ts`, `eventLayoutValidation.ts` — timing, poster constraints and critical/advisory layout checks.
- `src/components/map/EventMapPanel.tsx` — public panel, filters, locations and responsive sheet.
- `docs/2026-10-03-create-event-acceptance-matrix.md` — prior functional coverage reference; historical results are not current PASS.
