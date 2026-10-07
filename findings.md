# Findings & Decisions

## Create Event follow-up findings

- A fresh service read is insufficient concurrency protection if the layout originated from an older browser version. Forward the version displayed to the editor/details/submission caller; reject newer rows before merging and retain CAS on writes. Actual two-tab test reproduced this defect and passed after correction.
- Existing poster removal should clear the reference without deleting stored contents, since duplicated proposals may share URLs. Only QA-owned disposable object paths are deleted by test cleanup.
- Public storage responses may remain cached after deletion; verify the authoritative storage listing rather than interpreting a cached HTTP 200 as a failed delete.
- Creation dialog close previously focused a control inside the unmounted dialog; preserve the entry trigger for focus return. Real keyboard RED/GREEN evidence verifies the fix.

## October 3 — final Create Event browser findings

- Supabase JSONB can return equivalent object keys in a different order. Raw JSON.stringify equality falsely reported dirty layouts and failed lost-response creation recovery. Canonical recursive object-key ordering now preserves array order and matches semantic JSON equality.
- A save callback retained an old active-location closure while its shared editor ref belonged to the newly selected floor. Capturing through the current location ID ref prevents the next floor's snapshot from replacing the old layout; deferred-switch regression and actual two-location persistence checks pass.
- Mounting the review dialog and direct card preview together left the preview aria-hidden. Open the nested preview on the next animation frame after the parent dialog mounts; actual accessible Pan and second-floor controls pass from the card entry.
- Final event verification: 263 core + 156 helper/public tests PASS; build PASS; actual J1 and L03 PASS with own disposable fixture removed. Poster SQL, missing configured roles, positive live publication and remaining integrated/manual cases keep acceptance PARTIAL.

## Requirements

- Improve the student user role UI/UX and frontend experience.
- Improve the create-event function and student-organization workflow.
- Admins grant or make a student account a student organization.
- A student organization submits an event map for admin review and approval.
- The student map is based on the admin-published campus/building map.
- Student organizations may add event content and remove only content they added.
- Student organizations must not delete or modify admin-published map content.
- Students may request permission to use campus grounds and/or areas inside buildings.
- The `student_org` role is not self-service: a student must first submit the required physical document to the office, after which an admin promotes that account to `student_org`.
- Physical-document verification is manual/offline only; the application will not upload, store, or track the document.
- Location access and event-map review will use a combined approval flow: the student organization requests the location and submits the map together; the admin approves or rejects them in one review.
- One event may request multiple locations, including campus grounds and one or more building floors.
- One event may request multiple locations, including campus grounds and one or more building floors.
- Add event assets for booth, chairs, stage, speakers, projector, and monitors.
- Remove the event date range from the event proposal while keeping the title, description, other information, and map.

## Research Findings

