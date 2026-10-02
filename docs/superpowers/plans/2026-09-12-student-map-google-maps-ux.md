# Student Map Google Maps-Inspired UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student campus map feel like a familiar, touch-friendly navigation app on desktop and mobile while preserving all existing map, route, accessibility, emergency, floor-plan, and event-overlay behavior.

**Architecture:** Keep `CampusMapPage` as the owner of map state and callbacks, but move the repeated floating controls into a focused `StudentMapControls` component. The component will render the same semantic controls at responsive breakpoints, while the page continues to own search results, route planning, map gestures, and building selection. Use existing Tailwind/theme tokens and Lucide icons; no new dependencies or backend changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4 utilities, Lucide React, Vitest, Testing Library, Playwright-compatible browser verification.

## Global Constraints

- Do not commit or push changes.
- Do not change event approval, campus-map permissions, or published-map data behavior.
- Keep map gestures available: drag, wheel zoom, pinch zoom, and double-click zoom.
- Keep desktop and mobile controls keyboard accessible with visible labels/tooltips and focus states.
- Keep touch targets at least 44px for primary controls and avoid controls covering the mobile bottom navigation or building sheet.
- Preserve reduced-motion behavior already handled by the page.

---

### Task 1: Add regression coverage for the student map control surface

**Files:**
- Create: `src/components/map/__tests__/StudentMapControls.test.tsx`
- Create: `src/components/map/StudentMapControls.tsx`

**Interfaces:**
- Produces `StudentMapControls` with controlled search, map-mode, direction, location, and building-selection callbacks.
- Accepts `SearchResult[]` so the control owns only presentation and selection events, not search data fetching.

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:

```tsx
it("keeps the primary search, directions, and location actions named", () => {
  render(<StudentMapControls {...props()} />);
  expect(screen.getByRole("searchbox", { name: "Search campus map" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
});

it("exposes map modes as a single pressed filter group", () => {
  render(<StudentMapControls {...props({ mapMode: "accessible" })} />);
  expect(screen.getByRole("button", { name: /Accessible routes/i })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /All buildings/i })).toHaveAttribute("aria-pressed", "false");
});

it("selects a search result without submitting a form", () => {
  const onSelectSearchResult = vi.fn();
  render(<StudentMapControls {...props({ searchFocused: true, searchResults: [result], onSelectSearchResult })} />);
  fireEvent.click(screen.getByRole("option", { name: /Science Hall/i }));
  expect(onSelectSearchResult).toHaveBeenCalledWith(result);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run src/components/map/__tests__/StudentMapControls.test.tsx`

Expected: FAIL because `StudentMapControls` does not yet exist.

- [ ] **Step 3: Implement the minimal accessible control component**

Implement a controlled component with:

- a desktop floating search card with search results in an accessible listbox;
- a mobile full-width search card with a 44px directions button and a separate location button;
- horizontally scrollable filter chips for All buildings, Accessible routes, and Emergency;
- an optional compact building shortcut row on campus mode;
- `aria-pressed`, `aria-label`, `role="searchbox"`, and `role="option"` semantics;
- clear button behavior and no form submission.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run src/components/map/__tests__/StudentMapControls.test.tsx`

Expected: PASS.

### Task 2: Replace duplicated map controls with the responsive control component

**Files:**
- Modify: `src/pages/CampusMapPage.tsx:2640-3220`
- Modify: `src/components/map/index.ts`

**Interfaces:**
- `CampusMapPage` supplies `search`, `searchFocused`, `mapMode`, `selected`, `MOCK_BUILDINGS`, `campusSearch.results`, and all existing callback functions to `StudentMapControls`.
- `StudentMapControls` emits selection, mode, directions, location, and floor-plan navigation events; the page remains the source of truth.

- [ ] **Step 1: Add a page-level render test for the new landmark regions**

Extend the existing page test setup so the rendered map exposes:

```tsx
expect(screen.getByTestId("student-map-controls")).toBeInTheDocument();
expect(screen.getByTestId("student-map-quick-filters")).toBeInTheDocument();
expect(screen.getByRole("searchbox", { name: "Search campus map" })).toHaveAttribute(
  "placeholder",
  "Search buildings, offices, and rooms",
);
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `pnpm exec vitest run src/pages/__tests__/CampusMapPage.studentMapUx.test.tsx`

