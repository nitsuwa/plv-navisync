# PLV NaviSync

# Team Development Rules

**Version:** 2.0
**Status:** Official Team Workflow
**Purpose:** Keep `main` stable, prevent duplicate AI work, and allow Austin to continue the critical path while teammates contribute safely.

These rules apply to every developer and every AI-assisted coding session.

---

# 1. Team Structure

## Lead Developer and Integrator — Austin

Austin is the main developer and integration owner.

Responsibilities:

- Choose the next critical-path task.
- Assign or approve tasks before work begins.
- Own shared architecture, Supabase, migrations, generated database types, authentication, and publishing contracts.
- Work on any important available feature when it is not actively claimed by another developer.
- Review Pull Requests and decide merge order.
- Take over tasks that are returned, abandoned, or blocking the project.
- Keep `main` buildable.

This role does not limit Austin to backend work. Austin may implement admin, student, Map Builder, navigation, or operational features according to project priority.

## Contributing Developers

Developers 2 and 3 receive one small, clearly bounded task at a time.

They do not permanently own the entire admin side, student side, or Map Builder. Ownership applies only to the task currently assigned to them.

Contributor tasks should be:

- Independently testable.
- Small enough for one Pull Request.
- Limited to clearly listed files.
- Unrelated to files another developer is actively editing.
- Free from new migrations unless Austin explicitly assigns the database change.

---

# 2. Core Branch Rule

No developer commits or pushes feature work directly to `main`.

Every task uses a new short-lived branch created from the latest `main`.

Examples:

```text
feature/generate-database-types
feature/password-reset
feature/campus-crud
feature/report-submission
fix/student-profile-loading
docs/update-roadmap
```
Do not use permanent developer branches such as:

```text
feature/developer-1
feature/map-navigation
feature/operations-content
```

One branch must contain one coherent task only.

---

# 3. Task Board and Claiming

Maintain a small task board in the group chat, GitHub Issues, or project board.

```text
AVAILABLE
- Unclaimed tasks

CLAIMED
- Task — Developer — Branch — Target date

FOR REVIEW
- Task — Pull Request link

DONE
- Merged tasks
```

Rules:

1. A task must be listed or approved before work starts.
2. The developer claims it and posts the branch name.
3. Only one developer may claim a task.
4. No one may edit files owned by another active task without coordination.
5. If no meaningful progress is made by the agreed time, the task may be returned to `AVAILABLE`.
6. Austin may take over a returned or blocking task.
7. Starting a Freebuff session does not count as progress unless the produced changes are reviewed.

---

# 4. Starting a Task

Before beginning:

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

Then:

1. Read the project documents.
2. Inspect the exact files related to the task.
3. Confirm the allowed files and acceptance criteria.
4. Run the current build before making large changes when practical.
5. Tell the team before touching a shared-core file.

Do not begin from an old branch.

---

# 5. Work Areas

These areas guide task assignment but are not permanent ownership boundaries.

## Lead and shared foundation

Normally coordinated by Austin:

```text
src/lib/supabase.ts
src/services/
src/hooks/useAdminAuth.ts
src/hooks/useStudentAuth.ts
src/app/routes.tsx
src/contexts/
src/types/
supabase/
package.json
pnpm-lock.yaml
```

Typical tasks:

- Supabase and RLS
- Authentication and authorization
- Database migrations and generated types
- Shared service contracts
- Campus publishing and public-data contracts
- Cross-module integration

## Map and authoring contributions

Typical isolated contributor tasks:

```text
src/components/map-builder/
src/components/map/
src/pages/AdminMapBuilderPage.tsx
src/pages/CampusMapPage.tsx
src/lib/pathfinding.ts
src/lib/indoorPathfinding.ts
src/lib/combinedPathfinding.ts
```

Examples:

- One editor interaction
- One validation rule
- One responsive UI fix
- One pathfinding regression with tests

## Operations and student contributions

Typical isolated contributor tasks:

```text
src/pages/AdminDashboardPage.tsx
src/pages/AdminReportsPage.tsx
src/pages/AdminEventsPage.tsx
src/pages/AdminAnnouncementsPage.tsx
src/pages/StudentReportsPage.tsx
src/pages/StudentFavoritesPage.tsx
src/components/map/EventPopup.tsx
src/components/map/ReportModal.tsx
```

Examples:

- One loading/empty/error-state improvement
- One form validation task
- One isolated page connection after its service contract is merged
- One responsive or accessibility fix

---

# 6. Shared-Core Files

These require coordination:

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

Before changing one:

1. Inform the team.
2. Explain why it is required.
3. Assign one developer.
4. Make the smallest safe change.
5. Merge it early.
6. Tell active developers to update from `main`.