- Existing event-related pages include `src/pages/AdminEventsPage.tsx`, `src/pages/AdminEventLayoutsPage.tsx`, `src/pages/StudentMyEventsPage.tsx`, and `src/pages/StudentEventEditPage.tsx`.
- Existing event-specific map editing is in `src/components/events/EventFloorEditor.tsx`.
- Existing map-builder systems are split between `src/components/map-builder/` and `src/components/map-builder-v2/`.
- Existing asset-related code includes `src/lib/decorAsset.ts`, `src/components/map-builder/DecorAssetVisual.tsx`, and `src/components/map-builder/constants.ts`.
- Event persistence/service code exists in `src/services/eventService.ts` and `src/services/eventOverlayService.ts`.
- Student authentication/account code exists in `src/contexts/StudentAuthContext.tsx`, `src/hooks/useStudentAuth.ts`, and `src/services/studentAccountService.ts`.
- Relevant database migrations include `supabase/migrations/20260904120000_add_student_org_role.sql` and `supabase/migrations/20260905120000_event_overlay_schema.sql`.
- Existing tests cover student UX, event services, map-builder rendering, map-builder interaction, and student account behavior.
- No planning files existed before this session.
- The student-org role migration adds `student_org` to `profiles.role` and lets the admin profile-update function assign it.
- The event-overlay migration stores event layouts as `map_elements` rows with `element_type = 'event_overlay'` and JSON metadata.
- Current event-overlay RLS allows a student organization to select, insert, update, and delete its own overlay rows; admins have full access; authenticated users can select approved overlays.
- Current event-overlay RLS protects ownership of the overlay row, but it does not by itself protect nested admin-owned map elements if a student submission contains or references them. The future design must enforce base-map immutability at both UI and persistence boundaries.
- The existing event-overlay policy uses `metadata->>'status' = 'approved'` as the public visibility gate.
- The latest merged map-builder code already contains reusable outdoor rendering and asset primitives such as `ReadonlyOutdoorVisuals`, `readonlyOutdoorCampus`, `DecorAssetVisual`, and the expanded map-builder test suite.
- `StudentMyEventsPage` already gates the page with `isStudentOrg`, lists overlays owned by the current profile, supports create/edit/delete, and links to the event layout editor.
- The current create/edit proposal UI still requires a start date, accepts an optional end date, uploads an optional poster, and lets the student choose campus grounds or a building floor.
- The current student editor provides `select`, `furniture`, `label`, and `pan` tools; event furniture and labels are the only editable data, while the base floor plan is rendered read-only.
- The current event palette already has booth, tent, stage, table, barrier, and signage. It does not yet include chairs, speakers, projector, or monitors as event-specific templates.
- The shared `FloorFurniture` model is generic (`type`, `name`, `category`, geometry, color, layer, and optional lock/visibility fields), so the requested event assets can likely be added without changing the core shape.
- The generic admin map-builder furniture palette already includes `chair` and `projector`; its event editor palette is separate and currently does not reuse that palette.
- The event overlay model currently requires `dateStart` and `dateEnd`, and the student list, admin review screen, event editor header, and active-overlay selectors all display or filter by those dates. Removing dates therefore requires a cross-layer contract decision, not only hiding two inputs.
- The current student event editor route is nested under the public layout and the page itself does the student-org check; direct route protection and API/RLS enforcement should be part of the design review.
- Admin user management already exposes a `Student Org` role in `AdminUsersPage` and routes role changes through `adminUserService`; assigning this role is currently a general profile edit, not a dedicated organization onboarding flow.
- Base `map_elements` authoring policies are admin-only. Published campus content is served from `campus_versions.snapshot`, which is a strong candidate for the student editor's immutable base-map source.
- `campusStructureService.serializeCampusStructure` serializes campus geometry, furniture, decor assets, and event overlays together for the admin save RPC. Student event layout updates currently bypass that RPC and update one `event_overlay` row's JSON metadata.
- The event editor's current palette is a small hard-coded list of `FloorFurniture` templates. It renders event items as absolutely positioned colored rectangles with text labels; it does not yet provide richer visual asset previews, grouping, snapping, or explicit ownership metadata for each added item.
- The current delete action removes the selected event furniture or label from the overlay arrays; base map elements are not exposed as delete targets in the event editor. This is the correct interaction direction, but database-level protection is still needed for any future richer overlay representation.
- Admin review currently approves/disapproves the whole overlay by changing `metadata.status`, with an optional/required feedback comment, but does not have a separate permission-request review step.
- Existing event date filtering (`getApprovedOverlaysForFloor`, `getApprovedOverlaysForCampus`, and `getActiveApprovedOverlays`) would become invalid or need a deliberate replacement if proposal dates are removed.

### Current workflow questions raised by the code

- The current schema appears to model an event overlay as one JSON document rather than separate submission, permission-request, and immutable base-map records.
- The current role migration documents event-map management but does not define a separate campus/building access-request record or approval state.
- The current admin event-layout page provides review/approval UI, while the student event editor owns the map-editing surface; their exact state transitions and save semantics need to be mapped before design approval.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Pending until architecture inspection | The request crosses frontend, persistence, authorization, and database-policy boundaries. |
| Prefer capability-based ownership for student additions | Deletion must be enforced by ownership, not merely hidden in the UI. |
| Prefer a review state machine for event submissions | Draft, submitted, changes requested, and approved states need explicit behavior and auditability. |
| Treat physical-document submission as an offline prerequisite for role assignment | The user specified an office process before promotion; the app should enforce the resulting role without inventing a document-upload workflow unless requested. |
| Combine location access and map approval into one review | This matches the user's selected workflow and keeps the student's allowed editing scope explicit. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| The current repository is in a pending merge state | Keep the merge untouched while planning; do not commit or push. |
| PowerShell wildcard syntax caused `rg` to reject migration paths | Use explicit file paths or PowerShell-compatible filtering for subsequent searches. |
| PowerShell interpreted a double-quoted `rg` pattern containing parentheses as commands | Use single-quoted PowerShell strings for regex patterns. |
| A large combined source inspection exceeded the output budget | Split subsequent inspections into focused file sections. |
| A multi-file planning-note patch had a context mismatch | Re-read the current files and apply focused patches. |

