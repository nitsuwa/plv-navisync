# PLV NaviSync

# Team Development Rules

**Version:** 1.0
**Status:** Frozen Team Workflow
**Purpose:** Prevent merge conflicts, duplicated work, AI drift, and accidental breaking changes while three developers work in parallel.

This document applies to all developers and all AI-assisted coding sessions.

---

# 1. Core Team Rule

No developer commits directly to `main`.

Every change must be completed in a feature branch, reviewed, tested, and merged through a Pull Request.

The `main` branch should always remain buildable.

---

# 2. Branch Strategy

Use these long-running module branches:

```text
feature/auth-admin-backend
feature/map-navigation
feature/operations-content
```

## Developer 1

Branch:

```text
feature/auth-admin-backend
```

Owns:

- Supabase setup
- Authentication
- Profiles
- Users
- Settings
- Shared services
- Generated database types
- Storage infrastructure
- Backend error handling
- Auth-related contexts and guards

## Developer 2

Branch:

```text
feature/map-navigation
```

Owns:

- Campus map
- Campus Map Builder
- Buildings
- Floors
- Map elements
- Navigation graph
- Pathfinding
- Accessibility routing
- Emergency routing
- Validation and publishing UI

## Developer 3

Branch:

```text
feature/operations-content
```

Owns:

- Dashboard
- Reports
- Events
- Announcements
- Student report pages
- Favorites
- Operational statistics
- Activity presentation

---

# 3. Optional Task Branches

For risky or larger work, create a short-lived branch from the developer's main feature branch.

Examples:

```text
feature/auth-admin-backend/supabase-auth
feature/map-navigation/publish-workflow
feature/operations-content/report-history
```

Merge the task branch back into the developer's feature branch first.

Do not create dozens of unnecessary branches for tiny edits.

---

# 4. Daily Start Workflow

Before starting work:

```bash
git checkout main
git pull origin main
```

Then update the assigned branch:

```bash
git checkout feature/<assigned-branch>
git merge main
```

Resolve conflicts before beginning new work.

After merging `main`, run:

```bash
pnpm install
pnpm build
```

Run relevant tests when available.

Do not continue if the branch does not build.

---

# 5. Folder Ownership

## Developer 1 ownership

Primary ownership:

```text
src/lib/supabase.ts
src/services/
src/pages/AdminLoginPage.tsx
src/pages/RegistrationPage.tsx
src/pages/AdminUsersPage.tsx
src/pages/AdminSettingsPage.tsx
src/pages/StudentProfilePage.tsx
src/pages/StudentSettingsPage.tsx
supabase/
```

Auth-related files under `src/contexts/` and `src/hooks/` also belong to Developer 1.

## Developer 2 ownership

Primary ownership:

```text
src/components/map/
src/components/map-builder/
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

## Developer 3 ownership

Primary ownership:

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

---

# 6. Shared Files Requiring Coordination

The following are shared-core files:

```text
src/app/App.tsx
src/app/routes.tsx
src/main.tsx
src/contexts/CampusDataContext.tsx
src/lib/supabase.ts
src/config/constants.ts
src/config/animation.ts
src/lib/utils.ts
src/types/
src/components/ui/
src/components/layout/
src/styles/
package.json
pnpm-lock.yaml
vite.config.ts
supabase/migrations/
```

Before modifying a shared file:

1. Inform the team.
2. Explain the reason.
3. Assign one developer.
4. Make the smallest safe change.
5. Merge early.
6. Tell everyone to update their branches.

Never let two Freebuff sessions edit the same shared file at the same time.

---

# 7. Files That Must Not Be Modified Casually

Do not rename, move, or replace these without a dedicated reviewed task:

```text
src/app/routes.tsx
src/app/App.tsx
src/components/map-builder/
src/lib/pathfinding.ts
src/lib/indoorPathfinding.ts
src/lib/combinedPathfinding.ts
src/contexts/CampusDataContext.tsx
src/styles/theme.css
src/config/animation.ts
supabase/migrations/
```

Do not:

- Replace React Router
- Convert the project to Next.js
- Replace the custom SVG map
- Replace the active Map Builder
- Add a second state-management framework
- Add a second Supabase client
- Introduce a new UI kit for one screen
- Rebuild existing working modules without approval

---

# 8. AI Coding Rules for Team Members

Before prompting Freebuff or Codex:

1. Identify the exact module.
2. Identify the exact files allowed to change.
3. Reference the relevant documents.
4. Request one small deliverable.
5. Explicitly forbid unrelated changes.

Good prompt structure:

```text
Read:
- docs/00_PROJECT_CONTEXT.md
- docs/01_SYSTEM_FEATURES.md
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/03_DATABASE_SUPABASE.md
- docs/04_TEAM_RULES.md

You are working only on [MODULE].

Allowed files:
- [exact files/folders]

Task:
[one specific implementation task]

Do not:
- modify unrelated files
- rename folders
- restructure the project
- replace existing working components
- create duplicate services or types
- use mock data unless the task explicitly requires a temporary fixture

