# Legacy event organization reconciliation

This process is read-only until an administrator explicitly assigns an organization to an event. Do not infer ownership from matching text alone.

## Existing ownership inventory

- Event rows live in `map_elements` with `element_type='event_overlay'` or the historical `metadata.kind='event_overlay'` marker. The owner policies and review trigger were last established in `20261002090000_event_publication_management.sql`; before this continuity migration, reads, writes, submission, and deletion fell back to `metadata.createdByUserId` plus the Student Org role. The October 5 campus-structure isolation migration keeps generic map saves from mutating or retiring Event rows.
- `event_layout_revisions` is created by `20261003150000_event_revision_history.sql`. Its `owner_id` records the original creator; its `actor_id` records who performed each action. The continuity migration changes event-level history access to the event's current organization while keeping both identities intact. Assignment and correction are recorded in `event_organization_audit`, not fabricated as layout revisions.
- The latest pending-layout save and withdrawal functions are in the revision migration; the latest approved-feedback resolution path is `20261007100000_allow_approved_event_feedback_resolution.sql`. These former creator-only RPCs remain available for unbound legacy rows; organization-bound rows require a current grant token through the protected command paths.
- The October 8 `event_notification_receipts` policy and its read/acknowledgement RPCs still authorize the original creator. Task 6 must replace that authorization with the current representative while keeping receipts per viewer.
- `event_posters` is an existing public bucket. Its October 3 storage policies use uploader identity/folder names, while published poster URLs are public. Task 5 must preserve referenced files across representative handover and document that media remains public.
- In frontend code, `createdByUserId` remains creator attribution and is still useful for Admin submitter/history display. The current Student editor and organization update/receipt code also use it as an access/filter condition; Tasks 4 and 6 replace those checks with current organization context. No event-to-organization mapping is inferred from these fields or from organizer labels.

## Preview

After the organization access and ownership migrations are installed in an isolated environment, an administrator can call `admin_preview_event_organization_reconciliation()`. It returns every event overlay whose relational `organization_id` is still null, including archived rows. Each entry includes the event ID, campus, title, status, creator ID/name when recorded, organizer label, creation/update/archive times, academic year, an optional name/code match suggestion, and a validation reason.

Suggestions compare only the normalized organizer label with a verified organization's code or name. Even one exact match remains a suggestion and does not grant access or change the event. `academic_year_required`, `ambiguous_organizer_label`, and `choose_verified_organization` require administrator review. An event stays under its existing restricted creator-access rule until an administrator explicitly binds it.

## Explicit assignment

For a reviewed row, an administrator selects a verified organization, supplies the verified historical academic year, and submits the event ID plus its displayed `updated_at` to `admin_bind_event_organization()`. The RPC rejects stale rows and already-bound events. It changes only the relational owner and academic-year metadata, writes before/after assignment audit data, and preserves the event's creator, approval state, dates, publication, content, and prior revisions. Do not batch-apply suggestions without reviewing each event.

## Correction

If an event was already bound to the wrong organization, use `admin_correct_event_organization()` only after verifying the source and destination. Supply the expected current organization, current `updated_at`, verified academic year, and a non-empty correction reason. The function locks both organizations in ID order, then locks the event; it rejects stale ownership and records the correction in the organization audit. The event remains private to the destination organization after the transaction commits. A correction does not rewrite the original creator or manufacture a layout revision when event content did not change.

## Preflight and postflight

Before the user applies the migrations, run the preview against the intended database and save the row count and reviewed mapping list. Confirm that every proposed destination is an existing verified organization and that each academic year is known. If the historical term cannot be verified, the administrator must deliberately enter the literal `Unknown` in the required year field; the application never guesses missing history. Test the preview, assignment, and correction with disposable fixtures first.

After explicit assignments, compare each event's organization, academic year, status, schedule/publication, creator, and revision count with its preflight record. Confirm the audit entries and test that the former creator and other organizations cannot read newly bound private events. Public approved-event previews remain controlled by the existing schedule and publication rules.

These SQL functions are administrator-only RPCs. The migration adds no automatic backfill and the preview itself writes no rows.
