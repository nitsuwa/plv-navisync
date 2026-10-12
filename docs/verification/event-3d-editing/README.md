# Event 2D / 3D editing: combined manual test guide

Organizer proposals now support direct placement, selection, movement, rotation, resizing and label editing in **3D layout**. Both views edit the same event additions and use the existing draft, autosave, submission and history workflow. Admin review remains **3D preview**; feedback pins use 2D.

Base campus/building content remains read-only. All 14 event asset types reuse the existing map renderers. Heights are illustrative; authored coordinates and footprint sizes use the existing map units, not calibrated physical measurements.

## Before testing

1. Pull GitHub main, use the repository's existing dependency setup, and start or refresh the app.
2. Sign in as an active organization representative. Use an intended test draft and a campus with a published base map.
3. Choose both an indoor floor and an outdoor location if available. Saving/submitting during these steps uses the normal live workflow; automated checks below used synthetic local fixtures only.

**No new SQL query, migration or dependency is required for the 3D feature.** The separately imported teammate migration `20261012033256_cache_event_safe_published_snapshots.sql` is an optional performance deployment for the existing published-snapshot RPC. It was not executed against the live database during this task and is not required to enable 3D editing. Coordinate that separate deployment with your teammate rather than rerunning earlier migrations.

The latest upstream merge also supplies historical migration files and two timestamp renames. Those match upstream main; this feature adds no migration difference against it. Live migration-history compatibility was not checked. Coordinate any CLI database deployment separately instead of applying every file blindly.

## One complete organizer test

1. Create a proposal. Confirm the assigned organization name is prefilled, enter a title/description, and continue to requested locations. Open indoor plotting.
2. In **2D layout**, place a chair, table, tent and label. Move and rotate an item. Switch to **3D layout**: positions, colors, visibility and rotations should match.
3. Choose **Add item**, select an asset, then click/tap the map. A candidate appears. Choose **Place here** to add it; clicking the map alone must not create multiple items. Invalid/protected positions show feedback and prevent placement.
4. Choose **Move**, select an event item in the scene or the Item dropdown, and drag it. Save is disabled during the drag and restored on release. A single **Undo** reverses the whole drag; **Redo** restores it.
5. Start another drag and press **Escape** before releasing. The item should return to its committed position. On touch, starting a second finger during an item drag should cancel the edit; it must not start another item drag.
6. Select one ungrouped item. Choose **Rotate** and drag its visible rotation handle. Choose **Resize** and drag its size handle. Also try X, Y, Rotation, Width and Depth fields. Enter or leaving a numeric field applies it; Escape cancels that field edit.
7. Try **Snap on/off**. With snapping enabled, movement follows the existing grid and rotation follows 15-degree steps. Items remain within the authored map bounds.
8. Select a label. Edit its text, color and font size. Move it using the scene or X/Y fields. The displayed label should update immediately. Choose **Add label**, preview a position and confirm with **Place here**.
9. Lock an item and try to move/rotate/resize it: geometry must remain unchanged. Unlock it, duplicate it and remove the duplicate using the existing Delete control. Group two furniture items in 2D, return to 3D and move them together: offsets remain unchanged. A locked group member prevents the group move; ungroup in 2D to rotate/resize individual items.
10. Choose **Pan** and test camera pan, rotate, zoom, Fit map and Focus selection/event items. Camera movement must not alter event geometry. On touch use two fingers for camera controls.
11. Return to **2D layout**. Confirm every 3D edit appears there. Save the draft, leave and reopen it. Verify the same arrangement in both views, then make a 2D edit and confirm it appears in 3D.
12. Repeat placement, movement, rotation, resizing and save/reopen on an outdoor location. Include an event item away from base buildings and use Focus selection. Switch between requested locations and verify their layouts remain separate.
13. Open on a narrow phone screen and repeat placement, selection and camera controls. If graphics are unsupported or lost, use **Return to 2D**; the plotted layout should remain intact.

## Admin and public-map test

1. Submit the test proposal through the normal workflow. Sign in as admin and open its layout review.
2. Switch to **3D preview**. Inspect the saved indoor/outdoor arrangements and camera controls. Organizer editing controls must be absent.
3. Start placing a feedback pin. The review must return to 2D and keep the 3D switch disabled until pin placement ends. Verify the normal feedback/revision workflow still works.
4. If appropriate for your test environment, approve and publish using the normal workflow. Open the public map, select the approved visible event location and switch to 3D. Its additions should appear. Hiding event maps should hide them; pending/unpublished proposals must remain excluded.

## Automated evidence and limits

- Core new geometry/editor/native-pointer and preview tests: **40/40 passed**.
- Final merged 3D/public-map/route/publication regression checks: **233/233 passed** across 13 files, including all 44 current public-map cases. See [final-focused-results.json](final-focused-results.json).
- Broader event editor/admin/proposal/geometry suite: **336/336 passed** across 32 files. See [regression-results.json](regression-results.json). Counts overlap the core run and are not added together.
- Preview regression browser checks: **10/10 passed**, including graphics fallback, tall-item framing, remote outdoor items, read-only admin and view switching. See the [preview report](../event-3d-preview/evidence/browser-results.json).
- Real WebGL browser editing checks: **13/13 passed**, including indoor/outdoor drag, rotate, resize, placement, labels, history, save synchronization, groups/locks, actual Chromium two-touch cancellation, mobile and admin boundaries. See [browser-results.json](evidence/browser-results.json).
- Independent source review found no remaining material issue after fixing final-pointer camera ordering and multi-touch cancellation. Browser testing also found and fixed competing outdoor preview camera ownership.
- Desktop/mobile screenshots: [indoor](evidence/indoor-3d-editing.png), [outdoor](evidence/outdoor-3d-editing.png), [mobile](evidence/mobile-3d-editing.png).

- Final merged production build passed: 3,643 modules, 1 minute 27 seconds; existing large-chunk warning remains.
- Final TypeScript comparison with latest main `75096c5`: **1,047 baseline / 1,047 merged diagnostics**, with no increased file/code diagnostic counts. Existing repository type errors remain; this feature adds no production or test diagnostic counts. See [typecheck-comparison.json](typecheck-comparison.json).
- Whole-repo verification is **not fully green**: its broad attempt reported 526 failures and two worker memory crashes. Representative non-3D failures were reproduced on untouched upstream main. Exact results and limits are in the verification report; unrelated legacy cleanup remains separate.

Full-suite and Git integration details are recorded in the [final verification report](verification-report.md). Software WebGL fixtures do not establish physical Android/iOS GPU performance, every real campus layout, or live publication behavior; the combined manual steps above cover those remaining checks.

## Reproduce isolated browser checks

Start the existing Vite server at `127.0.0.1:5173`, then run from the repository root:

```powershell
node docs/verification/event-3d-editing/run-browser.mjs
node docs/verification/event-3d-preview/run-browser.mjs
```

The runners require local Playwright or `PLAYWRIGHT_MODULE` and support this host's bundled runtime. They block external requests and save evidence without writing to Supabase.
