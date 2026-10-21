# Organization Events tabs and compact cards — GPT 6 Luna Max Implementation Plan

> For the implementing agent: use the available executing-plans workflow to implement this plan task by task. Follow the checkboxes and evidence gates. The user has approved the two-tab design and asked for this implementation handoff. Implement locally, then produce the report described below for review by the planning agent. Do not create a new chat or delegate unless the user separately requests it.

**Goal:** Let a student organization representative switch immediately between Current work and Event history, scan compact event cards, and perform the right action without scrolling past the entire current-work list.

**Architecture:** Keep the existing dashboard route and authorization/data hooks. Add an accessible themed tab frame, extract focused current-work/history card presentation, and retain independent request state for each panel. Preserve the current-work predicate and existing event commands; improve history client state and presentation without changing the RPC contract.

**Tech stack:** React 18.3.1, React Router 7, TypeScript, Vite 6, Tailwind 4, installed Radix UI primitives, lucide-react, Vitest/Testing Library, and approved local browser tooling.

**Workspace:** C:\Users\Rj\Documents\GitHub\plv-navisync

**Plan written:** October 14, 2026, Asia/Manila. This document is a plan, not a claim that the UI below is implemented.

## Implementation prompt

Implement this whole plan for PLV NaviSync using GPT 6 Luna Max. Read the actual source, Git status, and repository instructions first. Preserve existing local changes. Deliver the working changes in the original local checkout so the user can see them in their usual app.

Use the supplied desktop screenshots as the baseline: Current work appears before Event history, the representative must scroll through large cards, and historical cards expose too much secondary information.

All new or modified controls must match the existing light/dark PLV theme. Use the established themed Radix controls for menus, selects, tabs, and confirmations. Do not introduce browser-default selection popups, browser alert/confirm/prompt dialogs, or unstyled controls.

Implement, run the tests and production build, actually inspect the interface in a browser, and save desktop/mobile screenshots. Complete the evidence matrix and implementation report at the end of this document. A successful unit test run alone does not prove the visual requirements.

If a live backend issue prevents a scenario, finish independent UI work and report that scenario as BLOCKED with the exact dependency. Never replace a real error with fake success or say “100% verified” while a required check is unperformed.

No PR, commit, branch merge, push, SQL, migration, RLS, RPC, or live database mutation is authorized by this task.

## Global constraints

- Preserve organization ownership, representative grants, roles, access checks, and eligibility for every action.
- Preserve create/edit/duplicate/withdraw/delete/reuse contracts, optimistic version checks, and navigation destinations.
- Approved and Published are separate states. Never rename Approved to Published or infer publication from approval.
- Preserve historical read-only behavior and the archive route query parameter.
- Preserve existing notification acknowledgement and safeguards against late navigation after the actor or route changes.
- Preserve the existing themed academic-year Select, non-wrapping record count, and checkout-specific Vite cache.
- No new dependencies, external fonts, new UI kit, large dashboard statistics, map thumbnails, or 3D canvases.
- No map editor, 2D/3D geometry, asset sizing, published map, or Supabase schema changes.
- Use the established font family and CSS tokens: background, card, popover, foreground, muted-foreground, primary, border, and destructive. Reuse semantic status colors already present on the dashboard.
- Native semantic HTML buttons, links, text inputs, and hidden file inputs are appropriate. The prohibition concerns browser-default visible UI and popups; do not replace accessible HTML semantics with clickable divs.
- Use deterministic isolated/mocked fixtures for automated interactions. No live test events, deletes, submissions, acknowledgements, or reuse requests.
- Never print, screenshot, or put credentials/tokens/environment values into the report.
- Preserve unrelated edits. Do not revert files, overwrite the prior worktree, delete caches broadly, or change the user's active branch.
- Do not repeat the earlier localhost conflict: never start another listener on port 5173. Use a dedicated strict port and a distinct cache for verification.

## Current facts to verify before coding

At planning time the original checkout was main at 95b5461, with uncommitted changes in:

- src/components/events/OrganizationEventHistory.tsx
- src/components/events/__tests__/OrganizationEventHistory.test.tsx
- vite.config.ts

There are also unrelated untracked documents. Inspect again; this is not permission to assume the status remains identical.

The Event history header count and academic-year dropdown have already been repaired locally. The original Vite server and a separate worktree previously shared node_modules and its optimizer cache, causing mixed React modules and an invalid-hook-call crash. vite.config.ts now uses a checkout-local .tmp/vite-cache. Retain that fix.

An earlier, broader history redesign may exist in C:\Users\Rj\.codex\worktrees\event-history-uiux\plv-navisync. Do not assume those files are in the user's current app. Do not blindly copy or merge that worktree; build on the original checkout's verified baseline.

A screenshot recently showed an HTTP 400 from list_organization_events. Its response body has not established the exact live cause. This frontend task must retain an honest, retryable error state. A mocked browser pass does not prove that live RPC is repaired.

The last StudentMyEventsAccess test run had 12 passes and 4 failures concerning “View maps,” review acknowledgements, and approved-event instructions. Several fixtures use an approved event ending October 11, 2026; the current-work predicate excludes ended approved events when no open feedback remains. Verify whether the moving clock explains each failure before changing a test. Never change the production predicate simply to make an old fixture appear.

