# PLV NaviSync

# Team Development Rules

**Version:** 3.1
**Status:** Official Team Workflow
**Purpose:** Allow three developers to work independently on substantial parts of the system while keeping `main` stable and making every assignment transferable.

These rules apply to every developer and every AI-assisted coding session.

---

# 1. Team Structure

## Developer 1 — Platform and Campus Lifecycle

Developer 1 is the primary owner of Workstream A, which contains a complete share of the remaining system work:

- Supabase types, Storage, Row Level Security, and shared backend services.
- Student account lifecycle and administrator user management.
- Campus, building, floor, directory, and navigation-graph data contracts.
- Draft, publish, unpublish, archive, backup, and deployment readiness.
- Cross-system security and integration verification.

Because Workstream A defines contracts used by Workstreams B and C, Developer 1 normally coordinates migration numbering, generated types, shared service contracts, and dependency-aware merge sequencing. This is a technical coordination responsibility, not a designation as the main developer or supervisor of the other developers.

## Developer 2 — Map Authoring and Navigation

Developer 2 is the primary owner of Workstream B, which contains a complete share of the remaining system work:

- Campus Map Builder behavior.
- Buildings and entrances in the outdoor editor.
- Floor-plan authoring.
- Navigation graph authoring.
- Validation, route testing, and editor usability.
- Pathfinding integration support.

## Developer 3 — Student Experience and Operations

Developer 3 is the primary owner of Workstream C, which contains a complete share of the remaining system work:

- Public and student map experience.
- Search, route presentation, and location details.
- Reports, events, announcements, favorites, and Help Center.
- Operational admin pages and dashboard presentation.
- Responsive, accessibility, and PWA-facing user experience.

## Primary ownership, not permanent ownership

The workstreams define who starts and normally completes each package. They are not permanent restrictions.

Another developer may take over a package when:

- The current developer is unavailable or returns the task.
- The active branch is pushed or its changes are committed and handed off.
- The current status, changed files, remaining work, and known problems are documented.
- The team confirms that only one person will continue editing it.
- The replacement developer starts from the correct branch or latest `main`.

No task may have two active implementations at the same time.

---

# 2. Source of Truth

Before every task, developers and AI assistants must read and follow:

```text
docs/00_PROJECT_CONTEXT.md
docs/01_SYSTEM_FEATURES.md
docs/02_SYSTEM_ARCHITECTURE.md
docs/03_DATABASE_SUPABASE.md
docs/04_TEAM_RULES.md
docs/05_FREEBUFF_RULES.md
docs/06_IMPLEMENTATION_ORDER.md
CURRENT_IMPLEMENTATION.md
```

The versions on the latest `main` branch are authoritative.

If documents disagree:

1. `00_PROJECT_CONTEXT.md` controls the frozen project purpose and boundaries.
2. `01_SYSTEM_FEATURES.md` controls the approved feature scope.
3. Architecture and database documents control technical contracts.
4. `06_IMPLEMENTATION_ORDER.md` controls implementation order, dependencies, and workstream queues.
5. `CURRENT_IMPLEMENTATION.md` records verified current behavior.

Do not invent features or remove approved features without a team decision and documentation update.

---

# 3. Work Package Rule

Each developer receives an ordered queue of complete, demonstrable feature packages in `06_IMPLEMENTATION_ORDER.md`.

A work package must:

- Produce a visible or technically verifiable result.
- Have clear prerequisites and completion requirements.
- Be independently reviewable in one Pull Request.
- Include persistence, permissions, loading, empty, error, and success behavior when relevant.
- Include relevant tests or clearly disclose missing coverage.
- Leave the project buildable.

Work packages are larger than one-button fixes but smaller than an entire workstream.

Examples:

- Good: persistent building and floor management with validation.
- Good: student search and published-location details.
- Good: reports submission and admin report workflow.
- Too small: change one icon color.
- Too large: finish the entire Map Builder and navigation system in one branch.

Developers proceed through their own queue without waiting for another person to assign every next step. A package marked `READY` may begin. A package marked `BLOCKED` must wait for its named dependency.

---

# 4. Branch Rules

No developer commits or pushes feature work directly to `main`.

Use a fresh short-lived branch from the latest `main` for every work package.

Examples:

```text
feature/database-types-and-storage
feature/campus-lifecycle
feature/building-floor-authoring
feature/navigation-graph-authoring
feature/student-map-search
feature/reports-workflow
fix/mobile-map-controls
```

Do not use one permanent developer branch or one enormous branch for a complete workstream.

One branch contains one coherent work package only.

Start a task with:

```bash
git switch main
git pull origin main
git switch -c <branch-name>
```

Do not begin from an old feature branch.

---

# 5. Independent Work and Coordination

Developers may work simultaneously when:

- Their packages are marked `READY`.
- They are not editing the same page, component, service, type, migration, or contract.
- Neither task depends on an unfinished change from the other.
- The planned branch and package are posted in the group chat or task board.

Contact the team only when:

- A package is genuinely blocked.
- A shared-core file or contract must change.
- A database migration or dependency is needed.
- Instructions conflict with the actual code.
- A Pull Request is ready for review.
- A task must be handed off.

Normal progress updates are optional. The developer checklist and Draft Pull Request are the record of active work; the checklist on `main` remains the official record of merged work.

---

# 6. Repository Progress Checklists

The official live task board is stored in three separate files:

- `docs/progress/DEVELOPER_1_PROGRESS.md`
- `docs/progress/DEVELOPER_2_PROGRESS.md`
- `docs/progress/DEVELOPER_3_PROGRESS.md`

Each developer updates only their assigned progress file. This lets everyone see the current status in GitHub without making all three developers edit one shared checklist.

The version on `main` is the official record. A checkbox becomes checked on `main` only when the related Pull Request is merged.

For every package:

1. Change the package status from `READY` to `ACTIVE` when beginning the branch.
2. Record the branch name and open a Draft Pull Request after the first safe commit so the team can see that the package is active.
3. Keep the checkbox unchecked while implementation or review is incomplete.
4. After the code is implemented and required tests pass, change the status to `FOR REVIEW`, add the test result and Pull Request link, check the box in the same Pull Request, and mark the Draft Pull Request ready for review.
5. If the Pull Request is not merged, `main` remains unchecked.
6. Once the Pull Request is merged, the checked item on `main` is considered `DONE`.
7. If blocked, leave the checkbox unchecked and record the exact dependency or problem.

Freebuff or another coding AI should update the developer's progress file as the final change in each package. A developer must still verify the diff, test results, and Pull Request before merge. An AI statement alone does not prove completion.

Only one package should normally be `ACTIVE` per developer. Do not edit another developer's progress file unless formally taking over their package.

---

# 7. Shared-Core Files and Contracts

These require coordination because several workstreams depend on them:

```text
src/app/App.tsx
src/app/routes.tsx
src/main.tsx
src/contexts/
src/lib/supabase.ts
src/services/
src/types/
src/config/
src/components/ui/
src/components/layout/
src/styles/
package.json
pnpm-lock.yaml
vite.config.ts
supabase/migrations/
```

Before changing a shared-core file:

1. Post the file or contract and why it must change.
2. Confirm that no other active task is modifying it.
3. Assign one developer to make the smallest safe change.
4. Merge the shared change before dependent work when possible.
5. Tell affected developers to update from `main`.

Primary ownership of a page does not authorize uncoordinated changes to shared contracts.

---

# 8. Database and Supabase Rules

Developer 1 normally coordinates migration numbers and schema changes because these belong to Workstream A. Another developer may implement an approved database change after coordination, and at least one teammate must review it before merge.

Every database change must:

1. Match `03_DATABASE_SUPABASE.md` and the relevant feature contract.
2. Use a new numbered migration; never rewrite an applied shared migration.
3. Include constraints, indexes, triggers, and RLS where relevant.
4. Be applied to the development Supabase project.
5. Regenerate TypeScript database types.
6. Update affected services.
7. Test guest, student, and administrator permissions.
8. Include migration, generated types, and related service updates in a coordinated merge.

Never:

- Put a service-role key in frontend code.
- Disable RLS to bypass a problem.
- Make undocumented dashboard-only schema changes.
- Let two branches create competing migration numbers.
- Expose drafts or private profile/report data to guests.

---

# 9. AI-Assisted Coding Prompt Contract

Every Freebuff or Codex task must start with:

```text
Before changing code, read and follow:

- docs/00_PROJECT_CONTEXT.md
- docs/01_SYSTEM_FEATURES.md
- docs/02_SYSTEM_ARCHITECTURE.md
- docs/03_DATABASE_SUPABASE.md
- docs/04_TEAM_RULES.md
- docs/05_FREEBUFF_RULES.md
- docs/06_IMPLEMENTATION_ORDER.md
- CURRENT_IMPLEMENTATION.md
- the assigned docs/progress/DEVELOPER_<number>_PROGRESS.md file

Treat these files as the project source of truth.
Implement only the assigned work package.
Do not redesign unrelated features or modify files outside the package unless strictly required.
```

Then provide:

```text
Work package ID and name:
Branch:
Goal:
Prerequisites:
Required behavior:
Expected files or area:
Forbidden changes:
Required tests and manual checks:
Definition of Done:
```

The AI must inspect the current implementation before editing. It must not rebuild an existing working feature merely because it prefers another approach.

After AI work, the developer must inspect the diff and verify the result. An AI completion report is not proof that the feature works.

After implementation and testing, the AI must update only the assigned developer's progress file with the package status, test result, Pull Request placeholder or link when available, and current handoff note. It must not edit another developer's checklist.

