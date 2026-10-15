# Organization Events tabs implementation report

> **Latest follow-up:** the four review findings have since been corrected and reverified. See [fixes-report.md](fixes-report.md) for the current 85-test/92-browser-check results and the restored original-checkout server on port 5173. The body below records the initial implementation run; its earlier server identity and counts are historical. `verification-results.json` contains the updated evidence.

Plan: [2026-10-14-organization-events-tabs-luna-max-implementation-plan.md](../../superpowers/plans/2026-10-14-organization-events-tabs-luna-max-implementation-plan.md)

**Local result:** the two-tab workspace, compact cards, retained history controls, themed menus/dialog, and responsive UI are implemented and verified against the mocked browser fixture. The focused suite, build, and all 85 browser checks pass, including direct measurement of the 44px touch targets. The repository-wide TypeScript gate remains unresolved: its command exits nonzero and reports an unexplained diagnostic delta in untouched files. The live `list_organization_events` HTTP 400 was not checked in this isolated UI task.

## Delivery identity

- Workspace: `C:\Users\Rj\Documents\GitHub\plv-navisync`
- Branch: `main`
- Starting and final HEAD: `95b546122ba66fe52343bcf9111495844fcf320d`
- The changes are uncommitted in the original checkout. No commit, PR, merge, or push was made.
- The existing user app at `http://localhost:5173` was left untouched. Browser verification used `http://127.0.0.1:5181/student/events` and a dedicated `.tmp/organization-events-tabs/vite-cache`; the fixture server was stopped after the run, and port 5181 has no listener.
- The plan itself was read and left unchanged. The original checkout contains the delivered source and evidence.

## What changed

Previously, people had to scroll past Current work cards to reach Event history. The page now has two themed, keyboard-accessible tabs. Event history opens with one action, can be opened directly with `?view=history`, and retains its search/year/page/details state and its scroll position when switching tabs. The two panels are mutually exclusive to assistive technology and inactive controls cannot receive focus.

Current work and history cards are shorter and prioritize title, status, event schedule, academic year, and location. Secondary metadata is inside an expandable Event details section. Current work retains its next-step/feedback/visibility indicators and existing actions in a themed More actions menu. History keeps View event maps as the primary action and Reuse as new draft as the secondary action. The history description states that it contains all organization records, including current work and archived layouts, so the overlap is clear.

The academic-year picker and action menus use the existing themed Radix components. The history picker layer is above the mobile bottom navigation, including when the menu reaches that area. The reuse dialog keeps its themed surface and focus handling and now guards against duplicate submits while a reuse request is in flight. Approved remains distinct from Published; archived records remain read-only in the map route.

## Files

### Source and tests changed for this implementation

| File | Purpose |
| --- | --- |
| `src/components/events/OrganizationEventsWorkspaceTabs.tsx` | Adds the two-tab workspace, sticky positioning, hidden-panel isolation, and accessible tab semantics. |
| `src/components/events/OrganizationCurrentWorkCard.tsx` | Adds compact Current work cards, collapsible details, and a themed More actions menu while retaining feedback and notification actions. |
| `src/components/events/OrganizationHistoryCard.tsx` | Adds compact history cards, expandable historical metadata, truthful status labels, and primary/secondary action hierarchy. |
| `src/components/events/OrganizationEventHistory.tsx` | Preserves search/year state, stabilizes academic-year choices, debounces search, handles offset paging/retries/stale requests and mobile picker layering, and keeps the search-clear target at least 44px. |
| `src/components/events/ReuseOrganizationEventDialog.tsx` | Polishes the themed confirmation, preserves focus behavior, prevents duplicate submits, and uses a 44px close target. |
| `src/components/layout/PublicLayout.tsx` | Identifies the real sticky navbar for page-level positioning and keeps the dashboard from creating horizontal overflow. |
| `src/pages/StudentMyEventsPage.tsx` | Connects URL view state, active organization/access context, current-work counts, cards, routes, and action gates. |
| `src/lib/organizationEventPresentation.ts` | Centralizes URL view parsing, current-work membership, and PHT date formatting. |
| `src/components/events/__tests__/OrganizationEventsWorkspaceTabs.test.tsx` | Covers tab state, URL behavior, hidden panels, and retained state. |
| `src/components/events/__tests__/OrganizationCurrentWorkCard.test.tsx` | Covers current card details, gates, action menu, and status behavior. |
| `src/components/events/__tests__/OrganizationHistoryCard.test.tsx` | Covers history hierarchy, metadata disclosure, status/publication distinction, and action eligibility. |
| `src/components/events/__tests__/OrganizationEventHistory.test.tsx` | Covers filtering, stable options, pagination, errors/retry, deduplication, and stale requests. |
| `src/components/events/__tests__/ReuseOrganizationEventDialog.test.tsx` | Covers dialog content, focus, cancellation, busy state, and single-submit behavior. |
| `src/pages/__tests__/StudentMyEventsAccess.test.tsx` | Covers representative/org/grant access, actor changes, actions, and current-work count states. |
| `src/lib/__tests__/organizationEventPresentation.test.ts` | Covers view parsing, membership rules, and PHT schedule/created-date formatting. |
| `src/hooks/__tests__/useStudentOrgEventUpdates.test.tsx` | Repairs two stale moving-clock expectations to reflect the existing 60-second polling interval and 5-second focus cooldown; production hook behavior is unchanged. |