Repository-wide TypeScript checks already fail. Capture a fresh baseline using the same command and environment used after implementation; previous error counts are not a reliable acceptance threshold.

## Approved visual design

~~~text
Organization Events                              [+ Create event]
Manage event work and find your organization's past layouts.

Organization name · Academic year · Active assignment

[ Current work ] [ Event history ]
────────────────────────────────────────────────────────────────
Active panel heading / useful context / accurate count
Panel-specific search and filters where supported
Compact event cards
Panel-specific pagination or retry
~~~

- Current work is the default view.
- Tabs sit immediately below organization context and compact access/handover context. Do not place them after the current-work list.
- On mobile the two tabs share the available width and remain legible at 360px.
- The tab bar remains available while scrolling, below the actual sticky navbar.
- History is a separate panel rather than a second section below Current work.
- Keep the tab labels “Current work” and “Event history.” In History, state: “All organization records, including current work and archived layouts.” This explains why a draft may occur in both views.
- The header Create event action remains discoverable in both views and retains the existing canCreateProposal gate. A data/access error must not enable it.
- History's main action is View event maps; Reuse as new draft is secondary.
- Current work's main action depends on status. Secondary commands go into a themed More actions menu.
- Show status, schedule, locations, academic year, next step when relevant, and actions before secondary historical metadata.

## File map and responsibilities

Inspect these existing files before edits:

| File | Responsibility to preserve |
| --- | --- |
| src/pages/StudentMyEventsPage.tsx | Route, organization selection, workspace loading, action gates/callbacks, notification acknowledgements, dialogs |
| src/hooks/useOrganizationEventWorkspace.ts | Actor/org/grant-scoped current data, 100-row page, stale guards, refresh, deduplication |
| src/hooks/useEventOrganizationAccess.ts | Verified assignments and selected organization |
| src/hooks/useStudentOrgEventUpdates.ts | Unread updates and acknowledgement semantics |
| src/components/events/OrganizationEventHistory.tsx | History request, 200ms search debounce, year filter, 20-row pages, reuse gate |
| src/components/events/ReuseOrganizationEventDialog.tsx | Reuse request identity, source/new draft distinction, retry, busy protection |
| src/components/events/EventRevisionHistory.tsx | Revision read requests and summaries |
| src/components/events/EventStudentVisibility.tsx | Publication/schedule information distinct from approval |
| src/services/eventOverlayService.ts | Existing command and list contracts; inspect but preserve |
| src/lib/eventPublication.ts | getStudentEventPhase |
| src/lib/eventFeedbackPins.ts | Open-feedback count |
| src/components/layout/PublicLayout.tsx | Real navbar/scroll ancestors and mobile navigation |
| src/components/layout/ScrollToTop.tsx | Scroll reset on pathname changes |
| src/app/components/ui/tabs.tsx | Installed accessible Tabs wrapper |
| src/app/components/ui/select.tsx | Installed accessible themed Select wrapper |
| src/app/components/ui/dropdown-menu.tsx | Installed accessible menu wrapper |
| src/app/components/ui/collapsible.tsx | Installed disclosure wrapper |
| src/styles/theme.css | Existing theme tokens, typography, component styles |
| vite.config.ts | Existing React aliases/dedupe and local optimizer cache |

Expected production edits:

- Modify StudentMyEventsPage.tsx and OrganizationEventHistory.tsx.
- Create src/components/events/OrganizationEventsWorkspaceTabs.tsx for themed tabs, lazy retained panels, and sticky-navbar measurement.
- Create src/components/events/OrganizationCurrentWorkCard.tsx and OrganizationHistoryCard.tsx to contain presentation without owning backend commands.
- Create src/lib/organizationEventPresentation.ts for the unchanged current-work predicate, safe schedule formatting, and view parsing.
- Modify ReuseOrganizationEventDialog.tsx only for presentation and focus behavior required by the new UI.
- A small dashboard-only PublicLayout.tsx change is allowed if necessary to make actual sticky positioning work. Do not change scrolling for all routes.
- Modify useOrganizationEventWorkspace.ts only if a tested pagination concurrency problem is found; its access and refresh contracts must remain intact.

Expected verification files:

- src/components/events/__tests__/OrganizationEventsWorkspaceTabs.test.tsx
- src/components/events/__tests__/OrganizationCurrentWorkCard.test.tsx
- src/components/events/__tests__/OrganizationHistoryCard.test.tsx
- src/lib/__tests__/organizationEventPresentation.test.ts
- Update the existing OrganizationEventHistory.test.tsx, ReuseOrganizationEventDialog.test.tsx, and StudentMyEventsAccess.test.tsx as necessary.
- docs/verification/organization-events-tabs/implementation-report.md
- docs/verification/organization-events-tabs/verification-results.json
- docs/verification/organization-events-tabs/evidence/ for browser screenshots
- Disposable browser fixture/server/runtime files belong in .tmp/organization-events-tabs/, not production routes.

Keep extraction focused. Do not rewrite the entire page or share one permission-bearing card across current work and history.

## Task 1: Establish and preserve the baseline

**Interfaces consumed:** Current Git checkout, existing verification commands, source and service contracts.

**Output:** Recorded baseline, before screenshots, and a requirement checklist in the report.

