# Event history UI/UX — prompt for Luna Max

Copy everything under **Implementation prompt** into Luna Max. This brief was grounded in the supplied Event history screenshot and the current repository at `95b5461`. It is a proposed frontend task, not an implemented change.

## Implementation prompt

Improve the **Event history** section of PLV NaviSync for student organization representatives. Implement the work, verify it on desktop and mobile, and report the result. Use the attached screenshot as the before state. The repository is at `C:\Users\Rj\Documents\GitHub\plv-navisync`.

### Outcome

A representative should quickly find a previous event, understand its status and schedule, open its maps, and deliberately reuse an eligible layout as a new draft. Keep the existing PLV navy visual identity, typography, light/dark theme tokens and application patterns. Make the list easier to scan and less vertically bulky.

The current screenshot shows a long explanatory subtitle, a record count that wraps, similarly styled status badges, repeated bold metadata labels, long location names and a dominant reuse action. Improve this hierarchy without removing historical information or changing approval/publication rules.

### Read before editing

Inspect repository instructions, Git status and these files. Preserve unrelated local work. Do not assume line numbers or branch state still match this prompt.

- `src/components/events/OrganizationEventHistory.tsx`: section, search, academic-year filter, pagination, item routes and reuse eligibility.
- `src/components/events/ReuseOrganizationEventDialog.tsx`: source/new draft confirmation, request identity, busy/error handling and focus restoration.
- `src/pages/StudentMyEventsPage.tsx`: surrounding page, existing status colors and organization/grant keyed mounting.
- `src/services/eventOverlayService.ts`: read `listOrganizationEvents` and `reuseOrganizationEvent` to understand their contracts; preserve them.
- `src/types/eventOrganization.ts` and `src/components/map-builder/types.ts`: actual organization and overlay fields.
- `src/lib/eventOrganizationReuse.ts`: what is copied into a reused draft.
- Relevant tests under `src/components/events/__tests__`, especially `OrganizationEventHistory.test.tsx` and `ReuseOrganizationEventDialog.test.tsx`.

### 1. Section header and search

- Keep the heading **Event history**. Use a short subtitle such as **“Find and reuse your organization’s previous event layouts.”** Keep the full organization name available in a secondary context line; do not repeat it in every card.
- Keep the record count on one line with `shrink-0` and `whitespace-nowrap`. Use singular/plural correctly. The count must come from the server result, including its filtered total.
- Keep **Search event title** and **All academic years**. On desktop, search expands and the year control has a comfortable fixed/minimum width. On phones, stack both full-width controls with visible labels and at least 44px targets.
- Provide an accessible search-clear control when text is entered. Provide **Clear filters** when search/year is active.
- Preserve the current 200ms search debounce and server-side title/year filtering. Filtering restarts at offset zero.
- Do not add status tabs, aggregate statistics or sorting controls that operate only on the first loaded page. The existing service has no status/sort/year-catalog contract.
- Preserve the selected year option and previously observed valid year choices across filtered responses so the selected value does not disappear when the result changes. These remain known years from returned data; do not pretend they are a complete organization-wide catalog or generate arbitrary year ranges.

### 2. Compact, readable event cards

Use compact cards on both desktop and mobile. A desktop-only table or a new view toggle is unnecessary for this task.

Each card should expose this order:

1. **Event title**, with a readable status badge beside it on desktop and sensible wrapping on mobile. Allow long titles to wrap; do not make essential titles hover-only.
2. **Event schedule**, visually secondary to the title. Format valid dates in `Asia/Manila`, with a clear PHT indication. For same-day ranges, show the date once; for multi-day ranges, show both dates. Missing or invalid schedule should say **Not scheduled**, without rendering an undefined/invalid end date.
3. **Locations**, with a small MapPin icon and wrapping location labels/chips. Names must remain readable. For more than two locations, initially show two and an accessible **“Show N more locations”** control that expands the rest without navigating away. Offer **Show fewer locations** afterwards. Do not use a fixed-height clipped location row.
4. **Academic year**, as a quiet compact metadata item, available without expanding.
5. **Actions**: make **View event maps** the primary navy action. Keep **Reuse as new draft** as a secondary outlined action. For an archived item, preserve **Inspect archived layout** and its existing historical route.
6. An explicit **Event details** disclosure for **Original creator**, **Created date** and **Reuse history**. Use an accessible button with `aria-expanded` and `aria-controls`. Keep each expanded state local to its event ID, with no automatic opening on hover. Expanded details must retain all currently available historical information.

Do not make the entire card a nested clickable link. Use real links for navigation and buttons for disclosures/reuse. Avoid adding poster downloads, live map thumbnails or 3D canvases to each history item; they add cost and are outside this task.

### 3. Status and action accuracy

Use consistent text, icon and subtle semantic color, including dark-mode variants:

- Draft: blue/neutral drafting treatment.
- Pending review: amber with a clock.
- Approved: green with a check.
- Needs revision: red with a revision/alert icon.
- Archived: neutral with an archive icon.

Use colors already established on the surrounding events page rather than introducing a new palette. Badge text must convey the state independently of color.

**Approved must never be renamed to Published.** Approval and student publication are separate in this application. Do not infer publication from a schedule, approval or current date. Preserve existing archived display precedence; an archived item must remain clearly archived.

Preserve the exact reuse gate:

```ts
Boolean(event.campusId && event.updatedAt && (event.archivedAt || event.status === "approved"))
```

