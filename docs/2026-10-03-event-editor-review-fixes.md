# Event editor review fixes

Date: 2026-10-03, Asia/Manila.

## Additional fix: placement on campus buildings

The reported missing building warning was reproduced in failing tests. Campus Grounds represented buildings as rooms, but placement protection only considered entrances and permanent furniture. Building footprints are now protected regions, with their actual rotation preserved. Overlapping furniture produces a critical `building-overlap` warning naming the building and directing indoor placement to its requested floor map. Single-item and preset placement reject this collision; existing furniture is retained and reported through Layout checks. The submission review uses the same shared validation. Hidden buildings are excluded, and ordinary indoor rooms are not treated as outdoor building obstacles.

Verification: 19 geometry/placement/location tests passed; 120 editor/submission tests passed; production build and `git diff --check` passed. Includes single-chair and chair-row collision coverage and a rotated-building test checking that empty corners remain usable. No database or base-map data was changed.

Manual check: Campus Grounds → Furniture → Chair (or Layouts → Chair Row), attempt placement over an orange building. Expect a named building warning and no new furniture committed. Move to open grounds to place normally. Open Layout checks for any previously saved furniture overlapping a building.

All four confirmed findings in `2026-10-03-event-editor-uiux-polish-final-review.md` have been addressed in the local working tree. Existing implementation changes were preserved.

## Changes

1. **Move here and history:** a preview records the furniture state from which it was built. A subsequent furniture change cancels the preview and its confirmation controls. Confirmation also checks the source state before applying it. Undo, Redo and intervening duplication cannot restore stale furniture. Normal confirmation still creates one undoable move.
2. **Mobile layout settings:** below 1024px, presets open a themed Radix settings sheet with a close button, managed focus, a scrollable form, fixed action footer and safe-area padding. The sheet follows the visual viewport when its visible height changes. Closing settings preserves the layout draft and returns focus to Edit layout; it does not commit furniture. Preview on map returns to a compact dock, and touch placement still requires a map destination followed by Place here. The dock is bounded by the available map height and can scroll in short landscape viewports. Desktop keeps its inline configuration.
3. **Objects Escape:** Escape from the Objects panel or its search closes Objects and restores focus to its trigger while retaining the active tool. A subsequent Escape cancels placement. Escape while renaming first cancels renaming through the existing local handler. Radix settings dismissal does not leak into the canvas Escape handler.
4. **Collapsed Locations tour:** the visible Expand locations button is now the tour target when the desktop rail is collapsed. The tour explains how to expand the list and how to open Event location on mobile.

Product files: `EventFloorEditor.tsx`, `EventPlacementDock.tsx`, `EventLocationSwitcher.tsx`, and `EventEditorTutorial.tsx`. No authentication, account, database, environment, package script, dependency, publication service or deployment changes were required.

## Verification evidence

- First reproduced the missing mobile sheet in a failing test; the history, Objects and collapsed-tour regressions had also been reproduced before the fixes.
- Event/editor/canvas/geometry suite: **26 files, 245 tests passed**. This run preceded the three additional history/search cases and the keyboard viewport test below.
- Final affected suites (`EventFloorEditor`, `EventLocationSwitcher`, `EventEditorTutorial`, `EventPlacementDock`): **4 files, 117 tests passed**, including Undo, Redo, intervening duplication, Objects Escape from panel/search, and mobile configure/preview/touch-confirm flow.
- Additional visual-viewport keyboard regression: **1 test passed**. Verified sheet height/bottom update when the mocked visual viewport shrinks, and Escape closes settings while retaining the map preview.
- Final focused run after retaining validation feedback in the compact dock: **8 tests passed** (mobile configuration/validation, visual viewport, Objects panel/search, Undo, Redo and intervening duplication).
- Save/approval/student-preview regression suite: **8 files, 58 tests passed**. These are automated component/hook checks, not live Supabase end-to-end evidence.
- Final production Vite build: **passed**, exit 0. Existing large-chunk warnings remain.
- `git diff --check`: passed; line-ending notices only.
- Repository TypeScript check: exit 1, **1,005 diagnostics**, matching the prior review baseline. No diagnostics matched the four changed product components or their reviewed tests. The repository-wide type gate is still not green.

## Browser verification

Rendered the production editor and switcher in a temporary synthetic fixture using the same layout wrappers as the routed editor. No backend save or submission was performed.

- **320 × 740, light:** settings sheet stayed within the viewport; Preview on map was reachable (button y=683–727). Document width was 320px. Closing via Escape retained edited values, kept the placement preview, and focused Edit layout. The compact dock ended at approximately y=518 inside a canvas ending at y=644.
- **844 × 390, dark:** form scrolled (269px content in approximately 185px available height); the action remained at y=334–378. The settings sheet used the system dark theme.
- **390 × 844, light:** keyboard focus cycled from the close button backwards to Preview on map inside the sheet. Preview on map returned focus to Edit layout and left zero committed furniture.
- **1366 × 768, collapsed desktop rail:** Help step 1 found one visible Locations target (`Expand locations`) and rendered one spotlight outline.
- **Desktop Objects:** Escape from Search event objects closed the panel, focused Show event objects and kept Furniture active; the next Escape selected Select.

Screenshots contain synthetic data only, stored outside the repository:

![Mobile layout settings](C:/Users/Rj/.codex/visualizations/2026/09/30/01a0f290-8e26-7da3-ab8d-ce3a205c2f44/event-fix-mobile-390.jpg)

![Dark landscape layout settings](C:/Users/Rj/.codex/visualizations/2026/09/30/01a0f290-8e26-7da3-ab8d-ce3a205c2f44/event-fix-landscape.jpg)

![Collapsed desktop tour spotlight](C:/Users/Rj/.codex/visualizations/2026/09/30/01a0f290-8e26-7da3-ab8d-ce3a205c2f44/event-fix-collapsed-tour.jpg)

The temporary fixture and type-check log were removed. The user's existing development server and normal browser tab were left available; temporary browser viewport overrides were reset.

## Manual checks in the normal app

Use the existing `npm run dev` setup and open an editable student-org event map.

1. Duplicate a chair, select the original, choose Move here and pick a destination. Press Undo: the duplicate and stale move preview should disappear. Redo should restore the duplicate without a stale confirmation.
2. At mobile width, open Furniture → Layouts → Chair Row. Edit count, chairs per row and gaps; choose Preview on map. Tap a destination, then Place here. Reopen Edit layout to verify the values persist; cancel to verify no furniture is added.
3. Open Objects, focus search and press Escape. The panel should close and the trigger receive focus. Press Escape again to leave placement.
4. On desktop, collapse Locations and open Help. The first step should highlight Expand locations.

Physical-device software-keyboard behavior and the complete authenticated routed-editor light/dark/device matrix remain manual acceptance checks. The viewport adaptation has automated coverage and responsive browser evidence; no live backend verification is claimed here.
