# Organization Event Continuity — SQL handoff and release checks

The implementation is local. The project owner applies SQL in Supabase. Do not enable organization assignments or release the frontend until all four migrations and the postflight checks have completed.

## Before applying SQL

- [ ] Save a recoverable database backup through the existing Supabase/project backup process.
- [ ] Run `preflight.sql` in the intended project's SQL editor. Stop if a required dependency is missing.
- [ ] Save the event, revision, listing, notification-receipt, and poster-object counts. Keep a reviewed sample of original creators, statuses, dates, and publication values for comparison.
- [ ] Confirm the existing October 7 feedback and October 8 notification-receipt updates are installed. The new migrations extend those contracts.
- [ ] Apply the complete set in dependency order below, without switching the frontend between individual migrations.

## SQL to run, in this order

1. `supabase/migrations/20261009120000_event_organization_access.sql`
2. `supabase/migrations/20261009130000_event_organization_ownership.sql`
3. `supabase/migrations/20261009140000_event_organization_reuse.sql`
4. `supabase/migrations/20261009150000_event_organization_notifications.sql`

Each file is a transaction and reloads the API schema. The migrations do not infer organizations from event names or automatically bind existing records. A verified admin must reconcile each historical event deliberately.

## After applying all four files

- [ ] Run `postflight.sql`; every listed table/function must be present. The protected tables must have RLS enabled.
- [ ] Compare the saved counts, original creators, original revisions, statuses, dates, publication values, and public visibility. Schema installation must not alter existing event content.
- [ ] Open admin Users → Student Organizations. Confirm the new RPCs load successfully before enabling assignments.
- [ ] Create verified organization records using real approved organization details. Appoint the intended active representative and a verified academic-year label/expiry.
- [ ] Inspect `admin_preview_event_organization_reconciliation()` and review each proposed mapping. Text matches are suggestions, not permissions. Unresolved rows remain unbound under their prior restricted creator rule.
- [ ] Bind only reviewed records using the event's current `updated_at`. Confirm the audit entry and unchanged creator/revision/status information. Use the separate audited correction RPC for an incorrect existing binding.
- [ ] Verify an existing outgoing account loses private bound-event access on direct authenticated API calls after replacement; the incoming account inherits drafts, pending submissions, approved layouts, and feedback. Use existing intended accounts/records or disposable fixtures in a separate test database. Do not leave retained live QA records.
- [ ] Verify an unrelated organization and ordinary student cannot read organization-private events, revisions, feedback, or receipts. Public event preview visibility must still follow approval, publication, and occurrence dates.
- [ ] Verify one real pending submission increments the admin badge, and review/feedback notifications and read receipts work across two devices for the same representative.
- [ ] Verify a reused historical layout becomes a new draft, retains source provenance, resets approval/schedule/feedback/revisions, preserves its original, and requires fresh submission/approval. A missing current venue must block reuse visibly.
- [ ] Verify poster reference preservation and existing public poster links. The poster bucket remains public; organization access does not make a published poster URL private.
- [ ] Check actual phones/tablets and a screen reader. Browser viewport checks are recorded separately and do not replace physical-device checks.

## Recovery

Stop new organization assignments and revoke/pause affected grants through the administrator controls if access contracts do not behave as expected. Keep events, provenance, receipts, and audits intact. Restore a frontend compatible with organization ownership and repair the access functions deliberately. Do not restore creator-only authorization over bound records, erase ownership columns, delete history, or reverse mappings without an audited reconciliation review.

## Local evidence commands

```text
node docs/verification/organization-event-continuity/run-concurrency.mjs --all
node docs/verification/organization-event-continuity/run-reuse-sql.mjs
node docs/verification/organization-event-continuity/run-unit.mjs
node docs/verification/organization-event-continuity/compare-types.mjs
node docs/verification/organization-event-continuity/run-ui.mjs
node node_modules/vite/bin/vite.js build
```

On this Windows host, the checks need permission to resolve linked dependencies; database/browser checks also need access to their disposable local server. A sandbox-denied import or connection is a failed test setup, not a feature pass. The browser runner uses controlled HTTP responses and blocks all live Supabase mutations. Server behavior is validated independently using disposable PostgreSQL roles/RLS.
