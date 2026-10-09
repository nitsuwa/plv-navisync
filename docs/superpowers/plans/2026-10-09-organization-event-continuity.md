# Organization Event Continuity Implementation Plan

> **For agentic workers:** Execute inline using `executing-plans`, task by task. Do not delegate unless the user explicitly requests it. Steps use checkboxes for tracking.

**Goal:** Let one admin-appointed representative manage their organization's events across yearly handovers, reuse its history, and use a single admin Events workspace.

**Architecture:** Add verified organizations and time-limited representative grants. Bind existing event overlays to organizations without replacing original creator attribution. Move every protected event operation to database-enforced organization access, then update the UI, notification scopes, reuse flow, and admin navigation.

**Tech Stack:** Existing React/TypeScript, React Router, Supabase/Postgres RLS and RPCs, Vitest/Testing Library, Playwright browser checks. No new framework.

## Global constraints

- Follow `../specs/2026-10-09-organization-event-continuity-design.md`; product decisions are approved and implementation started October 9, 2026.
- Exactly one effective representative per organization; admin-controlled assignment and atomic replacement.
- Inherit unfinished work automatically; preserve statuses, approvals, publication, authorship, and historical audit entries.
- Public event visibility remains governed by approval/publication/schedule. Organization membership cannot publish an event.
- Desktop/mobile, keyboard access, focus return, reduced motion, loading/error/retry states apply to every new surface.
- User executes validated live SQL. No live schema changes or retained QA records from this planning task.
- Keep legacy records and routes usable. Do not infer access from organizer names or departments.
- Recheck current Git state before execution; baseline inspected was `0679fa0`. Preserve unrelated edits.
- Existing TypeScript diagnostics are a baseline to compare, not a passing typecheck. Record a fresh baseline before implementation.
- Commit by deliverable after validation; remote push/release is a separate action from this planning request.

## Delivery sequence and release gates

1. Database access and handover contracts (Tasks 1–2).
2. Admin assignments and representative workspace (Tasks 3–4).
3. Safe reuse, history, notifications, and media continuity (Tasks 5–6).
4. Unified admin Events workspace and release verification (Tasks 7–8).

Tasks are implementation checkpoints, not instructions to deploy partially compatible frontend/database combinations. Stage each migration in a disposable database first. Organization-bound records must only be activated when compatible access paths are ready.

## Task 1: Organizations, representative grants, and atomic handover

**Files**
- Create `supabase/migrations/20261009120000_event_organization_access.sql`.
- Create `supabase/tests/event_organization_access_assertions.sql`.
- Create `src/types/eventOrganization.ts` and `src/services/eventOrganizationService.ts`.
- Create `src/services/__tests__/eventOrganizationService.test.ts`.
- Modify `src/types/database.generated.ts` after SQL contracts are validated.

**Database contract**
- `event_organizations`: UUID primary key, unique admin-managed code, name, active flag, server timestamps. Display-name changes do not change identity.
- `event_organization_grants`: UUID primary key; organization/profile FKs; academic-year label; starts/expires timestamps; granted-by; ended-at/by/reason. Check end > start. Index organization and representative lookups.
- Unique partial index on organization ID where `ended_at IS NULL`. Effective access also checks validity and profile/organization status. Close expired open grants inside replacement transactions; never use `now()` in an index predicate.
- `admin_set_event_representative(p_organization_id uuid, p_profile_id uuid, p_academic_year text, p_expires_at timestamptz, p_expected_grant_id uuid)` returns the new grant. A null expected grant explicitly means unassigned. Lock the organization row, compare the expected grant, close the former grant, and insert the new grant in one transaction. No future scheduled replacement in v1.
- `admin_revoke_event_representative(p_organization_id uuid, p_expected_grant_id uuid, p_reason text)` closes the matching grant. No other event state changes.
- `get_my_event_organizations()` returns only the caller's effective organization contexts.
- Private access helpers derive identity from `auth.uid()`, never a client actor argument. Security-definer functions have fixed empty search paths, qualified objects, narrow grants, and explicit admin checks. RLS denies direct client grant mutation.