## Follow-up: GitHub-to-local synchronization (2026-09-17)

- The local checkout is `main` at `af7d5a6` and tracks `origin/main`; the currently stored remote-tracking ref reports the branch as 4 commits ahead locally and 12 commits behind.
- `MERGE_HEAD` exists at `eeba653e332dbc13b13a3f26ee7c9302d3c16489`, so a merge is already in progress. Git reports no unmerged paths, which means the index currently contains a conflict-free merge result that can be inspected/continued.
- The index and worktree intentionally differ on many files (`MM` entries), and there are substantial untracked feature, test, documentation, and planning files. These must be preserved; no reset, checkout, clean, or broad stash operation is authorized.
- Remote `origin` is `https://github.com/nitsuwa/plv-navisync.git`; the remote-tracking ref must be refreshed with a fetch before deciding whether the in-progress merge is still current.
- The refreshed GitHub tip is `9133d95`, a merge commit whose first parent is the existing `MERGE_HEAD` `eeba653`; it adds six commits after the in-progress merge head (`de003dd`, `38e87e1`, `f47f419`, `6536431`, `04dacd9`, and `9133d95`).
- The pending merge was originally prepared against `eeba653` and has no unresolved index entries; `.git/MERGE_MSG` records that `src/app/routes.tsx` was the prior conflict, already resolved in the index.
- The current index contains 122 staged paths, while the worktree has 37 modified tracked paths and 80 untracked paths. The unstaged/untracked set includes the event workflow, unified search, tests, planning notes, and local support files, so it cannot be discarded or absorbed into the merge commit accidentally.
- `origin/main` and local `main` now diverge by 4 local-only commits and 18 remote-only commits at the ref level; the remote-only set includes the six commits after `eeba653` plus the earlier history that is not reachable from the local tip. The diff is broad (map-builder, route UI, auth/layout, tests, and removal/changes to event files), so completing the old merge alone would not synchronize to the fetched tip.
- The conflict-free intermediate merge was committed locally as `d6b2124`; this commit has the prior local `HEAD` and `eeba653` as parents and did not include the unstaged/untracked work.

## Resources

- Project root: `C:\Users\Rj\Documents\GitHub\plv-navisync`
- Relevant database migrations: `supabase/migrations/20260904120000_add_student_org_role.sql`, `supabase/migrations/20260905120000_event_overlay_schema.sql`
- Existing map-builder specification: `docs/old mds/map-builder-redesign-spec.md`
- Existing map-builder implementation plan: `docs/old mds/map-builder-implementation-plan.md`

## Visual/Browser Findings

- A browser mockup was used to discuss the choices; the recorded interaction was accidental and the user explicitly said no option was selected.
- Multi-location editing needs a clear location switcher or grouped canvases so the organization can distinguish campus grounds from each building floor.
- The user approved the hybrid recommendation: guided setup for details and location requests, a focused editor with a location switcher, and an all-location admin review.

## Follow-up: Student Navigation & Route Planner UX Findings

- The mobile Route Planner currently exposes building and room pickers in the same vertical flow. Because both look like destination controls, users can reasonably wonder whether they should choose one, both, or choose a room only after choosing a building.
- The destination building list can expand while the optional room selector remains visible, increasing the amount of competing content in the sheet.
- The bottom navigation remains visible while the Route Planner occupies most of the mobile viewport. This makes the planner compete with Home/Map/Profile and reduces usable space, especially when the keyboard or a picker list is open.
- The current map interaction already has separate discovery states: tapping a building opens a building details sheet, while Directions opens Route Planner. These states should remain mutually exclusive and use the selected building as context when Directions is launched from a building.
- The route model supports building-level and room-level endpoints, so the UX can simplify the choice without removing routing capability: building and room can be represented as destination types, with only the selected type's picker visible.
- Recommended default: make Route Planner a focused mode that hides the bottom navigation while open; restore it when the planner closes or the user returns to normal map browsing.
- Recommended endpoint flow: destination-first, with “You are here” as the default start when a manual pin exists. Let the user choose either Building or Room, then show one matching search/picker control. A room result should display its building and floor as context rather than ask for a second competing building selection.

