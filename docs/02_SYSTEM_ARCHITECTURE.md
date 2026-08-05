# PLV NaviSync

# System Architecture

**Version:** 2.2
**Status:** Frozen Technical Architecture
**Purpose:** Implementation guide for the development team, Freebuff, and Codex.

If code conflicts with this document, stop and review the conflict before changing the architecture. Do not restructure the project solely to match a generic template.

---

# 1. Actual Technology Stack

PLV NaviSync is an existing client-side single-page application.

| Concern | Technology |
|---|---|
| Frontend framework | React 18 |
| Build tool | Vite 6 |
| Language | TypeScript |
| Routing | React Router 7 |
| Styling | Tailwind CSS 4 and existing CSS theme tokens |
| Animations | Motion |
| Icons | Lucide React |
| Backend platform | Supabase |
| Database | PostgreSQL through Supabase |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Testing | Vitest, Testing Library, and future Playwright E2E tests |
| Campus map | Custom SVG renderer |
| Map Builder | Existing custom React/SVG Map Builder |
| Pathfinding | Existing custom A* outdoor, indoor, and combined engines |
| Deployment | Vercel or another Vite-compatible static host |
| Version control | Git and GitHub |

The project is **not Next.js**. Do not introduce Next.js, the Next.js App Router, or server components.

The active shared UI system is primarily located under:

```text
src/components/ui/
```

Do not replace it with a new UI framework. Existing Radix/shadcn-style files under `src/app/components/ui/` must be treated as legacy or selectively used only when already imported.

---

# 2. Architecture Goals

The architecture must:

- Preserve the working frontend and Map Builder.
- Replace mock and local-only persistence with Supabase module by module.
- Keep UI, domain logic, data access, and database concerns separate.
- Allow three developers to work concurrently with minimal conflicts.
- Reuse existing components, hooks, types, and services.
- Avoid duplicate pages, editors, services, and data models.
- Keep the public map synchronized with the latest published campus version.
- Support multiple PLV campuses.
- Remain testable, responsive, accessible, and maintainable.

---

# 3. High-Level Runtime Architecture

## Verified implementation checkpoint — August 5, 2026

The following foundation is already implemented and manually verified:

- The application connects to Supabase through the single browser client.
- Administrator and student login use `supabase.auth.signInWithPassword()`.
- Sessions restore after refresh.
- Logout calls Supabase sign-out.
- Profiles enforce `admin` and `student` roles plus active-account checks.
- Admin and student route protection works without redirect loops.
- Public guest routes remain accessible.
- Demo Administrator and Demo Student options only autofill the login form; normal Supabase authentication is still required.

The next foundation work is to generate schema-derived TypeScript types, verify Storage buckets and policies, and complete the remaining account lifecycle.

```text
React Pages and Components
          ↓
Feature Hooks / Context
          ↓
Typed Service Layer
          ↓
Supabase JavaScript Client
          ↓
Supabase Auth / PostgreSQL / Storage
```

The frontend may also call pure domain functions for pathfinding and validation:

```text
Map or Map Builder
        ↓
Pathfinding / Validation Libraries
        ↓
Typed Campus and Navigation Data
```

## Required rule

Page and visual components must not contain raw Supabase table queries.

Correct:

```text
Page
  → service
  → Supabase client
```

Incorrect:

```text
Page
  → supabase.from(...)
```

The only exception is a dedicated provider or infrastructure module explicitly responsible for session initialization.

---

# 4. Existing Project Structure Is Retained

The project will retain its current Vite structure.

```text
src/
├── app/
│   ├── App.tsx
│   └── routes.tsx
├── components/
│   ├── layout/
│   ├── map/
│   ├── map-builder/
│   ├── map-builder-v2/
│   └── ui/
├── config/
├── contexts/
├── data/
├── hooks/
├── lib/
├── pages/
├── services/
├── styles/
├── types/
├── main.tsx
└── test-setup.ts

supabase/
├── migrations/
└── archive/

docs/
public/
```

Do not reorganize the application into generic `app/`, `features/`, or Next.js route folders during the capstone implementation. A major restructuring would add risk without improving the finished product.

---

# 5. Folder Responsibilities

## `src/app/`

