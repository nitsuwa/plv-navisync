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
- [x] **A4 — Campus lifecycle and version contract**
  - Status: `FOR REVIEW`
  - Branch: `feature/database-types-and-storage` (continued here by developer instruction)
  - Depends on: A1
  - Test result: PASS — Vite build, 60 Vitest tests, rollback-safe guest/student/admin lifecycle and Storage assertions, live A1/A2/A3 regressions, generated-type review, and security/performance advisor review
  - Pull Request: Pending
- [x] **A5 — Campus structure, directory, and graph services**
  - Status: `FOR REVIEW`
  - Branch: `feature/database-types-and-storage` (continued here by developer instruction)
  - Depends on: A4
  - Test result: PASS — Vite build, 63 Vitest tests, live atomic structure/RLS/cross-campus/recoverability checks, A1 Storage/RLS regression, generated-type review, advisors, and browser smoke test
  - Pull Request: Pending
- [x] **A6 — Draft save, validation handoff, and publish orchestration**
  - Status: `FOR REVIEW`
  - Branch: `A6-A9` (continued here by developer instruction after merging B5 from `main`)
  - Depends on: A5 and B5 contract review
  - Test result: PASS — live migration reconciliation, generated Database types, 104 Vitest files/1,415 tests, Vite build, live guest/student/admin draft/publish/RLS/concurrency/recovery assertions, A1/A5/A7 regressions, schema lint, advisors, and unauthenticated browser smoke test
  - Pull Request: Pending
- [x] **A7 — Operations service contracts**
  - Status: `FOR REVIEW`
  - Branch: `A6-A9` (continued here by developer instruction)
  - Depends on: A1 and A5
  - Test result: PASS — Vite build, 210 Vitest tests, live guest/student/admin operations RLS and private Storage matrix, migration-history reconciliation, generated types, and security/performance advisor review
  - Pull Request: Pending
- [ ] **A8 — Cross-system security and integration verification**
  - Status: `ACTIVE` — backend/security checkpoint complete; dependent B6–B9/C4 Phase 2/C8-C UI integration remains gated
  - Branch: `A6-A9` (continued here by developer instruction)
  - Depends on: A2–A7 and dependent merged UI packages
  - Test result: PASS for available scope — 105 Vitest files/1,417 tests, Vite build, live A1–A8 verification chain, inactive-session RLS/Storage enforcement, cross-campus/cross-user isolation, draft/public isolation, schema lint, advisors, and browser protected-route checks
  - Pull Request: Pending
- [ ] **A9 — Release data, backup, and deployment readiness**
  - Status: `BLOCKED`
  - Branch: `chore/release-data-and-backup`
  - Depends on: Gate G5
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: A8 — Cross-system security and integration verification (`ACTIVE`, same `A6-A9` branch by developer instruction)
- Last completed package: None
- Known blocker: A8 final UI integration matrix waits for Developer 2 B6–B9 and Developer 3 C4 Phase 2/C8-C to merge. Leaked-password protection, production SMTP, and production redirect configuration remain deployment dashboard tasks.
- Important changed files: `supabase/migrations/20260816094353_enforce_active_account_and_public_image_isolation.sql`, `scripts/verify-a8-security-matrix.mjs`, `src/hooks/useStudentAuth.ts`, student protected pages, and `docs/progress/DEVELOPER_1_A8_VERIFICATION.md`
- Next recommended action: Submit the A8 backend/security checkpoint for review, then rerun the documented UI matrix after the dependency-gated packages merge.