**Frontend contracts**
```ts
export interface EventOrganizationContext {
  organizationId: string;
  organizationName: string;
  grantId: string;
  academicYear: string;
  expiresAt: string;
}
export interface ReplaceRepresentativeInput {
  organizationId: string;
  representativeId: string;
  academicYear: string;
  expiresAt: string;
  expectedGrantId: string | null;
}
// Service methods:
// listMyEventOrganizations(): Promise<EventOrganizationContext[]>
// replaceRepresentative(input: ReplaceRepresentativeInput): Promise<EventOrganizationContext>
// revokeRepresentative(organizationId: string, expectedGrantId: string, reason: string): Promise<void>
```

- [x] Write SQL assertions for admin A assigning Org A, non-admin rejection, inactive/incorrect-role target rejection, expired access, explicit revocation, and Org B isolation.
- [x] Run a two-session concurrency check: two replacements sharing one expected grant must produce one success and one stale-conflict response. Test transaction rollback leaves the previous grant intact.
- [x] Implement the contracts above. Return `42501` for forbidden access and `40001` for stale expected grants. Preserve existing super-admin management protections.
- [x] Test the service error mapping and exact RPC parameter names. Never treat an unavailable RPC as an empty organization list.
- [x] Validate migration in a disposable Postgres/Supabase environment and commit this deliverable with its SQL results.

## Task 2: Bind event access to organizations and reconcile legacy ownership

**Files**
- Create `supabase/migrations/20261009130000_event_organization_ownership.sql`.
- Create `supabase/tests/event_organization_handover_assertions.sql`.
- Modify `src/services/eventOverlayService.ts` and `src/services/__tests__/eventOverlayService.test.ts`.
- Modify `src/components/map-builder/types.ts` (`CampusEventOverlay`) and `src/types/database.generated.ts`.
- Create `docs/verification/organization-event-continuity/legacy-reconciliation.md`.

**Consumes:** Task 1 access helpers/grants. **Produces:** organization-scoped event reads/writes, audited legacy binding, unchanged authorship.

- [x] Inventory latest effective policies, triggers, and functions for `map_elements`, event revisions, review, withdrawal, feedback, notification receipts, and poster objects. Read forward migrations, especially October 7 feedback guards and October 8 receipts. Search all `createdByUserId` references; classify attribution versus authorization.
- [x] Add nullable `organization_id` FK on `map_elements`, indexed and restricted to event overlays; keep campus structure saves from changing it. Preserve `metadata.createdByUserId` permanently. Store explicit academic-year metadata and later reuse provenance under protected keys.
- [x] Introduce `can_access_event_overlay(p_overlay_id uuid)` using admin access or current organization access; only unbound legacy overlays may use the original creator fallback. Do not OR an old creator policy with a new organization policy for bound records.
- [x] Change insertion guards to require an effective destination grant for new organization events and the current caller as creator. Enforce organization, original creator, academic year, and provenance immutability on ordinary updates.
- [x] Update revision reads, write guards, submit/withdraw/review, deletion, and feedback resolution consistently. Keep pending/approved content locks, optimistic concurrency, and admin-only schedule/publication rules. Organization binding/correction writes assignment audits and preserves layout revisions.
- [x] Serialize protected organization writes with handover using a consistent organization-then-event lock order and a fresh grant check after locking. Cover autosave, feedback, withdrawal, and submission. A write already completed before replacement remains historical work; a stale representative must not commit a new authorized write after replacement wins the lock. Include both race orderings in the two-session SQL test.
- [x] Add admin-only `admin_bind_event_organization(p_event_id uuid, p_organization_id uuid, p_academic_year text, p_expected_updated_at timestamptz)` for unbound legacy overlays. Store before/after audit data, reject conflicting rebinding, and preserve creator/revisions/status. Permit explicit corrections only through a separately audited admin action.
- [x] Produce a reconciliation preview with event ID, creator, organizer label, proposed verified organization, academic year, and validation result. Matching text may suggest candidates but must never apply assignments automatically. Unresolved rows stay unbound and retain their prior restricted behavior.
- [x] Test the approved handover scenario with creator A, successor B, unrelated Org C, and an admin: B inherits all states, A loses private access, C remains isolated, creator and past actions remain A, and public visibility is unchanged.
- [x] Verify non-event map elements and published-campus structure-save isolation remain unaffected in the disposable SQL fixture. Commit after SQL and service checks pass.