Draft/pending/needs-revision items must not gain the reuse action. Opening maps must keep the current route and permissions. Retain the archive query parameter. Do not unlock historical layouts or alter organization access.

### 4. Reuse confirmation polish

Keep the existing reuse dialog and make only focused presentation improvements needed to match the cards:

- Clearly distinguish **Source layout** from **New organization draft**; show the organization and academic year using real existing fields.
- Keep the editable new event title, current title length/validation and list of copied locations/items.
- Keep **Cancel** and **Create new draft**. Show **Creating draft…** while busy and **Retry reuse** after a failure.
- Preserve the explanation that the original layout stays intact, the new draft requires fresh approval, and schedule/approval/feedback/revision history do not carry over.
- Preserve current poster-link information when a poster exists.
- Keep the same request ID during a retry, prevent duplicate submits, retain the entered title on errors, and preserve navigation to the new draft after confirmed success.
- Keep the dialog inside the viewport with its own scrollable body, accessible title/description, focus trap and focus return. On phones, ensure the title input remains usable when the keyboard is open. Busy state must retain the existing dismissal protections.

### 5. Responsive design and states

- Test at widths **360, 390, 440, 768 and 1440px**, plus a short phone viewport. There must be no page-level horizontal overflow.
- Use the app’s current font family; no font downloads or new UI dependencies. Aim for 16–18px card titles, 14px main metadata and 12–13px quiet metadata. Avoid tiny essential text.
- Use restrained borders, 12–16px card radii, consistent 12–16px internal spacing and 12px list gaps. Give the card’s title/schedule more emphasis than labels such as “Created”. Avoid excessive shadows, gradients and decorative animations.
- On phones, keep information in one column and actions in a simple full-width stack. Both primary and secondary actions must have at least 44px targets. Maintain visible keyboard focus and theme contrast.
- Distinguish **no history yet** from **no results for filters**, with helpful copy and a clear filter reset for the latter. History includes drafts as well as approved/archived records; empty copy must not falsely claim it only contains approved records.
- Initial loading can use simple matching skeleton cards with an accessible loading status. Respect reduced motion.
- An initial fetch error needs **Retry history**. A load-more failure must retain already loaded cards and show an inline retry for the same next-page request. Do not hide the complete list or reset to page one for a next-page failure.
- Preserve the 20-record page size, offset pagination, ID deduplication, prevention of duplicate load-more requests and stale response guards across organization/filter changes. Clear obsolete loading-more state when a new filter/organization request supersedes it.
- Show **“Showing X of Y events”** above/beside **Load more history**, accurately using loaded records and the server total. Disable repeated load-more while busy; keep meaningful loading text.

### Implementation sequence

- [ ] Audit the component and surrounding page, record the actual baseline, and capture the before appearance using local mocked data.
- [ ] Add meaningful regression coverage for behavior changes: details/location disclosures, schedule formatting, status/action eligibility, stable selected-year display and next-page error/retry. Preserve authorization and stale response tests.
- [ ] Implement the header, compact cards, status treatment and responsive action layout. Extract a small card or date-format helper only if it improves clarity; avoid unrelated component/page restructuring.
- [ ] Improve reuse dialog presentation and responsive states without modifying its mutation contract.
- [ ] Run focused tests and production build. Check TypeScript against the current baseline and report new diagnostics separately; this repository previously had 1,047 existing diagnostics, so do not claim the whole repo is clean without evidence.
- [ ] Run browser checks with mocked/isolated fixtures at the listed sizes, both themes and keyboard navigation. Capture before/after screenshots. Do not use the real reuse action to create test records in production.
- [ ] Review the final diff against this brief and report the changed files, results and any unresolved limitation. Leave the implementation available locally for review.

Suggested verification commands from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run src/components/events/__tests__/OrganizationEventHistory.test.tsx src/components/events/__tests__/ReuseOrganizationEventDialog.test.tsx src/lib/__tests__/eventOrganizationReuse.test.ts --maxWorkers=1
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit --singleThreaded
git diff --check
```

Add any new focused test files to the test command. Do not rewrite tests merely to accept lost behavior; update markup-dependent queries only when the user-visible semantics remain equivalent.

### Acceptance scenarios

1. Four records match the screenshot; the count stays on one line, titles/statuses are clear and primary actions are consistently placed.
2. A very long title, long organization name, six location names and long creator data remain readable on a 360px phone.
3. Draft and approved records remain visibly distinct. An archived approved record stays archived. None are mislabeled Published.
4. Draft and pending records cannot be reused. Eligible approved/archived records open the existing confirmation and create a new draft only after explicit confirmation.
5. Filter by year and title, then get zero results; the selected year remains visible and Clear filters restores the unfiltered request.
6. Load a second page that fails, retain the first page, retry the same offset, and append without duplicate event IDs.
7. A late response from an earlier organization/filter cannot overwrite the current results.
8. Keyboard users can search, expand details/locations, open/close the reuse dialog and return focus to the triggering control.
9. Light/dark desktop and phone layouts have no horizontal overflow or clipped actions; opening disclosures does not conceal the following card.

### Boundaries

This task is frontend/UI and small client-state consistency fixes only. Preserve the database, RLS, RPCs, representative grants, publication rules, map editor/2D/3D geometry and event ownership. Do not invent new backend fields or call live mutations for testing. No migration or SQL query is expected.

Do not create a PR, merge or push as part of this handoff. First deliver the verified local result and a concise report. If an essential requested behavior turns out to need backend work, explain the specific dependency and finish the independent frontend work; do not silently broaden the scope.
