# Organization event continuity — agreed design

Date: October 9, 2026, Asia/Manila. Status: product decisions approved in chat; implementation not started.

## Goal and approved decisions

Events belong to a permanent organization, while individual accounts retain attribution for their actions. Exactly one representative may have effective organization access at a time. Administrators grant, replace, expire, or revoke that access. A replacement automatically inherits existing drafts, pending submissions, and feedback responsibilities without resetting event status, approval, publication, or revision history.

Past layouts remain available for inspection and reuse. Reuse creates a separate draft for a fresh review. The original creator, original academic year, and original event remain intact. Admin navigation becomes one Events workspace, preserving existing records and old links.

## Existing implementation

Baseline inspected: `0679fa0`, after syncing main on October 9. Event overlays are stored in `map_elements`; `metadata.createdByUserId` currently controls access in frontend services, editor guards, SQL policies, review/revision/feedback functions, and notification receipts. Organizer is display text, not verified organization membership. `StudentMyEventsPage` already supports copying a layout.

The current sidebar has only Event Layouts, but `/admin-dashboard/events` still opens the separate `AdminEventsPage`, backed by `events` and `event_locations`. Consolidating navigation must preserve both datasets and their student consumers.

## Organization and access model

- A stable organization ID is authoritative; names, departments, and organizer text never grant access.
- Every grant records the representative, academic-year label, validity period, granting admin, and closure information. Replacement is one database transaction, serialized per organization, with an expected current grant to reject stale admin forms.
- The effective representative must have a valid grant, active profile, eligible Student Organization role, and an active organization. A generic role by itself cannot grant access to an organization's records.
- Access expiry is checked against database time on every protected operation. Replacing an expired grant also closes its historical row. There is no dependence on a browser clock or background job to revoke access.
- A profile is not restricted to one organization by this proposal; if assigned to more than one, an explicit organization selector is required. Each organization still has only one representative.
- Administrators retain existing role-management limits. The grant workflow must not allow promotion to admin/super-admin or silently reactivate an inactive account.
- Original creators lose privileged access to organization-bound events once their grant ends. They retain the same public published-event access as other students.

## Event ownership, handover, and history

Use a relational organization reference on event-overlay rows; preserve original creator metadata as attribution. Keep academic-year labels and reuse provenance distinct from the current representative's term. Revision actors and feedback-resolution actors continue to identify the actual person performing each action.

Handover changes the grant, not every event. Draft/disapproved editing, pending submission locks and withdrawal rules, and admin-only approval/publication remain intact. Feedback can still be addressed on eligible non-archived approved events without unlocking their layouts. A historical date does not silently discard unresolved feedback or unfinished drafts. Soft-archived records are separately labeled, read-only, and excluded from public feeds.

Organization Events provides Current work and History, with academic year, status, and title filters. Cards show organization, academic year, original creator, created date, event dates where set, current responsible representative, and reuse provenance. Missing historical academic year is labeled Unknown until an admin explicitly assigns it; it is not guessed from a calendar year.

Legacy owner-bound overlays stay accessible through existing restricted rules until an admin explicitly maps them to a verified organization. Preview the exact event IDs and counts before mapping. Never infer membership from matching organizer strings. Once mapped, only organization access applies, even to the original creator. Keep a reconciliation record for every mapping.

## Reuse

Reuse takes the source event ID, expected source revision, destination organization and grant, new title, academic year, and an idempotency key. The server authorizes and reads the source; it does not trust client-supplied source metadata. It creates fresh event/location/item IDs where required and preserves a provenance link.

Copy only reusable description/location/furniture/label content and supported poster references. Do not copy approval, submission, schedule, publication, review feedback, resolution state, notification receipts, or revision IDs. Validate against the current published campus and floors. Missing venues block reuse; recoverable geometry problems appear as explicit issues before submission. Do not silently drop content.

Historical poster references must survive representative changes and reuse. Existing poster URLs are public: this project must not claim that revocation can recall already-public media. Protect referenced objects against deletion, allow replacements through fresh uploads, and authorize new upload ownership appropriately.

## Notifications and sessions

Review notifications follow the current organization grant, while read receipts remain per person. New representatives see unresolved work through a handover summary; they do not inherit somebody else's read acknowledgements. A returning representative's stale receipt must not hide newer feedback. Admin pending counts remain based on pending events, not on whether a notification was read.

Revalidate grants on sign-in, focus/reconnect, and protected operations. Clear private event data, drafts, notifications, and pending autosave callbacks when the actor or grant changes. Server checks reject outgoing representatives even if an old browser still displays a previously downloaded page. Explain lost access without promising deletion of data already viewed.

## One admin Events workspace

Use `/admin-dashboard/events` as the canonical workspace, with Needs review, Approved & publication, and History views. Preserve legacy event administration inside a clearly labeled Campus listings view when those records exist. This is one navigation entry; it is not an automatic merge of the two database models.

Keep `/admin-dashboard/event-layouts` and its preview paths working through query-preserving redirects/aliases. Existing `?review=` links and student map links must still reach the intended event. Distinguish approval state from publication state in all views. Preserve existing campus-listing public behavior and prevent double notification of one event.

## Delivery boundaries

Use additive migrations and explicit reconciliation. Do not delete old tables, rewrite historical creators, republish old events, or change campus geometry. The user runs validated SQL in Supabase under the existing agreement. Prepare local SQL tests, migration preflight, counts, and recovery instructions before that step. No retained live QA event without explicit user approval.

The implementation plan is `../plans/2026-10-09-organization-event-continuity.md`.
