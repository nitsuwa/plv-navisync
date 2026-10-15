# Organization Events — review fixes and manual testing handoff

October 15, 2026, Asia/Manila. This report supersedes the four findings in [the independent review](review/report.md) for the verified local UI/runtime behavior.

## Fixed findings

| Finding | Result | Verification |
| --- | --- | --- |
| R1: usual app served another worktree | RESOLVED | A hidden Vite server is now running on `http://localhost:5173` from `C:/Users/Rj/Documents/GitHub/plv-navisync`. Static module checks confirm the original checkout and new tabs. The strict-port startup found no active listener to stop at that moment; no unrelated process was stopped. |
| R2: delayed acknowledgement overrides a newer tab/context | RESOLVED | Pending editor navigation is invalidated on router location-key or actor/organization/grant scope changes. Three new unit cases cover History, organization query, and grant changes; a delayed mock acknowledgement in Chromium leaves the user in History. |
| R3: first History visit jumps to the page top | RESOLVED | First-visit tracking is separate from lazy mounting. Scroll positions are recorded before pointer transitions and during normal scrolling. Restoration uses the normal-flow Tabs parent rather than the moving sticky bar, and obsolete animation frames are cancelled. First visit aligns at 302px on the phone and 167px on desktop in both themes; later visits retain independent scroll positions. |
| R4: ordinary desktop cards are too tall | RESOLVED | The ordinary collapsed draft card measures 225.75px at 1440×900. The first two primary actions are visible, including the unread warning on the second card. Metadata is grouped, Campus is retained in Event details, and Details shares the desktop action row. Long content and feedback remain expandable/readable. |

## Files changed for the fixes

- `src/components/events/OrganizationEventsWorkspaceTabs.tsx`: first-visit detection, stable scroll anchor, remembered positions, cancellation of stale frame callbacks.
- `src/pages/StudentMyEventsPage.tsx`: navigation invalidation and a smaller header/context/current-work heading.
- `src/components/events/OrganizationCurrentWorkCard.tsx`: compact desktop layout, shared action/details row, inline metadata, retained campus metadata.
- `src/components/events/__tests__/OrganizationEventsWorkspaceTabs.test.tsx`: first visit and independent scroll regression.
- `src/pages/__tests__/StudentMyEventsAccess.test.tsx`: delayed acknowledgement across tab/query/grant changes.
- Verification report/JSON, logs, screenshots, and ignored fixture probes. No SQL, migrations, RLS, RPCs, map-editor code, package versions, lockfiles, environment values, or credentials were changed.

## Verification

- Before implementation: all four new unit regressions failed against the old behavior; [red log](logs/fixes-red.log).
- Final focused suite: **11 files, 85 tests passed, zero failed or skipped**; [log](logs/fixes-tests-final.log). The final type-only test annotation is also checked by the complete three-test tabs suite; [log](logs/fixes-tabs-final.log).
- Production build: **exit 0**; [log](logs/fixes-build-final.log). The pre-existing >500kB Vite chunk warning remains.
- Browser acceptance: **92/92 passed**; [log](logs/fixes-browser.log). This includes the original 85 checks, four first-History alignment checks, two desktop density checks, and delayed-acknowledgement navigation. All seven viewport sizes, both themes, keyboard/focus, menus, short dialogs, errors/retries, and touch targets remain covered. No browser console errors or unexpected requests were observed.
- TypeScript: repository-wide check still exits 1. The final result retains the same **528 unique signatures** as the 1,047-entry pre-fix review baseline, with **zero new signatures from these fixes**. Unrelated project diagnostics remain a separate blocker. The final log is [here](logs/fixes-typescript-final.log). Do not treat the entire project as type-clean.
- Login smoke check: the actual `http://localhost:5173/admin` page renders email/password fields and Sign In; Supabase client initialization succeeds and the demo autofill selector is available. No credentials were entered and authentication was not attempted. External requests were blocked in that isolated smoke browser.
- Dashboard/mutation interactions used mocked services on strict fixture port 5181. That verification server was stopped; the configured user app on 5173 is deliberately left running.

## Screenshots

- [Desktop Current work, dark](evidence/current-dark-1440x900.png)
- [Desktop Current work, light](evidence/current-light-1440x900.png)
- [Phone History, light](evidence/history-light-390x844.png)
- [Phone Current work, dark](evidence/current-dark-390x844.png)
- [Restored login page](review/evidence/login-ready-390.png)

The full refreshed viewport/theme screenshots remain in `evidence/`. Prior review screenshots remain in `review/evidence/`.

## Test it yourself

1. Open [the login page](http://localhost:5173/admin). If an older browser tab is open, perform one hard refresh (Ctrl+Shift+R).
2. Select the demo account or enter your existing credentials, then press Sign In. Choosing an account only fills the form.
3. As an assigned representative, open Organization Events. Check Current work, Event history, search/year filters, details, menus, and 2D/3D editor links.
4. Scroll Current work, select History, then switch back and forth. History should align below the navbar initially and each view should retain its later position.

The earlier live `list_organization_events` HTTP 400 is not proven resolved by the mocked UI runs or login smoke check. Actual authentication, live history loading, and authorized reuse/publication still require your signed-in test. No live database mutation was performed by this task.

All changes remain local and uncommitted. No commit, PR, merge, or push was performed.
