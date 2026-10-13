# Final verification — October 13, 2026

Starting main/source: `72b4093`. Implementation branch: `codex/event-editor-usability-fixes`.

- Focused editor/page/native-pointer/geometry/preset/readonly: **253 passed, 0 failed**, 14 files. [Results](focused-results.json).
- Public-map event/publication/outdoor projection: **64 passed, 0 failed**, 3 files. [Results](public-map-results.json).
- Actual published-map fixture/WebGL usability: **10 checks passed**, no page errors. Includes all 14 precise rendered mesh bounds, complete COED annex rooms, mouse/touch/keyboard placement, save/reopen, 2D/3D/location synchronization, mobile catalog focus, cursor and admin read-only behavior. [Results](evidence/browser-results.json).
- Existing WebGL gesture regression: **13 checks passed**, no page errors. [Results](gesture-evidence/browser-results.json).
- Final production build: **3,644 modules**, exit 0; existing large-chunk warning remains.
- TypeScript: **1,047 baseline / 1,047 current diagnostics**, no additional normalized messages or file/code counts. This is a baseline comparison, not a clean typecheck. [Comparison](typecheck-comparison.json).
- `git diff --check`: passed. Independent read-only review plus final delta review: no remaining material findings.

Regression reproduction: before fixes, the literal outside-canvas bounds and stable-height tests failed, and the real page could not directly place a 3D item. A separate unchanged-grant refresh test reproduced the reset to the first location; the revocation test protected immediate access removal. Actual mesh-bound checks caught geometry that still grew taller after footprint resizing. Final native placement testing also caught unstable empty-array defaults cancelling a placement during a busy-state render; stable defaults fixed it. Broader checks caught the booth preset overlap introduced by the new footprint, and spacing was corrected instead of weakening the collision rule.

The fixture height and a rounded-UI-zoom test assumption were corrected in the verification harness. Authored coordinate math and collision protection were retained. No live database/schema/event/published-campus writes occurred. The previously documented unrelated whole-repository failures were not rerun or repaired as part of this focused task.

Physical mobile GPU performance, live cloud save latency and hosted publish flow remain manual checks. See the [manual guide](README.md).
