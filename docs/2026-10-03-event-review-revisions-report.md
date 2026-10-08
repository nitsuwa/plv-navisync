# Event review and revision implementation

## Local changes

- Review modal uses a focus-trapped themed dialog, wider desktop layout, scrollable body and visible action footer. Requested-map preview, creator identity and edit history appear before scheduling. Date controls stack on smaller screens. Initial date guidance is neutral rather than an immediate validation error. Failed review commands remain visible in the modal.
- Missing or invalid metadata status defaults to Draft instead of Pending. Explicit pending records remain intact. Lists request real data rather than demonstration fallback. Missing historical submission timestamps remain labelled unavailable; no fabricated dates or deleted records.
- Pending layouts can save edits and autosave while retaining their submission status. Duplicate submission is disabled. A confirmed withdrawal returns the same map to Draft without removing furniture or labels.
- Rejected layouts remain editable. Saving a revision retains administrator and location feedback. Explicit resubmission clears current feedback, with prior feedback retained in server history once the migration is active.
- Expandable history shows saved changes by location, actor, action and timestamp. The database stamps revision numbers and last-edit timestamps. Existing edits before installation cannot be reconstructed.
- Missing RPC errors explain the migration dependency. Approval does not fall back to an unprotected table write.

## Verification evidence

- Six relevant suites: 153 tests passed and one obsolete pending-button assertion failed. The assertion was updated to verify that pending layouts cannot submit twice; its targeted rerun passed (1 passed, 107 skipped). A full rerun after this assertion-only correction was not performed.
- Production Vite build passed, 2,995 modules. Existing bundle-size warning remains.
- `git diff --check` passed.
- Actual review component inspected using synthetic data in a temporary browser fixture, without backend writes. Desktop date labels and preview/history placement checked. At a 390 × 844 viewport: document width 390; dialog approximately x12, y12, width366.4, height820. No horizontal overflow in that fixture. A subsequent browser evaluation timed out; live end-to-end approval was not verified. Temporary fixture files removed.
- SQL migration and catalog assertions authored and inspected, but NOT executed against a database. No live migration, deployment, commit or push in this task.

## Supabase dependency and safe application

The screenshot's `review_event_layout` 404 indicates the deployed RPC is unavailable (missing migration or stale schema cache). Styling cannot resolve it. Confirm the connected project and its applied migration history first. Apply only missing repository migrations in chronological order through the project's normal Supabase migration workflow, first against a staging copy. The new migration depends on the existing publication-management functions and role helpers.

Required existing review/publication migration: `supabase/migrations/20261002090000_event_publication_management.sql`. New revision migration: `supabase/migrations/20261003150000_event_revision_history.sql`. It adds audit storage and commands and replaces the event guard; it does not delete or backfill event/layout rows. Database behavior still requires staging verification before production application.

Read-only readiness/origin checks are in `supabase/tests/event_revision_readiness.sql`. After application, run `supabase/tests/event_revision_history_assertions.sql` for catalog/permission assertions. These do not replace functional role tests.

## Manual acceptance flow after migrations

1. Student organization: create a draft with two locations, place assets, save and submit. Confirm it appears in Admin → Event Layouts with owner and submitted time.
2. Student organization: reopen the pending map, move/add/remove assets and save. It must stay Pending; submission time stays unchanged. Admin reopens review and sees a new edit timestamp/history entry with the relevant location changes.
3. Admin: keep an older review open while the student saves another edit. Approval of that stale revision must fail; refresh and review the latest map.
4. Student organization: withdraw using confirmation. It returns to Draft with the same plotted assets and disappears from Pending. Submit it again.
5. Admin or Super Admin: disapprove with feedback, including location-specific feedback. Student sees Needs Revision, edits the same map, sees retained feedback, then resubmits. History retains the previous decision.
6. Admin: approve with a valid schedule and immediate or scheduled publication. Confirm students see only approved, publication-eligible maps and requested locations.
7. Repeat on mobile and in dark mode. Check date picker, keyboard focus, scrolling, footer actions, and network-error messages.
8. Database authorization tests: unrelated student organization cannot read history, save, withdraw or review another owner's event; regular student cannot write history; owner cannot change approved maps or admin schedule/feedback. Verify failed commands preserve the original assets.

The source of explicit unknown pending rows is not confirmed without querying the connected database. The readiness query lists their owner and stored metadata for investigation; it performs no deletion.