## Follow-up: Student Navigation & Route Planner Design Options

| Option | Shape | Trade-off |
|--------|-------|-----------|
| A. Minimal cleanup | Hide bottom navigation in the planner and visually group the existing building/room controls | Fastest and lowest risk, but the building-versus-room mental model remains partly confusing |
| B. Guided endpoint flow (recommended) | Hide bottom navigation in focused planner mode; choose a destination type first; show only one picker at a time; keep building/floor context on a selected room | Best balance of clarity, mobile ease of use, and reuse of the existing route model |
| C. Unified map search | One search field returns buildings and rooms with type chips and filters | Most natural long term, but requires broader search taxonomy, ranking, and result-state work |

## Follow-up: Best-First Recommendation

- The user prefers the best long-term system state immediately instead of implementing the smaller guided-flow option first.
- Recommended target state: a unified campus destination search modeled after Google Maps, with buildings, rooms, offices, and other searchable campus destinations returned from one field.
- The unified search should still expose lightweight result-type filters (`All`, `Buildings`, `Rooms`, `Offices`) and clear result metadata. A room result must include its building and floor so the user never needs to select a building separately.
- Keep the focused navigation behavior as part of the target state: when Route Planner, Building Details, or Floor Plan is open on mobile, temporarily hide the bottom navigation; restore it when the active sheet closes.
- Keep a destination-first route flow inside the unified planner. Default the origin to the manual dropped pin (“You are here”) when available, and let the user change it through the same unified search.
- Treat map browsing, building details, floor plan, route planning, and active navigation as mutually exclusive presentation states. This prevents stacked sheets and makes the Back action predictable.
- This best-first approach requires a canonical searchable destination index and a clear route-endpoint contract, rather than only rearranging the existing BuildingPicker and RoomEndpointPicker controls.

## Implementation Approval

- The user explicitly said to implement the approved workflow and requested testing instructions and expected behavior after implementation.

## Follow-up: GitHub-to-local synchronization (2026-09-17, continued)

- The conflict-free intermediate merge was committed locally as `d6b2124`; it has the previous local `HEAD` and `eeba653` as parents and did not include the unstaged/untracked local work.
- The remaining local state is safely captured in `stash@{0}` (`preserve local work before syncing origin/main`). The planning files were restored individually from the stash's untracked parent, so the main local-work stash remains intact.
- The fetched GitHub tip `9133d95` merged automatically as local commit `d574e8b` using `ort`; there are no unresolved paths. Local `main` now contains `origin/main` plus the six local commits that include the event work and the two local merge commits.
- The named local-work stash reapplied cleanly on top of `d574e8b`; all previously captured tracked and untracked files returned without conflicts. The stash was intentionally kept as a recoverable backup.
- Fresh integrity evidence: `git merge-base --is-ancestor origin/main HEAD` exited 0, `git ls-files -u` is empty, both staged and unstaged `git diff --check` commands are clean, and local `main` is ahead of `origin/main` by six local commits.
- Focused event-component tests passed with fresh output: 5 files and 36 tests.
- Additional fresh focused results: canvas/map 9 files / 36 tests; event/search libraries 11 / 45; event pages/services 5 / 19; fetched floor-editor/template coverage 11 / 57. The only output anomaly was a non-failing React `ref` warning in `EditorTutorial.test.tsx`.
- Direct Vite production build passed with 2,629 transformed modules in 46.82 seconds. The build output contained the known empty `vendor-dates` chunk and large-chunk warnings, but no build errors.
- Full TypeScript diagnostics are not green after the merge: the elevated check exited 1 with 1,341 diagnostic lines across existing/integration-heavy map-builder, generated database, and service code. The production build and focused tests remain green; targeted filtering is needed to assess the restored feature files.
- Targeted TypeScript filtering found 3 errors in `src/lib/eventLocationData.ts` and 12 errors in `src/pages/CampusMapPage.tsx`, while the new destination-search components and pure search/layout helpers had no matching diagnostics. This is a verification gap to classify, not a claim of a clean typecheck.
- Comparing those locations with the pre-remote stash copy shows the same blocks already existed before merging `origin/main`; they are retained baseline issues in the local feature work, not conflicts introduced by the GitHub merge.
- Final state is conflict-free and synchronized: `HEAD=d574e8b`, `origin/main` is an ancestor, `MERGE_HEAD` is absent, unmerged entries are 0, and the local-work safety stash remains.

