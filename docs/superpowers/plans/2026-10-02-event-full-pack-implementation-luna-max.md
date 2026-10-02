# Event Full Pack Implementation Plan — Luna / Max

> **For agentic workers:** REQUIRED SUB-SKILL: Use the available `executing-plans` skill to implement this plan task by task. Track checkbox steps. Execute inline in the user-selected Luna / Max session; do not automatically delegate, create another chat, or change models.

**Goal:** Complete event creation/review/publication and responsive student Upcoming/Ongoing map viewing across every approved requested location, with actual test evidence.

**Architecture:** Extend the existing overlay model, editor, published snapshots and routing. Add atomic admin RPCs, an allowlisted preview feed, a focused feed hook and one event dock/sheet with one selected layout. Keep `CampusMapPage.tsx` integration thin.

**Tech Stack:** Existing React/TypeScript/Vite, Vitest/Testing Library, Supabase/Postgres, themed controls, lucide-react and available browser tools. No new dependency is required.

**Approved design:** `docs/superpowers/specs/2026-10-02-event-full-pack-design.md`.
**Separate verification pass:** `docs/superpowers/plans/2026-10-02-event-full-pack-verification-luna-max.md`.
**Execution:** User chooses GPT-6 Luna / Max to implement, then verify afterward. User later chooses GPT-6.1 Sol / High or Medium for independent final checking.

## Global constraints

- Event scope and necessary shared integrations only.
- Preserve the substantial existing dirty tree. No reset, blind stash, checkout-overwrite, stage-all or rebuilding from clean HEAD.
- No automatic commits, pushes, deployment, production database mutations, demo-account reprovisioning or model changes. Review checkpoints replace commits.
- Student org does not set occurrence/publication dates; admin sets occurrence at approval and can manage publication afterward.
- One proposal/campus, multiple requested locations, one approval for all.
- System-themed date/time/select/confirm controls; no native popups or browser dialogs.
- Asia/Manila input/display, ISO persistence, exact time boundaries and database clock authority.
- Preserve base maps/navigation; furniture does not alter routing.
- No invented physical capacity or calibrated dimensions.
- Read `supabase-postgres-best-practices` before SQL; read browser-tool instructions before automation.
- Verify isolated local/staging target before writes. A remote .env.local URL is not proof of staging; never print secrets.
- Mock tests/builds/inspected SQL are not real authorization/persistence evidence.
- Missing browser/database access is BLOCKED; complete independent work but never claim integrated completion.

## Starting facts and targeted gaps

- The themed proposal campus picker, location confirmation, multi-location editor and tutorial already exist; preserve passing behavior.
- `normalizeEventOverlayLocations` supports current/legacy documents.
- `floorLookupId(buildingId, floorNumber)` uses `buildingId + "-f" + floorNumber`, not floor UUIDs.
- `reviewEventOverlay` currently uses direct JSON updates, accepts pending only, and lacks atomic stale-write protection.
- Approved cards currently reuse View & Review; they need a distinct publication-management action.
- Existing student getters flatten per location; using them as the event browser duplicates cards and misses other-floor venues.
- `EventInfoPanel` is blocking; replace its student-map usage with same-panel details.
- Current `CampusMapPage` loads separate floor/grounds feeds and draws multiple layouts. Replace only event integration.
- Unverified visibility migration has an anon restrictive policy without a granting public feed; NEW-only classification guard; public campus RPC without explicit campus.status='published'. Inspect real schema before changing.
- Previous report recorded flaky aggregate CampusMap tests and global TypeScript errors. Capture a fresh baseline; historical PASS counts are not current evidence.

## File map

