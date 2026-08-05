# PLV NaviSync

# Master Implementation Order and Team Work Queues

**Version:** 3.1
**Status:** Official Development Roadmap
**Checkpoint date:** August 5, 2026

---

# 1. Purpose

This document defines:

- The verified project checkpoint.
- Three approximately balanced development workstreams.
- The ordered feature-package queue for each developer.
- Dependencies and integration gates.
- The remaining work required to complete the approved PLV NaviSync scope.

Each developer proceeds through their own queue without waiting for another person to assign every next task. Start only packages marked `NEXT` or `READY`. When a package is blocked, continue only with another explicitly ready item or help with testing and review.

Completing all required packages, integration gates, and release checks in this document completes the frozen system scope defined by `00_PROJECT_CONTEXT.md` and `01_SYSTEM_FEATURES.md`.

---

# 2. Status Legend

- `DONE` — implemented, tested, reviewed, and merged.
- `PARTIAL` — important behavior exists, but the listed gaps remain.
- `NEXT` — the next package the named developer should start.
- `READY` — prerequisites are complete and the package may begin.
- `BLOCKED` — a named prerequisite is incomplete.
- `VERIFY` — implementation may exist but needs evidence before it is accepted.
- `LATER` — valid scope scheduled after higher-priority dependencies.

Do not mark a package `DONE` based only on an AI report. Require a reviewed diff, passing build, relevant checks, and merged Pull Request.

The status written inside each package below is its starting status when this roadmap was approved. Live progress is recorded in:

- `docs/progress/DEVELOPER_1_PROGRESS.md`
- `docs/progress/DEVELOPER_2_PROGRESS.md`
- `docs/progress/DEVELOPER_3_PROGRESS.md`

The checklists on the latest `main` branch are the official record. Each developer updates only their own progress file in the same Pull Request as the package implementation.

---

# 3. Verified Project Checkpoint

The following are complete and verified:

- Core project documentation exists and defines the frozen scope.
- Supabase project and frontend environment connection are configured.
- The reviewed initial migration exists at `supabase/migrations/001_create_plv_navisync_schema.sql`.
- The unchecked legacy migration is archived.
- Real Supabase administrator and student login work.
- Administrator and student sessions survive refresh.
- Logout ends the Supabase session.
- Role-based admin and student route protection works.
- Guest access remains available.
- Demo Administrator and Demo Student accounts were provisioned.
- The demo selector only autofills credentials and still uses Supabase authentication.
- Private environment files are ignored by Git.
- The production build passes.
- Baseline commit `5a3a4e5` was pushed to `origin/main`.

The following are not yet confirmed complete:

- Generated TypeScript database types.
- Required Supabase Storage buckets and policies.
- Full RLS verification for all roles and tables.
- Registration, email verification, and password reset.
- Administrator user management.
- Persistent campus, building, floor, room, map-element, and graph CRUD.
- Draft/save/publish integration.
- Public consumption of the active published campus.
- Fully integrated search and navigation.
- Backend-connected reports, events, announcements, favorites, settings, logs, and dashboard.
- Complete responsive, accessibility, PWA/offline, automated testing, and release verification.

---

# 4. Team Workstreams

| Workstream | Primary developer | Main outcome |
| --- | --- | --- |
| A — Platform and Campus Lifecycle | Developer 1 | Secure Supabase foundation, account lifecycle, typed services, campus persistence, versioning, publishing, and integration contracts |
| B — Map Authoring and Navigation | Developer 2 | Complete admin outdoor/floor editors, graph authoring, validation, route testing, and reliable Map Builder persistence |
| C — Student Experience and Operations | Developer 3 | Complete public/student experience, search/navigation UI, operational modules, admin operational pages, responsive UX, and PWA behavior |

These are primary assignments, not permanent ownership. Follow the handoff rules in `04_TEAM_RULES.md` when another developer must continue a package.

The workload is divided by expected effort, not merely by the number of packages. Packages may be split into a second Pull Request only when review size becomes unsafe, but the complete package remains the acceptance unit.

No workstream is designated as the main workstream. Developer 1, Developer 2, and Developer 3 are each responsible for delivering, testing, documenting, and submitting their own complete queue.