## Follow-up: Student Event Builder manual QA (2026-09-21)

- Manual plotting verified click and drag placement for all 14 event asset types. Pan, zoom, snap, undo/redo, location switching, inspector dimensions, lock/unlock, and the button-based rotate action worked without browser-console errors.
- The location rail derives counts from server-normalized locations, not the in-editor draft. It therefore shows stale furniture/label counts until a save replaces the location in the parent overlay.
- `placeFurniture` and the asset-drop path create items from raw world coordinates. They do not call `constrainFurnitureToFloor`, allowing new furniture to be created outside the editable floor even though later resize operations are constrained.
- The single-selection action bubble is anchored directly above the selected item and can overlap the direct rotation handle for items near the top of the canvas.
- The warning strip is a non-wrapping horizontal list. Several warnings clip on the right instead of remaining readable.
- Labels are selectable and draggable but have no label-specific editor. Text mode also creates a new default label after clicking an existing label.
- The floating asset dock can intentionally cover a portion of the canvas but lacks compact/collapsible behavior for constrained viewports.
- The event editor has several icon-only controls with no accessible names or titles.
- The Vite esbuild/Rolldown messages are configuration deprecation warnings. Treat them as a separate compatibility cleanup after the event interaction regression pass.

## Student-side functionality audit (2026-09-21)

- `StudentSettingsPage` renders notification switches, but the three values are component-local state with no persistence or notification-delivery service. The Change Password form reports success locally and clears itself without calling Supabase Auth or a password-update service.
- `StudentProfilePage` includes a profile-photo button with no click handler, stores edited display names only in component state, and declares an empty `RECENT_ACTIVITY` array, so the activity section is a permanent empty state.
- At the time of the initial audit, `StudentHomePage` read `MOCK_SCHEDULE`, hardcoded two announcement cards, and exposed a mobile Schedule shortcut to a missing `#schedule` anchor. Phase 13 removed this out-of-scope content from the student/public surface and deleted the orphaned mock schedule and public announcements page.
- `studentAccountService` falls back to `['b_scb', 'b_caba']` when local storage has no saved IDs, making Favorites appear pre-populated in a fresh browser and coupling account data to a demo default.
- `reportService.toIssueReport` maps database rows without `buildingName`, `floorLabel`, or `imageUrl`, so DB-backed report history loses location/photo display metadata. `StudentReportsPage` also does not define the service's `in_progress` status, so it falls back to the Pending presentation.
- Static inspection also found `BuildingDetailsPage` action gaps: the primary Get Directions and Share buttons have no handlers, Save only flips local component state, Report Issue has no handler, and its map links omit the building target. `BuildingDetailModal`'s Report action routes to `/student/reports?building=...`, but `StudentReportsPage` does not consume that query or open a report form.
- `HelpCenterPage` uses a local keyword-response knowledge base and simulated latency while presenting itself as an online assistant; it has no remote assistant or support-ticket handoff. Its campus-service map links use `?b=...`, which `CampusMapPage` does not read.
- Responsive browser QA was attempted, but the local app could not be attached to the in-app browser. The first `pnpm dev` attempt prompted to reinstall `node_modules` and was aborted; direct Vite then required elevated access and started, but the browser still timed out on localhost/network URLs. No source files or app data were changed by the attempt.

## Follow-up request: remove out-of-scope student Home content (2026-09-21)

- The user-provided screenshots confirm that the student Home currently presents a `TODAY'S SCHEDULE` class list, an `All classes done!` state, and an `ANNOUNCEMENTS` preview.
- The user explicitly stated that Announcements and Today's Schedule/classes are outside the system scope and requested their removal before rerunning the student placeholder/settings and mobile/desktop UX report.
- The intended change must remove the Home sections and their supporting mock schedule/announcement presentation, then preserve the in-scope campus navigation, buildings, favorites, reports, settings, and student-organization event paths.

## Post-removal student audit (2026-09-21)

### Current student-side placeholders or incomplete functionality

