# PLV NaviSync

# Database & Supabase Architecture

**Version:** 2.1
**Status:** Frozen Backend Specification
**Primary source of truth:** This document defines the intended backend design.
**Generated SQL source of truth after implementation:** Once approved, the SQL migrations generated from this document become the executable database source of truth. If SQL and this document conflict, stop implementation and update both through a reviewed migration.

---

# 1. Purpose

This document defines the complete backend architecture for PLV NaviSync.

It is written for the development team and AI coding assistants such as Freebuff and Codex. It defines:

- Supabase project configuration
- PostgreSQL database structure
- Supabase Authentication
- User roles and permissions
- Row Level Security
- Storage buckets
- Multi-campus relationships
- Map authoring and publishing
- Navigation graph persistence
- Events and announcements
- Campus issue reporting
- Activity logging
- Frontend-to-database ownership

Do not create or modify tables, policies, storage buckets, or backend contracts without updating this document and creating a reviewed migration.

---

# 2. Source-of-Truth Rules

## 2.1 Design source of truth

This document is the authoritative backend design. The Supabase project has been created and connected, so implemented behavior must also remain consistent with the applied migrations.

## 2.2 Executable source of truth

After the schema is implemented, files inside:

```text
supabase/migrations/
```

are the executable schema history.

The database must never be changed manually in production without a migration.

## 2.3 Migration baseline

The previous unchecked file:

```text
supabase/migrations/001_initial_schema.sql
```

must not be run. It has been moved to:

```text
supabase/archive/001_initial_schema_legacy.sql
```

The reviewed initial migration is:

```text
supabase/migrations/001_create_plv_navisync_schema.sql
```

Future schema changes must use new numbered migrations. Do not edit the applied shared baseline migration.

## 2.4 No schema drift

Whenever the backend changes:

1. Update this document.
2. Add a new numbered SQL migration.
3. Update generated TypeScript database types.
4. Update affected services.
5. Add or update tests.

## 2.5 Verified backend checkpoint — August 6, 2026

Verified:

- Supabase project and frontend environment connection are configured.
- Real administrator and student accounts authenticate through Supabase Auth.
- `profiles` records support `admin` and `student` roles and active-account checks.
- Session restoration, logout, and role-based route protection work.
- Demo Administrator and Demo Student accounts were provisioned through a server-side local script.
- `.env.local` and `.env.demo.local` are ignored by Git.
- The existing live schema is recorded in migration history by the assertion-only `20260805160720_baseline_existing_schema.sql` marker without replaying the applied `001` schema.
- Live database types are generated at `src/types/database.generated.ts`, and the single browser client is typed with `Database`.
- All six Storage buckets enforce the documented MIME allowlist and file-size limits.
- Function execution grants are restricted to reviewed roles; intentionally public RLS helpers are documented in the corrective migration.
- Repeatable guest, student, and administrator RLS and Storage checks pass with controlled, self-cleaning fixtures.
- Student registration now calls Supabase Auth with validated name, email, password, and student-number metadata; the trigger preserves only reviewed profile fields and always hardcodes the `student` role.
- Email-verification pending/resend/callback states and forgot/reset-password states are implemented at dedicated routes.
- The hosted project has public email signup enabled, email confirmation required, and the email provider enabled.

Still requiring verification or implementation:

- Persistent CRUD and service integration for feature modules beyond the A4 campus lifecycle.
- Full cross-system RLS verification after the remaining feature packages are connected.
- Supabase Auth leaked-password protection must be enabled in the project dashboard before production release.
- Each local/preview/production origin must be added to Supabase Auth Redirect URLs, and production SMTP must be configured before real student onboarding.

---

# 3. Backend Technology

| Concern | Technology |
|---|---|
| Backend platform | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row Level Security |
| File storage | Supabase Storage |
| Client | `@supabase/supabase-js` |
| Frontend | React + Vite + TypeScript |
| Hosting | Vercel or equivalent static hosting |
| API | Supabase generated APIs through service modules |

The React UI must not query tables directly from page components. Database access must pass through typed service modules under `src/services/`.

---

# 4. Core Design Principles

- Use UUID primary keys.
- Use foreign keys for all relationships.
- Support multiple campuses.
- Use UTC timestamps.
- Prefer archiving over destructive deletion.
- Keep draft data private.
- Expose only published campus data to guests and students.
- Enforce permissions through RLS, not only through the frontend.
- Keep navigation graph data separate from display geometry.
- Store uploaded files in Supabase Storage, not as database blobs.
- Keep audit records for important administrator actions.
- Generate TypeScript types from the implemented Supabase schema.
- Do not use mock data after a module is connected to Supabase.

---

# 5. User and Access Model

## 5.1 Guest

A guest is not authenticated and has no profile row.

Guests may:

- Read active campuses
- Read published campus maps
- Read published buildings and directory information
- Read active events
- Read active announcements
- Use public navigation and search

Guests may not write data.

## 5.2 Student

A student is authenticated through Supabase Auth and has a `profiles` row with `role = 'student'`.

