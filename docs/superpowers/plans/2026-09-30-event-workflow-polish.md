# Event Workflow Polish Implementation Plan

**Goal:** Deliver the approved event workflow design across proposals, editing, review and student previews.

**Architecture:** Extend existing overlays and published snapshots. Keep editor draft state mounted during background refresh. Persist publication policy in the database and reuse read-only event visuals without changing navigation.

**Global constraints:** Event feature only; preserve local uncommitted work; no live database migration; Asia/Manila scheduling; preserve historical asset dimensions; additive database changes.

## Task 1: Published campus proposals
- [x] Test switching campus filters locations, review dialog cancellation, and single creation.
- [x] Add campus picker, direct floor selection, confirmation summary and event dates.
- [x] List own proposals across campuses and support duplication via the event service.
- [x] Run proposal and access tests.

## Task 2: Editor workspace and persistence
- [x] Test editor route hides navigation and background loading preserves mounted canvas.
- [x] Add conditional viewport shell, stable editor campus snapshot, debounced autosave with pending/error status.
- [x] Verify unsaved back/save/submit protections.

## Task 3: Assets and seating
- [x] Test fixed dimensions and row distribution/placement validation.
- [x] Compact inspector; canonical templates; configurable rows; reject invalid placements before mutation.
- [x] First-use tutorial with account/version completion and replay.
- [x] Run editor, geometry and validation tests.

## Task 4: Publication and student preview
- [x] Test publication boundaries, expiry, conflicts and review feedback.
- [x] Add scheduled approval, backend visibility policy, student event toggle and preview details.
- [x] Preserve route graph behavior; add database migration without applying it.
- [x] Run service/admin/student overlay tests.

## Task 5: Integration
- [x] Review shared APIs and run focused regression tests and production build.
- [x] Inspect desktop proposal UI in browser; automated tests cover editor and student map behavior. Mobile visual inspection remains a follow-up.
- [x] Document changes, migration requirement, and manual test steps.