| File | Purpose |
| --- | --- |
| `src/lib/eventPublication.ts` | Shared phase/validation/formatting |
| `src/types/eventPreview.ts` (new) | Allowlisted public feed/command contracts |
| `src/test/eventFullPackFixtures.ts` (new) | Deterministic test fixtures, never production fallback |
| `src/components/map-builder/types.ts` | Server updatedAt on admin model |
| `src/lib/eventMapView.ts` (new) | Dedup/sort/filter, venue/location resolution |
| `src/services/eventOverlayService.ts` | Typed review/publication/feed adapters; preserve org APIs |
| `supabase/migrations/20261002090000_event_publication_management.sql` (new) | Atomic commands, public feed and protections |
| `supabase/tests/event_publication_management_assertions.sql` (new) | Real role/CAS/timing/snapshot checks |
| `src/components/events/AdminEventPublicationDialog.tsx` (new) | Approved-event controls |
| `src/pages/AdminEventLayoutsPage.tsx` | Review vs management entry points |
| `src/hooks/useEventMapPreviews.ts` (new) | Feed/clock/refresh/stale-response handling |
| `src/components/map/EventMapPanel.tsx` (new) | Responsive nonmodal list/details |
| `src/components/map/EventVenueLayer.tsx` (new) | Venue marker/chooser |
| `src/components/map/EventPreviewLayer.tsx` | Selected-location read-only assets |
| `src/components/map/EventInfoPanel.tsx` | Reusable details; preserve other actual callers |
| `src/pages/CampusMapPage.tsx` | Thin map/panel/floor/navigation integration |
| `src/services/adminActivityPresentation.ts` | Publication action labels |
| `src/types/database.generated.ts` | Installed RPC signatures |
| `scripts/verify-event-full-pack.mjs` (new) | Safe staging JWT role verifier |
| `docs/2026-10-02-event-full-pack-implementation-report.md` (new) | Changes/results/setup/blockers |

## Shared interfaces

```ts
// src/types/eventPreview.ts
import type { CampusEventOverlay, EventOverlayLocation } from "../components/map-builder/types";
export type EventPhase = "hidden" | "scheduled" | "upcoming" | "ongoing" | "ended";
export type PublicEventPreview = Pick<
  CampusEventOverlay, "id" | "title" | "description" | "organizer" | "posterUrl" | "markers"
> & {
  campusId: string;
  status: "approved"; isActive: true;
  dateStart: string; dateEnd: string; publicationAt: string;
  locations: EventOverlayLocation[];
};
export interface PublicEventFeed { serverNow: string; events: PublicEventPreview[] }
export type EventPublicationCommand =
  | { action: "publish_now" }
  | { action: "schedule"; publicationAt: string }
  | { action: "unpublish" };
export type EventMapFilter = "all" | "ongoing" | "upcoming";
```

Admin `CampusEventOverlay` gains `updatedAt?: string` from row.updated_at. Missing revision requires reload, never a fabricated client timestamp.

```ts
// Signature contracts only; implement function bodies in actual modules.
export declare function getStudentEventPhase(
  event: Pick<CampusEventOverlay, "status" | "isActive" | "dateStart" | "dateEnd" | "publicationAt">,
  nowMs: number,
): EventPhase;

export declare function listPublishedEventPreviews(campusId: string): Promise<PublicEventFeed>;

export declare function reviewEventOverlay(
  overlayId: string, decision: "approved" | "disapproved",
  adminComment: string | undefined,
  review: {
    expectedUpdatedAt: string;
    dateStart?: string; dateEnd?: string;
    publicationMode?: "now" | "schedule"; publicationAt?: string;
    locationFeedback?: Record<string, string>;
  },
): Promise<CampusEventOverlay>;

export declare function manageEventPublication(
  overlayId: string, expectedUpdatedAt: string, command: EventPublicationCommand,
): Promise<CampusEventOverlay>;

export declare function useEventMapPreviews(input: {
  campusId?: string; enabled: boolean; open: boolean; identityKey: string;
}): {
  events: PublicEventPreview[]; loading: boolean; error: string | null;
  nowMs: number; refresh: () => Promise<void>;
};
```

SQL contracts:

- `review_event_layout(p_overlay_id uuid, p_expected_updated_at timestamptz, p_decision text, p_date_start timestamptz, p_date_end timestamptz, p_publication_mode text, p_publication_at timestamptz, p_admin_comment text, p_location_feedback jsonb) returns jsonb`.
- `manage_event_publication(p_overlay_id uuid, p_expected_updated_at timestamptz, p_action text, p_publication_at timestamptz default null) returns jsonb`.
- Admin RPC result: `{id, campusId, updatedAt, metadata}`. Active admin check, row lock, revision comparison, validation, mutation and activity insertion share one transaction.
- `list_published_event_previews(p_campus_id uuid) returns jsonb`: `{serverNow, events}` with PublicEventPreview-only fields, no owner/review data.
- Errors: `42501` unauthorized, `23514` invalid schedule/transition, `40001` stale update. Client conflict copy: “This event changed. Refresh it before saving.”

