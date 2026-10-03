# Demo Student Approval Flow and Mobile Campus Appearance

## Goal

Provide a second, regular demo student account that can be manually promoted to `student_org` in Admin User Management, and make the published student map retain the configured campus ground appearance (including green) on mobile viewports.

## Scope

### Included

- Extend the developer-only demo provisioning utility with one optional third account whose initial profile role is `student` and whose active status is `true`.
- Expose that account as an optional login quick-fill entry labelled as an organization applicant, without auto-authentication or role promotion.
- Preserve the existing Admin User Management role change as the manual approval step.
- Make published snapshot loading recover canvas appearance from the serialized structure when an older snapshot stores it only in the `canvas_appearance` map element.
- Add regression tests for the snapshot compatibility path and demo-account configuration/role intent where practical.

### Excluded

- No automatic conversion to `student_org`.
- No new database migration or RLS bypass.
- No change to the event creation workflow itself.
- No forced green fallback for campuses configured as neutral, concrete, pavers, asphalt, or custom.
- No GitHub pull, push, reset, or checkout.

## Design

The provisioning script will create or update a third Auth user from local environment variables, ensure its profile remains an active regular student, and print its credentials only in the local provisioning output. The login page will add the account only when its own Vite credentials are configured, so existing environments remain unchanged. The admin must then edit the profile and choose `Student Org`; existing trigger and RLS rules remain authoritative.

Published campus snapshots will remain the primary source. When the snapshot's top-level campus object does not contain canvas appearance fields, the loader will derive those fields from the top-level `structure.map_elements` record whose kind or element type is `canvas_appearance`. The map renderer will continue to resolve the appearance through the existing `campusGroundAppearance` helper, keeping desktop and mobile behavior consistent.

## Data flow

```text
local demo env → provision-demo-accounts.mjs → Auth/profile(student)
                                                ↓
                                  Admin User Management manual conversion
                                                ↓
                                  student_org event-create permissions

published campus_versions.snapshot
  ├─ campus appearance fields (preferred)
  └─ structure.map_elements.canvas_appearance (legacy compatibility)
                         ↓
            hydrated Campus → shared ground appearance → mobile/desktop map
```

## Testing

- Test first: add a failing snapshot-loader test for appearance stored only in `structure.map_elements`, then implement the compatibility merge.
- Verify the account configuration is optional and the provisioning path still keeps the new profile role as `student` before any manual approval.
- Run focused Vitest tests, then the production build.
- Existing unrelated working-tree changes and known broad-suite failures must not be reset or overwritten.

## Acceptance criteria

1. A developer can provision a second demo student without changing the existing Demo Student or Demo Administrator.
2. The second account appears as a quick-fill option only when its credentials are configured.
3. Signing in with it starts as a regular student; the Admin UI can manually change it to Student Org.
4. A published snapshot with green appearance stored only in its structure renders green on the student map at mobile width.
5. No GitHub synchronization or destructive working-tree operation is performed.
