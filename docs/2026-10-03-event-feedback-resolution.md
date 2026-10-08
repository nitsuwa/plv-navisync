# Feedback pin resolution

Student organizations fix the map and use the editor's Feedback checklist to mark each GSO pin as addressed, optionally describing the fix. They can reopen a pin. This is a student acknowledgement, not approval: the administrator verifies the maps and makes the review decision.

The server records actor and timestamp through `set_event_feedback_pin_addressed`, restricted to the event owner and editable events. The command checks the current row version, validates the pin against the original feedback, and retains revision history. Direct edits to resolution metadata are blocked by the event guard. Old acknowledgements no longer count when the location's feedback changes.

Resubmission preserves original location feedback and the student resolution checklist. Both the client and the database block resubmission while pins remain open. Legacy text-only location feedback remains compatible. Public preview feeds do not include resolution metadata.

## Apply in Supabase SQL Editor

1. Apply the full `supabase/migrations/20261003180000_event_feedback_resolution.sql` file after the publication and revision-history migrations. It already includes BEGIN/COMMIT. No existing event/history rows are rewritten.
2. Run `supabase/tests/event_feedback_resolution_assertions.sql`. It checks decoding, open/closed/stale resolutions, legacy/null feedback and RPC grants, then rolls back. These assertions still need to be run against PostgreSQL.

## Browser test

1. Administrator: reject a test event with two feedback pins.
2. Owner: Edit maps, open Feedback checklist. Try submitting with open pins; submission must stay blocked.
3. Fix a map, add a note, mark one pin as addressed. Its map marker becomes green. Refresh after the map save to verify persistence; the other pin must stay open.
4. Reopen the first pin; it must become open again. Mark both addressed, save map edits, and resubmit.
5. Administrator: Review submission. Verify the original pin comments, student notes, addressed count, and green markers through both preview entry points. Inspect the map before approving.
6. Administrator: revise the feedback and reject again. The old acknowledgements must not satisfy the revised feedback checklist.
7. Another Student Org must not be able to address the owner's feedback. Approved events must reject checklist edits. Concurrent row changes must produce a retry/refresh error rather than overwriting a review.

Local automated checks cover the status helper, checklist UI, resubmission persistence/gating and existing student/admin preview workflows. Database authorization and actual browser behavior still require the checks above. No migration was applied or Git changes pushed by this implementation.