## Task 1: Baseline, fixtures and lifecycle

**Files:** Public types/fixtures/model above, `src/lib/eventPublication.ts`, `src/lib/__tests__/eventPublication.test.ts`.
**Consumes:** Existing model and actual Manila field helpers.
**Produces:** Public contracts and strict shared phase/visibility.

- [ ] Read applicable AGENTS.md, status/diff, previous report and current named source files. Preserve starting dirty paths.
- [ ] Run the existing-file subset of verification-plan baseline commands before implementation; retain exit codes and sanitized results. The listed new tests do not exist yet and are added by later tasks; include them in the final full run.
- [ ] Create fixture helper:

```ts
import type { PublicEventPreview } from "../types/eventPreview";
export const eventPreviewFixture = (overrides: Partial<PublicEventPreview> = {}): PublicEventPreview => ({
  id: "event-a", campusId: "campus-a", title: "College Week",
  description: "Student activities", organizer: "OSA", markers: [], status: "approved", isActive: true,
  publicationAt: "2026-10-05T01:00:00.000Z",
  dateStart: "2026-10-08T01:00:00.000Z", dateEnd: "2026-10-08T09:00:00.000Z",
  locations: [{ id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" },
    eventFurniture: [], eventLabels: [] }],
  ...overrides,
});
```

- [ ] Add failing exact-boundary tests:

```ts
it.each([
  ["2026-10-05T00:59:59.999Z", "scheduled"],
  ["2026-10-05T01:00:00.000Z", "upcoming"],
  ["2026-10-08T00:59:59.999Z", "upcoming"],
  ["2026-10-08T01:00:00.000Z", "ongoing"],
  ["2026-10-08T09:00:00.000Z", "ended"],
])("classifies %s as %s", (instant, expected) => {
  expect(getStudentEventPhase(eventPreviewFixture(), Date.parse(instant))).toBe(expected);
});
```

- [ ] Cover pending/disapproved/inactive, malformed or missing timestamps, start>=end, publication>=end, missing legacy publication. These never become student-visible.
- [ ] Build hidden-state inputs by spreading a valid fixture into the broader publication-check shape, for example `{ ...eventPreviewFixture(), status: "pending" as const }` or `{ ...eventPreviewFixture(), isActive: false }`; do not force invalid states into the public-only fixture type.
- [ ] Observe failure, implement getStudentEventPhase and make isEventPublished agree with Upcoming/Ongoing only.
- [ ] Cover impossible calendar dates and Manila UTC-day rollover using actual existing converter signatures; avoid creating a second incompatible converter.
- [ ] Run `node node_modules/vitest/vitest.mjs run src/lib/__tests__/eventPublication.test.ts src/components/ui/__tests__/ThemedDateTimeField.test.tsx --reporter=dot --maxWorkers=1`.
- [ ] Review focused diff checkpoint.

## Task 2: Database commands, public feed and guards

**Files:** New management migration/assertion file; generated types after installing test schema.
**Consumes:** SQL contracts, profiles/is_admin, map_elements, campuses, campus_versions, actual activity schema.
**Produces:** Atomic admin commands and allowlisted public preview.

- [ ] Read Supabase skill, actual grants/policies/triggers/activity writer and migration history. Use a forward migration; do not rewrite applied SQL.
- [ ] Verify isolated database first. Legacy/baseline SQL cannot be blindly replayed; install/restore the canonical schema through the project's established process.
- [ ] Write failing assertions for contracts, real roles, trigger bypasses, time boundaries and CAS before implementation.
- [ ] Create forward function/policy/trigger replacements with schema-qualified references/search_path and narrow grants. No table DELETE/TRUNCATE or historical snapshot rewriting.
- [ ] Use this admin row-lock/CAS core inside both RPCs:

