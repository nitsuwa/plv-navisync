# Shared time-picker correction — October 6, 2026

The requested spinner replaces the scrolling hour/minute grids in the shared `ThemedDateTimeField`. It retains the application's navy/white theme, themed calendar, AM/PM and Asia/Manila conversion.

## Changes

- Separate hour and minute columns with 44px up/down controls, direct numeric typing and keyboard ArrowUp/ArrowDown.
- Hours wrap 12 → 1 and minutes 59 → 00 independently; AM/PM changes only through its explicit buttons.
- Valid typed values apply on blur, Enter or Done. Minutes are padded to two digits. Invalid/empty values cannot be accepted with Done; inline guidance explains the valid ranges.
- A centered nested time dialog supplies room for every control, including when a field is near its parent modal footer. It stays mounted when the viewport changes instead of switching between popup implementations while typing. Very short available heights allow scrolling the dialog itself rather than hiding its footer.
- Escape closes only the picker and restores focus to its trigger. Calendar Escape is contained as well. Opening the picker focuses an arrow button so it does not immediately request a numeric keyboard.

## Actual browser checklist

Browser: local app at `http://127.0.0.1:5173`, headless installed Edge. These are real UI actions at responsive viewport sizes, not physical-phone or OS-keyboard tests.

| Modal / fields | Desktop 1440×900 | Portrait 390×660 | Landscape 740×390 | Data mode |
|---|---|---|---|---|
| Manage publication / Schedule student publication | PASS | PASS | PASS | Existing approved sample, unsaved selections only |
| Review Event Layout / Event starts, Event ends, Publish on | PASS | PASS | PASS | In-memory pending GET response; actual UI, no decision saved |
| Admin Create Event / Start date and time, optional End date and time | PASS | PASS | PASS | Actual empty form, discarded without creating a record |

Each case checks direct typing, hour/minute boundary wrapping, independent AM/PM, invalid minute 60, keyboard adjustment, ≥44px button heights, viewport bounds, Done retention, Escape focus return, and no horizontal page overflow. The review cases also use the actual calendars and publication-mode control.

Raw final run: [time-spinner.json](evidence/time-spinner/time-spinner.json). Runner: [run-time-spinner.mjs](run-time-spinner.mjs). All 9 cases PASS, with zero page errors, blocked event-write attempts or retained fixtures; the existing sample's metadata and update timestamp are unchanged.

Inspected screenshots:

- [Publication portrait](evidence/time-spinner/publication-mobile.png)
- [Publication landscape](evidence/time-spinner/publication-landscape.png)
- [Review publication landscape](evidence/time-spinner/review-publication-landscape.png)
- [Admin create form desktop](evidence/time-spinner/create-start-desktop.png)

## Regression and remaining limits

- Final production build PASS (exit 0); [build log](time-spinner-build.txt). The existing large-chunk advisory remains.
- Final affected regression retry PASS: **30 tests across four suites**, exit 0, no unhandled worker errors. Suites: shared date/time field (9), publication dialog (8), admin event-layout publication page (9), and admin operations pages (4). An earlier fork-worker run completed 17 tests but timed out starting two workers; the final retry used one thread worker outside the sandbox.
- Verification command: `node node_modules/vitest/vitest.mjs run src/components/ui/__tests__/ThemedDateTimeField.test.tsx src/components/events/__tests__/AdminEventPublicationDialog.test.tsx src/pages/__tests__/AdminEventLayoutsPage.publication.test.tsx src/pages/__tests__/AdminOperationsPages.test.tsx --reporter=dot --maxWorkers=1 --pool=threads`.
- Initial new interaction tests failed against the old grid before implementation. An intermediate run identified mobile footer clipping; another identified an accessible-name mismatch in the browser selector. These were corrected before the final UI pass.
- Physical phone keyboards, touch hardware, dark mode and the wider original Create Event acceptance gaps are not certified by this pass. The original acceptance gate remains PARTIAL.
- No SQL, account creation, real event approval/publication, commit, push or deployment was performed. No approved QA record was created or retained.