Students may:

- Use all guest features
- Read and update their own profile
- Submit issue reports
- View their own reports and report history
- Add or remove their own favorites

Students may not modify campus data or administrative records.

## 5.3 Administrator

An administrator is authenticated and has `role = 'admin'`.

Administrators may:

- Manage campuses, buildings, floors, and map elements
- Manage navigation graphs
- Manage events and announcements
- Review and update reports
- Validate and publish maps
- Manage users and settings
- Read activity logs

Role changes must not be allowed through normal self-profile updates.

---

# 6. Multi-Campus Model

PLV NaviSync supports multiple campuses, including current and future PLV locations.

The hierarchy is:

```text
PLV NaviSync
└── campuses
    └── buildings
        └── floors
            └── map_elements
```

Each campus has its own:

- Overview map dimensions
- Buildings
- Outdoor navigation graph
- Indoor floor plans
- Accessibility data
- Emergency data
- Events and announcements
- Draft and published versions

Only one campus may be marked as the default campus, but multiple campuses may be active and published.

---

# 7. Official Table Inventory

## Identity

- `profiles`

## Campus authoring and publication

- `campuses`
- `campus_versions`
- `buildings`
- `floors`
- `map_elements`
- `validation_runs`
- `validation_issues`

## Navigation

- `navigation_nodes`
- `navigation_edges`

## Events and announcements

- `events`
- `event_locations`
- `announcements`
- `announcement_locations`

## Reporting and student features

- `reports`
- `report_images`
- `report_history`
- `favorites`

## Administration

- `system_settings`
- `activity_logs`

Do not introduce separate `accessibility_routes` or `emergency_routes` tables. Accessibility and emergency behavior are represented by typed nodes, edges, and map elements. This avoids duplicate route systems.

---

# 8. Shared Column Standards

Most application tables use:

| Column | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key, generated by `gen_random_uuid()` |
| `created_at` | TIMESTAMPTZ | Defaults to `now()` |
| `updated_at` | TIMESTAMPTZ | Defaults to `now()` and updated by trigger |
| `archived_at` | TIMESTAMPTZ | Nullable; used for soft deletion where applicable |

Use `created_by` and `updated_by` UUID references for administrator-owned records when useful.

All time values are stored in UTC and formatted to Asia/Manila in the frontend.

---

# 9. Table Specifications

## 9.1 `profiles`

**Purpose:** Stores application profile and authorization metadata linked one-to-one with `auth.users`.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK and FK to `auth.users(id)` |
| `role` | TEXT | Yes | `student` or `admin` |
| `first_name` | TEXT | Yes | |
| `last_name` | TEXT | Yes | |
| `email` | TEXT | Yes | Unique; synchronized from Auth |
| `student_number` | TEXT | No | Unique when present |
| `department` | TEXT | No | |
| `avatar_path` | TEXT | No | Storage path, not public URL |
| `is_active` | BOOLEAN | Yes | Default `true` |
| `last_login_at` | TIMESTAMPTZ | No | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |

**Constraints**

- `role IN ('student', 'admin')`
- Guests do not have profile records.
- Students cannot update `role`, `is_active`, or another user's profile.

**Used by**

- Authentication
- Student profile
- Admin user management
- Reports
- Favorites
- Activity logs

---

## 9.2 `campuses`

**Purpose:** Stores each PLV campus and its map-level configuration.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `name` | TEXT | Yes | |
| `code` | TEXT | Yes | Unique |
| `description` | TEXT | No | |
| `address` | TEXT | No | |
| `city` | TEXT | No | |
| `province` | TEXT | No | |
| `postal_code` | TEXT | No | |
| `latitude` | DOUBLE PRECISION | No | General campus coordinate only |
| `longitude` | DOUBLE PRECISION | No | |
| `logo_path` | TEXT | No | |
| `overview_image_path` | TEXT | No | |
| `theme_color` | TEXT | Yes | Six-digit hex color |
| `canvas_width` | INTEGER | Yes | Positive |
| `canvas_height` | INTEGER | Yes | Positive |
| `canvas_configured` | BOOLEAN | Yes | Persists completion even when default dimensions are retained |
| `map_scale_m_per_unit` | NUMERIC | Yes | Used for route distance and ETA |
| `is_default` | BOOLEAN | Yes | Default `false` |
| `status` | TEXT | Yes | `draft`, `published`, `archived` |
| `latest_published_version_id` | UUID | No | FK added after `campus_versions` |
| `created_by` | UUID | No | FK to `profiles(id)` |
| `updated_by` | UUID | No | FK to `profiles(id)` |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Constraints**

- `status IN ('draft', 'published', 'archived')`
- At most one active campus may be `is_default = true`.
- Public users only read published, non-archived campuses.
- New campuses always begin as private drafts; restoring an archive also returns it to a private draft.
- `draft` plus a non-null published-version pointer is presented as `unpublished` by the application contract.

---

## 9.3 `campus_versions`

