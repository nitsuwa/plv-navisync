# Event 3D preview handoff

Historical preview-phase report from 2026-10-12, committed as `247d23b`. Direct organizer editing now extends this phase: use the combined [3D editing and manual test guide](../event-3d-editing/README.md) for current behavior and delivery status. The results below describe the original preview verification.

## Included

- Indoor floor and outdoor campus previews reuse the existing published map renderers.
- All 14 current event asset types have 3D models, including chairs, tables, registration desks, stages, tents, booths, barriers, signs, podiums, microphones, queue posts, speakers, monitors and projectors.
- Plotted positions, footprint sizes, rotations, colors and visibility are preserved. Labels appear at their plotted anchors. Model heights are illustrative defaults, not verified physical measurements.
- Fit map, focus event items/selection, zoom, pan and rotate controls work on desktop and touch devices.
- Switching views preserves current edits and the 2D viewport. A pending gesture, label edit or object rename finishes before previewing. Editing and history controls are unavailable in 3D; Save Draft and Review & submit retain their existing behavior.
- The preview does not add database requests or submit the event automatically. The event edit page's existing autosave can still save draft changes, including edits finalized when switching views.
- Read-only admin review supports 3D. Placing feedback pins returns to 2D and disables the 3D switch until pin placement ends.
- Unsupported graphics, a failed renderer or a lost graphics context offers **Return to 2D**, preserving the layout.
- Approved selected event additions also render on the public indoor/outdoor 3D map through the existing visibility and publication filters.

**No SQL migration, dependency installation or live database update is required for this feature.** Automated browser verification used isolated local fixtures and made no live database writes.

## Manual checks in the app

1. Refresh the running local app. Sign in as a representative with event editing access.
2. Open an editable event draft, or create a proposal and continue to location plotting. Choose an indoor location on a campus with a published map.
3. Place a chair, table, tent and label in 2D. Move, rotate, resize or duplicate an item. Select an item and switch to **3D preview**. Confirm the latest arrangement appears.
4. Try **Focus selection**, **Fit map**, and the zoom buttons. Drag to pan; right-drag to rotate. On touch devices, use two fingers to rotate/zoom. Clear the selection in 2D to focus all event items.
5. Return to **2D layout**. Confirm the arrangement and previous 2D pan/zoom are retained. Edit a label and switch views again; confirm its latest text appears in 3D.
6. Save the draft, reopen it, and confirm the same additions appear in both views. Normal existing autosave may also persist edits while you work.
7. Repeat with an outdoor campus location. Include an item far from the base buildings and use **Focus event items** to check it is reachable. Repeat for each location of a multi-location proposal.
8. Sign in as an admin and open the event's layout review. Preview it in 3D. Start placing a feedback pin: the editor should return to 2D, and the 3D button should be disabled until pin placement ends.
9. On a narrow mobile screen, check that the preview and camera buttons fit. If 3D is unavailable, use **Return to 2D** and confirm the event items remain.
10. After an event is approved and published through the normal workflow, select its visible location on the public map and switch to 3D. Confirm its additions appear; hiding event maps should hide them.

Saving, submitting, approving or publishing during these manual steps uses the app's normal live workflow. Use an intended test draft/account.

## Verification results

- **170/170 focused unit/component tests passed** across eight files: the new 3D tests, existing event editor/assets tests, indoor/outdoor coordinate tests, and admin preview tests. See [unit-results.json](unit-results.json).
- **10/10 isolated browser checks passed**, with no page errors and no Supabase requests. Desktop/mobile, light/dark, indoor/outdoor, camera controls, context loss, unsupported graphics, a tall tent and a distant outdoor stage were checked. See [browser-results.json](evidence/browser-results.json) and the screenshots in [evidence](evidence/).
- **Final production build passed**, 3,638 modules transformed in 51.90 seconds using `node node_modules/vite/bin/vite.js build` (the same Vite build used by the package script). An earlier `pnpm build` passed; a later package-script attempt crashed with Windows code `3221225477`, so the final verification used the installed build tool directly. The build retains the repository's chunk size warning.
- `git diff --check` passed.
- Focused code review found no remaining critical or important issues after correcting camera fit for tall assets and outdoor focus bounds.

The full repository is not reported as passing every check:

- The public-map test file has **39 passed / 3 failed**. The same three failures were reproduced using `CampusMapPage.tsx` from baseline commit `b220473`: one cached-feed isolation failure and two stale alignment expectations. See [public-map-baseline.json](public-map-baseline.json).
- Broad TypeScript checking reports 2,361 baseline diagnostics and 2,365 current diagnostics. There are **no introduced production diagnostics**. The four additional diagnostics are the new test file using Testing Library exports whose types are already unresolved across existing tests: the installed React testing package references a missing DOM peer declaration. Runtime tests pass. See [typecheck-baseline.json](typecheck-baseline.json). This is a separate repository dependency/type cleanup.
- Browser checks used software WebGL with local fixtures; real GPU performance and the approved live publication workflow still benefit from the manual checks above. Large event arrangements have not been load tested.

## Reproduce isolated browser verification

From the repository root, start the existing Vite server on port 5173, then run:

```powershell
node docs/verification/event-3d-preview/run-browser.mjs
```

The script requires Playwright available locally or via `PLAYWRIGHT_MODULE`. On this Codex host it also supports the bundled runtime path. It blocks external requests, uses synthetic fixtures under `fixture/`, and writes screenshots/results under `evidence/`.

## Later phases

Direct manipulation in 3D is now included in the subsequent editing phase linked above. First-person walking, layout image/PDF export, and inventory/capacity estimates remain outside the delivered scope. Inventory and capacity would need separately defined quantities and measurement rules.
