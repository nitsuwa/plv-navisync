# Student Map navigation edge-case audit

**Run date:** 2026-10-17  
**Live data scope:** MAIN CAMPUS published Student Map, read-only. The browser harness blocked Supabase mutations; it recorded zero blocked write requests.  
**Result:** No reproducible application-code navigation defect was confirmed in this bounded audit. The only browser failures were harness startup/selector assumptions and were resolved by rerunning the affected cases with corrected probes.

## Coverage

- **18 live route cases across 16 origin/destination pairs:** same-building building/room and room/room routes, Ground Floor and upper-floor destinations, both directions between CABA and CEIT, CANTEEN/CABA, COED/CABA, Student Center/CABA, Campus Gate/CABA, Accessible, and same-origin rejection.
- **Route preferences:** Best, Prefer stairs, and Prefer elevator were selected and reflected in route previews. CABA Ground Floor ↔ Floor 2 and Floor 2 ↔ Floor 4 were previewed in both directions with stair/elevator preferences.
- **Playback:** CABA building → CABA-201 and CABA-101 → CABA-201 were started in Chromium. The first held at the entrance for its physical handoff; the second advanced its zero-distance origin row to the first walking instruction.
- **Interaction sequence:** one live CANTEEN → CABA-201 sequence covered Next, Previous, Continue, Pause/Resume, Explore/Follow restoration, 2D/3D switching, and panel collapse/expand. A focused unit test covers repeated step input while a seek is settling.
- **Responsive:** 360, 390, 768, and 1440 px. The 390 px run used dark mode; the others used light mode. All had one 2D/3D toggle and no horizontal document overflow.
- **SOS live route:** CANTEEN → Campus Gate · Fallback preview. This verifies the live fallback state only.
- **SOS TEST ONLY evidence:** the earlier isolated acceptance run exercised four rooms, distinct eligible exits, single-route behavior, Route A/B, 2D/3D, and arrival at a TEST ONLY Assembly Point. That prior fixture report was retained but not rerun in this continuation.

## Findings

### PASS — Building start and indoor handoff

CABA building → CABA-201 preview shows an indoor route, one building entry, Ground Floor → Floor 2, and five steps. Playback starts at Step 1, “Enter CABA building,” stays there until the student chooses Continue, then advances one step to the Ground Floor indoor path. The marker and indoor route line appear after the entry handoff. There is no observed outdoor route loop or skipped meaningful Step 1.

CABA-101 → CABA-201 starts with the informational “Start at the door of CABA-101” row, then reaches “Follow the indoor path to the Right Stair” on the Ground Floor with one marker on the route. This is consistent with the origin row having zero physical walking distance; the real walking instruction remains visible.

### PASS — Route choices and interactions

All 18 live route cases passed, including same-origin prevention. Standard and Accessible previews had no Route A/B selector. Preference-specific CABA and CANTEEN previews reflected stairs or elevators as selected. The live interaction sequence restored the original Follow step after Explore and preserved the panel state through a 2D/3D round trip.

### BLOCKED BY CAMPUS DATA — Published Assembly Point evacuation

The current published MAIN CAMPUS snapshot has no configured approved Emergency Assembly Point or approved room evacuation routes in the retained read-only audit. The current live CANTEEN SOS preview therefore uses the permitted Campus Gate fallback and displays that label honestly. A live route to an assigned Assembly Point, live Route A/B evacuation, and live Assembly Point arrival cannot be verified until authorized campus staff assign, connect, review, and publish a real point and its complete routes.

Prior TEST ONLY browser evidence is documented in [the emergency acceptance report](../emergency-video-test-only/acceptance-report.md). Its synthetic point and approvals are not evidence that MAIN CAMPUS is ready for evacuation use.

### NOT VERIFIED — Full live journey coverage

The live browser pass verified previews for multi-floor stair/elevator routes but did not play every live route through all floors to arrival. It did not exercise every rapid-click ordering in a real browser; the focused unit suite exercises repeated clicks while a seek is pending. It did not independently enumerate every authored live graph edge ID. These remain limits of this bounded pass, not evidence that the untested cases pass.

## Automated checks

- **Focused Vitest:** 12 files, 398 tests passed, covering pathfinding, route planning, route flow, walking animation, indoor graph, endpoints, emergency status/Assembly Points/stairs, planner UX, transition markers, and indoor navigation controls.
- **Production build:** passed. Vite emitted the existing warning for bundles above 500 kB.
- **TypeScript:** failed (`tsc --noEmit`, exit 1), with 1,028 current diagnostics versus the saved 1,039-diagnostic baseline. A file/code/message comparison found 6 new and 12 resolved identities, concentrated in existing Supabase/database generic typing after generated schema changes. No production source was changed by this audit, and no new diagnostic points to the audit harness. The typecheck is not clean.
- **`git diff --check`:** passed. Git printed existing LF-to-CRLF working-copy warnings.
- **Browser rerun:** 18/18 route cases, both building-start playback cases, the interaction sequence, and all four viewport cases passed. The final focused run recorded zero current-run browser errors and zero blocked writes. Superseded harness errors remain under `priorRunErrors` in the JSON for audit history.

## Evidence

- [Structured browser results](browser-audit-results.json)
- [Read-only Chromium harness](browser-audit.cjs)
- [CANTEEN → CABA-201 playback and Follow/Explore/2D/3D sequence](canteen-caba201-playback-follow-2d.png)
- [CABA building → CABA-201 preview](caba-building-to-room-preview.png)
- [CABA building start, Step 1 at entrance](caba-building-start-step-1.png)
- [CABA after entry, Ground Floor Step 2](caba-building-after-entry-step-2.png)
- [CABA room-to-room first walking step](caba-room-to-room-first-walking-step.png)
- [Live CANTEEN SOS fallback preview](sos-main-campus-preview.png)
- [Mobile 360 px, light](navigation-360-light.png) · [390 px, dark](navigation-390-dark.png) · [tablet 768 px, light](navigation-768-light.png) · [desktop 1440 px, light](navigation-1440-light.png)
- [Current TypeScript diagnostics](typescript-current.log)