`src/components/events/OrganizationEventHistory.tsx`, its test, `ReuseOrganizationEventDialog.tsx`, its test, `PublicLayout.tsx`, `StudentMyEventsPage.tsx`, and `StudentMyEventsAccess.test.tsx` were already dirty at the first status check. This work preserved and extended those files. `vite.config.ts` was also already dirty and was not changed by this task. The following prior untracked artifacts were preserved: `docs/conversation-handoff-2026-10-12.md`, both existing `docs/superpowers/plans/2026-10-14-*.md` files, and `docs/verification/organization-event-continuity/`.

This task added the report, results JSON, verification logs, and 38 screenshots under `docs/verification/organization-events-tabs/`. Four screenshots record the prior stacked-page appearance; 28 screenshots cover Current work and Event history at all seven requested viewport sizes in both themes; six additional captures cover the long-content, open year/action menus, sticky tabs, short reuse dialog, and next-page error states. Obsolete failed-run and duplicate captures were removed from the evidence folder after the final passing run.

## Requirement-to-evidence matrix

| ID | Status | Implementation and evidence |
| --- | --- | --- |
| U1 | PASS | Two top-level tabs in `OrganizationEventsWorkspaceTabs.tsx`; one-action history access in [desktop](evidence/history-dark-1440x900.png) and [mobile](evidence/history-dark-390x844.png). Browser matrix records both panels for all viewport/theme pairs. |
| U2 | PASS | Sticky tabs follow the actual `PublicLayout` navbar with no nested vertical scroll. The scrolled [mobile capture](evidence/dashboard-dark-390x844-sticky-tabs.png) records navbar bottom at 57px and tabs top at 57px; all responsive pairs pass. |
| U3 | PASS | `StudentMyEventsPage.tsx` stores the selected view in the URL while retaining unrelated query keys. Browser Back/Forward and query retention pass; see `browser-run-final.log` and `verification-results.json`. |
| U4 | PASS | Tabs hide the inactive panel from focus/accessibility; searches, year, disclosures, pagination, and each panel's scroll position persist. Covered by the tab/history tests and browser keyboard/retained-scroll checks. |
| U5 | PASS | Organization/actor/grant changes clear old content and reject delayed stale responses. Access tests and the delayed multi-organization browser scenario pass. |
| U6 | PASS | Current work uses the existing non-archived attention predicate; exact totals are shown only when data is complete, otherwise the UI identifies loaded partial records. The 101-record scenario verifies this. |
| U7 | PASS | Cards surface title, status, schedule, year, and location; creator/created/reuse metadata is expandable. See [Current work](evidence/current-dark-1440x900.png), [history](evidence/history-dark-1440x900.png), and [long content](evidence/history-dark-360x800-long-content.png). |
| U8 | PASS | Existing themed Radix selects, popovers, and dialogs are used; no visible browser-default popup remains. Year options, action-menu items, search clear, and dialog close meet the measured 44px target. See [year menu](evidence/history-dark-440x956-year-menu.png), [action menu](evidence/current-dark-440x956-actions-menu.png), and [reuse dialog](evidence/reuse-dark-390x420.png). |
| U9 | PASS | Existing routes, representative/access checks, notification acknowledgement targeting, and action gates remain covered by the focused access/action tests and browser scenarios. |
| U10 | PASS | Draft, pending, revision, approved/unpublished, approved/published, archived, and unknown statuses are covered. Approved is never rendered as Published; reuse eligibility and archived read-only route are preserved. |
| U11 | PASS | Search debounce, year selection/reset, stable selected options, URL retention, and offset paging pass the history suite and browser filter/clear checks. |
| U12 | PASS | Initial and next-page errors are retryable; loaded cards survive a paging error; retry uses the same offset and deduplicates records. See [next-page error](evidence/history-dark-next-page-error.png) and browser error checks. |
| U13 | PASS | Cancel and busy states are covered; duplicate confirmation is guarded; mutation failures stay visible in the themed dialogs. Browser mutations are in-memory fixture operations only. |
| U14 | PASS | 28/28 Current work/History viewport-theme renders pass at 360x800, 390x844, 440x956, 768x1024, 1440x900, 390x420, and 740x390 in light/dark. An additional 28 checks measure interactive controls in both panels at 44px minimum; year/action menu items, search clear, and dialog close are measured after animations settle. Keyboard, focus, short dialog, landscape, and reduced-motion checks also pass. |
| U15 | BLOCKED | The 11-file focused suite and production build pass; no current TypeScript diagnostic remains in task files. Repository-wide `tsc` still exits 1 with 47 normalized diagnostic signatures not present in baseline in untouched files; cause is unverified. Full comparison: [typescript-diagnostic-diff.json](logs/typescript-diagnostic-diff.json). |
| U16 | PASS | Changes are in the original `main` checkout; fixture used port 5181 and was stopped. The user app/port 5173, `.env.local`, permissions, SQL/RLS/RPCs, map editor, package versions, and lockfile were not changed. Fixture metrics are zero live requests forwarded and zero live mutations. |

