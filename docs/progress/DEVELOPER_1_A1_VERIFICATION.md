# Developer 1 A1 Verification Evidence

Verified against the shared Supabase development project `plv-navisync-dev` (`aaketmqvxqjgaznvclqc`) on August 6, 2026.

## Migration reconciliation

- The live project originally contained the complete schema but no `supabase_migrations.schema_migrations` history.
- `001_create_plv_navisync_schema.sql` was not replayed or edited.
- `20260805160720_baseline_existing_schema.sql` is an assertion-only marker. It verifies the expected 20 public tables and five Storage buckets before recording the live schema as the baseline.
- `20260805161108_harden_storage_rls_and_function_grants.sql` is the separate corrective migration applied after that baseline.
- The live migration history contains both new migration versions in order.

## Type and security work

- `src/types/database.generated.ts` was generated from the live schema after applying the corrective migration.
- `src/lib/supabase.ts` uses `SupabaseClient<Database>` and derives `Profile` from the generated `profiles` row.
- Trigger and integrity functions are not directly executable by browser roles.
- `campus_is_published(uuid)` and `is_published_floor_plan(text)` remain intentionally public because guest policies need them.
- `is_admin()` is available to authenticated callers for RLS evaluation.
- `publish_campus_version(uuid)` is available to authenticated callers but enforces its own active-administrator guard.
- All five buckets allow only JPEG, PNG, and WebP. Limits are 2 MiB for avatars, 5 MiB for building/event images, 15 MiB for floor plans, and 8 MiB for report images.

## Repeatable verification

`node scripts/verify-a1-supabase.mjs` passed using disposable demo administrator and student accounts. The script uses no service-role key, creates uniquely named fixtures, tests the matrix below, and removes the fixtures in a `finally` block.

- Guest: cannot read profiles; reads only published campus data; reads permitted public Storage objects.
- Student: reads only their profile, cannot elevate their role, cannot create campuses, creates and reads only their reports/favorites, and can upload only to owned Storage paths.
- Administrator: reads profiles, manages campus fixtures, reads administrator-only live building data, and uploads administrator-managed images.
- Storage: disallowed MIME types and oversized objects are rejected by bucket enforcement.
- Cleanup check: the original three profiles remained and all temporary campus, building, report, favorite, and Storage fixtures were removed.

`supabase/tests/a1_catalog_assertions.sql` also passed. It checks table RLS, bucket contracts, Storage policy count, function grants, and the profile self-update `WITH CHECK` guard.

## Advisor results

- Security advisor warnings decreased from 35 to 7.
- Six remaining function warnings correspond to the reviewed grants above: two helpers callable by `anon`, and four helpers/RPCs callable by `authenticated`.
- The remaining warning is leaked-password protection, which must be enabled in the Supabase Auth dashboard before production release.
- RLS per-row `auth.uid()` initialization warnings decreased from 11 to zero.
- Remaining performance recommendations (unindexed foreign keys, unused indexes on an empty development dataset, and deliberately overlapping own/admin or public/admin policies) are recorded for later performance work and do not change the verified A1 access rules.

## Local checks

- `vite build`
- `vitest run`
- `node scripts/verify-a1-supabase.mjs`
- Live catalog assertions
- Supabase security and performance advisors

The repository does not currently include `tsconfig.json`; therefore the Vite production build is the available project compile check.