- Settings: notification switches are still component-local and do not persist or control a delivery service. Change Password shows a local success state and clears the form without calling Supabase Auth or a password-update service.
- Profile: the profile-photo button has no handler, display-name edits remain local to the component, recent activity is backed by an empty constant, and the security summary is static.
- Favorites: the account service falls back to demo building IDs when storage is empty, so a new browser can appear to have saved buildings. The saved list should be account-backed with an explicit empty state.
- Building details: Get Directions, Share, and Report Issue need real handlers; Save is local-only; and building links do not consistently preserve the selected building/floor context. The modal report link is not yet consumed by the report form.
- Reports: database-backed history drops building/floor/photo metadata, the `in_progress` status is presented as Pending, and the New Report flow is not prefilled when opened from a building.
- Help Center: the assistant uses a local keyword-response table and simulated latency, with no support-ticket handoff. Campus-service map links use a query shape that the map page does not consume.

Announcements and Today's Schedule/classes are intentionally excluded from this current student report because the user confirmed they are outside the system scope. The admin Announcements workflow remains available for administrators.

### Mobile UI/UX recommendations

- Keep Home focused on the supported tasks: search, Navigate, Buildings, Report, Favorites, Reports, and student-organization Events. Use three equal quick-action tiles and make Favorites/Reports visible without relying on a hidden drawer.
- Make Report a direct, contextual flow. When launched from a building or map pin, carry the building, floor, and coordinates into the form and show a short confirmation after submission.
- Use a bottom-sheet pattern for building details with one primary action, a clear close/back affordance, and a compact action row for Directions, Save, Share, and Report.
- Hide bottom navigation while Map, Route Planner, Floor Plan, or a full-screen form is active. Restore it when the surface closes so controls do not compete for vertical space.
- Add explicit loading, empty, error, and offline states for Favorites, Reports, Profile, and Events. Avoid silent no-op buttons and local-only success messages.
- Maintain 44px minimum touch targets, strong focus/pressed states, readable contrast, and safe-area padding around the bottom navigation and sheets.

### Desktop UI/UX recommendations

- Use a wider content grid for Home, with a clear primary task area and secondary account/report panels rather than stacking long cards vertically.
- Keep the student navigation hierarchy stable and expose Home, Map, Buildings, Favorites, Reports, Profile, and Events with active-state context.
- Give building details a consistent two-column layout: identity/location summary on the left and map/floor/actions on the right. Keep the primary action visually dominant.
- Add a report timeline with normalized statuses, location metadata, photos, and clear next steps. Use confirmation dialogs only for destructive actions.
- Replace placeholder forms with inline validation, server-pending states, retry actions, and field-level errors. Persist settings/profile changes and confirm the saved state.
- Provide keyboard navigation, visible focus, semantic headings, accessible names for icon controls, responsive zoom behavior, and a reduced-motion option.

### Recommended implementation order

1. Normalize canonical map/report deep links and prefill building, floor, and coordinate context.
2. Make Settings, Profile, and Favorites account-backed, including password update, notification persistence, avatar/name updates, and an honest empty state.
3. Normalize report metadata and status presentation across the service, history list, and detail flow.
4. Wire Building Details actions and the modal-to-report handoff, then add success/error/loading states.
5. Replace the Help Center demo assistant with a clearly labeled support flow and consistent map links.
6. Apply the responsive/a11y polish pass after the data and action flows are functional.

## Follow-up implementation: Student Home published building preview

- The Home page was using the legacy campus context for its building cards, while the public map and Buildings Directory use the published-campus hook. That source mismatch caused the Home Buildings section to render only its heading and “View All” link.
- Home now derives building cards from the canonical published map and shows up to four buildings as a quick-access preview. It does not fabricate entries or display the entire directory in the dashboard.
- Loading and no-published-building states are explicit, with an “Open Campus Map” recovery link.

## Event Builder input and motion polish request (2026-09-21)