Owns the application shell and route registration.

Important files:

- `App.tsx`
- `routes.tsx`

Rules:

- Route changes require team review.
- Root providers are registered in `App.tsx`.
- Pages should remain lazy-loaded where currently supported.
- Do not place feature business logic here.

## `src/components/layout/`

Owns public and administrator layouts.

Includes:

- `PublicLayout`
- `AdminLayout`
- `Navbar`
- `AdminSidebar`
- `Footer`
- `MobileBottomNav`
- `ScrollToTop`

Changes affect many pages and require careful regression testing.

## `src/components/ui/`

The active reusable design system.

Includes shared buttons, dialogs, fields, cards, loading states, search, typography helpers, and feedback components.

Rules:

- Reuse before creating new components.
- Shared component API changes require review.
- Do not put feature-specific data access inside shared UI components.
- Additive changes are preferred over breaking refactors.

## `src/components/map/`

Owns public map-specific presentational components.

Examples:

- Building information
- Building selection
- Mobile building sheet
- Event popup
- Report modal
- Sign-in prompt
- QR sharing once implemented

These components receive typed data and callbacks. They must not own Supabase queries.

## `src/components/map-builder/`

Owns the active Map Builder.

Includes:

- Campus management
- Campus editor
- Canvas
- Floor editor
- Hierarchy and properties panels
- Navigation tools
- Accessibility tools
- Emergency tools
- Event tools
- Validation and publishing interfaces
- Undo/redo and editor controls

This is the only active Map Builder implementation.

## `src/components/map-builder-v2/`

Legacy experimental implementation.

Rules:

- Do not add features to this folder.
- Do not import it into active routes.
- Remove it only through a dedicated cleanup task after confirming no imports remain.

## `src/pages/`

Owns route-level orchestration.

Pages may:

- Load data through services or approved hooks
- Manage page state
- Compose components
- Trigger navigation
- Display loading, error, empty, and success states

Pages may not:

- Contain raw SQL
- Bypass the service layer
- Duplicate mock datasets after a module is connected
- Reimplement shared domain logic

## `src/services/`

Owns all Supabase-facing data operations.

Required service responsibilities:

- Typed reads and writes
- Pagination and filtering
- Cross-table operations
- Structured error conversion
- Storage operations through a storage service
- Transaction-safe calls to database functions
- Compatibility with generated Supabase types

The existing generic CRUD abstraction may be retained where it remains clear and type-safe. Specialized workflows such as publishing, report status history, or user administration must use dedicated service methods.

## `src/lib/`

Owns framework-light infrastructure and domain logic.

Important areas:

- Supabase client initialization
- Pathfinding
- Map data conversion
- Campus helpers
- Validation helpers
- General utility functions

Rules:

- Pure pathfinding and validation functions should not perform UI side effects.
- `src/lib/supabase.ts` is the only browser Supabase client.
- Remove or stop exporting the duplicate `src/services/supabase.ts` through a reviewed cleanup task.

## `src/contexts/`

Owns truly shared application state.

The current `CampusDataContext` is a bridge between Map Builder publishing and public consumption. During Supabase migration, it should become a cache/provider over backend data rather than a separate permanent source of truth.

Add an authentication provider only if it simplifies session and profile access across the app.

Avoid creating a context for every feature.

## `src/hooks/`

Owns reusable stateful behavior.

Hooks may call services, but presentational shared hooks must not silently change unrelated data.

Existing hooks should be reused where practical.

## `src/data/`

Contains temporary seed and fallback data.

Rules:

- Existing mock data remains only while its module has not migrated.
- Once a module is connected and verified, its production pages must stop reading mock data.
- Do not delete all mock data at once.
- Test fixtures should eventually move to test-specific locations.

## `src/types/`

Owns shared public TypeScript contracts.

Generated Supabase database types should be stored in a dedicated generated file and not manually edited.

Map Builder authoring types may remain close to the Map Builder when they are editor-specific.

## `src/config/`

Owns stable constants, environment validation, route labels, and animation tokens.

Shared constant changes require review because they can affect every module.

## `supabase/`

Owns executable backend history.