## Approved scope coverage

This matrix shows where every approved module in `01_SYSTEM_FEATURES.md` is completed. A module is complete only after all listed packages and relevant release checks are done.

| Approved module | Packages that complete it |
| --- | --- |
| Module 1 — Authentication and User Management | Verified checkpoint plus A1, A2, A3, A8, C7, and C10 |
| Module 2 — Interactive Campus Navigation | A5, A6, B5, B7, B8, C2, C4, and C10 |
| Module 3 — Smart Search and Campus Directory | A5, C2, C3, C7, and C10 |
| Module 4 — Visual Campus Map Builder | A4, A5, A6, and B1 through B10 |
| Module 5 — Campus Events and Announcements | A7, C2, C6, C8, and C10 |
| Module 6 — Campus Issue Reporting | A1, A7, C5, C8, and C10 |
| Module 7 — Admin Dashboard and Analytics | A7, C8, and C10 |
| Module 8 — Map Validation and Publishing | A4, A6, A8, B7, B8, B9, C2, and C10 |
| Module 9 — System Configuration and Settings | A3, A7, A9, C8, C9, and C10 |
| System-wide quality and release requirements | A8, A9, B10, C9, C10, Gate G5, and the evaluation and release sequence |

If an approved requirement is later found to be absent from these packages, update this roadmap before implementation rather than silently dropping the requirement.

---

# 5. Global Execution Rules

1. Start from the latest `main`.
2. Use one short-lived branch per complete feature package.
3. Read all project source-of-truth documents before prompting or coding.
4. Do not let developers edit the same file or shared contract simultaneously.
5. Developer 1 coordinates migrations, generated types, and shared service contracts; the team follows dependency-aware merge order.
6. Run `pnpm build`, relevant tests, and manual checks before review.
7. Merge one Pull Request at a time when changes overlap or depend on each other.
8. Pull latest `main` before starting the next package.
9. Use the separate developer progress files for live package status. Update this roadmap only when scope, order, or dependencies change; update the relevant section of `CURRENT_IMPLEMENTATION.md` after verified behavior changes.
10. Do not remove mock data from a production flow until the real replacement is verified.

---

# 6. Integration Gates

These gates control when cross-workstream work may proceed.

## Gate G0 — Typed backend foundation

Requires:

- A1 Database types, Storage, and RLS baseline.

Unlocks:

- Account lifecycle completion.
- Persistent feature services.
- Safe backend connections by other workstreams.

## Gate G1 — Campus data contract

Requires:

- A4 Campus lifecycle and version contract.
- A5 Campus structure and graph service contracts.

Unlocks:

- B6 Map Builder persistence integration.
- C2 Published public-map loading.
- Backend-connected directory queries.

## Gate G2 — Draft authoring loop

Requires:

- B2 through B6.
- A6 Draft and publish orchestration foundation.

Unlocks:

- Complete validation and publish UX.
- Real public published-campus consumption.

## Gate G3 — Published navigation loop

Requires:

- A6 published-version orchestration.
- B7 validation and B8 route testing.
- C2 published map and C3 search/details.

Unlocks:

- C4 full student navigation.
- Event/report/favorite location integration.

## Gate G4 — Operations integration

Requires:

- A7 operational service contracts.
- Required Storage and RLS verification from A1.

Unlocks:

- C5 through C8 backend-connected operational modules.

## Gate G5 — Release candidate

Requires:

- A1 through A8, B1 through B10, and C1 through C9 merged.
- No known critical security, persistence, publishing, or navigation failure.

Unlocks:

- A9 release data, backup, and deployment readiness.
- C10 PWA, offline, and critical end-to-end verification.
- Final evaluation after A9 and C10 are also merged.

---

# 7. Workstream A — Platform and Campus Lifecycle

**Primary developer:** Developer 1
**Goal:** Provide secure, typed, persistent contracts used by the editors, public map, and operational modules.

## A1 — Database types, Storage, and RLS baseline

**Status:** `NEXT`
**Branch:** `feature/database-types-and-storage`

Deliverables:

- Generate TypeScript `Database` types from the applied Supabase schema.
- Type the single browser Supabase client.
- Reconcile handwritten database types only where safe.
- Verify or create the approved Storage buckets and policies.
- Test the core RLS matrix for guest, student, and administrator access.
- Document test evidence and any approved corrective migration.
- Do not redesign the schema during type generation.

Definition of Done:

- Generated types match the applied development schema.
- No service-role key is present in frontend code.
- Required buckets and core policies exist.
- Allowed and denied role checks behave as designed.
- `pnpm build` passes.

Unlocks: Gate G0 and packages A2–A5.

## A2 — Student account lifecycle

**Status:** `BLOCKED` by A1
**Branch:** `feature/student-account-lifecycle`

Deliverables:

- Real student registration using Supabase Auth.
- Safe student-profile creation.
- Email-verification pending, resend, callback, and success states.
- Forgot-password request and reset callback.
- New-password, expired-link, invalid-link, and success behavior.
- No public administrator registration.
- Clear validation, loading, and error states.

Definition of Done:

- A student can register, verify, log in, request a reset, set a new password, and retain a valid session.
- Role and active-profile enforcement remains correct.
- Auth redirects work on desktop and mobile.

## A3 — Administrator user management and privileged actions

**Status:** `BLOCKED` by A2
**Branch:** `feature/admin-user-management`

Deliverables:

- Typed profile listing and filtering.
- Activation/deactivation with current-session enforcement.
- Approved role/profile management.
- Protected server-side mechanism for privileged Auth administration when required.
- Audit entries for privileged changes.
- Prevention of browser-side service-role usage.

Definition of Done:

- An authorized administrator can manage permitted account states.
- Unauthorized and inactive users cannot bypass restrictions.
- Admin actions are validated, logged, and tested.

## A4 — Campus lifecycle and version contract

**Status:** `BLOCKED` by A1
**Branch:** `feature/campus-lifecycle`

Deliverables:

- Typed campus service for create, read, update, archive, restore when approved, and status queries.
- Campus creation fields: identity, location, appearance, and initial editable canvas size.
- Draft and published-version data contract.
- Campus status rules for draft, published, unpublished, and archived states, including safe restoration where approved.
- Active-campus selection and safe empty-state behavior.
- Conflict-aware update contract.

Definition of Done:

- Campus data survives refresh and a new browser session.
- Draft data is private.
- Archived and unpublished behavior matches the feature specification.
- Services own Supabase queries; pages do not duplicate raw queries.

Unlocks the first half of Gate G1.

## A5 — Campus structure, directory, and graph services

**Status:** `BLOCKED` by A4
**Branch:** `feature/campus-structure-services`

Deliverables:

- Typed CRUD services for buildings, entrances, floors, rooms, map elements, navigation nodes, and navigation edges.
- Ordering, identity, coordinate, transform, floor-link, accessibility, and emergency properties.
- Batch save/update support needed by Map Builder.
- Published-directory queries for buildings, rooms, facilities, and mapped destinations.
- Transaction or recoverable failure design for multi-entity saves.
- Tests for mapping and serialization logic.

Definition of Done:

- All approved authoring entity types can be persisted and loaded.
- Public directory queries expose only published data.
- Foreign keys, RLS, and validation protect invalid cross-campus relationships.

Unlocks Gate G1.

## A6 — Draft save, validation handoff, and publish orchestration

**Status:** `BLOCKED` by A5 and B5 contract review
**Branch:** `feature/campus-publishing-workflow`

Deliverables:

- Load/save contract for campus drafts.
- Optimistic concurrency or another approved conflict strategy.
- Transactional or safely recoverable publish workflow.
- Preservation of the last valid published version.
- Unpublish and archive behavior.
- Public active-version query.
- Publication history with version number, publisher, timestamp, and change summary.
- Draft discard/cancel and comparison with the latest published version.
- Validation-result handoff from Workstream B before publish.
- Activity-log records for save, publish, unpublish, and archive actions.

Definition of Done:

- An administrator can safely save a private draft and publish only a valid version.
- Public users never see incomplete drafts.
- A failed publish does not destroy the last valid publication.

Unlocks the backend half of Gates G2 and G3.

## A7 — Operations service contracts

