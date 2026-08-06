# PLV NaviSync — Developer 1 Progress

This is the live checklist for Workstream A — Platform and Campus Lifecycle. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [x] **A1 — Database types, Storage, and RLS baseline**
  - Status: `FOR REVIEW`
  - Branch: `feature/database-types-and-storage`
  - Depends on: None
  - Test result: PASS — Vite build, 45 Vitest tests, live guest/student/admin RLS and Storage matrix, catalog assertions, and advisor review
  - Pull Request: Pending
- [x] **A2 — Student account lifecycle**
  - Status: `FOR REVIEW`
  - Branch: `feature/database-types-and-storage` (continued here by developer instruction)
  - Depends on: A1
  - Test result: PASS — Vite build, 54 Vitest tests, live Auth/session checks, rollback-safe signup-trigger assertions, route checks, and advisor review; reviewer mailbox-link check documented
  - Pull Request: Pending
- [ ] **A3 — Administrator user management and privileged actions**
  - Status: `BLOCKED`
  - Branch: `feature/admin-user-management`
  - Depends on: A2
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A4 — Campus lifecycle and version contract**
  - Status: `BLOCKED`
  - Branch: `feature/campus-lifecycle`
  - Depends on: A1
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A5 — Campus structure, directory, and graph services**
  - Status: `BLOCKED`
  - Branch: `feature/campus-structure-services`
  - Depends on: A4
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A6 — Draft save, validation handoff, and publish orchestration**
  - Status: `BLOCKED`
  - Branch: `feature/campus-publishing-workflow`
  - Depends on: A5 and B5 contract review
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A7 — Operations service contracts**
  - Status: `BLOCKED`
  - Branch: `feature/operations-services`
  - Depends on: A1 and A5
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A8 — Cross-system security and integration verification**
  - Status: `BLOCKED`
  - Branch: `test/security-and-integration-matrix`
  - Depends on: A2–A7 and dependent merged UI packages
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A9 — Release data, backup, and deployment readiness**
  - Status: `BLOCKED`
  - Branch: `chore/release-data-and-backup`
  - Depends on: Gate G5
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: A2 — Student account lifecycle (`FOR REVIEW`, same branch as A1 by developer instruction)
- Last completed package: None
- Known blocker: None for code review; reviewer must configure allowed Auth redirect origins and click one real verification/reset email before deployment. Leaked-password protection and production SMTP also remain dashboard tasks.
- Important changed files: `src/lib/studentAccount.ts`, `src/pages/RegistrationPage.tsx`, `src/pages/AuthLifecyclePages.tsx`, `src/pages/AdminLoginPage.tsx`, `src/app/routes.tsx`, `supabase/migrations/20260806090026_secure_student_profile_signup.sql`, `scripts/verify-a2-auth.mjs`, `supabase/tests/a2_student_signup_assertions.sql`
- Next recommended action: Review A1 and A2 together on this branch, complete the documented mailbox-link/dashboard check, then open the Pull Request. Keep A3 blocked until A2 is merged.