**Purpose:** Stores immutable draft and published campus snapshots for safe publishing and version history.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | FK to `campuses(id)` |
| `version_number` | INTEGER | Yes | Starts at 1 per campus |
| `state` | TEXT | Yes | `draft`, `published`, `superseded` |
| `snapshot` | JSONB | Yes | Complete sanitized campus authoring snapshot |
| `change_summary` | TEXT | No | |
| `validation_score` | NUMERIC | No | 0–100 |
| `created_by` | UUID | Yes | FK to `profiles(id)` |
| `published_by` | UUID | No | FK to `profiles(id)` |
| `created_at` | TIMESTAMPTZ | Yes | |
| `published_at` | TIMESTAMPTZ | No | |

**Rules**

- Published snapshots are immutable.
- Guests and students may read only the latest published snapshot.
- Draft snapshots are administrator-only.
- The live authoring tables (`buildings`, `floors`, `map_elements`, `navigation_nodes`, `navigation_edges`) are administrator-only and are **not** the public source of truth. Guests and students render map content from the latest published snapshot only, so partially published relational data is never exposed.
- Published snapshots must include `floor_plan_path` on each floor object so the storage read gate (`public.is_published_floor_plan`) can resolve published floor plans.
- Rollback is future scope, but older published versions are retained.
- Public map rendering should use the latest published snapshot to avoid partially published relational data.

This table supports the existing Map Builder data shape while normalized tables support management, search, analytics, and integrity checks.

---

## 9.4 `buildings`

**Purpose:** Stores buildings belonging to a campus.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | FK to `campuses(id)` |
| `name` | TEXT | Yes | |
| `code` | TEXT | Yes | Unique within campus |
| `description` | TEXT | No | Navigation-related only |
| `category` | TEXT | Yes | One of: `academic`, `administration`, `library`, `laboratory`, `sports`, `parking`, `facility`, `dormitory`, `other` |
| `image_path` | TEXT | No | |
| `operating_hours` | TEXT | No | |
| `contact_information` | TEXT | No | |
| `x` | DOUBLE PRECISION | Yes | Campus canvas coordinate |
| `y` | DOUBLE PRECISION | Yes | |
| `width` | DOUBLE PRECISION | Yes | Positive |
| `height` | DOUBLE PRECISION | Yes | Positive |
| `rotation` | DOUBLE PRECISION | Yes | Default 0 |
| `is_searchable` | BOOLEAN | Yes | Default true |
| `is_visible` | BOOLEAN | Yes | Default true |
| `is_accessible` | BOOLEAN | Yes | Default false |
| `created_by` | UUID | No | |
| `updated_by` | UUID | No | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Constraints**

- Unique `(campus_id, code)`
- `category` must be one of: `academic`, `administration`, `library`, `laboratory`, `sports`, `parking`, `facility`, `dormitory`, `other`
- Width and height must be positive.
- Archived buildings are excluded from public search and navigation.

---

## 9.5 `floors`

**Purpose:** Stores floor metadata and optional floor-plan background for each building.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `building_id` | UUID | Yes | FK to `buildings(id)` |
| `name` | TEXT | Yes | Example: Ground Floor |
| `floor_number` | INTEGER | Yes | Supports negative floors |
| `display_order` | INTEGER | Yes | |
| `floor_plan_path` | TEXT | No | Uploaded background |
| `canvas_width` | INTEGER | Yes | |
| `canvas_height` | INTEGER | Yes | |
| `map_scale_m_per_unit` | NUMERIC | No | Overrides campus scale |
| `is_visible` | BOOLEAN | Yes | Default true |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Constraints**

- Unique `(building_id, floor_number)`
- A publishable floor requires a floor-plan background under the frozen feature specification. The editor may still allow an incomplete draft floor before validation.

---

## 9.6 `map_elements`

**Purpose:** Stores all selectable visual and directory elements placed on campus or floor canvases.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | FK to `campuses(id)` |
| `building_id` | UUID | No | FK to `buildings(id)` |
| `floor_id` | UUID | No | FK to `floors(id)` |
| `parent_element_id` | UUID | No | Self-reference when needed |
| `element_type` | TEXT | Yes | See allowed types |
| `name` | TEXT | Yes | |
| `code` | TEXT | No | |
| `description` | TEXT | No | |
| `search_keywords` | TEXT[] | Yes | Default empty |
| `x` | DOUBLE PRECISION | Yes | |
| `y` | DOUBLE PRECISION | Yes | |
| `width` | DOUBLE PRECISION | No | |
| `height` | DOUBLE PRECISION | No | |
| `rotation` | DOUBLE PRECISION | Yes | Default 0 |
| `z_index` | INTEGER | Yes | Default 0; rendering order, higher values render above lower values |
| `geometry` | JSONB | No | Points/path/polygon data |
| `style` | JSONB | Yes | Default empty object |
| `metadata` | JSONB | Yes | Type-specific data |
| `is_accessible` | BOOLEAN | Yes | Default false |
| `is_emergency_asset` | BOOLEAN | Yes | Default false |
| `is_searchable` | BOOLEAN | Yes | Default true |
| `is_visible` | BOOLEAN | Yes | Default true |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Allowed element types**