- User-reported blocker: clicking the floating Snap control can also place the currently armed furniture item behind the control. The likely class of defect is toolbar pointer/click propagation reaching the canvas placement handler, but source inspection and a regression test are required before fixing it.
- Furniture dragging visibly jitters or glitches instead of tracking the pointer continuously. The input path must be audited for mixed screen/world coordinates, snap rounding during every pointer move, React state churn, and competing pointer handlers.
- Holding Space can pan, but the editor gives no reliable visual or cursor state that panning is armed/active. Mouse-wheel panning and zooming feel abrupt and inconsistent.
- The student event floor view looks materially simpler than the Admin Map Builder view. Published architecture should remain locked but should retain authored walls, doors, passages, circulation, furniture, labels, and visual hierarchy wherever those elements exist in the published snapshot.
- Presentation goal: predictable pointer capture, no click-through placement from editor chrome, smooth transform-only viewport motion, explicit pan feedback, stable snap-on-drop behavior, and closer read-only visual parity with the Admin builder.
- Confirmed Snap root cause: `handleCanvasClick` treats every bubbled click inside the editor root as a placement click unless it originates from `[data-event-item]`. The floating viewport/Snap controls are not marked as editor chrome and do not stop propagation, so clicking Snap while Furniture is armed places the active template behind the control.
- Confirmed drag instability: the gesture stores only an item offset, then on every `mousemove` it recomputes snapping from the latest React-rendered item array, derives a delta from the latest item position, and writes both furniture and label arrays. Grid/alignment snapping also runs on every frame. This mixes an absolute pointer target with incrementally changing origins and makes boundary/snap oscillation and render churn likely.
- Confirmed viewport roughness: pan and wheel events call React `setPan` directly for every event, and zoom immediately writes zoom/pan with no frame-coalescing or eased target state. The canvas cursor only distinguishes `grab`; the active pan gesture remains visually indistinguishable from an armed pan state.
- Confirmed visual mismatch: the student event floor manually renders rooms as translucent rectangles, doors/windows as plain rectangles, and permanent furniture as generic boxes. It omits the richer authored surface, circulation visuals, labels, ramps, stairs, elevators, paths, asset symbols, and appearance hierarchy available in the map-builder read-only scene.
- The repository already contains two useful foundations: `useCanvasControls` demonstrates target-based eased zoom in the Admin Map Builder, while `ReadonlyFloorPlanVisuals.tsx` renders substantially more of a published floor than the event editor. The latter is still a presentation renderer rather than exact Admin-editor output, so parity work should share or extend canonical read-only primitives instead of copying the 18k-line authoring component.

### Resolved findings

- The apparent Admin/student floor mismatch had two causes, not one: the Event Builder used a simplified renderer, and `resolveFloorPlanForEvent` intentionally discarded every published layer except rooms. Both paths now preserve and render the authoritative published floor snapshot.
- Browser inspection exposed a separate performance defect that source-level interaction tests did not initially reveal: `onDraftChange` was included in an editor effect dependency list while `StudentEventEditPage` recreated that callback whenever the active draft location changed. The resulting feedback loop produced repeated maximum-update-depth warnings and unnecessary rerenders. Callback identity is now decoupled from draft publication.
- CABA browser parity after the fix: 12 rooms, 32 walls, 14 doors, 4 stair elements, 1 elevator, and 1 authored label. The prior event view exposed only the 12 rooms.
- The mobile editor at 390x844 has no document-level horizontal overflow. Location cards remain horizontally browsable, primary Save/Submit actions wrap safely, and the viewport controls stay reachable above the map.

## October 3, 2026 — Create Event completion planning

- The user requested a consolidated plan for already implemented work, pending checks, UI/UX improvements and future increments; no implementation was requested in this planning turn.
- Current code includes pending updates, withdrawal, in-place preview, 12-hour time controls, revision history, furniture summary, feedback pins and student resolution checklist.
- User screenshots establish successful migration execution and SQL helper/grant assertions. Authenticated role tests, integrated browser journeys and final visual QA remain distinct and unverified.
- Historical feedback-clearing documentation is superseded by preservation on resubmission. Current acknowledgement matching is location-wide, based on the full encoded feedback string.
- Risks to reproduce: invalid pin entries suppressing valid neighboring pins, callback-identity changes resetting preview Pan mode, and acknowledgement/autosave/submission overlaps. The public-feed verifier does not yet explicitly list feedbackResolutions as a forbidden key.
- Main plan: docs/superpowers/plans/2026-10-03-create-event-completion-and-uiux.md. Detailed test matrix: docs/2026-10-03-create-event-acceptance-matrix.md.
- Recommended executor: GPT-6.1 Sol Medium for the integrated plan; Luna Max for bounded work and Sol Low for isolated presentation work. This is a workload recommendation, not a measured repository benchmark.