## Functional rules preserved

- Current work excludes archived records and uses the established attention rule: drafts/submissions and upcoming/ongoing approved records remain visible; an otherwise finished approved record remains current only while it has open feedback. The code does not invent a new approval or ownership rule.
- Event history intentionally includes all organization records, including records also shown in Current work. Its visible explanation says so; search and year filtering operate on that history set.
- `view=history` opens Event history; missing/unknown view falls back to Current work. Unrelated query parameters, including the selected organization, remain intact; browser Back/Forward changes the selected tab.
- Exact Current work counts are presented only when the complete organization record set is loaded. Partial loads explicitly state how many records are currently loaded; an empty first page cannot be misreported as a final empty state when more records remain.
- Existing server-side access and reuse eligibility remain authoritative. The UI continues to gate actions during access/data refresh and missing/unpublished/cached campus states. Archived map viewing remains read-only.
- Approved status and student publication visibility are separate. History shows Approved for an approved event, and only the existing publication state is described as Published/visible.
- Notification acknowledgement remains scoped to the selected event; stale organization responses do not replace the active organization's content.

## Tests, build, and type comparison

The exact plan suite passed: **11 test files, 81 tests passed, 0 failed, 0 skipped**. The two moving-clock fixture repairs were made deliberately: the test now follows the hook's existing 60-second poll period and waits through the existing 5-second focus cooldown. No production hook timing was changed and no test was skipped or removed. [Test log](logs/tests-final.log)

The production build completed with exit code 0. Vite retains its chunk-size warning: some chunks exceed 500 kB after minification; the largest named output is `AdminMapBuilderPage` at about 1.815 MB. [Build log](logs/build-final.log)

`node node_modules/typescript/bin/tsc --noEmit --singleThreaded` exits 1. Normalizing by file path, TS code, and first-line message (ignoring line/column) gives:

| | Baseline | Final |
| --- | ---: | ---: |
| Raw diagnostics | 2,406 | 1,047 |
| Unique normalized diagnostics | 1,752 | 528 |
| New signatures vs baseline | — | 47 |
| Resolved signatures vs baseline | — | 1,271 |
| Unchanged signatures | — | 481 |

After fixing the one status-guard diagnostic found during final review, the changed task files have zero current TypeScript diagnostics. The 47 remaining newly seen signatures are in untouched files across map-builder, service, and admin-page areas; the cause of that difference is not established. I am not attributing them to this implementation, but the repository-wide type gate cannot be called clean until that unexplained delta is checked. The complete introduced and resolved lists are in [typescript-diagnostic-diff.json](logs/typescript-diagnostic-diff.json); raw logs are [baseline](logs/typescript-baseline.log) and [final](logs/typescript-current.log).

`git diff --check` exited 0. Git emitted only line-ending notices for existing LF/CRLF working-copy behavior. [Check log](logs/diff-check-final.log)

## Browser evidence and isolation

The fixture renders the real `PublicLayout` navbar/mobile navigation and actual `StudentMyEventsPage`; only the API/service data and the safe map-editor destination are stubbed. It uses deterministic records and test time, a dummy Supabase URL/key, an isolated Vite cache, and request interception before navigation. Explicit fixture routes are fulfilled in memory; unexpected/external requests are aborted and recorded. Final metrics: `liveRequestsForwarded=0`, `liveMutations=0`, `unexpectedRequests=[]`, `browserConsoleErrors=[]`.

