# PLV NaviSync

# Freebuff and AI Coding Rules

**Version:** 1.1
**Status:** Frozen AI Development Rules
**Purpose:** Control how Freebuff, Codex, and other AI coding assistants work inside PLV NaviSync.

These rules are mandatory for every AI-assisted coding session.

---

# 1. Required Reading Order

Before making any code change, the AI must read:

```text
docs/00_PROJECT_CONTEXT.md
docs/01_SYSTEM_FEATURES.md
docs/02_SYSTEM_ARCHITECTURE.md
docs/03_DATABASE_SUPABASE.md
docs/04_TEAM_RULES.md
docs/05_FREEBUFF_RULES.md
docs/06_IMPLEMENTATION_ORDER.md
```

If `06_IMPLEMENTATION_ORDER.md` is still empty, the AI must not guess the next feature. It must wait for a specific task.

The AI must treat these documents as the project's source of truth.

Priority when documents conflict:

1. `01_SYSTEM_FEATURES.md`
2. `03_DATABASE_SUPABASE.md`
3. `02_SYSTEM_ARCHITECTURE.md`
4. `04_TEAM_RULES.md`
5. `05_FREEBUFF_RULES.md`
6. `06_IMPLEMENTATION_ORDER.md`

If a requested task conflicts with the documents, the AI must explain the conflict before changing code.

---

# 2. Project Identity

PLV NaviSync is a multi-campus navigation and digital campus management system for Pamantasan ng Lungsod ng Valenzuela.

The system must remain focused on:

- Campus navigation
- Campus map authoring
- Building and floor management
- Search and campus directory
- Accessibility routing
- Emergency routing
- Events and announcements
- Issue reporting
- Admin operations
- Map validation and publishing

The AI must not add unrelated systems such as:

- Enrollment
- Grades
- Attendance
- Payroll
- Learning management
- Library management
- Live GPS tracking
- Indoor positioning
- Voice navigation
- AR navigation
- 3D navigation
- Generic AI chatbot

---

# 3. Actual Technology Stack

The project uses:

```text
React 18
Vite 6
TypeScript
React Router 7
Tailwind CSS 4
Motion
Lucide React
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
Custom SVG campus map
Custom SVG Map Builder
Custom A* pathfinding
Vitest
Testing Library
Playwright for future E2E tests
```

The AI must not convert the project to Next.js.

The AI must not introduce:

- Next.js App Router
- Server Components
- Redux
- Zustand
- A replacement map library
- A replacement Map Builder
- A second UI framework
- A second Supabase client
- A separate custom backend unless explicitly approved

---

# 4. Mandatory Session Behavior

At the beginning of a session, the AI must:

1. Read the required documentation.
2. Inspect the exact files related to the task.
3. Identify the active task owner and short-lived branch.
4. Identify shared files that may be affected.
5. State the intended files to modify.
6. Preserve existing architecture.
7. Implement only the requested task.

The AI must not begin by rewriting or reorganizing unrelated code.

---

# 5. Scope Restriction

Every prompt must define allowed files or folders.

The AI may modify only those files unless a required dependency makes another change unavoidable.

When another file is required, the AI must:

1. Explain why.
2. Identify the exact file.
3. Make the smallest possible change.
4. Report it clearly after implementation.

The AI must not make opportunistic improvements outside the task.

---

# 6. Forbidden Broad Actions

The AI must never perform these actions unless explicitly instructed through a dedicated reviewed task:

```text
Improve the whole project
Refactor the entire codebase
Redesign all pages
Replace the project structure
Rename major folders
Replace React Router
Replace the Map Builder
Replace the SVG map
Change all styling
Format the entire repository
Remove all mock data at once
Connect every module to Supabase at once
Delete legacy code without an import audit
Upgrade all dependencies
Rewrite all services
```

Large changes must be divided into reviewable tasks.

---

# 7. Existing Code Preservation

The AI must preserve working behavior.

Before replacing code, determine:

- What currently works
- Which pages consume it
- Which types depend on it
- Whether it is shared
- Whether a test covers it
- Whether local storage or mock data is still temporarily required

The AI must not delete an existing implementation simply because a new approach appears cleaner.

Migration must be gradual and testable.

---

# 8. Active and Legacy Implementations

The active Map Builder is:

```text
src/components/map-builder/
```

The legacy experimental Map Builder is:

```text
src/components/map-builder-v2/
```

Rules:

- Add features only to the active Map Builder.
- Do not route or import the legacy Map Builder.
- Do not delete the legacy folder except during an explicit cleanup task after verifying no imports remain.

The active shared UI library is:

```text
src/components/ui/
```

The mostly legacy Radix/shadcn-style library is:

```text
src/app/components/ui/
```

Reuse the active shared UI first.

---

# 9. Supabase Rules

The browser Supabase client must live in:

```text
src/lib/supabase.ts
```

The AI must not create another client.

The duplicate legacy file:

```text
src/services/supabase.ts
```

must not be expanded or used for new work.

Required environment variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never place these in source code.

Never expose:

- Service role key
- Database password
- Private secrets

Never disable RLS to make a feature work.

Never use the service-role key in React code.

---

# 10. Database Rules

The authoritative backend design is:

```text
docs/03_DATABASE_SUPABASE.md
```

Executable schema changes belong in numbered migrations under:

```text
supabase/migrations/
```

The AI must not run or reuse:

```text
supabase/archive/001_initial_schema_legacy.sql
```

For every schema change:

1. Update the design document if the design changes.
2. Add a new migration.
3. Add constraints and indexes.
4. Add or update RLS.
5. Generate or update TypeScript database types.
6. Update services.
7. Test guest, student, and admin permissions.

Do not create undocumented tables or columns.

---

# 11. Data Access Rules

Pages and visual components must not call:

```ts
supabase.from(...)
```

directly.

Correct flow:

```text
Page
  → Hook or Service
  → Supabase Client
```

Services own:

- Reads
- Creates
- Updates
- Archives
- Storage operations
- Query filtering
- Structured errors
- Cross-table workflows

Services must not:

- Show toasts
- Navigate routes
- Render UI
- Manipulate DOM
- Hide errors silently

---

# 12. Mock Data Migration Rules

Mock data is temporary.

Do not remove all mock data globally.

For one module at a time:

1. Connect the service.
2. Verify read operations.
3. Verify write operations.
4. Verify RLS.
5. Update the page.
6. Test loading, empty, error, and data states.
7. Remove the production mock dependency.
8. Retain test fixtures separately where needed.

A feature is not complete if it silently falls back to mock data in production.

---

# 13. TypeScript Rules

The AI must:

- Use TypeScript consistently.
- Avoid `any`.
- Define explicit domain types.
- Reuse existing types when correct.
- Map database rows to UI models when shapes differ.
- Treat generated Supabase database types as generated files.
- Avoid unsafe type assertions.
- Handle nullable database values.
- Preserve strict naming consistency.

Do not create duplicate `Building`, `Floor`, `Report`, or related types without checking existing definitions.

---

# 14. React Rules

The AI must:

- Keep components focused.
- Prefer composition over very large new components.
- Reuse existing hooks.
- Avoid unnecessary global context.
- Avoid prop drilling only when a shared provider is justified.
- Preserve lazy-loaded routes.
- Clean up subscriptions and listeners.
- Avoid effects that write on every render.
- Memoize expensive map operations only when useful.
- Avoid premature optimization.

Large existing files may be split only through a dedicated refactor task with regression testing.

---

# 15. UI and UX Rules

All new UI must match the existing PLV NaviSync design.

The AI must reuse:

- Existing colors and theme tokens
- Existing typography
- Existing spacing
- Existing button styles
- Existing dialog patterns
- Existing loading states
- Existing animation tokens
- Lucide icons

Every data-driven screen must include:

- Loading state
- Empty state
- Error state
- Success feedback where needed
- Disabled state during mutation
- Validation messages
- Mobile behavior
- Desktop behavior
- Keyboard and focus support where applicable

Do not use emojis as interface icons.

Do not create generic AI-looking gradient-heavy UI that conflicts with the existing design.

---

# 16. Accessibility Rules

The AI must preserve or improve:

- Semantic HTML
- Labels
- ARIA attributes
- Keyboard operation
- Focus visibility
- Contrast
- Reduced-motion support
- Touch target size
- Error announcements
- Screen-reader-readable button names

Accessibility mode and accessible routing must be functional, not decorative.

---

# 17. Map and Navigation Rules

Do not replace these existing engines:

```text
src/lib/pathfinding.ts
src/lib/indoorPathfinding.ts
src/lib/combinedPathfinding.ts
```

The AI may modify them only for a specific navigation task.

Pathfinding must support:

- Outdoor paths
- Indoor routes
- Floor transitions
- Distance
- Estimated travel time
- Step instructions
- Accessibility filtering
- Emergency-safe filtering
- Disconnected route handling

The system does not require live GPS, voice navigation, or live rerouting.

Published Supabase map data should gradually replace hardcoded graph assumptions.

---

# 18. Map Builder Rules

The Map Builder must remain Canva-like, not CAD-like.

Priorities:

- Easy to learn
- Clear tool states
- Direct manipulation
- Undo/redo
- Validation
- Draft save
- Publish flow
- Responsive enough for supported admin devices
- Strong error prevention

When modifying the Map Builder:

- Preserve keyboard shortcuts.
- Preserve layer behavior.
- Preserve undo/redo.
- Preserve selection behavior.
- Preserve existing canvas geometry.
- Test publishing and public map consumption.
- Do not mix public map state with draft state.

---

# 19. Authentication Rules

Guests are unauthenticated.

Authenticated roles:

```text
student
admin
```

The AI must not store passwords manually.

Use Supabase Auth for:

- Registration
- Login
- Logout
- Session restoration
- Password reset
- Email verification

Frontend route guards improve UX.

RLS is the true authorization layer.

Public registration must never create an administrator.

Verified authentication checkpoint as of August 5, 2026:

- Real Supabase administrator and student login work.
- Sessions restore after refresh.
- Logout and role-based route protection work.
- Guest access remains available.
- Demo Administrator and Demo Student only autofill the normal login form.

Do not replace or reimplement these verified flows unless the assigned task specifically requires a correction.

---

# 20. Error Handling Rules

Services should throw or return structured errors.

The UI must distinguish:

- Validation error
- Unauthorized
- Forbidden
- Not found
- Conflict
- Network error
- Unknown error

Never swallow errors with empty `catch` blocks.

Never show raw database or Supabase internals to end users.

Log technical details only in appropriate development logging.

---

# 21. Performance Rules

The AI must:

- Preserve route-level code splitting.
- Debounce search.
- Avoid fetching entire tables unnecessarily.
- Fetch only required columns where practical.
- Use pagination for large admin lists.
- Use database indexes defined in the schema.
- Avoid rerendering the full map for unrelated UI state.
- Avoid repeated pathfinding calculations for unchanged inputs.
- Avoid loading drafts on public pages.
- Avoid large uncompressed uploads.

Do not optimize by sacrificing correctness.

---

# 22. Security Rules

The AI must enforce:

- Least privilege
- RLS on exposed tables
- Safe storage policies
- Input validation
- Role verification
- No secret exposure
- Safe error messages
- Audit logs for important admin actions

Admin checks must not rely solely on hidden buttons or client-side role values.

Do not use `dangerouslySetInnerHTML` with untrusted content.

---

# 23. Testing Requirements

Before marking a task complete, the AI must run available checks.

Minimum:

```bash
pnpm build
```

When test scripts exist:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Relevant tests must be added or updated for:

- Pathfinding
- Validation
- Services
- Authentication
- RLS-sensitive workflows
- Publishing
- Reports
- Critical regressions