## Task 3: Admin organization and representative management

**Files**
- Create `src/components/events/AdminOrganizationsPanel.tsx` and `RepresentativeAssignmentDialog.tsx`.
- Create corresponding tests in `src/components/events/__tests__/`.
- Modify `src/pages/AdminUsersPage.tsx` and `src/services/adminUserService.ts` only at assignment integration points.
- Extend `src/services/eventOrganizationService.ts` with admin list/create/update organization methods backed by admin-only RPCs in the Task 1 migration before deployment.

**Produces:** an Organizations section inside admin Users, without another primary navigation item.

- [x] Add tests for no representative, current representative, expired assignment, replacement, revoke, and stale-dialog conflict states.
- [x] Build organization rows/cards showing name/code, representative, academic year, expiry, and status. Assign and Replace are distinct actions. Show historical grants on demand.
- [x] Assignment dialog requires a verified eligible account, academic-year label, and expiry. State clearly that replacing the representative transfers responsibility for existing work and ends the previous person's organization access.
- [x] Show the actual outgoing/incoming names before confirmation. Disable duplicate submit, retain inputs on failure, and reload the current grant on a `40001` conflict.
- [x] Link Student Organization role management to assignment without relaxing existing admin/super-admin controls. On profile deactivation/demotion, effective access must stop even if an old grant row remains for history; make that state visible to admins.
- [x] Check 320px width, desktop, keyboard, focus return, and readable errors. Commit the admin assignment UI.

## Task 4: Organization Events and inherited editor access

**Files**
- Create `src/hooks/useEventOrganizationAccess.ts` and its tests.
- Create `src/components/events/OrganizationEventHistory.tsx` and its tests.
- Modify `src/pages/StudentMyEventsPage.tsx`, `StudentEventEditPage.tsx`, `src/components/events/EventProposalModal.tsx`, and their existing tests.
- Modify `src/components/layout/Navbar.tsx` and `src/components/map/MobileMapAccountMenu.tsx` for consistent Organization Events wording.

**Consumes:** organization context + protected event service. **Produces:** organization-scoped workspace and inheritance without changing original authorship.

- [x] Test successor access to an old creator's draft and pending/approved records; test outgoing account denial while an editor is mounted. Keep actor-switch and late-response regression tests.
- [x] Add explicit organization context above Current work / History. If multiple organizations are assigned to one account, require selecting the destination; never infer from a display name. If none, show an actionable admin-assignment message.
- [x] Replace creator equality guards with server-validated organization access. Scope caches/autosave/drafts by actor, organization, grant, and event. Invalidate on access changes and reject late read/save completions from a prior grant.
- [x] Current work includes unfinished drafts/disapproved/pending records and approved events with relevant upcoming/ongoing activity or outstanding feedback. History is inspectable across academic years. An old term alone never locks an unfinished draft. Archived records use a protected history read path rather than removing `archived_at` filters from public queries.
- [x] Show academic year, original creator, creation time, event dates, status, and current responsible representative. Use Unknown for unmapped historical academic year. Use Manila dates consistently.
- [x] Revalidate on focus/reconnect and periodic refresh using existing polling patterns. On revoked/expired access, stop autosave and clear the protected workspace; display an access-changed message. Server rejection is authoritative even before the refresh interval.
- [x] Test revoked stale-tab saves, cached offline records, login as another organization, history pagination/filter reset, long labels, and keyboard/touch access. Commit this workspace deliverable.

## Task 5: Reuse history safely and preserve media

**Files**
- Create `supabase/migrations/20261009140000_event_organization_reuse.sql` and `supabase/tests/event_organization_reuse_assertions.sql`.
- Create `src/lib/eventOrganizationReuse.ts`, its tests, and `src/components/events/ReuseOrganizationEventDialog.tsx` with tests.
- Modify `src/services/eventOverlayService.ts`, `src/pages/StudentMyEventsPage.tsx`, and `src/lib/eventPosterStorage.ts`.

