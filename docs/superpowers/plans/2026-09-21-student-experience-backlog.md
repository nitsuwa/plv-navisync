# Student Experience Backlog Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first checkpoints. Steps use checkbox syntax for tracking.

**Goal:** Replace the remaining student-side placeholders with persistent account, profile, favorite, report, building-action, support, and responsive behavior.

**Architecture:** Reuse the existing Supabase tables/RLS and add focused client service boundaries. Authenticated writes stay remote and surface errors; local storage is only an account-scoped offline/demo fallback. Existing event-builder and out-of-scope schedule/announcement changes remain untouched.

**Tech Stack:** React 18, TypeScript, React Router, Vitest, Supabase JS, Tailwind-style utility classes, Motion, Sonner.

## Global Constraints

- Do not reintroduce student schedules/classes or public announcements.
- Do not reset, clean, stage, commit, or push unrelated existing work.
- Use `apply_patch` for source edits.
- Every production behavior change gets a failing test before implementation.
- Use the existing `profiles`, `favorites`, `reports`, `report_history`, `report_images`, and `avatars` contracts; do not add a new database table unless a verified schema gap blocks the behavior.
- Authenticated remote failures must not be reported as local success.

---

### Task 1: Account primitives and persistence contracts

**Files:**

- Create: `src/services/studentPreferencesService.ts`
- Create: `src/services/studentProfileService.ts`
- Modify: `src/services/studentAccountService.ts`
- Modify: `src/lib/studentAccount.ts`
- Test: `src/services/__tests__/studentPreferencesService.test.ts`
- Test: `src/services/__tests__/studentProfileService.test.ts`
- Test: `src/services/__tests__/studentAccountService.test.ts`
- Modify: `src/lib/__tests__/studentAccount.test.ts`

**Interfaces:**

- `StudentNotificationPreferences = { mapUpdates: boolean; reportStatus: boolean; campusEvents: boolean }`.
- `loadStudentPreferences(client?)` and `saveStudentPreferences(preferences, client?)`.
- `updateStudentPassword(currentPassword, nextPassword, client?)`.
- `updateStudentProfile(input, client?)` and `uploadStudentAvatar(file, client?)`.
- `getSavedBuildingIdsAsync(client?)` and `toggleSaveBuilding(buildingId, campusId?, client?)`.
- `normalizeReportStatus(status)` and `buildSupportMailto(input)` remain pure/testable helpers in their owning modules.

- [ ] **Step 1: Write failing tests**

Cover default preferences, metadata round-trip, current-password verification before update, safe profile updates, avatar path scoping, empty local favorites, and account-scoped favorite keys. Assert calls against injected Supabase clients rather than mocking the production module.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/services/__tests__/studentPreferencesService.test.ts src/services/__tests__/studentProfileService.test.ts src/services/__tests__/studentAccountService.test.ts src/lib/__tests__/studentAccount.test.ts --reporter=dot --maxWorkers=1
```

Expected: failures because the new exports and persistence behavior do not exist.

- [ ] **Step 3: Implement the smallest service contracts**

Use `auth.getUser`, `auth.updateUser`, `auth.signInWithPassword`, `profiles.update`, and the existing `avatars` bucket. For favorites, query/delete by authenticated `user_id` and `building_id`; resolve `campus_id` only when the caller does not provide it. Local fallback keys include the authenticated user ID or `guest` and never contain demo building IDs.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same command. Expected: all account primitive tests pass.

### Task 2: Auth context, Settings, and Profile

**Files:**

- Modify: `src/contexts/StudentAuthContext.tsx`
- Modify: `src/pages/StudentSettingsPage.tsx`
- Modify: `src/pages/StudentProfilePage.tsx`
- Test: `src/pages/__tests__/StudentSettingsPage.test.tsx`
- Test: `src/pages/__tests__/StudentProfilePage.test.tsx`

**Interfaces:**

- `useStudentAuth()` exposes `refreshProfile(): Promise<Profile | null>`.
- Settings loads preferences on authenticated mount, saves each toggle through the service, and renders an error/retry message when the save fails.
- Password form validates current/new/confirm values, calls the real service, and reports success only after the service resolves.
- Profile saves the name to `profiles`, uploads and signs an avatar URL, refreshes auth context, and derives activity from reports/recent destinations.

- [ ] **Step 1: Write failing page tests**

Assert that toggling a notification calls the persistence service, a rejected save shows an error and keeps the previous value, password update calls the service, profile save calls the profile service, avatar input is wired, and report/recent-destination records render activity.

- [ ] **Step 2: Run the page tests and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/pages/__tests__/StudentSettingsPage.test.tsx src/pages/__tests__/StudentProfilePage.test.tsx --reporter=dot --maxWorkers=1
```

