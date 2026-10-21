# Consistent event editor tools

Approved design: [desktop/mobile tools](../../superpowers/specs/2026-10-13-event-editor-consistent-tools-design.md). Manual check: [manual-test.md](manual-test.md).

## What changed

- Placement mode has scoped crosshairs over real map/HTML surfaces, persistent mode strips, pointer badges and ghosts. Keep placing is explicit; each placement has its own undo entry.
- New outdoor assets use smaller reference proportions against the compressed campus renderer. Indoor sizes retain the existing reference. Existing custom dimensions are preserved until an explicit, undoable preset/reset action.
- Chairs/equipment use reference variants. Tables, booths, tents, stages, registration desks, barriers and signs support shared 2D/3D resizing, presets and optional aspect lock.
- Both views share the same inspector: desktop rail, phone/tablet bottom sheet with focus return. 3D primary tools scroll horizontally on narrow screens; coordinates live under Advanced. Small 2D artwork gets a larger invisible picking area, while rotate/resize controls sit outside the true footprint.
- 3D opens with a whole-map view for building context; Focus is explicit. Layout issues use a viewport-anchored popup and frame referenced objects.
- Save/retry feedback retains failed drafts and newer edits. It distinguishes the coordinator's successful earlier-revision save from an actual unchanged-revision failure; authoritative autosave acknowledgement clears stale failure feedback.

## Verification

`run-browser.mjs` exercises the actual local WebGL renderers and editor with a published COED/campus fixture. All external requests are blocked; event saves use isolated browser memory. No live database, auth, campus publication or user event is changed.

The final browser report records **11 passing checks**, including all 14 mesh heights, actual ground/HTML cursor hit tests, 2D and 3D resize, aspect controls, repeat/undo, Save/reopen, mobile sheet/desktop rail, 360/390/768/1440px, dark mode, native touch, keyboard and read-only review. See [browser-results.json](evidence/browser-results.json).

Focused unit/coordinator/public-map results and build/type status are recorded in [verification-results.json](verification-results.json). TypeScript retains the repository's existing 1,047 diagnostics; changed editor/sizing files add none. A concurrent verification attempt exhausted Windows memory; completed reruns use one Vitest worker and the compiler's supported `--singleThreaded` option. Existing whole-repository failures are outside this task and were not used as a success claim.

Independent read-only review identified and resolved legacy size changes during constraints, popup clipping, stale failure feedback and rotated-boundary precision. Boundary constraints now move only the position; impossible rotations are rejected rather than silently shrinking assets.

## Limits

Sizes are approximate map units, not measured meters. Existing layouts are not bulk-rescaled. No SQL migration is needed because the existing `assetVariant` field carries reference presentation through the current save/public/reuse formats. Physical iOS/Android GPU/browser behavior should still be checked with the manual guide.
