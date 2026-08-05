# PLV NaviSync — Developer 1 Progress

This is the live checklist for Workstream A — Platform and Campus Lifecycle. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [ ] **A1 — Database types, Storage, and RLS baseline**
  - Status: `READY`
  - Branch: `feature/database-types-and-storage`
  - Depends on: None
  - Test result: Pending
  - Pull Request: Pending
- [ ] **A2 — Student account lifecycle**
  - Status: `BLOCKED`
  - Branch: `feature/student-account-lifecycle`
  - Depends on: A1
  - Test result: Pending
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

- Active package: None
- Last completed package: None
- Known blocker: None
- Important changed files: None
- Next recommended action: Start A1.