- `room`
- `classroom`
- `laboratory`
- `office`
- `hallway`
- `wall`
- `door`
- `entrance`
- `exit`
- `stairs`
- `elevator`
- `ramp`
- `restroom`
- `clinic`
- `library`
- `canteen`
- `parking`
- `gate`
- `landmark`
- `assembly_area`
- `emergency_exit`
- `fire_extinguisher`
- `information_desk`
- `furniture`
- `custom`
- `tree`
- `bench`
- `lamp`
- `sign`
- `bike_rack`
- `garden`
- `window`
- `chair`
- `table`
- `fire_alarm`
- `fire_hydrant`
- `cctv`
- `security_post`

**Rules**

- A campus-level element may have no building or floor.
- A floor-level element must reference a building and floor.
- Type-specific properties belong in `metadata`.
- `z_index` controls rendering order in the Map Builder and published map; higher values render above lower values. No database index is created for this column.
- Search must ignore archived, invisible, or non-searchable elements.

---

## 9.7 `navigation_nodes`

**Purpose:** Stores points used by the A* pathfinding graph.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | |
| `building_id` | UUID | No | |
| `floor_id` | UUID | No | |
| `map_element_id` | UUID | No | Optional destination link |
| `node_type` | TEXT | Yes | |
| `name` | TEXT | No | |
| `x` | DOUBLE PRECISION | Yes | |
| `y` | DOUBLE PRECISION | Yes | |
| `is_accessible` | BOOLEAN | Yes | |
| `is_emergency_safe` | BOOLEAN | Yes | |
| `is_active` | BOOLEAN | Yes | |
| `metadata` | JSONB | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |

**Node types**

- `waypoint`
- `entrance`
- `destination`
- `stairs`
- `elevator`
- `ramp`
- `exit`
- `assembly_area`
- `floor_transition`

---

## 9.8 `navigation_edges`

**Purpose:** Stores graph connections between navigation nodes.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | |
| `from_node_id` | UUID | Yes | FK to `navigation_nodes(id)` |
| `to_node_id` | UUID | Yes | FK to `navigation_nodes(id)` |
| `distance_m` | NUMERIC | Yes | Measured physical distance; positive |
| `weight` | NUMERIC | Yes | A* routing cost multiplier; default 1; positive |
| `travel_time_seconds` | INTEGER | No | Optional calculated or manually overridden traversal estimate; non-negative when set |
| `edge_type` | TEXT | Yes | |
| `is_bidirectional` | BOOLEAN | Yes | Default true |
| `is_accessible` | BOOLEAN | Yes | |
| `is_emergency_safe` | BOOLEAN | Yes | |
| `is_temporarily_closed` | BOOLEAN | Yes | Default false |
| `closure_reason` | TEXT | No | |
| `metadata` | JSONB | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |

**Edge types**

- `walkway`
- `hallway`
- `stairs`
- `elevator`
- `ramp`
- `door`
- `crossing`
- `transition`

**Rules**

- `from_node_id` and `to_node_id` cannot be equal.
- Duplicate node pairs should be prevented.
- Accessible routing excludes edges where `is_accessible = false`.
- Emergency routing excludes unsafe or temporarily closed edges.

---

## 9.9 `events`

**Purpose:** Stores campus events and their public lifecycle.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | |
| `title` | TEXT | Yes | |
| `description` | TEXT | No | |
| `category` | TEXT | Yes | |
| `cover_image_path` | TEXT | No | |
| `starts_at` | TIMESTAMPTZ | Yes | |
| `ends_at` | TIMESTAMPTZ | Yes | |
| `status` | TEXT | Yes | `draft`, `published`, `archived` |
| `organizer` | TEXT | No | |
| `created_by` | UUID | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Derived public state**

- Upcoming: current time before `starts_at`
- Ongoing: between `starts_at` and `ends_at`
- Finished: after `ends_at`

**Public visibility**

A public event row is readable by guests and students only when all of these hold:

- `status = 'published'`
- `archived_at is null`
- The campus is published and not archived (`campus_is_published(campus_id)`)
- It is not required to be currently ongoing; upcoming and finished published events may still be retrieved and filtered by the frontend.

---

## 9.10 `event_locations`

**Purpose:** Links events to one or more mapped destinations or temporary map coordinates.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `event_id` | UUID | Yes | |
| `map_element_id` | UUID | No | |
| `label` | TEXT | Yes | |
| `x` | DOUBLE PRECISION | No | |
| `y` | DOUBLE PRECISION | No | |
| `metadata` | JSONB | Yes | Temporary booth/stall details |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |

At least a mapped element or coordinate pair must be present.

**Public visibility**

A public event location is readable by guests and students only when its parent event satisfies:

- `status = 'published'`
- `archived_at is null`
- The campus is published and not archived (`campus_is_published(campus_id)`)

---

## 9.11 `announcements`