**Status:** `BLOCKED` by A1 and A5
**Branch:** `feature/operations-services`

Deliverables:

- Typed services and RLS verification for reports and report history.
- Report-image upload and access contract.
- Events, event locations/stalls, scheduling, and automatic expiration behavior.
- Announcements, optional mapped locations, and controlled temporary route-closure contracts.
- Favorites and recent-destination persistence.
- System settings and activity-log queries.
- Dashboard summary query contracts.
- Selected map-data and report export services; full database export remains a future enhancement.

Definition of Done:

- Workstream C can connect pages without inventing raw Supabase queries.
- Guest, student, and administrator permissions match the approved scope.
- Upload limits, validation, and private data access are enforced.

Unlocks Gate G4.

## A8 — Cross-system security and integration verification

**Status:** `BLOCKED` by A2–A7 and dependent merged UI packages
**Branch:** `test/security-and-integration-matrix`

Deliverables:

- Complete guest/student/admin access matrix.
- Verify active/inactive accounts and protected routes.
- Verify draft versus published isolation.
- Verify Storage access and private report data.
- Verify cross-campus and cross-user isolation.
- Check error handling for expired sessions and permission failures.
- Add integration tests or reproducible verification scripts where practical.

Definition of Done:

- No known critical RLS, Storage, role, draft-exposure, or privilege-escalation defect remains.
- Evidence and unresolved limitations are documented.

## A9 — Release data, backup, and deployment readiness

**Status:** `BLOCKED` by Gate G5
**Branch:** `chore/release-data-and-backup`

Deliverables:

- Safe demonstration accounts and campus data.
- Final migration and generated-type consistency check.
- Database backup procedure and verification of the approved selected-data exports.
- Production environment and redirect checklist.
- Secrets and environment-file review.
- Deployment smoke test support.
- Final technical documentation updates.

Definition of Done:

- The database and environments can be demonstrated and recovered safely.
- Setup and deployment steps are reproducible without exposing secrets.

---

# 8. Workstream B — Map Authoring and Navigation

**Primary developer:** Developer 2
**Goal:** Make the existing admin editors fully functional, understandable, persistent, and capable of producing valid navigation data.

## B1 — Map Builder baseline audit and regression protection

**Status:** `READY`
**Branch:** `test/map-builder-baseline`

Deliverables:

- Inspect the existing Map Builder and floor-editor behavior; do not rebuild it.
- Record which tools and interactions already work, are partial, or are mock-only.
- Add focused tests for stable pure functions such as pathfinding, validation, transforms, or serialization where practical.
- Identify exact editor files and shared contracts used by later packages.
- Fix only confirmed build-breaking or test-blocking defects in this package.

Definition of Done:

- The team has an evidence-based baseline and regression checklist.
- Existing working behavior is protected before persistence integration.
- `pnpm build` and relevant tests pass.

## B2 — Outdoor campus canvas and object authoring

**Status:** `BLOCKED` by B1
**Branch:** `feature/outdoor-campus-authoring`

Deliverables:

- First-time campus-size setup and later editing.
- Smooth zoom, controls, Ctrl+scroll behavior, pan, grid, snap, and guides.
- Select, move, multi-select, multi-object move, rotate/scale when approved, duplicate, and delete.
- Functional and decorative outdoor assets with correct properties.
- Correct selection outlines and transforms.
- Undo/redo and layer ordering for the affected outdoor objects.

Definition of Done:

- An administrator can create and edit a usable outdoor campus layout without broken or ambiguous core controls.
- All changed interactions work with mouse and relevant keyboard controls.

## B3 — Building configuration and entrances

**Status:** `BLOCKED` by B2 and A5 contract availability for final integration
**Branch:** `feature/building-entrance-authoring`

Deliverables:

- Create, select, edit, move, duplicate, and delete buildings.
- Building name, type, description, hours, appearance, and approved metadata.
- Floor count, floor names/order, and default floor configuration.
- Outdoor entrances/exits positioned and linked to their building.
- Validation for missing identity, invalid floor configuration, or unusable entrances.

Definition of Done:

- A complete building shell with floors and entrances can be authored and validated.
- Empty floors remain empty until the administrator adds content.

