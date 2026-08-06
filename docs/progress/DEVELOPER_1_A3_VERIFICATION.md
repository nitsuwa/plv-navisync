# Developer 1 A3 Verification Evidence

Verified against the shared Supabase development project `plv-navisync-dev` (`aaketmqvxqjgaznvclqc`) on August 6, 2026.

## Implemented behavior

- Replaced the page-local mock user array with typed `public.profiles` listing, role/status filters, and combined name/email/department/student-number search.
- Restricted profile roles to the schema-approved `student` and `admin` values.
- Added audited profile, role, and active-state changes through `admin_update_profile`.
- Prevented self-demotion, self-deactivation, and removal of the last active administrator.
- Replaced destructive account deletion with reversible deactivation.
- Added a JWT-protected `admin-users` Edge Function for Supabase Auth invitations; the service-role key exists only in the server runtime.
- Revalidated the current administrator's Auth identity and live profile every 15 seconds and on focus/visibility changes.

## Database and server security

Migration `20260806094510_secure_admin_user_management.sql` is additive; the applied `001` baseline and prior migrations remain unchanged.

`admin_update_profile` has a fixed empty search path, rejects unauthenticated, student, and inactive-admin callers, validates bounded profile fields, locks the target row, and appends before/after metadata to `activity_logs`. `PUBLIC` and `anon` execution are revoked; `authenticated` execution is intentional because the function performs its own active-admin authorization check.

The deployed `admin-users` Edge Function has gateway JWT verification enabled. It also calls `auth.getUser(token)` for fresh identity validation and reads the caller's active admin profile through RLS before constructing its server-only administrative client. The frontend secret scan found no service-role or secret key.

## Repeatable checks

- Vite production build passed.
- Five Vitest files passed: 57 tests total.
- `node scripts/verify-a1-supabase.mjs`, `node scripts/verify-a2-auth.mjs`, and `node scripts/verify-a3-admin-users.mjs` passed sequentially.
- `supabase/tests/a3_admin_user_management_assertions.sql` passed in a rollback-only transaction, including student denial, inactive-admin denial, permitted update, audit creation, and self-lockout prevention.
- Live admin profile listing succeeded; student listing remained self-only.
- The protected Edge Function accepted an active administrator and rejected student and unauthenticated requests.

## Manual browser walkthrough

- Administrator login opened the live user-management page with four current profiles and no console errors.
- Admin-role filtering returned the two administrator profiles.
- Combined-name search for `Demo Student` returned exactly the matching profile; this check identified and verified a fix to the initial split-name search behavior.
- The current administrator's email, role, and active-state controls were disabled.
- Empty invitation submission showed required first-name, last-name, and email validation without creating an account.

## Advisor review

The security advisor reports eight warnings: the seven previously documented A1 warnings plus the intentional authenticated `admin_update_profile` Data API helper. Its grant, fixed search path, caller validation, and purpose are documented above. Leaked-password protection remains a production dashboard task. See [Supabase database linter guidance](https://supabase.com/docs/guides/database/database-linter) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The performance advisor reports 55 pre-existing informational/warning items: 31 unindexed foreign keys, 9 currently unused indexes, and 15 multiple-permissive-policy notices. A3 introduced no table, foreign key, index, or RLS policy change.
