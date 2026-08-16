# Developer 1 — A9 Verification

## Status

`ACTIVE` readiness checkpoint. A9 is not `FOR REVIEW` because Gate G5 is not
met and the release dataset/restore drill still has blocking evidence gaps.

## Implemented checkpoint

- Replaced browser-bundled demo passwords with a non-secret email-only demo
  selector. Vite now has an exact public environment allowlist.
- Hardened demo provisioning with an explicit password-reset confirmation and
  removed password output from the terminal handoff.
- Added `pnpm verify:a9` for Node/runtime, tracked environment files, source and
  built-bundle secret scans, live generated-type equality, migration history,
  Supabase backup status, temporary logical dumps, guest published data, demo
  role/account state, and selected map/report export verification.
- Added the production, Auth redirect, backup/restore, secret, export, smoke,
  rollback, and evidence runbook in `docs/09_RELEASE_AND_RECOVERY.md`.

## Evidence — 2026-08-16

Passed:

- Production build (existing non-blocking Map Builder chunk-size warning only).
- Full Vitest regression suite: 105 files / 1,417 tests. The Windows default
  fork pool timed out during worker startup, so the successful run used the
  threads pool with one worker.
- Node.js 22.19.0 release requirement.
- Only sanitized environment templates are tracked; local/demo environment
  files are ignored.
- Browser source uses no secret-shaped `VITE_*` variable and the built bundle
  contains none of the configured secret values.
- Live `public,graphql_public` generated types exactly match
  `src/types/database.generated.ts`.
- All local migrations through
  `20260816094353_enforce_active_account_and_public_image_isolation.sql` match
  the linked remote history.
- Disposable demo student/admin authentication and active roles.
- Administrator report dataset access plus in-memory CSV/JSON format checks.
- Linked `public` schema lint: no errors.
- Security Advisor: no errors; 11 warnings remain for the documented callable
  security-definer functions and leaked-password protection setting.
- Performance Advisor: 16 warnings for existing multiple permissive policies
  plus informational baseline notices; no A9 schema change was made.

Open blockers/warnings:

- Gate G5 is not met: B6–B10 and the final dependent A8/C packages are not all
  merged and verified.
- No approved guest-visible published campus/current public snapshot exists in
  the shared project, so the map export/release-data assertions fail. Existing
  verification fixtures and developer drafts must not be published as release
  data without approval.
- Supabase reports no downloadable physical backup and PITR disabled for the
  current project.
- Docker Desktop is unavailable locally, so the CLI logical-dump execution and
  disposable-project restore drill remain pending.
- `.env.local` still contains legacy `VITE_DEMO_*_PASSWORD` names. The new exact
  Vite allowlist excludes them from the bundle, but they should be moved to
  `.env.demo.local` and removed from `.env.local` before final A9 review.
- Production URL, exact redirect allowlist, SMTP, leaked-password protection,
  hosting rewrite, and deployment URL require owner/dashboard confirmation.

## Final A9 gate

After Gate G5:

1. Merge/retest the final release commit and run A1–A9 plus C10.
2. Approve, validate, and publish one safe campus; rerun the guest map/export
   assertions.
3. Run Docker Desktop, retain encrypted logical backup artifacts and hashes,
   and complete a restore drill in a disposable Supabase project.
4. Move demo passwords to the private file and rerun build/bundle scanning.
5. Confirm production Auth/SMTP/security/hosting settings and execute the full
   deployment smoke matrix.
6. Only after every item passes, update A9 to `FOR REVIEW`.