All 85 checks passed. This includes all 28 current/history viewport-theme render checks, 28 panel control-size checks, academic-year option and action-menu item size checks, search-clear and dialog-close target checks, filter/URL behavior, Back/Forward, tab focus and hidden-panel focus isolation, disclosure and scroll retention, 101-record partial counts, statuses, role/access gates, organization-switch stale-response handling, menu placement, retry/deduplication, safe map navigation, failed mock mutations, focus return, and reduced motion. The complete per-check matrix and screenshot references are in [verification-results.json](verification-results.json); the runner output is [browser-run-final.log](logs/browser-run-final.log).

The final browser run had no console errors or unexpected requests. One earlier sticky-bar assertion used an unnecessarily tight 3px placement tolerance and rejected the valid 8.5px gap at tablet width despite no overlap; it now checks that the tab bar remains directly beneath the navbar within 16px. Earlier menu hit tests also checked a point outside the menu bounds; the final checks test actual overlapping hit targets and confirm the year options remain above the mobile navigation. Touch-size assertions wait for Radix menu and dialog entrance animations to settle before measuring their final 44px hit areas.

The four `before-current-*` captures show the original stacked layout. Their test fixture still used a text label for the mocked notification bell, so that text overlaps the avatar in those before screenshots. The final fixture uses an icon-shaped bell mock matching the real navbar control; this difference is confined to the test stub and is not part of the product change.

### Screenshots

Before: [desktop dark](evidence/before-current-dark-1440x900.png), [desktop light](evidence/before-current-light-1440x900.png), [phone dark](evidence/before-current-dark-390x844.png), [phone light](evidence/before-current-light-390x844.png).

After: [Current work desktop dark](evidence/current-dark-1440x900.png), [Current work desktop light](evidence/current-light-1440x900.png), [Event history desktop dark](evidence/history-dark-1440x900.png), [Event history desktop light](evidence/history-light-1440x900.png), [Current work phone dark](evidence/current-dark-390x844.png), [Current work phone light](evidence/current-light-390x844.png), [Event history phone dark](evidence/history-dark-390x844.png), [Event history phone light](evidence/history-light-390x844.png), [tablet light](evidence/history-light-768x1024.png), [long content at 360px](evidence/history-dark-360x800-long-content.png), [year menu at 440px](evidence/history-dark-440x956-year-menu.png), [action menu at 440px](evidence/current-dark-440x956-actions-menu.png), [sticky tabs](evidence/dashboard-dark-390x844-sticky-tabs.png), [short-phone reuse dialog](evidence/reuse-dark-390x420.png), and [history paging error](evidence/history-dark-next-page-error.png).

The regular matrix also includes every combination of both themes, both panels, and all 7 viewports. The PNGs are in [`evidence/`](evidence/).

## Limitations and manual checks

The live `list_organization_events` RPC/HTTP 400 from the earlier screenshot was **not checked, reproduced, or resolved here**. The fixture intentionally blocks live Supabase access, so passing mocked history checks are not evidence that the live backend succeeds. No live Supabase request was forwarded.

When a configured backend and authorized account are available:

1. Sign in as an active student-organization representative, open Organization Events, select Event history, search/filter, and page through records. Expected: the assigned organization's records and correct totals load without the RPC 400. If it recurs, inspect the actual request and sanitized server response; this UI report does not diagnose the backend contract.
2. Open View event maps to confirm the existing event route in the real app. Open Reuse as new draft and cancel to confirm the dialog without writing data. Test a successful reuse only with an approved test event/account if a real draft mutation is intended.
3. If checking publication wording end to end, use existing test records and a representative/GSO account to inspect one approved-unpublished and one published event. Expected: Approved and Published stay distinct, with student visibility controlled by the existing publication state.

The fixture uses a safe route and in-memory mutations, so it does not exercise live Supabase permissions, live data shape, real draft creation, or GSO publication. The repository-wide TypeScript diagnostic delta also needs investigation before calling the entire repository type-clean.

## Final diff review

The final local diff contains no SQL, migration, RLS, RPC, map-editor, credential, package-version, or lockfile changes. Existing route, event ownership, action eligibility, publication, and server authorization paths remain covered by focused tests. Prior dirty files and unrelated handoff/database-continuity documents were preserved. The verification fixture has been stopped. No commit, PR, merge, or push was performed.

Please review this report against the implementation plan, especially U1–U16, action eligibility, data isolation, browser evidence, and unresolved failures.
