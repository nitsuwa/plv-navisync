# Event Clarity First Batch Implementation Plan

> Execute inline, task by task, with regression tests before behavior changes. The user approved this first batch on October 7, 2026.

**Goal:** Make submitted maps noticeable and actionable for administrators, explain public venue pins, and distinguish saved review drafts from delivered feedback and student publication.

**Architecture:** Share a per-admin pending-submission store between navigation, bell, and review queue. The queue reads saved backend events; revision-aware read receipts persist per administrator in the current browser, matching existing organization receipts. Cross-device server receipts are deferred to a backend batch; this implementation adds no schema or auth-metadata changes. Public pins inspect venues through the existing responsive event panel; selecting an event scopes the marker layer to its venues. One shared publication summary drives admin and organization wording.

**Tech Stack:** React, TypeScript, React Router, Supabase auth metadata, existing Tailwind tokens, Vitest/Testing Library, Playwright browser verification.

## Global Constraints

- Preserve existing dirty files and the current local dev-server checkout.
- No new packages, schema migrations, changes to roles, or published base maps.
- Poll once per active admin store every 15 seconds and refresh on focus/visibility; preserve existing content on refresh failure.
- Pending reviews and unread submissions are separate counts. Opening the bell must not clear submission unread state. Reading one event must not acknowledge another event or a newer revision.
- Read receipts persist per admin in this browser and respect account boundaries; failed receipt saves remain unread with retry guidance.
- Event notification preferences affect the bell, while pending work remains visible in navigation.
- Markers have readable venue/floor labels and a neutral, explicit shared-event count. A single event with several floors must offer each floor.
- Desktop and mobile use the existing nonmodal event panel for venue information; no competing overlay stack.
- Feedback draft and publication copy changes do not change approval, acknowledgement, or visibility rules.
- Leave changes reviewable in the local working tree; no push is part of this batch.

## Task 1 — Actionable admin submissions

**Create:** `src/lib/adminEventSubmissions.ts`, `src/hooks/useAdminEventSubmissions.ts` and their tests.
**Modify:** `AdminLayout.tsx`, `AdminSidebar.tsx`, `AdminEventLayoutsPage.tsx` and focused tests.

**Interfaces:** `eventSubmissionFingerprint(overlay): string`; `readAdminSubmissionReceipts(adminId): Record<string, string>`; `markAdminSubmissionRead(adminId, eventId, fingerprint): boolean`; `useAdminEventSubmissions(adminId, enabled)` exposes events, unreadIds, pendingCount, unreadCount, loading, error, eventsEnabled, refresh and markRead.

- [x] Test that drafts and approved events do not inflate pending work, polling detects a new submission, reading one revision clears only that event, and failed saves preserve unread state.
- [x] Test receipt account isolation, preserving other events, corrupted storage, and failed persistence.
- [x] Run the tests red, implement the shared store/service, and run green.
- [x] Connect the bell and desktop/mobile navigation. Add a full-row Review submission action using `/admin-dashboard/event-layouts?review=<id>` and an event-specific unread chip.
- [x] Verify the deep link opens the exact pending event and acknowledges its displayed revision; stale links show recoverable guidance.

```ts
// Literal revision change that must return to unread after its earlier version was read.
const first = { id: 'qa-one', status: 'pending', submittedAt: '2026-10-07T08:00:00Z', revision: 3 };
const updated = { ...first, lastEditedAt: '2026-10-07T09:00:00Z', revision: 4 };
```

## Task 2 — Contextual public venues

**Modify:** `EventVenueLayer.tsx`, `EventMapPanel.tsx`, `CampusMapPage.tsx`, `eventMapView.ts` and focused tests.

**Interfaces:** Venue inspection uses the existing `EventVenue` ID, label and event/location pairs. `EventVenueLayer` accepts selected location and `onInspectVenue`; `EventMapPanel` accepts an optional inspected venue and shows each eligible event/location with a View map action.

- [x] Write failing tests for visible venue/floor names, neutral shared counts, and two floor choices for one event.
- [x] Add readable labels that retain screen size while zooming. Scope markers to the selected event and highlight its active venue.
- [x] Inspect a venue through the responsive panel with full event title, organizer, dates, phase and floor choices. Back/close clear inspection predictably.
- [x] Run focused panel/marker/model/navigation tests green.

```ts
// One event with Library Floor 1 and Floor 2 must show two explicit View map choices.
onViewLocation('event-a', 'library-floor-2');
```

## Task 3 — Feedback draft and publication clarity

**Create:** `src/components/events/EventStudentVisibility.tsx` and behavior tests.
**Modify:** `AdminEventLayoutPreviewPage.tsx`, `AdminEventPublicationDialog.tsx`, `AdminEventLayoutsPage.tsx`, `StudentMyEventsPage.tsx` and affected tests.

- [x] Test that approved/unpublished stays hidden, future publication shows Scheduled, and published future events show Published + Upcoming.
- [x] Display student visibility separately from the approval badge in admin and organization cards and publication management.
- [x] Add explicit pin draft status after Save pin and explain that feedback reaches the org with the review decision. Preserve current unsent-draft handling.
- [x] Run affected tests, then verify production build and diff whitespace.
- [x] Capture desktop/mobile browser evidence for notifications, marker inspection/floor choices, draft wording and publication states. Record any remaining limitation without claiming the whole prior checklist is complete.

**Verification commands:**

```powershell
node node_modules/vitest/vitest.mjs run src/lib/__tests__/adminEventSubmissions.test.ts src/lib/__tests__/adminEventSubmissionReceipts.test.ts src/hooks/__tests__/useAdminEventSubmissions.test.tsx
node node_modules/vitest/vitest.mjs run src/components/layout/__tests__ src/components/map/__tests__/EventVenueLayer.test.tsx src/components/map/__tests__/EventMapPanel.test.tsx src/components/events/__tests__/EventStudentVisibility.test.tsx src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx src/pages/__tests__/AdminEventLayoutPreviewPage.test.tsx src/pages/__tests__/StudentMyEventsAccess.test.tsx
node node_modules/vite/bin/vite.js build
git diff --check
```