Expected: failures because the pages currently use local-only state and no profile handlers.

- [ ] **Step 3: Implement context/page behavior**

Add `refreshProfile` to the provider, load preferences before rendering the notification panel, add pending/error states, replace fake password success with `updateStudentPassword`, and replace the empty activity constant with derived items from real student data. Use signed avatar URLs and fall back to initials when unavailable.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same command and the existing Navbar tests. Expected: the new page tests and existing layout tests pass.

### Task 3: Favorites and Building Details action parity

**Files:**

- Modify: `src/pages/BuildingDetailsPage.tsx`
- Modify: `src/components/ui/BuildingDetailModal.tsx`
- Modify: `src/pages/StudentFavoritesPage.tsx`
- Modify: `src/pages/StudentHomePage.tsx`
- Modify: `src/pages/CampusMapPage.tsx`
- Test: `src/pages/__tests__/BuildingDetailsPage.actions.test.tsx`
- Test: `src/components/ui/__tests__/BuildingDetailModal.actions.test.tsx`
- Test: `src/services/__tests__/studentAccountService.test.ts`

**Interfaces:**

- Every Directions action navigates to `/map?buildingId=<encoded id>`.
- Building Details and modal Save call the same account service and show toast feedback.
- Share copies a canonical `/buildings/<id>` URL and reports clipboard failures.
- Report Issue opens `ReportModal` or navigates to `/student/reports?building=<id>`; the Reports page consumes that query.
- Home, map, and Favorites pass the active campus ID when available.

- [ ] **Step 1: Write failing action tests**

Assert deep-link destinations, clipboard/share feedback, report-form opening, Save persistence, and that Home/Favorites modal controls expose Save and Report actions.

- [ ] **Step 2: Run focused action tests and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/pages/__tests__/BuildingDetailsPage.actions.test.tsx src/components/ui/__tests__/BuildingDetailModal.actions.test.tsx --reporter=dot --maxWorkers=1
```

Expected: failures for the current no-op buttons and `dest`/`?b=` link mismatches.

- [ ] **Step 3: Implement action parity**

Use the existing `ReportModal`, `useToast`, `studentAccountService`, and canonical map query. Remove duplicate code/code-lowercase favorite mutations from the map callback so one click produces one persisted favorite.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same tests plus existing map controls and Favorites tests. Expected: all pass.

### Task 4: Reports normalization, hydration, and contextual flow

**Files:**

- Modify: `src/services/reportService.ts`
- Modify: `src/pages/StudentReportsPage.tsx`
- Modify: `src/components/map/ReportModal.tsx`
- Test: `src/services/__tests__/reportService.test.ts`
- Test: `src/pages/__tests__/StudentReportsPage.test.tsx`

**Interfaces:**

- `IssueReport` includes normalized status, `buildingName`, `floorLabel`, `imageUrl`, and `updates`.
- Database report inserts create the report row before uploading private images under `<reportId>/...`, then insert `report_images`.
- Student history hydrates names, signed image URLs, and `report_history` updates without failing the entire list if one decoration query fails.
- Reports UI filters `pending`, `under_review`, `in_progress`, `resolved`, and `rejected` using the same labels/progress model.
- `?building=<id>` opens the existing contextual report modal and clears the query on close.

- [ ] **Step 1: Write failing tests**

Cover status aliases, report row mapping, image path/report-image insert order, location/image/history hydration, canonical filters, and query-driven report opening.

- [ ] **Step 2: Run focused report tests and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/services/__tests__/reportService.test.ts src/pages/__tests__/StudentReportsPage.test.tsx --reporter=dot --maxWorkers=1
```