**Purpose:** Stores navigation-related announcements and notices.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | No | Required when `audience_scope = 'campus'`; omitted for system-wide announcements |
| `audience_scope` | TEXT | Yes | `global` or `campus`; defaults to `global` |
| `title` | TEXT | Yes | |
| `content` | TEXT | Yes | |
| `category` | TEXT | Yes | One of: `general`, `event`, `emergency`, `maintenance`, `closure`, `relocation` |
| `priority` | TEXT | Yes | One of: `low`, `normal`, `high`, `urgent`; default `normal` |
| `status` | TEXT | Yes | `draft`, `published`, `archived` |
| `starts_at` | TIMESTAMPTZ | No | |
| `expires_at` | TIMESTAMPTZ | No | |
| `created_by` | UUID | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | Set when the announcement is archived |

**Allowed values**

- `category` is one of: `general`, `event`, `emergency`, `maintenance`, `closure`, `relocation`
- `priority` is one of: `low`, `normal`, `high`, `urgent` (default `normal`)
- `audience_scope` is `global` for system-wide notices or `campus` for campus-bound notices

**Public visibility**

A public announcement is readable by guests and students only when all of these hold:

- `status = 'published'`
- `archived_at is null`
- `audience_scope = 'global'`, or the campus is published and not archived for a campus-scoped notice
- `starts_at` is null or `starts_at <= now()`
- `expires_at` is null or `expires_at >= now()`

Global announcement text is intentionally independent of the campus/map publication lifecycle. Location mappings remain protected by the published-campus requirement so draft building, floor, element, and route data cannot leak.

---

## 9.12 `announcement_locations`

**Purpose:** Links an announcement to affected buildings, floors, elements, or route edges.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `announcement_id` | UUID | Yes | |
| `building_id` | UUID | No | |
| `floor_id` | UUID | No | |
| `map_element_id` | UUID | No | |
| `navigation_edge_id` | UUID | No | |
| `effect_type` | TEXT | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |

**Effect types**

- `information`
- `warning`
- `closure`
- `relocation`
- `maintenance`

A closure may set the referenced navigation edge as temporarily unavailable through controlled service logic.

**Public visibility**

A public announcement location is readable by guests and students only when its parent announcement satisfies:

- `status = 'published'`
- `archived_at is null`
- The campus is published and not archived (`campus_is_published(campus_id)`)
- `starts_at` is null or `starts_at <= now()`
- `expires_at` is null or `expires_at >= now()`

---

## 9.13 `reports`

**Purpose:** Stores authenticated student issue reports.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `reporter_id` | UUID | Yes | FK to profiles |
| `campus_id` | UUID | Yes | |
| `building_id` | UUID | No | |
| `floor_id` | UUID | No | |
| `map_element_id` | UUID | No | |
| `category` | TEXT | Yes | One of: `broken_equipment`, `damaged_facility`, `electrical_issue`, `water_leak`, `cleanliness`, `accessibility_concern`, `safety_concern`, `navigation_error`, `other` |
| `title` | TEXT | Yes | |
| `description` | TEXT | Yes | |
| `status` | TEXT | Yes | |
| `priority` | TEXT | Yes | One of: `low`, `normal`, `high`, `urgent`; default `normal` |
| `assigned_admin_id` | UUID | No | |
| `internal_notes` | TEXT | No | Admin-only |
| `resolution_notes` | TEXT | No | |
| `resolved_at` | TIMESTAMPTZ | No | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |
| `archived_at` | TIMESTAMPTZ | No | |

**Statuses**

- `pending`
- `under_review`
- `in_progress`
- `resolved`
- `rejected`

**Categories**

- `broken_equipment`
- `damaged_facility`
- `electrical_issue`
- `water_leak`
- `cleanliness`
- `accessibility_concern`
- `safety_concern`
- `navigation_error`
- `other`

**Priority**

- `low`, `normal`, `high`, `urgent` (default `normal`)

A report must reference a valid campus and at least one location target where possible.

---

## 9.14 `report_images`

**Purpose:** Stores metadata for report images uploaded to Storage.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `report_id` | UUID | Yes | |
| `storage_path` | TEXT | Yes | |
| `uploaded_by` | UUID | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |

---

## 9.15 `report_history`

**Purpose:** Stores immutable status and action history for reports.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `report_id` | UUID | Yes | |
| `action` | TEXT | Yes | |
| `old_status` | TEXT | No | |
| `new_status` | TEXT | No | |
| `note` | TEXT | No | |
| `performed_by` | UUID | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |

Students may read history for their own reports but may not create history rows directly.

---

## 9.16 `favorites`

**Purpose:** Stores student-saved mapped destinations.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `user_id` | UUID | Yes | |
| `campus_id` | UUID | Yes | |
| `building_id` | UUID | No | |
| `map_element_id` | UUID | No | |
| `created_at` | TIMESTAMPTZ | Yes | |

Only one of `building_id` or `map_element_id` should identify the favorite target.

Prevent duplicate favorites per user and target.

---

## 9.17 `validation_runs`