**Contract:** `reuse_organization_event(p_source_id uuid, p_expected_source_updated_at timestamptz, p_organization_id uuid, p_expected_grant_id uuid, p_title text, p_academic_year text, p_request_id uuid)` returns the created overlay. Add indexed relational `reused_from_event_id` provenance with deletion protection. Store idempotency receipts privately, scoped to actor/grant/request and exact payload; do not expose them in public event metadata.

- [x] Write an allowlist-copy unit test and SQL tests: same-org successor succeeds; other-org source fails; revoked grant fails; source changed returns conflict; repeating the same request returns one draft; reusing a request ID with a different payload fails.
- [x] Build metadata from approved reusable fields only, using server-read source data. Assign the actual caller as new creator and retain source ID/academic year for provenance. Reset review, schedule, publication, submission, feedback/resolutions, receipts, and revision identifiers.
- [x] Validate current published campus/floor references and placement constraints. If a location was removed or unpublished, stop and identify it. If placement is recoverable, show visible issues and require correction before submit. Never silently omit a location or reuse old approval.
- [x] Dialog shows source title/year, new title/year, destination organization, and the fresh-approval requirement. Show success only after server confirmation and navigate to the new draft. Retry with the same request ID after uncertain network completion.
- [x] Add reference-aware poster protection: historical/reused references cannot be deleted by the original uploader. Use fresh upload paths for replacements. Authorize organization uploads and listing through current grants; preserve existing public poster URL behavior and disclose that this is not private media storage. Test outgoing deletion attempts and source reuse after replacement.
- [x] Verify historical originals remain byte-for-byte unchanged except deliberate new reference/audit records. Commit after reuse and media checks pass.

## Task 6: Organization notifications and per-person read receipts

**Files**
- Create `supabase/migrations/20261009150000_event_organization_notifications.sql` and matching SQL assertions.
- Modify `src/hooks/useStudentOrgEventUpdates.ts`, `src/services/eventNotificationService.ts`, their tests, and `src/lib/studentEventUpdates.ts`.
- Modify `src/components/layout/StudentNotificationBell.tsx`, existing organization badges, and `src/components/layout/AdminLayout.tsx` only where recipient/routing contracts change.

- [x] Extend receipt RLS and `get_event_notification_states` / `ack_event_notification` to authorize the current organization representative for bound events. Keep actor validation, exact semantic fingerprint checks, and stale-event protection.
- [x] Scope frontend subscriptions/store invalidation to actor + organization + grant. Original creator attribution must no longer filter successors out of the event list.
- [x] Keep individual read receipts. Add a handover summary derived from the new grant and unresolved work; store its acknowledgement per grant so a returning representative still sees the new handover. Do not mark all historical approvals as new submissions.
- [x] Test B reading on desktop/mobile, A being denied after replacement, a later feedback update appearing unread, and admin pending totals staying accurate after receipt acknowledgement.
- [x] Check the recently merged StudentNotificationBell integration: one review update should have one intended notification action, and public student events must not expose private organization feedback. Commit this notification deliverable.

## Task 7: Consolidate admin navigation without losing legacy events

**Files**
- Create `src/pages/AdminEventsWorkspacePage.tsx` and `src/pages/__tests__/AdminEventsWorkspacePage.test.tsx`.
- Modify `src/app/routes.tsx`, `src/components/layout/AdminSidebar.tsx`, `AdminLayout.tsx`, `src/pages/AdminEventLayoutsPage.tsx`, `AdminEventsPage.tsx`, and relevant existing tests.
- Retain `src/services/eventService.ts` and its consumers unless a separately verified adapter is required.

- [x] Inventory `events`, `event_locations`, overlays, student feeds, notification sources, dashboard links, and old deep links. Preserve a count/source report before changing routing; no live migration or deletion of legacy events is implied.
- [x] Extract reusable page content from the existing admin pages into the workspace rather than nesting complete layouts. Canonical route: `/admin-dashboard/events` with `view=review`, `publication`, `history`, or `listings`.
- [x] Use one Events navigation item and one pending-submission badge. Show Needs review, Approved & publication, and History; expose Campus listings when legacy records exist, preserving its existing management controls and source identity.
- [x] Redirect `/admin-dashboard/event-layouts` while preserving `review` and other supported query parameters. Keep `/admin-dashboard/event-layouts/:id/preview` as a compatible alias to the existing preview. Preserve student event links and browser back behavior.
- [x] Distinguish approval status from publication and date phase. Add organization/year filters to layout views. Do not show a Campus listing as an approved layout or create duplicate public entries automatically.
- [x] Test old notification links, direct legacy listing edits, preview close/return, pending badges, mobile navigation, and empty legacy data. Commit the unified workspace.

