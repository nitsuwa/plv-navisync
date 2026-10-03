# Local and GitHub feature integration — 2026-10-02

The integration combines the existing local event work, GitHub main, and the explicitly requested latest map-builder feature branch. No force push, reset, clean, file deletion, or database operation was used.

## Preserved inputs

- Original local main: `869d995`, retained as `backup/pre-github-sync-20261002`.
- Local event recovery commit: `de261c2`, retained as `backup/local-event-work-20261002`. It contains 115 changed/new project files before the incoming merge.
- Fetched GitHub main: `03b8abd`, retained as `backup/github-main-20261002`.
- Fetched feature branch: `da37507`, retained as `backup/github-feature-map-builder-20261002`. GitHub main is its ancestor, so merging this branch incorporates both remote inputs.
- Local file archive and binary patch: `.git/local-sync-backups/20261002/`. Generated caches remain on disk; `.env.local` was excluded from commits and its SHA256 remained unchanged.

## Integration decisions

The local event creation, tutorial spotlight, fixed-size plotting, arrangement, autosave, admin publication management, and student event preview implementations remain present. The core event components, geometry, autosave hook, editor page, admin event-layout page, and overlay service have no changes relative to the local recovery commit.

The incoming navigation, building details, QR scanner, authentication illustrations, managed account features, and `super_admin` role support are incorporated. The local login width protections were retained alongside the incoming authentication artwork. The event editor still uses its immersive shell without the public navigation bar.

Direct conflicts in the login page and student-map tests were resolved by retaining both sets of behavior. Incoming source also contained malformed building-panel JSX, a duplicate QR component parameter, a stale building-panel callback, and a missing floor-entry helper import. These were repaired while retaining the new building interface and the location-QR route-origin behavior. Tests were updated for the new component mocks and room-specific accessible action labels; animated zoom assertions now allow the camera time to settle.

The student event preview continues to use the opt-in, allowlisted published-event feed rather than the superseded automatic overlay query. This preserves admin publication timing and limits student-visible event data.

## Verification evidence

Local logs and JSON reports are retained in `.git/local-sync-backups/20261002/`; they are not pushed.

| Check | Result |
| --- | --- |
| Frozen dependency install using the existing pnpm store | Passed; incoming QR scanner dependency installed |
| Production build before integration | Passed |
| Final production build (`final-build-v2.log`) | Passed; existing large-chunk warning remains |
| Pre-integration affected tests | 558 passed / 564; 6 failures in map adapter and map persistence |
| Combined affected tests, 66 files (`final-changed-tests.json`) | 653 passed / 661; 8 failures |
| Final isolated map and login checks (`final-map-login-tests.json`) | 31 passed / 31; zero failures, including the 5 map cases that failed in the broader run |
| Core local event implementation comparison | No differences against recovery commit |
| Deleted tracked files relative to original local or incoming feature branch | None |
| Environment-file fingerprint | Unchanged |
| Whitespace check of integration changes | Passed |

The incoming map adapter fixes resolved its three pre-integration failures. Three pre-existing `campusStructurePersistence` tests remain failing: retaining a graph after floor-template replacement, retaining room access metadata, and first-cycle save/load idempotence. Hydration currently prunes orphaned room/door nodes, derives linked-node positions from physical objects, and reconciles access metadata. Those discrepancies were already present in the local baseline; this integration does not claim to resolve them or certify all persistence behavior.

Repository-wide TypeScript checking is also not green. The pre-integration baseline already reported extensive diagnostics; final checking still reports repository diagnostics. The new missing floor-entry import was repaired, and production compilation succeeds. A successful Vite build is not a substitute for a clean TypeScript check.

The entire repository test suite was not certified. The broader affected-file run and the final isolated map/login run are separate evidence, not a single all-green suite. Live Supabase sign-in, deployment, migration application, and real database event-publication checks were not performed. Frontend role tests verify active `admin` and `super_admin` session handling; they do not establish that the live demo credentials or database policies work.

## Database and local testing

Supabase migration and assertion files from both inputs are preserved as code only. No hosted database, user role, password, or production configuration was changed. Publication RPCs and database protections still require the separate database verification/application steps in the event implementation plans.

After integration, use the normal `npm run dev` command and the existing local environment. Refresh the browser so it loads the combined login/map components. No alternate local Supabase instance or auth bypass is introduced by this integration.

The recovery branches and archive are intentionally retained for comparison and recovery. Publishing the code to GitHub main does not apply the SQL migrations or deploy the application.