## B4 — Floor-plan authoring

**Status:** `BLOCKED` by B3
**Branch:** `feature/floor-plan-authoring`

Deliverables:

- Building/floor switcher with safe unsaved-change behavior.
- PNG, JPG, JPEG, and WEBP floor-plan background upload through the approved Storage service.
- Preserve the original uploaded image, support optional scale/calibration, and require confirmation before replacing a background that already has authored objects.
- Walls, doors, hallways, rooms, stairs, elevators, ramps, and approved facilities.
- Decorative chairs, tables, and other approved visual assets.
- Room and facility properties, searchable names, and identifiers.
- Correct floor transitions for stairs/elevators and up/down direction.
- Layers, selection, snap, undo/redo, properties, and delete behavior inside floors.

Definition of Done:

- An administrator can author multiple usable floors with functional locations and transitions.
- Functional objects contain the data needed by navigation; decorations do not affect routing.

## B5 — Navigation graph authoring

**Status:** `BLOCKED` by B3 and B4
**Branch:** `feature/navigation-graph-authoring`

Deliverables:

- Clear node-and-edge path tool with understandable start/finish/cancel behavior.
- Connect outdoor routes, entrances, hallways, rooms, stairs, elevators, ramps, and exits.
- Edge direction, weight/distance, accessibility, emergency suitability, and closure properties as approved.
- Emergency exits, fire exits, assembly areas, and safe zones required by the approved emergency-routing model.
- Cross-floor and indoor/outdoor connections.
- Visual feedback for incomplete, disconnected, duplicate, or invalid graph elements.

Definition of Done:

- The graph can represent standard, accessible, and emergency-safe routes across campus and floors.
- The path tool no longer leaves unexplained isolated points as if a route were complete.

## B6 — Map Builder persistence integration

**Status:** `BLOCKED` by B2–B5 and Gate G1
**Branch:** `feature/map-builder-persistence`

Deliverables:

- Load the selected campus draft through approved services.
- Persist canvas settings, buildings, floors, rooms, elements, nodes, and edges.
- Batch-save safely and report partial/failed saves clearly.
- Track dirty state correctly.
- Restore authoring state after refresh and reopening.
- Remove production mock/local persistence only from migrated flows.

Definition of Done:

- A drafted campus can be closed and reopened without losing authored content.
- Saving does not make the draft public.
- Dirty/save state reflects actual changes.

Unlocks the editor half of Gate G2.

## B7 — Complete validation and issues workflow

**Status:** `BLOCKED` by B5 and B6
**Branch:** `feature/map-builder-validation`

Deliverables:

- Validate campus identity/size, buildings, floors and required floor-plan backgrounds, entrances, rooms, duplicate room names, transitions, coordinates, graph connectivity, stale references, accessible paths, and emergency exits as specified.
- Present readable one-issue-per-line results near the issues control.
- Clicking an issue opens the correct building/floor and focuses the affected object.
- Prevent publish when blocking issues exist.
- Use clear warnings versus errors.
- Show passed checks, total validation score, affected location, and suggested resolution; warnings require confirmation when publication is allowed.
- Add a restrained feedback animation such as screen shake for blocked actions.

Definition of Done:

- Administrators can understand and locate every blocking issue.
- Invalid data cannot be presented as successfully publishable.

## B8 — Route testing and pathfinding verification

**Status:** `BLOCKED` by B5, B7, and A5 published graph format
**Branch:** `feature/map-builder-route-testing`

Deliverables:

- Test-navigation panel for origin/destination selection.
- Standard, accessible, and SOS/emergency modes.
- Outdoor, indoor, and combined pathfinding over authored graph data.
- Floor-transition display.
- Distance, estimated walking time, and step generation.
- Safe disconnected-graph and no-route behavior.
- Unit tests for route selection, accessibility filtering, and cross-floor transitions.

Definition of Done:

- An administrator can verify representative routes before publishing.
- Pathfinding no longer depends on hardcoded legacy campus assumptions.

Unlocks the authoring portion of Gate G3.

## B9 — Save, publish, tutorial, and editor state UX

**Status:** `BLOCKED` by A6, B6, and B7
**Branch:** `feature/map-builder-publish-ux`

