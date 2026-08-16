# A6 — Draft Save, Validation Handoff, and Publish Orchestration Verification

Status: `FOR REVIEW` on the existing `A6-A9` branch after merging Developer 2's B5 work from `main`.

## Delivered

- Reconciled the linked migration history and applied B5 before any A6 schema work; the applied `001` baseline was not rerun or edited.
- Live-generated Database types include `campus_versions.updated_at` and the A6 RPC contracts.
- Atomic private-draft save with optimistic concurrency, relational A5 persistence, immutable version snapshots, change summaries, and activity logs.
- B5 validation-result handoff followed by atomic publish; invalid or stale drafts are rejected without replacing the last valid publication.
- Typed publish, unpublish, archive, discard, history, comparison, and public active-version service contracts.
- Map Builder save/publish/archive integration and public map loading from the immutable active published snapshot rather than mutable editor rows.
- Explicit RPC grants: anonymous access is denied; authenticated entry points enforce active-administrator checks internally. The public `campus_is_published` and `is_published_floor_plan` helpers are intentionally callable boolean predicates used by RLS/Storage policies and expose no private row data.

## Migrations

- `20260816083208_establish_campus_publication_workflow.sql`
- `20260816085022_preserve_admin_legacy_publish_compatibility.sql`
- `20260816085536_return_a6_conflicts_without_retry.sql`
- `20260816085705_align_a6_concurrency_tokens_with_campus_trigger.sql`

Follow-up migrations preserve the applied A6 history while restoring the internally guarded legacy admin RPC, returning non-retryable HTTP conflicts, and aligning concurrency tokens with the existing campus timestamp trigger.

## Automated verification

- `pnpm test -- --run`: PASS — 104 files, 1,415 tests.
- `pnpm build`: PASS; the existing large-chunk advisory remains non-blocking.
- `pnpm verify:a6`: PASS using controlled and cleaned-up admin/student/guest fixtures for private drafts, optimistic conflicts, validation handoff, failed replacement recovery, publication history, public visibility, unpublish, discard, archive, and activity logs.
- A1, A5, and A7 live verification scripts: PASS after A6.
- `supabase db lint --linked --level warning`: PASS — no schema errors.
- Live local/remote migration history: PASS through `20260816085705`.
- Security Advisor: no errors. Remaining warnings are intentional callable predicates/internally guarded authenticated admin functions plus the deployment-level leaked-password setting.
- Performance Advisor: no A6-blocking result; remaining notices are baseline missing-index, unused-index, and permissive-policy overlap opportunities.
- Browser smoke: the local application and authentication route render with no browser console errors. Authenticated publishing behavior is covered by the repeatable live verification and the manual checklist below.

## Manual review checklist

1. As admin, open Map Builder, edit a campus, save it, refresh, and confirm the private draft reloads correctly.
2. Publish a campus with a valid B5 navigation graph and confirm the success state and public map update.
3. Introduce a validation error (for example, an unreachable required node) and confirm publish is blocked while the previous public map remains unchanged.
4. Open the same campus in two admin tabs, save tab 1, then save stale tab 2 and confirm a conflict message is shown instead of silently overwriting tab 1.
5. After publishing, make and save another draft without publishing; as a guest/student, confirm the public map still shows the prior published snapshot.
6. Archive a controlled campus and confirm it disappears from public results while its history remains available to the admin contracts.
7. Review the activity log and confirm save, publish, unpublish (when invoked by its consuming UI), and archive actions are recorded.

History/compare/discard/unpublish are complete typed backend/service contracts; their dedicated management surfaces remain available for the later UI packages that consume A6.
