# Independent review — Organization Events tabs

Review date: October 15, 2026 (Asia/Manila).

Original verdict: **changes requested**. All four findings were subsequently corrected; see [the fixes report](../fixes-report.md) for the current evidence and runtime. This document preserves the original review observations. The review itself changed no production source, permissions, SQL, migrations, credentials, or application server.

## Findings

### R1 — P1: The user's running app serves another checkout

The current server on `http://localhost:5173` serves `StudentMyEventsPage.tsx` whose React Refresh and JSX file names explicitly point to `C:/Users/Rj/.codex/worktrees/event-history-uiux/plv-navisync/src/pages/StudentMyEventsPage.tsx`. That served module imports neither `OrganizationEventsWorkspaceTabs` nor `OrganizationCurrentWorkCard`. Requesting the new tabs component on the same server returns the HTML fallback rather than JavaScript.

The delivered source exists in the original checkout at `C:/Users/Rj/Documents/GitHub/plv-navisync`. The user therefore cannot evaluate these new tabs through the currently running app. This is a current runtime finding, not evidence of when or why the server changed after the implementation report. The existing server was inspected read-only and was not stopped or restarted.

Required next step: run the original checkout on the intended app port after identifying/stopping only the relevant old development server, preserving the existing checkout-specific cache and environment configuration. Recheck the actual served source and UI. U16's claim that delivery is visible through the user's usual app needs revalidation.

### R2 — P2: A delayed acknowledgement overrides a newer tab choice

Location: `src/pages/StudentMyEventsPage.tsx:278–279`.

Reproduction with the actual page and an isolated delayed acknowledgement mock:

1. Open an unread pending event's **Edit maps** link and hold its acknowledgement promise pending.
2. Select **Event history** while the promise is pending.
3. Confirm the URL contains `view=history` and the history records have loaded.
4. Resolve the acknowledgement.

Observed: the app navigates to `/student/events/event-pending/edit`, overriding the user's newer History selection. The completion guard watches actor/unmount/request identity, but a tab query change does not invalidate that request. No live notification acknowledgement was made.

Required next step: invalidate pending editor navigation when the relevant location/query or organization/grant changes, while preserving normal and modifier-click navigation. Add a delayed-ack regression test for tab/organization changes. U9 needs correction.

### R3 — P2: First History activation jumps to the page top

Location: `src/components/events/OrganizationEventsWorkspaceTabs.tsx:75–81` and its effect at lines 53–73.

`selectView` sets `historyVisitedRef.current = true` before the value-change effect checks whether this is the first visit. The effect then restores the uninitialized History scroll position (`0`) instead of aligning History beneath the sticky tabs.

Observed with a starting scroll of 420px:

| Viewport | Expected approximate first-History scroll | Actual |
| --- | ---: | ---: |
| 390×844 | 369.5px | 0px |
| 1440×900 | 254.75px | 0px |

The existing browser acceptance checks returning to Current work, but never asserts the first History position. The mobile result spends the viewport on the page header/context rather than the chosen history content.

Required next step: keep first-visit detection separate from lazy mounting, restore after layout, and test both first activation and subsequent independent scroll positions. U4 is not fully satisfied. Evidence: [phone](evidence/first-history-390.png), [desktop](evidence/first-history-1440.png).

### R4 — P2: Current-work density misses the approved visual target

Location: `src/components/events/OrganizationCurrentWorkCard.tsx:68` and the dashboard header/context spacing in `src/pages/StudentMyEventsPage.tsx`.

The ordinary two-location collapsed draft card measures **387.75px** high at 1440×900, compared with the plan's approximate 220–280px target. The first card begins at y=455.75; its primary action ends at y=766.5. The second card's primary action ends at y=1240.25, outside the first viewport. Thus the plan's aim of two ordinary titles/actions visible at desktop size was not met.

Required next step: reduce desktop header and card stacking, use more horizontal grouping for ordinary metadata, and preserve essential feedback/accessibility targets. Do not hide warnings or clip long content to meet a fixed height. U7's compactness claim should be qualified until inspected again. Evidence: the [original final desktop screenshot](evidence/current-before-fixes.png) and measured card bounds in [results.json](results.json).

## Fresh verification

- Exact focused plan suite: exit 0; **11 files, 81 tests passed, zero failed or skipped**. [Log](logs/tests.log)
- Production build: exit 0; Vite retains its >500kB chunk warning. Largest named chunk remains about 1.815MB. [Log](logs/build.log)
- Repository TypeScript: exit 1; **1,047 diagnostic entries**, zero in the task's implementation files. The previous baseline/current diagnostic delta remains unresolved; this review does not establish its cause. [Log](logs/typescript.log)
- Targeted isolated browser probe: exit 0; it successfully reproduces R2 and R3 and measures R4. The probe completing successfully means the reproductions ran, not that the product behavior passed.
- The earlier 85-check matrix was inspected, not rerun in full during this review. The original matrix lacks the delayed-ack/tab-change and first-History scroll assertions described above. It also does not assert the compact card height/two-actions desktop target.
- No external requests were allowed by the review browser route interceptor. The normal app was inspected through static source-module HTTP requests only. No live Supabase calls or mutations were made.
- The review fixture's strict port 5181 server was stopped after each probe. Port 5173 and the user's server were left unchanged.

The earlier live `list_organization_events` HTTP 400 remains unverified. It requires an authorized account and configured backend; the isolated UI checks cannot establish live readiness.

## Required disposition

Treat U4, U7, and U9 as needing fixes/reverification; treat U16's current server target as failing until corrected; retain U15 as blocked. Preserve the original report as implementation history and append this review rather than treating its PASS rows as final approval.

No commit, PR, merge, or push was performed. Original checkout HEAD remains `95b546122ba66fe52343bcf9111495844fcf320d`.
