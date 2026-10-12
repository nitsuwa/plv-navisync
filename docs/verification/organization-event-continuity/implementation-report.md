# Organization Event Continuity — implementation report

Started October 9, 2026; local verification completed October 10, 2026 (Asia/Manila).

Working directory: `C:/Users/Rj/Documents/GitHub/plv-navisync`. Branch: `codex/organization-event-continuity-local`. Starting commit: `0679fa0`. The user requested this checkout. No remote push is authorized.

## Implemented

- Verified organizations, one effective admin-appointed representative per organization, atomic replacement/revocation, expiry and profile/organization activity checks.
- Organization-owned events with original creator attribution. Successors inherit saved drafts, pending submissions, approved layouts and feedback; outgoing/cross-org actors lose private access on the server.
- Admin organization/assignment controls in Users, outgoing/incoming names before confirmation, stale-assignment handling and grant history.
- Organization Events with assignment context, current work and paginated/searchable history. Archived inspection stays read-only; legacy links retain their access contract.
- Historical reuse produces a new draft with provenance, server idempotency and allowlisted content. It resets approval, schedule, feedback and revision identities, validates current venues and protects referenced public posters.
- Per-person/grant notifications. Handover notices cover pre-appointment work; a representative's own new work is not a handover alert. Empty handovers do not create phantom badges. Pending counts are labeled as part of the unfinished total.
- One admin Events navigation entry with Needs review, Approved & publication, History and Campus listings. Legacy data/URLs remain separate sources; no listing is converted into an approved layout.
- Responsive scrolling, focus return, failures/retries, long-title/name wrapping, reduced-motion handling and clear creator/year/creation-time information.

SQL is prepared locally and has **not** been applied to live Supabase. No live event, grant or retained QA record was created.

## Verification

| Check | Actual outcome | Scope |
| --- | --- | --- |
| `run-concurrency.mjs --all` | 85 checks PASS | Real disposable PostgreSQL roles/RLS and separate sessions; concurrent assignment, rollback, both save/handover orderings, reuse, receipts, poster protection and postflight. |
| `run-reuse-sql.mjs` | 81 checks PASS | Disposable PGlite using the actual baseline and all four continuity migrations; includes preflight/postflight. |
| `run-unit.mjs` | 67 files / 624 tests PASS | Services/workspaces, proposal/editor, feedback, revisions, publication, receipt/badge, map/structure and route regressions. |
| `compare-types.mjs` | 1,022 baseline / 1,022 current; no introduced diagnostics | Same installed compiler/dependencies, starting commit and current source; multiplicity per file/code, full messages retained. This is **not** a clean typecheck. |
| Vite production build | PASS, 3,037 modules | Existing chunk-size warning remains. |
| Browser matrix | 39 checks PASS; zero page errors | Real Edge/app rendering with controlled HTTP responses; all Supabase HTTP traffic is intercepted. This is not live Supabase authorization proof. |
| Live source inventory | PASS | Read-only exact administrator API/RLS counts: 2 listings, 0 listing-location rows, 8 overlays, 419 revisions. |

Reports: `sql-continuity-postgres-results.json`, `sql-reuse-results.json`, `unit-results.json`, `type-comparison.json`, full diagnostic snapshots and `live-source-counts.json`.

### Browser coverage

320×568, 390×844, reduced portrait height 390×420, 740×390 landscape, 768×1024 and 1440×900. Checks cover proposal validation/nested dismissal, history/reuse, revoked-access clearing, handover confirmation/focus and legacy admin links/tabs. Fixtures include long organization names, unbroken event titles and long representative surnames.

Actual **200% browser zoom** uses Chromium's `tabs.setZoom` API in an isolated temporary extension/profile. The measured layout is 720×450 from 1440×900. CSS zoom/pinch is not substituted. The temporary extension/profile is removed afterward.

Screenshots in `evidence/` contain controlled fixture names/data. Keyboard Tab/Escape, focus return, nested dialogs, reachable actions, overflow and reduced-motion settings are exercised, including Add organization and Revoke dialogs. Headers/footers remain visible while long confirmation content scrolls. Reduced viewport height approximates keyboard-constrained space; a physical mobile keyboard and screen reader were not tested. Numbered failure screenshots retain earlier diagnostic attempts; `ui-results.json` and the named viewport screenshots record the final passing run.

### Findings addressed

- Reuse focus returned to the page body; it now returns to its opening action. Browser and keyboard regressions reproduced this before the fix.
- Regressions reproduced empty-work badges and a pending-only notice mismatch. Badge/list eligibility is now shared and pending totals are labeled without double counting.
- SQL reproduced a representative's own new draft incorrectly increasing the handover count. Only pre-appointment records, including legacy records with unknown creation time, contribute now.
- Legacy actions could dereference a missing organization; grant guards now require a present matching context.
- Mobile building actions were duplicated. The footer is now the single action area and retains save loading/unavailable state.
- Read-only tests target their specific announcement; map regressions target the intended floor dock/current route-planning label. Assertions were retained rather than skipped.

A previous concurrent build/test run failed an existing journey fixture; the same assertions passed in isolation and the final serial suite. The final runner uses one worker and a 15-second deadline. Sandbox-denied dependency resolution was a setup failure and was rerun with the required host access. The valid TypeScript comparison is the 1,022-diagnostic record, superseding the initially restricted run.

## SQL handoff and live gates

Follow [`checklist.md`](./checklist.md) for dependency order, validated preflight/postflight, explicit reconciliation and recovery. Migrations:

1. `20261009120000_event_organization_access.sql`
2. `20261009130000_event_organization_ownership.sql`
3. `20261009140000_event_organization_reuse.sql`
4. `20261009150000_event_organization_notifications.sql`

There is no automatic legacy binding. Admins review organization/year mappings explicitly. Protected preview/binding RPCs need an authenticated administrator context; a bare SQL-editor call with no `auth.uid()` does not impersonate an app administrator.

Remaining gates: user-run live SQL, owner-level before/after counts, reviewed legacy reconciliation, and a complete frontend-to-live-Supabase handover/reuse/read-sync flow. Physical-device and screen-reader acceptance are unverified. Controlled browser responses and local SQL identities do not prove those live checks.

The disposable SQL/browser runners target this Windows host. Their temporary dependencies and browser profiles are not production dependencies or committed runtime data.

Source/count inventory and recovery are retained in [`event-source-inventory.md`](./event-source-inventory.md), [`legacy-reconciliation.md`](./legacy-reconciliation.md) and the release checklist. Code/local verification are reviewable; deployment and push remain separate user-authorized actions.