- [ ] Inspect Git status, branch, HEAD, repository instructions, local file differences, and the existing main/worktree/server state.
- [ ] Read the files in the file map; record the existing action gates before moving their markup.
- [ ] Capture the exact working-tree diff of relevant source into an ignored local baseline artifact. Never put .env files in it.
- [ ] Run the existing focused tests before editing and save their actual results and exit code.
- [ ] Run TypeScript before editing and save full diagnostics for later normalized comparison.
- [ ] Create an isolated browser fixture from the actual dashboard and layout components. Save before screenshots at 1440x900 dark and light, and 390x844 dark and light.
- [ ] Note the four existing access-test failures by exact name; test the moving-clock explanation using fixture-only changes.
- [ ] List each action's visibility, disabled conditions, callback parameters, and route. Use this list as the preservation checklist during the card/menu extraction.

Baseline commands, from the original checkout:

~~~powershell
git status --short --branch
git rev-parse HEAD
git diff --check
node node_modules/vitest/vitest.mjs run src/pages/__tests__/StudentMyEventsAccess.test.tsx src/components/events/__tests__/OrganizationEventHistory.test.tsx src/components/events/__tests__/ReuseOrganizationEventDialog.test.tsx src/hooks/__tests__/useOrganizationEventWorkspace.test.ts src/hooks/__tests__/useEventOrganizationAccess.test.tsx --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --singleThreaded
~~~

Use shell redirection or the Vitest JSON reporter to retain output without flooding the user with a long log. An exit code from a wrapper command is not the compiler/test process exit code; capture the process's actual exit value.

**Gate:** The baseline is recorded, unrelated work is preserved, and verification cannot reach live mutations.

## Task 2: Implement navigation, retained panels, and truthful counts

**Files:** StudentMyEventsPage.tsx, OrganizationEventsWorkspaceTabs.tsx, organizationEventPresentation.ts, associated tests. PublicLayout.tsx only if the route-specific sticky prerequisite is proven.

**Contracts:**

~~~tsx
import type { ReactNode } from "react";

export type OrganizationEventsView = "current" | "history";

export function parseOrganizationEventsView(
  value: string | null,
): OrganizationEventsView {
  return value === "history" ? "history" : "current";
}

export interface OrganizationEventsWorkspaceTabsProps {
  value: OrganizationEventsView;
  onValueChange: (value: OrganizationEventsView) => void;
  currentCount?: number;   // only supply an exact value
  historyCount?: number;   // unfiltered, authorized history total
  currentPanel: ReactNode;
  historyPanel: ReactNode;
}
~~~

- [ ] Write failing tests for default Current work, clicking History, keyboard selection, only one visible/accessibility-exposed panel, and retaining History search when switching back.
- [ ] Run those tests and verify the expected failures before implementation.
- [ ] Use the existing Tabs primitives with real tab/tablist/tabpanel semantics, selected styling, focus ring, and minimum 44px targets.
- [ ] Replace the existing visible native Organization workspace select with the installed themed Select. Keep access.selectOrganization, verified options, academic-year labels, and the existing no-selection state; use a non-empty sentinel for a Radix placeholder item. Never populate it from unverified organization names.
- [ ] Use manual keyboard activation for lazy remote content: arrow keys move focus; Enter/Space selects. Pointer/touch selects immediately.
- [ ] Store the active view in the existing URL's view parameter. Retain organizationId and all unrelated parameters. A tab change must not navigate to another route or call a mutation.
- [ ] Unknown/missing view values resolve to Current work. Back/Forward must restore the selected tab.
- [ ] Fetch/mount History only on its first activation. After activation, retain its component/state in a hidden inactive panel. Do not use CSS that exposes hidden panel controls to screen readers or keyboard focus.
- [ ] Keep the existing workspace/access hooks in a stable position outside conditional hook calls. Do not toggle the entire auth/workspace hook tree on a tab change.
- [ ] Keep create/edit/withdraw/delete modal ownership at page level. Switching tabs does not create or delete records.
- [ ] Key panel state by actor ID, organization ID, and grant ID. On a changed identity, clear old filters, totals, disclosures, and saved scroll positions before exposing new records.
- [ ] Preserve scroll between panel switches during the same dashboard visit. On first opening History, align the active content with the tab bar rather than leaving the viewport at an unrelated deep position from Current work. After mount/layout, restore saved positions with no smooth animation when reduced motion is requested.
- [ ] Retain the existing ScrollToTop behavior for pathname navigation; use preventScrollReset for tab query changes.

Example query update:

~~~tsx
const [searchParams, setSearchParams] = useSearchParams();
const activeView = parseOrganizationEventsView(searchParams.get("view"));

const changeView = (view: OrganizationEventsView) => {
  const next = new URLSearchParams(searchParams);
  if (view === "current") next.delete("view");
  else next.set("view", "history");
  setSearchParams(next, { preventScrollReset: true });
};
~~~

Counts require explicit rules:

- The workspace hook loads up to 100 non-archived organization records per page. Its server total is NOT the total of the client-side Current work subset.
- Supply currentCount only when loading/error is clear and every non-archived page has been loaded. Otherwise omit the tab count; do not label the loaded subset as the full total.
- In a partially loaded Current work panel, say “N current items in M loaded organization records” and keep Load more organization events in that panel.
- If zero current items are found but more organization records remain, say “No current work in the loaded records” with Load more. Do not claim the whole organization has no current work.
- History can show a tab count once an unfiltered authorized history request succeeds. While unknown, omit the count. A filtered result total belongs to the results summary, not the unfiltered tab count.
- Add an optional onUnfilteredTotalChange callback to OrganizationEventHistory if needed. It receives number or null; call it on relevant successful unfiltered loads/reset, and do not replace the unfiltered count with a searched/year-filtered total.
- Keep parent callbacks stable with useCallback; a count update or unrelated parent render must not restart history loading or clear its filters.
- No separate speculative status-count query, arbitrary year catalog, or eager history fetch just to decorate the tab.