```text
supabase/
├── migrations/
│   ├── 001_create_plv_navisync_schema.sql
│   └── future_numbered_migrations.sql
└── archive/
    └── 001_initial_schema_legacy.sql
```

Never place frontend code here.

---

# 6. Core Module Boundaries and Task Ownership

The architecture is split into three approximately balanced responsibility areas. Each developer has a complete workstream and an ordered queue of feature packages, while branches and ownership remain task-based and transferable.

Developer 1 is the primary owner of Area A, Developer 2 of Area B, and Developer 3 of Area C. No developer is described as the main developer. All three are responsible for completing, testing, documenting, and submitting their assigned packages for peer review.

Developer 1 normally coordinates shared backend contracts, migration numbering, generated database types, and dependency-aware merge sequencing because Area A defines contracts consumed by Areas B and C. This is a coordination responsibility, not authority over the other developers or permanent ownership of the whole project.

Any developer may implement or continue work in another area when the current owner is unavailable, provided the handoff rules in `04_TEAM_RULES.md` are followed and only one active implementation exists.

Every task uses a new short-lived branch from the latest `main`, such as:

```text
feature/generate-database-types
feature/campus-crud
feature/report-submission
fix/map-selection
```

## Area A — Identity, Administration, and Backend Foundation

**Primary developer:** Developer 1

Developer 1 normally coordinates the shared contracts in this area because changes here affect the editor and public-facing modules.

Responsibilities:

- Supabase connection
- Authentication and session restoration
- Profiles and user management
- Role-based route guards
- System settings
- Shared services and generated database types
- Storage infrastructure
- Backend error contracts
- Cross-module integration

Primary files and folders:

```text
src/lib/supabase.ts
src/services/
src/contexts/ authentication-related files
src/hooks/useAdminAuth.ts
src/hooks/useStudentAuth.ts
src/pages/AdminLoginPage.tsx
src/pages/RegistrationPage.tsx
src/pages/AdminUsersPage.tsx
src/pages/AdminSettingsPage.tsx
src/pages/StudentProfilePage.tsx
src/pages/StudentSettingsPage.tsx
supabase/
```

## Area B — Map Builder, Campus Structure, and Navigation

Responsibilities:

- Campus management
- Buildings and floors
- Map elements
- Active Map Builder
- Validation engine
- Draft and publish workflow UI
- Public campus map
- Smart search and directory integration
- Outdoor, indoor, and combined pathfinding
- Accessibility and emergency routing

Primary files and folders:

```text
src/components/map-builder/
src/components/map/
src/pages/AdminMapBuilderPage.tsx
src/pages/CampusMapPage.tsx
src/pages/BuildingsPage.tsx
src/pages/BuildingDetailsPage.tsx
src/lib/pathfinding.ts
src/lib/indoorPathfinding.ts
src/lib/combinedPathfinding.ts
src/lib/mapDataAdapter.ts
src/lib/campusHelpers.ts
```

Contributors may receive isolated tasks in this area. They must consume approved service and schema contracts and may not create independent database changes.

## Area C — Operations and Public Content

Responsibilities:

- Dashboard
- Reports
- Events
- Announcements
- Student report history
- Favorites and related student pages
- Operational statistics
- Activity presentation
- Public event and announcement interfaces

Primary files:

```text
src/pages/AdminDashboardPage.tsx
src/pages/AdminReportsPage.tsx
src/pages/AdminEventsPage.tsx
src/pages/AdminAnnouncementsPage.tsx
src/pages/AnnouncementsPage.tsx
src/pages/StudentReportsPage.tsx
src/pages/StudentFavoritesPage.tsx
src/components/map/EventPopup.tsx
src/components/map/ReportModal.tsx
```

Contributors may receive isolated tasks after the required service contract is merged. Pages must not query Supabase directly.

---

# 7. Shared-Core Files

The following files are shared and require coordination before modification:

```text
src/app/App.tsx
src/app/routes.tsx
src/main.tsx
src/contexts/CampusDataContext.tsx
src/lib/supabase.ts
src/lib/utils.ts
src/config/constants.ts
src/config/animation.ts
src/styles/
src/components/ui/
src/types/
package.json
pnpm-lock.yaml
vite.config.ts
supabase/migrations/
```

Rules:

1. Announce the intended shared-core change.
2. Assign one developer to make it.
3. Merge it early.
4. All developers update their branches afterward.
5. Never let separate AI sessions refactor the same shared file concurrently.

---

# 8. Module Communication

Dependencies flow as follows:

```text
Page or Route
    ↓
Feature Component / Hook
    ↓
Service or Pure Domain Library
    ↓
Supabase or Pathfinding Input
```

## Examples

### Public campus map

```text
CampusMapPage
    ↓
campus/map-version/event services
    ↓
published campus snapshot
    ↓
map adapter and pathfinding
    ↓
SVG route rendering
```

### Report submission

```text
ReportModal or StudentReportsPage
    ↓
reportService
    ↓
Storage upload when present
    ↓
reports + report_images
    ↓
report history workflow
```

### Map publishing

```text
AdminMapBuilderPage
    ↓
validationService and pure validation engine
    ↓
mapVersionService publish operation
    ↓
atomic database publishing function
    ↓
public CampusDataContext refresh
```

### Dashboard

```text
AdminDashboardPage
    ↓
dashboard/aggregation services
    ↓
real database counts and activity records
```

---

# 9. State Management

Use the smallest appropriate state mechanism.

## Local component state

Use for:

- Dialog visibility
- Form input
- Editor tool selection
- Temporary UI filters
- Current map interaction

## Feature hooks

Use for:

- Reusable loading and mutation flows
- Search behavior
- CRUD list behavior
- Debounced queries
- Undo/redo

## Context

Use only for:

- Authenticated session and profile when introduced
- Published campus data cache where multiple public pages require it
- Theme if the existing hook depends on context

## Supabase

Supabase is the persistent source of truth.

Local storage may remain for:

- Theme
- Dismissed tutorials
- Non-sensitive interface preferences
- Temporary recoverable editor backup if clearly separated from server drafts

Local storage must not remain the authoritative store for campuses, users, reports, events, announcements, or settings after migration.

---

# 10. Authentication and Authorization

## Authentication

Use Supabase email/password authentication.

Guests do not authenticate.

Students and administrators authenticate through Supabase Auth.

## Roles

Application roles:

- `student`
- `admin`

Guest is a public unauthenticated state, not a database role.

## Session flow

```text
Application starts
    ↓
Supabase restores session
    ↓
Profile is loaded
    ↓
Inactive account check
    ↓
Role-based UI and route access
```

## Route rules

Public:

- Landing page
- Campus map
- Buildings and location information
- Published events and announcements
- Help content

Authenticated student:

- Profile
- Favorites
- Submit report
- My reports
- Student settings

Administrator:

- Dashboard
- Map Builder
- User management
- Report management
- Event and announcement management
- Settings and publishing

Frontend guards improve UX but are not security boundaries. Supabase RLS enforces backend permissions.

---

# 11. Backend and Service Contracts

Every service should return a predictable result or throw a structured application error.

Recommended pattern:

```ts
type ServiceErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  cause?: unknown;
}
```

Rules:

- Services must not show toasts.
- Services must not navigate.
- Pages or hooks decide how errors are displayed.
- Database row types and UI models should be mapped explicitly when shapes differ.
- No `any` for persistent domain data.
- Cross-table publishing and history workflows should use database functions where atomicity matters.

---

# 12. Campus Data and Publishing Architecture

The Map Builder and public map must not maintain separate permanent campus models.

## Authoring

Administrators edit a typed campus model in the Map Builder.

Drafts are persisted to Supabase.

## Validation

The validation engine checks:

- Required campus information
- Building and floor hierarchy
- Searchable destination data
- Graph connectivity
- Building entrances
- Floor transitions
- Accessibility consistency
- Emergency exits and safe edges
- Invalid references and duplicate identifiers

## Publishing

Publishing creates an immutable campus version snapshot and updates the campus's latest published version.

## Public consumption

Guests and students read only the latest published snapshot plus active events and announcements.

This provides a consistent public map even while administrators are editing a new draft.

---

# 13. Pathfinding Architecture

Existing algorithms are retained:

```text
src/lib/pathfinding.ts
src/lib/indoorPathfinding.ts
src/lib/combinedPathfinding.ts
```