Deliverables:

- Centered polished save and publish progress overlays.
- Pre-publish review with validation summary.
- Correct enabled/disabled save and publish states.
- Unsaved-changes dialog when leaving or switching context.
- Discard/cancel draft and compare-with-published actions using the approved version contract.
- Success and recoverable error feedback.
- Tutorial that prevents interaction outside tutorial controls while active.
- Correct draft, published, unpublished, and archived status display.
- Publication history and post-publish summary showing the affected buildings, floors, rooms, facilities, routes, and total objects.

Definition of Done:

- Save and publish behavior is clear, prevents accidental loss, and reflects backend results truthfully.

## B10 — Authoring polish, accessibility, and performance

**Status:** `BLOCKED` by B2–B9
**Branch:** `fix/map-builder-polish`

Deliverables:

- Desktop and supported tablet/mobile editor layout review.
- Keyboard access and focus management for essential controls.
- Tooltips and labels for ambiguous tools.
- Reduced-motion support.
- Light/dark mode consistency.
- Large-map interaction and render-performance review.
- Dedicated regression test pass for selection, layers, transforms, undo/redo, saving, validation, and route testing.

Definition of Done:

- The Map Builder is understandable, stable, and usable for the capstone demonstration without a broad redesign.

---

# 9. Workstream C — Student Experience and Operations

**Primary developer:** Developer 3
**Goal:** Deliver the complete guest/student experience and backend-connected operational pages.

## C1 — Public/student shell, Home, and Help Center completion

**Status:** `NEXT`
**Branch:** `feature/public-shell-and-help`

Deliverables:

- Verify the approved public navigation: Home, Map, Help Center, and top-right login/profile state.
- Complete responsive Home presentation, campus summary content, and announcement preview placeholders that can later receive real data.
- Complete Help Center FAQ, tutorial-video area, and “Send us a message” form layout/validation.
- Preserve guest access and correct authenticated-state presentation.
- Remove obsolete student dashboard navigation only where the frozen scope requires it.

Definition of Done:

- Home and Help Center are polished, responsive, accessible, and build successfully.
- No new fake backend integration is claimed.

## C2 — Published campus map loading and map states

**Status:** `BLOCKED` by Gate G1 and A6 public-version query
**Branch:** `feature/published-campus-map`

Deliverables:

- Load only the active published campus version.
- Render campus canvas, buildings, outdoor assets, floors, rooms, and functional markers from approved data.
- Handle no campus, unpublished campus, loading, offline cache, permission, and unexpected error states.
- Keep draft data inaccessible.
- Preserve pinned search and essential map controls across desktop and mobile.

Definition of Done:

- Guests and students see the same last valid published campus and never see an admin draft.

## C3 — Unified search, directory, and location details

**Status:** `BLOCKED` by C2 and A5 directory services
**Branch:** `feature/map-search-and-details`

Deliverables:

- Search buildings, rooms, facilities, and mapped destinations.
- Useful grouping, ranking, empty results, and keyboard selection.
- Building, room, facility, entrance, and relevant event detail panels.
- Selecting a result focuses the correct outdoor position or building floor.
- Safe handling of missing, renamed, archived, or unpublished locations.

Definition of Done:

- A guest or student can find and inspect any published navigable destination without knowing its exact spelling.

## C4 — Student route planning and navigation presentation

**Status:** `BLOCKED` by Gate G3
**Branch:** `feature/student-navigation`

Deliverables:

- Origin/destination dialog with swap behavior.
- Standard, Accessible, and SOS modes.
- Animated route line/arrows with reduced-motion alternative.
- Indoor/outdoor route continuation and floor-change guidance.
- Turn-by-turn steps, distance, and estimated walking time based on graph data.
- No-route, disconnected, inaccessible, and stale-location handling.
- Mobile controls that do not hide essential map information.

Definition of Done:

- Guests and students can calculate and follow a valid route through the published campus, including multi-floor routes.

## C5 — Reports and report history

**Status:** `BLOCKED` by Gate G4 and C2
**Branch:** `feature/reports-workflow`

Deliverables:

- Student report submission from the map with location and optional image.
- Approved report categories and one or more optional JPG, PNG, or WEBP photos.
- Validation, upload progress, retry, success, and failure states.
- Student’s submitted-report history and statuses.
- Admin Pending, Under Review, In Progress, Resolved, and Rejected workflow.
- Search, filtering, internal notes, resolved-report archiving, history, and “view on map.”
- Correct permissions and private-image access.

Definition of Done:

- A student can submit and track a report, and an administrator can process it through resolution with an auditable history.

## C6 — Events and announcements

**Status:** `BLOCKED` by Gate G4 and C2
**Branch:** `feature/events-and-announcements`

Deliverables:

- Admin event create/edit/archive with title, description, schedule, location, and optional stalls.
- Published event markers and details on the map during the valid time window.
- Automatic expiration or inactive behavior.
- Date, category, and building filters plus direct navigation from an event to its mapped venue.
- Admin announcement create/edit/publish/archive.
- Home announcement summary and full relevant presentation.
- Optional mapped announcement locations and warning indicators.
- Apply and later remove approved temporary hallway, staircase, entrance, or exit closures without permanently changing the base graph.

Definition of Done:

- Admin changes persist, authorized public content appears in the correct places, and expired/unpublished content is hidden.

## C7 — Favorites, recent destinations, and minimal profile

**Status:** `BLOCKED` by C3, C4, and Gate G4
**Branch:** `feature/student-saved-places`

Deliverables:

- Save/remove favorite published destinations.
- Recent destinations derived from real navigation usage.
- Minimal student profile containing only approved account information, favorites, and report access.
- Signed-out prompts and safe cleanup when a location is no longer published.
- Empty, loading, and error states.

Definition of Done:

- Signed-in students retain saved places across sessions without turning the product into a Student Information System.

## C8 — Admin operations pages, settings, logs, and dashboard

**Status:** `BLOCKED` by A3, A6, A7, C5, and C6
**Branch:** `feature/admin-operations-dashboard`

Deliverables:

- Connect the approved Admin Dashboard statistics and weekly activity to real queries.
- Complete Reports, Events, Users, and Settings navigation and states.
- Campus publish/unpublish/archive controls use the approved service.
- Campus contact details, branding, logo/favicon, approved colors, default zoom/landing page, theme, and session preference persist correctly.
- Administrator profile, email, password, and profile-image settings use approved account flows.
- Selected map-data and report exports download correctly; full database export and restoration remain outside the capstone scope.
- Activity-log presentation supports relevant filters and readable details.
- Remove obsolete/dummy admin navigation only when replaced by the approved consolidated structure.

Definition of Done:

- Admin operational pages display truthful data and actions; no dummy page is presented as complete.

## C9 — Responsive, accessibility, theme, and visual consistency

**Status:** `BLOCKED` by C1–C8 for final pass; confirmed isolated regressions may be fixed earlier
**Branch:** `fix/public-operations-polish`

Deliverables:

- Mobile and desktop review for Home, Map, Help Center, auth, profile, reports, events, and admin operational pages.
- Keyboard navigation, focus states, labels, contrast, and readable validation.
- Light/dark mode consistency.
- Reduced-motion behavior.
- Loading, empty, error, success, and offline-state consistency.
- No emoji used as a substitute for functional interface icons.

Definition of Done:

- Core user journeys are usable with supported screen sizes and keyboard interaction, and the UI remains consistent without a broad redesign.

## C10 — PWA, offline behavior, and end-to-end user journeys

**Status:** `BLOCKED` by Gate G5
**Branch:** `test/pwa-and-critical-journeys`

Deliverables:

- Verify installability, manifest, service worker, update behavior, and safe cache invalidation.
- Cache the last valid published campus for approved offline use.
- Clearly disable or queue unsupported writes while offline.
- Playwright tests for critical guest, student, and administrator journeys.
- Verify login, map loading, search, navigation, report submission, event visibility, campus editing, save, and publish flows.
- Document unsupported offline actions and test limitations.

Definition of Done:

- The PWA installs and handles online/offline transitions safely.
- Critical user journeys pass in the release-candidate environment.

---

# 10. Initial Parallel Start

After this roadmap update is merged into `main`, the first three assignments are:

