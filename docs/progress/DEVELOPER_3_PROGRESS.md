# PLV NaviSync — Developer 3 Progress

This is the live checklist for Workstream C — Student Experience and Operations. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [ ] **C1 — Public/student shell, Home, and Help Center completion**
  - Status: `FOR REVIEW`
  - Branch: `feature/public-shell-and-help`
  - Depends on: None
  - Test result: `npm run build` PASSED (2502 modules built in 17.27s). Verified Home presentation, announcement preview, Help Center FAQ, and contact form layout.
  - Pull Request: Pending
- [ ] **C2 — Published campus map loading and map states**
  - Status: `BLOCKED`
  - Branch: `feature/published-campus-map`
  - Depends on: Gate G1 and A6 public-version query
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C3 — Unified search, directory, and location details**
  - Status: `BLOCKED`
  - Branch: `feature/map-search-and-details`
  - Depends on: C2 and A5 directory services
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C4 — Student route planning and navigation presentation**
  - Status: `BLOCKED`
  - Branch: `feature/student-navigation`
  - Depends on: Gate G3
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C5 — Reports and report history**
  - Status: `BLOCKED`
  - Branch: `feature/reports-workflow`
  - Depends on: Gate G4 and C2
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C6 — Events and announcements**
  - Status: `BLOCKED`
  - Branch: `feature/events-and-announcements`
  - Depends on: Gate G4 and C2
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C7 — Favorites, recent destinations, and minimal profile**
  - Status: `BLOCKED`
  - Branch: `feature/student-saved-places`
  - Depends on: C3, C4, and Gate G4
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C8 — Admin operations pages, settings, logs, and dashboard**
  - Status: `BLOCKED`
  - Branch: `feature/admin-operations-dashboard`
  - Depends on: A3, A6, A7, C5, and C6
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C9 — Responsive, accessibility, theme, and visual consistency**
  - Status: `BLOCKED`
  - Branch: `fix/public-operations-polish`
  - Depends on: C1–C8 for the final pass
  - Test result: Pending
  - Pull Request: Pending
- [ ] **C10 — PWA, offline behavior, and end-to-end user journeys**
  - Status: `BLOCKED`
  - Branch: `test/pwa-and-critical-journeys`
  - Depends on: Gate G5
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: C1 (FOR REVIEW)
- Last completed package: C1 — Public/student shell, Home, and Help Center completion
- Known blocker: None for C1. C2 is BLOCKED until Gate G1 and A6 are merged.
- Important changed files: `src/pages/LandingPage.tsx`, `docs/progress/DEVELOPER_3_PROGRESS.md`
- Next recommended action: Await PR review/merge of C1 into `main`, then start C2 once Gate G1 & A6 are completed.
