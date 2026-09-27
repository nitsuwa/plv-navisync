# Event proposal locations, modal, and inspector — verification

Date: 2026-09-24
Worktree: `codex/event-proposal-location-polish`
Plan: `docs/superpowers/plans/2026-09-23-event-proposal-location-modal-and-inspector-luna.md`

## Focused verification

Ran all nine plan-targeted suites together:

```text
EventLocationSelect
EventLocationPicker
EventProposalModal
StudentMyEventsAccess
eventLocationData
eventOverlayService
StudentEventEditPage.pendingDraft
AdminEventLayoutPreviewPage
EventFloorEditor
```

Result: **9 test files passed; 117 tests passed.** This includes explicit published-campus binding, multiple requested floors/buildings, save/reload and campus-specific floor resolution, modal dismissal/submission safeguards, and inspector behavior.

## Repository-wide checks

- Full Vitest suite: **160 files passed, 54 failed; 2,263 tests passed, 395 failed** (2,658 total). Failures are spread across unrelated map-builder, routing, visual-contract, and other repository suites. The plan-targeted suites pass independently as listed above; the full-suite failures were not repaired as part of this scoped change.
- `tsc --noEmit`: **fails repository-wide** with existing diagnostics in unrelated modules. Filtering diagnostics to plan-touched files found no event proposal/editor implementation errors; it did report the pre-existing duplicate `groupId` declarations in `src/components/map-builder/types.ts` (lines 136 and 140), which are outside this change.
- Production build: **passed**. Vite reports the existing `AdminMapBuilderPage` bundle is about 1.7 MB minified, above its 500 kB advisory threshold.
- Lint: no lint script is defined in `package.json`.
- `git diff --check`: passed; Git only reported LF-to-CRLF normalization notices for changed files.

## Browser spot check

Opened the disposable event-editor fixture in the local browser at 1280×720; it uses fixture-only data and performs no backend writes.

- Selected an asset and opened Details. The workspace remained at the same position and size (**1280×495.6 px**) before and after opening the inspector; the selected asset coordinates stayed unchanged.
- Switched to the 100-item fixture. All **100** furniture items rendered, and opening Details did not add another item.
- Toggled the fixture to dark theme and confirmed the editor and inspector rail remained legible.
- Closed the temporary browser tab and stopped the local dev server after the check.

The in-app browser surface does not expose responsive viewport sizing. Consequently, manual browser checks at tablet/phone sizes, the live proposal modal, and real touch-device behavior remain unverified here. Mobile and keyboard behavior is covered by the focused component tests, but that is not a substitute for those manual checks.

## Scope review

The final change keeps pointer/drag/pan/zoom and gesture ownership logic untouched. Editor changes are limited to inspector layout, responsive controls, and compact asset-palette presentation. No commit or push was created.
