# Event UI/UX final audit — October 8, 2026

The approved local changes are implemented. The browser audit passed for the tested viewports and roles. This is a targeted event-flow audit, not a certification that every case in the larger manual checklist or every physical device has passed.

## What changed

- Public event maps keep the event name, phase, actual displayed map, and map mode visible. Venue inspection identifies the venue separately, including while collapsed.
- Event details use an explicit disclosure. Current-location text/check state follows the actual floor; an unrelated floor explains that the selected event has no layout there. Requested room layouts remain selected when several layouts share a floor.
- Fit map uses space left by the compact panel, controls, and persistent refresh error. Complete floor/access-feature bounds are included. Opening details preserves manual zoom.
- Mobile/tablet use a bottom panel; short landscape uses a side panel. Admin pin previews retain a scrollable form and a minimum map area. Event identity stays in the modal header; compact placement controls avoid covering the draft.
- Nested proposal discard restores focus to its opener. Proposal entrance and editor loading respect reduced motion. Loading/error messages have status/alert semantics.
- Editors bind their state to the actor and event, reject foreign-owner payloads, and ignore old-session asynchronous completions. Expired-session and transport reads report failures instead of pretending the event was deleted.

## Browser evidence

| Run | Result | Evidence |
|---|---|---|
| Complete proposal → admin review/preview → org access → student map UI matrix | **573 checks PASS**, zero page errors, zero blocked mutation attempts | [results](evidence/results.json) |
| Final student framing/access-feature retest after the bounds fix | **129 checks PASS**, zero page errors/writes | [geometry results](evidence/geometry-probe/results.json) |
| Final selected-event venue context + reduced-motion proposal retest | PASS | [context results](evidence/context-probe/results.json) |

The counts include repeated viewport assertions and Tab steps; they are not counts of distinct complete CRUD journeys, and overlapping runs are not added together.

Viewports: **320×568, 360×640, 390×844, 740×390, 768×1024, 1024×768, 1440×900, 1920×1080**. Actual Edge **200% page zoom** was selected in disposable test profiles for Student, Org, and Admin: CSS viewport 707×403, devicePixelRatio 2, outer window width 1440. Profiles were removed afterward. A focused input at a reduced 320×320 viewport covers keyboard-sized reflow; it does not emulate a phone's native keyboard behavior.

Browser actions covered proposal validation, location selection, nested confirmation, step state retention, Tab containment, discard recovery/focus, date/time Escape/focus, invalid minutes/arrows, local review-pin placement/save wording, long feedback and decision-footer reachability, public context/location switching, manual floor changes, keyboard zoom retention, offline/reconnect, cached refresh errors, and expired/foreign-owner reads. Representative screenshots were visually inspected, including the 320px pin draft, landscape preview, tablet/desktop map, and 200% views.

Real demo sign-in and published-map reads reached Supabase. Event rows, receipt actions, and faults were controlled in isolated contexts. No live event record was created, reviewed, published, deleted, or changed. The older approved QA fixture was read only; its publication was not altered.

## Defects reproduced and resolved

| Defect | Verification |
|---|---|
| Stale current-location marker / room selection | Panel/view-model RED→GREEN and browser manual-floor tests |
| Collapsed refresh failure hidden | Panel RED→GREEN; visible error/retry and reconnect browser checks |
| Account change exposes old private editor / late reads | Foreign-owner, same-URL actor switch, delayed-read regressions RED→GREEN |
| Proposal discard loses opener focus | Browser + component RED→GREEN; nested focus checks |
| Desktop framing counts bottom picker as a top obstruction | Wide screenshot and framing retest |
| Error row obscures fitted floor | 320px long-error Fit RED→GREEN |
| Expired/network reads become fake missing events | Service RED→GREEN; explicit expired-session alert |
| Pin draft collapses map and overlaps form | 320px screenshot/height RED→GREEN; map/comment/save recheck |
| Fit clips exterior access features | 1920px containment RED→GREEN; all-viewport geometry retest |
| Collapsed inspected venue hides selected event identity | Panel RED→GREEN; mobile/desktop context retest |

## Code verification

- Final map/proposal/integration suite: **3 files /67 PASS**.
- Broader event/modal/role suite: **8 files /98 PASS**; affected read/editor/preview/panel suite: **4 files /65 PASS**. Counts overlap.
- Preview/dialog suite: **2 files /6 PASS**; existing feedback/readonly interactions: **8 PASS** (114 unrelated tests skipped intentionally).
- Production build: **PASS**, 3020 modules. Existing large-chunk warnings remain.
- TypeScript comparison: HEAD/current diagnostic multiplicities are compared by file/code, allowing shifted lines/native union formatting. The existing diagnostic baseline is not a clean typecheck; see [comparison](../event-clarity-first-batch/type-comparison.json).
- Independent source reviews found no remaining material issue in the reviewed changes. Diff whitespace check passed; existing LF/CRLF notices and test-environment act/scrollTo warnings are recorded rather than presented as a pristine global suite.

## Remaining limits

- Actual Android/iOS keyboard, hardware gestures, and screen-reader speech were unavailable. Browser capability/viewport emulation and DOM semantics were tested.
- Safari/Firefox and a live second Student Org account were unavailable. Foreign-owner and actor-switch UI isolation were verified with controlled responses/tests; this is not a new live cross-account database certification.
- New live approval/publication persistence was not rerun because this batch keeps QA events unretained. The October 7 live flow and October 8 sync records remain separately dated evidence.
- The broader [manual checklist](../create-event-2026-10-07-manual/checklist.md) remains **PARTIAL**; unrelated and unavailable cases are not marked passed.

No migration, commit, push, or deployment was performed in this batch.
