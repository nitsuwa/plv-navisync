# Event editor mobile picker and Snap

Verified on October 14, 2026. Base: `f8fdef3`.

The selected-object native dropdown is now a searchable dialog with item previews, selected/locked/hidden state and its own scrolling list. Selecting an item closes the dialog and restores focus; Details opens explicitly. Phone tools use a three-column layout, with visible Snap on/off and 44px targets. Save status and actions wrap without squeezing labels. Existing asset sizing and published map protection are preserved.

Snap on attracts furniture placement/movement to nearby grid lines and item edges/centers. Label placement rounds the anchor to the grid, rotation steps by 15 degrees, and supported resizing uses grid increments. Event group movement snaps the anchor while preserving offsets. Snap off permits free placement and direct gestures. Numeric Details values remain explicit. Bounds and protected access take priority.

Label preview and commit now share the same snap/clamp order in both views, including the bottom edge. Existing label HTML no longer intercepts a new placement click while placing.

## Verification

- Focused regression suite: **263 tests passed, zero failures**, including picker behavior, boundary preview/commit, editor gestures, pending draft and public overlay compatibility.
- Local WebGL regression: **11 checks passed**, including cursor feedback, real 2D/3D resize, undo, repeated placement, save/reopen, dark mode, touch and read-only admin preview.
- Mobile picker/Snap browser run: **4 checks passed**, including a 12-item searchable dialog, empty search, keyboard focus, actual Snap on/off label placement and 360/390/440/1440px tool visibility.
- Camera retention browser run: **6 checks passed** for indoor/outdoor zoom, orbit, pan, Fit, Focus and phone round trips.
- Production build passed: 3,649 modules. Existing bundle-size warning remains.
- TypeScript still has the existing **1,047 diagnostics**, with **zero new path/line/code identities**. This is not a clean whole-repository typecheck.
- Independent read-only review found no remaining material issue after the boundary correction.

Browser scripts use the existing isolated published-map fixture and memory-only saves. External requests are blocked. Its test navigation strip is compacted on phones to model the production location bar; production editor styles are unmodified by the test. No SQL or live database writes.

Run from the repository root with the local Vite server on port 5173:

```powershell
node docs/verification/event-mobile-picker-snap/run-mobile.mjs
node docs/verification/event-mobile-picker-snap/run-regression.mjs
node docs/verification/event-mobile-picker-snap/run-camera.mjs
```

## Manual check

1. Open an event draft on desktop and phone. Select an existing object, search by name/type, close with Escape, then open Details.
2. Add a label with Snap on and off. Switch 2D/3D and save/reopen; the placed position should persist.
3. With Snap on, drag/rotate an item and resize a supported asset. Turn Snap off to compare free gestures.
4. Zoom/orbit/pan in 3D, switch to 2D and back. The camera should return to the same view.