Sticky behavior:

- Inspect actual scroll ancestors. PublicLayout currently has overflow-x-hidden on main; this can prevent a child sticky bar from following window scrolling.
- If necessary, change that overflow to clip for the exact /student/events dashboard route only, leaving map/editor/other route behavior alone.
- Add a stable data attribute to the existing sticky navbar wrapper if a measurement anchor is needed.
- Measure the actual navbar wrapper height using ResizeObserver and update a local tab-wrapper CSS variable. Avoid fixed desktop/mobile height guesses.
- Tabs must sit below the navbar, not cover it. Use the existing stacking conventions; popovers and dialogs must remain above the tab bar.
- No nested independent vertical scrolling panels. Use the existing page scroll and respect the mobile bottom navigation/safe area.

**Gate:** History is reachable in one action without scrolling through Current work, state survives toggles, and no unauthorized/hidden controls are exposed.

## Task 3: Make Current work cards compact while preserving actions

**Files:** StudentMyEventsPage.tsx, OrganizationCurrentWorkCard.tsx, organizationEventPresentation.ts, tests.

Extract the current-work predicate without changing its meaning:

~~~ts
import type { CampusEventOverlay } from "../components/map-builder/types";
import { countOpenFeedbackPins } from "./eventFeedbackPins";
import { getStudentEventPhase } from "./eventPublication";

export function isCurrentOrganizationWork(
  overlay: CampusEventOverlay,
  nowMs: number,
): boolean {
  return overlay.status !== "approved"
    || countOpenFeedbackPins(
      overlay.locationFeedback,
      overlay.feedbackResolutions,
    ) > 0
    || ["upcoming", "ongoing"].includes(
      getStudentEventPhase(overlay, nowMs),
    );
}
~~~

The workspace already excludes archived records; do not silently change its dataset. Compute this predicate once per render and reuse it for the list and exact count. Do not freeze time once forever for an event that can become ongoing/ended.

- [ ] Write tests for draft, pending, needs-revision, approved upcoming/ongoing, ended approved with open feedback, and ended approved with no open feedback.
- [ ] Fix time-dependent fixture assumptions using an explicit test clock. For example, spy on Date.now with October 11, 2026 at 03:00 UTC for the existing acknowledgement tests, then restore the spy. Keep real timers available for debounce tests.
- [ ] Preserve the acknowledgement tests' original behavior: only the clicked record is acknowledged; modifier-key links work normally; late acknowledgements cannot force navigation after leaving the route.
- [ ] Extract only card presentation; leave command execution and access decisions in the page.
- [ ] Initial collapsed card order: title/status; concise next step; readable schedule/publication when applicable; up to two location labels; academic year; primary action plus More actions; Event details disclosure.
- [ ] Move original creator, created date, longer description, item counts, and the existing EventRevisionHistory block into Event details. Retain every available field.
- [ ] Keep “New GSO update,” Mark as read, open-feedback warnings, and relevant student visibility information visible. Do not bury actionable warnings in a collapsed detail section.
- [ ] For many feedback/location entries, show a truthful summary with an explicit accessible disclosure to reveal every entry. No truncation that permanently conceals feedback.
- [ ] Keep Current work primary action wording: Continue draft, Revise maps, View maps, or Edit maps according to existing status. Preserve the exact links and interception logic.
- [ ] Put Duplicate layout, Edit details, Withdraw submission, and Delete into More actions only where currently eligible.
- [ ] Disabled menu commands remain visibly disabled with a useful adjacent explanation when the reason is not evident. Do not create the impression that selecting a menu item succeeded when it was blocked.
- [ ] More actions uses a themed Radix DropdownMenu, accessible name “More actions for <event title>,” checkable focus/keyboard behavior, and minimum 44px trigger.
- [ ] Selecting Delete only opens confirmation. It never deletes directly from the menu.
- [ ] Use themed AlertDialog for the existing manual delete modal so it has a focus trap, title/description, Escape handling, busy dismissal protection, and a stable focus return target.
- [ ] When a menu item opens a dialog, save the visible More actions trigger as the return-focus target; the transient menu item will no longer exist on close.
- [ ] Preserve backend checks: expected updatedAt, representative grant, actionsDisabled, busy, campusError/isCached, and canCreateProposal.
- [ ] Keep the main action visible on phones; use a full-width primary button/link and a separate More actions trigger. Do not force all secondary buttons into a crowded footer.

Presentation-only card boundary:

~~~tsx
import type { ReactNode } from "react";
import type { CampusEventOverlay } from "../map-builder/types";

export interface CurrentWorkMenuAction {
  id: "duplicate" | "edit-details" | "withdraw" | "delete";
  label: string;
  disabled: boolean;
  destructive?: boolean;
  icon: ReactNode;
  onSelect: () => void;
}

