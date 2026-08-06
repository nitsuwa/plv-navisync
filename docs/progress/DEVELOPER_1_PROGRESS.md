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
  - Test result: PASS — Vite build, 54 Vitest tests, live Auth/session checks, rollback-safe signup-trigger assertions, route checks, advisor review, and developer manual site testing with no observed errors
  - Pull Request: Pending
- [x] **A3 — Administrator user management and privileged actions**
  - Status: `FOR REVIEW`
  - Branch: `feature/database-types-and-storage` (continued here by developer instruction)
  - Depends on: A2
  - Test result: PASS — Vite build, 57 Vitest tests, rollback-safe database assertions, live guest/student/admin checks, A1/A2 regressions, advisor review, and browser walkthrough
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

- Active package: A3 — Administrator user management and privileged actions (`FOR REVIEW`, same branch by developer instruction)
- Last completed package: None
- Known blocker: None. Leaked-password protection, production SMTP, and production redirect configuration remain deployment dashboard tasks.
- Important changed files: `src/pages/AdminUsersPage.tsx`, `src/services/adminUserService.ts`, `src/hooks/useAdminAuth.ts`, `supabase/functions/admin-users/index.ts`, `supabase/migrations/20260806094510_secure_admin_user_management.sql`, `scripts/verify-a3-admin-users.mjs`, `supabase/tests/a3_admin_user_management_assertions.sql`
- Next recommended action: Review A1–A3 together on this branch, configure production SMTP/redirects and leaked-password protection, then open the Pull Request.
