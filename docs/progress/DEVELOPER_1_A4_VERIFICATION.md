# Developer 1 A4 Verification Evidence

Verified against the shared Supabase development project `plv-navisync-dev` (`aaketmqvxqjgaznvclqc`) on August 6, 2026.

## Implemented behavior

- Replaced Map Builder campus `localStorage`/seed persistence with typed Supabase campus queries owned by `campusService`.
- Added persistent identity, address, city, province, postal code, coordinates, theme, logo/overview paths, and initial canvas dimensions.
- Enforced draft-first creation, published/unpublished/archived lifecycle derivation, private restoration, and conflict-aware updates using `updated_at`.
- Added a safe active-campus selector that prefers an explicit ID, then the non-archived default, then the first available campus, and returns `null` for an empty set.
- Disabled the unfinished publish controls; A6 remains the only package that will orchestrate version validation and publication.
- Replaced hard deletion in the A4 page with archive/restore. The database DELETE privilege remains protected by administrator RLS for controlled maintenance and test cleanup.

## Database and Storage contract

Migration `20260806101639_establish_campus_lifecycle_contract.sql` is additive. It adds bounded campus fields and checks, lifecycle enforcement, explicit Data API grants, draft privacy corrections, a current-draft index, and the private `campus-images` bucket with a 5 MB JPEG/PNG/WebP allowlist. Published asset reads require a published, non-archived campus reference; administrator writes remain RLS-protected.

Migration `20260806102931_restore_admin_campus_delete_privilege.sql` restores the table-level DELETE privilege after regression testing confirmed that the existing admin DELETE policy otherwise could never run. It does not expose deletion to students because RLS remains authoritative, and the A4 UI still exposes only archive/restore.

Migration `20260806112226_persist_campus_canvas_setup_state.sql` records initial canvas-setup completion independently of dimensions, so selecting the default 1200×800 canvas remains complete after refresh.

## Repeatable checks

- Vite production build passed.
- Six Vitest files passed: 60 tests total.
- `supabase/tests/a4_campus_lifecycle_assertions.sql` passed in a rollback-only transaction.
- The SQL matrix verified guest/student draft privacy, admin create/update/archive/restore, archived-row mutation rejection, stale-write rejection, bucket MIME/size configuration, and private draft-image visibility.
- A1, A2, and A3 live regression scripts passed sequentially. A1 now verifies that direct published-campus creation is rejected and publishes its controlled fixture only through draft version + validation + atomic publish RPC; it archives that fixture after each run.

## Advisor review

The security advisor reports the previously documented intentional helper/RPC execution warnings plus leaked-password protection, which remains a dashboard deployment task. No A4 table, RLS, or Storage error was reported. The performance advisor continues to report baseline unindexed-foreign-key, unused-index, and multiple-permissive-policy notices; the new draft index is currently unused because the development dataset is intentionally tiny.

Relevant guidance: [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