```sql
if not public.is_admin() then
  raise exception 'Administrator access required' using errcode = '42501';
end if;
select * into v_event from public.map_elements
where id = p_overlay_id
  and (element_type = 'event_overlay' or metadata->>'kind' = 'event_overlay')
for update;
if not found then
  raise exception 'Event layout not found' using errcode = 'P0002';
end if;
if p_expected_updated_at is null
   or v_event.updated_at is distinct from p_expected_updated_at then
  raise exception 'This event changed. Refresh it before saving.' using errcode = '40001';
end if;
```

- [ ] Review accepts pending only. Approval validates finite dates, end>start, end>serverNow, publication<end. Now mode uses database time; schedule mode requires publication>serverNow. Disapproval requires trimmed comment.
- [ ] Management accepts approved only. publish_now sets active=true/publicationAt=server time; schedule sets active=true/future publication; unpublish sets active=false, preserving schedule/layout/history. Ended events cannot republish.
- [ ] Preserve owner/campus/layout/occurrence/unrelated metadata. Record atomic actions `event_overlay.published`, `event_overlay.publication_scheduled`, `event_overlay.unpublished` and review decisions with actor/before/after values. Activity failure rolls back mutation. Inspect timestamp triggers so every write advances updatedAt.
- [ ] Guard OLD and NEW classification, including changes/removal of element_type/kind/status/owner/campus/date/publication/review fields and null JSON. Do not short-circuit solely on NEW non-event classification.
- [ ] Freeze pending/approved owner updates/deletes; preserve draft/disapproved edits and valid submit/revision transitions. Allow rejection-feedback clearing only through legitimate revision, not fabricated review.
- [ ] Keep raw event read access private to owners/admins; use public RPC for students/guests. No broad anon table grant to solve restrictive-policy-only visibility.
- [ ] Public feed explicitly filters approved/active/time/campus and latest published/nonarchived eligibility; returns allowlisted fields/serverNow. Security definer must repeat restrictions rather than relying on bypassed RLS.
- [ ] Normalize legacy locations safely. Validate requested building/floor references against the authored published campus; composite floor keys are not UUIDs.
- [ ] Fix safe campus projection to remove only embedded events, preserve geometry/order, tolerate absent/null paths, and require campus.status='published'. Stored snapshots remain immutable.
- [ ] Execute in verified test DB:

```powershell
psql "$env:EVENT_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/event_publication_assertions.sql
psql "$env:EVENT_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/event_publication_management_assertions.sql
```

- [ ] Real role claims: anon, ordinary student, owner A, org B, admin. Test owner draft edits, unauthorized calls/raw reads, visible public feed and two same-revision concurrent writes: one success, one conflict.
- [ ] If DB unavailable, record exact BLOCKED tests and continue independent unit/client work. Written SQL alone never passes this task.

## Task 3: Service adapters and safe data parsing

**Files:** `eventOverlayService.ts`/tests, `campusService.ts`/tests as needed, `adminActivityPresentation.ts`/tests, generated types.
**Consumes:** SQL contracts/PublicEventFeed.
**Produces:** The shared service interfaces.

- [ ] Add failing payload/response/error tests:

```ts
await eventOverlayService.manageEventPublication("event-a", revision, {
  action: "schedule", publicationAt: "2026-10-05T01:00:00.000Z",
});
expect(rpc).toHaveBeenCalledWith("manage_event_publication", {
  p_overlay_id: "event-a", p_expected_updated_at: revision,
  p_action: "schedule", p_publication_at: "2026-10-05T01:00:00.000Z",
});
```