export interface OrganizationCurrentWorkCardProps {
  overlay: CampusEventOverlay;
  campusName: string;
  unread: boolean;
  markingRead: boolean;
  onMarkRead: () => void;
  primaryAction: ReactNode; // existing guarded Link created by the page
  menuActions: CurrentWorkMenuAction[]; // page supplies only eligible actions
}
~~~

Do not infer eligibility inside this presentation component from an account role or arbitrary status shortcut. The page passes exactly the previously available commands.

Visual targets, not fixed-height clipping rules:

- Ordinary two-location collapsed desktop cards should usually fit in about 220–280px.
- Phone cards may grow with readable text; long titles and locations must wrap.
- Aim for at least two ordinary card titles/actions visible in the 1440x900 dashboard after its compact header.
- No tiny 10px essential instructions. Use 16–18px title, about 14px main content, and 12–13px quiet metadata.

**Gate:** Cards are substantially shorter while all current actions, warnings, notification behavior, and access decisions remain correct.

## Task 4: Polish Event history cards and preserve filtering/pagination

**Files:** OrganizationEventHistory.tsx, OrganizationHistoryCard.tsx, organizationEventPresentation.ts, tests.

- [ ] Write failing tests for details/location disclosures, proper action emphasis, archived routes, reuse eligibility, schedule formatting, retained year choices, and a failed next page followed by retry.
- [ ] Retain the one-line record count and themed academic-year Select. Ensure its trigger and search input actually have matching rendered height; the shared Select wrapper's data-size rule can override a plain height class.
- [ ] Add visible compact search/year labels on phones; keep controls full-width and at least 44px high.
- [ ] Provide an accessible search-clear button and a Clear filters action when a filter is active.
- [ ] Preserve the 200ms debounce, server-side search/year filters, page size 20, and offset restart at zero when filters change.
- [ ] Preserve previously observed valid year choices and the selected year across filtered/empty responses, scoped to the organization/grant. Do not generate an artificial year range or imply that loaded choices form a complete backend catalog.
- [ ] Each collapsed history card exposes title/status, schedule, up to two readable locations, academic year, and primary View event maps plus secondary outlined Reuse as new draft when eligible.
- [ ] Use semantic status colors/icons consistent with the current dashboard. Archived takes precedence over other badge text; unknown statuses use an honest fallback.
- [ ] Add Event details with aria-expanded/aria-controls and a unique stable ID; it reveals Original creator, Created, and Reuse history. Preserve an explanatory fallback when the source event is not in the loaded page.
- [ ] More than two locations: “Show N more locations” reveals all remaining labels; “Show fewer locations” collapses them. No tooltip-only essential text or fixed-height clipped location row.
- [ ] Keep these routes exactly:
  - Normal: /student/events/<id>/edit
  - Archived: /student/events/<id>/edit?history=1
- [ ] Preserve exact reuse eligibility:

~~~ts
Boolean(
  event.campusId
  && event.updatedAt
  && (event.archivedAt || event.status === "approved")
)
~~~

- [ ] Do not add reuse to draft/pending/needs-revision events.
- [ ] Separate initial-load errors from load-more errors. A failed next page must keep loaded cards, retain the next offset, and offer Retry more history.
- [ ] A page-one/filter failure offers Retry history and does not display a successful empty state.
- [ ] Disable repeated load-more requests using an immediate in-flight guard, not only an asynchronously updated state flag.
- [ ] Reset obsolete loadingMore/in-flight state when organization/filter generation changes. Late responses must not mutate the newly selected context.
- [ ] Deduplicate appended events by ID.
- [ ] Show “Showing X of Y events” using loaded records and the filtered server total.
- [ ] Empty messages distinguish no organization records from no matching filters. Include drafts in the definition of history.
- [ ] Avoid status/sort filters that only affect the loaded first page; no backend contract exists for that in this task.

Safe schedule contract:

~~~ts
export function formatOrganizationEventSchedule(
  dateStart?: string,
  dateEnd?: string,
): string;
~~~

Implementation rules and test cases:

- Missing/invalid start: Not scheduled.
- Valid start and absent/invalid/end-before-start end: show the valid start only, never Invalid Date.
- Same PHT calendar day: Oct 13, 2026 · 9:00 AM–5:00 PM PHT.
- Multi-day: Oct 13, 2026, 9:00 AM – Oct 14, 2026, 5:00 PM PHT.
- Compare the calendar day in Asia/Manila rather than local browser timezone.
- Use Intl.DateTimeFormat with explicit timeZone and consistent English formatting; no new date library is required.

**Gate:** History remains functionally accurate and reusable, and every server failure is represented honestly.

## Task 5: Match dialogs, interactions, and accessibility

**Files:** ReuseOrganizationEventDialog.tsx and the affected page/card components and tests.