---

# 10. Finishing a Work Package

Before committing, run at minimum:

```bash
pnpm build
git status --short
git diff --check
```

Also run relevant unit, integration, and end-to-end tests when available.

Manually verify the main success path and important failure states. For visible changes, check desktop and mobile when relevant.

Use a clear conventional commit message, for example:

```text
feat(campus): persist campus lifecycle
feat(builder): add building and floor authoring
feat(map): connect published campus search
feat(reports): implement report workflow
fix(navigation): handle disconnected routes
```

Push only the task branch:

```bash
git push -u origin <branch-name>
```

Then open a Pull Request into `main`.

---

# 11. Pull Request Requirements

Every Pull Request must include:

## Summary

What complete result was added or fixed?

## Scope

Which work package, module, and main files changed?

## Testing

Which commands and manual journeys passed?

## Database impact

Were migrations, RLS, Storage, generated types, or services changed?

## Screenshots

Include before/after or final screenshots for visible changes when practical.

## Risks and remaining work

What is unverified, intentionally deferred, or dependent on a later package?

## Handoff note

State the next queue item that this Pull Request unlocks.

---

# 12. Review and Merge Rules

At least one teammate reviews every Pull Request. The reviewer and package owner confirm the required checks before merge. For changes to a shared contract, include the primary developer of each affected workstream in the review.

Do not merge when:

- The build or relevant tests fail.
- The branch contains unrelated changes.
- The work package is only a visual placeholder.
- Required persistence or permissions are missing.
- New mock data is presented as backend integration.
- A shared-file conflict is unresolved.
- A migration, RLS policy, or Storage policy is unreviewed.
- Secrets or private environment files are staged.

Prefer squash merge for one-package Pull Requests.

Merge one Pull Request at a time. After each merge, verify `main` before merging another dependent or overlapping Pull Request.

---

# 13. Updating and Resolving Conflicts

After a merge and before the next task:

```bash
git switch main
git pull origin main
git switch -c <next-branch-name>
```

To reduce conflicts:

- Do not work on the same page or contract simultaneously.
- Do not auto-format the whole repository.
- Do not reorder imports or rename files outside the package.
- Do not change lockfiles unless dependencies actually changed.
- Merge shared contracts before dependent UI integrations.
- Keep branches short and Pull Requests focused.

If a conflict occurs:

1. Stop editing the conflicting files.
2. Identify what each side changed and which behavior is required.
3. Ask the owners when intent is unclear.
4. Resolve line by line; never blindly choose “accept all.”
5. Rebuild and retest the combined behavior.
6. Include the resolution in the Pull Request report.

---

# 14. Handoff and Takeover

When a developer becomes unavailable, they must provide, when possible:

```text
Work package:
Branch and latest commit:
What works:
What remains:
Changed files:
Database or shared-contract impact:
Known errors:
Commands/tests already run:
Recommended next step:
```

The replacement developer must continue the same branch only when the history is clean and understood. Otherwise, preserve the old branch and create a new task branch from `main`, then selectively reapply reviewed changes.

Do not run two takeovers in parallel.

---

# 15. Definition of Done

A work package is complete only when:

- All requirements in `06_IMPLEMENTATION_ORDER.md` are satisfied.
- The behavior is real, persistent, and correctly authorized when applicable.
- Loading, empty, validation, error, and success states exist where relevant.
- Existing behavior remains intact.
- Desktop and mobile behavior are checked where relevant.
- The build succeeds.
- Relevant tests pass or missing coverage is explicitly disclosed.
- The Pull Request is reviewed and merged.
- The roadmap and current implementation status are updated when necessary.

Completing all required packages in the three queues, their integration gates, and release verification completes the approved PLV NaviSync system scope.

---

# 16. Emergency Revert Rule

If a merge breaks `main`:

1. Stop new merges.
2. Identify the breaking Pull Request.
3. Revert it when a fast safe fix is not certain.
4. Restore a passing build.
5. Fix the problem in a new task branch.
6. Review and test again before merging.

---

# 17. Short Team Agreement

```text
Tatlo ang balanced workstreams natin at bawat developer may sariling ordered feature queue sa 06_IMPLEMENTATION_ORDER.md. Walang main developer; bawat isa ang primary owner ng assigned workstream niya. Gawin in order ang mga NEXT o READY packages at hindi na kailangang maghintay ng bagong assignment bawat task. One complete feature package per branch at Pull Request, at bawal mag-code o mag-push directly sa main. Basahin lagi ang latest project MD files bago mag-prompt. Mag-coordinate lang kapag blocked, may shared file/database change, may handoff, o ready na ang PR. Puwedeng i-take over ng iba ang package kapag unavailable ang owner, basta may malinaw na handoff at iisang active implementation lang.
```
