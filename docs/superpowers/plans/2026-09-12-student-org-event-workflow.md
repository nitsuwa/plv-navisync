# Student Organization Event Workflow Implementation Plan

> **For the implementer:** Use the `executing-plans` skill to execute this plan task-by-task with verification checkpoints.

**Goal:** Implement the approved student-organization event workflow with multi-location requests, student-owned event additions, native event assets, date-free proposals, and read-only administrator previews.

**Architecture:** Keep event overlays in `map_elements.metadata`, add a backward-compatible normalized `locations` array, reuse the existing read-only floor/campus plan resolver, and wrap the focused `EventFloorEditor` with a location switcher. Keep administrator review in the admin route and make the preview editor read-only.

**Stack:** React 18, TypeScript, React Router, Vitest, Testing Library, Tailwind utility classes, Supabase metadata persistence.

## Task 1: Establish the normalized multi-location model

**Files:** `src/components/map-builder/types.ts`, `src/lib/eventOverlayModel.ts`, `src/lib/__tests__/eventOverlayModel.test.ts`

1. Write failing tests for normalizing a legacy single-location overlay, preserving an existing multi-location overlay, generating stable location keys, and counting event-owned additions.
2. Run `pnpm test -- src/lib/__tests__/eventOverlayModel.test.ts` and confirm the tests fail because the model helper does not exist.
3. Add `EventOverlayLocation` and optional `locations` types while keeping legacy fields optional for old saved data.
4. Implement pure helpers for normalization, location-key creation, and aggregate counts.
5. Run the focused test file and then `pnpm exec tsc --noEmit`.

## Task 2: Move service writes and visibility to location arrays without dates

**Files:** `src/services/eventOverlayService.ts`, `src/services/__tests__/eventOverlayService.test.ts`

1. Add failing tests for date-free creation, multi-location metadata writes, location-specific layout updates, legacy read normalization, and approved visibility without date comparisons.
2. Run the focused service tests and confirm failure before implementation.
3. Update service input types and create/update/submit functions to persist normalized location arrays, preserving legacy metadata during transition.
4. Make approved campus/floor queries inspect every normalized location and use approval/active state instead of date windows.
5. Keep owner and admin behavior aligned with existing RLS; do not add a student path to base-map writes.
6. Run service tests and TypeScript checks.

## Task 3: Replace the proposal forms with a date-free multi-location setup flow

**Files:** `src/components/events/EventLocationPicker.tsx`, `src/components/events/__tests__/EventLocationPicker.test.tsx`, `src/pages/StudentMyEventsPage.tsx`, `src/pages/__tests__/StudentMyEventsPage.test.tsx`

1. Add failing component tests for selecting campus grounds, adding multiple building floors, removing only selected requests, and showing no date inputs.
2. Run the focused component tests and confirm failure before implementation.
3. Build a two-step create flow with event details first and grouped location selection second.
4. Remove date fields and date validation from create/edit/list UI while keeping title, description, organization, poster, locations, and layouts.
5. Wire create and edit handlers to the service's location-array inputs and prevent duplicate locations.
6. Keep the existing student-org access gate and make the page explain that approval covers both access and the submitted map.
7. Run focused tests and TypeScript checks.

## Task 4: Improve the focused map editor and add event assets

**Files:** `src/components/events/eventAssets.tsx`, `src/components/events/__tests__/eventAssets.test.tsx`, `src/components/events/EventFloorEditor.tsx`, `src/components/events/EventLocationSwitcher.tsx`, `src/pages/StudentEventEditPage.tsx`, `src/pages/__tests__/StudentEventEditPage.test.tsx`

1. Add failing tests for the required asset palette, student-org route protection, switching locations, saving the active location without changing other locations, and deleting only event-owned items.
2. Run the focused tests and confirm failure before implementation.
3. Add native vector previews and templates for booth, chairs, stage, speakers, projector, monitors, plus existing event items.
4. Add a responsive location switcher that clearly shows campus grounds and building floors and summarizes additions per location.
5. Make the editor use only the active location's arrays and lift saves/submissions back into the full normalized location list.
6. Remove the date display and keep the published base layer read-only.
7. Add a direct `student_org` guard to the editor route/page and preserve loading/error states.
8. Run focused tests and TypeScript checks.

## Task 5: Add read-only administrator review preview

**Files:** `src/pages/AdminEventLayoutPreviewPage.tsx`, `src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx`, `src/pages/AdminEventLayoutsPage.tsx`, `src/app/routes.tsx`

1. Add failing tests for rendering all requested locations, showing location-specific counts, hiding save/delete/submit controls, and preserving one combined approval decision.
2. Run focused tests and confirm failure before implementation.
3. Add the protected admin preview route and reuse the event editor in read-only mode or an equivalent viewer.
4. Change the review link to the admin preview and remove date fields from the queue/modal.
5. Show aggregate counts and location summaries while keeping approve/disapprove as one event-level decision.
6. Run focused tests and TypeScript checks.

## Task 6: Improve student-org entry points and manual role guidance

**Files:** `src/pages/StudentHomePage.tsx`, `src/pages/AdminUsersPage.tsx`, relevant page tests

1. Add failing tests for the Student Org event-mapping entry point and the admin role guidance text.
2. Run focused tests and confirm failure before implementation.
3. Add a concise student-org call-to-action that explains the combined location/map approval flow.
4. Add inline admin guidance that the physical document is verified offline before assigning `Student Org`.
5. Run focused tests and TypeScript checks.

## Task 7: Final verification and handoff

**Files:** no production files; inspect the complete diff and existing merge state.

1. Run `pnpm test`.
2. Run `pnpm exec tsc --noEmit`.
3. Run `pnpm build`.
4. Run `git diff --check`, inspect the feature diff, and confirm no commit or push occurred.
5. Start the local app if needed and manually test the documented user flows.

