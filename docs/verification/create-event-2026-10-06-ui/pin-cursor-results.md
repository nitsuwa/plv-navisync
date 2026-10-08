# Admin feedback pin cursor — October 6, 2026

## Implemented behavior

- Activating Add pin arms an amber, white-outlined 32px pin that follows the mouse/pen over valid map positions. Its tip indicates the drop point; the canvas uses a crosshair.
- The preview is decorative and ignores pointer input. Moving it does not create a draft or add feedback, and subsequent movement updates only the overlay position instead of rerendering the entire map.
- Controls, outside-map movement, touch, panning/Space, cancellation, location changes and a positioned draft hide the cursor preview. The existing tap/click-to-place and comment/save workflow remains intact.
- In short landscape (height ≤500px), a positioned draft collapses repeated event/location/instruction headers while the comment form is open. The selected location remains identified in the comment form, and headers return after save/cancel. This keeps the map and draft pin visible instead of reducing the canvas to a few pixels.

## Verification checklist

- [x] New interaction tests failed against the original editor before implementation; all three pass with the cursor feature.
- [x] Actual browser actions: desktop Grounds hover/movement, control and boundary hiding, cancellation.
- [x] Actual browser actions: Pan/Space, zoomed placement, positioned draft and exactly one pin staged in the review.
- [x] Actual browser actions: floor preview and location-switch cleanup.
- [x] Portrait 390×844: cursor plus emulated touch placement/cancellation.
- [x] Landscape 740×390: cursor, emulated touch, usable map area and draft-marker bounds while entering a comment. The new bounds assertion initially failed, then passed after the layout correction.
- [x] Final browser run: **5/5 PASS**, no page errors or event-write attempts; existing sample metadata/update timestamp unchanged; zero retained fixtures. [Raw evidence](evidence/pin-cursor/pin-cursor.json).
- [x] Final affected regression run: **128 tests PASS across three suites**, exit 0 (`EventFloorEditor`, `AdminEventLayoutPreviewPage`, `AdminEventMapPreviewDialog.focus`).
- [x] Final production build PASS, exit 0; [build log](pin-cursor-build.txt). The existing large-chunk advisory remains.

Inspected screenshots: [Grounds cursor](evidence/pin-cursor/grounds-cursor.png), [floor cursor](evidence/pin-cursor/floor-cursor.png), [portrait cursor](evidence/pin-cursor/cursor-portrait.png), [landscape cursor](evidence/pin-cursor/cursor-landscape.png), [landscape draft/comment](evidence/pin-cursor/draft-landscape.png).

Runner: [run-pin-cursor.mjs](run-pin-cursor.mjs). It authenticates the existing admin account, reads the existing sample/maps, and supplies the pending proposal only through an intercepted GET response. Clicking Save pin stages feedback in the local review; no approve/disapprove decision is saved. Verified read-only campus RPCs are allowed; database mutations are blocked.

Initial browser attempts encountered a stopped local server, a too-broad test guard blocking a read-only RPC, and a temporary Supabase connection timeout. These were resolved before the final run. The localhost Vite server was restarted for manual review.

This pass does not certify physical-phone keyboards or hardware, persist feedback to a real proposal, or close the original wider acceptance gaps. No SQL, accounts, commit, push or deployment were performed.
