# Notification panel verification — 2026-11-13

Scope: admin notification popover only. Actual `AdminLayout`, activity component, theme hook, and stylesheet rendered in an isolated Vite preview; only authentication, sidebar, submission data, and activity services were replaced by local fixtures. No live backend data was written.

- 27 tests passed across `AdminLayout.activityNotifications`, `AdminActivityNotifications`, `notificationService`, `adminNotificationPreferencesService`, and `eventNotificationService` suites.
- `npm run build`: passed; Vite emitted its bundle-size warning.
- `npx tsc --noEmit`: failed with repository-wide errors outside the changed notification files. No diagnostic referenced the changed notification component or test files; this is not a clean repository-wide typecheck.
- `git diff --check`: passed.
- Eight layout checks passed: light and dark at 1440×900, 390×844, 320×568, and 740×390. Confirmed viewport bounds, no panel horizontal overflow, expandable history, persistent header/footer while scrolling, close/Escape behavior, and focus restoration.
- Four state checks passed: pending submission, empty activity, loading, and error/retry. Confirmed marking activity read leaves a pending submission unread.
- Browser runs recorded no page errors for the eight layout scenarios. Screenshots reviewed for light mobile and dark desktop layouts.

See `results.json` for measured panel bounds and the PNGs in this directory for rendered evidence. Browser fixture source and runner are in `.tmp/notification-panel` in this checkout.

Pre-push verification: all 27 focused tests passed again across the five suites above. A broader 439-file test run was attempted; it reported failures while running unrelated map-editor suites and was stopped before completion. No full-suite pass is claimed. Unrelated tests and application files were left unchanged.