Never let separate Freebuff sessions edit the same shared file concurrently.

---

# 7. Database Change Rules

Austin coordinates all migration numbers and schema changes.

Every database change requires:

1. Confirm the design in `03_DATABASE_SUPABASE.md`.
2. Create a new numbered migration; never edit an applied shared migration.
3. Review constraints, indexes, triggers, and RLS.
4. Apply it to the development Supabase project.
5. Regenerate TypeScript database types.
6. Update services.
7. Test guest, student, and admin permissions.
8. Commit the migration and generated types together.

Never:

- Put the service-role key in frontend code.
- Disable RLS to make a feature work.
- Make undocumented production changes.
- Allow two developers to create competing migrations.

---

# 8. AI-Assisted Coding Rules

Each Freebuff or Codex session must receive:

- One exact task.
- The task branch name.
- Allowed files or folders.
- Acceptance criteria.
- Explicit forbidden changes.
- Required tests.

Good tasks:

- Generate typed Supabase definitions from the applied schema.
- Add the password-reset request flow.
- Connect one report page to an already-approved report service.
- Fix one Map Builder selection regression.

Bad tasks:

- Improve the whole app.
- Connect everything to Supabase.
- Finish all remaining features.
- Redesign the admin and student sides.

After AI work, the developer must inspect `git diff` and must not blindly accept the report.

---

# 9. Finishing a Task

Before committing:

```bash
pnpm build
git status --short
git diff --check
```

Run relevant tests when available.

Then commit using a clear conventional message, for example:

```text
feat(auth): add password reset flow
feat(campus): persist campus drafts
fix(map): handle disconnected navigation graph
docs(team): adopt task branch workflow
```

Push only the task branch:

```bash
git push -u origin <branch-name>
```

Open a Pull Request into `main`.

---

# 10. Pull Request Requirements

Every Pull Request must state:

## Summary

What changed?

## Scope

Which module and files changed?

## Testing

Which commands and manual checks were completed?

## Database impact

Were migrations, policies, storage, or generated types changed?

## Risks and remaining work

What could break or remains unverified?

Add screenshots for visible changes when practical.

---

# 11. Review and Merge Rules

At least one teammate reviews the Pull Request. Austin performs the final integration review or approves a delegated reviewer.

Do not merge when:

- The build fails.
- Relevant tests fail.
- The branch contains unrelated changes.
- A shared-file conflict is unresolved.
- A migration or RLS policy is unreviewed.
- A UI is present but its required behavior does not work.
- New mock data is presented as completed backend integration.
- Secrets or private environment files are staged.

Prefer squash merge for one-task Pull Requests.

Merge one Pull Request at a time. After each merge, verify `main` before merging the next one.

---

# 12. Updating After a Merge

Before starting the next task:

```bash
git checkout main
git pull origin main
git checkout -b <new-task-branch>
```

For an active branch that must continue, update it carefully from `main` and resolve conflicts before adding more work.

Delete completed branches after merge when no longer needed.

---

# 13. Conflict Prevention

- Do not work on the same page simultaneously.
- Do not auto-format the whole repository.
- Do not reorder imports in unrelated files.
- Do not rename shared components during feature work.
- Do not modify a lockfile unless dependencies changed.
- Do not edit the same migration simultaneously.
- Merge shared contracts before dependent features.
- Communicate route, schema, and shared-type changes immediately.
- Do not ask AI to blindly resolve a complex merge conflict.

---

# 14. Definition of Done

A task is complete only when:

- The assigned behavior works.
- Required persistence works.
- Correct services and permissions are used.
- Input and errors are handled.
- Loading and empty states exist when relevant.
- Existing behavior remains intact.
- Desktop and mobile are checked when relevant.
- The build succeeds.
- Relevant tests pass or missing tests are disclosed.
- The changes are reviewed and merged.

A visual placeholder is not a completed feature.

---

# 15. Emergency Revert Rule

If a merge breaks `main`:

1. Stop new merges.
2. Identify the breaking Pull Request.
3. Revert it when a fast safe fix is not certain.
4. Restore a passing build.
5. Fix the issue in a new task branch.
6. Review again before merging.

---

# 16. Short Team Agreement

```text
Bawal mag-code o mag-push directly sa main. Bawat task may bagong branch mula sa latest main, at isang specific task lang bawat branch. Mag-claim muna bago mag-start. Sabihin agad kung shared file, route, type, service, o migration ang babaguhin. Pag tapos, inspect diff, run build/tests, push branch, at gumawa ng Pull Request. Si Austin ang lead/integrator at final merge coordinator, pero puwede siyang gumawa ng kahit anong priority feature. Ang assignments ng ibang developers ay maliit at isolated para hindi sila maging blocker.
```