**Purpose:** Records each validation attempt before publishing.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | Yes | |
| `campus_version_id` | UUID | No | |
| `status` | TEXT | Yes | `passed`, `warning`, `failed` |
| `score` | NUMERIC | Yes | 0–100 |
| `errors_count` | INTEGER | Yes | |
| `warnings_count` | INTEGER | Yes | |
| `passed_count` | INTEGER | Yes | |
| `run_by` | UUID | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |

---

## 9.18 `validation_issues`

**Purpose:** Stores issues produced by a validation run.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `validation_run_id` | UUID | Yes | |
| `severity` | TEXT | Yes | `error`, `warning`, `info` |
| `rule_code` | TEXT | Yes | |
| `message` | TEXT | Yes | |
| `entity_type` | TEXT | No | |
| `entity_id` | UUID | No | |
| `suggested_resolution` | TEXT | No | |
| `created_at` | TIMESTAMPTZ | Yes | |

---

## 9.19 `system_settings`

**Purpose:** Stores configurable global or campus-specific settings.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `campus_id` | UUID | No | Null for global settings |
| `key` | TEXT | Yes | |
| `value` | JSONB | Yes | |
| `is_public` | BOOLEAN | Yes | Default false |
| `updated_by` | UUID | No | |
| `created_at` | TIMESTAMPTZ | Yes | |
| `updated_at` | TIMESTAMPTZ | Yes | |

Unique `(campus_id, key)` with separate handling for null campus IDs.

Sensitive secrets must never be stored here.

---

## 9.20 `activity_logs`

**Purpose:** Records important administrator and security-relevant actions.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | PK |
| `actor_id` | UUID | No | Null only for system action |
| `campus_id` | UUID | No | |
| `action` | TEXT | Yes | |
| `entity_type` | TEXT | No | |
| `entity_id` | UUID | No | |
| `metadata` | JSONB | Yes | |
| `created_at` | TIMESTAMPTZ | Yes | |

Activity logs are append-only and administrator-readable.

---

# 10. Relationship and Deletion Rules

- Campus archives cascade logically but should not physically delete operational history.
- Buildings and floors with dependent content should be archived.
- Draft version snapshots may be deleted only when they have never been published and are not referenced.
- Published versions are never modified or deleted through normal application functions.
- Navigation nodes may cascade-delete their connected edges only during controlled administrator editing.
- Reports and report history are preserved.
- Deleting an Auth user should not automatically erase report or activity history; use account deactivation where possible.
- Storage files should be removed only after the related database transaction succeeds.

---

# 11. Required Indexes

Create indexes for common filters and relationships, including:

- `profiles(role, is_active)`
- `campuses(status, is_default)`
- `buildings(campus_id, archived_at)`
- `buildings(campus_id, code)` unique
- `floors(building_id, floor_number)` unique
- `map_elements(campus_id, floor_id, element_type)`
- GIN index on `map_elements.search_keywords`
- `navigation_nodes(campus_id, floor_id)`
- `navigation_edges(campus_id, from_node_id, to_node_id)`
- `events(campus_id, status, starts_at, ends_at)`
- `announcements(campus_id, status, starts_at, expires_at)`
- `reports(reporter_id, status, created_at)`
- `reports(campus_id, status, created_at)`
- `favorites(user_id)`
- `validation_runs(campus_id, created_at)`
- `activity_logs(actor_id, created_at)`
- `campus_versions(campus_id, version_number)` unique

Use database search indexes only when actual query patterns require them. Avoid premature full-text complexity.

---

# 12. Supabase Storage Buckets

## `avatars`

- Private bucket
- Allowed: JPG, PNG, WEBP
- Maximum: 2 MB
- Users manage only their own folder: `{user_id}/...`
- Signed URLs for display

## `building-images`

- Public or signed-read bucket
- Allowed: JPG, PNG, WEBP
- Maximum: 5 MB
- Administrator write access

## `campus-images`

- Private bucket
- Allowed: JPG, PNG, WEBP
- Maximum: 5 MB
- Administrator write access
- Guests and students may read only an object referenced by a published, non-archived campus
- Administrators use short-lived signed URLs to preview draft assets

## `floor-plans`

- Private administrator-write bucket
- Public users receive controlled read access for **published** floor plans only
- Public read is gated by `public.is_published_floor_plan(path)`, which resolves the path inside the latest published `campus_versions.snapshot` — live floor rows are never read, so drafts cannot leak
- Allowed: JPG, PNG, WEBP
- Maximum: 15 MB
- Published snapshots must include `floor_plan_path` on each floor object so this gate can resolve published floor plans

## `report-images`

- Private bucket
- Allowed: JPG, PNG, WEBP
- Maximum: 8 MB per image
- Student uploader, report owner, and administrators may read according to policy

## `event-images`

- Public or signed-read bucket
- Allowed: JPG, PNG, WEBP
- Maximum: 5 MB
- Administrator write access

Store paths in the database, not permanent signed URLs.

---

# 13. Row Level Security Matrix