- [ ] Clearly label Source layout and New organization draft in reuse confirmation; use actual organization/year/title fields.
- [ ] Retain all copied-location/item information, poster-link information, editable title and length validation.
- [ ] Keep “original remains intact,” fresh approval, and non-copied schedule/feedback/revision explanations.
- [ ] Preserve the request ID during retry, prevent duplicate submissions, retain title after an error, and navigate only after confirmed success.
- [ ] Buttons use the established themed states: Create new draft, Creating draft…, Retry reuse, and Cancel.
- [ ] Dialog body scrolls inside the viewport; footer/header stay usable on a short phone and with the software keyboard.
- [ ] Verify focus trap, Escape/outside dismissal when idle, dismissal protection when busy, and focus return after cancel/close.
- [ ] Keep existing Create/Edit modal behavior and organization autofill intact. Do not redesign unrelated form steps.
- [ ] Tabs, menus, Select, disclosures, reset controls, and dialog actions all have accessible names and visible keyboard focus.
- [ ] Use light/dark theme tokens for menu/Select/confirmation surfaces. Dropdowns must be opaque once open and stay inside the viewport.
- [ ] Never use window.alert, window.confirm, window.prompt, or a visible native select popup.
- [ ] Reduced motion turns off decorative list/tab/menu transitions; a short state transition must not delay interaction.
- [ ] Preserve safe-area padding for the mobile bottom navigation. No action behind it or behind the sticky tab bar.
- [ ] Do not globally modify shared UI defaults just to tune this page; prefer scoped classes/props.

**Gate:** The module looks coherent and works with touch, keyboard, and assistive technology across both themes.

## Task 6: Functional regression verification

Each changed behavior gets a meaningful regression test. Prefer user-visible outcomes and real components over class-list assertions. Test CSS-dependent layout in the browser.

Required cases:

1. Default Current work; direct view=history; unknown view; unrelated query/organizationId preserved.
2. History visible after one selection with many current cards; inactive controls cannot receive focus.
3. Search/year/page and local details state preserved across tab toggles.
4. Switching actor/organization/grant clears old context immediately; late data cannot expose prior records.
5. Correct current-work membership and truthful counts with 101+ non-archived records.
6. Zero current items in the first page but relevant work on the next page: no false final empty state.
7. Draft/pending/revision/approved/archived badge semantics; approval never becomes publication.
8. Existing action gates, disabled state, primary navigation, archived read-only route, and fresh grant/version parameters.
9. More actions opens correct confirmation; Cancel never mutates; duplicate/withdraw/delete/reuse submit once in mocks.
10. Notification acknowledgement only for the chosen record and no stale navigation after leaving.
11. History filter → zero results → selected year still visible → Clear filters restores unfiltered request.
12. Next-page failure → existing cards remain → same offset retry → no duplicate IDs.
13. A filter/organization change supersedes an in-flight next-page request and clears obsolete loading state.
14. Valid/invalid/same-day/multi-day PHT dates and no browser-timezone drift.
15. Details/location disclosures reveal all historical metadata without navigating.
16. No unauthenticated or unassigned representative access; server-side eligibility checks remain authoritative.

Example navigation test shape:

~~~tsx
it("opens History without placing it below the current-work cards", async () => {
  render(
    <MemoryRouter initialEntries={["/student/events?organizationId=org-1"]}>
      <StudentMyEventsPage />
    </MemoryRouter>
  );

  const historyTab = screen.getByRole("tab", { name: /Event history/i });
  fireEvent.click(historyTab);
  await waitFor(() => expect(historyTab).toHaveAttribute("aria-selected", "true"));

  const activePanel = screen.getByRole("tabpanel");
  expect(within(activePanel).getByRole("searchbox", {
    name: "Search event history",
  })).toBeInTheDocument();
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
});
~~~

Use the existing auth/service fixture infrastructure and import within/waitFor explicitly. Do not mock the Tabs components whose behavior this test is verifying.

Run after implementation, including every new test:

~~~powershell
node node_modules/vitest/vitest.mjs run src/pages/__tests__/StudentMyEventsAccess.test.tsx src/components/events/__tests__/OrganizationEventsWorkspaceTabs.test.tsx src/components/events/__tests__/OrganizationCurrentWorkCard.test.tsx src/components/events/__tests__/OrganizationHistoryCard.test.tsx src/components/events/__tests__/OrganizationEventHistory.test.tsx src/components/events/__tests__/ReuseOrganizationEventDialog.test.tsx src/lib/__tests__/organizationEventPresentation.test.ts src/lib/__tests__/eventOrganizationReuse.test.ts src/hooks/__tests__/useOrganizationEventWorkspace.test.ts src/hooks/__tests__/useEventOrganizationAccess.test.tsx src/hooks/__tests__/useStudentOrgEventUpdates.test.tsx --maxWorkers=1
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit --singleThreaded
git diff --check
~~~

- Save totals, names of failures, actual exit codes, and logs.
- Fix new failures caused by this task.
- Repair the scoped moving-clock fixture failures deliberately; do not skip or delete them.
- Compare full normalized TypeScript diagnostics against the captured baseline, allowing line-number movement. List introduced and resolved diagnostics separately.
- Do not claim “no new TypeScript errors” based only on a grep of the main component.
- Do not add broad any casts, ts-ignore directives, or disable checks to make the report green.
- Existing unrelated TypeScript errors may remain as a reported baseline limitation.
- A production build must complete. Report actual Vite warnings rather than implying a warning-free build.
- If the test suite contacts live Supabase, correct the fixture isolation and rerun; those results do not count.

## Task 7: Browser viewing and responsive acceptance

Use approved browser tools and actually inspect the rendered result. A screenshot generated from substitute markup is not evidence for the real dashboard.

### Safe verification setup