- [ ] Fetch/hydrate row updated_at for admin lists/reloads. Keep classified legacy rows discoverable using the same element_type OR metadata.kind event identity as SQL. Replace direct review JSON update with atomic review RPC and expected revision.
- [ ] Remove client-side `logActivity` calls for RPC-managed review/publication actions so the transaction produces exactly one activity entry. Preserve separate organization activity logging.
- [ ] Public feed requires nonempty campus, valid serverNow and event schedules. Dedup by canonical row ID; normalize locations; explicitly construct allowlisted objects rather than spreading metadata. Validate each result campusId against the requested campus even when a response is malformed.
- [ ] Test stripping creator ID/adminComment/locationFeedback even from malformed mock response. No mock event fallback, wrong-campus resolution, or raw-table fallback when public RPC is missing.
- [ ] Retain old campus/floor preview getter interfaces by deriving flattened views from canonical feed; new event browser consumes canonical feed only.
- [ ] For legacy getter return types, explicitly construct `CampusEventOverlay` compatibility views using public marker fields and `restrictedAreas: []`, then project locationRef/eventFurniture/eventLabels from the chosen location. Do not cast the public object to the fuller type or reintroduce private raw metadata.
- [ ] Inspect `usePublishedCampus` cache hydration as well as the RPC: old cached snapshots must not reintroduce embedded event documents. Sanitize/version the cache when necessary without deleting unrelated user state.
- [ ] Preserve org create/update/submit/duplicate APIs with frozen-status checks and protected-field stripping. Failure preserves draft.
- [ ] Add readable publication activity labels.
- [ ] Run `node node_modules/vitest/vitest.mjs run src/services/__tests__/eventOverlayService.test.ts src/services/__tests__/campusService.test.ts src/services/__tests__/adminActivityPresentation.test.ts --reporter=dot --maxWorkers=1`.
- [ ] Verify real feed/admin response in staging separately from mocked unit PASS.

## Task 4: Administrator UI before and after approval

**Files:** `AdminEventLayoutsPage.tsx`, new `AdminEventPublicationDialog.tsx` and `__tests__/AdminEventPublicationDialog.test.tsx`, new `src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx`.
**Consumes:** Atomic services/server updatedAt/themed date controls.
**Produces:** Distinct pending review and approved publication management.

- [ ] Add failing tests: pending opens Review; approved opens Manage publication, not another Approve action; saved timing prefilled in Manila.
- [ ] Add user-action test for unpublish cancellation:

```ts
fireEvent.click(screen.getByRole("button", { name: /Manage publication/i }));
fireEvent.click(screen.getByRole("button", { name: /Unpublish/i }));
fireEvent.click(screen.getByRole("button", { name: /Keep published/i }));
expect(manageEventPublication).not.toHaveBeenCalled();
```

- [ ] Remove/rename misleading Quick Approve bypass. Review still shows all requested previews and feedback.
- [ ] Approved management shows occurrence read-only; schedule, Publish now, Unpublish and republish actions retain layout and approval.
- [ ] Validate missing/invalid dates, past future-schedule, publication>=end and ended event with specific text. Confirm unpublish and moving a currently visible event to future.
- [ ] Disable repeated submits. RPC failure retains inputs; conflict shows refresh; success waits for ack and reloads new revision.
- [ ] Card displays approval separately from Scheduled/Upcoming/Ongoing/Ended/Unpublished.
- [ ] Test dark/light/mobile calendars, label clipping, keyboard and custom confirmations.
- [ ] Run new component/page tests with service/date suites; review focused checkpoint.

## Task 5: Feed hook, clock and whole-event locations

**Files:** new `useEventMapPreviews.ts`/`__tests__/useEventMapPreviews.test.tsx` and `eventMapView.ts`/`__tests__/eventMapView.test.ts`.
**Consumes:** Public feed, campus and identity.
**Produces:** Shared hook plus typed helpers. Import the referenced existing map types from `src/components/map-builder/types.ts` and public types from `src/types/eventPreview.ts`.

```ts
export type VisibleEventCard = PublicEventPreview & { phase: "upcoming" | "ongoing" };
export type ResolvedEventLocation =
  | { kind: "campus"; canvasW: number; canvasH: number }
  | { kind: "floor"; buildingId: string; floorNumber: number; floor: FloorPlan; roomId?: string };
export interface EventVenue {
  id: string; type: "campus" | "building"; x: number; y: number; label: string;
  eventIds: string[];
  locations: Array<{ eventId: string; locationId: string }>;
}
export declare function visibleEventCards(
  events: PublicEventPreview[], nowMs: number, filter: EventMapFilter,
): VisibleEventCard[];
export declare function resolveEventLocation(
  campus: Campus, locationRef: EventLocationRef,
): ResolvedEventLocation | null;
export declare function buildEventVenues(
  campus: Campus, events: PublicEventPreview[],
): EventVenue[];
export declare function selectedEventLocation(
  events: PublicEventPreview[], eventId: string | null, locationId: string | null,
): { event: PublicEventPreview; location: EventOverlayLocation } | null;
```