Expected: failures for missing metadata/status handling and query prefill.

- [ ] **Step 3: Implement report service and UI**

Keep the text report available when an image upload fails, map report-history rows into the existing timeline shape, and render an honest error state for failed reloads. Use location-aware map links with `buildingId`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same command plus existing map `ReportModal` tests. Expected: all pass.

### Task 5: Help Center support handoff

**Files:**

- Create: `src/lib/support.ts`
- Modify: `src/pages/HelpCenterPage.tsx`
- Test: `src/lib/__tests__/support.test.ts`
- Test: `src/pages/__tests__/HelpCenterPage.test.tsx`

**Interfaces:**

- `buildSupportMailto({ name, email, category, subject, message })` returns a correctly encoded `mailto:` URL.
- Help Center labels the assistant as a campus navigation guide, changes service links to `/map?buildingId=...`, and shows “Open email draft” plus “Copy support details” after validation.

- [ ] **Step 1: Write failing tests**

Assert mailto encoding, canonical service URLs, and no fake “Inquiry Submitted” server claim.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/lib/__tests__/support.test.ts src/pages/__tests__/HelpCenterPage.test.tsx --reporter=dot --maxWorkers=1
```

- [ ] **Step 3: Implement the support handoff**

Keep the existing FAQ and local answer guide, but describe it accurately. The submitted state includes the prepared recipient, subject, and message; the email link opens the user’s mail client, and copy is the fallback.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same command and existing Help Center coverage.

### Task 6: Responsive/accessibility polish and final verification

**Files:**

- Modify: `src/pages/StudentFavoritesPage.tsx`
- Modify: `src/pages/StudentReportsPage.tsx`
- Modify: `src/pages/StudentProfilePage.tsx`
- Modify: `src/pages/StudentSettingsPage.tsx`
- Modify: `src/pages/StudentHomePage.tsx`
- Modify: `src/components/ui/BuildingDetailModal.tsx`
- Modify: `src/pages/BuildingDetailsPage.tsx`
- Test: relevant page/component tests and existing responsive layout tests

- [ ] **Step 1: Write failing accessibility/layout assertions**

Assert student pages expose larger desktop containers, Favorites/Reports use a desktop grid, icon-only controls have accessible names, notification tabs expose selected state, and mobile action rows retain minimum touch-safe classes.

- [ ] **Step 2: Run focused tests and verify RED**

Run the targeted page/component test list and record the expected failures.

- [ ] **Step 3: Implement only targeted polish**

Use responsive utility classes, semantic labels, `aria-pressed`/`aria-selected`, status roles, safe-area padding, and visible focus styles without redesigning unrelated public/admin pages.

- [ ] **Step 4: Run the final verification set**

Run:

```powershell
node node_modules\vitest\vitest.mjs run src/services/__tests__/studentPreferencesService.test.ts src/services/__tests__/studentProfileService.test.ts src/services/__tests__/studentAccountService.test.ts src/services/__tests__/reportService.test.ts src/lib/__tests__/studentAccount.test.ts src/lib/__tests__/support.test.ts src/pages/__tests__/StudentSettingsPage.test.tsx src/pages/__tests__/StudentProfilePage.test.tsx src/pages/__tests__/BuildingDetailsPage.actions.test.tsx src/components/ui/__tests__/BuildingDetailModal.actions.test.tsx src/pages/__tests__/StudentReportsPage.test.tsx src/pages/__tests__/HelpCenterPage.test.tsx src/components/layout/__tests__/Navbar.test.tsx src/components/layout/__tests__/MobileBottomNav.test.tsx --reporter=dot --maxWorkers=1
node node_modules/vite/bin/vite.js build
git diff --check
```

Expected: focused tests and build exit 0; only known Vite chunk warnings and line-ending notices may remain.

- [ ] **Step 5: Update planning/findings and report actual status**

Record changed files, verification counts, any pre-existing full-suite/typecheck limitations, and the fact that no commit or push was performed.