| Resource | Guest Read | Student Read | Student Write | Admin |
|---|:---:|:---:|:---:|:---:|
| Published campuses and snapshots | Yes | Yes | No | Full |
| Draft campus versions | No | No | No | Full |
| Live map tables (buildings/floors/elements/nodes/edges) | No | No | No | Full |
| Published map content | Yes | Yes | No | Full (via latest published snapshot) |
| Published events | Yes | Yes | No | Full |
| Published announcements | Yes | Yes | No | Full |
| Own profile | No | Own | Own safe fields | Full |
| Reports | No | Own | Create own | Full |
| Report images/history | No | Own report | Upload own images | Full |
| Favorites | No | Own | Own | Full |
| Validation data | No | No | No | Full |
| Settings | Public keys only | Public keys only | No | Full |
| Activity logs | No | No | No | Read/append through services |

RLS policies must use a stable administrator check function such as:

```sql
public.is_admin()
```

implemented as a `SECURITY DEFINER` function with a fixed `search_path`.

Function execution is deny-by-default for application trigger and integrity functions. `is_admin()` is callable only by `authenticated` and `service_role`; `publish_campus_version(uuid)` is an authenticated RPC with its own active-administrator check. `campus_is_published(uuid)` and `is_published_floor_plan(text)` are intentionally callable by `anon` and `authenticated` because public RLS and Storage policies require them. These grants and their rationale are recorded as database comments in the A1 corrective migration.

Public visibility conditions are applied inside the select policies: published events and event locations additionally require the campus to be published and not archived (`campus_is_published(campus_id)`); published announcements and announcement locations additionally require the campus to be published, `archived_at is null`, and the active time window (`starts_at` is null or `starts_at <= now()`, and `expires_at` is null or `expires_at >= now()`). Upcoming and finished published events remain readable and are filtered by the frontend.

**Single source of truth for map content:** The live authoring tables (`buildings`, `floors`, `map_elements`, `navigation_nodes`, `navigation_edges`) are **administrator-only**. Guests and students never read them directly; they receive published map content exclusively from the latest published `campus_versions.snapshot` (`campus_versions_select_public`). This guarantees unfinished administrator edits can never be exposed before publication. Public campus metadata (`campuses` rows with `status = 'published'`) and published events/announcements remain directly readable.

Cross-campus reference integrity is enforced with constraint triggers on `map_elements`, `navigation_nodes`, `navigation_edges`, `event_locations`, `announcement_locations`, `favorites`, and `reports` (each referenced building/floor/element/node must belong to the same campus as the parent row). The floor-plans storage read policy uses the `public.is_published_floor_plan(text)` `SECURITY DEFINER` helper, which only ever reads the latest published snapshot — it never depends on public access to live floor rows, so draft floor plans are never exposed.

Do not repeat complex profile subqueries in every policy if a reviewed helper function can be used safely.

---

# 14. Authentication Workflow

## Registration

1. Student enters required information.
2. Supabase Auth creates `auth.users`.
3. A database trigger creates `profiles` with role `student`.
4. Email verification is enabled unless disabled only for local testing.
5. Student signs in after verification.

Public registration must never create an administrator.

The A2 client sends only `first_name`, `last_name`, and `student_number` as signup metadata. The `handle_new_user()` trigger validates those fields, copies the Auth email directly from `auth.users`, hardcodes `role = 'student'` and `is_active = true`, and ignores any authorization metadata supplied by the caller.

## Email verification and password recovery

- Signup confirmation redirects to `/auth/callback?flow=signup`.
- The pending screen at `/auth/verify` can resend a signup confirmation without exposing privileged operations.
- Password-reset requests redirect to `/auth/reset-password?flow=recovery`.
- The reset page requires a recovery link and valid Supabase session before calling `updateUser()`.
- Successful confirmation/reset retains the valid student session, then active-profile and role checks run before student navigation.
- Expired, invalid, missing-profile, inactive-profile, loading, and success states are explicit.
- Redirect URLs must include local development origins and every deployed preview/production origin in the Supabase Auth dashboard.

## Administrator creation

Administrator accounts are created through a secure administrative process, Supabase dashboard, or protected server-side function.

## Login

1. Supabase Auth verifies credentials.
2. Frontend loads the profile.
3. Inactive users are denied application access.
4. Role controls route access.
5. `last_login_at` is updated through controlled backend logic.

## Logout

1. Call Supabase sign-out.
2. Clear application-sensitive state.
3. Redirect to the public application.

---

# 15. Map Builder Save and Publish Workflow

## Draft save

1. Administrator edits campus locally in the Map Builder.
2. Input is sanitized and validated structurally.
3. Draft snapshot is saved to `campus_versions` with `state = 'draft'`.
4. Normalized authoring records are synchronized through a controlled service transaction where required.
5. Students continue seeing the latest published version.

## Validation

1. Administrator requests publish.
2. Validation engine checks required map, routing, accessibility, and emergency rules.
3. A `validation_runs` row is created.
4. Individual results are stored in `validation_issues`.
5. Errors block publication.
6. Warnings require confirmation.

