# Notification Panel Implementation Plan

> Execute inline, task by task, using the executing-plans workflow. The user approved the proposed notification improvements and explicitly requested planning followed immediately by implementation.

**Goal:** Make the admin notification popover readable, actionable, and responsive in light and dark mode, without changing unrelated UI.

**Architecture:** Keep data loading, preferences, authorization, and guarded navigation in `AdminLayout`. Add a notification-only activity component that groups report updates and renders their title, status, actor, time, and expandable history. Use existing theme tokens plus paired light/dark status colors; do not alter shared styles or the shared activity formatter.

**Tech stack:** React, TypeScript, Tailwind 4, Lucide, Motion, Vitest, Testing Library, Vite.

## Scope and design decisions

- Modify only admin notification markup/state, one notification activity component, focused tests, and this plan/evidence.
- Preserve submission review destinations, unread receipts, preferences, audit records, and the unsaved-work guard. Do not change student notifications, databases, other pages, global colors, fonts, or dependencies.
- Retain the existing bell placement and branding. Use a 26rem maximum panel width with mobile side gutters, a viewport-constrained flex column, a fixed header/footer, and one scrollable body.
- Light mode: white card, neutral section surfaces, dark body text, blue unread accents, and pale status backgrounds. Dark mode: existing dark card, brighter secondary text, deep status surfaces, and lighter status text. Use 14px titles and 12px metadata with wrapping instead of one-line truncation.
- Label the actionable submission section `Needs review`, with its pending count and compact empty state. Show instructions about individual read tracking only when submissions exist.
- Label the independent activity section `Recent activity`. Opening the bell does not clear activity unread state. `Mark activity read` clears only activity; submission receipts remain controlled by review.
- Group report rows only when they have the same nonempty entity ID; never combine unrelated reports by title. Keep newest-first ordering and display at most six groups from the existing 40-row fetch. Expand older updates inside each group using native details/summary.
- Prefer report names from resolved context or existing metadata keys; fall back to the shared activity title when a name is unavailable. Keep a textual status alongside colored accents.
- Keep `View all activity logs`, because it links to Activity Logs; replace the ambiguous checkmark with an arrow. No new notifications page.
- Add explicit close, Escape dismissal, outside-click dismissal, trigger focus restoration, focus entry, and reduced-motion support confined to this popover.

## Task 1: Behavioral regression coverage

**Files:** `src/components/layout/__tests__/AdminLayout.activityNotifications.test.tsx`; create `src/components/layout/__tests__/AdminActivityNotifications.test.tsx`.

- [x] Add fixtures for repeated report updates, distinct reports with identical names, missing names/IDs, non-report activity, and long titles.
- [x] Test report-first presentation and expandable grouped history, with distinct entities remaining separate.
- [x] Test opening preserves unread activity; the explicit read action clears activity but leaves submission receipts untouched.
- [x] Test panel close/Escape and focus restoration; preserve guarded review/footer navigation and existing loading/error/retry behavior.
- [x] Run focused tests before implementation and confirm failures identify missing behavior.

## Task 2: Activity presentation

**File:** create `src/components/layout/AdminActivityNotifications.tsx`.

**Interface:** props `{ logs: ActivityLogRow[]; contexts: Map<string, ActivityPresentationContext>; unreadIds: ReadonlySet<string> }`.

- [x] Sort a copy of logs newest-first, group only `report.*` records with matching entity IDs, then limit to six groups.
- [x] Resolve the report title from context/metadata without modifying shared formatters. Show shared status copy, actor/category, and a semantic timestamp with the full timestamp as a tooltip.
- [x] Render unread text/dot/tint if any update in the group is unread. Render older updates as an expandable list with individual actor/time/status.
- [x] Use wrapping, readable type, scoped paired status colors, and semantic list markup.

## Task 3: Panel integration and themes

**File:** `src/components/layout/AdminLayout.tsx`.

- [x] Keep the existing 40-row query and preferences filter; resolve contexts for those rows so grouping does not hide other reports behind repeated updates.
- [x] Track unread row IDs with the existing `notificationService.countUnseenLogs([row], adminId)` API. Remove automatic marking on open; implement an explicit activity-only mark action with `markLogsSeen(adminId)` and local state reset.
- [x] Add `aria-controls`, a named nonmodal dialog, focus entry/return, Escape/outside dismissal, and a close button. Respect reduced motion.
- [x] Rework the panel into a constrained flex column, with scrolling only in the middle and mobile safe-area-aware positioning.
- [x] Restyle submission rows with 14px titles, 12px metadata, blue unread indicators with accessible labels, and a clear pending badge; preserve loading/error/receipt-sync and all navigation paths.
- [x] Integrate the grouped activity component under its own heading. Keep the footer destination and guarded navigation, with an arrow icon and visible keyboard focus.

## Task 4: Verify and review scope

- [x] Run `npm test -- src/components/layout/__tests__/AdminLayout.activityNotifications.test.tsx src/components/layout/__tests__/AdminActivityNotifications.test.tsx src/lib/__tests__/notificationService.test.ts`.
- [x] Run `npm run build` and `npx tsc --noEmit` when a TypeScript project config exists.
- [x] Inspect actual rendered popovers in light/dark at desktop and mobile widths, including short viewports, grouped history, pending/empty/error states, and readable text. Use isolated local fixtures if live authentication is unavailable; never write test activity to production.
- [x] Verify the panel stays within viewport bounds, header/footer stay visible when the body scrolls, long content does not overflow, close/focus behavior works, and activity read does not acknowledge submissions.
- [x] Review `git diff --check` and the final changed-file list for notification-only scope. Leave unrelated pre-existing untracked files alone. No commit or publication is requested.

## Execution record

Plan reviewed against the approved suggestions: all changes stay within the admin notification experience; no new routes or backend behavior are required.


Completed on 2026-11-13. Validation: 27 tests passed across five focused notification suites; production build passed (with the bundle-size warning); 12 isolated browser scenarios passed, including both themes at 1440×900, 390×844, 320×568, and 740×390. Visual screenshots reviewed. Repository-wide TypeScript checking failed on errors outside the changed notification files; no diagnostics referenced these changed files. `git diff --check` passed.

Execution stayed in the user-provided checkout and ran inline as requested. No commit, publication, database edits, global style changes, or unrelated application edits were made.
