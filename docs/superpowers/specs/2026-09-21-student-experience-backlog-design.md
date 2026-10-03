# Student Experience Backlog Design

## Goal

Turn the remaining student-facing placeholders into honest, persistent, and usable flows while preserving the existing map/event functionality and the removal of out-of-scope schedules and announcements.

## Scope

### Account and preferences

- Notification preferences use Supabase Auth user metadata when an authenticated Supabase session exists.
- Local/demo mode stores preferences under an account-scoped key and never pretends that they were delivered remotely.
- Password changes verify the current password with `signInWithPassword` before calling `auth.updateUser`.
- Profile name updates write safe fields to the current `profiles` row.
- Avatar uploads use the existing private `avatars` bucket under `{userId}/...`, save the storage path to `profiles.avatar_path`, and use signed URLs for display.
- Profile activity is derived from real recent destinations and submitted reports instead of a permanent empty constant.

### Favorites and building actions

- Authenticated favorites use the existing `favorites` table with user/building/campus ownership enforced by RLS.
- Local/demo favorites are account-scoped and start empty.
- Map, Home, Favorites, Building Details, and the building modal share the same save behavior.
- Directions use `/map?buildingId=<id>` because that is the canonical map entry point.
- Share copies a useful deep link and reports success or failure.
- Report Issue opens the existing real report form or consumes the report query from the Reports page.

### Reports

- The report service normalizes `under_review`, `in_progress`, and `rejected` instead of silently collapsing them.
- Database reports hydrate building and floor names, private image signed URLs, and report-history updates.
- New report image uploads are stored under the report ID and recorded in `report_images` after the report row exists, matching storage RLS.
- Student report filters and progress UI use the same canonical statuses.
- Building-originated report links open the report flow with the building already selected.

### Help Center

- Campus answers remain a local, clearly labeled navigation guide until a remote assistant exists.
- Campus service links use canonical `buildingId` map URLs.
- Contact Support opens a prepared `mailto:` draft with the submitted details and provides a copyable fallback; it does not claim that a server ticket was created.

### Responsive and accessibility polish

- Student pages use wider desktop containers and grid layouts where the content supports it.
- Mobile surfaces keep primary actions reachable, preserve safe-area spacing, and avoid hidden/no-op controls.
- Interactive controls expose accessible names, pressed/selected state, keyboard focus, and status feedback.

## Architecture

Existing services remain the boundary for data behavior. Account preferences and profile operations are added to focused student account/profile service modules. `reportService` owns report normalization and hydration. Pages call services and render loading, empty, error, and success states; they do not write Supabase queries inline except where existing patterns already require it.

Remote failures for authenticated users are surfaced to the UI rather than silently replaced with a local success state. Local storage is used only when the app has no Supabase connection or no authenticated user, and all fallback keys are namespaced by the current account identity when available.

## Error handling

- Auth/profile/favorite/report failures show a toast and preserve the last known UI state.
- Avatar upload failures do not replace the existing avatar path.
- Report image failures do not prevent the text report from being saved; the UI reports that the photo could not be attached.
- Mail client availability is not assumed; the support form also exposes copyable email details.
- Empty states explain the next action and never imply missing data is an error.

## Testing strategy

- Add unit tests for preferences/password/profile helpers, account-scoped favorite fallback, report normalization/hydration helpers, and support mailto generation.
- Add page/component tests for settings persistence/error states, profile save/avatar affordance, building actions/deep links, report prefill/status labels, and Help Center support handoff.
- Run focused Vitest suites after each phase, then a production Vite build and final diff/scope checks.

## Non-goals

- No schedule/classes or student announcements are reintroduced.
- No new server-side support-ticket table is invented for this pass.
- No broad map-builder refactor or unrelated event-builder cleanup.
