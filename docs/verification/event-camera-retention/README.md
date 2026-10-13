# Event camera round-trip fix

The user reported that returning from 2D to 3D zoomed the event map out, and explicitly confirmed camera/zoom only. Asset sizing and saved layouts are unchanged.

The 3D subtree unmounts in 2D, so its default Fit request previously ran again on every mount. The event editor now keeps an in-memory camera session for its viewport location. The real camera position, orbit target, zoom and limits are captured from native controls and on unmount, then restored when 3D reopens. Explicit Fit, Focus and Zoom requests still override that view. Old issue-focus requests do not replay on remount. A fresh editor session still starts with the normal Fit view.

Verification: 83 affected unit/public-map tests pass; six isolated real WebGL browser checks pass for campus and COED zoom/pan/orbit round trips, explicit Fit/Focus, and a 390px phone viewport. The browser reads the actual renderer camera and compares it with the final captured unmount pose, accounting for native orbit inertia between pointer release and the view switch. All external requests are blocked and no live event/database writes occur. The build passes; the existing 1,047 type diagnostics have unchanged path/line/code identities. Independent read-only review found no material defects.

Try: refresh the app, zoom/pan/rotate in 3D → switch to 2D → return to 3D. The view should match. Repeat inside a building, then check Fit/Focus explicitly. No SQL is needed.