- [ ] Write failing fake-timer tests: fetch on open, 30s poll including empty list, focus/visibility return, start/end boundaries, close/unmount cleanup.
- [ ] Compute server offset from serverNow at receipt; update on successful feeds. Device clock +/-2 hours still classifies correctly.
- [ ] Reject late responses with request generation/cancellation. Campus/identity/setting changes clear preview state; never remount/reload whole map.
- [ ] Refresh error clears stale preview and exposes Retry without changing base map/camera/route. Known start/end use timers; unknown publication relies on polling.
- [ ] Define helper interfaces and tests: one event with grounds/two floors is one card; floor-only event discoverable; all locations retained across current-floor changes.
- [ ] Resolve floors by comparing actual published `floorLookupId` values; no unsafe suffix extraction or arbitrary first floor.
- [ ] Test B response then delayed A response; only B survives. Repeat for account change and unpublish.
- [ ] Restore timers/mocks/DOM after tests. Run hook/library tests without timeout inflation.

## Task 6: Responsive nonmodal event list/details

**Files:** new `EventMapPanel.tsx`/`__tests__/EventMapPanel.test.tsx`; `EventInfoPanel.tsx` and actual callers found by search.
**Consumes:** Public feed/clock/selection and callbacks.
**Produces:** One panel, no route ownership.

```ts
interface EventMapPanelProps {
  open: boolean; loading: boolean; error: string | null;
  events: PublicEventPreview[]; nowMs: number; filter: EventMapFilter;
  selectedEventId: string | null; selectedLocationId: string | null;
  onClose: () => void; onRetry: () => void;
  onFilterChange: (filter: EventMapFilter) => void;
  onSelectEvent: (eventId: string) => void;
  onViewLocation: (eventId: string, locationId: string) => void;
  onBackToEvents: () => void;
}
```

- [ ] Add failing same-panel behavior tests:

```ts
fireEvent.click(screen.getByRole("button", { name: /College Week/i }));
expect(screen.getByRole("region", { name: /Campus events/i })).toBeInTheDocument();
expect(screen.getByText("3 locations")).toBeInTheDocument();
expect(screen.queryByRole("dialog", { name: "College Week" })).not.toBeInTheDocument();
```

- [ ] Cards show title/text phase/date/organizer/count. All/Ongoing/Upcoming filters have keyboard selection and empty states.
- [ ] Details reuse panel, with Back/title/schedule/organizer/poster/description/all-location actions. Missing poster/long content cannot hide controls.
- [ ] Desktop dock max360px; mobile nonmodal Peek/List/Expanded with buttons and safe-area padding. Existing drawer wrapper always adds overlay: do not reuse it unchanged if it blocks the map.
- [ ] Labeled region, focus return and Escape before map handler; no aria-modal, full-map scrim or background lock.
- [ ] Test 320/360/390/768/1440 widths in browser: no horizontal page overflow, >=44px controls, reachable Close/Collapse and usable exposed map. jsdom width mocks do not prove layout.
- [ ] Run component regressions; preserve other EventInfoPanel callers if they still need modal behavior.

## Task 7: Markers, selected layout and navigation integration

**Files:** new `EventVenueLayer.tsx`/`__tests__/EventVenueLayer.test.tsx`; `EventPreviewLayer.tsx`/test; `CampusMapPage.tsx`/`CampusMapPage.eventOverlayService.test.tsx`.
**Consumes:** Canonical hook/panel/helpers and existing map/floor/camera handlers.
**Produces:** Discoverable locations and one selected read-only layout.