Responsibilities:

- Outdoor route calculation
- Indoor floor route calculation
- Multi-floor and indoor/outdoor route stitching
- Distance calculation
- Estimated travel time
- Step generation
- Accessibility filtering
- Emergency-safe filtering

Rules:

- Remove hardcoded building graph assumptions gradually.
- Published campus nodes and edges become the routing input.
- Pathfinding functions remain pure where possible.
- No live GPS or live indoor positioning is required.
- The starting point is selected by the user or inferred from a chosen mapped entrance/location.
- Route failures return a safe, explainable result instead of crashing.

---

# 14. Search Architecture

Search covers published:

- Campuses
- Buildings
- Floors where useful
- Rooms and facilities represented as map elements
- Events and event locations
- Landmarks and accessibility facilities

Search behavior:

- Case-insensitive
- Partial match
- Deduplicated
- Limited and ranked
- Debounced
- Restricted to visible, searchable, non-archived, published data

Search results include enough identifiers to center the map, open details, and start navigation.

A dedicated search service may aggregate multiple tables or use a reviewed PostgreSQL function/view.

---

# 15. Storage Architecture

Storage buckets and policies are defined in `03_DATABASE_SUPABASE.md`.

The application stores database paths, not permanent signed URLs.

All uploads must validate:

- MIME type
- Extension
- Maximum size
- Ownership
- Related record
- Upload result before database mutation completion

If database creation fails after upload, the service should attempt to clean up the uploaded file.

---

# 16. Error, Loading, and Empty States

Every data-driven screen must support:

- Initial loading state
- Mutation/loading state
- Empty state
- Recoverable error state
- Unauthorized or signed-out state
- Success confirmation
- Retry when appropriate

A broken backend request must not produce an empty white screen or unhandled exception.

Use the existing shared UI components for these states.

---

# 17. Performance Rules

- Keep route-level lazy loading.
- Debounce search.
- Avoid fetching full campus authoring data when only summary cards are needed.
- Load only the selected campus/floor where practical.
- Use indexed database filters.
- Memoize expensive map calculations when inputs are unchanged.
- Avoid rerendering the full map for unrelated panel state.
- Compress uploaded images before or during upload when practical.
- Do not load archived or draft data into public pages.
- Test the Map Builder with realistically sized campus data.

---

# 18. Testing Architecture

## Unit tests

Cover:

- Pathfinding
- Validation rules
- Campus sanitization
- Data adapters
- Service mapping helpers
- Permission helpers

## Integration tests

Cover:

- Services against Supabase development data
- Authentication and profile creation
- Report and history workflows
- Draft save and publish
- Public published-data reads
- RLS policies

## End-to-end tests

Use Playwright for:

- Guest navigation
- Student login and report submission
- Administrator login
- Campus draft save
- Validation failure
- Successful publishing
- Event and announcement publishing
- Report review and resolution

Tests must not depend on execution order and must manage their own data.

---

# 19. Cleanup Rules

The following are known cleanup targets, but they must be handled through isolated tasks:

- Remove `src/components/map-builder-v2/` after confirming it has no active imports.
- Remove duplicate `src/services/supabase.ts` after all imports use `src/lib/supabase.ts`.
- Remove unused shadcn-style files and unused dependencies only after an import audit.
- Remove root-level temporary fix scripts after verifying they are no longer needed.
- Remove page-local mock arrays after their services are connected.
- Fix missing announcement routes.
- Rename the package from the generated placeholder name.
- Add type-check, lint, test, and CI scripts.

Do not combine cleanup with feature implementation unless necessary.

---

# 20. Architecture Definition of Done

The architecture is correctly implemented when:

- The application remains React + Vite and builds successfully.
- Supabase is the persistent source of truth.
- Pages do not contain direct table queries.
- Services are typed and reusable.
- Authentication and RLS protect restricted actions.
- Draft maps remain private.
- Published maps are consistent and publicly readable.
- Public navigation uses published map data rather than hardcoded legacy graphs.
- Events, announcements, reports, users, and dashboard values persist.
- Duplicate active implementations are removed safely.
- Shared files are changed through team review.
- Critical workflows have automated tests.
- The system remains responsive and accessible.
