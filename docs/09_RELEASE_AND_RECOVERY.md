# PLV NaviSync — Release, Backup, and Recovery Runbook

This runbook is the A9 operating procedure. It contains no credentials. Replace
placeholders only in private deployment settings or an approved secret manager,
never in a committed file, pull request, issue, terminal transcript, or chat.

## 1. Release gates

A production release may proceed only when all items below are true:

- Gate G5 is met: A1–A8, B1–B10, and C1–C9 are merged and there is no known
  critical security, persistence, publishing, or navigation failure.
- A9 and C10 final verification pass against the same release commit.
- One approved campus is published and visible to guests; private drafts and
  archived campuses remain hidden.
- Demo administrator and student accounts are disposable, active, and use
  credentials transferred through a private channel.
- The final migration history and `src/types/database.generated.ts` match the
  target Supabase project.
- A logical backup has been retained in approved encrypted storage and restored
  successfully into a disposable Supabase project.
- Production Auth redirects, SMTP, leaked-password protection, environment
  values, and the hosting rewrite/fallback are confirmed.

Run the repeatable repository/live checkpoint with:

```powershell
pnpm build
pnpm verify:a9
```

Warnings are release decisions, not automatic successes. A failed public-campus
or map-export assertion means the release dataset is not ready.

## 2. Demonstration accounts and data

1. Copy `.env.demo.example` to the gitignored `.env.demo.local`.
2. Use only disposable demo email addresses. Never use an owner or personal
   administrator as `DEMO_ADMIN_EMAIL`.
3. Fill the exact deliberate-action confirmation and run
   `pnpm demo:accounts`. The utility resets any existing account matching a demo
   email, so review both addresses before running it.
4. Keep passwords only in `.env.demo.local` and the approved private handoff.
   Do not use `VITE_*_PASSWORD`: Vite variables are browser-visible.
5. The login-page demo selector may expose the non-secret demo email labels,
   but it never embeds or fills passwords.
6. Approve one campus in Map Builder, resolve all blocking validation issues,
   save a draft, and publish it normally. Do not publish verification fixtures
   or an unfinished developer campus.
7. Verify the guest map and directory use that published version while an
   administrator can continue editing a private draft.

## 3. Database backup procedure

Supabase physical-backup/PITR status must be checked immediately before release:

```powershell
supabase backups list --project-ref <PROJECT_REF> --output json
```

The current development project reported no downloadable physical backup and
PITR disabled on 2026-08-16. Supabase documents that Free Plan backups are not
downloadable, so a retained logical backup and restore drill are mandatory for
this release path. See the official [Database Backups guide](https://supabase.com/docs/guides/platform/backups)
and [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

With Docker Desktop running, create a timestamped folder outside the repository
on an encrypted volume. The following commands intentionally do not contain a
database password; the linked CLI session supplies short-lived access:

```powershell
$releaseBackupDir = "D:\ApprovedEncryptedBackups\plv-navisync\<UTC_TIMESTAMP>"
New-Item -ItemType Directory -Path $releaseBackupDir
supabase db dump --linked --role-only --file "$releaseBackupDir\roles.sql"
supabase db dump --linked --schema public,storage --file "$releaseBackupDir\schema.sql"
supabase db dump --linked --data-only --schema public --use-copy --file "$releaseBackupDir\data.sql"
Get-FileHash "$releaseBackupDir\roles.sql","$releaseBackupDir\schema.sql","$releaseBackupDir\data.sql" -Algorithm SHA256
```

Store the three hashes separately with the release record. Restrict access to
the backup folder because application data may contain personal or private
records. Database dumps do not copy Storage objects; export required Storage
objects through an approved private process and retain their manifest/checksums
beside the database files.

### Restore drill

Never test restoration against the shared development or production project.
Create a disposable Supabase project with no valuable data, then follow the
official migration/restore guidance using its direct database connection. Apply
roles, schema, then data in that order. After restoration:

- regenerate Database types and compare them with the release commit;
- run schema lint and the A1–A9 verification chain against the disposable target;
- compare table counts and retained Storage manifest/checksums;
- test guest/student/admin RLS and one login per demo role;
- destroy the disposable project only after evidence is recorded.

Record the target project reference, release commit, UTC start/end time, hashes,
commands used, verifier results, tester, and cleanup confirmation. Never record
database passwords or tokens.

## 4. Approved selected-data exports

The release supports two selected exports, not a browser-side full database
export:

- report CSV/JSON from the administrator report queue;
- the active published campus snapshot used by the public map.

`pnpm verify:a9` signs in with disposable credentials when available, verifies
the administrator report query, validates JSON round trips and CSV row/header
counts in memory, then verifies the guest-visible published snapshot. It does
not write private export contents to the repository or terminal.

For a manual check, apply filters in Admin Reports, export CSV and JSON, and
confirm the visible row count and fields match. Treat report exports as private
records. On the public map, verify the exported/loaded snapshot is the approved
active version and contains no draft-only campus.

## 5. Production environment and secrets

The hosting platform receives only:

```env
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
VITE_ENABLE_DEMO_LOGIN=false
```

If reviewers need the non-secret selector, enable it and add only
`VITE_DEMO_ADMIN_EMAIL` and `VITE_DEMO_STUDENT_EMAIL`. The Vite configuration
uses an exact allowlist. Never add service-role keys, Supabase access tokens,
database passwords, owner credentials, or demo passwords to a `VITE_*` value.

Before deploying:

- confirm `.env.local` and `.env.demo.local` are ignored and only sanitized
  examples are tracked;
- rotate any credential ever pasted into a public location or build log;
- scan the built `dist` with `pnpm verify:a9`;
- keep `SUPABASE_ACCESS_TOKEN`, database credentials, and service-role keys only
  in encrypted CI/server secrets where a server-side task explicitly needs them;
- confirm the browser uses the single typed client in `src/lib/supabase.ts`.

## 6. Supabase Auth and project settings

In **Authentication → URL Configuration**:

- set Site URL to the exact production origin, for example
  `https://navisync.example.edu`;
- add exact production callback paths for `/auth/callback` and
  `/auth/reset-password` (including the application’s signup/recovery flows);
- retain `http://localhost:5173/**` only for local development;
- add preview-domain wildcards only when previews are required, and use exact
  production paths instead of broad production wildcards.

Supabase’s [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls)
states that the Site URL is the default for email confirmations and password
resets and recommends exact production redirect paths.

Also confirm:

- leaked-password protection is enabled;
- production SMTP is configured, sender identity is verified, and link tracking
  does not rewrite Auth links;
- signup confirmation and password reset emails arrive and return to the correct
  production route;
- the Data API exposes only the intended schemas/tables and RLS remains enabled;
- the hosting platform rewrites unknown application routes to `index.html`.

## 7. Deployment smoke test

Run against the immutable release build/URL:

1. Guest: home, directory, published map, building details, announcements,
   events, help, and direct-route refresh.
2. Student: registration confirmation, login, refresh/session restore, route
   planning, favorite, report creation/photo limits, report history, settings,
   and logout.
3. Administrator: login, dashboard, user state change, campus draft edit/save,
   validation, publish/unpublish recovery, report workflow, events,
   announcements, settings, activity logs, and selected exports.
4. Security: guest/private redirects, inactive-user enforcement, draft/public
   isolation, cross-user report isolation, and Storage access.
5. Browser: desktop and mobile widths, direct refresh on nested routes, no
   uncaught console errors, failed network state, and expired-session recovery.

Record the deployment URL, release commit, UTC time, browser/device, role used,
result, and issue link. Roll back the host release and stop schema promotion if a
critical security, persistence, publishing, or navigation failure is found.