Before finishing:
- run the build
- report modified files
- report unresolved issues
```

Bad prompts:

```text
Improve the whole app.
Fix everything.
Make the dashboard better.
Connect Supabase everywhere.
Refactor the project.
```

---

# 9. One Task at a Time

Each AI session should implement one coherent task.

Examples:

Good:

- Connect login to Supabase Auth
- Wire Admin Reports to `reportService`
- Add the missing announcements routes
- Persist map drafts
- Replace public building mock data with service data

Bad:

- Implement auth, map publishing, reports, events, and redesign the dashboard in one prompt

Smaller tasks are easier to review, revert, test, and merge.

---

# 10. Commit Rules

Commit frequently after a complete small change.

Use Conventional Commit style.

Examples:

```text
feat(auth): connect login to Supabase
feat(map): persist campus draft versions
feat(reports): add report image upload
fix(routes): register announcement pages
fix(nav): handle disconnected graph safely
refactor(services): remove duplicate Supabase client
test(auth): cover student route protection
docs(team): update shared file ownership
```

Avoid:

```text
updates
changes
fixed stuff
final
working
everything
```

A commit should contain one logical change.

---

# 11. Pull Request Rules

Every Pull Request must include:

## Summary

What was changed?

## Scope

Which module and files were changed?

## Testing

What commands and manual checks were completed?

## Database impact

Were migrations, policies, or generated types changed?

## Screenshots or notes

Add screenshots when possible. If screenshots cannot be provided, describe the visible behavior tested.

## Risks

What could break?

## Follow-up

What remains incomplete?

---

# 12. Pull Request Checklist

Before opening a Pull Request:

- [ ] The branch includes the latest `main`.
- [ ] The task matches `01_SYSTEM_FEATURES.md`.
- [ ] Architecture rules were followed.
- [ ] No unrelated files were modified.
- [ ] No new duplicate component or service was created.
- [ ] No production page relies on new mock data.
- [ ] Loading, empty, error, and success states were handled.
- [ ] Responsive behavior was checked.
- [ ] Authentication and permissions were checked where relevant.
- [ ] `pnpm build` succeeds.
- [ ] Relevant tests pass.
- [ ] Database migrations were reviewed.
- [ ] Secrets were not committed.
- [ ] The modified-file list was reviewed.

---

# 13. Review Rules

At least one teammate reviews each Pull Request.

The reviewer checks:

- Functional correctness
- Scope compliance
- Architecture compliance
- Unintended changes
- Duplicate logic
- Security and RLS implications
- Mobile and desktop behavior
- Error handling
- Test evidence

The reviewer should not approve merely because the code builds.

---

# 14. Merge Rules

Prefer squash merging for small feature Pull Requests.

Do not merge when:

- Build fails
- Required tests fail
- Shared-file conflict is unresolved
- Migration is unreviewed
- AI changed unrelated files
- Feature is only visually present but non-functional
- Mock data is presented as completed backend integration
- RLS has not been considered for a new table or write operation

After merge:

```bash
git checkout main
git pull origin main
```

Every developer then merges the updated `main` into their feature branch.

---

# 15. Conflict Prevention

To reduce conflicts:

- Do not work on the same page simultaneously.
- Do not auto-format the entire repository.
- Do not reorder imports across unrelated files.
- Do not rename shared components during feature work.
- Do not modify lockfiles unless dependencies changed.
- Do not edit the same migration simultaneously.
- Merge shared infrastructure before dependent features.
- Communicate route and type changes immediately.

When a conflict occurs, the developers who own the affected modules resolve it together.

Do not ask AI to blindly resolve complex merge conflicts.

---

# 16. Database Change Rules

All database changes require:

1. Update `03_DATABASE_SUPABASE.md` when the design changes.
2. Add a new numbered migration.
3. Review foreign keys, indexes, and RLS.
4. Apply to the development project.
5. Generate updated TypeScript database types.
6. Update services.
7. Test guest, student, and admin access.
8. Commit the migration and generated types together.

Never:

- Edit an already shared/applied migration
- Use the service-role key in frontend code
- Disable RLS to make a feature work
- Make undocumented manual production table changes
- Let multiple developers create conflicting migrations with the same number

Developer 1 coordinates migration numbering.

---

# 17. Mock Data Migration Rules

Do not remove all mock data at once.

For each module:

1. Connect the service to Supabase.
2. Verify reads.
3. Verify writes.
4. Verify RLS.
5. Update the page.
6. Test loading, empty, error, and populated states.
7. Remove that module's production mock dependency.
8. Keep separate test fixtures when needed.

A module is not complete if it silently falls back to mock data in production.

---

# 18. Definition of Done for a Team Task

A task is complete only when:

- The requested behavior works.
- It persists when persistence is required.
- It uses the correct service.
- Permissions are enforced.
- Input is validated.
- Errors are handled.
- Loading and empty states exist.
- Existing behavior remains intact.
- Desktop and mobile are checked.
- Build succeeds.
- Relevant tests pass.
- The code is reviewed and merged.

A UI-only placeholder is not a completed feature.

---

# 19. Emergency Revert Rule

If a merged change breaks `main`:

1. Stop new merges.
2. Identify the breaking Pull Request.
3. Revert the merge if a fast safe fix is not obvious.
4. Restore a green build.
5. Fix the issue in a separate branch.
6. Re-review before merging.

Do not stack more changes on a broken `main`.

---

# 20. Team Working Agreement

The team agrees to:

- Communicate before shared changes.
- Respect module ownership.
- Ask for review when uncertain.
- Prefer small reversible changes.
- Never hide AI-generated changes from teammates.
- Test claims before marking features complete.
- Preserve working functionality.
- Keep `main` stable.
- Follow the frozen project documents.