- Use the original checkout or a clearly identified fixture checkout. Record the exact directory and URL.
- Use a dedicated strict verification port, for example 5181 after confirming it is free. Reuse the user's original server only for read-only viewing if its origin/configuration is verified.
- Use a distinct .tmp/organization-events-tabs/vite-cache for the fixture. A shared node_modules link must not share optimizer output.
- Keep the user's real port 5173 and .env.local untouched.
- Supply a fake Supabase test URL and non-secret dummy key for the fixture; never read real demo passwords into screenshot scripts or reports.
- Intercept every external request before navigation. Fulfil the explicit mocked Supabase auth/profile/organization/campus/event/notification endpoints; abort and record unexpected requests. Never fall through to a real Supabase request.
- The runner must report liveRequestsForwarded=0 and liveMutations=0.
- Mock mutations only inside the fixture to exercise UI transitions. Do not click live Create/Delete/Withdraw/Reuse/Mark as read actions for verification.
- Use fixed test time and deterministic record IDs.
- Test the real PublicLayout/navbar/mobile navigation surrounding the dashboard, not just standalone cards, so sticky/overflow issues are visible.
- Exercise lazy editor-link navigation through a safe stub destination without mounting a live map canvas.
- Wait until content and opening animations have settled before screenshot capture. Previously an early Radix screenshot looked transparent during fade-in.
- If tools block browser access, record the exact limitation and required manual verification. Do not bypass a policy using another automation surface.

### Mock datasets

Provide named scenarios in the fixture and report:

- Normal: 3 current-work records and 4 total history records, matching the supplied screenshot shape.
- Long content: long unbroken title, long organization/creator name, 6 long locations, description, and reused source not loaded.
- Status matrix: draft, pending, needs revision, approved unpublished, approved published, archived approved, and unknown status.
- Large: 101+ non-archived records, with an ended approved first page and relevant current work on a later page; history has at least 21 records.
- Access: loading assignment, no assignment, verified assignment, multiple organizations, revoked/changed grant, standard student.
- Errors: initial RPC 400/error, next page fails once, search has zero results, stale response after context switch, and failed mocked reuse/withdraw.
- Attention: unread GSO update, general comment, unresolved feedback pins, and approved record with open feedback.
- Disabled creation: cached campus, missing/unpublished campus, campus load error, and refreshing organization access.

### Viewport/theme matrix

Inspect every width in both light and dark themes:

| Viewport | Purpose |
| --- | --- |
| 360x800 | Narrow phone layout and long labels |
| 390x844 | Typical phone |
| 440x956 | User's phone-emulation size |
| 768x1024 | Tablet |
| 1440x900 | Desktop |
| 390x420 | Short phone and dialog scrolling |
| 740x390 | Landscape phone with menus/dialogs |

For each regular width/theme combination:

- [ ] Tabs visible near the top, selected state clear, no count wrapping, no native popups.
- [ ] Current and History are mutually exclusive visible panels.
- [ ] History is reachable without scrolling through current cards.
- [ ] Long text wraps; no page-level horizontal overflow.
- [ ] All controls fit and render at least 44px touch targets.
- [ ] Open More actions and year Select: no clipping, wrong-theme surface, transparent final background, or submenu outside viewport.
- [ ] Expanded details/locations remain readable and do not cover following cards.
- [ ] Primary actions remain visible and aligned; no excessive card whitespace.
- [ ] Sticky tabs stay below the navbar after scrolling and do not obscure focused elements.
- [ ] Mobile bottom navigation does not cover controls.

Additional behavior checks:

- Keyboard: Tab, Shift+Tab, arrow keys, Enter/Space, Escape; focus trap and return for dialogs.
- Browser Back/Forward changes selected tab properly.
- Toggle Current → History → Current → History: preserved search/year/list/details and saved scroll.
- Filter → no results → Clear filters; retry initial and next-page errors.
- Double-trigger load more/confirm in mocks: one request.
- Switch org/grant while a request is pending: no old records/late actions.
- Open reuse and delete/withdraw confirmations on a short viewport; simulate keyboard-constrained height for title input and footer visibility.
- Reduced motion preference.
- Real layout boundary: small navbar menus and fullscreen dialogs stack above the sticky tabs.
- No React invalid-hook-call, null useMemo, uncaught render error, or unexpected network request in browser logs.

### Required screenshots

Store actual browser images under docs/verification/organization-events-tabs/evidence with descriptive filenames:

- before-current-dark-1440x900.png and before-current-light-1440x900.png
- before-current-dark-390x844.png and before-current-light-390x844.png
- current-dark-1440x900.png and current-light-1440x900.png
- history-dark-1440x900.png and history-light-1440x900.png
- current-dark-390x844.png and current-light-390x844.png
- history-dark-390x844.png and history-light-390x844.png
- history-dark-360x800-long-content.png
- history-dark-440x956-year-menu.png
- current-dark-440x956-actions-menu.png
- dashboard-dark-390x844-sticky-tabs.png
- history-light-768x1024.png
- reuse-dark-390x420.png
- history-dark-next-page-error.png

Also save a screenshot of any failing visual scenario. Screenshots supplement the matrix; one desktop/phone pair does not establish every breakpoint.

**Gate:** Every required matrix entry has actual PASS/FAIL/BLOCKED evidence, screenshots were inspected, and remaining visual defects were corrected and recaptured.

## Task 8: Self-review, report, and local delivery

