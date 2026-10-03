# Event full pack: approved design

**Date:** 2026-10-02 (Asia/Manila)
**Approval:** The user approved the creation, admin publication, Upcoming/Ongoing, and responsive student event-map proposal in this conversation and requested implementation/testing instructions for Luna / Max.
**Scope:** Complete the existing event feature. This document supersedes conflicting scheduling/preview statements in older event specs. Production writes, deployment, unrelated refactoring, and model changes are not authorized.

## Product flow

1. Student organization: event details → published campus and requested locations → confirmation → design each location → submission summary → submit.
2. Administrator: review every requested map read-only → set event start/end → approve with immediate or scheduled publication, or disapprove with feedback.
3. Student: open Events on the campus map → select one event → read details and every approved location → explicitly view the appropriate grounds/building floor → hide or close the preview.
4. Administrator after approval: edit publication timing, unpublish, or publish again. Preserve approval, event occurrence dates, all layouts, and history.

One proposal belongs to one campus. Approval covers the whole proposal and all submitted locations; partial location approvals are not introduced. The student list follows the campus being viewed, including floor-only events discoverable from outdoor overview.

## Time rules

Input/display uses Asia/Manila; persistence uses ISO instants. Publication and event occurrence are distinct.

| State | Rule | Student preview |
| --- | --- | --- |
| Draft / Pending / Disapproved | Not approved | Hidden |
| Unpublished | Approved, isActive=false | Hidden |
| Scheduled publication | Approved/active, now < publicationAt | Hidden |
| Upcoming | Publication reached, now < dateStart | Visible |
| Ongoing | Publication reached, dateStart <= now < dateEnd | Visible |
| Ended | now >= dateEnd | Hidden from active preview; kept in admin history |

Require valid finite start/end/publication, start < end, publication < end. Immediate publishing requires a future end. Future scheduling requires publication strictly later than database now. Publication during an ongoing event is allowed if it has not ended.

Visible exactly at publicationAt, Ongoing exactly at dateStart, hidden exactly at dateEnd. Database time is authoritative; the feed returns serverNow for device-clock adjustment.

Legacy single-location layouts normalize safely. Approved legacy events missing valid dates/publication stay hidden until admin supplies timing. Do not infer publication or rewrite saved sizes.

## Student map

Events is optional, off by default. Its enabled trigger remains available when there are zero events. No permanent list or polling while closed.

One card per event: title, Upcoming/Ongoing text badge, dates, organizer, distinct location count. Order Ongoing first, then Upcoming by start, with stable title/id ties. Filters: All, Ongoing, Upcoming.

Details replace the list inside the same panel: Back to events, schedule, organizer, description/poster, all requested locations, View location actions. No second blocking details modal.

Outdoor overview shows building/grounds venue markers. Shared venues use a count/chooser. Indoor furniture is drawn only on its corresponding requested floor. Grounds anchors use authored layout bounds where possible; a general grounds marker must not claim precise venue coordinates.

Only the selected event/location shows full furniture/labels. Other events remain venue markers. Nonrequested floors receive no assets. Preview never changes base geometry, navigation nodes/edges, routes, or obstruction rules.

Missing published locations are explained as unavailable, never redirected to another campus, demo map or arbitrary floor. Close removes event UI/layers without clearing routes or reversing an explicitly chosen floor view.

## Responsive interaction

Desktop >=768 CSS pixels: one compact 320–360px dock with internal scrolling; map controls remain usable.

Mobile <768px: one nonmodal bottom sheet with Peek/List/Expanded positions, approximately 12/38/72 percent of dynamic viewport height, adjusted for safe area and controls. Expand/collapse buttons required; dragging optional. No full-map scrim, background scroll lock, or modal focus trap.

One map panel at a time. Opening building/directions/account panels closes Events without discarding route state. Closing returns focus to Events. Escape closes the nearest event control before map-level Escape runs.

Use system theme/typography, light/dark tokens, keyboard operation, visible focus, status text beyond color, and >=44px interactive targets. No native date/time/select or alert/confirm/prompt popups.

## Administrator consistency

Pending Review exposes all layouts and themed event/publication scheduling. Remove misleading Quick Approve bypass. Approved cards show occurrence and publication separately.

Manage publication on approved events prefills saved timing and offers scheduled publication, Publish now, Unpublish, and republish. Occurrence dates/layouts remain read-only here.

Unpublish confirmation explains removal from student previews. Moving a visible event to future publication confirms that it becomes hidden until that time.

Administrator writes are atomic and compare expected server updatedAt under a row lock. Stale decisions conflict instead of overwriting newer ones. Mutation/activity log commit together. Success UI waits for acknowledgement.

Org owner edits/deletes are limited to draft/disapproved records. Pending/approved are frozen. Duplicate creates a new owned draft without approval, dates, publication or admin feedback.

## Data access and refresh

Use an allowlisted public preview RPC for students and guests of the existing public map. It returns serverNow and complete approved event locations, excluding creator IDs/admin feedback. No broad anonymous table grants. Raw event documents remain available only to appropriate owners/admins.

Database guards recognize OLD and NEW event classification. Enforce ownership/campus, schedule, publication, review fields and frozen statuses server-side.

Public campus RPC returns eligible latest published/nonarchived snapshots with embedded event documents projected out. Preserve all non-event geometry and immutable historical storage.

Open Events refreshes every 30 seconds and on focus/visibility return, including initially empty lists. Known start/end boundaries have local server-adjusted timers. Publication/reschedule/unpublish propagate within 30 seconds plus request time in a foreground panel. No claim of instant cross-client updates.

Scope requests/timers to campus, identity, feature setting and lifetime. Discard late stale responses. Refresh failure clears previews and offers Retry while base map/navigation remain usable. No successful mock fallback.

## Completion evidence

Fresh automated, real desktop/mobile browser, and executed Postgres/JWT role/persistence checks are required. Recheck existing campus selection, confirmation, per-location saving, fixed assets, all Arrange actions, seating, tutorial spotlights and tab-return stability.

Map-unit fit does not establish physical occupancy. Missing database/browser access is BLOCKED. Production migration, commit/push and deployment remain separate.