| Developer | Package | Branch | May start? |
| --- | --- | --- | --- |
| Developer 1 | A1 — Database types, Storage, and RLS baseline | `feature/database-types-and-storage` | Yes |
| Developer 2 | B1 — Map Builder baseline audit and regression protection | `test/map-builder-baseline` | Yes |
| Developer 3 | C1 — Public/student shell, Home, and Help Center completion | `feature/public-shell-and-help` | Yes |

These first packages are intentionally non-overlapping. Before work begins, each developer must inspect expected files and report any unexpected shared-file overlap.

When a developer finishes a package:

1. Push the branch and open a Pull Request.
2. Do not merge without review.
3. After merge, pull latest `main`.
4. Check the next package’s status and named dependencies.
5. Start it if `READY`; otherwise assist with review/testing or wait for the dependency.

---

# 11. Recommended Merge Order at Shared Gates

Independent Pull Requests may be reviewed in any order, but use this merge order when contracts overlap:

1. Database migration, generated types, and shared service contract.
2. Pure logic and tests.
3. Admin authoring integration.
4. Public/student consumption.
5. Operational modules.
6. Cross-system polish and end-to-end tests.

After a shared contract merges, active dependent branches must update from `main` and rerun their build/tests before review.

---

# 12. Full-System Completion Checklist

PLV NaviSync is feature-complete only when all of the following are verified:

## Platform and security

- Authentication, registration, verification, reset, sessions, logout, roles, and active-state enforcement work.
- Administrator user management is protected.
- Supabase types, migrations, RLS, Storage, and services are consistent.
- No frontend secret or service-role key exists.

## Campus administration

- An administrator can create, configure, save, reopen, validate, publish, unpublish, and archive a campus.
- Buildings, entrances, floors, rooms, elements, paths, accessibility, and emergency properties persist.
- Drafts remain private and the last valid publication remains safe.

## Map and navigation

- Public users load the active published campus.
- Search and location details use real published data.
- Standard, accessible, SOS, outdoor, indoor, and multi-floor navigation work.
- Invalid or disconnected graphs fail safely.

## Operations

- Reports, report history/images, events, announcements, favorites, settings, activity logs, and dashboard use real backend data.
- Admin and student permissions are enforced.

## Quality and release

- Desktop/mobile, keyboard, theme, reduced-motion, loading/error/empty/offline states are checked.
- PWA installation and cache/update behavior are verified.
- Unit, integration, and critical Playwright journeys pass or limitations are documented.
- Feature-based, ISO/IEC 25010, expert, UAT, security, performance, backup, and deployment checks are completed.

---

# 13. Evaluation and Release Sequence

After A9 and C10 are merged:

1. Freeze new feature development.
2. Run the complete regression suite.
3. Fix release-blocking defects using dedicated branches.
4. Prepare safe demonstration data.
5. Run feature-based test cases.
6. Run ISO/IEC 25010 evaluation.
7. Conduct expert testing and UAT.
8. Verify backup, production configuration, PWA, security, and performance.
9. Update final documentation.
10. Tag or record the release candidate used for the defense.

---

# 14. AI Task Execution Rule

Every coding session must begin by reading:

```text
docs/00_PROJECT_CONTEXT.md
docs/01_SYSTEM_FEATURES.md
docs/02_SYSTEM_ARCHITECTURE.md
docs/03_DATABASE_SUPABASE.md
docs/04_TEAM_RULES.md
docs/05_FREEBUFF_RULES.md
docs/06_IMPLEMENTATION_ORDER.md
CURRENT_IMPLEMENTATION.md
the assigned docs/progress/DEVELOPER_<number>_PROGRESS.md file
```

Then it must:

1. Confirm the assigned package ID, branch, prerequisites, and goal.
2. Inspect the current implementation before proposing changes.
3. State expected files and warn about shared-file overlap.
4. Implement only the assigned package.
5. Preserve working behavior and frozen scope.
6. Run the build, relevant tests, and listed manual checks.
7. Update only the assigned developer's progress checklist after the required tests pass.
8. Report changed files, database impact, checks, risks, and remaining work.
9. Stop after the package report so the developer can inspect the diff.