- [ ] Review the final diff against the constraints and baseline action-gate list.
- [ ] Confirm the current-work predicate, archive route, reuse gate, grant/version checks, and notification guards are unchanged.
- [ ] Confirm no SQL, migrations, backend contracts, map editor, credentials, unrelated docs, package versions, or lockfile changed.
- [ ] Confirm the original checkout contains the delivered code and the user's normal server does not silently point to an unconfigured worktree.
- [ ] Stop only verification servers created by this task and close only temporary browser tabs. Leave the user's main server/session intact.
- [ ] Complete the report and machine-readable verification results. Link screenshots and logs with actual paths.
- [ ] Provide a concise final answer with what changed, files, test/build/type results, screenshots, and precise manual/live checks still required.
- [ ] Do not create a PR, commit, merge, or push.

### Requirement-to-evidence checklist

Use these IDs verbatim in the report. Each row needs status, implementation location, test/scenario, and screenshot or log evidence:

| ID | Requirement |
| --- | --- |
| U1 | Two top-level themed tabs; History does not sit below Current work |
| U2 | Responsive sticky tabs below real navbar without nested vertical scrolling |
| U3 | URL view/query preservation and Back/Forward |
| U4 | Hidden-panel accessibility, retained filters/pages/disclosures/scroll |
| U5 | Actor/org/grant isolation and stale-response guards |
| U6 | Truthful partial/full current-work and history counts |
| U7 | Compact cards with essential information visible and details expandable |
| U8 | Themed menus/selects/dialogs, no browser-default visible UI |
| U9 | Existing action gates, routes, notification acknowledgements preserved |
| U10 | Approved/publication/archive distinctions and exact reuse gate |
| U11 | Search/year reset, stable options, debounce and pagination semantics |
| U12 | Initial/next-page error, retry, concurrency/deduplication handling |
| U13 | Reuse/delete/withdraw busy state, mock-only commands, focus behavior |
| U14 | Phone/tablet/desktop, light/dark, short viewport, keyboard/reduced motion |
| U15 | Focused tests/build/type comparison and no new unresolved regressions |
| U16 | Local checkout/server/cache correct; zero live mutations; unrelated changes preserved |

### Required implementation report

Save: docs/verification/organization-events-tabs/implementation-report.md

The report must contain all of the following, with actual observations rather than broad assurances:

1. **Delivery identity:** workspace absolute path, branch, starting/final HEAD, whether edits are uncommitted, server/fixture URLs, and whether original checkout actually contains the changes.
2. **Result:** short before/after explanation of reaching history and scanning cards.
3. **Files:** every created/modified file and its purpose. Identify preserved pre-existing edits separately.
4. **Requirement matrix:** U1–U16, each PASS/FAIL/BLOCKED, implementation reference, meaningful test/scenario, and evidence link.
5. **Functional behavior:** current-work membership/count rules, history overlap wording, URL behavior, retained state, action menu gates, archive/reuse/publication semantics.
6. **Tests:** exact commands, actual exit codes, suite/pass/fail counts, baseline failures, new failures, and any scoped test fixture repairs with justification. No skipped test disguised as passing.
7. **Build:** command, exit code, output/log path, and material warnings.
8. **TypeScript:** same-environment baseline/current comparison, introduced and resolved diagnostics, and unchanged failures. Do not report the overall project as type-clean if it is not.
9. **Browser matrix:** every width/theme, named scenario, PASS/FAIL/BLOCKED, keyboard/focus/sticky checks, observed console errors, and no unexpected network traffic.
10. **Screenshots:** clickable before/after desktop/mobile links and specific open-menu, sticky, long-content, short-dialog, and error-state evidence.
11. **Data isolation:** how requests were intercepted; liveRequestsForwarded and liveMutations; assert zero only with evidence.
12. **Live backend:** state whether list_organization_events HTTP 400 was checked, resolved, reproduced, or not checked. Include a sanitized response code/message only if actually observed. Mock success is not live success.
13. **Limitations and manual checks:** exact action, account role, expected result, and why automation could not cover it.
14. **Final diff review:** preserved permission/route/command gates, no unrelated edits, no PR/commit/merge/push.
15. **Planning-agent review request:** end with “Please review this report against the implementation plan, especially U1–U16, action eligibility, data isolation, browser evidence, and unresolved failures.”

Save verification-results.json alongside the report. Include:

- delivery identity and timestamps
- commands with actual exitCode and evidenceLog
- unit-test totals and named failures
- baseline/current type comparison and introduced diagnostics
- browserChecks array with requirement ID, viewport, theme, scenario, result, screenshot, and notes
- browserConsoleErrors and unexpectedRequests
- liveRequestsForwarded and liveMutations
- unresolvedIssues with impact and required next step

Use null for an unperformed metric and BLOCKED for an unperformed required check. Never substitute zero for unknown.

## Completion standard

The implementation is ready for local UI review when:

- The user can open History directly with one action.
- Essential card content is readable and markedly less bulky in both panels.
- All affected controls are themed and accessible.
- Existing access/action/publication/ownership rules are preserved.
- Scoped test regressions are resolved and production build passes.
- Every required browser check has evidence or a specifically explained blocker.
- The report clearly distinguishes verified UI behavior, known repository-wide issues, and live backend readiness.

A plan cannot guarantee perfect behavior on every device or every live data condition. This plan makes compliance inspectable: the implementing agent must provide per-requirement evidence, and the planning agent will review that report before further integration.
