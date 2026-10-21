# Findings — pre-merge readiness

- Original checkout on main at 95b5461. Two other managed worktrees exist; do not use them for the user's manual app.
- Initial set: 19 tracked modified files, 4 new event components plus tests/presentation helper, two plan documents, prior verification evidence, and unrelated organization-continuity/handoff artifacts.
- Prior reports show 85 focused unit tests and 92 mocked browser checks passed historically, but live RPC loading and TypeScript parity were not fully certified. Fresh verification required.
- Existing root planning files are historical and preserved. This audit keeps its own files here.
- Independent read-only source review delegated per requesting-code-review skill; root owns verification and fixes.
- Fetched origin: HEAD and origin/main remain identical at 95b5461 (0 ahead/0 behind).
- Confirmed P2: current-work card hid plain location feedback and comments after pins were addressed. Two new regression cases failed first, then rendering was corrected independently of open-pin count.
- The removed location dropdown had an outdated page integration test. Updated the expectation to the approved checkbox floor groups while retaining hidden/empty-building exclusion assertions.
- Preliminary focused run accidentally discovered clean-baseline tests under .tmp as matching suffixes. Excluded .tmp explicitly and reran; preliminary results are retained but invalid for current-source totals.
- Fresh baseline TypeScript: 1,047 diagnostics, 528 normalized signatures. Initial current comparison differed only by one newly authored test fixture property; that property was removed. Final comparison pending.
- Fresh tabs browser matrix: 92/92 passed, zero console errors or unexpected external requests; seven viewports in both themes with fixed October 15 test time.
- Existing CUA browser inventory has no logged-in browser tab/session available for live read-only inspection.
- Scoped live probe authenticated configured demo representative and ordinary student in isolated sessions. Representative assignment/current/history/year/search reads returned200; ordinary student had0 assignments. Sessions signed out204. No live event mutations or credential/token output. The historical RPC400 was not reproduced.
- Actual notification secondary text measured4.32:1 in light mode. Corrected only notification message/time to foreground/75; accurate canvas-based CSS-color measurement now passes in both themes across5viewports. All18 ancillary checks pass (including proposal pending/duplicate guard and text-only feedback).
- Broad initial current-source sweep:89files/773tests,772pass/1fail. Sole failure is unchanged Admin submissions polling fixture advancing15s while production polls60s, reproduced on cleanHEAD. Updated fixture asserts no request at59999ms and a request at60000ms; production timing unchanged.
- Later simultaneous event sweep/WebGL probe exhausted system resources (Windows8GBRAM; less than0.4GBfree and1.3GBvirtual at inspection). Interrupted results are not passes. No remaining temporary Node/headless-browser process was found. Final suites are rerunning sequentially in capped-heap15file batches.
- Port5173 initially had no listener; started original checkout hidden/strictly on5173 (PID23908). Login/autofill/Supabase configuration and exact served source/current working file equality were verified. Resource interruption later ended Node processes, so final restart/runtime check is still needed after heavy checks.
- Initial secret scan:152candidate files/about6.7MB, no configured credential/key values or high-confidence secret patterns. Unrelated continuity/handoff files excluded. Final manifest rescan pending.

- Final authoritative results: 773/773 tests (89 files), build exit 0, TypeScript 1,047/528 baseline and current with zero introduced/increased, 114/114 rendered browser checks. Earlier interrupted/preliminary runs are not the final result.
- Initial editor raster equality failed because rendered canvas bytes vary. Read-only fixture instrumentation of the unchanged camera session confirms identical position/target/zoom across 2D/3D roundtrip in all four cases; screenshot pairs retained. No new production camera defect was found.
- Original app now runs from this checkout on localhost:5173; configured login/autofill and current-source identity were rechecked after heavy verification. Readiness is conditional on the documented existing repository-wide TypeScript limitation and manual physical-device/live-mutation coverage, not a claim of universal correctness.
