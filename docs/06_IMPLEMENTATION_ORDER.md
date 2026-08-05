# PLV NaviSync

# Master Implementation Order

**Version:** 2.0
**Status:** Official Development Roadmap
**Checkpoint date:** August 5, 2026

---

# 1. Purpose

This document defines the implementation sequence and current completion state of PLV NaviSync.

Developers and AI assistants must follow prerequisites, but independent tasks may run in parallel when they do not touch the same files, schema contracts, or unfinished dependencies.

The roadmap exists to:

- Keep Austin moving on the critical path.
- Give contributors small non-blocking tasks.
- Prevent duplicate implementations and merge conflicts.
- Replace mock/local data gradually and safely.
- Keep every checkpoint buildable and demonstrable.

---

# 2. Status Legend

- `DONE` — implemented and manually verified.
- `PARTIAL` — important behavior works, but listed gaps remain.
- `NEXT` — next critical-path task.
- `READY` — prerequisites are complete and the task may be assigned.
- `BLOCKED` — prerequisite is incomplete.
- `LATER` — valid scope, intentionally scheduled later.
- `VERIFY` — implementation may exist but needs evidence before being marked done.

Do not mark work `DONE` based only on an AI report. Require build output and appropriate manual or automated checks.

---

# 3. Verified Project Checkpoint

The following are complete and verified:

- Project documentation baseline exists.
- Supabase project and frontend environment connection are configured.
- The reviewed initial migration exists at `supabase/migrations/001_create_plv_navisync_schema.sql`.
- The unchecked legacy migration is archived.
- Real Supabase administrator login works.
- Real Supabase student login works.
- Administrator and student sessions survive refresh.
- Logout ends the Supabase session.
- Role-based admin and student route protection works.
- Public guest access remains available.
- Demo Administrator and Demo Student accounts were provisioned.
- The demo-account selector only autofills credentials and still uses normal Supabase authentication.
- `.env.local` and `.env.demo.local` are ignored by Git.
- Production build passes.
- Baseline commit `5a3a4e5` was pushed to `origin/main`.

The following are not yet confirmed complete:

- Generated TypeScript database types.
- All required Supabase Storage buckets and policies.
- Full RLS verification for every table and role.
- Real registration, email verification, and password-reset flows.
- Admin user-management CRUD through Supabase Auth/profile services.
- Persistent campus, building, floor, room, and navigation CRUD.
- Live map publishing and public consumption from Supabase.
- Backend-connected reports, events, announcements, settings, and dashboard.
- Complete automated test coverage.

---

# 4. Execution Rules

1. Work from the latest `main`.
2. Use one short-lived task branch per task.
3. Implement one coherent task per Freebuff session and Pull Request.
4. Do not let two developers edit the same files concurrently.
5. Austin coordinates shared files, migrations, types, services, and merge order.
6. A contributor may work in parallel only when the task is independent.
7. Run `pnpm build` before marking a task complete.
8. Run relevant tests and manual checks.
9. Merge one Pull Request at a time and recheck `main`.
10. Update this roadmap only after work is verified and merged.

---

# 5. Current Critical Path

```text
Database types
→ Storage and RLS verification
→ Remaining account lifecycle
→ Campus structure persistence
→ Map Builder draft/save/publish
→ Public map consumes published data
→ Operations modules
→ System testing and release
```

Contributor work may run beside the critical path only when it does not depend on unfinished contracts.

---

# PHASE 0 — FOUNDATION VERIFICATION

**Status:** `PARTIAL`

## 0.1 Documentation baseline

**Status:** `DONE`

The core project documents exist and define scope, architecture, database design, team workflow, AI rules, and implementation order.

## 0.2 Supabase project and environment

**Status:** `DONE`

The application connects to the configured Supabase project using frontend-safe variables.

## 0.3 Initial migration and profiles

**Status:** `DONE`

The reviewed migration and profile-based `admin` / `student` roles support the verified authentication flow.

## 0.4 Generate database types

**Status:** `NEXT`

