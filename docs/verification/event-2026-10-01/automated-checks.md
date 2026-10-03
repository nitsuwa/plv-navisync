# Sanitized automated-check evidence — 2026-10-01

Commands were run from the repository root. The Vite/esbuild test runner needed execution outside the sandbox because the sandbox denied access to the repository's Vite config; no data migration or remote write was involved.

## Campus picker regression

- Before the UI change, the new assertion failed because `document.querySelector("select")` returned the native **Published campus** `<select>`.
- After replacing it with the shared themed Select, `EventProposalModal.test.tsx` passed: **12 tests passed**.
- The full plan event suite before the fix passed: **34 files, 283 tests**.

## Post-fix test runs

- Aggregate run 1: **33/34 files passed; 283/284 tests passed**. The Campus Map event preview test timed out waiting for the `Event map` button.
- Isolated retry of that test: **1/1 passed**.
- Full `CampusMapPage.eventOverlayService.test.tsx` file retry: **18/18 passed**.
- Aggregate run 2: **33/34 files passed; 282/284 tests passed**. Both failures were in `CampusMapPage.eventOverlayService.test.tsx`; they were not reproduced in the full-file retry.

The aggregate suite is therefore recorded as unstable, not green. The proposal-picker tests remained green.

## Build, typecheck, and diff

- `node node_modules/vite/bin/vite.js build`: passed. Vite reported its existing large-chunk warning (`AdminMapBuilderPage` about 1.7 MB minified).
- `node node_modules/typescript/bin/tsc --noEmit`: exit 1 with the compiler's **1,000-error output cap**. The broader event-related filter found 10 diagnostics in the already-modified shared `CampusMapPage.tsx` and none in the event-specific component, service, hook, or library files. The listed CampusMap diagnostics concern map mode, floor-scene props, and route destination narrowing.
- `git diff --check`: passed; only line-ending conversion notices were printed.