- [ ] Failing integration tests: closed default, setting on/off, empty trigger, floor-only discovery, all locations on one card, one selected layout, panel exclusivity.
- [ ] Replace inline floor/grounds feed effect with hook. Keep focused selection/state in event modules.
- [ ] Store eventId/locationId; derive current selected object from latest feed. Expired/revoked/removed events cannot remain as detached stale objects.
- [ ] Campus venue markers cover grounds/buildings; shared venues use chooser/count. Indoor assets appear only on exact requested floor, never outdoor overview.
- [ ] Grounds anchor from authored bounds/markers; general fallback clearly says grounds. Empty layout still has a discoverable venue.
- [ ] Follow map-to-screen conventions; interactive marker remains >=44 CSSpx through zoom/responsive viewBox. Inverse SVG camera zoom alone may not compensate viewport scale.
- [ ] Render selected location's assets only, preserving size/rotation/z-order. Layer is visual-only except explicit markers; ordinary map gestures remain available.
- [ ] Explicit View location uses published resolver; does not start/end route or change graph. Camera/floor changes only after explicit action.
- [ ] Toggle/filter/details/refresh/error/close must preserve route/destination/search/accessibility/camera. Other map panels close Events without discarding route.
- [ ] Integrate Escape/defaultPrevented with global shortcut handler. Panel scrolling/typing must not pan/delete on map.
- [ ] Tests cover route/camera identity, wrong/missing floors, cross-campus late response, empty/error feed and shared venue.
- [ ] Run new map/hook tests plus `CampusMapPage.eventOverlayService.test.tsx` with `--reporter=dot --maxWorkers=1`; perform actual desktop/mobile gestures.

## Task 8: Finish confirmed creation/editor gaps

**Files:** Existing proposal/location/editor/tutorial/autosave/submit files and corresponding tests in verification plan.
**Consumes:** Current event flow plus completed viewing/publication.
**Produces:** Freshly verified full creation-to-preview journey.

- [ ] Execute all ORG cases in verification plan from fresh state, not old checked boxes.
- [ ] Verify campus-dependent selection, clear safeguard, no org dates, correct confirmation and single create.
- [ ] Verify every location's real save/reload/submit counts and owner isolation.
- [ ] Verify viewport editor, fixed new sizes, all six Arrange actions, 12-chair 5/5/2, atomic invalid fit and tutorial targets.
- [ ] Verify tab return, save-in-flight newer edits, failed save/retry and unsaved Back protection.
- [ ] Fix confirmed defects only. Add a behavior regression, observe fail, minimal fix, rerun actual scenario.
- [ ] Preserve already-working editor behavior instead of redesigning it for the student viewer.

## Task 9: Integrated staging journey and implementation report

**Files:** new staging verifier/report; evidence `docs/verification/event-full-pack-2026-10-02/`.
**Consumes:** All implemented modules and isolated role accounts.
**Produces:** Reviewable diff and reproducible actual evidence.

- [ ] Verifier uses explicit `EVENT_TEST_SUPABASE_URL`, `EVENT_TEST_SUPABASE_PUBLISHABLE_KEY`, dedicated role credentials and allowlisted test project. Refuse writes without `EVENT_TEST_ALLOW_WRITES=staging-only` and verified target. No production .env fallback.
- [ ] Separate anon/admin/student/org-A/org-B clients with actual JWTs; service-role provisioning is not student authorization proof. Record created fixture IDs.
- [ ] Run real org confirmation/design/save/reload/submit → admin approval → student all-location preview.
- [ ] Run publication from initially empty list, reschedule before/after visibility, unpublish/republish and stale admin conflict. Compare persisted ISO to Manila UI.
- [ ] Compare canonical base/non-event rows/graph before/after; no structural changes. Cleanup recorded fixtures only.
- [ ] Run full verification commands, build/TypeScript/diff checks after final edits. Resolve introduced errors; report baseline failures.
- [ ] Write implementation report with changed UI entry points, exact command output/counts, database roles/migrations, browser widths/screenshots, cleanup and blockers.

## Task 10: Separate Luna verification and independent Sol handoff

- [ ] Finish all available implementation tasks and name precise BLOCKED environment checks.
- [ ] Next Luna / Max pass executes the separate verification document from fresh state; implementation-time PASS is not a substitute.
- [ ] Produce `docs/2026-10-02-event-full-pack-verification-report.md` with case table, repairs/retests and evidence.
- [ ] Sol inputs: approved design, both plans, implementation/verification reports, current diff, logs/screenshots and staging setup without secrets.
- [ ] Overall verified only with real browser/database proof. Local/staging verification is not deployment.