Deliverables:

- Generate TypeScript types from the applied Supabase development schema.
- Store them in the architecture-approved generated types file.
- Wire the single browser Supabase client to the generated `Database` type.
- Remove or reconcile handwritten database types only where safe.
- Do not change the schema in this task.

Definition of Done:

- Generated types match the applied schema.
- The Supabase client is typed.
- `pnpm build` passes.
- Modified files and any type mismatches are reported.

## 0.5 Verify Storage buckets and policies

**Status:** `READY` after Task 0.4, unless completed evidence is provided.

Verify the required buckets from `03_DATABASE_SUPABASE.md` and test allowed/denied access for guest, student, and administrator roles. Create a migration or documented setup only for missing approved objects.

## 0.6 Backend smoke and RLS matrix

**Status:** `READY` after Tasks 0.4 and 0.5.

Test the implemented schema against the RLS matrix. Record which reads and writes succeed or fail for guest, student, and administrator sessions.

## Phase 0 checkpoint

Phase 0 is complete when generated types, storage, and the core RLS matrix are verified and `main` builds.

---

# PHASE 1 — AUTHENTICATION AND ACCOUNT LIFECYCLE

**Status:** `PARTIAL`

## 1.1 Core authentication

**Status:** `DONE`

Includes:

- Admin login.
- Student login.
- Session restoration.
- Logout.
- Active-profile and role validation.
- Admin-route protection.
- Student-page protection.
- Guest access preservation.
- Demo-account provisioning and selector.

## 1.2 Student registration

**Status:** `READY` after Phase 0.

Replace any simulated registration with real Supabase sign-up and profile creation. Public registration must never create an administrator.

## 1.3 Email verification

**Status:** `READY` with Task 1.2.

Implement the configured verification flow, pending-verification UI, safe redirects, and resend behavior.

## 1.4 Forgot and reset password

**Status:** `READY` after Phase 0.

Implement request, callback, new-password, expired-link, and success states.

## 1.5 Administrator user management

**Status:** `READY` after Tasks 1.2–1.4 and service-contract review.

Connect user listing, activation/deactivation, and permitted profile management. Privileged Supabase Auth administration must use a protected server-side mechanism, never the browser service-role key.

## Phase 1 checkpoint

Authentication and account lifecycle are complete when registration, verification, reset, sessions, roles, active-state enforcement, and administrator management are persistent and tested.

---

# PHASE 2 — CAMPUS STRUCTURE PERSISTENCE

**Status:** `BLOCKED` by Phase 0; design work may be prepared without merging production mock replacement.

Implement in this order:

1. Campus service and campus CRUD.
2. Campus version/draft contract.
3. Building CRUD.
4. Floor CRUD.
5. Room and map-element CRUD.
6. Navigation node and edge persistence.
7. Directory queries over published campus data.
8. Loading, empty, error, conflict, and success states.
9. Remove production mock dependencies only from migrated flows.

Definition of Done:

- Data survives refresh and a new browser session.
- Services, not pages, own Supabase queries.
- Guest, student, and administrator permissions match RLS.
- Public reads never expose drafts.
- The build and relevant tests pass.

---

# PHASE 3 — MAP BUILDER PERSISTENCE AND PUBLISHING

**Status:** `BLOCKED` by the required Phase 2 contracts.

The editor UI already contains substantial authoring behavior. Do not rebuild it.

Implement and verify:

1. Load a campus draft from Supabase.
2. Save drafts without making them public.
3. Handle unsaved changes and save conflicts.
4. Persist campus settings, buildings, floors, elements, nodes, and edges.
5. Run complete validation.
6. Show readable issues and focus affected objects.
7. Publish through the approved version workflow.
8. Keep the last valid published version available.
9. Verify undo/redo, layers, properties, canvas settings, and route editing after integration.

Definition of Done:

- An administrator can create, edit, close, reopen, validate, and publish a campus without editing code.
- Drafts are private.
- Public users see only the published version.
- Publishing is transactional or safely recoverable.