## Publish

1. Re-run critical validation.
2. Mark the new version as `published`.
3. Mark the previous version as `superseded`.
4. Update `campuses.latest_published_version_id`.
5. Record an activity log.
6. Public clients load the newest published snapshot.

Publishing should be atomic through a PostgreSQL function or transaction-safe backend operation.

---

# 16. Frontend-to-Backend Mapping

## Public Campus Map

Reads:

- `campuses` (published, non-archived metadata only)
- latest published `campus_versions` snapshot (buildings, floors, map elements, navigation nodes/edges)
- published events
- published announcements

The public map renders exclusively from the latest published snapshot; live map tables are administrator-only.

## Smart Search and Directory

Reads:

- `campuses` (published, non-archived metadata only)
- latest published `campus_versions` snapshot (buildings, floors, map elements, search keywords)
- published events

Only active, visible, published, and searchable data is returned. Searchable locations are resolved from the latest published snapshot — never from the live authoring tables.

## Admin Map Builder

Reads and writes:

- `campuses`
- `campus_versions`
- `buildings`
- `floors`
- `map_elements`
- `navigation_nodes`
- `navigation_edges`
- validation tables

## Reports

Uses:

- `reports`
- `report_images`
- `report_history`
- location foreign keys

Because live map tables are administrator-only, student-facing screens (favorites, reports, event/announcement locations) must resolve display names for `building_id`/`floor_id`/`map_element_id` references from the latest published `campus_versions.snapshot`, never from direct reads of the live tables.

## Events and Announcements

Uses:

- `events`
- `event_locations`
- `announcements`
- `announcement_locations`

## Dashboard

Aggregates:

- campuses/buildings/floors/elements
- reports
- events
- profiles
- activity logs
- last published versions

Dashboard values must come from queries or database views, not hardcoded constants.

## Settings and Users

Uses:

- `profiles`
- `system_settings`
- Supabase Auth administrative operations

---

# 17. Service Layer Rules

The following service modules should own backend operations:

```text
authService
profileService
campusService
mapVersionService
buildingService
floorService
mapElementService
navigationService
eventService
announcementService
reportService
favoriteService
validationService
settingsService
activityLogService
storageService
```

Rules:

- Pages and visual components must not call Supabase directly.
- Services return typed data or structured errors.
- Services do not show toasts or manipulate UI.
- Cross-table operations use database functions or coordinated service methods.
- AI tools must update generated types after schema changes.
- Mock fallback must be removed after the associated module is migrated.

---

# 18. Environment Configuration

Required frontend variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Optional local demonstration variables:

```env
VITE_ENABLE_DEMO_LOGIN=false
VITE_DEMO_ADMIN_EMAIL=
VITE_DEMO_STUDENT_EMAIL=
```

Local provisioning variables belong only in `.env.demo.local` and may include the service-role key for the approved Node provisioning script. They must never be imported by browser code or committed.

Rules:

- Only the anonymous public key belongs in the frontend.
- Never expose the service-role key.
- Commit `.env.example`, not `.env`.
- Commit `.env.demo.example`, never `.env.demo.local`.
- Vite-prefixed values are visible to the built browser application. `VITE_DEMO_*_PASSWORD` may contain only disposable demonstration credentials when demo login is explicitly enabled; never use a real administrator or student password.
- The demo selector may fill the configured disposable email and password, but must never bypass normal Supabase authentication or sign in automatically.
- Validate variables at startup.
- Production and development Supabase projects should be separate when feasible.

---

# 19. Migration Workflow

1. Never run the legacy migration.
2. Generate a new reviewed migration such as:

```text
supabase/migrations/001_create_plv_navisync_schema.sql
```

3. Run it on a new Supabase development project.
4. Verify all tables, constraints, triggers, RLS policies, and buckets.
5. Seed only minimal development data.
6. Generate TypeScript database types.
7. Commit the migration and generated types together.
8. Use additional numbered migrations for later changes.
9. Never edit a migration that has already been applied to a shared or production database.

For the existing shared development project, `001_create_plv_navisync_schema.sql` predates migration-history tracking and must not be replayed. The assertion-only `20260805160720_baseline_existing_schema.sql` migration verifies the expected live tables and buckets, establishes the live schema as the tracked baseline, and contains no schema creation or destructive statements. All corrections follow it as new migrations.

---

# 20. Backend Definition of Done

The backend is complete only when:

- Supabase project is created and connected.
- The legacy migration is archived and not executed.
- The finalized initial migration is applied successfully.
- All required tables and relationships exist.
- RLS is enabled and tested for guest, student, and administrator roles.
- Registration, login, logout, and session restoration work.
- Storage buckets and policies work.
- Map drafts save without becoming public.
- Validated publishing atomically updates the public map.
- Reports and image uploads persist.
- Events and announcements appear according to status and dates.
- Dashboard values are real.
- Activity logs are created for important administrator actions.
- TypeScript database types are generated.
- Mock data is no longer used by migrated modules.
- Automated tests cover critical policies and service operations.