## Task 8: Verification, migration handoff, and release preparation

**Files**
- Create `docs/verification/organization-event-continuity/README.md`, `checklist.md`, and `run-ui.mjs`.
- Add a disposable SQL/concurrency harness alongside the existing `supabase/tests` workflow; record exact commands and outcomes in the README.

- [x] Run the targeted Vitest files added/changed in Tasks 1–7, plus existing event proposal/editor, feedback, publication, receipt, campus structure isolation, and route-link regressions. Capture failures rather than excluding failing assertions to obtain a pass.
- [x] Run `node node_modules/vite/bin/vite.js build`. Compare TypeScript diagnostics against a fresh baseline from the execution starting commit; report pre-existing errors separately and reject newly introduced errors.
- [ ] Verify full flow with controlled Org A, Org B, outgoing/incoming representatives, ordinary student, and admin: grant → create → save → submit → feedback → handover while pending → successor feedback action → approval/publication → historical reuse → fresh submission.
- [x] Exercise simultaneous replacement, expiry, stale save after handover, offline/reconnect, missing RPC, profile deactivation, soft-archived history, unknown legacy year, lost source venue, and poster reference preservation. SQL tests use real roles and RLS, not solely UI mocks.
- [x] Browser matrix: 320x568, 390x844, 740x390 landscape, 768x1024 tablet, 1440x900 desktop, and actual 200% browser zoom. Check long names, keyboard focus, nested dialogs, validation visibility, reduced motion, and reachable actions with reduced viewport height. Record physical-device/screen-reader checks as unverified unless actually performed.
- [ ] Prepare validated SQL in dependency order, dry-run reconciliation counts, affected-policy inventory, and a user-run preflight/postflight checklist. Confirm required functions/tables before enabling organization assignment in the UI; never silently fall back to creator access for a bound organization event.
- [x] Recovery plan: revoke/pause new grants if needed while retaining data/audit records; restore compatible frontend/access functions deliberately. Do not roll back to creator-only code while organization-bound events exist, delete ownership fields, or reverse mapping without an audited reconciliation review.
- [ ] Check originals, drafts, revision counts, legacy event counts, public visibility, and representative mappings after migration. Use controlled fixtures first; no retained live QA event without user approval.
- [x] Deliver the completed verification report with remaining limitations. Only then prepare the final integration/release commit and perform remote actions authorized for that execution session.

## Local completion evidence

Local contracts/UI are implemented and validated (624 regression tests, 85 real PostgreSQL checks, 81 PGlite checks, 39 controlled browser checks, production build, unchanged TypeScript diagnostic baseline). The full live frontend-to-Supabase flow, live SQL/reconciliation/postflight, and physical-device/screen-reader acceptance remain release gates for the user. No push or retained live QA record was created.

## Completion criteria

- [ ] One effective representative enforced by the database, including concurrent admin requests.
- [ ] Successor inherits all unfinished work without changing historical authorship/status.
- [ ] Outgoing/cross-org private access fails on direct API calls, not only through UI hiding.
- [ ] Original records, revisions, posters, and legacy campus listings remain accessible to authorized viewers.
- [ ] Reuse creates one clean draft with provenance, validates current maps, and requires new approval.
- [ ] Read receipts remain per person; handover responsibilities and updated feedback are visible.
- [ ] One admin Events navigation entry; old deep links still work.
- [ ] Responsive/accessibility/recovery checks have recorded outcomes and explicit limitations.

## Execution guidance

Recommended model choice is an engineering judgment, not a guarantee: GPT-6.1 Sol High for focused frontend/service tasks; Extra High for ownership/RLS, atomic handover, legacy reconciliation, and final review. Run the stages in order with their verification gates rather than relying on reasoning effort alone. This plan does not change the current model setting or execute implementation.
