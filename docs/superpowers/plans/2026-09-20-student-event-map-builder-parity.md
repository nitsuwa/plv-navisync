# Student Event Map Builder Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Student Org event editor use the Admin Map Builder's focused workspace language and reliable canvas interactions while keeping event overlays isolated from the published campus map.

**Architecture:** Keep `StudentEventEditPage` as the normalized multi-location coordinator, improve `EventLocationSwitcher` into an Admin-style location rail, and refine `EventFloorEditor` as the event-only canvas. Reuse the existing pure viewport helpers and event overlay save boundary; do not import Admin persistence or mutate published map objects.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, Lucide icons, Vitest, Testing Library, Vite.

## Global Constraints

- Published rooms, walls, doors, windows, and permanent furniture remain read-only.
- Event saves continue through `replaceEventOverlayLocation` and the existing event overlay service.
- The editor exposes only Select, Furniture, Label, and Pan tools.
- Normal wheel pans; Ctrl/Cmd+wheel zooms around the pointer; Space and middle mouse pan through bounded viewport movement.
- Fit View is keyed to the selected location and does not reset on ordinary item edits.
- Preserve legacy event overlays, recovered location drafts, save/submit behavior, and mobile layouts.
- Do not change the Admin Map Builder persistence model or add database tables.
- Do not stage or commit while the repository Git index is read-only.

---

### Task 1: Characterize the approved event workspace and location rail

**Files:**
- Modify: `src/components/events/__tests__/EventLocationSwitcher.test.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- Tests consume the existing `EventLocationSwitcher` props and `EventFloorEditor` props.
- Tests assert public behavior and accessible labels, not implementation-specific class names.

- [ ] **Step 1: Write failing location-rail tests**

Add assertions that the switcher renders an explicit “Event locations” region, shows building/floor context for a building location, exposes counts with the expected furniture/label wording, marks the active card with `aria-current="page"`, and exposes a visible switch hint/action for inactive locations.

Example assertions:

```tsx
expect(screen.getByRole("complementary", { name: /event locations/i })).toBeInTheDocument();
expect(screen.getByText(/Science Building/)).toBeInTheDocument();
expect(screen.getByText(/1 furniture · 0 labels/)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /edit science building/i })).toHaveAttribute("aria-current", "page");
```

- [ ] **Step 2: Write failing event-workspace tests**

Add assertions that the canvas exposes an Admin-style workspace cue and explicit viewport controls: a `Fit map to content` action, snap toggle, zoom percentage, and a concise locked-base-map status in read-only mode. Add a test that switching the active tool to Pan presents a grab cursor while the event item remains unchanged.

- [ ] **Step 3: Run the focused tests and verify the new assertions fail**

Run:

```powershell
node node_modules\\vitest\\vitest.mjs run src/components/events/__tests__/EventLocationSwitcher.test.tsx src/components/events/__tests__/EventFloorEditor.test.tsx --reporter=verbose --maxWorkers=1
```

Expected: existing tests may pass, but each new assertion must fail against the current UI before production code changes are made.

### Task 2: Polish the Admin-style location rail

**Files:**
- Modify: `src/components/events/EventLocationSwitcher.tsx`
- Modify: `src/components/events/__tests__/EventLocationSwitcher.test.tsx`

**Interfaces:**
- `EventLocationSwitcher` continues to accept `locations`, `activeLocationId`, and `onChange`.
- It continues to call `onChange(location.id)` without persisting or rewriting overlay data.

- [ ] **Step 1: Add location metadata helpers in the component**

Derive a compact context label from `locationRef.type`, `buildingId`, and `floorId` without changing the normalized type. Use the existing `countEventOverlayItems` result for the count row.

- [ ] **Step 2: Implement the desktop rail and mobile strip treatment**

Render an accessible complementary region with an Admin-style header, a short “published map locked” cue, cards that use the primary active treatment, an active check/indicator, and a small “Edit map”/“Switch map” affordance. Keep the rail fixed-width on `lg` screens and horizontally scrollable below `lg`; preserve at least 44px touch targets.

- [ ] **Step 3: Run the location-switcher tests**

Run the focused test file and confirm the new UI assertions pass without changing the callback contract.

### Task 3: Align the event canvas shell and interaction feedback

**Files:**
- Modify: `src/components/events/EventFloorEditor.tsx`
- Modify: `src/components/events/__tests__/EventFloorEditor.test.tsx`

**Interfaces:**
- `EventFloorEditor` keeps the existing props and callbacks.
- Viewport state remains local to the selected editor instance; event furniture and labels remain the only editable data.

- [ ] **Step 1: Add the smallest production changes needed for failing behavior tests**

Make the event header/toolbar use the same compact spacing, separators, tooltip-like labels, and status language as the Admin Map Builder. Add explicit accessible names for the workspace tools and viewport controls while keeping existing compatibility labels such as `Reset map view`.

- [ ] **Step 2: Harden pan gesture cleanup**

Use the existing pan state and clamp helpers, but clear active pan/drag/resize/rotate state on window mouse-up, blur, visibility change, and tool/location teardown. Ensure an item drag cannot be mistaken for a viewport pan when Space is released.

- [ ] **Step 3: Harden coordinate conversion and fit lifecycle**

Use the current canvas bounding rect and safe finite zoom values for placement/drop coordinates. Keep fit keyed by the floor-plan/location key, run it once after a measurable canvas layout, and avoid refitting after furniture/label edits.

- [ ] **Step 4: Add concise canvas status feedback**

Show the current interaction hint (`Space + drag`, `Ctrl/Cmd + wheel`) in the bottom status area, show the locked-base-map cue in read-only mode, and keep all hints pointer-transparent so they never block plotting.

- [ ] **Step 5: Run the focused event editor tests**

Run:

```powershell
node node_modules\\vitest\\vitest.mjs run src/lib/__tests__/eventViewport.test.ts src/components/events/__tests__/EventFloorEditor.test.tsx src/components/events/__tests__/EventLocationSwitcher.test.tsx --reporter=verbose --maxWorkers=1
```

Expected: all focused tests pass, including the new pan/zoom/fit and workspace assertions.

### Task 4: Verify the implementation and review the diff

**Files:**
- No additional production files.

- [ ] **Step 1: Run the focused regression suite**

Run the viewport, event editor, location switcher, event overlay, and relevant layout tests. Confirm the command exits with code 0 and reports zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
pnpm build
```

Confirm Vite completes successfully. Treat the existing Rolldown/esbuild deprecation messages as warnings unless the build exits non-zero.

- [ ] **Step 3: Check formatting and scope**

Run:

```powershell
git diff --check
git status --short
```

Confirm no whitespace errors and inspect that only event editor tests/components and the new design/plan docs are changed; do not stage or commit because the Git index is read-only.

- [ ] **Step 4: Perform browser-level visual QA if the local dev server is available**

Start the existing Vite dev command through the webapp-testing helper, wait for `networkidle`, and inspect the event editor at desktop and narrow viewport sizes. Verify the rail, toolbar, canvas controls, and location switcher are not clipped or overlapping. If auth/data prevents the route from loading, report that limitation with the successful automated test/build evidence instead of claiming visual completion.
