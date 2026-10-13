# Event camera retention implementation plan

Execute inline using executing-plans. The user explicitly requests the existing 3D view to survive a 2D round trip and confirms camera/zoom only; asset sizing is outside this fix.

**Goal:** Preserve position, orbit target and zoom when returning to 3D in the same event location, while explicit Fit/Focus/Zoom remain functional.

**Architecture:** EventFloorEditor owns in-memory camera sessions keyed by viewport location. Both event renderers pass the session to EventPreviewCamera. The camera component restores the last actual pose once, captures subsequent native orbit changes, and applies later explicit camera requests. The WebGL renderer still unmounts in 2D, avoiding a background GPU canvas. A fresh editor starts at its normal Fit view; no database/storage/asset changes.

- [x] Add a failing camera lifecycle regression (native Three camera, mocked fiber frame loop) for restore, orbit capture, Fit override and first-fit behavior.
- [x] Thread the stable session through editor preview and both renderers. Preserve manual camera state without React rerenders and avoid replaying old focus nonce on remount.
- [x] Verify indoor/outdoor zoom-pan-orbit round trips in isolated real WebGL fixtures, including phone viewport, plus relevant unit/public-map tests and build.
- [x] Obtain independent read-only review, preserve unrelated local files and deliver through the already authorized normal Git main workflow.


Delivered: camera fix 47d4eb2 fast-forwarded and pushed to GitHub main.83 tests,6 actual browser checks and build pass; type baseline unchanged. Backup branch preserved; unrelated local files untouched.