## Completion gate

- [ ] Admin schedules at approval and changes publication afterward without reapproval.
- [ ] One card/event includes every approved location; exact selected layout/map.
- [ ] Upcoming/Ongoing/boundaries, empty-feed polling, reschedule/unpublish and expiry cleanup work.
- [ ] Nonmodal mobile/desktop UI remains compatible with normal navigation.
- [ ] Executed SQL/JWT tests prove permissions, stale-update safety and public projection.
- [ ] Creation/editor regressions pass; base map unchanged.
- [ ] Reports distinguish PASS/FAIL/BLOCKED, baseline diagnostics, physical calibration and deployment.

## Design-to-test coverage

| Approved requirement | Implementation | Fresh verification |
| --- | --- | --- |
| Published campus, requested locations, create confirmation | Task 8 | ORG01–ORG05 |
| Stable editor/assets/Arrange/seating/tutorial | Task 8 | ORG06–ORG12 |
| Whole proposal approval and read-only review | Tasks 2–4 | ADM01–ADM06 |
| After-approval reschedule/unpublish/republish | Tasks 2–4 | ADM07–ADM13 |
| Time phases and exact boundaries | Tasks 1, 2, 5 | ADM03, TIME01–TIME07, DB03 |
| One event card, all requested locations | Tasks 5–7 | MAP02–MAP07 |
| Correct map/floor and one selected layout | Tasks 5, 7 | MAP06–MAP10 |
| Nonmodal themed desktop/mobile UI | Tasks 4, 6, 7 | ADM02, UX01–UX09 |
| Preserve routes, camera, base-map geometry | Tasks 7–9 | UX04–UX06, DB09, DB14 |
| Empty-list polling, stale selection and cross-campus responses | Tasks 5, 7 | MAP11–MAP12, TIME01–TIME07 |
| Server permissions, public allowlisting, atomic stale writes | Tasks 2, 3, 9 | ORG13, ADM12–ADM13, DB01–DB13 |
| Real role/persistence proof and final independent review | Tasks 9, 10 | DB11–DB14, SOL01–SOL09 |

## Execution checkpoint (2026-10-02)

- [x] Implement the client event creation/review/publication/student map workflow and add the pending SQL migration, assertions, and staging preflight source.
- [x] Run focused event tests: final run 8 files / 51 tests passed; run production build and staging-verifier syntax check successfully. Expanded aggregate run still failed (112 passed / 1 failed), although its isolated retry passed.
- [x] Write `docs/2026-10-02-event-full-pack-implementation-report.md` with verified results and blockers.
- [ ] Apply/execute migrations and role assertions on isolated staging — blocked until an approved staging target and role credentials are available; nothing was applied.
- [ ] Complete authenticated desktop/mobile browser journey and fresh-state ORG/ADM/MAP/TIME/DB cases — no authenticated staging session available.
- [ ] Run the separate verification plan and independent Sol review; implementation-time checks do not satisfy those passes.

## Copy/paste: Luna implementation

```text
Use the user-selected GPT-6 Luna with Max effort in this workspace. Read docs/superpowers/specs/2026-10-02-event-full-pack-design.md and execute docs/superpowers/plans/2026-10-02-event-full-pack-implementation-luna-max.md task by task with executing-plans. Complete the existing org creation/editor/submission flow, admin publication during and after approval, Upcoming/Ongoing whole-event browsing, every approved requested location, and a nonmodal desktop/mobile map panel with one selected layout and navigation preserved. Implement atomic admin commands, backend guards and allowlisted public preview; mocks/builds are not actual database proof. Preserve existing dirty-tree work. No commits, pushes, deployment, production writes, demo reprovisioning, new chat or model changes. Use verified isolated test database/accounts; continue independent work when access is blocked and record precise prerequisites. Add regressions, run checks, capture sanitized evidence and write docs/2026-10-02-event-full-pack-implementation-report.md. Run the separate verification plan afterward before claiming integrated completion.
```