Expected: FAIL because the new landmarks and search label are not present.

- [ ] **Step 3: Wire the component into the page**

Replace the existing desktop and mobile search/filter/building shortcut markup with one `StudentMapControls` instance. Keep the existing directions dialog, floor breadcrumb, floor selector, building info panels, route panels, and map SVG outside the component. Add a lightweight compact desktop location control using the existing `locating`, `pinning`, `youAreHere`, and `locateMe`/`clearYouAreHere` callbacks.

- [ ] **Step 4: Update layout and touch affordances**

Use responsive positioning so:

- desktop: search/control card is upper-left with a 360px max width; utility buttons are separated from the search; selected details remain lower-left;
- mobile: search uses safe-area top padding, filters scroll horizontally below it, the map canvas is allowed to occupy the available space, and controls sit above the bottom navigation/sheet;
- all control groups have `data-no-drag` and stop map gestures only while the pointer is over the control surface;
- selected-building and route states hide discovery shortcuts to reduce clutter.

- [ ] **Step 5: Run focused page and component tests**

Run: `pnpm exec vitest run src/components/map/__tests__/StudentMapControls.test.tsx src/pages/__tests__/CampusMapPage.studentMapUx.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx`

Expected: PASS.

### Task 3: Improve mobile map framing and desktop navigation affordances

**Files:**
- Modify: `src/pages/CampusMapPage.tsx:2216-2220, 2830-3210`
- Modify: `src/styles/index.css`

**Interfaces:**
- No new public data interfaces. This task adjusts the existing SVG viewport and utility surface only.

- [ ] **Step 1: Add a regression assertion for map framing classes/hooks**

Assert that the main map surface has `data-testid="student-map-surface"`, `aria-label="Interactive campus map"`, and the mobile control surface has a safe-area-aware class or style hook.

- [ ] **Step 2: Run the assertion to verify it fails**

Run: `pnpm exec vitest run src/pages/__tests__/CampusMapPage.studentMapUx.test.tsx`

Expected: FAIL because the landmarks do not yet exist.

- [ ] **Step 3: Implement the framing improvements**

Add semantic map landmarks, a subtle map vignette/compass treatment that does not interfere with SVG interaction, and responsive CSS for safe areas, hidden scrollbars, focus rings, and control elevation. Keep the current `preserveAspectRatio="xMidYMid meet"` behavior for authored geometry; adjust only the surrounding surface and initial mobile scale through existing zoom/pan state so building geometry is not distorted.

- [ ] **Step 4: Run focused tests and build**

Run:

```text
pnpm exec vitest run src/components/map/__tests__/StudentMapControls.test.tsx src/pages/__tests__/CampusMapPage.studentMapUx.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx
node node_modules/vite/bin/vite.js build
```

Expected: focused tests pass and the production build completes with only existing non-blocking chunk warnings, if any.

### Task 4: Verify the experience at desktop and mobile sizes

**Files:**
- No source changes unless verification finds a concrete defect.

- [ ] **Step 1: Verify desktop rendering**

Open `http://localhost:5173/map` at a desktop viewport and confirm the floating search, filters, building shortcuts, map controls, building selection, directions, and route card remain usable without covering the map.

- [ ] **Step 2: Verify mobile rendering**

Use a narrow viewport and confirm the map is not reduced to a tiny centered thumbnail, search and filters remain reachable, controls do not overlap the bottom dock, and the building sheet can be opened and dismissed.

- [ ] **Step 3: Verify keyboard behavior**

Tab through the search, directions, location, filter, and building controls. Confirm visible focus and usable labels; type a search and select a result with the keyboard.

- [ ] **Step 4: Run final verification**

Run `git diff --check`, the focused tests, and the production build. Report any pre-existing full-suite failures separately rather than treating them as caused by this UI work.

## Self-review checklist

- [ ] The map remains the primary surface on both breakpoints.
- [ ] The mobile map no longer appears as a small centered thumbnail at the default viewport.
- [ ] Search, directions, location, filters, and building selection remain discoverable and accessible.
- [ ] Existing route/event/building behavior is delegated unchanged to `CampusMapPage`.
- [ ] No event permissions or admin-published map data can be deleted or mutated from the student view.
- [ ] No commit or push is performed.