---

# PHASE 4 — PUBLIC MAP AND NAVIGATION INTEGRATION

**Status:** `BLOCKED` by Phase 3 publishing.

Implement and verify:

1. Public map loads the active published campus version.
2. Unified search covers buildings, rooms, facilities, and mapped destinations.
3. Building and location details use published data.
4. Outdoor and indoor pathfinding use authored graph data.
5. Floor transitions work.
6. Accessibility filtering works.
7. Emergency-safe routing works.
8. Distance, estimated walking time, and step instructions are correct.
9. Disconnected graphs fail safely.
10. Recent destinations and favorites are connected only after core navigation is stable.

Definition of Done:

- Guests and students can search and navigate through published campus data.
- Hardcoded legacy graph assumptions are no longer authoritative.

---

# PHASE 5 — OPERATIONS

**Status:** `BLOCKED` for backend integration; isolated UI/accessibility fixes may be assigned earlier.

Implement one module at a time:

1. Reports and report history.
2. Report-image storage.
3. Events and map locations.
4. Announcements and map locations.
5. Favorites.
6. System settings.
7. Activity logs.
8. Dashboard queries and statistics.

Each module must complete reads, writes, permissions, loading, empty, error, and populated states before its production mock data is removed.

---

# PHASE 6 — SYSTEM POLISH

**Status:** `LATER`; small regression fixes may happen earlier.

- Responsive behavior.
- Mobile map usability.
- Loading, empty, error, and success states.
- Keyboard support and focus management.
- Reduced-motion behavior.
- Light and dark modes.
- Performance and bundle review.
- PWA installation and offline behavior.
- Removal of verified dead code through dedicated tasks.

Do not use this phase as permission for a broad redesign.

---

# PHASE 7 — TESTING AND EVALUATION

**Status:** `LATER`; tests should also be added during each earlier feature.

- Unit tests for pathfinding, validation, mapping, and service logic.
- Integration tests for Supabase services and RLS-sensitive workflows.
- Playwright end-to-end tests for critical user journeys.
- Feature-based testing.
- ISO/IEC 25010 evaluation.
- Expert testing.
- User Acceptance Testing.
- Regression fixes.

---

# PHASE 8 — RELEASE CANDIDATE

**Status:** `LATER`

- Final documentation.
- Safe demonstration data.
- Final database backup.
- Security review.
- Performance review.
- Production environment verification.
- Presentation and capstone-defense preparation.

---

# 6. Safe Parallel Work

Austin works on the `NEXT` critical-path task.

At the same time, contributors may receive tasks such as:

- A self-contained accessibility or responsive fix on a page Austin is not editing.
- A unit test for an existing pure pathfinding or validation function.
- An isolated form-validation improvement that does not change services or schema.
- Documentation or manual test-case preparation.

Contributors must not independently:

- Change migrations or RLS.
- Change shared service contracts.
- Modify the same page or shared file as an active critical-path task.
- Connect a page to a service whose contract is not yet merged.
- Remove mock data before the real persistent flow is verified.

---

# 7. Next Task Rule

The next default development task is Task 0.4: generate and integrate Supabase database types.

Do not start it until the documentation update is committed and pushed. After that checkpoint, create a new branch from the latest `main` and give Freebuff one focused prompt for Task 0.4.

---

# 8. AI Task Execution Rule

Every coding session must read:

```text
docs/00_PROJECT_CONTEXT.md
docs/01_SYSTEM_FEATURES.md
docs/02_SYSTEM_ARCHITECTURE.md
docs/03_DATABASE_SUPABASE.md
docs/04_TEAM_RULES.md
docs/05_FREEBUFF_RULES.md
docs/06_IMPLEMENTATION_ORDER.md
```

Then it must:

1. Confirm the assigned task and branch.
2. Inspect only relevant code.
3. State expected files before editing.
4. Implement only the assigned task.
5. Run the build and relevant tests.
6. Report changed files, database impact, checks, and unresolved risks.
7. Stop after the task report.