The AI must report commands actually run and their results.

It must not claim tests passed when they were not executed.

---

# 24. Dependency Rules

Do not install a dependency when existing tools can solve the task.

Before adding a package:

1. Check existing dependencies.
2. Explain why it is required.
3. Confirm it does not duplicate another library.
4. Update the correct lockfile.
5. Verify build size and compatibility.

Do not update unrelated dependencies.

The project uses pnpm as the preferred package manager.

Do not mix package managers during normal development.

---

# 25. File and Naming Rules

Use existing naming conventions.

Preferred:

```text
PascalCase.tsx for React components
camelCase.ts for utilities and services
useSomething.ts for hooks
somethingService.ts for services
UPPER_SNAKE_CASE for true constants
```

Do not create vague files such as:

```text
helpers2.ts
newUtils.ts
finalFix.ts
temp.ts
test2.ts
```

Do not create root-level patch scripts unless explicitly approved.

---

# 26. AI Output Requirements

After implementation, the AI must report:

## Summary

What was implemented?

## Modified files

Exact files changed.

## Behavior

What now works?

## Tests

Commands run and results.

## Database impact

Migration, RLS, storage, or generated types changed?

## Remaining issues

Anything incomplete or risky?

The AI must not bury unrelated modifications.

---

# 27. Standard Bootstrap Prompt

Use this at the beginning of a new Freebuff session:

```text
Before making any changes, read these files in order:

1. docs/00_PROJECT_CONTEXT.md
2. docs/01_SYSTEM_FEATURES.md
3. docs/02_SYSTEM_ARCHITECTURE.md
4. docs/03_DATABASE_SUPABASE.md
5. docs/04_TEAM_RULES.md
6. docs/05_FREEBUFF_RULES.md
7. docs/06_IMPLEMENTATION_ORDER.md

Treat them as the PLV NaviSync source of truth.

Confirm:
- the project is React + Vite, not Next.js
- the active Map Builder is src/components/map-builder
- the browser Supabase client belongs in src/lib/supabase.ts
- pages must use services instead of direct Supabase queries
- you may modify only the files explicitly allowed by my next prompt
- you must preserve existing working behavior
- you must run the build before finishing

After reading, summarize the relevant constraints in no more than 10 lines and wait for my task.
```

---

# 28. Standard Task Prompt Template

```text
Read the PLV NaviSync docs first.

Assigned module:
[MODULE NAME]

Task owner:
[DEVELOPER NAME OR NUMBER]

Git branch:
[SHORT-LIVED TASK BRANCH CREATED FROM LATEST MAIN]

Allowed files:
- [FILE OR FOLDER]
- [FILE OR FOLDER]

Task:
[ONE SPECIFIC TASK]

Acceptance criteria:
- [RESULT]
- [RESULT]
- [RESULT]

Do not:
- modify files outside the allowed scope
- restructure the project
- create duplicate services, types, or components
- add mock data as a completed implementation
- weaken authentication or RLS
- remove working features

Before finishing:
- run pnpm build
- run relevant tests
- list modified files
- explain database impact
- disclose unresolved issues
```

---

# 29. Stop Conditions

The AI must stop and explain before proceeding when:

- The request conflicts with the frozen feature scope.
- The request conflicts with files owned by another active task.
- A migration conflicts with the database blueprint.
- A secret or service-role key would be exposed.
- The requested code would disable RLS.
- The active implementation cannot be identified.
- The task would require a major unapproved restructure.
- The build is already failing for reasons unrelated to the task.
- The AI cannot verify whether deleting a file is safe.

---

# 30. AI Definition of Done

An AI-assisted task is complete only when:

- The task is within scope.
- Only intended files changed.
- Architecture rules were followed.
- The result is functional, not a placeholder.
- Persistence works when required.
- RLS and roles are respected.
- Loading, empty, error, and success states exist.
- Responsive behavior is preserved.
- Build succeeds.
- Relevant tests pass or missing tests are clearly disclosed.
- The final report is accurate.
