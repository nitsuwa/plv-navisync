# Safe GitHub sync — October 6, 2026

The current local branch `codex/create-event-completion-20261004` was fast-forwarded from `4ea2618` to GitHub `origin/main` at `2ba71307d2bc58d12cea44b91bc10fe4673582d3` (PR #46, map-builder saving/performance work). `HEAD...origin/main` reports `0 0` after integration.

## Preservation and resolution

- Backed up all 235 previously modified/untracked files in a local stash before changing the checkout. The stash remains available as `Local Create Event work before GitHub sync 2026-10-06`; a patch, hash manifest and untracked archive are retained under `.git`.
- Restored all local work. No backed-up file is missing. All 208 untracked files match the stash archive after accounting for Windows line-ending conversion. No private/local files were uploaded.
- Of 27 previously modified tracked files, only five incorporate GitHub changes: `StudentMapControls.tsx`, its tests, `ThemedDateTimeField.tsx`, `CampusMapPage.tsx`, and its event-overlay tests. Other tracked local edits have no Git-content difference from their backed-up versions.
- One textual conflict occurred in `ThemedDateTimeField.tsx`. The event hour/minute spinner, direct typing, validation, nested modal/focus handling and calendar fixes were retained. The incoming canonical time validator is imported/re-exported, and GitHub's new `ThemedTimeField` remains unchanged for its other consumers.
- GitHub mobile-search expansion/account hiding and campus-selector fixes coexist with the local event-mode/map-rendering work.
- No unresolved paths or staged changes remain. Existing edits are unstaged, as before the sync. No new project commit, push, deployment or SQL execution occurred.

## Verification

- `git diff --check`: PASS. No conflict markers remain in the resolved file.
- Final production build: PASS, exit 0. [Build output](github-sync-build.txt); existing large-chunk advisory remains.
- Seven affected suites: **146 PASS / 3 FAIL**, 149 tests total. Six suites passed completely, covering date/time spinner, publication controls, student map controls/interaction, weekly hours and viewport behavior.
- Three failures occur in the incoming `campusStructurePersistence.test.ts` suite:
  1. Floor-template replacement/reload does not retain the expected complete navigation graph.
  2. Maximal campus round-trip loses expected room `accessType`.
  3. Repeated round-trip changes graph ordering/direction, scope fields and an elevator coordinate.
- The failing suite and its recursively resolved 34 relative dependency files are identical to GitHub `origin/main`, with no local event edits in that dependency set. [Provenance check](github-sync-dependencies.json). These upstream persistence failures were reported without changing another developer's implementation.

Test command:

```text
node node_modules/vitest/vitest.mjs run src/components/ui/__tests__/ThemedDateTimeField.test.tsx src/components/map/__tests__/StudentMapControls.test.tsx src/pages/__tests__/CampusMapPage.eventOverlayService.test.tsx src/components/events/__tests__/AdminEventPublicationDialog.test.tsx src/services/__tests__/campusStructurePersistence.test.ts src/components/map-builder/__tests__/BuildingWeeklyHoursEditor.test.tsx src/lib/__tests__/mapViewport.test.ts --reporter=dot --maxWorkers=1 --pool=threads
```

This is a source integration check. Earlier browser evidence predates this GitHub sync; no full browser acceptance rerun is claimed here. The original wider acceptance matrix remains PARTIAL.
