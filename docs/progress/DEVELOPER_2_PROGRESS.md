# PLV NaviSync — Developer 2 Progress

This is the live checklist for Workstream B — Map Authoring and Navigation. The version on `main` is official. Check a package in the same Pull Request only after its implementation and required tests are complete; it becomes `DONE` when that Pull Request is merged.

Status values: `READY`, `ACTIVE`, `BLOCKED`, `FOR REVIEW`, `DONE`.

## Package checklist

- [ ] **B1 — Map Builder baseline audit and regression protection**
  - Status: `READY`
  - Branch: `test/map-builder-baseline`
  - Depends on: None
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B2 — Outdoor campus canvas and object authoring**
  - Status: `BLOCKED`
  - Branch: `feature/outdoor-campus-authoring`
  - Depends on: B1
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B3 — Building configuration and entrances**
  - Status: `BLOCKED`
  - Branch: `feature/building-entrance-authoring`
  - Depends on: B2 and A5 contract availability for final integration
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B4 — Floor-plan authoring**
  - Status: `BLOCKED`
  - Branch: `feature/floor-plan-authoring`
  - Depends on: B3
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B5 — Navigation graph authoring**
  - Status: `BLOCKED`
  - Branch: `feature/navigation-graph-authoring`
  - Depends on: B3 and B4
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B6 — Map Builder persistence integration**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-persistence`
  - Depends on: B2–B5 and Gate G1
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B7 — Complete validation and issues workflow**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-validation`
  - Depends on: B5 and B6
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B8 — Route testing and pathfinding verification**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-route-testing`
  - Depends on: B5, B7, and A5 published graph format
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B9 — Save, publish, tutorial, and editor state UX**
  - Status: `BLOCKED`
  - Branch: `feature/map-builder-publish-ux`
  - Depends on: A6, B6, and B7
  - Test result: Pending
  - Pull Request: Pending
- [ ] **B10 — Authoring polish, accessibility, and performance**
  - Status: `BLOCKED`
  - Branch: `fix/map-builder-polish`
  - Depends on: B2–B9
  - Test result: Pending
  - Pull Request: Pending

## Current handoff note

- Active package: None
- Last completed package: None
- Known blocker: None
- Important changed files: None
- Next recommended action: Start B1.
