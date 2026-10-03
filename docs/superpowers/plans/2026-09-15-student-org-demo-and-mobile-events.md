# Student Org Demo Login and Mobile My Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one centered event-creation action on the Student Org My Events empty state and add a local Demo Student Org quick-fill login option that remains usable on mobile.

**Architecture:** Reuse the existing `DEMO_ACCOUNTS` data-driven selector and keep credentials in the ignored `.env.local` file. Remove only the header-level event action from `StudentMyEventsPage`; keep the existing `EmptyState` action as the sole creation entry point and verify its responsive-safe classes.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Vite, Supabase Auth.

## Global Constraints

- The demo option is visible only when `VITE_ENABLE_DEMO_LOGIN` is exactly `true` and both org credential values are non-empty.
- Demo credentials stay in ignored `.env.local`; do not hardcode them in tracked source files.
- Selecting a demo account only fills the form; normal `supabase.auth.signInWithPassword()` and profile/role checks remain unchanged.
- No Supabase email-verification, authorization, role, or RLS behavior is bypassed.
- Preserve unrelated existing worktree changes; modify only files listed in the task being executed.

## File Map

- Modify `src/pages/StudentMyEventsPage.tsx`: remove the duplicate header action and retain the centered empty-state action with mobile-safe sizing.
- Modify `src/pages/AdminLoginPage.tsx`: rename the existing org applicant selector label to `Demo Student Org`; keep its existing env-gated data flow.
- Modify `src/pages/__tests__/StudentMyEventsAccess.test.tsx`: cover the Student Org empty state button count and action presence.
- Modify `src/lib/__tests__/demoAccountConfig.test.ts`: cover the requested Demo Student Org credential values through the pure helper.
- Modify `.env.local` (ignored local file only): set the developer-provided demo toggle, email, and password.

### Task 1: Keep only the centered My Events creation action

**Files:**
- Modify: `src/pages/StudentMyEventsPage.tsx` (page header and empty-state render)
- Test: `src/pages/__tests__/StudentMyEventsAccess.test.tsx`

**Interfaces:**
- Consumes: existing `useStudentAuth`, `eventOverlayService.listEventOverlays`, and `EmptyState` behavior.
- Produces: Student Org users see exactly one `Create event` button when there are no proposals; regular students continue redirecting to `/home`.

- [ ] **Step 1: Write the failing test**

Extend the existing `StudentMyEventsPage access` suite with a Student Org empty-state test. Set `authState.isStudentOrg = true`, render `/student/events`, wait for the existing empty-state heading, then assert that there is exactly one button named `Create event` and no button named `New event`:

```tsx
it("keeps one centered create action for an empty Student Org event list", async () => {
  authState.isStudent = true;
  authState.isStudentOrg = true;

  render(
    <MemoryRouter initialEntries={["/student/events"]}>
      <Routes>
        <Route path="/student/events" element={<StudentMyEventsPage />} />
        <Route path="/home" element={<div>Student Home</div>} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByText("No event proposals yet")).toBeInTheDocument());
  expect(screen.getAllByRole("button", { name: "Create event" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "New event" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
pnpm exec vitest run src/pages/__tests__/StudentMyEventsAccess.test.tsx
```

Expected: the new test fails because the page still renders the header `New event` button.

- [ ] **Step 3: Write the minimal implementation**

In `StudentMyEventsPage.tsx`, remove only the header button whose click handler calls `setShowCreate(true)`. Keep the `EmptyState` `Create event` action. Give the retained action mobile-safe classes if needed, using the existing centered button style and a bounded width such as `w-full max-w-[220px]` so it cannot overflow narrow viewports.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm exec vitest run src/pages/__tests__/StudentMyEventsAccess.test.tsx
```

Expected: all tests in the file pass, including the existing regular-student redirects and the new single-button assertion.

### Task 2: Add the Demo Student Org quick-fill option

**Files:**
- Modify: `src/pages/AdminLoginPage.tsx` (existing org option label only)
- Modify: `src/lib/__tests__/demoAccountConfig.test.ts`
- Modify: `.env.local` (ignored local credentials only)

**Interfaces:**
- Consumes: `getDemoOrgApplicantCredentials(true, email, password)` and the existing `DEMO_ACCOUNTS` selector.
- Produces: a `Demo Student Org` selector item that fills `DEMOSTUDENTORG@plv.edu.ph` and `DEMOSTUDENTORG` while preserving normal sign-in.

- [ ] **Step 1: Write the failing test**

Add a concrete configuration case to `src/lib/__tests__/demoAccountConfig.test.ts`:

```ts
it("accepts the local Demo Student Org credentials", () => {
  expect(getDemoOrgApplicantCredentials(
    true,
    "DEMOSTUDENTORG@plv.edu.ph",
    "DEMOSTUDENTORG",
  )).toEqual({
    email: "DEMOSTUDENTORG@plv.edu.ph",
    password: "DEMOSTUDENTORG",
  });
});
```

If the test passes immediately, retain it as a regression test and verify that the production change is limited to the selector copy and local configuration; no new helper behavior is required.

- [ ] **Step 2: Run the focused configuration test**

Run:

```bash
pnpm exec vitest run src/lib/__tests__/demoAccountConfig.test.ts
```

Expected: the helper test suite passes, confirming the exact values accepted by the existing env-gated option.

- [ ] **Step 3: Write the minimal implementation/configuration**

In `AdminLoginPage.tsx`, change only the existing option label and description:

```tsx
label: "Demo Student Org",
description: "Opens the student organization experience",
```

In the ignored project-root `.env.local`, set:

```ini
VITE_ENABLE_DEMO_LOGIN=true
VITE_DEMO_ORG_STUDENT_EMAIL=DEMOSTUDENTORG@plv.edu.ph
VITE_DEMO_ORG_STUDENT_PASSWORD=DEMOSTUDENTORG
```

Do not add these credential values to tracked source. The corresponding Supabase Auth user must already exist with the same password; the selector does not bypass authentication.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm exec vitest run src/lib/__tests__/demoAccountConfig.test.ts src/pages/__tests__/StudentMyEventsAccess.test.tsx
```

Expected: both focused suites pass.

### Task 3: Full verification and mobile smoke check

**Files:**
- No additional source files.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: all tests pass with no new failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
pnpm build
```

Expected: the Vite build completes successfully. An existing large-chunk warning is non-blocking if it is unchanged.

- [ ] **Step 3: Verify the local UI**

Open `http://localhost:5173/admin`, expand `Choose a demonstration account`, and confirm `Demo Student Org` appears. Select it and confirm the form contains the exact email and password, then press `Sign In` to exercise normal Supabase authentication.

Open the Student Org `/student/events` page at desktop and mobile widths. With no proposals, confirm only the centered `Create event` action is visible, the action remains fully within the viewport, and the mobile bottom navigation does not overlap it.

