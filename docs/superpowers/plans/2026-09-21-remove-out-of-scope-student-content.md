# Remove Out-of-Scope Student Content Implementation Plan

> **For agentic workers:** Execute this plan inline with a test-first loop. Preserve unrelated dirty worktree changes and do not commit or push.

**Goal:** Remove Announcements and schedule/class content from the student-facing experience while keeping the admin announcement workflow and in-scope campus navigation features intact.

**Architecture:** Treat the existing student Home as a focused campus-navigation dashboard. Remove schedule and announcement presentation plus their unused client-side dependencies, remove the public announcement route and student Navbar entry, and leave admin announcement management/services available for unrelated admin workflows. Add focused UI/route regression coverage before implementation.

**Tech Stack:** React, React Router, TypeScript, Tailwind CSS, Vitest, Testing Library, Vite.

## Global Constraints

- Do not change the existing PLV visual language, primary student navigation labels, map behavior, report flow, favorites, settings, or student-organization event routes.
- Remove only student/public Announcements and student Home schedule/classes; keep `/admin-dashboard/announcements` and its service dependencies for admin workflows.
- Preserve existing uncommitted Event Builder and other user worktree changes.
- Production code must be preceded by a failing focused test.
- No commit, push, reset, checkout, or broad cleanup.

---

### Task 1: Add regression coverage for the reduced student surface

**Files:**
- Modify: `src/components/layout/__tests__/Navbar.test.tsx`
- Create: `src/pages/__tests__/StudentHomePage.scope.test.tsx`
- Create: `src/app/__tests__/studentScopeRoutes.test.tsx`

**Interfaces:**
- Consumes the current `Navbar`, `StudentHomePage`, and exported `router` behavior.
- Produces failing tests that require no student Navbar Announcements link, no Home schedule/announcement content, and no public root announcement route.

- [ ] **Step 1: Add the Navbar assertion**

In the existing student navigation test, assert:

```tsx
expect(screen.queryByRole("link", { name: /Announcements/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Add the Home scope test**

Render `StudentHomePage` in a `MemoryRouter`, mock `useStudentAuth` with a regular student, mock `useCampusData` with an empty campus list, mock `BuildingDetailModal` to return `null`, advance the existing 400ms loading timer, then assert that `Today's Schedule`, `NEXT CLASS`, `All classes done`, `Announcements`, and a `Schedule` link are absent while the Buildings section remains.

- [ ] **Step 3: Add the route contract test**

Inspect the root route in `router.routes` and assert that its child routes do not contain `path: "announcements"`. Do not assert against the admin route, which must remain available.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
node node_modules\\vitest\\vitest.mjs run src/components/layout/__tests__/Navbar.test.tsx src/pages/__tests__/StudentHomePage.scope.test.tsx src/app/__tests__/studentScopeRoutes.test.tsx --reporter=dot --maxWorkers=1
```

Expected: the new assertions fail because the current student Navbar, Home, and public root route still expose the removed content.

### Task 2: Remove schedule and announcement content from Student Home

**Files:**
- Modify: `src/pages/StudentHomePage.tsx`
- Delete: `src/data/mockSchedule.ts`

**Interfaces:**
- Consumes the existing student auth and campus data hooks.
- Produces a Home page containing greeting/date, map search, three in-scope quick actions, Buildings, and role-gated My Events without schedule or announcement data.

- [ ] **Step 1: Remove schedule dependencies**

Delete the `useNavigate` dependency used only for classes, the `MOCK_SCHEDULE` import, schedule calculations, class navigation helper, semester display, Next Class/All Classes Done card, and Today's Schedule list. Remove now-unused schedule icons and helpers while retaining `CalendarDays` for the current-date label and My Events.

- [ ] **Step 2: Remove the mobile Schedule shortcut**

Change the quick-action grid from four columns to three and keep only Navigate, Buildings, and Report. Do not leave an anchor or label that points to removed schedule content.

- [ ] **Step 3: Remove the Home announcement preview**

Delete the announcement preview block, its `/announcements` View All link, and the related Bell import. Keep the Buildings and student-organization My Events blocks adjacent with the existing spacing system.

- [ ] **Step 4: Run the Home scope test**

Run the Task 1 focused command and expect the StudentHome assertions to pass while Navbar and route assertions remain red until Task 3.

### Task 3: Remove student/public announcement entry points

**Files:**
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/app/routes.tsx`
- Delete: `src/pages/AnnouncementsPage.tsx`

**Interfaces:**
- Consumes existing admin announcement route definitions and services unchanged.
- Produces no student Navbar announcement bell and no public root `/announcements` route, while preserving `/admin-dashboard/announcements`.

- [ ] **Step 1: Remove the student Navbar bell**

Delete only the authenticated student link to `/announcements` and its unused Bell import. Do not alter report notification badges or the admin navigation.

- [ ] **Step 2: Remove the public route import and child route**

Delete the `AnnouncementsPage` lazy import and the public-layout child route. Keep `AdminAnnouncementsPage`, its lazy import, and its `/admin-dashboard/announcements` child route.

- [ ] **Step 3: Run the focused tests and verify GREEN**

Run the focused command from Task 1. Expected: all new and existing targeted Navbar, Home, and route tests pass.

### Task 4: Scope and build verification

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Search for student/public leftovers**

Run:

```powershell
rg -n -e 'AnnouncementsPage|/announcements|MOCK_SCHEDULE|Today's Schedule|NEXT CLASS|All classes done|label: "Schedule"' src/app src/pages/StudentHomePage.tsx src/components/layout/Navbar.tsx src/components/layout/MobileBottomNav.tsx
```

Expected: no public/student UI references remain; admin announcement references and unrelated publishing schedule references may remain outside the scoped files.

- [ ] **Step 2: Run focused tests and production build**

Run:

```powershell
node node_modules\\vitest\\vitest.mjs run src/components/layout/__tests__/Navbar.test.tsx src/components/layout/__tests__/MobileBottomNav.test.tsx src/pages/__tests__/StudentHomePage.scope.test.tsx src/app/__tests__/studentScopeRoutes.test.tsx --reporter=dot --maxWorkers=1
node node_modules/vite/bin/vite.js build
```

Expected: focused tests pass and Vite completes successfully, with only previously known warnings if present.

- [ ] **Step 3: Record the updated audit**

Update the persistent findings to remove the deleted schedule/announcement placeholders from the active student audit and list only remaining in-scope gaps: settings persistence, profile editing, favorites account sync, report metadata/status, building-detail actions/deep links, and Help Center support behavior.

- [ ] **Step 4: Report the result**

Summarize changed files, test/build evidence, any pre-existing warnings, and the refreshed mobile/desktop recommendations. State clearly that admin announcement management was intentionally preserved.
