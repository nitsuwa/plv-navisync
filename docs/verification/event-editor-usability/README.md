# Event editor usability fixes — October 13, 2026

The organizer now chooses assets from a searchable illustrated catalog and places one item by clicking/tapping the map. Hover is a translucent preview, placement uses a crosshair, and successful/cancelled placement has a live status. Keyboard users can use Place here at the initial center position. Furniture, labels and history share the same layout in 2D and 3D.

An unchanged organization-grant refresh previously reloaded the saved event, resetting the active location and unsaved coordinator data. That refresh now preserves the current draft. Actor/grant changes still remount the session and remove private editing immediately.

The published COED floor records a 651×739 canvas, but its side rooms reach x=870 and its lower stairs extend beyond y=757. The event SVG previously clipped these details. Both event views now frame the union of actual floor content and shared exterior presentation bounds, including building-owned stair metadata. Authored event coordinates and saved footprints are preserved.

All 14 3D models use stable type-specific heights, improved legs, surfaces and equipment details. Widening an item changes its footprint instead of making it taller. New equipment footprints are smaller; new tents/booths have more suitable proportions. The Booth Area preset spacing follows the updated booth dimensions. Model dimensions remain illustrative map units.

## Manual test

1. Refresh the app and open an intended organizer test draft with Campus Grounds and COED Ground Floor. In 2D, confirm the comfort room, electrical room, lower stairs/lift and doors are visible alongside the assembly hall.
2. Switch to 3D → Add item. Search for Chair and select it. Expect a crosshair and “Chair ready.” Move the mouse: a translucent preview should appear without increasing the furniture count. Click/tap once: one chair appears and an Added message is shown.
3. Switch to 2D immediately. The chair must remain at the matching location. Return to 3D, add a table/tent, resize and rotate it. Its footprint should change without an excessively tall model. Undo/Redo should work across both views.
4. Save Draft directly from 3D, leave and reopen. Confirm the same items, sizes and positions in both views. Switch between requested locations and verify their additions remain separate. Leave unsaved changes open through the next access refresh (about 30 seconds): the active location and additions must remain.
5. On Campus Grounds, place items on open ground. Placement over buildings/entrances should show the existing blocked-position feedback. Test Escape and Cancel; neither should add another item. Large inactive entrance action bubbles should be absent from the event planning view.
6. On a phone-sized screen, search/select an asset, tap to place, save and reopen. Test dark/light themes. In admin review, 3D stays a preview and organizer placement/save controls are absent.

No new SQL, migration or dependency is required. Verification used disposable local fixtures and blocked external browser requests; no live event or published campus data was changed.

## Evidence and limits

- [Focused results](focused-results.json): **253/253 passed**; editor, coordinator, native pointer, geometry, preset and readonly tests. [Public-map results](public-map-results.json): **64/64 passed**.
- [Actual browser checks](evidence/browser-results.json): exact published COED geometry, all 14 rendered mesh bounds, direct placement/save/reopen, location switching, cursor, mobile catalog/focus and read-only review.
- [Gesture regressions](gesture-evidence/browser-results.json): 13 actual WebGL checks for move/rotate/resize, history, group/lock behavior, labels and native two-touch cancellation.
- [Full floor](evidence/coed-full-2d.png), [dark 3D](evidence/coed-dark-3d.png), [mobile](evidence/mobile-3d.png).
- Production build passed (3,644 modules); TypeScript diagnostics unchanged at 1,047/1,047. See the [final report](results.md). Existing unrelated repository test/type failures remain separate; the entire repository is not asserted to be green.

Browser evidence uses headless Chromium with software WebGL. Real Android/iOS GPU performance, live cloud save latency and hosted publication should still be checked manually using the steps above.

## Reproduce

Run the existing Vite server at 127.0.0.1:5173, then:

```powershell
node docs/verification/event-editor-usability/run-browser.mjs
$env:EVENT_3D_BROWSER_OUTPUT = 'docs/verification/event-editor-usability/gesture-evidence'
node docs/verification/event-3d-editing/run-browser.mjs
```

The runners use installed Playwright or PLAYWRIGHT_MODULE and support this host's bundled runtime. They do not write to Supabase.
